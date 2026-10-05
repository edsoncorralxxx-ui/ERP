-- Sprint 13: CRM refeito pelo mock Renda+ ERP MOCK — painel comercial, leads, oportunidades (lista e por etapa),
-- oportunidade com itens de interesse e necessidade do cliente, kanban e atividades com agenda. A "próxima ação" deixa de
-- ser obrigatória: no mock ela é a próxima atividade planejada da oportunidade.

-- Etapas do funil do mock: Prospecção 10%, Qualificação 25%, Visita técnica 40%, Proposta 60%, Negociação 80%.
insert into opportunity_stage (code, name, position, close_percent, version) values ('PROSPECCAO', 'Prospecção', 0, 10, 1);
update opportunity_stage set close_percent = 25, version = version + 1 where code = 'QUALIFICACAO';
update opportunity_stage set close_percent = 40, version = version + 1 where code = 'VISITA_TECNICA';
update opportunity_stage set close_percent = 60, version = version + 1 where code = 'PROPOSTA';
update opportunity_stage set close_percent = 80, version = version + 1 where code = 'NEGOCIACAO';

-- Lead: moagem, pontuação (0 a 100) e o produto de interesse.
alter table lead
    add column daily_capacity_tons integer  check (daily_capacity_tons between 0 and 100000),
    add column score               smallint check (score between 0 and 100),
    add column interest_item       varchar(120);

-- Oportunidade: contato, necessidade do cliente (tipo de indústria, moagem, moegas, local de instalação, energia,
-- implantação desejada, concorrente principal) e os itens de interesse.
alter table opportunity
    add column contact_name varchar(120),
    add column need         jsonb not null default '{}'::jsonb;

create table opportunity_item (
    opportunity_id uuid           not null references opportunity (id) on delete cascade,
    position       smallint       not null,
    item_id        uuid references item (id),
    item_code      varchar(30),
    description    varchar(200)   not null,
    uom            varchar(10)    not null,
    quantity       numeric(19, 6) not null check (quantity > 0),
    unit_price     numeric(19, 6) not null check (unit_price >= 0),
    primary key (opportunity_id, position)
);

-- Observação de cada passagem de etapa (aba Histórico de etapas).
alter table opportunity_stage_change add column note varchar(300);

-- Atividades do CRM (agenda): visita técnica, reunião, ligação, e-mail e tarefa, com dia, hora e duração. "Hoje" e
-- "Atrasada" são calculados; a situação gravada é planejada, concluída ou cancelada.
create table crm_activity (
    id             uuid primary key,
    kind           varchar(14)   not null check (kind in ('VISITA_TECNICA', 'REUNIAO', 'LIGACAO', 'EMAIL', 'TAREFA')),
    subject        varchar(200)  not null,
    day            date          not null,
    start_time     time          not null,
    duration_min   integer       not null default 60 check (duration_min between 5 and 1440),
    partner_id     uuid references partner (id),
    lead_id        uuid references lead (id),
    opportunity_id uuid references opportunity (id) on delete cascade,
    owner          varchar(100)  not null,
    status         varchar(10)   not null default 'PLANEJADA' check (status in ('PLANEJADA', 'CONCLUIDA', 'CANCELADA')),
    notes          varchar(2000),
    completed_at   timestamptz,
    version        bigint        not null default 1 check (version >= 1),
    created_at     timestamptz   not null,
    created_by     varchar(100)  not null,
    updated_at     timestamptz,
    updated_by     varchar(100)
);

create index crm_activity_day on crm_activity (day, start_time);
create index crm_activity_partner on crm_activity (partner_id, day);
create index crm_activity_opportunity on crm_activity (opportunity_id, day);
create index crm_activity_lead on crm_activity (lead_id, day);

-- As interações registradas até aqui viram atividades concluídas (o histórico de contatos continua o mesmo).
insert into crm_activity (id, kind, subject, day, start_time, duration_min, partner_id, lead_id, opportunity_id, owner, status,
                          notes, completed_at, created_at, created_by)
select i.id,
       case i.kind when 'LIGACAO' then 'LIGACAO' when 'EMAIL' then 'EMAIL' when 'WHATSAPP' then 'LIGACAO'
                   when 'VISITA' then 'VISITA_TECNICA' when 'REUNIAO' then 'REUNIAO' else 'TAREFA' end,
       left(i.summary, 200), i.occurred_on, '09:00', 30,
       coalesce(o.customer_id, l.partner_id), i.lead_id, i.opportunity_id, i.created_by, 'CONCLUIDA',
       case when length(i.summary) > 200 then i.summary end, i.created_at, i.created_at, i.created_by
  from crm_interaction i
  left join opportunity o on o.id = i.opportunity_id
  left join lead l on l.id = i.lead_id;

-- Metas de venda por mês (painel comercial): uma meta geral (owner nulo) ou por responsável.
create table sales_target (
    id           uuid primary key,
    month        date         not null check (extract(day from month) = 1),
    owner        varchar(100),
    target_cents bigint       not null check (target_cents >= 0),
    updated_at   timestamptz  not null,
    updated_by   varchar(100) not null
);

create unique index sales_target_month_owner on sales_target (month, coalesce(owner, ''));
