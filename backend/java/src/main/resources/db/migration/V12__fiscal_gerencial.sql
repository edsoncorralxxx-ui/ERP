-- Sprint 7: fiscal gerencial (B10, ADR-011). Receita por competência (das notas), RBT12 informado, simulação gerencial
-- do Simples Nacional, conferência do contador e fechamento — sempre separados: a simulação nunca substitui o valor do
-- contador, e mês desconhecido não é zero.

-- Revisões dos parâmetros: regime, anexo por tipo e faixas, com vigência. Revisão gravada não muda; a mudança é outra
-- revisão. Faixas em JSON por tipo: [{"upToCents", "rate" (fração), "deductionCents"}], em ordem crescente.
create table tax_parameter_revision (
    id            uuid primary key,
    revision      integer      not null unique check (revision >= 1),
    regime        varchar(30)  not null check (regime in ('SIMPLES_NACIONAL')),
    valid_from    char(7)      not null check (valid_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    product_annex varchar(10)  not null,
    service_annex varchar(10)  not null,
    brackets      jsonb        not null,
    source        varchar(300) not null,
    notes         varchar(500),
    created_at    timestamptz  not null,
    created_by    varchar(100) not null
);

-- Revisão 1: tabelas da planilha "FOURTECH · Parâmetros do Simples Nacional", enviadas pelo PO em 28/09/2026 (PD-013):
-- Produto no Anexo II (Indústria), Serviço no Anexo III (Serviços).
insert into tax_parameter_revision (id, revision, regime, valid_from, product_annex, service_annex, brackets, source, notes,
                                    created_at, created_by)
values (gen_random_uuid(), 1, 'SIMPLES_NACIONAL', '2026-09', 'II', 'III', '{
  "PRODUTO": [
    {"upToCents": "18000000",  "rate": "0.045", "deductionCents": "0"},
    {"upToCents": "36000000",  "rate": "0.078", "deductionCents": "594000"},
    {"upToCents": "72000000",  "rate": "0.100", "deductionCents": "1386000"},
    {"upToCents": "180000000", "rate": "0.112", "deductionCents": "2250000"},
    {"upToCents": "360000000", "rate": "0.147", "deductionCents": "8550000"},
    {"upToCents": "480000000", "rate": "0.300", "deductionCents": "72000000"}
  ],
  "SERVICO": [
    {"upToCents": "18000000",  "rate": "0.060", "deductionCents": "0"},
    {"upToCents": "36000000",  "rate": "0.112", "deductionCents": "936000"},
    {"upToCents": "72000000",  "rate": "0.135", "deductionCents": "1764000"},
    {"upToCents": "180000000", "rate": "0.160", "deductionCents": "3564000"},
    {"upToCents": "360000000", "rate": "0.210", "deductionCents": "12564000"},
    {"upToCents": "480000000", "rate": "0.330", "deductionCents": "64800000"}
  ]
}'::jsonb, 'Planilha FOURTECH · Parâmetros do Simples Nacional, informada pelo PO em 28/09/2026',
        'Tabelas oficiais — Anexo II (Indústria) e Anexo III (Serviços).', now(), 'sistema');

-- Competência: situação e RBT12 informado (o que o contador usou no PGDAS-D), enquanto o Renda+ não tem os 12 meses.
-- Criada na primeira operação; versão 0 = ainda sem alteração.
create table tax_period (
    id                   uuid primary key,
    competence           char(7)      not null unique check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    status               varchar(10)  not null check (status in ('ABERTA', 'FECHADA')),
    informed_rbt12_cents bigint       check (informed_rbt12_cents > 0),
    informed_by          varchar(100),
    informed_notes       varchar(500),
    version              bigint       not null check (version >= 0),
    created_at           timestamptz  not null,
    created_by           varchar(100) not null,
    updated_at           timestamptz,
    updated_by           varchar(100)
);

-- Simulações gerenciais: cada uma preservada, com a memória do cálculo (origem do RBT12, faixa, fórmula, revisão).
create table tax_simulation (
    id                    uuid primary key,
    period_id             uuid         not null references tax_period (id),
    seq                   integer      not null check (seq >= 1),
    result                varchar(20)  not null check (result in ('CALCULADA', 'NAO_CALCULAVEL')),
    parameter_revision_id uuid references tax_parameter_revision (id),
    rbt12_cents           bigint,
    rbt12_origin          varchar(12)  check (rbt12_origin in ('CALCULADO', 'INFORMADO')),
    product_revenue_cents bigint       not null,
    service_revenue_cents bigint       not null,
    product_tax_cents     bigint,
    service_tax_cents     bigint,
    total_tax_cents       bigint,
    memory                jsonb        not null,
    created_at            timestamptz  not null,
    created_by            varchar(100) not null,
    unique (period_id, seq),
    constraint tax_simulation_total check (result = 'NAO_CALCULAVEL' or total_tax_cents = product_tax_cents + service_tax_cents)
);

-- Conferência do contador: valor apurado e vencimento; cada nova conferência preserva as anteriores.
create table accountant_confirmation (
    id            uuid primary key,
    period_id     uuid         not null references tax_period (id),
    seq           integer      not null check (seq >= 1),
    amount_cents  bigint       not null check (amount_cents >= 0),
    due_date      date         not null,
    notes         varchar(500),
    simulation_id uuid references tax_simulation (id),
    created_at    timestamptz  not null,
    created_by    varchar(100) not null,
    unique (period_id, seq)
);

-- Fechamentos e reaberturas: o fechamento congela a receita, a simulação e a conferência daquele momento.
create table tax_period_closure (
    id                    uuid primary key,
    period_id             uuid         not null references tax_period (id),
    action                varchar(12)  not null check (action in ('FECHAMENTO', 'REABERTURA')),
    reason                varchar(500),
    product_revenue_cents bigint,
    service_revenue_cents bigint,
    simulation_id         uuid references tax_simulation (id),
    confirmation_id       uuid references accountant_confirmation (id),
    occurred_at           timestamptz  not null,
    actor                 varchar(100) not null,
    constraint tax_period_closure_reason check (action = 'FECHAMENTO' or reason is not null)
);

create index tax_period_closure_period on tax_period_closure (period_id, occurred_at);
