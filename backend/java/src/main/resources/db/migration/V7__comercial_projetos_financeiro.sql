-- Sprint 4 (B05): proposta → pedido confirmado → projeto, equipamentos e parcelas a receber.
-- Cada módulo grava só as suas tabelas; as referências a outro módulo são ids (partner, item) ou origem opaca.
-- A unidade do cliente é guardada pelo id e pelo nome da época, sem chave estrangeira: a ficha do cliente regrava as
-- suas unidades a cada alteração.

-- ───────────── Comercial: propostas ─────────────

create sequence proposal_code_seq;

create table proposal (
    id               uuid primary key,
    code             varchar(20)  not null unique,
    customer_id      uuid         not null references partner (id),
    unit_id          uuid,
    unit_name        varchar(120),
    title            varchar(200) not null,
    status           varchar(10)  not null check (status in ('ABERTA', 'GANHA', 'PERDIDA')),
    outcome_reason   varchar(500),
    current_revision integer      not null check (current_revision >= 1),
    version          bigint       not null check (version >= 1),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null,
    updated_at       timestamptz,
    updated_by       varchar(100)
);

create index proposal_customer on proposal (customer_id);

create table proposal_revision (
    id            uuid primary key,
    proposal_id   uuid        not null references proposal (id) on delete cascade,
    revision      integer     not null check (revision >= 1),
    status        varchar(10) not null check (status in ('RASCUNHO', 'EMITIDA')),
    valid_until   date        not null,
    payment_terms varchar(500),
    total_cents   bigint      not null check (total_cents >= 0),
    issued_at     timestamptz,
    issued_by     varchar(100),
    unique (proposal_id, revision),
    -- Revisão emitida é imutável e sabe quando e por quem foi emitida.
    check ((status = 'EMITIDA') = (issued_at is not null))
);

-- Linhas comerciais (proposta e pedido): quantidade e preço com até 6 casas (PD-007), valores em centavos.
create table proposal_line (
    id               uuid primary key,
    revision_id      uuid           not null references proposal_revision (id) on delete cascade,
    position         integer        not null,
    kind             varchar(12)    not null check (kind in ('EQUIPAMENTO', 'MATERIAL', 'SERVICO')),
    item_id          uuid references item (id),
    description      varchar(200)   not null,
    quantity         numeric(19, 6) not null check (quantity > 0),
    uom              varchar(10)    not null,
    unit_price       numeric(19, 6) not null check (unit_price >= 0),
    discount_cents   bigint         not null check (discount_cents >= 0),
    line_total_cents bigint         not null check (line_total_cents >= 0)
);

create index proposal_line_revision on proposal_line (revision_id, position);

-- ───────────── Comercial: pedidos ─────────────

create sequence sales_order_code_seq;

create table sales_order (
    id                   uuid primary key,
    code                 varchar(20)  not null unique,
    customer_id          uuid         not null references partner (id),
    unit_id              uuid         not null,
    unit_name            varchar(120) not null,
    proposal_id          uuid references proposal (id),
    proposal_revision    integer,
    contract_date        date         not null,
    promised_date        date,
    notes                varchar(1000),
    status               varchar(12)  not null check (status in ('DRAFT', 'CONFIRMED', 'IN_EXECUTION', 'COMPLETED', 'CANCELLED')),
    total_cents          bigint       not null check (total_cents >= 0),
    confirmed_at         timestamptz,
    confirmed_by         varchar(100),
    snapshot_hash        char(64),
    project_id           uuid,
    cancelled_at         timestamptz,
    cancelled_by         varchar(100),
    cancel_reason        varchar(500),
    version              bigint       not null check (version >= 1),
    created_at           timestamptz  not null,
    created_by           varchar(100) not null,
    updated_at           timestamptz,
    updated_by           varchar(100),
    -- A confirmação acontece uma única vez e guarda quando, quem e o retrato das linhas e parcelas (INV-SO-5).
    check ((confirmed_at is null) = (snapshot_hash is null))
);

create index sales_order_customer on sales_order (customer_id);
-- Uma proposta vira no máximo um pedido em aberto (cancelado libera a conversão de novo).
create unique index sales_order_proposal on sales_order (proposal_id) where proposal_id is not null and status <> 'CANCELLED';

