package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.CustomerRegistrationApi;
import br.com.fourtech.rendamais.cadastros.api.PartnerQueryApi;
import br.com.fourtech.rendamais.comercial.domain.Interaction;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import br.com.fourtech.rendamais.comercial.domain.Opportunity;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Casos de uso da prospecção (formulário "prospeccao" do B01, Sprint 11): cadastrar (idempotente), alterar com versão,
 * descartar com motivo, registrar interação (RecordInteraction) e converter em cliente. Cada comando confere a permissão e
 * grava auditoria e evento na mesma transação.
 */
@Service
public class LeadService {

    static final String ENTITY = "lead";

    private final LeadRepository repository;
    private final OpportunityRepository opportunities;
    private final InteractionRepository interactions;
    private final CustomerRegistrationApi customers;
    private final PartnerQueryApi partners;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public LeadService(LeadRepository repository, OpportunityRepository opportunities, InteractionRepository interactions,
                       CustomerRegistrationApi customers, PartnerQueryApi partners, AuditTrail audit, AuditQuery auditQuery,
                       Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.opportunities = opportunities;
        this.interactions = interactions;
        this.customers = customers;
        this.partners = partners;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<LeadRepository.Summary> list(String search, Lead.Stage stage) {
        CurrentUserHolder.require(Permissions.LEAD_READ);
        return repository.list(search == null || search.isBlank() ? null : search.strip(), stage, 1000);
    }

    @Transactional(readOnly = true)
    public LeadRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.LEAD_READ);
        return repository.findById(id).orElseThrow(LeadService::notFound);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        get(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** As interações da prospecção e das oportunidades abertas a partir dela. */
    @Transactional(readOnly = true)
    public List<Interaction> interactions(UUID id) {
        get(id);
        return interactions.list(id, null);
    }

    /** RegisterLead: a mesma chave devolve a mesma prospecção. O responsável vazio é quem cadastra. */
    @Transactional
    public LeadRepository.Summary register(String idempotencyKey, Lead.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterLead", data);
        if (done.isPresent()) return repository.findById(UUID.fromString(done.get())).orElseThrow();
        Lead lead = insert(user, data, null);
        receipts.complete(user.username(), key, lead.id().toString());
        return repository.findById(lead.id()).orElseThrow();
    }

    /** Cadastro sem recibo próprio, usado pela carga da lista (que tem o seu). */
    Lead insert(CurrentUser user, Lead.Data data, UUID importId) {
        Lead lead = Lead.register(repository.nextCode(), data, user.username(), importId, today(), clock.instant(), user.username());
        repository.insert(lead);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, lead.code()));
        lead.flat().forEach((f, v) -> {
            if (v != null) changes.put(f, new AuditEntry.Change(null, v));
        });
        record(user, "LEAD_REGISTERED", lead, null, changes);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("leadId", lead.id().toString());
        payload.put("partnerId", null);
        payload.put("rating", lead.rating());
        outbox.append("LeadRegistered", ENTITY, lead.id().toString(), payload, user.username());
        return lead;
    }

    @Transactional
    public LeadRepository.Summary update(UUID id, long expectedVersion, Lead.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        return change(user, id, expectedVersion, "LEAD_UPDATED", null, l -> l.update(data, today(), clock.instant(), user.username()));
    }

    @Transactional
    public LeadRepository.Summary discard(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        return change(user, id, expectedVersion, "LEAD_DISCARDED", reason == null ? null : reason.strip(),
                l -> l.discard(reason, clock.instant(), user.username()));
    }

    /** RecordInteraction na prospecção: a próxima ação passa para ela. Idempotente pela chave. */
    @Transactional
    public Interaction recordInteraction(UUID id, String idempotencyKey, Interaction.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RecordInteraction", Map.of("leadId", id.toString(), "data", data));
        if (done.isPresent()) {
            UUID iid = UUID.fromString(done.get());
            return interactions.list(id, null).stream().filter(i -> i.id().equals(iid)).findFirst().orElseThrow();
        }
        Lead current = repository.findByIdForUpdate(id).orElseThrow(LeadService::notFound);
        Instant now = clock.instant();
        Interaction i = Interaction.record(id, null, data, false, today(), now, user.username());
        Lead updated = current.interacted(i.occurredOn(), i.nextAction(), now, user.username());
        interactions.insert(i);
        save(user, current, updated, "LEAD_INTERACTION_RECORDED", i.kind().name() + ": " + i.summary());
        interactionEvent(user, i);
        receipts.complete(user.username(), key, i.id().toString());
        return i;
    }

    /**
     * Converter em cliente (como o lead do SAP B1 que passa a cliente): cadastra o cliente com a empresa, a cidade e o
     * contato da prospecção, uma única vez, e o liga à prospecção e às oportunidades dela.
     */
    @Transactional
    public LeadRepository.Summary convertToCustomer(UUID id, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        CurrentUserHolder.require(Permissions.PARTNER_CREATE);
        Lead current = repository.findByIdForUpdate(id).orElseThrow(LeadService::notFound);
        if (current.partnerId() != null) return repository.findById(id).orElseThrow();
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        String unitName = current.city() == null ? "Matriz" : current.city();
        UUID customerId = customers.register("lead-customer-" + id, new CustomerRegistrationApi.NewCustomer(
                current.companyName(), current.tradeName(), unitName, current.city(), current.state(), current.contactName(),
                current.contactPhone(), current.contactEmail()));
        Instant now = clock.instant();
        Lead linked = current.linkCustomer(customerId, now, user.username());
        save(user, current, linked, "LEAD_CONVERTED", null);
        linkOpportunities(user, linked, customerId, now);
        return repository.findById(id).orElseThrow();
    }

    /** Liga a prospecção a um cliente que já existe (evita duplicar quem já é cliente). */
    @Transactional
    public LeadRepository.Summary linkCustomer(UUID id, long expectedVersion, UUID customerId) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        partners.customer(customerId).orElseThrow(() -> Lead.invalid("customerId", "Cliente não encontrado."));
        Lead current = repository.findByIdForUpdate(id).orElseThrow(LeadService::notFound);
        if (customerId.equals(current.partnerId())) return repository.findById(id).orElseThrow();
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Instant now = clock.instant();
        Lead linked = current.linkCustomer(customerId, now, user.username());
        save(user, current, linked, "LEAD_CUSTOMER_LINKED", null);
        linkOpportunities(user, linked, customerId, now);
        return repository.findById(id).orElseThrow();
    }

    private void linkOpportunities(CurrentUser user, Lead lead, UUID customerId, Instant now) {
        PartnerQueryApi.CustomerRef customer = partners.customer(customerId).orElseThrow();
        PartnerQueryApi.UnitRef unit = customer.units().isEmpty() ? null : customer.units().get(0);
        for (Opportunity o : opportunities.openForLead(lead.id())) {
            if (o.customerId() != null) continue;
            Opportunity linked = o.linkCustomer(customerId, unit == null ? null : unit.id(), unit == null ? null : unit.name(), now,
                    user.username());
            opportunities.update(linked, o.version());
            audit.record(new AuditEntry(user.username(), "OPPORTUNITY_CUSTOMER_LINKED", OpportunityService.ENTITY,
                    o.id().toString(), linked.version(), null,
                    Map.of("customer", new AuditEntry.Change(null, customer.code() + " — " + customer.name())),
                    CorrelationId.current()));
        }
    }

    void interactionEvent(CurrentUser user, Interaction i) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("leadId", i.leadId() == null ? null : i.leadId().toString());
        payload.put("opportunityId", i.opportunityId() == null ? null : i.opportunityId().toString());
        payload.put("interactionType", i.kind().name());
        payload.put("nextActionDate", i.nextAction().date() == null ? null : i.nextAction().date().toString());
        outbox.append("LeadInteractionRecorded", i.leadId() != null ? ENTITY : OpportunityService.ENTITY,
                (i.leadId() != null ? i.leadId() : i.opportunityId()).toString(), payload, user.username());
    }

    private LeadRepository.Summary change(CurrentUser user, UUID id, long expectedVersion, String action, String reason,
                                          UnaryOperator<Lead> op) {
        Lead current = repository.findByIdForUpdate(id).orElseThrow(LeadService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Lead updated = op.apply(current);
        if (updated != current) save(user, current, updated, action, reason);
        return repository.findById(id).orElseThrow();
    }

    private void save(CurrentUser user, Lead current, Lead updated, String action, String reason) {
        if (!repository.update(updated, current.version())) {
            throw new VersionConflictException(ENTITY, current.version(), current.version() + 1);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        Map<String, String> before = current.flat();
        updated.flat().forEach((f, v) -> {
            if (!Objects.equals(before.get(f), v)) changes.put(f, new AuditEntry.Change(before.get(f), v));
        });
        record(user, action, updated, reason, changes);
        outbox.append("LeadUpdated", ENTITY, updated.id().toString(), Map.of("leadId", updated.id().toString(),
                "changedFields", List.copyOf(changes.keySet())), user.username());
    }

    private void record(CurrentUser user, String action, Lead l, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, l.id().toString(), l.version(), reason, changes,
                CorrelationId.current()));
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(SalesOrderService.BUSINESS_ZONE));
    }

    static NotFoundException notFound() {
        return new NotFoundException("Prospecção não encontrada.");
    }
}
