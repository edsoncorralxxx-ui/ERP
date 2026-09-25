"""Modelo de dados do Renda+ ERP (implementado + proposto) e gerador dos diagramas.

Fonte: migrações Flyway (tabelas implementadas), docs/backend/01-plano-completo-backend.md §5
e docs/backend/05-motor-dados-analise-decisao.md §3 (tabelas propostas).

Uso: python3 tools/modelo-dados/modelo.py
Gera docs/backend/16-modelo-de-dados.md (Mermaid, lido pelo GitHub) e docs/backend/modelo-de-dados.html.

Convenção das colunas: (nome, tipo, marcador). Marcador "PK", "FK:tabela", "UK" ou "".
Colunas comuns a todo registro mutável (version, created_at/by, updated_at/by, company_id) não são
repetidas nas tabelas propostas; valores monetários são inteiros em centavos (*_cents).
"""
import html
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

IMPLEMENTADAS = {"company_profile", "audit_event"}


def t(*cols):
    return [c if len(c) == 3 else (c[0], c[1], "") for c in cols]


DOMINIOS = [
    {
        "id": "plataforma", "nome": "Plataforma, auditoria e tarefas", "fase": "Sprint 1 / B02",
        "descricao": "Dados da empresa e auditoria já existem. Recibos de comando, outbox, fatos e tarefas duráveis vêm na Sprint 2.",
        "tabelas": {
            "company_profile": t(("id", "uuid", "PK"), ("legal_name", "varchar200"), ("trade_name", "varchar200"), ("cnpj", "char14"),
                                 ("street", "varchar200"), ("number", "varchar20"), ("complement", "varchar100"), ("district", "varchar100"),
                                 ("city", "varchar100"), ("state", "char2"), ("postal_code", "char8"), ("phone", "varchar30"),
                                 ("email", "varchar200"), ("configured", "boolean"), ("version", "bigint"), ("created_at", "timestamptz"),
                                 ("created_by", "varchar100"), ("updated_at", "timestamptz"), ("updated_by", "varchar100")),
            "audit_event": t(("id", "uuid", "PK"), ("occurred_at", "timestamptz"), ("actor", "varchar100"), ("action", "varchar100"),
                             ("entity_type", "varchar100"), ("entity_id", "varchar100"), ("entity_version", "bigint"), ("reason", "text"),
                             ("changes", "jsonb"), ("correlation_id", "varchar100")),
            "command_receipt": t(("id", "uuid", "PK"), ("operation", "text", "UK"), ("idempotency_key", "text", "UK"), ("request_hash", "text"),
                                 ("state", "text"), ("response", "jsonb"), ("actor_id", "uuid", "FK:user_account"), ("correlation_id", "text")),
            "outbox_event": t(("id", "uuid", "PK"), ("type", "text"), ("schema_version", "int"), ("aggregate_type", "text"),
                              ("aggregate_id", "uuid"), ("aggregate_version", "bigint"), ("payload", "jsonb"),
                              ("command_id", "uuid", "FK:command_receipt"), ("published_at", "timestamptz")),
            "consumer_receipt": t(("consumer", "text", "PK"), ("event_id", "uuid", "FK:outbox_event"), ("processed_at", "timestamptz")),
            "operational_fact": t(("id", "uuid", "PK"), ("fact_type", "text"), ("concept_id", "text"), ("subject_type", "text"),
                                  ("subject_id", "uuid"), ("occurred_on", "date"), ("recorded_at", "timestamptz"), ("dimensions", "jsonb"),
                                  ("measures", "jsonb"), ("reverses_fact_id", "uuid", "FK:operational_fact"), ("command_id", "uuid", "FK:command_receipt")),
            "processing_job": t(("id", "uuid", "PK"), ("type", "text"), ("state", "text"), ("input_schema_version", "int"),
                                ("processor_version", "text"), ("parameters", "jsonb"), ("attempts", "int"), ("lease_until", "timestamptz"),
                                ("lease_token", "uuid"), ("generation", "int"), ("progress", "int"), ("error", "text")),
            "processing_attempt": t(("id", "uuid", "PK"), ("job_id", "uuid", "FK:processing_job"), ("generation", "int"),
                                    ("started_at", "timestamptz"), ("finished_at", "timestamptz"), ("outcome", "text")),
            "stored_file": t(("id", "uuid", "PK"), ("sha256", "char64", "UK"), ("media_type", "text"), ("size_bytes", "bigint"), ("storage_key", "text")),
            "setting": t(("key", "text", "PK"), ("value", "jsonb"), ("valid_from", "date")),
        },
    },
    {
        "id": "acesso", "nome": "Acesso e identidade", "fase": "Sprint 2 / B03",
        "descricao": "Usuários, perfis e permissões verificados no servidor a cada operação.",
        "tabelas": {
            "company": t(("id", "uuid", "PK"), ("name", "text")),
            "user_account": t(("id", "uuid", "PK"), ("company_id", "uuid", "FK:company"), ("login", "text", "UK"), ("name", "text"), ("active", "boolean")),
            "role": t(("id", "uuid", "PK"), ("name", "text", "UK")),
            "permission": t(("code", "text", "PK"), ("description", "text")),
            "user_role": t(("user_id", "uuid", "FK:user_account"), ("role_id", "uuid", "FK:role")),
            "role_permission": t(("role_id", "uuid", "FK:role"), ("permission_code", "text", "FK:permission")),
            "session": t(("id", "uuid", "PK"), ("user_id", "uuid", "FK:user_account"), ("expires_at", "timestamptz"), ("revoked_at", "timestamptz")),
        },
    },
    {
        "id": "cadastros", "nome": "Parceiros e itens", "fase": "Sprints 2–3 / B03",
        "descricao": "Cliente e fornecedor são papéis do mesmo parceiro; unidades industriais pertencem ao cliente.",
        "tabelas": {
            "partner": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("legal_name", "text"), ("trade_name", "text"), ("cnpj", "char14", "UK"), ("active", "boolean")),
            "partner_role": t(("partner_id", "uuid", "FK:partner"), ("role", "text")),
            "partner_unit": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("name", "text"), ("city", "text"), ("state", "char2")),
            "address": t(("id", "uuid", "PK"), ("unit_id", "uuid", "FK:partner_unit"), ("street", "text"), ("postal_code", "char8")),
            "contact": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("unit_id", "uuid", "FK:partner_unit"), ("name", "text"), ("email", "text")),
            "external_alias": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("alias", "text"), ("source", "text")),
            "item": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("description", "text"), ("nature", "text"), ("uom_code", "text", "FK:unit_of_measure"),
                      ("category_id", "uuid", "FK:item_category"), ("stock_controlled", "boolean"), ("reference_cost", "numeric")),
            "item_category": t(("id", "uuid", "PK"), ("name", "text")),
            "unit_of_measure": t(("code", "text", "PK"), ("name", "text")),
            "unit_conversion": t(("item_id", "uuid", "FK:item"), ("from_uom", "text", "FK:unit_of_measure"), ("to_uom", "text"), ("factor", "numeric")),
            "supplier_item": t(("supplier_id", "uuid", "FK:partner"), ("item_id", "uuid", "FK:item"), ("lead_time_days", "int")),
        },
    },
    {
        "id": "comercial", "nome": "Comercial", "fase": "Sprint 4 / B05",
        "descricao": "Confirmar o pedido cria, numa transação, os projetos, os equipamentos e as parcelas a receber.",
        "tabelas": {
            "lead": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("company_name", "text"), ("rating", "int"), ("stage", "text")),
            "interaction": t(("id", "uuid", "PK"), ("lead_id", "uuid", "FK:lead"), ("occurred_at", "timestamptz"), ("next_action", "date")),
            "opportunity": t(("id", "uuid", "PK"), ("lead_id", "uuid", "FK:lead"), ("customer_id", "uuid", "FK:partner"), ("stage", "text"), ("estimated_cents", "bigint")),
            "proposal": t(("id", "uuid", "PK"), ("opportunity_id", "uuid", "FK:opportunity"), ("number", "text", "UK")),
            "proposal_revision": t(("id", "uuid", "PK"), ("proposal_id", "uuid", "FK:proposal"), ("revision", "int"), ("valid_until", "date"), ("total_cents", "bigint")),
            "proposal_line": t(("id", "uuid", "PK"), ("revision_id", "uuid", "FK:proposal_revision"), ("item_id", "uuid", "FK:item"), ("quantity", "numeric"), ("unit_price", "numeric")),
            "sales_order": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("customer_id", "uuid", "FK:partner"), ("unit_id", "uuid", "FK:partner_unit"),
                             ("proposal_revision_id", "uuid", "FK:proposal_revision"), ("status", "text"), ("contract_date", "date"), ("total_cents", "bigint")),
            "sales_order_line": t(("id", "uuid", "PK"), ("order_id", "uuid", "FK:sales_order"), ("item_id", "uuid", "FK:item"), ("kind", "text"),
                                  ("quantity", "numeric"), ("unit_price", "numeric"), ("discount_cents", "bigint"), ("line_total_cents", "bigint")),
            "sales_order_amendment": t(("id", "uuid", "PK"), ("order_id", "uuid", "FK:sales_order"), ("delta_cents", "bigint"), ("approved_at", "timestamptz")),
            "installment_plan": t(("order_id", "uuid", "FK:sales_order"), ("seq", "int"), ("due_date", "date"), ("amount_cents", "bigint")),
        },
    },
    {
        "id": "projetos", "nome": "Projetos e equipamentos", "fase": "Sprint 4 / B05",
        "descricao": "O projeto é o vínculo central; cada equipamento tem identidade e histórico próprios.",
        "tabelas": {
            "project": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("order_id", "uuid", "FK:sales_order"), ("customer_id", "uuid", "FK:partner"),
                         ("unit_id", "uuid", "FK:partner_unit"), ("stage", "text"), ("contract_delivery", "date")),
            "project_member": t(("project_id", "uuid", "FK:project"), ("user_id", "uuid", "FK:user_account"), ("role", "text")),
            "project_milestone": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("name", "text"), ("planned_on", "date"), ("done_on", "date")),
            "equipment_model": t(("id", "uuid", "PK"), ("name", "text")),
            "equipment": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("model_id", "uuid", "FK:equipment_model"), ("project_id", "uuid", "FK:project"),
                           ("unit_id", "uuid", "FK:partner_unit"), ("serial_number", "text"), ("accepted_on", "date"), ("warranty_start", "date")),
            "equipment_component": t(("equipment_id", "uuid", "FK:equipment"), ("item_id", "uuid", "FK:item"), ("quantity", "numeric")),
            "equipment_document": t(("equipment_id", "uuid", "FK:equipment"), ("attachment_id", "uuid", "FK:attachment")),
        },
    },
    {
        "id": "engenharia", "nome": "Engenharia e cronograma", "fase": "B07",
        "descricao": "BOM e EAP versionadas; o projeto conserva a revisão aplicada; recálculo não altera a linha de base.",
        "tabelas": {
            "bom_template": t(("id", "uuid", "PK"), ("model_id", "uuid", "FK:equipment_model"), ("name", "text")),
            "bom_revision": t(("id", "uuid", "PK"), ("template_id", "uuid", "FK:bom_template"), ("revision", "int"), ("status", "text")),
            "bom_line": t(("id", "uuid", "PK"), ("revision_id", "uuid", "FK:bom_revision"), ("item_id", "uuid", "FK:item"), ("quantity", "numeric"), ("reference_cost", "numeric")),
            "project_bom_revision": t(("project_id", "uuid", "FK:project"), ("equipment_id", "uuid", "FK:equipment"), ("revision_id", "uuid", "FK:bom_revision")),
            "wbs_template": t(("id", "uuid", "PK"), ("name", "text")),
            "project_activity": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("wbs_code", "text"), ("duration_days", "int"), ("weight", "numeric"), ("progress", "numeric")),
            "activity_dependency": t(("predecessor_id", "uuid", "FK:project_activity"), ("successor_id", "uuid"), ("type", "text"), ("lag_days", "int")),
            "work_calendar": t(("id", "uuid", "PK"), ("name", "text"), ("working_days", "jsonb")),
            "schedule_baseline": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("approved_at", "timestamptz")),
            "baseline_activity": t(("baseline_id", "uuid", "FK:schedule_baseline"), ("activity_id", "uuid", "FK:project_activity"), ("start_on", "date"), ("finish_on", "date")),
            "progress_entry": t(("id", "uuid", "PK"), ("activity_id", "uuid", "FK:project_activity"), ("progress", "numeric"), ("recorded_on", "date")),
        },
    },
    {
        "id": "suprimentos", "nome": "Suprimentos", "fase": "B08",
        "descricao": "Necessidade líquida por item e data (MRP), cotações e pedidos de compra com aprovação.",
        "tabelas": {
            "material_requirement": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("item_id", "uuid", "FK:item"), ("needed_on", "date"), ("net_quantity", "numeric")),
            "purchase_request": t(("id", "uuid", "PK"), ("requirement_id", "uuid", "FK:material_requirement"), ("status", "text")),
            "quotation": t(("id", "uuid", "PK"), ("request_id", "uuid", "FK:purchase_request"), ("supplier_id", "uuid", "FK:partner"), ("valid_until", "date")),
            "quotation_line": t(("id", "uuid", "PK"), ("quotation_id", "uuid", "FK:quotation"), ("item_id", "uuid", "FK:item"), ("unit_price", "numeric"), ("lead_time_days", "int")),
            "purchase_order": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("supplier_id", "uuid", "FK:partner"), ("status", "text"), ("total_cents", "bigint")),
            "purchase_order_line": t(("id", "uuid", "PK"), ("order_id", "uuid", "FK:purchase_order"), ("item_id", "uuid", "FK:item"), ("project_id", "uuid", "FK:project"),
                                     ("quantity", "numeric"), ("unit_price", "numeric"), ("delivery_on", "date")),
            "purchase_approval": t(("id", "uuid", "PK"), ("order_id", "uuid", "FK:purchase_order"), ("approver_id", "uuid", "FK:user_account"), ("approved_at", "timestamptz")),
        },
    },
    {
        "id": "estoque", "nome": "Estoque, recebimentos e terceiros", "fase": "B08",
        "descricao": "Saldo físico, reservado e disponível por item, local e propriedade; material em terceiros continua próprio.",
        "tabelas": {
            "stock_location": t(("id", "uuid", "PK"), ("name", "text"), ("holder_partner_id", "uuid", "FK:partner")),
            "stock_position": t(("item_id", "uuid", "FK:item"), ("location_id", "uuid", "FK:stock_location"), ("ownership", "text"),
                                ("physical", "numeric"), ("reserved", "numeric"), ("average_cost", "numeric")),
            "stock_reservation": t(("id", "uuid", "PK"), ("item_id", "uuid", "FK:item"), ("location_id", "uuid", "FK:stock_location"), ("project_id", "uuid", "FK:project"), ("quantity", "numeric")),
            "stock_movement": t(("id", "uuid", "PK"), ("item_id", "uuid", "FK:item"), ("location_id", "uuid", "FK:stock_location"), ("kind", "text"), ("quantity", "numeric"),
                                ("amount_cents", "bigint"), ("project_id", "uuid", "FK:project"), ("reverses_id", "uuid", "FK:stock_movement")),
            "inventory_count": t(("id", "uuid", "PK"), ("location_id", "uuid", "FK:stock_location"), ("counted_on", "date")),
            "goods_receipt": t(("id", "uuid", "PK"), ("purchase_order_id", "uuid", "FK:purchase_order"), ("received_on", "date")),
            "goods_receipt_line": t(("id", "uuid", "PK"), ("receipt_id", "uuid", "FK:goods_receipt"), ("order_line_id", "uuid", "FK:purchase_order_line"), ("quantity", "numeric"), ("location_id", "uuid", "FK:stock_location")),
            "third_party_dispatch": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("dispatched_on", "date")),
            "third_party_return": t(("id", "uuid", "PK"), ("dispatch_id", "uuid", "FK:third_party_dispatch"), ("returned_on", "date"), ("losses", "jsonb")),
            "service_acceptance": t(("id", "uuid", "PK"), ("order_line_id", "uuid", "FK:purchase_order_line"), ("project_id", "uuid", "FK:project"), ("amount_cents", "bigint")),
        },
    },
    {
        "id": "producao", "nome": "Produção e qualidade", "fase": "B09",
        "descricao": "Ordens com roteiro, apontamentos de horas e consumo; inspeções por checklist versionado.",
        "tabelas": {
            "production_order": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("equipment_id", "uuid", "FK:equipment"), ("bom_revision_id", "uuid", "FK:bom_revision"), ("status", "text")),
            "routing_operation": t(("id", "uuid", "PK"), ("order_id", "uuid", "FK:production_order"), ("seq", "int"), ("name", "text")),
            "production_entry": t(("id", "uuid", "PK"), ("operation_id", "uuid", "FK:routing_operation"), ("quantity_done", "numeric"), ("losses", "numeric")),
            "labor_entry": t(("id", "uuid", "PK"), ("operation_id", "uuid", "FK:routing_operation"), ("hours", "numeric"), ("rate", "numeric")),
            "inspection": t(("id", "uuid", "PK"), ("subject_type", "text"), ("subject_id", "uuid"), ("checklist_revision", "int"), ("result", "text")),
            "inspection_item": t(("id", "uuid", "PK"), ("inspection_id", "uuid", "FK:inspection"), ("criterion", "text"), ("measurement", "text"), ("result", "text")),
            "nonconformity": t(("id", "uuid", "PK"), ("inspection_id", "uuid", "FK:inspection"), ("severity", "text"), ("status", "text")),
            "rework_order": t(("id", "uuid", "PK"), ("nonconformity_id", "uuid", "FK:nonconformity"), ("production_order_id", "uuid", "FK:production_order")),
        },
    },
    {
        "id": "instalacao", "nome": "Instalação e entrega", "fase": "B09",
        "descricao": "Execução em campo, despesas, testes, pendências e aceite real do equipamento.",
        "tabelas": {
            "installation": t(("id", "uuid", "PK"), ("equipment_id", "uuid", "FK:equipment"), ("planned_start", "date"), ("status", "text")),
            "installation_entry": t(("id", "uuid", "PK"), ("installation_id", "uuid", "FK:installation"), ("worked_on", "date"), ("hours", "numeric")),
            "installation_expense": t(("id", "uuid", "PK"), ("installation_id", "uuid", "FK:installation"), ("category", "text"), ("amount_cents", "bigint")),
            "acceptance_record": t(("id", "uuid", "PK"), ("installation_id", "uuid", "FK:installation"), ("accepted_on", "date")),
            "acceptance_issue": t(("id", "uuid", "PK"), ("acceptance_id", "uuid", "FK:acceptance_record"), ("description", "text"), ("due_on", "date")),
        },
    },
    {
        "id": "documentos", "nome": "Documentos e anexos", "fase": "Sprint 6 / B06",
        "descricao": "Notas registradas se vinculam às parcelas existentes, sem criar nova obrigação.",
        "tabelas": {
            "business_document": t(("id", "uuid", "PK"), ("number", "text"), ("direction", "text"), ("partner_id", "uuid", "FK:partner"), ("issue_date", "date"),
                                   ("competence", "char7"), ("total_cents", "bigint")),
            "document_line": t(("id", "uuid", "PK"), ("document_id", "uuid", "FK:business_document"), ("kind", "text"), ("amount_cents", "bigint")),
            "document_title_link": t(("document_id", "uuid", "FK:business_document"), ("title_id", "uuid", "FK:financial_title"), ("amount_cents", "bigint")),
            "attachment": t(("id", "uuid", "PK"), ("file_id", "uuid", "FK:stored_file"), ("name", "text")),
            "attachment_link": t(("attachment_id", "uuid", "FK:attachment"), ("owner_type", "text"), ("owner_id", "uuid")),
        },
    },
    {
        "id": "financeiro", "nome": "Financeiro", "fase": "Sprints 5–6 / B05–B06",
        "descricao": "Títulos com saldo derivado de alocações; liquidação N:N; conciliação N:N com diferenças explícitas.",
        "tabelas": {
            "financial_title": t(("id", "uuid", "PK"), ("code", "text", "UK"), ("direction", "text"), ("counterparty_id", "uuid", "FK:partner"),
                                 ("origin_type", "text", "UK"), ("origin_id", "uuid", "UK"), ("project_id", "uuid", "FK:project"), ("category", "text"),
                                 ("competence", "char7"), ("due_date", "date"), ("original_cents", "bigint"), ("lifecycle", "text")),
            "title_adjustment": t(("id", "uuid", "PK"), ("title_id", "uuid", "FK:financial_title"), ("kind", "text"), ("signed_cents", "bigint"), ("reason", "text")),
            "settlement": t(("id", "uuid", "PK"), ("direction", "text"), ("account_id", "uuid", "FK:bank_account"), ("effective_date", "date"),
                            ("total_cents", "bigint"), ("credit_cents", "bigint"), ("status", "text")),
            "settlement_allocation": t(("settlement_id", "uuid", "FK:settlement"), ("title_id", "uuid", "FK:financial_title"), ("amount_cents", "bigint")),
            "settlement_reversal": t(("id", "uuid", "PK"), ("settlement_id", "uuid", "FK:settlement"), ("reason", "text"), ("cash_movement_id", "uuid", "FK:cash_movement")),
            "customer_supplier_credit": t(("id", "uuid", "PK"), ("partner_id", "uuid", "FK:partner"), ("settlement_id", "uuid", "FK:settlement"), ("balance_cents", "bigint")),
            "bank_account": t(("id", "uuid", "PK"), ("name", "text"), ("bank", "text"), ("opening_cents", "bigint"), ("opening_on", "date")),
            "cash_movement": t(("id", "uuid", "PK"), ("account_id", "uuid", "FK:bank_account"), ("effective_date", "date"), ("amount_cents", "bigint"),
                               ("settlement_id", "uuid", "FK:settlement"), ("transfer_id", "uuid", "FK:internal_transfer")),
            "internal_transfer": t(("id", "uuid", "PK"), ("from_account_id", "uuid", "FK:bank_account"), ("to_account_id", "uuid"), ("amount_cents", "bigint")),
            "statement_batch": t(("id", "uuid", "PK"), ("account_id", "uuid", "FK:bank_account"), ("file_id", "uuid", "FK:stored_file")),
            "statement_entry": t(("id", "uuid", "PK"), ("batch_id", "uuid", "FK:statement_batch"), ("posted_on", "date"), ("amount_cents", "bigint"), ("dedup_key", "text", "UK")),
            "reconciliation_group": t(("id", "uuid", "PK"), ("account_id", "uuid", "FK:bank_account"), ("difference_cents", "bigint"), ("undone_at", "timestamptz")),
            "reconciliation_link": t(("group_id", "uuid", "FK:reconciliation_group"), ("statement_entry_id", "uuid", "FK:statement_entry"), ("cash_movement_id", "uuid", "FK:cash_movement")),
        },
    },
    {
        "id": "custos", "nome": "Custos e resultado", "fase": "B08–B10",
        "descricao": "Orçado, comprometido e incorrido separados; cada custo entra uma vez pela sua origem.",
        "tabelas": {
            "project_budget": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("revision", "int"), ("approved_at", "timestamptz")),
            "budget_line": t(("budget_id", "uuid", "FK:project_budget"), ("category", "text"), ("amount_cents", "bigint")),
            "cost_commitment": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("purchase_order_line_id", "uuid", "FK:purchase_order_line"), ("amount_cents", "bigint")),
            "cost_entry": t(("id", "uuid", "PK"), ("project_id", "uuid", "FK:project"), ("equipment_id", "uuid", "FK:equipment"), ("category", "text"),
                            ("amount_cents", "bigint"), ("source_type", "text", "UK"), ("source_id", "uuid", "UK")),
            "allocation_rule": t(("id", "uuid", "PK"), ("name", "text"), ("basis", "text")),
            "allocation_entry": t(("rule_id", "uuid", "FK:allocation_rule"), ("cost_entry_id", "uuid", "FK:cost_entry"), ("project_id", "uuid", "FK:project"), ("amount_cents", "bigint")),
        },
    },
    {
        "id": "repasses", "nome": "Repasses", "fase": "B10",
        "descricao": "Regras versionadas; a confirmação congela a memória de cálculo e gera títulos uma única vez.",
        "tabelas": {
            "distribution_rule": t(("id", "uuid", "PK"), ("name", "text"), ("scope", "text")),
            "distribution_rule_revision": t(("id", "uuid", "PK"), ("rule_id", "uuid", "FK:distribution_rule"), ("revision", "int"), ("basis", "text"), ("valid_from", "date")),
            "distribution_run": t(("id", "uuid", "PK"), ("revision_id", "uuid", "FK:distribution_rule_revision"), ("competence", "char7"), ("status", "text"), ("base_cents", "bigint")),
            "distribution_line": t(("run_id", "uuid", "FK:distribution_run"), ("beneficiary_id", "uuid", "FK:partner"), ("rate", "numeric"), ("amount_cents", "bigint"), ("title_id", "uuid", "FK:financial_title")),
            "distribution_adjustment": t(("id", "uuid", "PK"), ("run_id", "uuid", "FK:distribution_run"), ("delta_cents", "bigint"), ("reason", "text")),
        },
    },
    {
        "id": "fiscal", "nome": "Fiscal gerencial", "fase": "Sprint 7 / B10",
        "descricao": "Histórico importado, simulação gerencial e valor confirmado pelo contador ficam separados.",
        "tabelas": {
            "tax_period": t(("id", "uuid", "PK"), ("competence", "char7", "UK"), ("status", "text")),
            "fiscal_revenue": t(("period_id", "uuid", "FK:tax_period"), ("document_line_id", "uuid", "FK:document_line"), ("kind", "text"), ("amount_cents", "bigint")),
            "tax_parameter_revision": t(("id", "uuid", "PK"), ("regime", "text"), ("valid_from", "date"), ("parameters", "jsonb"), ("confirmed_by", "text")),
            "imported_tax_history": t(("period_id", "uuid", "FK:tax_period"), ("source_file_id", "uuid", "FK:stored_file"), ("amount_cents", "bigint")),
            "tax_simulation": t(("id", "uuid", "PK"), ("period_id", "uuid", "FK:tax_period"), ("parameter_revision_id", "uuid", "FK:tax_parameter_revision"), ("result", "jsonb")),
            "accountant_confirmation": t(("period_id", "uuid", "FK:tax_period"), ("amount_cents", "bigint"), ("title_id", "uuid", "FK:financial_title")),
            "tax_closure": t(("period_id", "uuid", "FK:tax_period"), ("closed_at", "timestamptz"), ("reopened_reason", "text")),
        },
    },
    {
        "id": "posvenda", "nome": "Pós-venda", "fase": "B11",
        "descricao": "Chamados e ordens de serviço ligados ao equipamento; cada ocorrência preventiva gera no máximo uma OS.",
        "tabelas": {
            "service_ticket": t(("id", "uuid", "PK"), ("equipment_id", "uuid", "FK:equipment"), ("priority", "text"), ("warranty_status", "text"), ("status", "text")),
            "service_order": t(("id", "uuid", "PK"), ("ticket_id", "uuid", "FK:service_ticket"), ("occurrence_id", "uuid", "FK:preventive_occurrence"), ("status", "text")),
            "service_entry": t(("id", "uuid", "PK"), ("service_order_id", "uuid", "FK:service_order"), ("hours", "numeric"), ("expenses_cents", "bigint")),
            "warranty_term": t(("id", "uuid", "PK"), ("equipment_id", "uuid", "FK:equipment"), ("months", "int"), ("coverage", "text")),
            "preventive_plan": t(("id", "uuid", "PK"), ("equipment_id", "uuid", "FK:equipment"), ("revision", "int"), ("periodicity_days", "int")),
            "preventive_occurrence": t(("id", "uuid", "PK"), ("plan_id", "uuid", "FK:preventive_plan", ), ("scheduled_on", "date", "UK")),
        },
    },
    {
        "id": "integracao", "nome": "Importação e exportação", "fase": "B04 / B12",
        "descricao": "Arquivos vão para uma área de conferência; nada é aplicado sem decisão humana.",
        "tabelas": {
            "import_file": t(("id", "uuid", "PK"), ("file_id", "uuid", "FK:stored_file"), ("source_type", "text"), ("job_id", "uuid", "FK:processing_job")),
            "staging_record": t(("id", "uuid", "PK"), ("import_file_id", "uuid", "FK:import_file"), ("page", "int"), ("line", "int"), ("original_text", "text"), ("proposed", "jsonb")),
            "staging_issue": t(("id", "uuid", "PK"), ("record_id", "uuid", "FK:staging_record"), ("kind", "text"), ("severity", "text")),
            "review_decision": t(("id", "uuid", "PK"), ("record_id", "uuid", "FK:staging_record"), ("decision", "text"), ("corrected", "jsonb")),
            "import_application": t(("id", "uuid", "PK"), ("record_id", "uuid", "FK:staging_record", ), ("created_ref", "text"), ("command_id", "uuid", "FK:command_receipt")),
            "export_job": t(("id", "uuid", "PK"), ("query_id", "text"), ("format", "text"), ("file_id", "uuid", "FK:stored_file")),
        },
    },
    {
        "id": "analitico", "nome": "Motor de dados, análise e decisão", "fase": "B01–B16",
        "descricao": "Catálogo semântico, indicadores com definição única, execuções analíticas, achados e decisões.",
        "tabelas": {
            "business_concept": t(("id", "text", "PK"), ("term", "text"), ("owner_module", "text")),
            "form_definition": t(("id", "text", "PK"), ("version", "int", "PK"), ("concept_id", "text", "FK:business_concept"), ("definition", "jsonb")),
            "classification_rule_revision": t(("id", "uuid", "PK"), ("scope", "text"), ("revision", "int"), ("valid_from", "date"), ("condition", "jsonb")),
            "classification_assignment": t(("id", "uuid", "PK"), ("rule_revision_id", "uuid", "FK:classification_rule_revision"), ("subject_id", "uuid"), ("class_name", "text"), ("kind", "text")),
            "indicator_definition": t(("id", "text", "PK"), ("version", "int", "PK"), ("formula", "jsonb"), ("unit", "text"), ("missing_policy", "text")),
            "indicator_dependency": t(("indicator_id", "text", "FK:indicator_definition"), ("depends_on_id", "text")),
            "indicator_snapshot": t(("indicator_id", "text", "FK:indicator_definition"), ("period", "text"), ("value", "numeric"), ("state", "text")),
            "dataset_snapshot": t(("id", "uuid", "PK"), ("query", "jsonb"), ("cutoff", "timestamptz"), ("sha256", "char64")),
            "analysis_definition": t(("id", "text", "PK"), ("method", "text"), ("version", "text")),
            "analysis_run": t(("id", "uuid", "PK"), ("definition_id", "text", "FK:analysis_definition"), ("snapshot_id", "uuid", "FK:dataset_snapshot"),
                              ("seed", "bigint"), ("state", "text"), ("result", "jsonb")),
            "analysis_artifact": t(("id", "uuid", "PK"), ("run_id", "uuid", "FK:analysis_run"), ("file_id", "uuid", "FK:stored_file")),
            "model_version": t(("id", "uuid", "PK"), ("definition_id", "text", "FK:analysis_definition"), ("state", "text"), ("trained_until", "date")),
            "model_validation": t(("id", "uuid", "PK"), ("model_id", "uuid", "FK:model_version"), ("metrics", "jsonb")),
            "model_monitoring": t(("id", "uuid", "PK"), ("model_id", "uuid", "FK:model_version"), ("observed_at", "timestamptz"), ("drift", "numeric")),
            "finding": t(("id", "uuid", "PK"), ("run_id", "uuid", "FK:analysis_run"), ("subject_id", "uuid"), ("impact", "text"), ("urgency", "text"), ("status", "text")),
            "finding_evidence": t(("finding_id", "uuid", "FK:finding"), ("evidence", "jsonb")),
            "decision": t(("id", "uuid", "PK"), ("finding_id", "uuid", "FK:finding"), ("choice", "text"), ("decided_by", "uuid", "FK:user_account")),
            "action_plan": t(("id", "uuid", "PK"), ("decision_id", "uuid", "FK:decision"), ("owner_id", "uuid", "FK:user_account"), ("due_on", "date")),
            "action_task": t(("id", "uuid", "PK"), ("plan_id", "uuid", "FK:action_plan"), ("description", "text"), ("status", "text")),
            "decision_evaluation": t(("id", "uuid", "PK"), ("decision_id", "uuid", "FK:decision"), ("expected", "jsonb"), ("observed", "jsonb")),
            "experiment": t(("id", "uuid", "PK"), ("hypothesis", "text"), ("status", "text")),
            "experiment_assignment": t(("experiment_id", "uuid", "FK:experiment"), ("subject_id", "uuid"), ("group_name", "text")),
            "experiment_measurement": t(("experiment_id", "uuid", "FK:experiment"), ("metric", "text"), ("value", "numeric")),
        },
    },
]

