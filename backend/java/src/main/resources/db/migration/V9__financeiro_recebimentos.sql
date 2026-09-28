-- Sprint 5: contas financeiras, recebimentos (liquidações com alocações), estornos e movimentos de caixa.

-- Valor recebido e não estornado do título, mantido sob bloqueio pelo serviço de liquidação. A soma das alocações
-- ativas é a fonte; esta coluna é a barreira final do INV-FT-1 (saldo nunca negativo).
alter table financial_title add column received_cents bigint not null default 0;
alter table financial_title add constraint financial_title_received_range
    check (received_cents >= 0 and received_cents <= original_cents);

create sequence bank_account_code_seq;
create sequence settlement_code_seq;

-- Conta financeira: caixa ou conta bancária, onde o dinheiro entra e sai.
create table bank_account (
    id             uuid primary key,
    code           varchar(20)  not null unique,
    name           varchar(100) not null,
    kind           varchar(10)  not null check (kind in ('CAIXA', 'BANCO')),
    bank           varchar(100),
    agency         varchar(20),
    account_number varchar(30),
    opening_cents  bigint       not null default 0,
    opening_on     date         not null,
    status         varchar(10)  not null check (status in ('ATIVO', 'INATIVO')),
    version        bigint       not null check (version >= 1),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null,
    updated_at     timestamptz,
    updated_by     varchar(100)
);

create unique index bank_account_name_unique on bank_account (lower(name));

-- A empresa começa com o caixa; as contas bancárias são cadastradas pelo Administrador.
insert into bank_account (id, code, name, kind, opening_cents, opening_on, status, version, created_at, created_by)
values ('00000000-0000-0000-0000-00000000ca01', 'CT' || lpad(nextval('bank_account_code_seq')::text, 3, '0'), 'Caixa', 'CAIXA',
        0, date '2026-01-01', 'ATIVO', 1, now(), 'sistema');

-- Liquidação (recebimento ou pagamento): o total é a soma exata das alocações (INV-ST-1; crédito e componentes
-- explícitos ficam para depois — PD-004).
create table settlement (
    id             uuid primary key,
    code           varchar(20)  not null unique,
    direction      varchar(10)  not null check (direction in ('RECEIVABLE', 'PAYABLE')),
    account_id     uuid         not null references bank_account (id),
    counterparty_id uuid        not null references partner (id),
    effective_date date         not null,
    total_cents    bigint       not null check (total_cents > 0),
    credit_cents   bigint       not null default 0 check (credit_cents = 0),
    notes          varchar(500),
    status         varchar(10)  not null check (status in ('POSTED', 'REVERSED')),
    version        bigint       not null check (version >= 1),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null,
    updated_at     timestamptz,
    updated_by     varchar(100)
);

create index settlement_account on settlement (account_id, effective_date);

-- INV-ST-2: cada título aparece uma vez por liquidação.
create table settlement_allocation (
    settlement_id uuid   not null references settlement (id),
    title_id      uuid   not null references financial_title (id),
    amount_cents  bigint not null check (amount_cents > 0),
    primary key (settlement_id, title_id)
);

create index settlement_allocation_title on settlement_allocation (title_id);

-- Movimento de caixa: entrada (positivo) ou saída (negativo) na conta, com data efetiva. O estorno cria o movimento
-- inverso, vinculado ao original; nada é apagado.
create table cash_movement (
    id             uuid primary key,
    account_id     uuid         not null references bank_account (id),
    effective_date date         not null,
    amount_cents   bigint       not null check (amount_cents <> 0),
    kind           varchar(20)  not null check (kind in ('SETTLEMENT', 'SETTLEMENT_REVERSAL')),
    settlement_id  uuid         not null references settlement (id),
    reverses_id    uuid references cash_movement (id),
    description    varchar(200) not null,
    created_at     timestamptz  not null,
    created_by     varchar(100) not null
);

create index cash_movement_account on cash_movement (account_id, effective_date);
-- Um movimento de liquidação e no máximo um estorno por liquidação.
create unique index cash_movement_one_per_kind on cash_movement (settlement_id, kind);

-- Estorno total da liquidação (PD-005); INV-ST-6: um por liquidação.
create table settlement_reversal (
    id               uuid primary key,
    settlement_id    uuid         not null unique references settlement (id),
    reason           varchar(500) not null,
    effective_date   date         not null,
    cash_movement_id uuid         not null references cash_movement (id),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null
);
