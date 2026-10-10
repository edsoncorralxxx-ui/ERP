package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Título financeiro (formulário "receber" do B01). O valor original e a origem são imutáveis (INV-FT-2); o saldo é
 * derivado: original + ajustes − alocações não estornadas (INV-FT-1: nunca negativo). As alocações moram na liquidação;
 * o título guarda a soma recebida, alterada só pelo serviço de liquidação, com o título bloqueado (INV-ST-3). Ajustes
 * (juros, multa, desconto) ainda não existem. Vencido é condição por data e saldo, não situação.
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
    private final Money received;
    private final Lifecycle lifecycle;
    private final String cancelReason;
    private final String documentNumber;
    private final String notes;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public FinancialTitle(UUID id, String code, Direction direction, UUID counterpartyId, String originType, String originId,
                          String originLabel, UUID projectId, String category, YearMonth competence, LocalDate issueDate,
                          LocalDate dueDate, Money original, Money received, Lifecycle lifecycle, String cancelReason,
                          String documentNumber, String notes, long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
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
        this.received = Objects.requireNonNull(received);
        if (received.isNegative() || received.compareTo(original) > 0) {
            throw new IllegalArgumentException("Valor recebido fora do intervalo do título " + code + ": " + received);
        }
        this.lifecycle = Objects.requireNonNull(lifecycle);
        this.cancelReason = cancelReason;
        this.documentNumber = documentNumber;
        this.notes = notes;
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
                projectId, category, YearMonth.from(dueDate), issueDate, dueDate, amount, Money.zero(amount.currency()), Lifecycle.ACTIVE,
                null, null, null, 1, now, actor,
                now, actor);
    }

    /**
     * Título a pagar (formulário "pagar"): a competência é informada (título manual exige categoria e competência —
     * PD-010), não derivada do vencimento.
     */
    public static FinancialTitle payable(String code, UUID counterpartyId, String originType, String originId, String label,
                                         UUID projectId, String category, YearMonth competence, LocalDate issueDate, LocalDate dueDate,
                                         Money amount, String documentNumber, String notes, Instant now, String actor) {
        if (amount.currency() != Currency.BRL || amount.isNegative() || amount.isZero()) {
            throw new IllegalArgumentException("Valor do título deve ser positivo, em reais: " + amount);
        }
        return new FinancialTitle(UUID.randomUUID(), code, Direction.PAYABLE, counterpartyId, originType, originId, label,
                projectId, category, Objects.requireNonNull(competence), issueDate, dueDate, amount, Money.zero(amount.currency()),
                Lifecycle.ACTIVE, null, documentNumber, notes, 1, now, actor, now, actor);
    }

    /** Valor recebido (ou pago, no título a pagar) e não estornado. */
    public Money received() {
        return received;
    }

    /**
     * Aplica a alocação de uma liquidação (chamado com o título bloqueado). Recusa título que não está ativo ou valor
     * acima do saldo (INV-FT-1, {@code INSUFFICIENT_TITLE_BALANCE}); o excedente não vira crédito sozinho (PD-004).
     */
    public FinancialTitle applyAllocation(Money amount, Instant now, String actor) {
        if (amount.isNegative() || amount.isZero()) throw new IllegalArgumentException("Alocação deve ser positiva: " + amount);
        if (lifecycle != Lifecycle.ACTIVE) {
            throw new InvalidStateException("O título " + code + " está " + (lifecycle == Lifecycle.CANCELLED ? "cancelado" : "renegociado")
                    + " e não recebe baixa.");
        }
        if (amount.compareTo(balance()) > 0) {
            throw new RuleViolationException("INSUFFICIENT_TITLE_BALANCE", "O valor de " + amount.toBrl() + " passa do saldo do título "
                    + code + " (" + balance().toBrl() + "). O excedente não vira crédito nesta versão.",
                    List.of(new DomainException.FieldIssue("titles." + id, "Saldo atual: " + balance().toBrl() + ".")));
        }
        return with(received.plus(amount), lifecycle, cancelReason, now, actor);
    }

    /** Desfaz a alocação de uma liquidação estornada (chamado com o título bloqueado). */
    public FinancialTitle reverseAllocation(Money amount, Instant now, String actor) {
        if (amount.isNegative() || amount.isZero() || amount.compareTo(received) > 0) {
            throw new IllegalStateException("Estorno de " + amount + " maior que o recebido no título " + code + ": " + received);
        }
        return with(received.minus(amount), lifecycle, cancelReason, now, actor);
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
            throw new InvalidStateException(direction == Direction.PAYABLE
                    ? "O título " + code + " tem valor pago; estorne o pagamento antes de cancelar."
                    : "O título " + code + " tem valor recebido; estorne o recebimento antes de cancelar.");
        }
        return with(received, Lifecycle.CANCELLED, reason, now, actor);
    }

    /**
     * Novo vencimento, valor e rótulo da parcela de origem (alteração das parcelas do pedido confirmado). O título
     * cancelado volta a ficar ativo; o valor não fica abaixo do já recebido; o renegociado não muda. Sem mudança, devolve
     * o próprio título. No título a receber, a competência acompanha o vencimento.
     */
    public FinancialTitle reschedule(LocalDate newDue, Money amount, String label, Instant now, String actor) {
        if (amount.currency() != original.currency() || amount.isNegative() || amount.isZero()) {
            throw new IllegalArgumentException("Valor do título deve ser positivo, em reais: " + amount);
        }
        if (lifecycle == Lifecycle.RENEGOTIATED) throw new InvalidStateException("O título " + code + " foi renegociado e não muda.");
        if (amount.compareTo(received) < 0) {
            throw new InvalidStateException("O título " + code + " já tem " + received.toBrl() + (direction == Direction.PAYABLE ? " pago" : " recebido")
                    + "; o valor da parcela não pode ficar abaixo disso.");
        }
        if (lifecycle == Lifecycle.ACTIVE && newDue.equals(dueDate) && amount.compareTo(original) == 0 && label.equals(originLabel)) return this;
        return new FinancialTitle(id, code, direction, counterpartyId, originType, originId, label, projectId, category,
                direction == Direction.RECEIVABLE ? YearMonth.from(newDue) : competence, issueDate, newDue, amount, received,
                Lifecycle.ACTIVE, null, documentNumber, notes, version + 1, createdAt, createdBy, now, actor);
    }

    private FinancialTitle with(Money newReceived, Lifecycle newLifecycle, String reason, Instant now, String actor) {
        return new FinancialTitle(id, code, direction, counterpartyId, originType, originId, originLabel, projectId, category,
                competence, issueDate, dueDate, original, newReceived, newLifecycle, reason, documentNumber, notes, version + 1, createdAt, createdBy, now, actor);
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
    public String documentNumber() { return documentNumber; }
    public String notes() { return notes; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
