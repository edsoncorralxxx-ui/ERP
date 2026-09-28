package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Movimento de caixa numa conta: positivo entra, negativo sai. O estorno de uma liquidação cria o movimento inverso
 * vinculado ao original ({@code reversesId}); nenhum movimento é apagado.
 */
public record CashMovement(UUID id, UUID accountId, LocalDate effectiveDate, Money amount, String description, UUID settlementId,
                           UUID reversesId, Instant createdAt, String createdBy) {

    public CashMovement {
        Objects.requireNonNull(id);
        Objects.requireNonNull(accountId);
        Objects.requireNonNull(effectiveDate);
        Objects.requireNonNull(amount);
        Objects.requireNonNull(description);
        Objects.requireNonNull(settlementId);
        if (amount.isZero()) throw new IllegalArgumentException("Movimento de caixa sem valor");
    }

    /** Entrada do recebimento na conta, na data efetiva. */
    public static CashMovement inflow(Settlement s, String description, Instant now, String actor) {
        return new CashMovement(UUID.randomUUID(), s.accountId(), s.effectiveDate(), s.total(), description, s.id(), null, now, actor);
    }

    /** Movimento inverso, na mesma conta e data do original, para que o caixa volte ao saldo anterior. */
    public CashMovement reversal(String description, Instant now, String actor) {
        return new CashMovement(UUID.randomUUID(), accountId, effectiveDate, amount.negate(), description, settlementId, id, now, actor);
    }
}
