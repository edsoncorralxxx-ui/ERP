package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Casos de uso das propostas (formulário "propostas"): cadastrar em rascunho (idempotente), alterar o rascunho, emitir a
 * revisão, criar a próxima revisão e registrar a perda. O ganho é registrado ao converter em pedido
 * ({@link SalesOrderService#convertProposal}).
 */
@Service
public class ProposalService {

    static final String ENTITY = "proposal";

    private final ProposalRepository repository;
    private final CommercialLookups lookups;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final OpportunityService opportunities;
    private final Clock clock;

    public ProposalService(ProposalRepository repository, CommercialLookups lookups, AuditTrail audit, AuditQuery auditQuery,
                           Outbox outbox, CommandReceipts receipts, OpportunityService opportunities, Clock clock) {
        this.opportunities = opportunities;
        this.repository = repository;
        this.lookups = lookups;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ProposalRepository.Summary> list(String search, Proposal.Status status) {
        CurrentUserHolder.require(Permissions.PROPOSAL_READ);
        return repository.list(search == null || search.isBlank() ? null : search.strip(), status, 500);
    }

    @Transactional(readOnly = true)
    public ProposalRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.PROPOSAL_READ);
        return repository.findById(id).orElseThrow(ProposalService::notFound);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        get(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** Nova proposta com a revisão 1 em rascunho; a mesma chave devolve a mesma proposta. */
    @Transactional
    public ProposalRepository.Summary draft(String idempotencyKey, Proposal.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROPOSAL_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "DraftProposal", data);
        if (done.isPresent()) return repository.findById(UUID.fromString(done.get())).orElseThrow();
        String unit = data.unitId() == null || data.unitId().isBlank() ? opportunities.unitOf(data.opportunityId()) : data.unitId();
        Proposal.Customer customer = lookups.customer("PROPOSAL_INVALID", data.customerId(), unit, false, null);
        Instant now = clock.instant();
        Proposal checked = Proposal.draft(repository.nextCode(), UUID.randomUUID(), customer, data, lookups.items(), now,
                user.username());
        UUID opportunityId = opportunities.forNewProposal(user, data.opportunityId(), customer, checked.title(),
                checked.current().totalCents(), checked.current().validUntil());
        Proposal p = new Proposal(checked.id(), checked.code(), opportunityId, checked.customerId(), checked.unitId(),
                checked.unitName(), checked.title(), checked.status(), checked.outcomeReason(), checked.revisions(),
                checked.version(), checked.createdAt(), checked.createdBy(), checked.updatedAt(), checked.updatedBy());
        repository.insert(p);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, p.code()));
        Proposal.created(p).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, "PROPOSAL_DRAFTED", p, null, changes);
        outbox.append("ProposalDrafted", ENTITY, p.id().toString(), Map.of("proposalId", p.id().toString(),
                "customerId", p.customerId().toString(), "revision", 1), user.username());
        receipts.complete(user.username(), key, p.id().toString());
        return repository.findById(p.id()).orElseThrow();
    }

    /** Altera a revisão em rascunho, com a versão lida (If-Match). */
    @Transactional
    public ProposalRepository.Summary update(UUID id, long expectedVersion, Proposal.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROPOSAL_UPDATE);
        return change(user, id, expectedVersion, "PROPOSAL_UPDATED", null, p -> p.update(
                lookups.customer("PROPOSAL_INVALID", data.customerId(), data.unitId(), false, p.customerId()), data,
                lookups.items(), clock.instant(), user.username()), p -> outbox.append("ProposalUpdated", ENTITY, id.toString(),
                Map.of("proposalId", id.toString(), "revision", p.current().number()), user.username()));
    }

    /** IssueProposalRevision: a revisão em rascunho fica imutável. */
    @Transactional
    public ProposalRepository.Summary issue(UUID id, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROPOSAL_ISSUE);
        return change(user, id, expectedVersion, "PROPOSAL_REVISION_ISSUED", null, p -> p.issue(clock.instant(), user.username()),
                p -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("proposalId", id.toString());
                    payload.put("revision", p.current().number());
                    payload.put("totalCents", Long.toString(p.current().totalCents()));
                    payload.put("estimatedCostCents", null);
                    payload.put("validUntil", p.current().validUntil().toString());
                    outbox.append("ProposalRevisionIssued", ENTITY, id.toString(), payload, user.username());
                    opportunities.proposalIssued(user, p.opportunityId());
                });
    }

    /** Próxima revisão em rascunho, copiada da última emitida (que continua preservada). */
    @Transactional
    public ProposalRepository.Summary newRevision(UUID id, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROPOSAL_UPDATE);
        return change(user, id, expectedVersion, "PROPOSAL_REVISION_CREATED", null, p -> p.newRevision(clock.instant(), user.username()),
                p -> outbox.append("ProposalUpdated", ENTITY, id.toString(),
                        Map.of("proposalId", id.toString(), "revision", p.current().number()), user.username()));
    }

    /**
     * RecordProposalOutcome (perda), com motivo. {@code lossReason}: o motivo da lista do CRM, usado quando a oportunidade
     * também é perdida (sem ele, "Outro" com o texto da proposta).
     */
    @Transactional
    public ProposalRepository.Summary lose(UUID id, long expectedVersion, String reason, String lossReason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROPOSAL_UPDATE);
        return change(user, id, expectedVersion, "PROPOSAL_LOST", reason == null ? null : reason.strip(),
                p -> p.lose(reason, clock.instant(), user.username()),
                p -> outbox.append("ProposalOutcomeRecorded", ENTITY, id.toString(), Map.of("proposalId", id.toString(),
                        "revision", p.current().number(), "outcome", "PERDIDA", "reason", p.outcomeReason()), user.username()),
                p -> opportunities.proposalLost(user, p.opportunityId(), p.id(),
                        lossReason == null || lossReason.isBlank() ? "OUTRO" : lossReason, p.outcomeReason()));
    }

    private ProposalRepository.Summary change(CurrentUser user, UUID id, long expectedVersion, String action, String reason,
                                              UnaryOperator<Proposal> op, java.util.function.Consumer<Proposal> event,
                                              java.util.function.Consumer<Proposal> after) {
        ProposalRepository.Summary s = change(user, id, expectedVersion, action, reason, op, event);
        after.accept(s.proposal());
        return s;
    }

    private ProposalRepository.Summary change(CurrentUser user, UUID id, long expectedVersion, String action, String reason,
                                              UnaryOperator<Proposal> op, java.util.function.Consumer<Proposal> event) {
        Proposal current = repository.findByIdForUpdate(id).orElseThrow(ProposalService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Proposal updated = op.apply(current);
        if (updated == current) return repository.findById(id).orElseThrow();
        repository.update(updated, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, action, updated, reason, changes);
        event.accept(updated);
        return repository.findById(id).orElseThrow();
    }

    private void record(CurrentUser user, String action, Proposal p, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, p.id().toString(), p.version(), reason, changes,
                CorrelationId.current()));
    }

    static NotFoundException notFound() {
        return new NotFoundException("Proposta não encontrada.");
    }
}
