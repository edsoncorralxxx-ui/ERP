package br.com.fourtech.rendamais.acesso.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.domain.PasswordPolicy;
import br.com.fourtech.rendamais.acesso.domain.User;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Login, validação e encerramento de sessões (ADR-005): token aleatório de 256 bits, só o hash no banco,
 * expiração por inatividade e absoluta, revogação imediata.
 */
@Service
public class SessionService {

    public static final Duration IDLE_TIMEOUT = Duration.ofHours(8);
    public static final Duration ABSOLUTE_TIMEOUT = Duration.ofHours(12);
    /** Evita uma escrita por requisição: o último uso só é regravado se mudou mais que isto. */
    private static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);

    /** Resultado do login. Falhas também são gravadas (tentativas e bloqueio), por isso não são exceções. */
    public sealed interface LoginResult {
        record Success(CurrentUser user, String token, Instant expiresAt) implements LoginResult { }

        record Invalid(String attemptedUsername) implements LoginResult { }

        record Locked(String username, Instant until) implements LoginResult { }
    }

    private final UserRepository users;
    private final SessionRepository sessions;
    private final PasswordHasher hasher;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash;

    public SessionService(UserRepository users, SessionRepository sessions, PasswordHasher hasher, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.hasher = hasher;
        this.clock = clock;
        // Usado quando o usuário não existe, para o tempo de resposta não revelar isso.
        this.dummyHash = hasher.hash(UUID.randomUUID().toString());
    }

    @Transactional
    public LoginResult login(String username, String password) {
        Instant now = clock.instant();
        String name = User.normalizeUsername(username);
        String pass = password == null ? "" : password;
        Optional<User> found = name == null || name.isEmpty() ? Optional.empty() : users.findByUsernameForUpdate(name);
        if (found.isEmpty() || !found.get().active()) {
            hasher.matches(pass, dummyHash);
            return new LoginResult.Invalid(name == null ? "" : name);
        }
        User user = found.get();
        if (user.lockedAt(now)) {
            return new LoginResult.Locked(user.username(), user.lockedUntil());
        }
        if (!hasher.matches(pass, users.passwordHash(user.id()))) {
            User failed = user.failedLogin(now);
            users.updateLoginState(failed);
            return failed.lockedAt(now) ? new LoginResult.Locked(user.username(), failed.lockedUntil())
                    : new LoginResult.Invalid(user.username());
        }
        users.updateLoginState(user.successfulLogin());
        String token = newToken();
        Instant expires = now.plus(ABSOLUTE_TIMEOUT);
        UUID sessionId = sessions.create(user.id(), hash(token), now, expires);
        return new LoginResult.Success(toCurrent(user, sessionId), token, expires);
    }

    /** Usuário da sessão, se o token for válido, não revogado e dentro dos prazos. */
    @Transactional
    public Optional<CurrentUser> authenticate(String token) {
        if (token == null || token.isBlank() || token.length() > 200) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        Optional<SessionRepository.StoredSession> s = sessions.findActive(hash(token));
        if (s.isEmpty()) {
            return Optional.empty();
        }
        SessionRepository.StoredSession session = s.get();
        if (!session.expiresAt().isAfter(now)) {
            sessions.revoke(session.id(), now, "EXPIRADA");
            return Optional.empty();
        }
        if (!session.lastSeenAt().plus(IDLE_TIMEOUT).isAfter(now)) {
            sessions.revoke(session.id(), now, "INATIVIDADE");
            return Optional.empty();
        }
        Optional<User> user = users.findById(session.userId()).filter(User::active);
        if (user.isEmpty()) {
            return Optional.empty();
        }
        if (Duration.between(session.lastSeenAt(), now).compareTo(TOUCH_INTERVAL) > 0) {
            sessions.touch(session.id(), now);
        }
        return Optional.of(toCurrent(user.get(), session.id()));
    }

    @Transactional
    public void logout(UUID sessionId, String reason) {
        sessions.revoke(sessionId, clock.instant(), reason);
    }

    /** Troca da própria senha: confere a atual, grava a nova e encerra as outras sessões do usuário. */
    @Transactional
    public void changeOwnPassword(CurrentUser current, String currentPassword, String newPassword) {
        User user = users.findByIdForUpdate(current.id()).orElseThrow();
        if (!hasher.matches(currentPassword == null ? "" : currentPassword, users.passwordHash(user.id()))) {
            throw new RuleViolationException("PASSWORD_INVALID", "A senha atual não confere.",
                    List.of(new FieldIssue("currentPassword", "Senha atual incorreta.")));
        }
        PasswordPolicy.require("newPassword", newPassword, user.username());
        users.updatePassword(user.id(), hasher.hash(newPassword));
        Instant now = clock.instant();
        sessions.revokeAllOf(user.id(), now, "SENHA_ALTERADA");
    }

    public static String hash(String token) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private String newToken() {
        byte[] b = new byte[32];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static CurrentUser toCurrent(User u, UUID sessionId) {
        return new CurrentUser(u.id(), u.username(), u.displayName(), u.profile(), sessionId);
    }
}
