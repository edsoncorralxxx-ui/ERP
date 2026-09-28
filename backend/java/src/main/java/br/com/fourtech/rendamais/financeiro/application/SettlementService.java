package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Recebimentos e estornos (docs/backend/13, §4 e §5). A baixa, numa transação: confere INV-ST-1/2 antes do banco,
 * bloqueia os títulos em ordem crescente de id (INV-ST-3), aplica cada alocação contra o saldo (INV-FT-1), cria o
 * movimento de entrada na conta e grava recibo, auditoria e evento. O estorno é total (PD-005): devolve o saldo aos
 * mesmos títulos, cria o movimento inverso e preserva a liquidação como estornada; estornar de novo devolve o mesmo
 * estorno (INV-ST-6).
 */
@Service
public class SettlementService {

    static final String ENTITY = "settlement";
    /** Datas de negócio no fuso da empresa; instantes de auditoria continuam em UTC. */
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

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

    /** Corpo do PostSettlement, como chega da API: valores em centavos como texto de inteiro (ADR-006). */
    public record PostRequest(String direction, String accountId, String effectiveDate, String amountCents, String currency,
                              List<AllocationRequest> allocations, String creditCents, String notes) { }

    public record AllocationRequest(String titleId, String amountCents, String expectedTitleVersion) { }

    @Transactional(readOnly = true)
    public List<SettlementRepository.Summary> list(UUID titleId, UUID accountId) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(titleId, accountId, 500);
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

    /** PostSettlement: registra um recebimento; a mesma chave devolve o mesmo recebimento. */
    @Transactional
    public SettlementRepository.Summary post(String idempotencyKey, PostRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_SETTLE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "PostSettlement", r);
        if (done.isPresent()) return view(UUID.fromString(done.get()));

        Parsed p = parse(r);
        Settlement.check(p.total(), p.allocations());
        BankAccount account = accounts.findForShare(p.accountId()).orElseThrow(() -> new RuleViolationException("SETTLEMENT_INVALID",
                "Conta financeira não encontrada.", List.of(new FieldIssue("accountId", "Conta não encontrada."))));
        if (account.status() != BankAccount.Status.ATIVO) {
            throw new RuleViolationException("ACCOUNT_INACTIVE", "A conta " + account.code() + " — " + account.name()
                    + " está inativa e não recebe lançamentos.", List.of(new FieldIssue("accountId", "Conta inativa.")));
        }

        // INV-ST-3: títulos bloqueados em ordem crescente de id; quem chega depois espera e vê o saldo já baixado.
        List<UUID> ids = p.allocations().stream().map(Settlement.Allocation::titleId).sorted().toList();
        Map<UUID, FinancialTitle> locked = titles.findByIdsForUpdate(ids).stream()
                .collect(Collectors.toMap(FinancialTitle::id, Function.identity()));
        UUID counterparty = null;
        Instant now = clock.instant();
        List<FinancialTitle[]> changed = new ArrayList<>();
        for (int i = 0; i < p.allocations().size(); i++) {
            Settlement.Allocation a = p.allocations().get(i);
            FinancialTitle t = locked.get(a.titleId());
            if (t == null) {
                throw new RuleViolationException("SETTLEMENT_INVALID", "Título não encontrado.",
                        List.of(new FieldIssue("allocations[" + i + "].titleId", "Título não encontrado.")));
            }
            if (t.direction() != p.direction()) {
                throw new RuleViolationException("SETTLEMENT_DIRECTION_MISMATCH", "O título " + t.code()
                        + " não é uma conta a receber.", List.of(new FieldIssue("allocations[" + i + "].titleId", "Direção diferente.")));
            }
            if (counterparty != null && !counterparty.equals(t.counterpartyId())) {
                throw new RuleViolationException("SETTLEMENT_INVALID", "Um recebimento é de um só cliente; o título " + t.code()
                        + " é de outro cliente.", List.of(new FieldIssue("allocations[" + i + "].titleId", "Cliente diferente.")));
            }
            counterparty = t.counterpartyId();
            Long expected = p.expectedVersions().get(i);
            if (expected != null && expected != t.version()) throw new VersionConflictException(TitleService.ENTITY, expected, t.version());
            changed.add(new FinancialTitle[]{t, t.applyAllocation(a.amount(), now, user.username())});
        }

