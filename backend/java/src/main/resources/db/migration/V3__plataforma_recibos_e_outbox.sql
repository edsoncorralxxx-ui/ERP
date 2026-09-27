-- Sprint 2 (US-205, US-206): recibo de comando para idempotência e outbox de eventos na mesma transação.

create table command_receipt (
    actor           varchar(100) not null,
    idempotency_key varchar(100) not null,
    command         varchar(100) not null,
    request_hash    char(64) not null,
    resource_id     varchar(100),
    created_at      timestamptz not null default now(),
    primary key (actor, idempotency_key)
);

create table outbox_event (
    id             uuid primary key default gen_random_uuid(),
    event_type     varchar(100) not null,
    aggregate_type varchar(100) not null,
    aggregate_id   varchar(100) not null,
    payload        jsonb not null,
    occurred_at    timestamptz not null,
    actor          varchar(100) not null,
    correlation_id varchar(100),
    published_at   timestamptz
);

create index outbox_event_pending on outbox_event (occurred_at) where published_at is null;

-- Registro de consumo: um evento é processado uma única vez por consumidor.
create table event_consumption (
    consumer    varchar(100) not null,
    event_id    uuid not null references outbox_event (id),
    consumed_at timestamptz not null default now(),
    primary key (consumer, event_id)
);

-- Fatos operacionais: o que aconteceu, quando e com qual registro (base dos indicadores).
create table operational_fact (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid not null unique references outbox_event (id),
    fact_type   varchar(100) not null,
    entity_type varchar(100) not null,
    entity_id   varchar(100) not null,
    occurred_at timestamptz not null,
    actor       varchar(100) not null
);

create index operational_fact_type on operational_fact (fact_type, occurred_at);
