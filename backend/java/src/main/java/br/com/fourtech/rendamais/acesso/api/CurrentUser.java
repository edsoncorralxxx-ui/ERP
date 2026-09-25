package br.com.fourtech.rendamais.acesso.api;

import java.util.Objects;
import java.util.UUID;

/** Usuário autenticado na requisição corrente. */
public record CurrentUser(UUID id, String username, String displayName, Profile profile, UUID sessionId) {

    public CurrentUser {
        Objects.requireNonNull(id);
        Objects.requireNonNull(username);
        Objects.requireNonNull(profile);
    }

    public boolean can(String permission) {
        return profile.permissions().contains(permission);
    }
}
