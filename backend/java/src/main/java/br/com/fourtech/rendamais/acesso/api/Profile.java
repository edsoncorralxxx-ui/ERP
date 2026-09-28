package br.com.fourtech.rendamais.acesso.api;

import java.util.Set;

import static br.com.fourtech.rendamais.acesso.api.Permissions.*;

/**
 * Perfis de acesso. Premissa aceita pelo PO (PD-009): Administrador e Consulta; os demais perfis entram com seus
 * módulos.
 */
public enum Profile {
    ADMINISTRADOR("Administrador", Set.of(COMPANY_READ, COMPANY_UPDATE, PARTNER_READ, PARTNER_CREATE, PARTNER_UPDATE,
            PARTNER_DEACTIVATE, ITEM_READ, ITEM_CREATE, ITEM_UPDATE, ITEM_DEACTIVATE, CATALOG_ADMIN, PROPOSAL_READ,
            PROPOSAL_CREATE, PROPOSAL_UPDATE, PROPOSAL_ISSUE, SALES_ORDER_READ, SALES_ORDER_CREATE, SALES_ORDER_UPDATE,
            SALES_ORDER_CONFIRM, SALES_ORDER_CANCEL, PROJECT_READ, EQUIPMENT_READ, EQUIPMENT_UPDATE, FINANCIAL_TITLE_READ,
            FINANCIAL_TITLE_CREATE, FINANCIAL_TITLE_SETTLE, FINANCIAL_TITLE_CANCEL, FINANCIAL_CATEGORY_ADMIN, SETTLEMENT_REVERSE,
            BANK_ACCOUNT_ADMIN, DOCUMENT_READ, DOCUMENT_REGISTER, DOCUMENT_LINK,
            DOCUMENT_CLASSIFY, DOCUMENT_CANCEL, TAX_READ, TAX_PARAMETER_ADMIN, TAX_PERIOD_SIMULATE, TAX_PERIOD_CONFIRM,
            TAX_PERIOD_CLOSE, TAX_PERIOD_REOPEN, USER_ADMIN)),
    CONSULTA("Consulta", Set.of(COMPANY_READ, PARTNER_READ, ITEM_READ, PROPOSAL_READ, SALES_ORDER_READ, PROJECT_READ,
            EQUIPMENT_READ, FINANCIAL_TITLE_READ, DOCUMENT_READ, TAX_READ));

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
