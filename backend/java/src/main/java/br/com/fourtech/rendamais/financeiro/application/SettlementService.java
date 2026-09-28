package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.financeiro.domain.CashMovement;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Recebimentos (docs/backend/13, §4 e §5): PostSettlement distribui um valor recebido numa conta entre títulos a
 * receber, com baixa parcial; ReverseSettlement estorna a liquidação inteira (PD-005). Cada comando, numa transação:
 * títulos bloqueados em ordem de id (INV-ST-3), saldo nunca negativo (INV-FT-1), movimento de caixa, recibo, auditoria
 * (da liquidação e de cada título) e evento.
 */
@Service
public class SettlementService {

    static final String ENTITY = "settlement";
    /** Datas de negócio (data do recebimento) no fuso da empresa. */
    static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final SettlementRepository repository;
    private final FinancialTitleRepository titles;
    private final BankAccountRepository accounts;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public SettlementService(SettlementRepository repository, FinancialTitleRepository titles, BankAccountRepository accounts,
                             AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.titles = titles;
        this.accounts = accounts;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Alocação como chega da API: valores em centavos e versões como texto. */
    public record AllocationData(String titleId, String amountCents, String expectedTitleVersion) { }

    public record PostData(String direction, String accountId, String effectiveDate, String amountCents, List<AllocationData> allocations,
                           String notes) { }

    private record Parsed(UUID accountId, LocalDate effectiveDate, Money total, List<Settlement.Allocation> allocations,
                          Map<UUID, Long> expectedVersions, String notes) { }

    @Transactional(readOnly = true)
    public List<SettlementRepository.Summary> list(UUID titleId, UUID customerId, String search, boolean includeReversed) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(titleId, customerId, search == null || search.isBlank() ? null : search.strip(), includeReversed, 500);
    }

