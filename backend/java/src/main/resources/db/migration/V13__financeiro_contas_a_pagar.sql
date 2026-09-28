-- Sprint 8: contas a pagar (B06). Categorias financeiras (PD-010), títulos a pagar manuais e o DAS da competência
-- conferida, pagamentos (liquidações PAYABLE, movimento de saída) e estornos.

-- Categorias financeiras de receita e despesa. O título guarda o código da categoria (os títulos a receber já gravavam
-- RECEITA_VENDA). As semeadas pelo sistema são usadas pelo próprio sistema e não são inativadas.
create table financial_category (
    id         uuid primary key,
    code       varchar(60)  not null unique check (code ~ '^[A-Z0-9_]+$'),
    name       varchar(100) not null,
    direction  varchar(10)  not null check (direction in ('RECEITA', 'DESPESA')),
    status     varchar(10)  not null check (status in ('ATIVO', 'INATIVO')),
    system     boolean      not null default false,
    version    bigint       not null check (version >= 1),
    created_at timestamptz  not null,
    created_by varchar(100) not null,
    updated_at timestamptz,
    updated_by varchar(100)
);

create unique index financial_category_name on financial_category (lower(name));

-- Lista inicial aprovada pelo PO no planning da Sprint 8 (28/09/2026).
insert into financial_category (id, code, name, direction, status, system, version, created_at, created_by) values
    (gen_random_uuid(), 'RECEITA_VENDA',            'Receita de vendas',            'RECEITA', 'ATIVO', true,  1, now(), 'sistema'),
    (gen_random_uuid(), 'MATERIAIS',                'Materiais',                    'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'SERVICOS_TERCEIROS',       'Serviços de terceiros',        'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'FRETE',                    'Frete',                        'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'IMPOSTOS_SIMPLES',         'Impostos — Simples Nacional',  'DESPESA', 'ATIVO', true,  1, now(), 'sistema'),
    (gen_random_uuid(), 'FOLHA_ENCARGOS',           'Folha e encargos',             'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'ALUGUEL',                  'Aluguel',                      'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'ENERGIA_UTILIDADES',       'Energia e utilidades',         'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'DESPESAS_ADMINISTRATIVAS', 'Despesas administrativas',     'DESPESA', 'ATIVO', false, 1, now(), 'sistema'),
    (gen_random_uuid(), 'OUTRAS_DESPESAS',          'Outras despesas',              'DESPESA', 'ATIVO', false, 1, now(), 'sistema');

-- Beneficiário do DAS (decisão do PO): fornecedor semeado, sem CNPJ, com id fixo conhecido pelo fiscal.
insert into partner (id, code, legal_name, status, version, created_at, created_by)
values ('00000000-0000-0000-0000-0000000000da', 'F' || lpad(nextval('supplier_code_seq')::text, 5, '0'), 'Receita Federal — DAS',
        'ATIVO', 1, now(), 'sistema');
insert into partner_role (partner_id, role, status, since)
values ('00000000-0000-0000-0000-0000000000da', 'FORNECEDOR', 'ATIVO', now());

-- Títulos a pagar: CP00001; pagamentos: PG00001 (os recebimentos continuam RC00001).
create sequence payable_code_seq;
create sequence payment_code_seq;

-- Número do documento do fornecedor (nota, fatura, boleto) e observação do título manual.
alter table financial_title
    add column document_number varchar(60),
    add column notes           varchar(500);

create index financial_title_origin_type on financial_title (direction, origin_type);

-- Conferência do contador → título do DAS criado por ela (nulo quando o valor é zero).
alter table accountant_confirmation add column title_id uuid references financial_title (id);
