package br.com.fourtech.rendamais.financeiro.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Transferência entre contas próprias (formulário "conciliacao", TransferBetweenAccounts): saída na origem e entrada no
 * destino, com o mesmo valor e data. O estorno é total, com motivo, e a transferência continua consultável como
 * REVERSED. No consolidado da empresa o efeito é zero.
 */
public record Transfer(UUID id, String code, UUID fromAccountId, UUID toAccountId, LocalDate effectiveDate, long amountCents, String notes,
                       Status status, String reversalReason, LocalDate reversalDate, Instant reversedAt, String reversedBy, long version,
                       Instant createdAt, String createdBy) {

    public enum Status { POSTED, REVERSED }

    public Transfer reverse(String reason, LocalDate date, Instant at, String actor) {
        return new Transfer(id, code, fromAccountId, toAccountId, effectiveDate, amountCents, notes, Status.REVERSED, reason, date, at, actor,
                version + 1, createdAt, createdBy);
    }
}
