-- Sprint 12: fiscal refeito pelo mock (B10). Receita e cálculo por anexo (I a V) com a repartição dos tributos, histórico
-- de receita anterior ao Renda+, guia DAS no lugar da conferência do contador, transmissão do PGDAS-D registrada,
-- fechamento por etapas, obrigações, classificação fiscal dos itens e dados da empresa no Simples.

-- Competência: "Aberta/Fechada" passa a "Em apuração/Encerrada".
alter table tax_period drop constraint tax_period_status_check;
alter table tax_period alter column status type varchar(12);
update tax_period set status = case status when 'FECHADA' then 'ENCERRADA' else 'EM_APURACAO' end;
alter table tax_period add constraint tax_period_status_check check (status in ('EM_APURACAO', 'ENCERRADA'));

-- Parâmetros por anexo: {"II": {"taxes": ["IRPJ", ...], "brackets": [{"upToCents", "rate", "deductionCents", "shares": [...]}]}}.
-- "shares" é a repartição da faixa, em frações na ordem de "taxes" (vazia quando a repartição não foi cadastrada).
alter table tax_parameter_revision add column annexes jsonb;
alter table tax_parameter_revision alter column product_annex drop not null;
alter table tax_parameter_revision alter column service_annex drop not null;
alter table tax_parameter_revision alter column brackets drop not null;

-- Revisões antigas (só produto e serviço): o anexo de cada tipo recebe as faixas dele, sem repartição.
update tax_parameter_revision r
   set annexes = jsonb_build_object(
           r.product_annex, jsonb_build_object('taxes', '[]'::jsonb, 'brackets',
               (select jsonb_agg(b || jsonb_build_object('shares', '[]'::jsonb)) from jsonb_array_elements(r.brackets -> 'PRODUTO') b)),
           r.service_annex, jsonb_build_object('taxes', '[]'::jsonb, 'brackets',
               (select jsonb_agg(b || jsonb_build_object('shares', '[]'::jsonb)) from jsonb_array_elements(r.brackets -> 'SERVICO') b)))
 where r.annexes is null;

alter table tax_parameter_revision alter column annexes set not null;

