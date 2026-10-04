-- Sprint 13: cadastros refeitos pelo mock Renda+ ERP MOCK (B03). Parceiro com o papel de transportadora e os dados das
-- abas Geral, Pagamento e Fiscal, endereços com tipo e padrão, contatos com principal e NF-e; colaboradores; tabelas
-- auxiliares (marcas, bancos, condições e formas de pagamento, moedas, tipos de documento); item com tipo (produto,
-- material, serviço) e os dados das abas; depósitos, localizações e saldos informados (estoque); calendários e
-- feriados (engenharia); tabelas de preço (comercial); anexos (plataforma).

-- Parceiro ------------------------------------------------------------------------------------------------------------

create sequence carrier_code_seq;

alter table partner_role drop constraint partner_role_role_check;
alter table partner_role alter column role type varchar(14);
alter table partner_role add constraint partner_role_role_check check (role in ('CLIENTE', 'FORNECEDOR', 'TRANSPORTADORA'));

-- Campos da ficha que não têm regra própria: telefones, site, tipo de indústria, moagem, responsável, transportadora
-- padrão, território, origem, observações, bloqueio, inscrição estadual, pagamento, crédito, dados fiscais e retenções.
-- Cada chave é validada pelo domínio (cadastros.domain.Ficha); o histórico mostra cada uma como campo.
alter table partner add column profile jsonb not null default '{}'::jsonb;

alter table partner_unit
    add column kind       varchar(12) not null default 'UNIDADE' check (kind in ('COBRANCA', 'ENTREGA', 'UNIDADE', 'FATURAMENTO')),
    add column is_default boolean     not null default false;

alter table partner_contact
    add column is_primary        boolean not null default false,
    add column receives_invoices boolean not null default false;

-- O primeiro contato de cada parceiro passa a ser o principal.
update partner_contact c set is_primary = true
 where c.position = (select min(x.position) from partner_contact x where x.partner_id = c.partner_id);

-- Colaboradores -------------------------------------------------------------------------------------------------------

create table employee (
    id             uuid primary key,
    code           varchar(20)  not null unique,
    name           varchar(120) not null,
    department     varchar(60),
    job_title      varchar(100),
    cost_center    varchar(60),
    admission_date date,
    email          varchar(200),
    phone          varchar(30),
    status         varchar(10)  not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version        bigint       not null default 1 check (version >= 1),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null,
    updated_at     timestamptz,
    updated_by     varchar(100)
);

create index employee_name on employee (lower(name));

-- Tabelas auxiliares --------------------------------------------------------------------------------------------------

-- Unidades de medida e categorias ganham as colunas da tabela editável do mock.
alter table unit_of_measure
    add column quantity_kind varchar(20) check (quantity_kind in ('QUANTIDADE', 'MASSA', 'COMPRIMENTO', 'AREA', 'VOLUME', 'TEMPO')),
    add column decimals      smallint    not null default 0 check (decimals between 0 and 6);

update unit_of_measure set quantity_kind = case
        when code in ('KG', 'G', 'T') then 'MASSA' when code = 'M' then 'COMPRIMENTO' when code = 'M2' then 'AREA'
        when code in ('M3', 'L') then 'VOLUME' when code = 'H' then 'TEMPO' else 'QUANTIDADE' end,
    decimals = case when code in ('KG', 'G', 'T', 'M', 'M2', 'M3', 'L') then 3 when code = 'H' then 2 else 0 end;

alter table item_category
    add column code       varchar(10) check (code ~ '^[A-Z0-9]{1,10}$'),
    add column parent_name varchar(100),
    add column applies_to varchar(10) check (applies_to in ('PRODUTO', 'MATERIAL', 'SERVICO'));

create unique index item_category_code on item_category (code) where code is not null;

