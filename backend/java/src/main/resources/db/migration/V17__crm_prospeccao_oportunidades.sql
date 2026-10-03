-- Sprint 11 (B05): CRM — prospecção, interações, oportunidades com etapas do funil e ligação com as propostas.
-- Desenho inspirado no SAP Business One: etapas com percentual de fechamento editável, valor ponderado, histórico de
-- etapas e concorrentes na oportunidade. O responsável é o nome de usuário (app_user.username), sem chave estrangeira.

-- ───────────── Prospecção ─────────────

create sequence lead_code_seq;

create table lead (
    id                uuid primary key,
    code              varchar(20)  not null unique,
    company_name      varchar(200) not null,
    trade_name        varchar(200),
    city              varchar(120),
    state             char(2),
    has_renda         varchar(12)  not null check (has_renda in ('SIM', 'NAO', 'DESCONHECIDO')),
    -- Vazio é desconhecido, nunca zero estrelas (formulário "prospeccao" do B01).
    rating            smallint check (rating between 1 and 5),
    stage             varchar(12)  not null check (stage in ('IDENTIFICADO', 'CONTATADO', 'INTERESSADO', 'DESCARTADO')),
    discard_reason    varchar(500),
    owner             varchar(100) not null,
    source            varchar(20)  not null,
    contact_name      varchar(120),
    contact_phone     varchar(40),
    contact_email     varchar(200),
    notes             varchar(2000),
    partner_id        uuid references partner (id),
    next_action_date  date,
    next_action_note  varchar(300),
    last_interaction  date,
    import_id         uuid,
    version           bigint       not null check (version >= 1),
    created_at        timestamptz  not null,
    created_by        varchar(100) not null,
    updated_at        timestamptz,
    updated_by        varchar(100),
    check (stage <> 'DESCARTADO' or discard_reason is not null)
);

create index lead_partner on lead (partner_id);
create index lead_next_action on lead (next_action_date);

-- ───────────── Etapas do funil (configuráveis, como no SAP B1) ─────────────

create table opportunity_stage (
    code          varchar(20)  primary key,
    name          varchar(60)  not null,
    position      smallint     not null unique,
    -- Percentual de fechamento: valor ponderado = potencial × percentual.
    close_percent numeric(5,2) not null check (close_percent >= 0 and close_percent <= 100),
    version       bigint       not null check (version >= 1),
    updated_at    timestamptz,
    updated_by    varchar(100)
);

insert into opportunity_stage (code, name, position, close_percent, version) values
    ('QUALIFICACAO', 'Qualificação', 1, 10, 1),
    ('VISITA_TECNICA', 'Visita técnica', 2, 25, 1),
    ('PROPOSTA', 'Proposta', 3, 50, 1),
    ('NEGOCIACAO', 'Negociação', 4, 75, 1);

-- ───────────── Oportunidades ─────────────

create sequence opportunity_code_seq;

create table opportunity (
    id                uuid primary key,
    code              varchar(20)  not null unique,
    name              varchar(200) not null,
    lead_id           uuid references lead (id),
    customer_id       uuid references partner (id),
    unit_id           uuid,
    unit_name         varchar(120),
    owner             varchar(100) not null,
    source            varchar(20)  not null,
    interest          varchar(10)  not null check (interest in ('BAIXO', 'MEDIO', 'ALTO')),
    potential_cents   bigint       not null check (potential_cents >= 0),
    expected_close    date,
    stage             varchar(20)  not null references opportunity_stage (code),
    status            varchar(10)  not null check (status in ('ABERTA', 'GANHA', 'PERDIDA')),
    loss_reason       varchar(20) check (loss_reason in ('PRECO', 'PRAZO', 'CONCORRENTE', 'SEM_ORCAMENTO', 'DESISTIU', 'OUTRO')),
    loss_note         varchar(500),
    closed_at         timestamptz,
    won_order_code    varchar(20),
    next_action_date  date,
    next_action_note  varchar(300),
    last_interaction  date,
    notes             varchar(2000),
    version           bigint       not null check (version >= 1),
    created_at        timestamptz  not null,
    created_by        varchar(100) not null,
    updated_at        timestamptz,
    updated_by        varchar(100),
    check (lead_id is not null or customer_id is not null),
    check (status <> 'PERDIDA' or loss_reason is not null),
    check (loss_reason <> 'OUTRO' or loss_note is not null)
);

create index opportunity_lead on opportunity (lead_id);
create index opportunity_customer on opportunity (customer_id);
create index opportunity_next_action on opportunity (next_action_date);

-- Aba "Etapas" do SAP B1: cada passagem por uma etapa, com o percentual e os valores da data.
create table opportunity_stage_change (
    id              uuid primary key,
    opportunity_id  uuid         not null references opportunity (id) on delete cascade,
    from_stage      varchar(20),
    to_stage        varchar(20)  not null,
    -- ABERTA na passagem entre etapas; GANHA ou PERDIDA no fechamento.
    status          varchar(10)  not null check (status in ('ABERTA', 'GANHA', 'PERDIDA')),
    close_percent   numeric(5,2) not null,
    potential_cents bigint       not null,
    weighted_cents  bigint       not null,
    changed_at      timestamptz  not null,
    changed_by      varchar(100) not null
);

