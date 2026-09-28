package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Liquidação (formulário "receber", comando PostSettlement): um valor que entrou numa conta numa data, distribuído entre
 * títulos da mesma direção. A soma das alocações é sempre o total (INV-ST-1; crédito e componentes explícitos ficam
 * para a PD-004). O estorno é total (PD-005) e preserva a liquidação como REVERSED (INV-ST-4).
 */
public final class Settlement {

    public enum Status { POSTED, REVERSED }

    /** Parte do total aplicada a um título. */
    public record Allocation(UUID titleId, Money amount) {
        public Allocation {
            Objects.requireNonNull(titleId);
            Objects.requireNonNull(amount);
        }
    }

    /** Estorno registrado: quando, quem e por quê. */
    public record Reversal(String reason, Instant at, String by) { }

    private final UUID id;
    private final String code;
    private final FinancialTitle.Direction direction;
    private final UUID accountId;
    private final UUID counterpartyId;
    private final LocalDate effectiveDate;
    private final Money total;
    private final List<Allocation> allocations;
    private final String notes;
    private final Reversal reversal;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Settlement(UUID id, String code, FinancialTitle.Direction direction, UUID accountId, UUID counterpartyId,
                      LocalDate effectiveDate, Money total, List<Allocation> allocations, String notes, Reversal reversal,
                      long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.direction = Objects.requireNonNull(direction);
        this.accountId = Objects.requireNonNull(accountId);
        this.counterpartyId = Objects.requireNonNull(counterpartyId);
        this.effectiveDate = Objects.requireNonNull(effectiveDate);
        this.total = Objects.requireNonNull(total);
        this.allocations = List.copyOf(allocations);
        this.notes = notes;
        this.reversal = reversal;
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /**
     * Nova liquidação. Confere antes de tocar os títulos: total positivo, ao menos uma alocação, cada título uma vez e
     * com valor positivo (INV-ST-2) e Σ alocações = total (INV-ST-1). Os problemas vêm todos juntos, por campo.
     */
    public static Settlement post(String code, FinancialTitle.Direction direction, UUID accountId, UUID counterpartyId,
                                  LocalDate effectiveDate, Money total, List<Allocation> allocations, String notes,
                                  Instant now, String actor) {
        validate(total, allocations);
        String cleanNotes = notes == null || notes.isBlank() ? null : notes.strip();
        return new Settlement(UUID.randomUUID(), code, direction, accountId, counterpartyId, effectiveDate, total, allocations,
                cleanNotes, null, 1, now, actor, now, actor);
    }

    /** INV-ST-1 e INV-ST-2, sem tocar o banco: o serviço confere antes de bloquear os títulos. */
    public static void validate(Money total, List<Allocation> allocations) {
        List<FieldIssue> issues = new ArrayList<>();
        if (total.currency() != Currency.BRL || total.isNegative() || total.isZero()) {
            issues.add(new FieldIssue("amountCents", "Informe um valor maior que zero."));
        }
        if (allocations.isEmpty()) issues.add(new FieldIssue("allocations", "Informe ao menos um título."));
        Set<UUID> seen = new HashSet<>();
        Money sum = Money.zero(Currency.BRL);
        for (int i = 0; i < allocations.size(); i++) {
            Allocation a = allocations.get(i);
            if (!seen.add(a.titleId())) issues.add(new FieldIssue("allocations[" + i + "].titleId", "Título repetido na liquidação."));
            if (a.amount().isNegative() || a.amount().isZero()) {
                issues.add(new FieldIssue("allocations[" + i + "].amountCents", "Informe um valor maior que zero."));
            } else {
                sum = sum.plus(a.amount());
            }
        }
        if (!issues.isEmpty()) throw new RuleViolationException("SETTLEMENT_INVALID", "Corrija os campos indicados.", issues);
        if (!sum.equals(total)) {
            String msg = "A soma das alocações (" + sum.toBrl() + ") difere do valor recebido (" + total.toBrl() + ").";
            throw new RuleViolationException("SETTLEMENT_UNBALANCED", msg, List.of(new FieldIssue("amountCents", msg)));
        }
    }

    /** Estorno total com motivo. Estornar de novo devolve o estorno existente (INV-ST-6): quem chama confere antes. */
    public Settlement reverse(String reason, Instant now, String actor) {
        if (reversal != null) return this;
        return new Settlement(id, code, direction, accountId, counterpartyId, effectiveDate, total, allocations, notes,
                new Reversal(reason, now, actor), version + 1, createdAt, createdBy, now, actor);
    }

    public Status status() {
        return reversal == null ? Status.POSTED : Status.REVERSED;
    }

    public UUID id() { return id; }
    public String code() { return code; }
    public FinancialTitle.Direction direction() { return direction; }
    public UUID accountId() { return accountId; }
    public UUID counterpartyId() { return counterpartyId; }
    public LocalDate effectiveDate() { return effectiveDate; }
    public Money total() { return total; }
    public List<Allocation> allocations() { return allocations; }
    public String notes() { return notes; }
    public Reversal reversal() { return reversal; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
