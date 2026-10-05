-- Sprint 13: meta mensal de faturamento do cockpit (gráfico "Faturamento × meta"). A meta de vendas do CRM (sales_target)
-- mede pedidos confirmados; esta mede notas de saída emitidas.
create table billing_target (
    month        date         primary key check (extract(day from month) = 1),
    target_cents bigint       not null check (target_cents >= 0),
    updated_at   timestamptz  not null,
    updated_by   varchar(100) not null
);
