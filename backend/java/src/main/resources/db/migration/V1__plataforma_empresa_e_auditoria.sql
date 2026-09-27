-- Sprint 1: dados cadastrais da empresa (um CNPJ) e trilha de auditoria.

create table company_profile (
    id           uuid primary key default gen_random_uuid(),
    legal_name   varchar(200),
    trade_name   varchar(200),
    cnpj         char(14) check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
    street       varchar(200),
    number       varchar(20),
    complement   varchar(100),
    district     varchar(100),
    city         varchar(100),
    state        char(2),
    postal_code  char(8) check (postal_code ~ '^[0-9]{8}$'),
    phone        varchar(30),
    email        varchar(200),
    configured   boolean not null default false,
    version      bigint not null default 0 check (version >= 0),
    created_at   timestamptz not null default now(),
    created_by   varchar(100) not null default 'sistema',
    updated_at   timestamptz,
    updated_by   varchar(100),
    constraint company_profile_configured_has_name check (not configured or legal_name is not null)
);

-- Versão inicial: exatamente uma empresa.
create unique index company_profile_single_row on company_profile ((true));
insert into company_profile default values;

create table audit_event (
    id              uuid primary key default gen_random_uuid(),
    occurred_at     timestamptz not null default now(),
    actor           varchar(100) not null,
    action          varchar(100) not null,
    entity_type     varchar(100) not null,
    entity_id       varchar(100) not null,
    entity_version  bigint,
    reason          text,
    changes         jsonb not null default '{}'::jsonb,
    correlation_id  varchar(100)
);

create index audit_event_entity on audit_event (entity_type, entity_id, occurred_at);
