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
    /** Registrar título a pagar (RegisterPayableTitle, Sprint 8). */
    public static final String FINANCIAL_TITLE_CREATE = "financial_title.create";
    /** Registrar recebimento ou pagamento (PostSettlement). */
    public static final String FINANCIAL_TITLE_SETTLE = "financial_title.settle";
    /** Cancelar título a pagar manual sem pagamento (CancelTitle). */
    public static final String FINANCIAL_TITLE_CANCEL = "financial_title.cancel";
    /** Cadastrar, renomear e inativar categorias financeiras (PD-010). */
    public static final String FINANCIAL_CATEGORY_ADMIN = "financial_category.admin";
    /** Estornar recebimento ou pagamento (ReverseSettlement). */
    public static final String SETTLEMENT_REVERSE = "settlement.reverse";
    /** Transferir entre contas próprias e estornar a transferência (TransferBetweenAccounts, Sprint 9). */
    public static final String TRANSFER_POST = "transfer.post";
    /** Cadastrar e alterar contas financeiras (caixa e bancos). */
    public static final String BANK_ACCOUNT_ADMIN = "bank_account.admin";
    public static final String DOCUMENT_READ = "document.read";
    /** Registrar documento (RegisterDocument). */
    public static final String DOCUMENT_REGISTER = "document.register";
    /** Vincular documento a parcelas e desfazer vínculo (LinkDocumentToTitles, RemoveDocumentLink). */
    public static final String DOCUMENT_LINK = "document.link";
    public static final String DOCUMENT_CLASSIFY = "document.classify";
    public static final String DOCUMENT_CANCEL = "document.cancel";
    /** Ver competências, simulações, conferências e parâmetros fiscais (Sprint 7). */
    public static final String TAX_READ = "tax.read";
    /** Criar revisão dos parâmetros do Simples Nacional. */
    public static final String TAX_PARAMETER_ADMIN = "tax_parameter.admin";
    /** Simular a competência (RecordTaxSimulation). */
    public static final String TAX_PERIOD_SIMULATE = "tax_period.simulate";
    /** Informar o RBT12 e registrar a conferência do contador (ConfirmTaxPeriod). */
    public static final String TAX_PERIOD_CONFIRM = "tax_period.confirm";
    public static final String TAX_PERIOD_CLOSE = "tax_period.close";
    /** Reabrir competência fechada, com motivo. */
    public static final String TAX_PERIOD_REOPEN = "tax_period.reopen";
    /** Ver modelos de equipamento, BOMs, revisões e o custo planejado (Sprint 10). */
    public static final String BOM_READ = "bom.read";
    /** Cadastrar modelos e BOMs, editar a BOM e carregar a BOM do arquivo (só o Administrador). */
    public static final String BOM_UPDATE = "bom.update";
    /** Aplicar BOM ao equipamento, trocar a revisão e ajustar a BOM do equipamento (ApplyBomToProject). */
    public static final String PROJECT_BOM_APPLY = "project_bom.apply";
    /** Ver prospecções, interações e a agenda do CRM (Sprint 11). */
    public static final String LEAD_READ = "lead.read";
    /** Cadastrar prospecção e carregar a lista de prospecção (RegisterLead). */
    public static final String LEAD_CREATE = "lead.create";
    /** Alterar e descartar prospecção, registrar interação (RecordInteraction) e convertê-la em cliente. */
    public static final String LEAD_UPDATE = "lead.update";
    /** Ver oportunidades, o histórico de etapas e o funil de vendas. */
    public static final String OPPORTUNITY_READ = "opportunity.read";
    /** Abrir oportunidade (OpenOpportunity). */
    public static final String OPPORTUNITY_CREATE = "opportunity.create";
    /** Alterar, mudar de etapa, registrar interação e marcar a oportunidade como perdida. */
    public static final String OPPORTUNITY_UPDATE = "opportunity.update";
    /** Alterar nome e percentual de fechamento das etapas do funil. */
    public static final String CRM_STAGE_ADMIN = "crm_stage.admin";
    public static final String USER_ADMIN = "user.admin";

    private Permissions() { }
}
