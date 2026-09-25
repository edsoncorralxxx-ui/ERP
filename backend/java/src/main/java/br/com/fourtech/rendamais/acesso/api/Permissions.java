package br.com.fourtech.rendamais.acesso.api;

/** Permissões por ação, conferidas no servidor em cada comando e consulta (ADR-005). */
public final class Permissions {
    public static final String COMPANY_READ = "company.read";
    public static final String COMPANY_UPDATE = "company.update";
    public static final String PARTNER_READ = "partner.read";
    public static final String PARTNER_CREATE = "partner.create";
    public static final String PARTNER_UPDATE = "partner.update";
    public static final String PARTNER_DEACTIVATE = "partner.deactivate";
    public static final String ITEM_READ = "item.read";
    public static final String ITEM_CREATE = "item.create";
    public static final String ITEM_UPDATE = "item.update";
    public static final String ITEM_DEACTIVATE = "item.deactivate";
    /** Manter unidades de medida e categorias de item (decisão do PO no planning da Sprint 3: só o Administrador). */
    public static final String CATALOG_ADMIN = "catalog.admin";
    public static final String USER_ADMIN = "user.admin";

    private Permissions() { }
}
