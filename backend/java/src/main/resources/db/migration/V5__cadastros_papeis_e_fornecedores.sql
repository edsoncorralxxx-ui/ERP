-- Sprint 3 (S3-01, S3-02): cliente e fornecedor são papéis do mesmo parceiro, cada um com a sua situação.

create sequence supplier_code_seq;

create table partner_role (
    partner_id uuid        not null references partner (id) on delete cascade,
    role       varchar(12) not null check (role in ('CLIENTE', 'FORNECEDOR')),
    status     varchar(10) not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
    since      timestamptz not null,
    primary key (partner_id, role)
);

create index partner_role_role on partner_role (role, status);

-- Todos os parceiros da Sprint 2 são clientes; a situação do cliente era a do parceiro.
insert into partner_role (partner_id, role, status, since)
select id, 'CLIENTE', status, created_at from partner where is_customer;

alter table partner drop column is_customer;

-- partner.status passa a ser ATIVO quando ao menos um papel está ativo.
comment on column partner.status is 'ATIVO se ao menos um papel (partner_role) está ativo';

-- Dados do papel de fornecedor (formulário "fornecedores" do B01).
alter table partner
    add column supplier_lead_time_days integer check (supplier_lead_time_days between 0 and 365),
    add column supplier_payment_terms  varchar(200);