-- Revisão 2: tabelas da LC 123/2006 dos anexos I a V, com a repartição dos anexos I, II e III (mock "Tabelas e
-- parâmetros do Simples Nacional", Sprint 12). II e III com os mesmos números da revisão 1.
insert into tax_parameter_revision (id, revision, regime, valid_from, annexes, source, notes, created_at, created_by)
values (gen_random_uuid(), 2, 'SIMPLES_NACIONAL', '2026-09', '{
  "I": {"taxes": ["IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "ICMS"], "brackets": [
    {"upToCents": "18000000",  "rate": "0.04",  "deductionCents": "0",        "shares": ["0.055", "0.035", "0.1274", "0.0276", "0.415", "0.34"]},
    {"upToCents": "36000000",  "rate": "0.073", "deductionCents": "594000",   "shares": ["0.055", "0.035", "0.1274", "0.0276", "0.415", "0.34"]},
    {"upToCents": "72000000",  "rate": "0.095", "deductionCents": "1386000",  "shares": ["0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"]},
    {"upToCents": "180000000", "rate": "0.107", "deductionCents": "2250000",  "shares": ["0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"]},
    {"upToCents": "360000000", "rate": "0.143", "deductionCents": "8730000",  "shares": ["0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"]},
    {"upToCents": "480000000", "rate": "0.19",  "deductionCents": "37800000", "shares": ["0.135", "0.1", "0.2827", "0.0613", "0.421", "0"]}]},
  "II": {"taxes": ["IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "IPI", "ICMS"], "brackets": [
    {"upToCents": "18000000",  "rate": "0.045", "deductionCents": "0",        "shares": ["0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"]},
    {"upToCents": "36000000",  "rate": "0.078", "deductionCents": "594000",   "shares": ["0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"]},
    {"upToCents": "72000000",  "rate": "0.1",   "deductionCents": "1386000",  "shares": ["0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"]},
    {"upToCents": "180000000", "rate": "0.112", "deductionCents": "2250000",  "shares": ["0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"]},
    {"upToCents": "360000000", "rate": "0.147", "deductionCents": "8550000",  "shares": ["0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"]},
    {"upToCents": "480000000", "rate": "0.3",   "deductionCents": "72000000", "shares": ["0.085", "0.075", "0.2096", "0.0454", "0.235", "0.35", "0"]}]},
  "III": {"taxes": ["IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "ISS"], "brackets": [
    {"upToCents": "18000000",  "rate": "0.06",  "deductionCents": "0",        "shares": ["0.04", "0.035", "0.1282", "0.0278", "0.434", "0.335"]},
    {"upToCents": "36000000",  "rate": "0.112", "deductionCents": "936000",   "shares": ["0.04", "0.035", "0.1405", "0.0305", "0.434", "0.32"]},
    {"upToCents": "72000000",  "rate": "0.135", "deductionCents": "1764000",  "shares": ["0.04", "0.035", "0.1364", "0.0296", "0.434", "0.325"]},
    {"upToCents": "180000000", "rate": "0.16",  "deductionCents": "3564000",  "shares": ["0.04", "0.035", "0.1364", "0.0296", "0.434", "0.325"]},
    {"upToCents": "360000000", "rate": "0.21",  "deductionCents": "12564000", "shares": ["0.04", "0.035", "0.1282", "0.0278", "0.434", "0.335"]},
    {"upToCents": "480000000", "rate": "0.33",  "deductionCents": "64800000", "shares": ["0.35", "0.15", "0.1603", "0.0347", "0.305", "0"]}]},
  "IV": {"taxes": [], "brackets": [
    {"upToCents": "18000000",  "rate": "0.045", "deductionCents": "0",        "shares": []},
    {"upToCents": "36000000",  "rate": "0.09",  "deductionCents": "810000",   "shares": []},
    {"upToCents": "72000000",  "rate": "0.102", "deductionCents": "1242000",  "shares": []},
    {"upToCents": "180000000", "rate": "0.14",  "deductionCents": "3978000",  "shares": []},
    {"upToCents": "360000000", "rate": "0.22",  "deductionCents": "18378000", "shares": []},
    {"upToCents": "480000000", "rate": "0.33",  "deductionCents": "82800000", "shares": []}]},
  "V": {"taxes": [], "brackets": [
    {"upToCents": "18000000",  "rate": "0.155", "deductionCents": "0",        "shares": []},
    {"upToCents": "36000000",  "rate": "0.18",  "deductionCents": "450000",   "shares": []},
    {"upToCents": "72000000",  "rate": "0.195", "deductionCents": "990000",   "shares": []},
    {"upToCents": "180000000", "rate": "0.205", "deductionCents": "1710000",  "shares": []},
    {"upToCents": "360000000", "rate": "0.23",  "deductionCents": "6210000",  "shares": []},
    {"upToCents": "480000000", "rate": "0.305", "deductionCents": "54000000", "shares": []}]}
}'::jsonb, 'LC 123/2006, anexos I a V (mock Renda+ ERP — Tabelas e parâmetros do Simples Nacional)',
        'Repartição dos tributos dos anexos I, II e III. Premissa da Sprint 12, a confirmar com o contador.', now(), 'sistema');

-- Dados da empresa no Simples (uma linha). CNAEs do mock: premissa da Sprint 12, editável pelo Administrador.
create table tax_company_profile (
    id                  smallint     primary key check (id = 1),
    regime              varchar(30)  not null check (regime in ('SIMPLES_NACIONAL')),
    opted_since         date,
    cnae_main           varchar(150),
    cnae_secondary      varchar(150),
    revenue_recognition varchar(12)  not null check (revenue_recognition in ('COMPETENCIA')),
    nfse_issuer         varchar(60),
    annual_limit_cents  bigint       not null check (annual_limit_cents > 0),
    sublimit_cents      bigint       not null check (sublimit_cents > 0),
    tolerance           numeric(5, 4) not null check (tolerance >= 0 and tolerance < 1),
    alert_threshold     numeric(5, 4) not null check (alert_threshold > 0 and alert_threshold <= 1),
    version             bigint       not null check (version >= 1),
    updated_at          timestamptz  not null,
    updated_by          varchar(100) not null
);

insert into tax_company_profile values (1, 'SIMPLES_NACIONAL', null, '2829-1/99 — Outras máquinas e equipamentos de uso geral',
    '3321-0/00 — Instalação de máquinas e equipamentos industriais', 'COMPETENCIA', 'Padrão nacional', 480000000, 360000000,
    0.2, 0.9, 1, now(), 'sistema');

