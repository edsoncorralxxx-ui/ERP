package br.com.fourtech.rendamais.acesso.api;

import java.util.Set;

import static br.com.fourtech.rendamais.acesso.api.Permissions.*;

/**
 * Perfis de acesso. Premissa aceita pelo PO (PD-009): Administrador e Consulta; os demais perfis entram com seus
 * módulos.
 */
public enum Profile {
    ADMINISTRADOR("Administrador", Set.of(COMPANY_READ, COMPANY_UPDATE, PARTNER_READ, PARTNER_CREATE, PARTNER_UPDATE,
            PARTNER_DEACTIVATE, USER_ADMIN)),
    CONSULTA("Consulta", Set.of(COMPANY_READ, PARTNER_READ));

    private final String label;
    private final Set<String> permissions;

    Profile(String label, Set<String> permissions) {
        this.label = label;
        this.permissions = permissions;
    }

    public String label() {
        return label;
    }

    public Set<String> permissions() {
        return permissions;
    }
}
