package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.financeiro.domain.Transfer;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Transferências entre contas próprias (TransferBetweenAccounts, Sprint 9). Numa transação: bloqueia as duas contas em
 * ordem de id, confere que estão ativas, cria a transferência, a saída na origem e a entrada no destino, e grava recibo,
 * auditoria e evento. O estorno é total, com motivo: cria os dois movimentos inversos; estornar de novo devolve o mesmo.
 */
@Service
public class TransferService {

    static final String ENTITY = "transfer";

    private final TransferRepository repository;
    private final BankAccountRepository accounts;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public TransferService(TransferRepository repository, BankAccountRepository accounts, AuditTrail audit, AuditQuery auditQuery,
                           Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.accounts = accounts;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Corpo do TransferBetweenAccounts: valor em centavos como texto de inteiro (ADR-006), data AAAA-MM-DD. */
    public record PostRequest(String fromAccountId, String toAccountId, String effectiveDate, String amountCents, String notes) { }

    @Transactional(readOnly = true)
    public List<TransferRepository.Summary> list(UUID accountId) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(accountId, 500);
    }

    @Transactional(readOnly = true)
    public TransferRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return view(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        view(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional
    public TransferRepository.Summary post(String idempotencyKey, PostRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TRANSFER_POST);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "TransferBetweenAccounts", r);
        if (done.isPresent()) return view(UUID.fromString(done.get()));

        List<FieldIssue> issues = new ArrayList<>();
        LocalDate today = LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE));
        UUID from = uuid(r == null ? null : r.fromAccountId(), "fromAccountId", "Informe a conta de origem.", issues);
        UUID to = uuid(r == null ? null : r.toAccountId(), "toAccountId", "Informe a conta de destino.", issues);
        if (from != null && from.equals(to)) issues.add(new FieldIssue("toAccountId", "A conta de destino deve ser diferente da origem."));
        LocalDate date = null;
        try {
            date = LocalDate.parse(r == null || r.effectiveDate() == null ? "" : r.effectiveDate().strip());
            if (date.isAfter(today)) issues.add(new FieldIssue("effectiveDate", "A data da transferência não pode ser futura."));
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("effectiveDate", "Informe a data da transferência."));
        }
        Money amount = null;
        try {
            amount = Money.parseCents(r == null || r.amountCents() == null ? null : r.amountCents().strip(), Currency.BRL);
            if (amount.isZero() || amount.isNegative()) issues.add(new FieldIssue("amountCents", "Deve ser maior que zero."));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("amountCents", "Informe o valor."));
        }
        String notes = r == null || r.notes() == null || r.notes().isBlank() ? null : r.notes().strip();
        if (notes != null && notes.length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("TRANSFER_INVALID", "Corrija os campos indicados.", issues);

        Map<UUID, BankAccount> locked = new LinkedHashMap<>();
        accounts.findForShare(List.of(from, to)).forEach(a -> locked.put(a.id(), a));
        BankAccount origem = active(locked.get(from), "fromAccountId");
        BankAccount destino = active(locked.get(to), "toAccountId");

        Instant now = clock.instant();
        Transfer t = new Transfer(UUID.randomUUID(), repository.nextCode(), from, to, date, amount.cents(), notes, Transfer.Status.POSTED,
                null, null, null, null, 1, now, user.username());
        repository.insert(t);
        accounts.insertTransferMovement(UUID.randomUUID(), from, date, -t.amountCents(), "TRANSFER", t.id(), null,
                "Transferência " + t.code() + " para " + destino.code() + " — " + destino.name(), now, user.username());
        accounts.insertTransferMovement(UUID.randomUUID(), to, date, t.amountCents(), "TRANSFER", t.id(), null,
                "Transferência " + t.code() + " de " + origem.code() + " — " + origem.name(), now, user.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, t.code()));
        changes.put("from", new AuditEntry.Change(null, origem.code() + " — " + origem.name()));
        changes.put("to", new AuditEntry.Change(null, destino.code() + " — " + destino.name()));
        changes.put("effectiveDate", new AuditEntry.Change(null, date.toString()));
        changes.put("amountCents", new AuditEntry.Change(null, Long.toString(t.amountCents())));
        audit.record(new AuditEntry(user.username(), "TRANSFER_POSTED", ENTITY, t.id().toString(), t.version(), notes, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("transferId", t.id().toString());
        payload.put("fromAccountId", from.toString());
        payload.put("toAccountId", to.toString());
        payload.put("amountCents", Long.toString(t.amountCents()));
        payload.put("effectiveDate", date.toString());
        outbox.append("TransferPosted", ENTITY, t.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, t.id().toString());
        return view(t.id());
    }

    /** Estorno total com motivo: os dois movimentos inversos, com a data de hoje; já estornada devolve a mesma. */
    @Transactional
    public TransferRepository.Summary reverse(UUID id, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TRANSFER_POST);
        Transfer current = repository.findForUpdate(id).orElseThrow(TransferService::notFound);
        if (current.status() == Transfer.Status.REVERSED) return view(id);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("TRANSFER_INVALID", "Informe o motivo do estorno.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Instant now = clock.instant();
        LocalDate today = LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE));
        accounts.insertTransferMovement(UUID.randomUUID(), current.fromAccountId(), today, current.amountCents(), "TRANSFER_REVERSAL", id,
                null, "Estorno da transferência " + current.code(), now, user.username());
        accounts.insertTransferMovement(UUID.randomUUID(), current.toAccountId(), today, -current.amountCents(), "TRANSFER_REVERSAL", id,
                null, "Estorno da transferência " + current.code(), now, user.username());
        Transfer reversed = current.reverse(why, today, now, user.username());
        repository.reverse(reversed, current.version());
        audit.record(new AuditEntry(user.username(), "TRANSFER_REVERSED", ENTITY, id.toString(), reversed.version(), why,
                Map.of("status", new AuditEntry.Change(current.status().name(), reversed.status().name()),
                        "reversalDate", new AuditEntry.Change(null, today.toString())), CorrelationId.current()));
        outbox.append("TransferReversed", ENTITY, id.toString(), Map.of("transferId", id.toString(), "reason", why), user.username());
        return view(id);
    }

    private static BankAccount active(BankAccount a, String field) {
        if (a == null) {
            throw new RuleViolationException("TRANSFER_INVALID", "Conta financeira não encontrada.",
                    List.of(new FieldIssue(field, "Conta não encontrada.")));
        }
        if (a.status() != BankAccount.Status.ATIVO) {
            throw new RuleViolationException("ACCOUNT_INACTIVE", "A conta " + a.code() + " — " + a.name()
                    + " está inativa e não recebe lançamentos.", List.of(new FieldIssue(field, "Conta inativa.")));
        }
        return a;
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

    private TransferRepository.Summary view(UUID id) {
        return repository.find(id).orElseThrow(TransferService::notFound);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Transferência não encontrada.");
    }
}