-- Atividades da empresa e o anexo de cada uma (aba "Atividades e anexos").
create table tax_activity (
    id         uuid primary key,
    position   integer      not null,
    name       varchar(150) not null,
    framing    varchar(60)  not null,
    annex      varchar(3)   not null check (annex in ('I', 'II', 'III', 'IV', 'V')),
    taxes      varchar(150) not null,
    status     varchar(10)  not null check (status in ('ATIVO', 'INATIVO')),
    version    bigint       not null check (version >= 1),
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    updated_at timestamptz,
    updated_by varchar(100)
);

insert into tax_activity values
    (gen_random_uuid(), 1, 'Fabricação de balanças, coletores e painéis', 'CNAE 2829-1/99', 'II', 'IRPJ, CSLL, COFINS, PIS, CPP, IPI, ICMS', 'ATIVO', 1, now(), 'sistema', null, null),
    (gen_random_uuid(), 2, 'Revenda de peças de reposição e acessórios', 'CNAE 4663-0/00', 'I', 'IRPJ, CSLL, COFINS, PIS, CPP, ICMS', 'ATIVO', 1, now(), 'sistema', null, null),
    (gen_random_uuid(), 3, 'Instalação e comissionamento', 'LC 116, item 14.06', 'III', 'IRPJ, CSLL, COFINS, PIS, CPP, ISS', 'ATIVO', 1, now(), 'sistema', null, null),
    (gen_random_uuid(), 4, 'Manutenção, reparo e aferição', 'LC 116, item 14.01', 'III', 'IRPJ, CSLL, COFINS, PIS, CPP, ISS', 'ATIVO', 1, now(), 'sistema', null, null),
    (gen_random_uuid(), 5, 'Treinamento de operadores', 'LC 116, item 8.02', 'III', 'IRPJ, CSLL, COFINS, PIS, CPP, ISS', 'ATIVO', 1, now(), 'sistema', null, null);

-- Opção por IBS e CBS (reforma tributária): cada registro preserva o anterior; vale o mais recente do período.
create table tax_ibs_cbs_option (
    id               uuid primary key,
    period           varchar(10)  not null,
    choice           varchar(10)  not null check (choice in ('DENTRO_DAS', 'FORA_DAS')),
    deadline         date         not null,
    withdrawal_until date         not null,
    notes            varchar(500),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null
);

-- Receita das competências anteriores ao Renda+, por anexo (o que foi declarado no PGDAS-D).
create table tax_revenue_history (
    competence   char(7)      primary key check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    annex1_cents bigint       not null check (annex1_cents >= 0),
    annex2_cents bigint       not null check (annex2_cents >= 0),
    annex3_cents bigint       not null check (annex3_cents >= 0),
    annex4_cents bigint       not null check (annex4_cents >= 0),
    annex5_cents bigint       not null check (annex5_cents >= 0),
    source       varchar(10)  not null check (source in ('DIGITADO', 'ARQUIVO')),
    informed_by  varchar(100) not null,
    notes        varchar(500),
    version      bigint       not null check (version >= 1),
    created_at   timestamptz  not null,
    created_by   varchar(100) not null,
    updated_at   timestamptz,
    updated_by   varchar(100)
);

-- Arquivos de histórico carregados: o mesmo conteúdo (hash) não carrega duas vezes.
create table tax_revenue_import (
    id         uuid primary key,
    file_hash  char(64)     not null unique,
    file_name  varchar(200),
    months     integer      not null,
    created_at timestamptz  not null,
    created_by varchar(100) not null
);

-- Notas: anexo de cada linha (cópia do momento do registro) e situação de autorização.
alter table document_line
    add column item_id      uuid references item (id),
    add column annex        varchar(3)  check (annex in ('I', 'II', 'III', 'IV', 'V')),
    add column annex_source varchar(15) check (annex_source in ('CLASSIFICACAO', 'EQUIPAMENTO', 'PADRAO', 'MIGRACAO'));
update document_line set annex = case kind when 'SERVICO' then 'III' else 'II' end, annex_source = 'MIGRACAO';
alter table document_line alter column annex set not null, alter column annex_source set not null;

