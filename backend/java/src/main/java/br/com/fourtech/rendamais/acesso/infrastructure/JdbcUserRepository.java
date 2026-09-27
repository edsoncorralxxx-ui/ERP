package br.com.fourtech.rendamais.acesso.infrastructure;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.acesso.application.UserRepository;
import br.com.fourtech.rendamais.acesso.domain.User;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcUserRepository implements UserRepository {

    private static final String SELECT = """
            select id, username, display_name, profile, active, failed_attempts, locked_until, version, updated_at, updated_by
              from app_user
            """;

    private static final RowMapper<User> MAPPER = (rs, n) -> new User(rs.getObject("id", UUID.class),
            rs.getString("username"), rs.getString("display_name"), Profile.valueOf(rs.getString("profile")),
            rs.getBoolean("active"), rs.getInt("failed_attempts"), instant(rs.getTimestamp("locked_until")),
            rs.getLong("version"), instant(rs.getTimestamp("updated_at")), rs.getString("updated_by"));

    private final JdbcClient jdbc;

    JdbcUserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<User> findByUsernameForUpdate(String username) {
        return jdbc.sql(SELECT + " where username = :u for update").param("u", username).query(MAPPER).optional();
    }

    @Override
    public Optional<User> findById(UUID id) {
        return jdbc.sql(SELECT + " where id = :id").param("id", id).query(MAPPER).optional();
    }

    @Override
    public Optional<User> findByIdForUpdate(UUID id) {
        return jdbc.sql(SELECT + " where id = :id for update").param("id", id).query(MAPPER).optional();
    }

    @Override
    public List<User> findAll() {
        return jdbc.sql(SELECT + " order by username").query(MAPPER).list();
    }

    @Override
    public String passwordHash(UUID id) {
        return jdbc.sql("select password_hash from app_user where id = :id").param("id", id).query(String.class).single();
    }

    @Override
    public long count() {
        return jdbc.sql("select count(*) from app_user").query(Long.class).single();
    }

    @Override
    public long countActiveAdministrators() {
        return jdbc.sql("select count(*) from app_user where active and profile = 'ADMINISTRADOR'").query(Long.class).single();
    }

    @Override
    public boolean usernameExists(String username) {
        return jdbc.sql("select exists(select 1 from app_user where username = :u)").param("u", username)
                .query(Boolean.class).single();
    }

    @Override
    public void insert(User u, String passwordHash, String createdBy) {
        jdbc.sql("""
                insert into app_user (id, username, display_name, profile, password_hash, active, version, created_at, created_by)
                values (:id, :username, :displayName, :profile, :hash, :active, :version, :createdAt, :createdBy)
                """)
                .param("id", u.id())
                .param("username", u.username())
                .param("displayName", u.displayName())
                .param("profile", u.profile().name())
                .param("hash", passwordHash)
                .param("active", u.active())
                .param("version", u.version())
                .param("createdAt", ts(u.updatedAt()))
                .param("createdBy", createdBy)
                .update();
    }

    @Override
    public boolean update(User u, long expectedVersion) {
        return jdbc.sql("""
                update app_user set display_name = :displayName, profile = :profile, active = :active,
                       failed_attempts = :attempts, locked_until = :lockedUntil, version = :version,
                       updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("displayName", u.displayName())
                .param("profile", u.profile().name())
                .param("active", u.active())
                .param("attempts", u.failedAttempts())
                .param("lockedUntil", ts(u.lockedUntil()))
                .param("version", u.version())
                .param("updatedAt", ts(u.updatedAt()))
                .param("updatedBy", u.updatedBy())
                .param("id", u.id())
                .param("expected", expectedVersion)
                .update() == 1;
    }

    @Override
    public void updatePassword(UUID id, String passwordHash) {
        jdbc.sql("update app_user set password_hash = :hash, password_changed_at = now() where id = :id")
                .param("hash", passwordHash).param("id", id).update();
    }

    @Override
    public void updateLoginState(User u) {
        jdbc.sql("update app_user set failed_attempts = :attempts, locked_until = :lockedUntil where id = :id")
                .param("attempts", u.failedAttempts()).param("lockedUntil", ts(u.lockedUntil())).param("id", u.id())
                .update();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
