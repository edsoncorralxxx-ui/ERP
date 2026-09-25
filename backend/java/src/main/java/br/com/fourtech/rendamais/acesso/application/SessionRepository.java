package br.com.fourtech.rendamais.acesso.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das sessões (só o hash do token é gravado). */
public interface SessionRepository {

    record StoredSession(UUID id, UUID userId, Instant lastSeenAt, Instant expiresAt) { }

    UUID create(UUID userId, String tokenHash, Instant now, Instant expiresAt);

    /** Sessão não revogada com o hash informado, de usuário ativo. */
    Optional<StoredSession> findActive(String tokenHash);

    void touch(UUID sessionId, Instant now);

    void revoke(UUID sessionId, Instant now, String reason);

    int revokeAllOf(UUID userId, Instant now, String reason);
}
