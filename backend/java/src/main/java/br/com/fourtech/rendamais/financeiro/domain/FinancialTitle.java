package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Objects;
import java.util.UUID;

/**
 * Título financeiro (formulário "receber" do B01). O valor original e a origem são imutáveis (INV-FT-2); o saldo é
 * derivado: original + ajustes − valores recebidos. Nesta sprint ainda não há ajustes nem recebimentos (Sprint 5), então
 * o saldo é o original. Vencido é condição por data e saldo, não situação.
 */
public final class FinancialTitle {

    public enum Direction { RECEIVABLE, PAYABLE }

    public enum Lifecycle { ACTIVE, RENEGOTIATED, CANCELLED }

    public enum Status { OPEN, PARTIAL, SETTLED, RENEGOTIATED, CANCELLED }

    private final UUID id;
    private final String code;
    private final Direction direction;
    private final UUID counterpartyId;
    private final String originType;
    private final String originId;
    private final String originLabel;
    private final UUID projectId;
    private final String category;
    private final YearMonth competence;
    private final LocalDate issueDate;
    private final LocalDate dueDate;
    private final Money original;
    private final Lifecycle lifecycle;
    private final String cancelReason;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public FinancialTitle(UUID id, String code, Direction direction, UUID counterpartyId, String originType, String originId,
                          String originLabel, UUID projectId, String category, YearMonth competence, LocalDate issueDate,
                          LocalDate dueDate, Money original, Lifecycle lifecycle, String cancelReason, long version,
                          Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.direction = Objects.requireNonNull(direction);
        this.counterpartyId = Objects.requireNonNull(counterpartyId);
        this.originType = Objects.requireNonNull(originType);
        this.originId = Objects.requireNonNull(originId);
        this.originLabel = Objects.requireNonNull(originLabel);
        this.projectId = projectId;
        this.category = Objects.requireNonNull(category);
        this.competence = Objects.requireNonNull(competence);
        this.issueDate = Objects.requireNonNull(issueDate);
        this.dueDate = Objects.requireNonNull(dueDate);
        this.original = Objects.requireNonNull(original);
        this.lifecycle = Objects.requireNonNull(lifecycle);
        this.cancelReason = cancelReason;
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /**
     * Título a receber de uma parcela. Premissa desta fase (PD-010/PD-024, a confirmar com o financeiro): competência é
     * o mês do vencimento.
     */
    public static FinancialTitle receivable(String code, UUID counterpartyId, String originType, String originId, String label,
                                            UUID projectId, String category, LocalDate issueDate, LocalDate dueDate,
                                            Money amount, Instant now, String actor) {
        if (amount.currency() != Currency.BRL || amount.isNegative() || amount.isZero()) {
            throw new IllegalArgumentException("Valor do título deve ser positivo, em reais: " + amount);
        }
        return new FinancialTitle(UUID.randomUUID(), code, Direction.RECEIVABLE, counterpartyId, originType, originId, label,
                projectId, category, YearMonth.from(dueDate), issueDate, dueDate, amount, Lifecycle.ACTIVE, null, 1, now, actor,
                now, actor);
    }

    /** Valor recebido e não estornado. Recebimentos entram na Sprint 5. */
    public Money received() {
        return Money.zero(original.currency());
    }

    public Money balance() {
        return lifecycle == Lifecycle.CANCELLED ? Money.zero(original.currency()) : original.minus(received());
    }

    public Status status() {
        return switch (lifecycle) {
            case CANCELLED -> Status.CANCELLED;
            case RENEGOTIATED -> Status.RENEGOTIATED;
            case ACTIVE -> balance().isZero() ? Status.SETTLED : received().isZero() ? Status.OPEN : Status.PARTIAL;
        };
    }

    public boolean isOverdue(LocalDate today) {
        return !balance().isZero() && dueDate.isBefore(today);
    }

    /** Cancela com motivo; título com valor recebido não é cancelado (INV-FT-4). Cancelar de novo não muda nada. */
    public FinancialTitle cancel(String reason, Instant now, String actor) {
        if (lifecycle == Lifecycle.CANCELLED) return this;
        if (!received().isZero()) {
            throw new InvalidStateException("O título " + code + " tem valor recebido; estorne o recebimento antes de cancelar.");
        }
        return new FinancialTitle(id, code, direction, counterpartyId, originType, originId, originLabel, projectId, category,
                competence, issueDate, dueDate, original, Lifecycle.CANCELLED, reason, version + 1, createdAt, createdBy, now, actor);
    }

    public UUID id() { return id; }
    public String code() { return code; }
    public Direction direction() { return direction; }
    public UUID counterpartyId() { return counterpartyId; }
    public String originType() { return originType; }
    public String originId() { return originId; }
    public String originLabel() { return originLabel; }
    public UUID projectId() { return projectId; }
    public String category() { return category; }
    public YearMonth competence() { return competence; }
    public LocalDate issueDate() { return issueDate; }
    public LocalDate dueDate() { return dueDate; }
    public Money original() { return original; }
    public Lifecycle lifecycle() { return lifecycle; }
    public String cancelReason() { return cancelReason; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