create index opportunity_stage_change_opp on opportunity_stage_change (opportunity_id, changed_at);

create table opportunity_competitor (
    opportunity_id uuid         not null references opportunity (id) on delete cascade,
    position       smallint     not null,
    name           varchar(120) not null,
    threat         varchar(10)  not null check (threat in ('BAIXA', 'MEDIA', 'ALTA')),
    notes          varchar(300),
    primary key (opportunity_id, position)
);

-- ───────────── Interações (atividades do SAP B1) ─────────────

create table crm_interaction (
    id               uuid primary key,
    lead_id          uuid references lead (id),
    opportunity_id   uuid references opportunity (id) on delete cascade,
    kind             varchar(10)  not null check (kind in ('LIGACAO', 'EMAIL', 'WHATSAPP', 'VISITA', 'REUNIAO', 'NOTA')),
    occurred_on      date         not null,
    contact_name     varchar(120),
    summary          varchar(2000) not null,
    next_action_date date,
    next_action_note varchar(300),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null,
    check (lead_id is not null or opportunity_id is not null)
);

create index crm_interaction_lead on crm_interaction (lead_id, occurred_on);
create index crm_interaction_opportunity on crm_interaction (opportunity_id, occurred_on);

-- ───────────── Carga da lista de prospecção ─────────────

create table lead_import (
    id           uuid primary key,
    file_hash    char(64)     not null unique,
    file_name    varchar(200),
    status       varchar(12)  not null check (status in ('PREVIA', 'CONFIRMADA')),
    content      text         not null,
    created_at   timestamptz  not null,
    created_by   varchar(100) not null,
    confirmed_at timestamptz,
    confirmed_by varchar(100)
);

alter table lead add constraint lead_import_fk foreign key (import_id) references lead_import (id);

-- ───────────── Propostas pertencem a uma oportunidade ─────────────

alter table proposal add column opportunity_id uuid references opportunity (id);

-- Cada proposta existente ganha a sua oportunidade, na etapa Proposta, com o total da revisão vigente como potencial. As
-- abertas ficam sem próxima ação (pendência na Agenda) em vez de uma data inventada.
create temporary table proposal_opportunity on commit drop as
select pp.id as proposal_id, gen_random_uuid() as opportunity_id,
       row_number() over (order by pp.code) as n
  from proposal pp;

insert into opportunity (id, code, name, customer_id, unit_id, unit_name, owner, source, interest, potential_cents,
                         expected_close, stage, status, loss_reason, loss_note, closed_at, next_action_date, next_action_note,
                         version, created_at, created_by, updated_at, updated_by)
select po.opportunity_id, 'OP' || lpad(po.n::text, 5, '0'), pp.title, pp.customer_id, pp.unit_id, pp.unit_name,
       pp.created_by, 'OUTRO', 'MEDIO', r.total_cents, r.valid_until,
       'PROPOSTA', pp.status,
       case when pp.status = 'PERDIDA' then 'OUTRO' end,
       case when pp.status = 'PERDIDA' then coalesce(pp.outcome_reason, 'Proposta perdida antes do CRM') end,
       case when pp.status <> 'ABERTA' then coalesce(pp.updated_at, pp.created_at) end,
       null, null, 1, pp.created_at, pp.created_by, pp.updated_at, pp.updated_by
  from proposal_opportunity po
  join proposal pp on pp.id = po.proposal_id
  join proposal_revision r on r.proposal_id = pp.id and r.revision = pp.current_revision;

select setval('opportunity_code_seq', greatest((select count(*) from proposal_opportunity), 1),
              (select count(*) from proposal_opportunity) > 0);

update opportunity o set won_order_code = so.code
  from proposal_opportunity po join sales_order so on so.proposal_id = po.proposal_id and so.status <> 'CANCELLED'
 where o.id = po.opportunity_id and o.status = 'GANHA';

insert into opportunity_stage_change (id, opportunity_id, from_stage, to_stage, status, close_percent, potential_cents,
                                      weighted_cents, changed_at, changed_by)
select gen_random_uuid(), o.id, null, 'PROPOSTA', 'ABERTA', 50, o.potential_cents,
       round(o.potential_cents * 0.5), o.created_at, o.created_by
  from opportunity o;

insert into opportunity_stage_change (id, opportunity_id, from_stage, to_stage, status, close_percent, potential_cents,
                                      weighted_cents, changed_at, changed_by)
select gen_random_uuid(), o.id, 'PROPOSTA', 'PROPOSTA', o.status, case when o.status = 'GANHA' then 100 else 0 end,
       o.potential_cents, case when o.status = 'GANHA' then o.potential_cents else 0 end, o.closed_at,
       coalesce(o.updated_by, o.created_by)
  from opportunity o where o.status <> 'ABERTA';

update proposal pp set opportunity_id = po.opportunity_id
  from proposal_opportunity po where po.proposal_id = pp.id;

alter table proposal alter column opportunity_id set not null;
create index proposal_opportunity on proposal (opportunity_id);
