package br.com.fourtech.rendamais.plataforma.sessao;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.acesso.api.UnauthenticatedException;
import br.com.fourtech.rendamais.acesso.application.SessionService;
import br.com.fourtech.rendamais.acesso.application.SessionService.LoginResult;
import br.com.fourtech.rendamais.acesso.application.UserService;
import br.com.fourtech.rendamais.acesso.domain.User;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Sessão e administração de usuários com auditoria na mesma transação (o módulo de acesso não conhece a auditoria).
 * Falhas de login também são gravadas: tentativas, bloqueio e o registro na trilha.
 */
@Service
public class SessionApplicationService {

    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("America/Sao_Paulo"));

    private final SessionService sessions;
    private final UserService users;
    private final AuditTrail audit;

    public SessionApplicationService(SessionService sessions, UserService users, AuditTrail audit) {
        this.sessions = sessions;
        this.users = users;
        this.audit = audit;
    }

    @Transactional(noRollbackFor = UnauthenticatedException.class)
    public LoginResult.Success login(String username, String password) {
        LoginResult result = sessions.login(username, password);
        switch (result) {
            case LoginResult.Success s -> {
                record(s.user().username(), "LOGIN_SUCCEEDED", "app_user", s.user().id().toString(), 0, Map.of());
                return s;
            }
            case LoginResult.Locked l -> {
                record(l.username(), "LOGIN_LOCKED", "app_user", l.username(), 0, Map.of());
                throw new UnauthenticatedException("ACCOUNT_LOCKED", "Usuário bloqueado por excesso de tentativas. Tente de novo após "
                        + HORA.format(l.until()) + " ou peça a um administrador para redefinir a senha.");
            }
            case LoginResult.Invalid i -> {
                record(i.attemptedUsername().isEmpty() ? "desconhecido" : i.attemptedUsername(), "LOGIN_FAILED", "app_user",
                        i.attemptedUsername().isEmpty() ? "-" : i.attemptedUsername(), 0, Map.of());
                throw new UnauthenticatedException("INVALID_CREDENTIALS", "Usuário ou senha incorretos.");
            }
        }
    }

    @Transactional
    public void logout(String reason) {
        CurrentUser u = CurrentUserHolder.get();
        sessions.logout(u.sessionId(), reason);
        record(u.username(), "LOGOUT", "app_user", u.id().toString(), 0, Map.of());
    }

    @Transactional
    public void changeOwnPassword(String currentPassword, String newPassword) {
        CurrentUser u = CurrentUserHolder.get();
        sessions.changeOwnPassword(u, currentPassword, newPassword);
        record(u.username(), "PASSWORD_CHANGED", "app_user", u.id().toString(), 0, Map.of());
    }

    @Transactional(readOnly = true)
    public List<User> listUsers() {
        CurrentUserHolder.require(Permissions.USER_ADMIN);
        return users.list();
    }

    @Transactional(readOnly = true)
    public User getUser(UUID id) {
        CurrentUserHolder.require(Permissions.USER_ADMIN);
        return users.get(id);
    }

    @Transactional
    public User createUser(String username, String displayName, String profile, String password) {
        CurrentUser admin = CurrentUserHolder.require(Permissions.USER_ADMIN);
        User u = users.create(username, displayName, profile, password, admin.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("username", new AuditEntry.Change(null, u.username()));
        changes.put("displayName", new AuditEntry.Change(null, u.displayName()));
        changes.put("profile", new AuditEntry.Change(null, u.profile().name()));
        record(admin.username(), "USER_CREATED", "app_user", u.id().toString(), u.version(), changes);
        return u;
    }

    @Transactional
    public User updateUser(UUID id, long expectedVersion, String displayName, String profile, boolean active) {
        CurrentUser admin = CurrentUserHolder.require(Permissions.USER_ADMIN);
        UserService.Change c = users.update(id, expectedVersion, displayName, profile, active, admin.id(), admin.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        c.before().diff(c.after()).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(admin.username(), "USER_UPDATED", "app_user", id.toString(), c.after().version(), changes);
        return c.after();
    }

    @Transactional
    public User resetPassword(UUID id, String newPassword) {
        CurrentUser admin = CurrentUserHolder.require(Permissions.USER_ADMIN);
        User u = users.resetPassword(id, newPassword, admin.username());
        record(admin.username(), "PASSWORD_RESET", "app_user", id.toString(), u.version(), Map.of());
        return u;
    }

    private void record(String actor, String action, String type, String id, long version, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(actor, action, type, id, version, null, changes, CorrelationId.current()));
    }
}
