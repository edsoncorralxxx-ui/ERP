package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Liquidação (docs/backend/12, §4): um recebimento ou um pagamento numa conta, numa data, repartido entre títulos. O total é a soma
 * exata das alocações (INV-ST-1) e cada título aparece uma vez, na mesma direção (INV-ST-2). O estorno é total
 * (PD-005): a liquidação continua consultável como REVERSED, com motivo, data, ator e o movimento de caixa inverso.
 * Crédito do parceiro e componentes explícitos (juros, tarifas) ficam para depois (PD-004).
 */
public final class Settlement {

    public enum Status { POSTED, REVERSED }

    public record Allocation(UUID titleId, Money amount) {
        public Allocation {
            Objects.requireNonNull(titleId);
            Objects.requireNonNull(amount);
        }
    }

    public record Reversal(UUID id, String reason, LocalDate effectiveDate, UUID cashMovementId, Instant at, String by) { }

    private final UUID id;
    private final String code;
    private final FinancialTitle.Direction direction;
    private final UUID accountId;
    private final UUID counterpartyId;
    private final LocalDate effectiveDate;
    private final Money total;
    private final List<Allocation> allocations;
    private final String notes;
    private final Status status;
    private final Reversal reversal;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Settlement(UUID id, String code, FinancialTitle.Direction direction, UUID accountId, UUID counterpartyId,
                      LocalDate effectiveDate, Money total, List<Allocation> allocations, String notes, Status status,
                      Reversal reversal, long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.direction = Objects.requireNonNull(direction);
        this.accountId = Objects.requireNonNull(accountId);
        this.counterpartyId = Objects.requireNonNull(counterpartyId);
        this.effectiveDate = Objects.requireNonNull(effectiveDate);
        this.total = Objects.requireNonNull(total);
        this.allocations = List.copyOf(allocations);
        this.notes = notes;
        this.status = Objects.requireNonNull(status);
        this.reversal = reversal;
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /**
     * Nova liquidação. Confere INV-ST-1 (Σ alocações = total, sem diferença que suma) e INV-ST-2 (título uma vez só);
     * as alocações contra o saldo de cada título são conferidas pelo serviço, com os títulos bloqueados.
     */
    public static Settlement post(String code, FinancialTitle.Direction direction, UUID accountId, UUID counterpartyId,
                                  LocalDate effectiveDate, Money total, List<Allocation> allocations, String notes, Instant now,
                                  String actor) {
        check(total, allocations);
        return new Settlement(UUID.randomUUID(), code, direction, accountId, counterpartyId, effectiveDate, total, allocations,
                notes, Status.POSTED, null, 1, now, actor, now, actor);
    }

    /** INV-ST-1 e INV-ST-2, conferidos antes de tocar o banco. */
    public static void check(Money total, List<Allocation> allocations) {
        if (allocations.isEmpty()) {
            throw new RuleViolationException("SETTLEMENT_INVALID", "Informe ao menos um título.",
                    List.of(new FieldIssue("allocations", "Obrigatório.")));
        }
        Set<UUID> seen = new HashSet<>();
        Money sum = Money.zero(Currency.BRL);
        for (int i = 0; i < allocations.size(); i++) {
            Allocation a = allocations.get(i);
            if (!seen.add(a.titleId())) {
                throw new RuleViolationException("SETTLEMENT_DIRECTION_MISMATCH", "Cada título aparece uma vez só na liquidação.",
                        List.of(new FieldIssue("allocations[" + i + "].titleId", "Título repetido.")));
            }
            if (a.amount().isNegative() || a.amount().isZero()) {
                throw new RuleViolationException("SETTLEMENT_INVALID", "O valor de cada título deve ser maior que zero.",
                        List.of(new FieldIssue("allocations[" + i + "].amountCents", "Deve ser maior que zero.")));
            }
            sum = sum.plus(a.amount());
        }
        if (!sum.equals(total)) {
            throw new RuleViolationException("SETTLEMENT_UNBALANCED", "O total recebido (" + total.toBrl()
                    + ") difere da soma dos títulos (" + sum.toBrl() + "); diferença de " + total.minus(sum).toBrl() + ".",
                    List.of(new FieldIssue("amountCents", "Diferença de " + total.minus(sum).toBrl() + ".")));
        }
    }

    /** Estorno total: preserva a liquidação como REVERSED. Estornar de novo é tratado pelo serviço (INV-ST-6). */
    public Settlement reverse(Reversal r) {
        if (status == Status.REVERSED) throw new IllegalStateException("Liquidação " + code + " já estornada.");
        return new Settlement(id, code, direction, accountId, counterpartyId, effectiveDate, total, allocations, notes,
                Status.REVERSED, r, version + 1, createdAt, createdBy, r.at(), r.by());
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
    public Status status() { return status; }
    public Reversal reversal() { return reversal; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