# Complementos por domínio do catálogo analítico (B14): nomes conceituais, sem detalhamento de colunas ainda.
EXTENSOES = {
    "Marketing e canais": ["marketing_campaign", "channel_touchpoint", "attribution_rule", "marketing_budget"],
    "Valor e satisfação do cliente": ["customer_value_plan", "customer_baseline", "benefit_measurement", "satisfaction_survey"],
    "Orçamento e investimentos": ["corporate_budget_revision", "investment_case", "cash_scenario"],
    "Capacidade, calibração e logística": ["resource_capacity", "scheduling_scenario", "calibration_session", "measurement_observation",
                                            "shipment", "route_matrix", "routing_scenario", "product_experiment"],
    "Contratos e riscos": ["contractual_obligation", "legal_occurrence", "risk_assessment"],
}


def todas():
    return {n: (d, cols) for d in DOMINIOS for n, cols in d["tabelas"].items()}


def mermaid(dominio, catalogo):
    """Diagrama ER de um domínio; tabelas de outros domínios referenciadas aparecem só com a chave."""
    linhas = ["erDiagram"]
    externas = set()
    relacoes = []
    for nome, cols in dominio["tabelas"].items():
        for col, _, marca in cols:
            if marca.startswith("FK:"):
                alvo = marca[3:]
                if alvo not in dominio["tabelas"]:
                    externas.add(alvo)
                relacoes.append(f'    {alvo} ||--o{{ {nome} : "{col}"')
    for nome, cols in dominio["tabelas"].items():
        linhas.append(f"    {nome} {{")
        for col, tipo, marca in cols:
            chave = "PK" if marca == "PK" else "FK" if marca.startswith("FK:") else "UK" if marca == "UK" else ""
            linhas.append(f"        {tipo} {col}{(' ' + chave) if chave else ''}")
        linhas.append("    }")
    for ext in sorted(externas):
        linhas.append(f"    {ext} {{")
        linhas.append("        ref outro_dominio")
        linhas.append("    }")
    linhas.extend(sorted(set(relacoes)))
    return "\n".join(linhas), sorted(externas)


