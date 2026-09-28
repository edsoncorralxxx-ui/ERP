-- Sprint 6: documentos fiscais registrados (emitidos fora do Renda+) e vínculos com as parcelas existentes (PD-023).
-- O documento não cria título: faturamento e recebimento são independentes (docs/backend/14, §1).

create sequence business_document_code_seq;

-- Documento: nota de saída (venda) nesta sprint; a de entrada vem com as contas a pagar.
create table business_document (
    id                  uuid primary key,
    code                varchar(20)  not null unique,
    direction           varchar(10)  not null check (direction in ('SAIDA', 'ENTRADA')),
    partner_id          uuid         not null references partner (id),
    series              varchar(10)  not null,
    number              varchar(20)  not null,
    issue_date          date         not null,
    competence          char(7)      not null check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    total_cents         bigint       not null check (total_cents > 0),
    -- Σ vínculos ativos, mantido sob bloqueio do documento; barreira final de "Σ vínculos ≤ total".
    linked_cents        bigint       not null default 0,
    notes               varchar(500),
    operation_nature    varchar(30)  check (operation_nature in ('VENDA_PRODUCAO', 'VENDA_MERCADORIA', 'PRESTACAO_SERVICO', 'REMESSA')),
    project_id          uuid references project (id),
    classification_rev  integer      not null default 0 check (classification_rev >= 0),
    status              varchar(10)  not null check (status in ('ATIVO', 'CANCELADO')),
    cancel_reason       varchar(500),
    version             bigint       not null check (version >= 1),
    created_at          timestamptz  not null,
    created_by          varchar(100) not null,
    updated_at          timestamptz,
    updated_by          varchar(100),
    constraint business_document_linked_range check (linked_cents >= 0 and linked_cents <= total_cents),
    constraint business_document_cancel_unlinked check (status = 'ATIVO' or linked_cents = 0)
);

-- Número único por direção, parceiro e série entre os documentos ativos; cancelado libera o número para o registro correto.
create unique index business_document_number_unique on business_document (direction, partner_id, series, number)
    where status = 'ATIVO';
create index business_document_competence on business_document (competence, issue_date);

-- Linhas: descrição, tipo e valor; o total do documento é a soma exata.
create table document_line (
    document_id  uuid         not null references business_document (id),
    seq          integer      not null check (seq >= 1),
    description  varchar(200) not null,
    kind         varchar(10)  not null check (kind in ('PRODUTO', 'SERVICO')),
    amount_cents bigint       not null check (amount_cents > 0),
    primary key (document_id, seq)
);

-- Vínculo documento → parcela, com valor. Desfeito continua consultável; um ativo por par documento/parcela.
create table document_title_link (
    id             uuid primary key,
    document_id    uuid         not null references business_document (id),
    title_id       uuid         not null references financial_title (id),
    amount_cents   bigint       not null check (amount_cents > 0),
    status         varchar(10)  not null check (status in ('ATIVO', 'DESFEITO')),
    removed_reason varchar(500),
    removed_at     timestamptz,
    removed_by     varchar(100),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null
);

create unique index document_title_link_active on document_title_link (document_id, title_id) where status = 'ATIVO';
create index document_title_link_title on document_title_link (title_id);

-- Faturado de cada parcela (Σ vínculos ativos), sob bloqueio: é o que serializa vínculos simultâneos na mesma parcela
-- e a barreira final de PD-023 (faturado nunca passa do valor da parcela).
create table document_title_invoicing (
    title_id      uuid   primary key references financial_title (id),
    limit_cents   bigint not null check (limit_cents > 0),
    invoiced_cents bigint not null default 0,
    constraint document_title_invoicing_range check (invoiced_cents >= 0 and invoiced_cents <= limit_cents)
);
