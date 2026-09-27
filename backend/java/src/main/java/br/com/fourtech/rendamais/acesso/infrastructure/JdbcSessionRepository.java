package br.com.fourtech.rendamais.acesso.infrastructure;

import br.com.fourtech.rendamais.acesso.application.SessionRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcSessionRepository implements SessionRepository {

    private final JdbcClient jdbc;

    JdbcSessionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public UUID create(UUID userId, String tokenHash, Instant now, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into user_session (id, user_id, token_hash, created_at, last_seen_at, expires_at)
                values (:id, :userId, :hash, :now, :now, :expires)
                """)
                .param("id", id).param("userId", userId).param("hash", tokenHash)
                .param("now", Timestamp.from(now)).param("expires", Timestamp.from(expiresAt))
                .update();
        return id;
    }

    @Override
    public Optional<StoredSession> findActive(String tokenHash) {
        return jdbc.sql("""
                select s.id, s.user_id, s.last_seen_at, s.expires_at
                  from user_session s join app_user u on u.id = s.user_id
                 where s.token_hash = :hash and s.revoked_at is null and u.active
                """)
                .param("hash", tokenHash)
                .query((rs, n) -> new StoredSession(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getTimestamp("last_seen_at").toInstant(), rs.getTimestamp("expires_at").toInstant()))
                .optional();
    }

    @Override
    public void touch(UUID sessionId, Instant now) {
        jdbc.sql("update user_session set last_seen_at = :now where id = :id")
                .param("now", Timestamp.from(now)).param("id", sessionId).update();
    }

    @Override
    public void revoke(UUID sessionId, Instant now, String reason) {
        jdbc.sql("update user_session set revoked_at = :now, revoke_reason = :reason where id = :id and revoked_at is null")
                .param("now", Timestamp.from(now)).param("reason", reason).param("id", sessionId).update();
    }

    @Override
    public int revokeAllOf(UUID userId, Instant now, String reason) {
        return jdbc.sql("update user_session set revoked_at = :now, revoke_reason = :reason where user_id = :u and revoked_at is null")
                .param("now", Timestamp.from(now)).param("reason", reason).param("u", userId).update();
    }
}