        Settlement s = Settlement.post(repository.nextCode(), p.direction(), account.id(), counterparty, p.effectiveDate(), p.total(),
                p.allocations(), p.notes(), now, user.username());
        repository.insert(s);
        UUID movement = UUID.randomUUID();
        accounts.insertMovement(movement, account.id(), s.effectiveDate(), s.total().cents(), "SETTLEMENT", s.id(), null,
                "Recebimento " + s.code(), now, user.username());
        changed.sort(Comparator.comparing(c -> c[0].id()));
        for (FinancialTitle[] c : changed) {
            titles.update(c[1]);
            titleAudit(user, "FINANCIAL_TITLE_SETTLED", c[0], c[1], null, s);
        }

        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, s.code()));
        changes.put("account", new AuditEntry.Change(null, account.code() + " — " + account.name()));
        changes.put("effectiveDate", new AuditEntry.Change(null, s.effectiveDate().toString()));
        changes.put("totalCents", new AuditEntry.Change(null, s.total().centsAsString()));
        changes.put("titles", new AuditEntry.Change(null, changed.stream().map(c -> c[0].code()).collect(Collectors.joining(", "))));
        audit.record(new AuditEntry(user.username(), "SETTLEMENT_POSTED", ENTITY, s.id().toString(), s.version(), s.notes(), changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("settlementId", s.id().toString());
        payload.put("direction", s.direction().name());
        payload.put("accountId", account.id().toString());
        payload.put("effectiveDate", s.effectiveDate().toString());
        payload.put("totalCents", s.total().centsAsString());
        payload.put("allocations", s.allocations().stream().map(a -> Map.of("titleId", a.titleId().toString(),
                "amountCents", a.amount().centsAsString())).toList());
        payload.put("creditCents", "0");
        outbox.append("SettlementPosted", ENTITY, s.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, s.id().toString());
        return view(s.id());
    }

    /**
     * ReverseSettlement: estorno total com motivo. Liquidação já estornada devolve o estorno existente (INV-ST-6). A
     * conciliação ainda não existe; quando existir, liquidação conciliada será recusada (PD-006, SETTLEMENT_RECONCILED).
     */
    @Transactional
    public SettlementRepository.Summary reverse(UUID id, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SETTLEMENT_REVERSE);
        Settlement current = repository.findForUpdate(id).orElseThrow(SettlementService::notFound);
        if (current.status() == Settlement.Status.REVERSED) return view(id);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("SETTLEMENT_INVALID", "Informe o motivo do estorno.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Instant now = clock.instant();
        LocalDate today = LocalDate.now(clock.withZone(BUSINESS_ZONE));
        Map<UUID, Money> byTitle = current.allocations().stream()
                .collect(Collectors.toMap(Settlement.Allocation::titleId, Settlement.Allocation::amount));
        List<FinancialTitle> locked = titles.findByIdsForUpdate(byTitle.keySet().stream().sorted().toList());
        List<FinancialTitle[]> changed = new ArrayList<>();
        for (FinancialTitle t : locked) {
            changed.add(new FinancialTitle[]{t, t.reverseAllocation(byTitle.get(t.id()), now, user.username())});
        }
        UUID original = accounts.settlementMovement(id).orElseThrow(() -> new IllegalStateException("Liquidação sem movimento: " + id));
        UUID movement = UUID.randomUUID();
        accounts.insertMovement(movement, current.accountId(), today, current.total().negate().cents(), "SETTLEMENT_REVERSAL", id,
                original, "Estorno do recebimento " + current.code(), now, user.username());
        Settlement reversed = current.reverse(new Settlement.Reversal(UUID.randomUUID(), why, today, movement, now, user.username()));
        repository.reverse(reversed, current.version());
        for (FinancialTitle[] c : changed) {
            titles.update(c[1]);
            titleAudit(user, "FINANCIAL_TITLE_SETTLEMENT_REVERSED", c[0], c[1], why, current);
        }
        audit.record(new AuditEntry(user.username(), "SETTLEMENT_REVERSED", ENTITY, id.toString(), reversed.version(), why,
                Map.of("status", new AuditEntry.Change(current.status().name(), reversed.status().name()),
                        "reversalDate", new AuditEntry.Change(null, today.toString())), CorrelationId.current()));
        outbox.append("SettlementReversed", ENTITY, id.toString(), Map.of("reversalId", reversed.reversal().id().toString(),
                "settlementId", id.toString(), "reason", why), user.username());
        return view(id);
    }

    private void titleAudit(CurrentUser user, String action, FinancialTitle before, FinancialTitle after, String reason, Settlement s) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("settlement", new AuditEntry.Change(null, s.code()));
        changes.put("receivedCents", new AuditEntry.Change(before.received().centsAsString(), after.received().centsAsString()));
        changes.put("balanceCents", new AuditEntry.Change(before.balance().centsAsString(), after.balance().centsAsString()));
        if (before.status() != after.status()) {
            changes.put("status", new AuditEntry.Change(before.status().name(), after.status().name()));
        }
        audit.record(new AuditEntry(user.username(), action, TitleService.ENTITY, after.id().toString(), after.version(), reason, changes,
                CorrelationId.current()));
    }

    private record Parsed(FinancialTitle.Direction direction, UUID accountId, LocalDate effectiveDate, Money total,
                          List<Settlement.Allocation> allocations, List<Long> expectedVersions, String notes) { }

    /** Formato e campos obrigatórios; as regras entre campos vêm depois (INV-ST-1/2) e, com o banco, as dos títulos. */
    private Parsed parse(PostRequest r) {
        List<FieldIssue> issues = new ArrayList<>();
        FinancialTitle.Direction direction = FinancialTitle.Direction.RECEIVABLE;
        if (r.direction() != null && !r.direction().isBlank() && !"RECEIVABLE".equals(r.direction().strip())) {
            throw new RuleViolationException("SETTLEMENT_DIRECTION_MISMATCH",
                    "Nesta versão só há recebimentos (RECEIVABLE); pagamentos entram com as contas a pagar.",
                    List.of(new FieldIssue("direction", "Use RECEIVABLE.")));
        }
        if (r.currency() != null && !r.currency().isBlank() && !"BRL".equals(r.currency().strip())) {
            issues.add(new FieldIssue("currency", "Só reais (BRL)."));
        }
        if (r.creditCents() != null && !r.creditCents().isBlank() && !r.creditCents().strip().matches("0+")) {
            issues.add(new FieldIssue("creditCents", "Crédito do cliente ainda não é aceito (PD-004): o valor recebido deve fechar com os títulos."));
        }
        UUID accountId = uuid(r.accountId(), "accountId", "Informe a conta.", issues);
        LocalDate date = null;
        if (r.effectiveDate() == null || r.effectiveDate().isBlank()) {
            issues.add(new FieldIssue("effectiveDate", "Informe a data do recebimento."));
        } else {
            try {
                date = LocalDate.parse(r.effectiveDate().strip());
                if (date.isAfter(LocalDate.now(clock.withZone(BUSINESS_ZONE)))) {
                    issues.add(new FieldIssue("effectiveDate", "A data do recebimento não pode ser futura."));
                }
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("effectiveDate", "Data inválida."));
            }
        }
        Money total = cents(r.amountCents(), "amountCents", issues);
        if (total != null && (total.isZero() || total.isNegative())) issues.add(new FieldIssue("amountCents", "Deve ser maior que zero."));
        if (r.notes() != null && r.notes().strip().length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        List<Settlement.Allocation> allocations = new ArrayList<>();
        List<Long> versions = new ArrayList<>();
        List<AllocationRequest> raw = r.allocations() == null ? List.of() : r.allocations();
        for (int i = 0; i < raw.size(); i++) {
            AllocationRequest a = raw.get(i);
            String f = "allocations[" + i + "]";
            UUID title = uuid(a == null ? null : a.titleId(), f + ".titleId", "Informe o título.", issues);
            Money amount = cents(a == null ? null : a.amountCents(), f + ".amountCents", issues);
            Long version = null;
            if (a != null && a.expectedTitleVersion() != null && !a.expectedTitleVersion().isBlank()) {
                try {
                    version = Long.parseLong(a.expectedTitleVersion().strip().replace("\"", ""));
                } catch (NumberFormatException e) {
                    issues.add(new FieldIssue(f + ".expectedTitleVersion", "Versão inválida."));
                }
            }
            if (title != null && amount != null) allocations.add(new Settlement.Allocation(title, amount));
            versions.add(version);
        }
        if (!issues.isEmpty()) throw new RuleViolationException("SETTLEMENT_INVALID", "Corrija os campos indicados.", issues);
        String notes = r.notes() == null || r.notes().isBlank() ? null : r.notes().strip();
        return new Parsed(direction, accountId, date, total, allocations, versions, notes);
    }

    private static UUID uuid(String raw, String field, String missing, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            issues.add(new FieldIssue(field, missing));
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
        try {
            return Money.parseCents(raw == null ? null : raw.strip(), Currency.BRL);
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Valor em centavos inválido."));
            return null;
        }
    }

    private SettlementRepository.Summary view(UUID id) {
        return repository.find(id).orElseThrow(SettlementService::notFound);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Recebimento não encontrado.");
    }
}
