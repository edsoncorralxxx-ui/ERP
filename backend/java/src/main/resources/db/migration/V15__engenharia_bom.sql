-- Sprint 10: BOM — composição de custos por modelo e por equipamento (B07, módulo engenharia).

-- ───────────── Projetos: modelos de equipamento ─────────────

create sequence equipment_model_code_seq;

create table equipment_model (
    id         uuid primary key,
    code       varchar(20)  not null unique,
    name       varchar(200) not null,
    status     varchar(10)  not null check (status in ('ATIVO', 'INATIVO')),
    version    bigint       not null check (version >= 1),
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    updated_at timestamptz,
    updated_by varchar(100)
);

create unique index equipment_model_name on equipment_model (lower(name));

-- O texto livre do modelo dos equipamentos já vendidos vira modelo (decisão do PO em 01/10/2026): textos iguais, sem
-- diferenciar maiúsculas nem espaços repetidos, ficam no mesmo modelo. A lista aparece em Modelos para conferência.
insert into equipment_model (id, code, name, status, version, created_at, created_by)
select gen_random_uuid(), 'MD' || lpad(nextval('equipment_model_code_seq')::text, 5, '0'), name, 'ATIVO', 1, now(), 'sistema'
  from (select min(regexp_replace(btrim(model), '\s+', ' ', 'g')) as name
          from equipment
         group by lower(regexp_replace(btrim(model), '\s+', ' ', 'g'))
         order by 1) m;

alter table equipment add column model_id uuid references equipment_model (id);

update equipment e set model_id = m.id
  from equipment_model m
 where lower(m.name) = lower(regexp_replace(btrim(e.model), '\s+', ' ', 'g'));

alter table equipment alter column model_id set not null;

create index equipment_model_ref on equipment (model_id);

-- ───────────── Cadastros: código de referência do item ─────────────

-- Código do desenho, do fabricante ou gerado na carga da BOM (MEC-0001, ELE-0001). Serve para reconhecer o item numa
-- nova carga; o código do item no Renda+ continua o do sistema (P00001, S00001).
create table item_reference_code (
    reference_code varchar(60) not null,
    item_id        uuid        not null references item (id),
    created_at     timestamptz not null,
    created_by     varchar(100) not null
);

create unique index item_reference_code_unique on item_reference_code (lower(reference_code));
create index item_reference_code_item on item_reference_code (item_id);

-- ───────────── Engenharia: BOM, revisões e linhas ─────────────

create sequence bom_code_seq;

-- Uma BOM é a do modelo (model_id preenchido, uma por modelo) ou uma submontagem reaproveitável (sem modelo).
create table bom (
    id         uuid primary key,
    code       varchar(20)  not null unique,
    name       varchar(200) not null,
    model_id   uuid references equipment_model (id),
    version    bigint       not null check (version >= 1),
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    updated_at timestamptz,
    updated_by varchar(100)
);

create unique index bom_name on bom (lower(name));
create unique index bom_model on bom (model_id) where model_id is not null;

create table bom_import (
    id           uuid primary key,
    file_name    varchar(200) not null,
    file_hash    char(64)     not null unique,
    content      text         not null,
    product      varchar(200) not null,
    status       varchar(10)  not null check (status in ('PREVIEW', 'CONFIRMED')),
    revision_id  uuid,
    created_at   timestamptz  not null,
    created_by   varchar(100) not null,
    confirmed_at timestamptz,
    confirmed_by varchar(100)
);

create table bom_revision (
    id                   uuid primary key,
    bom_id               uuid         not null references bom (id),
    revision             integer      not null check (revision >= 0),
    status               varchar(10)  not null check (status in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
    based_on_id          uuid references bom_revision (id),
    informed_total_cents bigint check (informed_total_cents >= 0),
    notes                varchar(500),
    import_id            uuid references bom_import (id),
    approved_at          timestamptz,
    approved_by          varchar(100),
    version              bigint       not null check (version >= 1),
    created_at           timestamptz  not null,
    created_by           varchar(100) not null,
    updated_at           timestamptz,
    updated_by           varchar(100),
    unique (bom_id, revision),
    check (status = 'DRAFT' or approved_at is not null)
);

-- Uma revisão em rascunho por BOM.
create unique index bom_revision_one_draft on bom_revision (bom_id) where status = 'DRAFT';

alter table bom_import add constraint bom_import_revision foreign key (revision_id) references bom_revision (id);

-- Linha de item (item do cadastro com custo digitado) ou de submontagem (a revisão escolhida de outra BOM).
create table bom_line (
    id                uuid primary key,
    revision_id       uuid           not null references bom_revision (id) on delete cascade,
    position          integer        not null check (position >= 1),
    kind              varchar(12)    not null check (kind in ('ITEM', 'SUBASSEMBLY')),
    item_id           uuid references item (id),
    child_revision_id uuid references bom_revision (id),
    reference_code    varchar(60),
    description       varchar(200)   not null,
    -- Vazia só no rascunho: bloqueia a aprovação, nunca vale zero.
    quantity          numeric(19, 6) check (quantity > 0),
    uom               varchar(10)    not null references unit_of_measure (code),
    unit_cost         numeric(19, 6) check (unit_cost >= 0),
    category          varchar(100),
    supplier          varchar(120),
    material          varchar(120),
    notes             varchar(500),
    unique (revision_id, position),
    check ((kind = 'ITEM' and item_id is not null and child_revision_id is null)
        or (kind = 'SUBASSEMBLY' and child_revision_id is not null and item_id is null and unit_cost is null))
);

create index bom_line_child on bom_line (child_revision_id) where child_revision_id is not null;

-- ───────────── Engenharia: BOM do equipamento ─────────────

-- Cópia congelada da revisão aplicada; os ajustes do equipamento não mudam o modelo.
create table equipment_bom (
    id           uuid primary key,
    equipment_id uuid         not null unique references equipment (id),
    revision_id  uuid         not null references bom_revision (id),
    version      bigint       not null check (version >= 1),
    applied_at   timestamptz  not null,
    applied_by   varchar(100) not null,
    updated_at   timestamptz,
    updated_by   varchar(100)
);

create table equipment_bom_line (
    id                uuid primary key,
    equipment_bom_id  uuid           not null references equipment_bom (id) on delete cascade,
    parent_id         uuid references equipment_bom_line (id) on delete cascade,
    position          integer        not null check (position >= 1),
    kind              varchar(12)    not null check (kind in ('ITEM', 'SUBASSEMBLY')),
    item_id           uuid references item (id),
    child_revision_id uuid references bom_revision (id),
    reference_code    varchar(60),
    description       varchar(200)   not null,
    quantity          numeric(19, 6) check (quantity > 0),
    uom               varchar(10)    not null,
    unit_cost         numeric(19, 6) check (unit_cost >= 0),
    category          varchar(100),
    supplier          varchar(120),
    material          varchar(120),
    notes             varchar(500),
    -- Como veio da revisão do modelo (vazio nas linhas incluídas no equipamento), para mostrar a diferença.
    origin            varchar(10)    not null check (origin in ('MODEL', 'ADJUSTMENT')),
    model_quantity    numeric(19, 6),
    model_unit_cost   numeric(19, 6),
    status            varchar(10)    not null check (status in ('ACTIVE', 'REMOVED')),
    adjustment_reason varchar(500),
    check ((kind = 'ITEM' and item_id is not null) or (kind = 'SUBASSEMBLY' and item_id is null and unit_cost is null))
);

create index equipment_bom_line_bom on equipment_bom_line (equipment_bom_id, parent_id, position);
