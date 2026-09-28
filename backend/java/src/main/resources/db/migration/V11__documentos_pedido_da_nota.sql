-- Review da Sprint 6 (decisão do PO): a nota é registrada a partir do pedido, pelo recebido que ainda não tem nota
-- (regime de caixa). O documento guarda o pedido de origem; as notas registradas antes ficam sem ele.
alter table business_document add column order_id uuid references sales_order (id);
create index business_document_order on business_document (order_id);
