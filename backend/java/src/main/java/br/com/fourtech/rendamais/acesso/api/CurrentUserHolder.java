package br.com.fourtech.rendamais.acesso.api;

import java.util.Optional;

/**
 * Usuário da requisição corrente, preenchido pelo filtro de sessão e limpo ao fim da requisição.
 * Casos de uso chamam {@link #require(String)} antes de ler ou alterar dados.
 */
public final class CurrentUserHolder {

    private static final ThreadLocal<CurrentUser> CURRENT = new ThreadLocal<>();

    private CurrentUserHolder() { }

    public static void set(CurrentUser user) {
        CURRENT.set(user);
    }

    public static void clear() {
        CURRENT.remove();
    }

    public static Optional<CurrentUser> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    /** Usuário autenticado; falha com 401 se não houver. */
    public static CurrentUser get() {
        CurrentUser u = CURRENT.get();
        if (u == null) {
            throw UnauthenticatedException.sessionRequired();
        }
        return u;
    }

    /** Confere a permissão do usuário corrente e o devolve; falha com 403 se o perfil não permitir. */
    public static CurrentUser require(String permission) {
        CurrentUser u = get();
        if (!u.can(permission)) {
            throw new AccessDeniedException(u.username(), permission);
        }
        return u;
    }

    /** Nome gravado como ator na auditoria. */
    public static String actorName() {
        return get().username();
    }
}
