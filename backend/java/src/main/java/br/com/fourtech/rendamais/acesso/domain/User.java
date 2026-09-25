package br.com.fourtech.rendamais.acesso.domain;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Usuário do Renda+. Imutável: cada operação valida e devolve uma nova versão.
 * O hash da senha não fica aqui para nunca ser serializado por engano; ele vive só na persistência.
 */
public final class User {

    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    private final UUID id;
    private final String username;
    private final String displayName;
    private final Profile profile;
    private final boolean active;
    private final int failedAttempts;
    private final Instant lockedUntil;
    private final long version;
    private final Instant updatedAt;
    private final String updatedBy;

    public User(UUID id, String username, String displayName, Profile profile, boolean active, int failedAttempts,
                Instant lockedUntil, long version, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.username = Objects.requireNonNull(username);
        this.displayName = Objects.requireNonNull(displayName);
        this.profile = Objects.requireNonNull(profile);
        this.active = active;
        this.failedAttempts = failedAttempts;
        this.lockedUntil = lockedUntil;
        this.version = version;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /** Novo usuário ativo, versão 1. Valida nome de usuário, nome de exibição, perfil e senha. */
    public static User create(String username, String displayName, String profile, String password, Instant now, String actor) {
        List<FieldIssue> issues = new ArrayList<>();
        String user = normalizeUsername(username);
        if (user == null || !user.matches("[a-z0-9._-]{3,60}")) {
            issues.add(new FieldIssue("username", "Use de 3 a 60 caracteres: letras sem acento, números, ponto, hífen ou sublinhado."));
        }
        String name = displayName(displayName, issues);
        Profile p = profile(profile, issues);
        PasswordPolicy.check("password", password, user, issues);
        if (!issues.isEmpty()) {
            throw new RuleViolationException("USER_INVALID", "Corrija os campos indicados.", issues);
        }
        return new User(UUID.randomUUID(), user, name, p, true, 0, null, 1, now, actor);
    }

    /** Nome de exibição, perfil e situação alterados pelo administrador. */
    public User update(String displayName, String profile, boolean active, Instant now, String actor) {
        List<FieldIssue> issues = new ArrayList<>();
        String name = displayName(displayName, issues);
        Profile p = profile(profile, issues);
        if (!issues.isEmpty()) {
            throw new RuleViolationException("USER_INVALID", "Corrija os campos indicados.", issues);
        }
        return new User(id, username, name, p, active, active ? failedAttempts : 0, active ? lockedUntil : null,
                version + 1, now, actor);
    }

    /** Senha redefinida: libera o bloqueio. A versão sobe para que outras janelas vejam a mudança. */
    public User passwordReset(Instant now, String actor) {
        return new User(id, username, displayName, profile, active, 0, null, version + 1, now, actor);
    }

    public boolean lockedAt(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Senha errada: conta a tentativa; na quinta seguida bloqueia por {@link #LOCK_DURATION}. */
    public User failedLogin(Instant now) {
        int attempts = failedAttempts + 1;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            return withAttempts(0, now.plus(LOCK_DURATION));
        }
        return withAttempts(attempts, lockedUntil);
    }

    public User successfulLogin() {
        return failedAttempts == 0 && lockedUntil == null ? this : withAttempts(0, null);
    }

    private User withAttempts(int attempts, Instant until) {
        return new User(id, username, displayName, profile, active, attempts, until, version, updatedAt, updatedBy);
    }

    /** Diferenças para a auditoria (nunca inclui senha). */
    public Map<String, String[]> diff(User other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        if (!displayName.equals(other.displayName)) d.put("displayName", new String[]{displayName, other.displayName});
        if (profile != other.profile) d.put("profile", new String[]{profile.name(), other.profile.name()});
        if (active != other.active) d.put("active", new String[]{Boolean.toString(active), Boolean.toString(other.active)});
        return d;
    }

    public static String normalizeUsername(String raw) {
        return raw == null ? null : raw.strip().toLowerCase(Locale.ROOT);
    }

    private static String displayName(String raw, List<FieldIssue> issues) {
        String t = raw == null ? "" : raw.strip();
        if (t.isEmpty()) {
            issues.add(new FieldIssue("displayName", "Informe o nome."));
        } else if (t.length() > 120) {
            issues.add(new FieldIssue("displayName", "Máximo de 120 caracteres."));
        }
        return t;
    }

    private static Profile profile(String raw, List<FieldIssue> issues) {
        try {
            return Profile.valueOf(raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("profile", "Perfil inválido. Use Administrador ou Consulta."));
            return Profile.CONSULTA;
        }
    }

    public UUID id() { return id; }
    public String username() { return username; }
    public String displayName() { return displayName; }
    public Profile profile() { return profile; }
    public boolean active() { return active; }
    public int failedAttempts() { return failedAttempts; }
    public Instant lockedUntil() { return lockedUntil; }
    public long version() { return version; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
