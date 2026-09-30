-- Sprint 9: transferência entre contas próprias (B06). Uma saída na origem e uma entrada no destino, vinculadas à
-- transferência; o estorno cria os dois movimentos inversos. No consolidado as transferências se anulam (IND-009).

create sequence transfer_code_seq;

create table transfer (
    id               uuid primary key,
    code             varchar(20)  not null unique,
    from_account_id  uuid         not null references bank_account (id),
    to_account_id    uuid         not null references bank_account (id),
    effective_date   date         not null,
    amount_cents     bigint       not null check (amount_cents > 0),
    notes            varchar(500),
    status           varchar(10)  not null check (status in ('POSTED', 'REVERSED')),
    reversal_reason  varchar(500),
    reversal_date    date,
    reversed_at      timestamptz,
    reversed_by      varchar(100),
    version          bigint       not null check (version >= 1),
    created_at       timestamptz  not null,
    created_by       varchar(100) not null,
    check (from_account_id <> to_account_id),
    check (status = 'POSTED' or reversal_reason is not null)
);

create index transfer_accounts on transfer (from_account_id, to_account_id);

-- O movimento de caixa passa a vir de uma liquidação ou de uma transferência (um dos dois).
alter table cash_movement alter column settlement_id drop not null;
alter table cash_movement add column transfer_id uuid references transfer (id);
alter table cash_movement drop constraint cash_movement_kind_check;
alter table cash_movement add constraint cash_movement_kind_check
    check (kind in ('SETTLEMENT', 'SETTLEMENT_REVERSAL', 'TRANSFER', 'TRANSFER_REVERSAL'));
alter table cash_movement add constraint cash_movement_source
    check ((settlement_id is not null and transfer_id is null and kind in ('SETTLEMENT', 'SETTLEMENT_REVERSAL'))
        or (transfer_id is not null and settlement_id is null and kind in ('TRANSFER', 'TRANSFER_REVERSAL')));
-- Por transferência: um movimento por conta e tipo (saída e entrada; no estorno, os inversos).
create unique index cash_movement_transfer_once on cash_movement (transfer_id, account_id, kind) where transfer_id is not null;
