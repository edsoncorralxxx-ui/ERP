-- Pedidos do PO depois da Sprint 4: CNPJ nas unidades do cliente; NCM nos produtos e código de serviço (LC 116) nos
-- serviços; o cadastro "Materiais" passa a se chamar "Produtos", com código P00001.

alter table partner_unit
    add column cnpj char(14) check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

-- CNPJ de unidade é único entre as unidades (o parceiro confere também contra o CNPJ principal dos outros).
create unique index partner_unit_cnpj on partner_unit (cnpj) where cnpj is not null;

-- NCM: 8 dígitos (Nomenclatura Comum do Mercosul), só em produto.
-- Código do serviço: item da lista da LC 116/2003 ("14.01"), o COD_LST do registro 0200 do SPED, só em serviço.
alter table item
    add column ncm          char(8)    check (ncm ~ '^[0-9]{8}$'),
    add column service_code varchar(5) check (service_code ~ '^[0-9]{2}\.[0-9]{2}$'),
    add constraint item_ncm_only_product check (ncm is null or nature = 'MATERIAL'),
    add constraint item_service_code_only_service check (service_code is null or nature = 'SERVICO');

-- Produtos: código P00001 no lugar de M00001 (a natureza continua MATERIAL na API; o histórico guarda o código da época).
update item set code = 'P' || substring(code from 2) where nature = 'MATERIAL' and code like 'M%';