def verificar(catalogo):
    erros = []
    for nome, (dom, cols) in catalogo.items():
        for col, _, marca in cols:
            if marca.startswith("FK:") and marca[3:] not in catalogo:
                erros.append(f"{nome}.{col} referencia tabela inexistente {marca[3:]}")
    return erros


def gerar_md(catalogo):
    n_prop = sum(len(d["tabelas"]) for d in DOMINIOS) - len(IMPLEMENTADAS)
    n_ext = sum(len(v) for v in EXTENSOES.values())
    partes = [
        "# Modelo de dados do Renda+ ERP",
        "",
        "Gerado por `tools/modelo-dados/modelo.py`. Não edite à mão.",
        "",
        f"- **Implementadas** (migração Flyway V1, Sprint 1): {', '.join(sorted(IMPLEMENTADAS))}.",
        f"- **Propostas** no plano do backend (doc 01 §5, doc 05 §3): {n_prop} tabelas em {len(DOMINIOS)} domínios, mais {n_ext} complementos do catálogo analítico.",
        "- Nomes e colunas propostas são conceituais: o DDL de cada tabela é definido na sprint que a implementa.",
        "- Colunas comuns omitidas nas propostas: `version`, `created_at/by`, `updated_at/by`, `company_id`. Dinheiro em centavos inteiros (`*_cents`).",
        "- Registros confirmados não são apagados: correção por estorno/ajuste, com referência ao original.",
        "",
    ]
    for d in DOMINIOS:
        diag, externas = mermaid(d, catalogo)
        impl = [n for n in d["tabelas"] if n in IMPLEMENTADAS]
        partes += [f"## {d['nome']}", "", f"{d['descricao']} Fase: {d['fase']}.", ""]
        if impl:
            partes += [f"Implementadas: {', '.join(impl)}.", ""]
        if externas:
            partes += [f"Referências a outros domínios: {', '.join(externas)}.", ""]
        partes += ["```mermaid", diag, "```", ""]
    partes += ["## Complementos do catálogo analítico (B14)", "", "Tabelas conceituais, detalhadas quando cada recurso for priorizado.", ""]
    for g, tabs in EXTENSOES.items():
        partes.append(f"- **{g}**: {', '.join(tabs)}")
    return "\n".join(partes) + "\n"


