-- Sprint 2 (S2-07): parceiros no papel de cliente, com unidades e contatos.

create sequence customer_code_seq;

create table partner (
    id          uuid primary key default gen_random_uuid(),
    code        varchar(20) not null unique,
    legal_name  varchar(200) not null,
    trade_name  varchar(200),
    cnpj        char(14) check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
    group_name  varchar(100),
    is_customer boolean not null default true,
    status      varchar(10) not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version     bigint not null default 1 check (version >= 1),
    created_at  timestamptz not null,
    created_by  varchar(100) not null,
    updated_at  timestamptz,
    updated_by  varchar(100)
);

-- CNPJ único por empresa quando informado; ausente não é inventado.
create unique index partner_cnpj on partner (cnpj) where cnpj is not null;
create index partner_legal_name on partner (lower(legal_name));

create table partner_unit (
    id          uuid primary key,
    partner_id  uuid not null references partner (id) on delete cascade,
    position    integer not null,
    name        varchar(120) not null,
    street      varchar(200),
    number      varchar(20),
    district    varchar(100),
    city        varchar(100),
    state       char(2),
    postal_code char(8) check (postal_code ~ '^[0-9]{8}$')
);

create index partner_unit_partner on partner_unit (partner_id, position);

create table partner_contact (
    id         uuid primary key,
    partner_id uuid not null references partner (id) on delete cascade,
    position   integer not null,
    name       varchar(120) not null,
    role       varchar(100),
    phone      varchar(30),
    email      varchar(200)
);

create index partner_contact_partner on partner_contact (partner_id, position);