-- Marcas, bancos, condições e formas de pagamento, moedas e tipos de documento: uma linha por registro; as colunas
-- próprias de cada tabela ficam em attrs (validadas pelo domínio, cadastros.domain.TabelaAuxiliar).
create table reference_entry (
    id          uuid primary key,
    table_code  varchar(20)  not null check (table_code in ('MARCA', 'BANCO', 'CONDICAO_PAGAMENTO', 'FORMA_PAGAMENTO', 'MOEDA', 'TIPO_DOCUMENTO')),
    position    integer      not null,
    code        varchar(20)  not null,
    description varchar(120) not null,
    attrs       jsonb        not null default '{}'::jsonb,
    active      boolean      not null default true,
    created_at  timestamptz  not null,
    created_by  varchar(100) not null,
    updated_at  timestamptz,
    updated_by  varchar(100)
);

-- Código único por tabela, menos nos bancos (o código do banco se repete entre contas do mesmo banco).
create unique index reference_entry_code on reference_entry (table_code, code) where table_code <> 'BANCO';
create index reference_entry_table on reference_entry (table_code, position);

-- Versão de cada tabela editável (a tabela inteira é gravada de uma vez, com If-Match).
create table reference_table (
    code       varchar(20) primary key,
    version    bigint      not null default 1 check (version >= 1),
    updated_at timestamptz,
    updated_by varchar(100)
);

insert into reference_table (code) values ('UNIDADE'), ('CATEGORIA'), ('MARCA'), ('BANCO'), ('CONDICAO_PAGAMENTO'),
    ('FORMA_PAGAMENTO'), ('MOEDA'), ('TIPO_DOCUMENTO');

insert into reference_entry (id, table_code, position, code, description, attrs, created_at, created_by) values
    (gen_random_uuid(), 'MOEDA', 0, 'BRL', 'Real', '{"symbol": "R$", "decimals": 2, "local": true}', now(), 'sistema');

-- Item ----------------------------------------------------------------------------------------------------------------

-- Produto (vendável), material (componente) e serviço. Produto e material são a natureza MATERIAL.
alter table item
    add column item_type varchar(10) not null default 'MATERIAL' check (item_type in ('PRODUTO', 'MATERIAL', 'SERVICO')),
    add column profile   jsonb       not null default '{}'::jsonb,
    add constraint item_type_nature check ((item_type = 'SERVICO') = (nature = 'SERVICO'));

update item set item_type = 'SERVICO' where nature = 'SERVICO';

create index item_type on item (item_type, status);

-- Estoque: depósitos, localizações e saldos informados (o módulo de movimentos vem depois) ------------------------------

create table warehouse (
    id          uuid primary key,
    code        varchar(10)  not null unique,
    name        varchar(100) not null,
    kind        varchar(10)  not null check (kind in ('PROPRIO', 'TERCEIROS', 'VIRTUAL')),
    address     varchar(200),
    responsible varchar(120),
    status      varchar(10)  not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    version     bigint       not null default 1 check (version >= 1),
    created_at  timestamptz  not null,
    created_by  varchar(100) not null,
    updated_at  timestamptz,
    updated_by  varchar(100)
);

create table stock_location (
    id                 uuid primary key,
    warehouse_id       uuid          not null references warehouse (id),
    parent_id          uuid references stock_location (id),
    code               varchar(30)   not null unique,
    name               varchar(100)  not null,
    level              varchar(10)   not null check (level in ('AREA', 'RUA', 'ESTANTE', 'POSICAO')),
    capacity_kg        numeric(12, 3) check (capacity_kg >= 0),
    volume_m3          numeric(12, 3) check (volume_m3 >= 0),
    occupancy_percent  numeric(5, 2) check (occupancy_percent between 0 and 100),
    blocked_entry      boolean       not null default false,
    blocked_exit       boolean       not null default false,
    quarantine_only    boolean       not null default false,
    position           integer       not null default 0,
    version            bigint        not null default 1 check (version >= 1),
    created_at         timestamptz   not null,
    created_by         varchar(100)  not null,
    updated_at         timestamptz,
    updated_by         varchar(100)
);

create index stock_location_parent on stock_location (warehouse_id, parent_id, position);

