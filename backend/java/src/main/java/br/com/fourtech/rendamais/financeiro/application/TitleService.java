package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.api.TitleCancellationGuard;
import br.com.fourtech.rendamais.financeiro.api.TitleIssuanceApi;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Títulos financeiros: emissão e cancelamento pedidos por outros módulos (na transação deles, com auditoria e evento)
 * e as consultas das telas de contas a receber e a pagar. O título a pagar manual fica no {@link PayableService}. Recebimentos e estornos ficam no {@link SettlementService}.
 */
@Service
public class TitleService implements TitleIssuanceApi, TitleQueryApi {

    static final String ENTITY = "financial_title";

    private final FinancialTitleRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final Clock clock;
    private final List<TitleCancellationGuard> guards;

    public TitleService(FinancialTitleRepository repository, AuditTrail audit, AuditQuery auditQuery, Outbox outbox, Clock clock,
                        List<TitleCancellationGuard> guards) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.clock = clock;
        this.guards = List.copyOf(guards);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<UUID> issueReceivables(IssueRequest r) {
        return issue(r.originType(), r.installments(), (i, now, actor) -> FinancialTitle.receivable(repository.nextReceivableCode(),
                r.counterpartyId(), r.originType(), i.originId(), i.label(), r.projectId(), r.category(), r.issueDate(), i.dueDate(),
                i.amount(), now, actor));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<UUID> issuePayables(PayableRequest r) {
        return issue(r.originType(), r.installments(), (i, now, actor) -> FinancialTitle.payable(repository.nextPayableCode(),
                r.counterpartyId(), r.originType(), i.originId(), i.label(), r.projectId(), r.category(), r.competence(), r.issueDate(),
                i.dueDate(), i.amount(), null, null, now, actor));
    }

    interface Factory {
        FinancialTitle create(Installment installment, Instant now, String actor);
    }

    /** Um título por parcela; a origem que já tem título devolve o existente (INV-FT-3). */
    List<UUID> issue(String originType, List<Installment> installments, Factory factory) {
        String actor = CurrentUserHolder.actorName();
        Map<String, FinancialTitle> existing = repository.findByOriginForUpdate(originType,
                        installments.stream().map(Installment::originId).toList())
                .stream().collect(Collectors.toMap(FinancialTitle::originId, Function.identity()));
        Instant now = clock.instant();
        List<UUID> ids = new ArrayList<>();
        for (Installment i : installments) {
            FinancialTitle t = existing.get(i.originId());
            if (t == null) {
                t = factory.create(i, now, actor);
                repository.insert(t);
                created(t, actor);
            }
            ids.add(t.id());
        }
        return ids;
    }

    /** Auditoria e evento {@code FinancialTitleCreated} de um título novo. */
    void created(FinancialTitle t, String actor) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, t.code()));
        changes.put("origin", new AuditEntry.Change(null, t.originLabel()));
        changes.put("category", new AuditEntry.Change(null, t.category()));
        changes.put("competence", new AuditEntry.Change(null, t.competence().toString()));
        changes.put("dueDate", new AuditEntry.Change(null, t.dueDate().toString()));
        changes.put("originalCents", new AuditEntry.Change(null, t.original().centsAsString()));
        if (t.documentNumber() != null) changes.put("documentNumber", new AuditEntry.Change(null, t.documentNumber()));
        audit.record(new AuditEntry(actor, "FINANCIAL_TITLE_CREATED", ENTITY, t.id().toString(), t.version(), t.notes(), changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("titleId", t.id().toString());
        payload.put("direction", t.direction().name());
        payload.put("originRef", t.originType() + ":" + t.originId());
        payload.put("amountCents", t.original().centsAsString());
        payload.put("dueDate", t.dueDate().toString());
        payload.put("competence", t.competence().toString());
        payload.put("projectId", t.projectId() == null ? null : t.projectId().toString());
        outbox.append("FinancialTitleCreated", ENTITY, t.id().toString(), payload, actor);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<UUID> cancelOpen(String originType, List<String> originIds, String reason) {
        String actor = CurrentUserHolder.actorName();
        Instant now = clock.instant();
        List<FinancialTitle> titles = repository.findByOriginForUpdate(originType, originIds);
        // Confere todos antes de cancelar qualquer um: ou cancela tudo, ou nada.
        List<FinancialTitle> active = titles.stream().filter(t -> t.lifecycle() != FinancialTitle.Lifecycle.CANCELLED).toList();
        // Junta todos os efeitos que impedem (recebimento aqui; nota vinculada nos outros módulos, com os títulos já
        // bloqueados), para a recusa listar tudo o que o usuário precisa desfazer.
        List<String> blocked = new ArrayList<>();
        List<FinancialTitle> cancelled = new ArrayList<>();
        for (FinancialTitle t : active) {
            try {
                cancelled.add(t.cancel(reason, now, actor));
            } catch (InvalidStateException e) {
                blocked.add(e.getMessage());
            }
        }
        List<TitleCancellationGuard.Cancelling> refs = active.stream()
                .map(t -> new TitleCancellationGuard.Cancelling(t.id(), t.code(), t.original().cents())).toList();
        for (TitleCancellationGuard g : refs.isEmpty() ? List.<TitleCancellationGuard>of() : guards) {
            try {
                g.checkCancellable(refs);
            } catch (InvalidStateException e) {
                blocked.add(e.getMessage());
            }
        }
        if (!blocked.isEmpty()) throw new InvalidStateException(String.join(" ", blocked));
        for (FinancialTitle t : cancelled) {
            repository.update(t);
            cancelled(t, reason, actor);
        }
        return cancelled.stream().map(FinancialTitle::id).toList();
    }

    /** Auditoria e evento {@code FinancialTitleCancelled} de um título que acabou de ser cancelado. */
    void cancelled(FinancialTitle t, String reason, String actor) {
        audit.record(new AuditEntry(actor, "FINANCIAL_TITLE_CANCELLED", ENTITY, t.id().toString(), t.version(), reason,
                Map.of("status", new AuditEntry.Change(FinancialTitle.Status.OPEN.name(), FinancialTitle.Status.CANCELLED.name())),
                CorrelationId.current()));
        outbox.append("FinancialTitleCancelled", ENTITY, t.id().toString(),
                Map.of("titleId", t.id().toString(), "reason", reason), actor);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TitleView> byOrigin(String originType, List<String> originIds) {
        return repository.findByOrigin(originType, originIds).stream().map(TitleService::view).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TitleView> byIds(List<UUID> ids) {
        return repository.findByIds(ids).stream().map(TitleService::view).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TitleView> activeReceivablesOf(UUID counterpartyId) {
        return repository.activeReceivablesOf(counterpartyId).stream().map(TitleService::view).toList();
    }

    @Transactional(readOnly = true)
    public List<FinancialTitleRepository.Summary> list(FinancialTitle.Direction direction, String search, UUID projectId,
                                                       UUID counterpartyId, FinancialTitleRepository.Filter filter, LocalDate today) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(direction, search == null || search.isBlank() ? null : search.strip(), projectId, counterpartyId,
                filter, today, 500);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        repository.findById(id).orElseThrow(() -> new NotFoundException("Título não encontrado."));
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional(readOnly = true)
    public FinancialTitleRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Título não encontrado."));
    }

    @Override
    @Transactional(propagation = Propagation.SUPPORTS)
    public java.util.Map<UUID, LocalDate> lastSettlementDates(List<UUID> ids) {
        return repository.lastSettlementDates(ids);
    }

    static TitleView view(FinancialTitle t) {
        return new TitleView(t.id(), t.code(), t.originId(), t.originLabel(), t.dueDate(), t.competence().toString(),
                t.original().cents(), t.received().cents(), t.balance().cents(), t.status().name(), t.direction().name(),
                t.counterpartyId(), t.projectId());
    }
}