create table sales_order_line (
    id               uuid primary key,
    order_id         uuid           not null references sales_order (id) on delete cascade,
    position         integer        not null,
    kind             varchar(12)    not null check (kind in ('EQUIPAMENTO', 'MATERIAL', 'SERVICO')),
    item_id          uuid references item (id),
    description      varchar(200)   not null,
    quantity         numeric(19, 6) not null check (quantity > 0),
    uom              varchar(10)    not null,
    unit_price       numeric(19, 6) not null check (unit_price >= 0),
    discount_cents   bigint         not null check (discount_cents >= 0),
    line_total_cents bigint         not null check (line_total_cents >= 0)
);

create index sales_order_line_order on sales_order_line (order_id, position);

create table sales_order_installment (
    order_id     uuid         not null references sales_order (id) on delete cascade,
    seq          integer      not null check (seq >= 1),
    due_date     date         not null,
    amount_cents bigint       not null check (amount_cents > 0),
    milestone    varchar(200),
    primary key (order_id, seq)
);

-- ───────────── Projetos e equipamentos ─────────────

create sequence project_code_seq;

create table project (
    id                uuid primary key,
    code              varchar(20)  not null unique,
    name              varchar(200) not null,
    -- Origem: o pedido que criou o projeto (premissa PD-001: um projeto por pedido confirmado).
    order_id          uuid         not null unique,
    order_code        varchar(20)  not null,
    customer_id       uuid         not null references partner (id),
    unit_id           uuid         not null,
    unit_name         varchar(120) not null,
    stage             varchar(12)  not null check (stage in ('PLANEJADO', 'ENGENHARIA', 'SUPRIMENTOS', 'PRODUCAO', 'INSTALACAO', 'ACEITO', 'ENCERRADO')),
    contract_delivery date,
    contract_cents    bigint       not null check (contract_cents >= 0),
    closed_reason     varchar(500),
    version           bigint       not null check (version >= 1),
    created_at        timestamptz  not null,
    created_by        varchar(100) not null,
    updated_at        timestamptz,
    updated_by        varchar(100)
);

create index project_customer on project (customer_id);

create sequence equipment_code_seq;

create table equipment (
    id             uuid primary key,
    code           varchar(20)  not null unique,
    project_id     uuid         not null references project (id),
    order_line_id  uuid         not null,
    line_seq       integer      not null check (line_seq >= 1),
    model          varchar(200) not null,
    item_id        uuid references item (id),
    customer_id    uuid         not null references partner (id),
    unit_id        uuid         not null,
    unit_name      varchar(120) not null,
    serial_number  varchar(60),
    notes          varchar(1000),
    status         varchar(10)  not null check (status in ('ATIVO', 'CANCELADO')),
    -- Aceite e garantia vêm do aceite registrado, nunca da previsão (PD-015); ficam vazios até a instalação.
    accepted_on    date,
    warranty_start date,
    version        bigint       not null check (version >= 1),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null,
    updated_at     timestamptz,
    updated_by     varchar(100),
    -- Um equipamento por unidade da linha do pedido: a confirmação repetida não cria outro.
    unique (order_line_id, line_seq)
);

create index equipment_project on equipment (project_id);
-- Série, quando informada, é única por modelo.
create unique index equipment_serial on equipment (lower(model), serial_number) where serial_number is not null;

-- ───────────── Financeiro: títulos a receber ─────────────

create sequence receivable_code_seq;

create table financial_title (
    id              uuid primary key,
    code            varchar(20)  not null unique,
    direction       varchar(10)  not null check (direction in ('RECEIVABLE', 'PAYABLE')),
    counterparty_id uuid         not null references partner (id),
    origin_type     varchar(40)  not null,
    origin_id       varchar(100) not null,
    origin_label    varchar(200) not null,
    project_id      uuid,
    category        varchar(60)  not null,
    competence      char(7)      not null check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    issue_date      date         not null,
    due_date        date         not null,
    original_cents  bigint       not null check (original_cents > 0),
    lifecycle       varchar(12)  not null check (lifecycle in ('ACTIVE', 'RENEGOTIATED', 'CANCELLED')),
    cancel_reason   varchar(500),
    version         bigint       not null check (version >= 1),
    created_at      timestamptz  not null,
    created_by      varchar(100) not null,
    updated_at      timestamptz,
    updated_by      varchar(100),
    -- INV-FT-3: um título por origem, mesmo com chaves de idempotência diferentes.
    unique (origin_type, origin_id)
);

create index financial_title_project on financial_title (project_id);
create index financial_title_due on financial_title (direction, lifecycle, due_date);