    @Transactional(readOnly = true)
    public SettlementRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return view(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        view(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /**
     * PostSettlement (direção a receber). A mesma chave devolve o mesmo recebimento; um recebimento acima do saldo é
     * recusado inteiro, com o saldo atual (INV-FT-1). Dois recebimentos simultâneos no mesmo título se enfileiram no
     * bloqueio do título: o segundo enxerga o saldo que o primeiro deixou.
     */
    @Transactional
    public SettlementRepository.Summary post(String idempotencyKey, PostData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_SETTLE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "PostSettlement", data);
        if (done.isPresent()) return view(UUID.fromString(done.get()));

        Parsed p = parse(data);
        Settlement.validate(p.total(), p.allocations());
        BankAccount account = accounts.findById(p.accountId()).filter(BankAccount::active).orElseThrow(() ->
                new RuleViolationException("ACCOUNT_INACTIVE", "Conta inexistente ou inativa.", List.of(new FieldIssue("accountId", "Conta inexistente ou inativa."))));

        List<UUID> ids = p.allocations().stream().map(Settlement.Allocation::titleId).toList();
        Map<UUID, FinancialTitle> locked = titles.findByIdsForUpdate(ids).stream()
                .collect(Collectors.toMap(FinancialTitle::id, Function.identity()));
        List<FieldIssue> issues = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            FinancialTitle t = locked.get(ids.get(i));
            if (t == null) issues.add(new FieldIssue("allocations[" + i + "].titleId", "Título não encontrado."));
            else if (t.direction() != FinancialTitle.Direction.RECEIVABLE) {
                throw new RuleViolationException("SETTLEMENT_DIRECTION_MISMATCH", "O título " + t.code() + " não é a receber.",
                        List.of(new FieldIssue("allocations[" + i + "].titleId", "Título a pagar num recebimento.")));
            }
        }
        if (!issues.isEmpty()) throw new RuleViolationException("SETTLEMENT_INVALID", "Corrija os campos indicados.", issues);
        UUID counterparty = locked.get(ids.get(0)).counterpartyId();
        for (int i = 0; i < ids.size(); i++) {
            FinancialTitle t = locked.get(ids.get(i));
            if (!t.counterpartyId().equals(counterparty)) {
                issues.add(new FieldIssue("allocations[" + i + "].titleId", "Título de outro cliente: um recebimento vem de um único cliente."));
            }
            Long expected = p.expectedVersions().get(t.id());
            if (expected != null && expected != t.version()) throw new VersionConflictException(TitleService.ENTITY, expected, t.version());
        }
        if (!issues.isEmpty()) throw new RuleViolationException("SETTLEMENT_INVALID", "Corrija os campos indicados.", issues);

        Instant now = clock.instant();
        List<FinancialTitle[]> changed = new ArrayList<>();
        for (int i = 0; i < p.allocations().size(); i++) {
            Settlement.Allocation a = p.allocations().get(i);
            FinancialTitle before = locked.get(a.titleId());
            try {
                changed.add(new FinancialTitle[]{before, before.applyAllocation(a.amount(), now, user.username())});
            } catch (FinancialTitle.InsufficientBalanceException e) {
                throw new RuleViolationException("INSUFFICIENT_TITLE_BALANCE", e.getMessage(),
                        List.of(new FieldIssue("allocations[" + i + "].amountCents", "Saldo atual " + e.balance().toBrl() + ".")));
            }
        }

        Settlement s = Settlement.post(repository.nextReceiptCode(), FinancialTitle.Direction.RECEIVABLE, account.id(), counterparty,
                p.effectiveDate(), p.total(), p.allocations(), p.notes(), now, user.username());
        repository.insert(s);
        changed.forEach(c -> titles.update(c[1]));
        String titleCodes = changed.stream().map(c -> c[1].code()).collect(Collectors.joining(", "));
        repository.insertCashMovement(CashMovement.inflow(s, "Recebimento " + s.code() + " — " + titleCodes, now, user.username()));

        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, s.code()));
        changes.put("account", new AuditEntry.Change(null, account.code() + " — " + account.name()));
        changes.put("effectiveDate", new AuditEntry.Change(null, s.effectiveDate().toString()));
        changes.put("totalCents", new AuditEntry.Change(null, s.total().centsAsString()));
        changes.put("titles", new AuditEntry.Change(null, titleCodes));
        audit.record(new AuditEntry(user.username(), "SETTLEMENT_POSTED", ENTITY, s.id().toString(), s.version(), s.notes(), changes,
                CorrelationId.current()));
        String receivedOn = s.code() + " de " + s.effectiveDate().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        for (FinancialTitle[] c : changed) titleAudit(user, "FINANCIAL_TITLE_SETTLED", c[0], c[1], receivedOn);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("settlementId", s.id().toString());
        payload.put("direction", s.direction().name());
        payload.put("accountId", s.accountId().toString());
        payload.put("effectiveDate", s.effectiveDate().toString());
        payload.put("totalCents", s.total().centsAsString());
        payload.put("allocations", s.allocations().stream()
                .map(a -> Map.of("titleId", a.titleId().toString(), "amountCents", a.amount().centsAsString())).toList());
        payload.put("creditCents", "0");
        outbox.append("SettlementPosted", ENTITY, s.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, s.id().toString());
        return view(s.id());
    }

    /**
     * ReverseSettlement: estorno total com motivo. Os saldos voltam pelas mesmas alocações, o movimento de caixa inverso
     * fica vinculado ao original e a liquidação continua consultável como REVERSED. Estornar de novo devolve o estorno
     * existente (INV-ST-6). Conciliação ainda não existe; quando existir, liquidação conciliada será recusada (PD-006).
     */
    @Transactional
    public SettlementRepository.Summary reverse(UUID id, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SETTLEMENT_REVERSE);
        Settlement current = repository.findByIdForUpdate(id).orElseThrow(SettlementService::notFound);
        if (current.status() == Settlement.Status.REVERSED) return view(id);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("SETTLEMENT_INVALID", "Informe o motivo do estorno.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Instant now = clock.instant();
        Map<UUID, Money> amounts = current.allocations().stream()
                .collect(Collectors.toMap(Settlement.Allocation::titleId, Settlement.Allocation::amount));
        List<FinancialTitle> locked = titles.findByIdsForUpdate(List.copyOf(amounts.keySet()));
        for (FinancialTitle before : locked) {
            FinancialTitle after = before.reverseAllocation(amounts.get(before.id()), now, user.username());
            titles.update(after);
            titleAudit(user, "FINANCIAL_TITLE_SETTLEMENT_REVERSED", before, after, current.code() + " estornado: " + why);
        }
        CashMovement inflow = repository.inflowOf(id).orElseThrow(() -> new IllegalStateException("Liquidação sem movimento de caixa: " + id));
        CashMovement back = inflow.reversal("Estorno do recebimento " + current.code(), now, user.username());
        repository.insertCashMovement(back);
        Settlement reversed = current.reverse(why, now, user.username());
        repository.markReversed(reversed);
        audit.record(new AuditEntry(user.username(), "SETTLEMENT_REVERSED", ENTITY, id.toString(), reversed.version(), why,
                Map.of("status", new AuditEntry.Change(Settlement.Status.POSTED.name(), Settlement.Status.REVERSED.name())),
                CorrelationId.current()));
        outbox.append("SettlementReversed", ENTITY, id.toString(),
                Map.of("reversalId", back.id().toString(), "settlementId", id.toString(), "reason", why), user.username());
        return view(id);
    }

    /** Histórico do título: recebido, saldo e situação antes e depois, com a liquidação no motivo. */
    private void titleAudit(CurrentUser user, String action, FinancialTitle before, FinancialTitle after, String reason) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("receivedCents", new AuditEntry.Change(before.received().centsAsString(), after.received().centsAsString()));
        changes.put("balanceCents", new AuditEntry.Change(before.balance().centsAsString(), after.balance().centsAsString()));
        if (before.status() != after.status()) changes.put("status", new AuditEntry.Change(before.status().name(), after.status().name()));
        audit.record(new AuditEntry(user.username(), action, TitleService.ENTITY, after.id().toString(), after.version(), reason, changes,
                CorrelationId.current()));
    }

    private Parsed parse(PostData d) {
        List<FieldIssue> issues = new ArrayList<>();
        if (d.direction() != null && !d.direction().isBlank() && !"RECEIVABLE".equals(d.direction().strip())) {
            issues.add(new FieldIssue("direction", "Nesta fase só há recebimentos (RECEIVABLE); pagamentos entram com o contas a pagar."));
        }
        UUID account = uuid(d.accountId(), "accountId", issues);
        LocalDate date = null;
        if (d.effectiveDate() == null || d.effectiveDate().isBlank()) {
            issues.add(new FieldIssue("effectiveDate", "Obrigatório."));
        } else {
            try {
                date = LocalDate.parse(d.effectiveDate().strip());
                if (date.isAfter(LocalDate.now(clock.withZone(BUSINESS_ZONE)))) {
                    issues.add(new FieldIssue("effectiveDate", "O recebimento não pode ter data futura."));
                }
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("effectiveDate", "Data inválida."));
            }
        }
        Money total = cents(d.amountCents(), "amountCents", issues);
        List<Settlement.Allocation> allocations = new ArrayList<>();
        Map<UUID, Long> versions = new LinkedHashMap<>();
        List<AllocationData> raw = d.allocations() == null ? List.of() : d.allocations();
        for (int i = 0; i < raw.size(); i++) {
            AllocationData a = raw.get(i);
            UUID title = uuid(a == null ? null : a.titleId(), "allocations[" + i + "].titleId", issues);
            Money amount = cents(a == null ? null : a.amountCents(), "allocations[" + i + "].amountCents", issues);
            if (a != null && a.expectedTitleVersion() != null && !a.expectedTitleVersion().isBlank()) {
                String v = a.expectedTitleVersion().strip().replace("\"", "");
                if (!v.matches("\\d{1,18}")) issues.add(new FieldIssue("allocations[" + i + "].expectedTitleVersion", "Versão inválida."));
                else if (title != null) versions.put(title, Long.parseLong(v));
            }
            if (title != null && amount != null) allocations.add(new Settlement.Allocation(title, amount));
        }
        if (raw.isEmpty()) issues.add(new FieldIssue("allocations", "Informe ao menos um título."));
        String notes = d.notes() == null || d.notes().isBlank() ? null : d.notes().strip();
        if (notes != null && notes.length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("SETTLEMENT_INVALID", "Corrija os campos indicados.", issues);
        return new Parsed(account, date, total, allocations, versions, notes);
    }

    private static UUID uuid(String raw, String field, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            issues.add(new FieldIssue(field, "Obrigatório."));
            return null;
        }
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Identificador inválido."));
            return null;
        }
    }

    private static Money cents(String raw, String field, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            issues.add(new FieldIssue(field, "Obrigatório."));
            return null;
        }
        try {
            Money m = Money.parseCents(raw.strip(), Currency.BRL);
            if (m.isNegative() || m.isZero()) {
                issues.add(new FieldIssue(field, "Informe um valor maior que zero."));
                return null;
            }
            return m;
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Valor inválido."));
            return null;
        }
    }

    private SettlementRepository.Summary view(UUID id) {
        return repository.findById(id).orElseThrow(SettlementService::notFound);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Recebimento não encontrado.");
    }
}
