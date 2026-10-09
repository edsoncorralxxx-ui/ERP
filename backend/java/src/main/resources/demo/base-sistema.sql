-- Registros de sistema que as migrações criam e a limpeza (RENDA_DEMO=limpar) repõe: o beneficiário do DAS (V13), a conta
-- Caixa (V9) e o prazo da opção por IBS e CBS fora do DAS no 1º semestre de 2027 (V18).
insert into partner (id, code, legal_name, status, version, created_at, created_by)
values ('00000000-0000-0000-0000-0000000000da', 'F' || lpad(nextval('supplier_code_seq')::text, 5, '0'), 'Receita Federal — DAS',
        'ATIVO', 1, now(), 'sistema');
insert into partner_role (partner_id, role, status, since)
values ('00000000-0000-0000-0000-0000000000da', 'FORNECEDOR', 'ATIVO', now());

insert into bank_account (id, code, name, kind, opening_cents, opening_on, status, version, created_at, created_by)
values ('00000000-0000-0000-0000-00000000ca01', 'CT' || lpad(nextval('bank_account_code_seq')::text, 3, '0'), 'Caixa', 'CAIXA',
        0, date '2026-01-01', 'ATIVO', 1, now(), 'sistema');

insert into tax_obligation (id, code, name, competence, due_date, sphere, kind, responsible, detail, status, version, created_at, created_by)
values (gen_random_uuid(), 'OB' || lpad(nextval('tax_obligation_code_seq')::text, 5, '0'),
        'Opção por IBS e CBS fora do DAS (1º semestre de 2027)', '2027', '2026-09-30', 'FEDERAL', 'DECLARACAO',
        'Diretoria e contabilidade', 'Escolha no Portal do Simples Nacional. Sem opção, IBS e CBS seguem dentro do DAS em 2027. '
        || 'A desistência pode ser feita até 30/11/2026.', 'DECISAO_PENDENTE', 1, now(), 'sistema');