def gerar_html(catalogo):
    esc = html.escape
    nav, secoes = [], []
    for d in DOMINIOS:
        diag, externas = mermaid(d, catalogo)
        tem_impl = any(n in IMPLEMENTADAS for n in d["tabelas"])
        classe = ' class="tem-impl"' if tem_impl else ""
        nav.append(f'<li><a href="#{d["id"]}"{classe}>{esc(d["nome"])}</a></li>')
        cartoes = "".join(
            f'<div class="tabela"><span class="mono">{esc(n)}</span>'
            f'<span class="selo{" selo--impl" if n in IMPLEMENTADAS else ""}">{"Implementada" if n in IMPLEMENTADAS else "Proposta"}</span></div>'
            for n in d["tabelas"])
        ext = f'<p class="externas">Liga-se a: {", ".join(f"<code>{esc(e)}</code>" for e in externas)}</p>' if externas else ""
        secoes.append(
            f'<section class="dominio" id="{d["id"]}">'
            f'<div class="dominio-cab"><h2>{esc(d["nome"])}</h2><span class="selo selo--fase">{esc(d["fase"])}</span>'
            f'<p>{esc(d["descricao"])}</p></div>'
            f'<div class="diagrama"><pre class="mermaid">\n{esc(diag)}\n</pre></div>'
            f'<div class="tabelas">{cartoes}</div>{ext}</section>')
    extensoes = "".join(f'<li><strong>{esc(g)}</strong><span>{esc(", ".join(t))}</span></li>' for g, t in EXTENSOES.items())
    fks = sum(1 for _, (_, cols) in catalogo.items() for _, _, m in cols if m.startswith("FK:"))
    modelo = (RAIZ / "tools" / "modelo-dados" / "pagina.html").read_text(encoding="utf-8")
    return (modelo.replace("__NAV__", "".join(nav)).replace("__CONTEUDO__", "\n".join(secoes))
            .replace("__EXTENSOES__", extensoes).replace("__TOTAL__", str(len(catalogo))).replace("__FKS__", str(fks))
            .replace("__DOM__", str(len(DOMINIOS))).replace("__EXT__", str(sum(len(v) for v in EXTENSOES.values()))))


def main():
    catalogo = todas()
    erros = verificar(catalogo)
    if erros:
        raise SystemExit("\n".join(erros))
    (RAIZ / "docs" / "backend" / "16-modelo-de-dados.md").write_text(gerar_md(catalogo), encoding="utf-8")
    (RAIZ / "docs" / "backend" / "modelo-de-dados.html").write_text(gerar_html(catalogo), encoding="utf-8")
    fks = sum(1 for _, (_, cols) in catalogo.items() for _, _, m in cols if m.startswith("FK:"))
    print(f"{len(catalogo)} tabelas detalhadas ({len(IMPLEMENTADAS)} implementadas), {fks} chaves estrangeiras, "
          f"{sum(len(v) for v in EXTENSOES.values())} complementos, {len(DOMINIOS)} domínios")


if __name__ == "__main__":
    main()