alter table business_document
    add column authorization_status   varchar(10) not null default 'AUTORIZADA' check (authorization_status in ('AUTORIZADA', 'PENDENTE')),
    add column authorization_protocol varchar(60);

-- Cálculo do DAS por anexo e por tributo (as colunas de produto e serviço continuam: produto = anexos I, II, IV e V).
alter table tax_simulation add column annexes jsonb, add column taxes jsonb;

-- Conferência do contador → guia DAS (valor declarado no PGDAS-D), com número do documento, multa e juros.
alter table accountant_confirmation rename to tax_das_guide;
alter table tax_das_guide
    add column document_number varchar(30),
    add column fine_cents      bigint not null default 0 check (fine_cents >= 0),
    add column interest_cents  bigint not null default 0 check (interest_cents >= 0);

-- Transmissões do PGDAS-D registradas (o Renda+ não transmite: registra o que foi feito no portal).
create table tax_pgdas_declaration (
    id                     uuid primary key,
    period_id              uuid         not null references tax_period (id),
    seq                    integer      not null check (seq >= 1),
    transmitted_on         date         not null,
    receipt_number         varchar(40)  not null,
    declared_revenue_cents bigint       not null check (declared_revenue_cents >= 0),
    notes                  varchar(500),
    created_at             timestamptz  not null,
    created_by             varchar(100) not null,
    unique (period_id, seq)
);

-- Etapas do fechamento marcadas à mão (as outras se concluem pelos dados).
create table tax_closing_step (
    period_id uuid         not null references tax_period (id),
    step      varchar(30)  not null check (step in ('NOTAS_CONFERIDAS', 'CANCELAMENTOS_CONFERIDOS', 'RBT12_CONFERIDO')),
    done_at   timestamptz  not null,
    done_by   varchar(100) not null,
    notes     varchar(500),
    primary key (period_id, step)
);

-- Obrigações: modelos recorrentes e ocorrências.
create table tax_obligation_template (
    id                 uuid primary key,
    code               varchar(20)  not null unique,
    name               varchar(150) not null,
    sphere             varchar(10)  not null check (sphere in ('FEDERAL', 'ESTADUAL', 'MUNICIPAL')),
    kind               varchar(10)  not null check (kind in ('DECLARACAO', 'GUIA')),
    periodicity        varchar(10)  not null check (periodicity in ('MENSAL', 'ANUAL')),
    due_day            smallint     not null check (due_day between 1 and 31),
    due_month          smallint     not null check (due_month between 1 and 12),
    responsible        varchar(100) not null,
    detail             varchar(500) not null,
    initial_status     varchar(20)  not null,
    active             boolean      not null
);

-- MENSAL: vence no dia due_day do mês seguinte à competência (31 = último dia do mês); due_month não se aplica (1).
-- ANUAL: competência = ano; vence em due_day/due_month do ano seguinte.
insert into tax_obligation_template values
    (gen_random_uuid(), 'PGDAS_D', 'PGDAS-D', 'FEDERAL', 'DECLARACAO', 'MENSAL', 20, 1, 'Fiscal', 'Declaração da receita da competência, segregada por anexo.', 'EM_APURACAO', true),
    (gen_random_uuid(), 'DAS', 'DAS — Simples Nacional', 'FEDERAL', 'GUIA', 'MENSAL', 20, 1, 'Financeiro', 'Guia única gerada a partir do PGDAS-D.', 'ABERTO', true),
    (gen_random_uuid(), 'ESOCIAL', 'eSocial — eventos periódicos', 'FEDERAL', 'DECLARACAO', 'MENSAL', 15, 1, 'Departamento pessoal', 'Fechamento da folha da competência.', 'EM_PREPARACAO', true),
    (gen_random_uuid(), 'EFD_REINF', 'EFD-Reinf', 'FEDERAL', 'DECLARACAO', 'MENSAL', 15, 1, 'Fiscal', 'Retenções sobre serviços tomados na competência.', 'A_ENTREGAR', true),
    (gen_random_uuid(), 'FGTS', 'FGTS Digital', 'FEDERAL', 'GUIA', 'MENSAL', 20, 1, 'Departamento pessoal', 'Guia gerada a partir do eSocial.', 'ABERTO', true),
    (gen_random_uuid(), 'DESTDA', 'DeSTDA', 'ESTADUAL', 'DECLARACAO', 'MENSAL', 28, 1, 'Fiscal', 'DIFAL e antecipação de ICMS das compras da competência.', 'A_ENTREGAR', true),
    (gen_random_uuid(), 'DCTFWEB', 'DCTFWeb', 'FEDERAL', 'DECLARACAO', 'MENSAL', 31, 1, 'Departamento pessoal', 'Contribuições da folha da competência, a partir do eSocial e da EFD-Reinf.', 'A_ENTREGAR', true),
    (gen_random_uuid(), 'DEFIS', 'DEFIS', 'FEDERAL', 'DECLARACAO', 'ANUAL', 31, 3, 'Contabilidade', 'Declaração anual do Simples Nacional.', 'A_ENTREGAR', true);

