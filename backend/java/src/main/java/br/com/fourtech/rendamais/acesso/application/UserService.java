package br.com.fourtech.rendamais.acesso.application;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.acesso.domain.PasswordPolicy;
import br.com.fourtech.rendamais.acesso.domain.User;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Administração de usuários. A permissão (user.admin) e a auditoria ficam com quem chama, na mesma transação.
 * Regra de segurança: sempre resta pelo menos um administrador ativo.
 */
@Service
public class UserService {

    /** Antes e depois de uma alteração, para a auditoria. */
    public record Change(User before, User after) { }

    private final UserRepository users;
    private final SessionRepository sessions;
    private final PasswordHasher hasher;
    private final Clock clock;

    public UserService(UserRepository users, SessionRepository sessions, PasswordHasher hasher, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.hasher = hasher;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<User> list() {
        return users.findAll();
    }

    @Transactional(readOnly = true)
    public User get(UUID id) {
        return users.findById(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado."));
    }

    @Transactional(readOnly = true)
    public long count() {
        return users.count();
    }

    @Transactional
    public User create(String username, String displayName, String profile, String password, String actor) {
        User user = User.create(username, displayName, profile, password, clock.instant(), actor);
        if (users.usernameExists(user.username())) {
            throw new RuleViolationException("USERNAME_TAKEN", "Já existe um usuário com este nome.",
                    List.of(new FieldIssue("username", "Nome de usuário em uso.")));
        }
        users.insert(user, hasher.hash(password), actor);
        return user;
    }

    @Transactional
    public Change update(UUID id, long expectedVersion, String displayName, String profile, boolean active, UUID actorId,
                         String actor) {
        User current = users.findByIdForUpdate(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado."));
        if (current.version() != expectedVersion) {
            throw new VersionConflictException("app_user", expectedVersion, current.version());
        }
        User updated = current.update(displayName, profile, active, clock.instant(), actor);
        boolean losesAdmin = current.active() && current.profile() == Profile.ADMINISTRADOR
                && (!updated.active() || updated.profile() != Profile.ADMINISTRADOR);
        if (losesAdmin && id.equals(actorId)) {
            throw new RuleViolationException("USER_SELF_LOCKOUT", "Você não pode retirar o seu próprio acesso de administrador.",
                    List.of(new FieldIssue(updated.active() ? "profile" : "active", "Peça a outro administrador.")));
        }
        if (losesAdmin && users.countActiveAdministrators() <= 1) {
            throw new RuleViolationException("LAST_ADMINISTRATOR", "Precisa restar pelo menos um administrador ativo.",
                    List.of(new FieldIssue("profile", "Último administrador ativo.")));
        }
        if (!users.update(updated, expectedVersion)) {
            throw new VersionConflictException("app_user", expectedVersion, get(id).version());
        }
        if (!updated.active() || updated.profile() != current.profile()) {
            sessions.revokeAllOf(id, clock.instant(), updated.active() ? "PERFIL_ALTERADO" : "USUARIO_DESATIVADO");
        }
        return new Change(current, updated);
    }

    /** Redefine a senha pelo administrador: libera bloqueio e encerra as sessões do usuário. */
    @Transactional
    public User resetPassword(UUID id, String newPassword, String actor) {
        User current = users.findByIdForUpdate(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado."));
        PasswordPolicy.require("password", newPassword, current.username());
        Instant now = clock.instant();
        User updated = current.passwordReset(now, actor);
        users.update(updated, current.version());
        users.updatePassword(id, hasher.hash(newPassword));
        sessions.revokeAllOf(id, now, "SENHA_REDEFINIDA");
        return updated;
    }
}
