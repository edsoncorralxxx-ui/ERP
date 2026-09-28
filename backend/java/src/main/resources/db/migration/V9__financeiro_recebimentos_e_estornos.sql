-- Sprint 5 (B05/B06): recebimento (liquidação) com baixa parcial, estorno total e as contas onde o dinheiro entra.
-- O saldo do título não é gravado: é o original menos as alocações das liquidações não estornadas (INV-FT-1/2).

-- ───────────── Contas financeiras (caixa e bancos) ─────────────
-- Cadastro mínimo: nome, banco e saldo de abertura. Extrato, conciliação e transferências entram com a tela
-- "Contas e conciliação" (Sprint 8+).

create sequence bank_account_code_seq;

create table bank_account (
    id            uuid primary key,
    code          varchar(20)  not null unique,
    name          varchar(120) not null,
    bank          varchar(120),
    opening_cents bigint       not null,
    opening_on    date         not null,
    status        varchar(10)  not null check (status in ('ATIVO', 'INATIVO')),
    version       bigint       not null check (version >= 1),
    created_at    timestamptz  not null,
    created_by    varchar(100) not null,
    updated_at    timestamptz,
    updated_by    varchar(100)
);

create unique index bank_account_name on bank_account (lower(name));

-- Toda empresa tem ao menos o caixa: o primeiro recebimento não depende de cadastrar um banco antes.
insert into bank_account (id, code, name, bank, opening_cents, opening_on, status, version, created_at, created_by)
values (gen_random_uuid(), 'CT' || lpad(nextval('bank_account_code_seq')::text, 3, '0'), 'Caixa', null, 0, current_date, 'ATIVO', 1,
        now(), 'sistema');

-- ───────────── Liquidações (recebimentos) e alocações ─────────────

create sequence settlement_code_seq;

create table settlement (
    id              uuid primary key,
    code            varchar(20)  not null unique,
    direction       varchar(10)  not null check (direction in ('RECEIVABLE', 'PAYABLE')),
    account_id      uuid         not null references bank_account (id),
    -- Um recebimento vem de um único cliente (premissa desta sprint).
    counterparty_id uuid         not null references partner (id),
    effective_date  date         not null,
    total_cents     bigint       not null check (total_cents > 0),
    notes           varchar(500),
    status          varchar(10)  not null check (status in ('POSTED', 'REVERSED')),
    reversal_reason varchar(500),
    reversed_at     timestamptz,
    reversed_by     varchar(100),
    version         bigint       not null check (version >= 1),
    created_at      timestamptz  not null,
    created_by      varchar(100) not null,
    updated_at      timestamptz,
    updated_by      varchar(100),
    -- O estorno é total e guarda quando, quem e por quê (INV-ST-4); a liquidação continua consultável.
    check ((status = 'REVERSED') = (reversed_at is not null and reversal_reason is not null))
);

create index settlement_counterparty on settlement (counterparty_id);

-- INV-ST-2: cada título aparece uma vez por liquidação.
create table settlement_allocation (
    settlement_id uuid   not null references settlement (id),
    title_id      uuid   not null references financial_title (id),
    amount_cents  bigint not null check (amount_cents > 0),
    primary key (settlement_id, title_id)
);

create index settlement_allocation_title on settlement_allocation (title_id);

-- ───────────── Movimentos de caixa ─────────────
-- A entrada do recebimento e, no estorno, o movimento inverso vinculado a ela (nada é apagado).

create table cash_movement (
    id             uuid primary key,
    account_id     uuid         not null references bank_account (id),
    effective_date date         not null,
    amount_cents   bigint       not null check (amount_cents <> 0),
    description    varchar(200) not null,
    settlement_id  uuid         not null references settlement (id),
    reverses_id    uuid references cash_movement (id),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null
);

create index cash_movement_account on cash_movement (account_id, effective_date);
-- Um movimento é estornado no máximo uma vez.
create unique index cash_movement_reversal on cash_movement (reverses_id) where reverses_id is not null;
