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
    public static final String PROPOSAL_READ = "proposal.read";
    public static final String PROPOSAL_CREATE = "proposal.create";
    public static final String PROPOSAL_UPDATE = "proposal.update";
    public static final String PROPOSAL_ISSUE = "proposal.issue";
    public static final String SALES_ORDER_READ = "sales_order.read";
    public static final String SALES_ORDER_CREATE = "sales_order.create";
    public static final String SALES_ORDER_UPDATE = "sales_order.update";
    public static final String SALES_ORDER_CONFIRM = "sales_order.confirm";
    public static final String SALES_ORDER_CANCEL = "sales_order.cancel";
    public static final String PROJECT_READ = "project.read";
    public static final String EQUIPMENT_READ = "equipment.read";
    public static final String EQUIPMENT_UPDATE = "equipment.update";
    public static final String FINANCIAL_TITLE_READ = "financial_title.read";
    public static final String USER_ADMIN = "user.admin";

    private Permissions() { }
}