-- Capacidade e ocupação do depósito (raiz da árvore de localizações).
alter table warehouse
    add column capacity_kg       numeric(12, 3) check (capacity_kg >= 0),
    add column volume_m3         numeric(12, 3) check (volume_m3 >= 0),
    add column occupancy_percent numeric(5, 2) check (occupancy_percent between 0 and 100);

create table item_stock_balance (
    id            uuid primary key,
    item_id       uuid           not null references item (id),
    warehouse_id  uuid           not null references warehouse (id),
    location_id   uuid references stock_location (id),
    lot           varchar(40),
    on_hand       numeric(19, 6) not null default 0 check (on_hand >= 0),
    reserved      numeric(19, 6) not null default 0 check (reserved >= 0),
    on_order      numeric(19, 6) not null default 0 check (on_order >= 0),
    average_cost  numeric(19, 6) check (average_cost >= 0),
    updated_at    timestamptz    not null,
    updated_by    varchar(100)   not null
);

create index item_stock_balance_item on item_stock_balance (item_id);
create index item_stock_balance_location on item_stock_balance (location_id);

-- Calendários e feriados (engenharia) ----------------------------------------------------------------------------------

create table work_calendar (
    id           uuid primary key,
    name         varchar(60)  not null unique,
    state        char(2),
    city         varchar(100),
    workdays     varchar(7)   not null default 'SSSSSNN' check (workdays ~ '^[SN]{7}$'),
    start_time   time         not null default '07:30',
    end_time     time         not null default '17:18',
    break_start  time,
    break_end    time,
    position     integer      not null default 0,
    version      bigint       not null default 1 check (version >= 1),
    created_at   timestamptz  not null,
    created_by   varchar(100) not null,
    updated_at   timestamptz,
    updated_by   varchar(100),
    check (start_time < end_time),
    check ((break_start is null) = (break_end is null)),
    check (break_start is null or (break_start < break_end and break_start >= start_time and break_end <= end_time))
);

comment on column work_calendar.workdays is 'Segunda a domingo: S = dia de expediente, N = sem expediente';

create table calendar_holiday (
    id          uuid primary key,
    calendar_id uuid         not null references work_calendar (id) on delete cascade,
    day         date         not null,
    description varchar(120) not null,
    kind        varchar(20)  not null check (kind in ('NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'PONTO_FACULTATIVO', 'EMPRESA')),
    unique (calendar_id, day)
);

insert into work_calendar (id, name, workdays, start_time, end_time, break_start, break_end, position, created_at, created_by)
values (gen_random_uuid(), 'Padrão — fábrica', 'SSSSSNN', '07:30', '17:18', '12:00', '13:00', 0, now(), 'sistema');

-- Tabelas de preço (comercial) -----------------------------------------------------------------------------------------

create table price_list (
    id         uuid primary key,
    code       varchar(20)  not null unique,
    name       varchar(100) not null,
    valid_from date         not null,
    valid_to   date,
    active     boolean      not null default true,
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    check (valid_to is null or valid_to >= valid_from)
);

create table price_list_entry (
    price_list_id uuid          not null references price_list (id) on delete cascade,
    item_id       uuid          not null references item (id),
    price_cents   bigint        not null check (price_cents >= 0),
    updated_at    timestamptz   not null,
    updated_by    varchar(100)  not null,
    primary key (price_list_id, item_id)
);

-- Anexos (plataforma): arquivos guardados no banco, até 10 MB cada (aba Documentos de parceiro e item) ----------------

create table attachment (
    id           uuid primary key,
    owner_entity varchar(30)  not null,
    owner_id     uuid         not null,
    kind         varchar(60)  not null,
    file_name    varchar(200) not null,
    content_type varchar(100) not null,
    size_bytes   integer      not null check (size_bytes between 0 and 10485760),
    content      bytea        not null,
    uploaded_at  timestamptz  not null,
    uploaded_by  varchar(100) not null
);

create index attachment_owner on attachment (owner_entity, owner_id, uploaded_at);
