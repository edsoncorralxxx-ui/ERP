-- Sprint 3 (S3-03, S3-04): unidades de medida, categorias de item, materiais e serviços e conversões de unidade.

create table unit_of_measure (
    code       varchar(10) primary key check (code ~ '^[A-Z0-9]{1,10}$'),
    name       varchar(60) not null,
    status     varchar(10) not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version    bigint      not null default 1 check (version >= 1),
    created_at timestamptz not null default now(),
    created_by varchar(100) not null default 'sistema',
    updated_at timestamptz,
    updated_by varchar(100)
);

-- Lista inicial (decisão do PO no planning da Sprint 3); o Administrador inclui as demais.
insert into unit_of_measure (code, name) values
    ('UN', 'Unidade'), ('PC', 'Peça'), ('CJ', 'Conjunto'), ('KG', 'Quilograma'), ('G', 'Grama'), ('T', 'Tonelada'),
    ('M', 'Metro'), ('M2', 'Metro quadrado'), ('M3', 'Metro cúbico'), ('L', 'Litro'), ('H', 'Hora');

create table item_category (
    id         uuid primary key,
    name       varchar(100) not null,
    status     varchar(10)  not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version    bigint       not null default 1 check (version >= 1),
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    updated_at timestamptz,
    updated_by varchar(100)
);

create unique index item_category_name on item_category (lower(name));

-- Categorias que o fornecedor fornece.
create table partner_supplied_category (
    partner_id  uuid    not null references partner (id) on delete cascade,
    category_id uuid    not null references item_category (id),
    position    integer not null,
    primary key (partner_id, category_id)
);

create sequence material_code_seq;
create sequence service_code_seq;

create table item (
    id               uuid primary key,
    code             varchar(20)  not null unique,
    description      varchar(200) not null,
    nature           varchar(10)  not null check (nature in ('MATERIAL', 'SERVICO')),
    uom_code         varchar(10)  not null references unit_of_measure (code),
    category_id      uuid         not null references item_category (id),
    stock_controlled boolean      not null,
    reference_cost   numeric(19, 6) check (reference_cost >= 0),
    status           varchar(10)  not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version          bigint       not null default 1 check (version >= 1),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null,
    updated_at       timestamptz,
    updated_by       varchar(100),
    -- Serviço não controla estoque físico (formulário "materiais").
    check (nature = 'MATERIAL' or not stock_controlled)
);

create index item_description on item (lower(description));

-- 1 unidade de compra (from_uom) = factor unidades do item.
create table item_conversion (
    id       uuid primary key,
    item_id  uuid           not null references item (id) on delete cascade,
    position integer        not null,
    from_uom varchar(10)    not null references unit_of_measure (code),
    factor   numeric(19, 6) not null check (factor > 0),
    unique (item_id, from_uom)
);