create sequence tax_obligation_code_seq;

create table tax_obligation (
    id             uuid primary key,
    code           varchar(20)  not null unique,
    template_id    uuid references tax_obligation_template (id),
    name           varchar(150) not null,
    competence     varchar(7)   not null check (competence ~ '^[0-9]{4}(-(0[1-9]|1[0-2]))?$'),
    due_date       date         not null,
    sphere         varchar(10)  not null check (sphere in ('FEDERAL', 'ESTADUAL', 'MUNICIPAL')),
    kind           varchar(10)  not null check (kind in ('DECLARACAO', 'GUIA')),
    responsible    varchar(100) not null,
    detail         varchar(500),
    status         varchar(20)  not null check (status in ('A_ENTREGAR', 'EM_PREPARACAO', 'EM_APURACAO', 'ABERTO',
                                                          'DECISAO_PENDENTE', 'ENTREGUE', 'PAGO')),
    delivered_on   date,
    receipt_number varchar(60),
    notes          varchar(500),
    version        bigint       not null check (version >= 1),
    created_at     timestamptz  not null,
    created_by     varchar(100) not null,
    updated_at     timestamptz,
    updated_by     varchar(100),
    constraint tax_obligation_delivered check (status not in ('ENTREGUE', 'PAGO') or delivered_on is not null)
);

create unique index tax_obligation_one_per_template on tax_obligation (template_id, competence) where template_id is not null;
create index tax_obligation_due on tax_obligation (due_date);

-- Prazo da opção por IBS e CBS fora do DAS no 1º semestre de 2027 (mock "Painel fiscal"); concluída ao registrar a opção.
insert into tax_obligation (id, code, name, competence, due_date, sphere, kind, responsible, detail, status, version, created_at, created_by)
values (gen_random_uuid(), 'OB' || lpad(nextval('tax_obligation_code_seq')::text, 5, '0'),
        'Opção por IBS e CBS fora do DAS (1º semestre de 2027)', '2027', '2026-09-30', 'FEDERAL', 'DECLARACAO',
        'Diretoria e contabilidade', 'Escolha no Portal do Simples Nacional. Sem opção, IBS e CBS seguem dentro do DAS em 2027. '
        || 'A desistência pode ser feita até 30/11/2026.', 'DECISAO_PENDENTE', 1, now(), 'sistema');

-- Perfil fiscal do item (do módulo fiscal; NCM e item da LC 116 continuam no cadastro do item).
create table item_fiscal_profile (
    item_id         uuid         primary key references item (id),
    cfop_internal   char(4)      check (cfop_internal ~ '^[1-7][0-9]{3}$'),
    cfop_interstate char(4)      check (cfop_interstate ~ '^[1-7][0-9]{3}$'),
    csosn           varchar(3)   check (csosn in ('101', '102', '103', '201', '202', '203', '300', '400', '500', '900')),
    origin          char(1)      check (origin ~ '^[0-8]$'),
    annex           varchar(6)   check (annex in ('I', 'II', 'III', 'IV', 'V', 'INSUMO')),
    activity_id     uuid references tax_activity (id),
    nbs             varchar(12)  check (nbs ~ '^[0-9]\.[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'),
    iss_retention   varchar(20)  check (iss_retention in ('SIM', 'NAO', 'CONFORME_MUNICIPIO')),
    review          boolean      not null,
    review_note     varchar(500),
    version         bigint       not null check (version >= 1),
    created_at      timestamptz  not null,
    created_by      varchar(100) not null,
    updated_at      timestamptz,
    updated_by      varchar(100)
);
