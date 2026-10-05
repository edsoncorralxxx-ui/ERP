package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.cadastros.api.EmployeeDirectory;
import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.acesso.api.UserDirectory;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Interaction;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import br.com.fourtech.rendamais.comercial.domain.Opportunity;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Casos de uso das oportunidades (Sprint 11, desenho do SAP Business One): abrir (OpenOpportunity, idempotente), alterar,
 * mudar de etapa com a próxima ação, marcar como perdida com o motivo da lista, registrar interação e configurar as etapas
 * do funil. As propostas movem a oportunidade: emitir leva à etapa Proposta, converter em pedido a marca como ganha e a
 * perda da última proposta aberta a marca como perdida.
 */
@Service
public class OpportunityService {

    static final String ENTITY = "opportunity";
    static final String STAGE_ENTITY = "opportunity_stage";
    /** Etapa a que a proposta leva a oportunidade (código fixo; o nome e o percentual são configuráveis). */
    static final String PROPOSAL_STAGE = "PROPOSTA";

    private final OpportunityRepository repository;
    private final LeadRepository leads;
    private final InteractionRepository interactions;
    private final ProposalRepository proposals;
    private final CommercialLookups lookups;
    private final LeadService leadService;
    private final UserDirectory users;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final EmployeeDirectory employees;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public OpportunityService(OpportunityRepository repository, LeadRepository leads, InteractionRepository interactions,
                              ProposalRepository proposals, CommercialLookups lookups, LeadService leadService,
                              UserDirectory users, EmployeeDirectory employees, AuditTrail audit, AuditQuery auditQuery,
                              Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.leads = leads;
        this.interactions = interactions;
        this.proposals = proposals;
        this.lookups = lookups;
        this.leadService = leadService;
        this.users = users;
        this.employees = employees;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    // ───────────── Consultas ─────────────

    @Transactional(readOnly = true)
    public List<OpportunityRepository.Summary> list(String search, Opportunity.Status status, String stage, UUID leadId,
                                                    UUID customerId) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return repository.list(search == null || search.isBlank() ? null : search.strip(), status,
                stage == null || stage.isBlank() ? null : stage, leadId, customerId, 1000);
    }

    @Transactional(readOnly = true)
    public OpportunityRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return repository.findById(id).orElseThrow(OpportunityService::notFound);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        get(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional(readOnly = true)
    public List<OpportunityRepository.StageChange> stageChanges(UUID id) {
        get(id);
        return repository.stageChanges(id);
    }

    @Transactional(readOnly = true)
    public List<Interaction> interactions(UUID id) {
        get(id);
        return interactions.list(null, id);
    }

    @Transactional(readOnly = true)
    public List<ProposalRepository.Summary> proposals(UUID id) {
        get(id);
        CurrentUserHolder.require(Permissions.PROPOSAL_READ);
        return proposals.listByOpportunity(id);
    }

    @Transactional(readOnly = true)
    public List<OpportunityRepository.Stage> stages() {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return repository.stages();
    }

    /** Responsáveis possíveis: colaboradores ativos (pelo nome) e usuários ativos (pelo login). */
    @Transactional(readOnly = true)
    public List<UserDirectory.UserRef> owners() {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        List<UserDirectory.UserRef> all = new ArrayList<>();
        employees.activeNames().forEach(n -> all.add(new UserDirectory.UserRef(n, n)));
        users.activeUsers().stream().filter(u -> all.stream().noneMatch(x -> x.username().equals(u.username()))).forEach(all::add);
        return all;
    }

    // ───────────── Comandos ─────────────

    /** OpenOpportunity: a partir da prospecção ou do cliente, na primeira etapa do funil, com a próxima ação. */
    @Transactional
    public OpportunityRepository.Summary open(String idempotencyKey, Opportunity.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "OpenOpportunity", data);
        if (done.isPresent()) return repository.findById(UUID.fromString(done.get())).orElseThrow();
        Instant now = clock.instant();
        UUID leadId = uuid(data.leadId(), "leadId");
        Lead lead = null;
        if (leadId != null) {
            lead = leads.findByIdForUpdate(leadId).orElseThrow(() -> invalid("leadId", "Prospecção não encontrada."));
        }
        String rawCustomer = data.customerId();
        if ((rawCustomer == null || rawCustomer.isBlank()) && lead != null && lead.partnerId() != null) {
            rawCustomer = lead.partnerId().toString();
        }
        Opportunity.Party party;
        if (rawCustomer != null && !rawCustomer.isBlank()) {
            Proposal.Customer c = lookups.customer("OPPORTUNITY_INVALID", rawCustomer, data.unitId(), false, null);
            party = new Opportunity.Party(leadId, c.id(), c.unitId(), c.unitName());
        } else if (lead != null) {
            party = new Opportunity.Party(leadId, null, null, null);
        } else {
            throw invalid("customerId", "Escolha a prospecção ou o cliente.");
        }
        checkOwner(data.owner());
        List<OpportunityRepository.Stage> stages = repository.stages();
        Opportunity o = Opportunity.open(repository.nextCode(), party, data, stages.get(0).code(), user.username(), today(), now,
                user.username());
        repository.insert(o);
        stageChange(o, null, stages, now, user.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, o.code()));
        o.flat().forEach((f, v) -> {
            if (v != null) changes.put(f, new AuditEntry.Change(null, v));
        });
        record(user, "OPPORTUNITY_OPENED", o, null, changes);
        opened(user, o);
        if (lead != null && lead.stage() != Lead.Stage.INTERESSADO) {
            Lead interested = lead.interested(now, user.username());
            leads.update(interested, lead.version());
            audit.record(new AuditEntry(user.username(), "LEAD_UPDATED", LeadService.ENTITY, lead.id().toString(), interested.version(),
                    "Oportunidade " + o.code() + " aberta", Map.of("stage", new AuditEntry.Change(lead.stage().name(),
                    interested.stage().name())), CorrelationId.current()));
        }
        receipts.complete(user.username(), key, o.id().toString());
        return repository.findById(o.id()).orElseThrow();
    }

    /** Altera os dados da oportunidade aberta (não a etapa): o cliente pode ser escolhido enquanto não houver um. */
    @Transactional
    public OpportunityRepository.Summary update(UUID id, long expectedVersion, Opportunity.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        checkOwner(data.owner());
        return change(user, id, expectedVersion, "OPPORTUNITY_UPDATED", null, o -> {
            Opportunity.Party party = new Opportunity.Party(o.leadId(), o.customerId(), o.unitId(), o.unitName());
            String rawCustomer = data.customerId() == null || data.customerId().isBlank()
                    ? (o.customerId() == null ? null : o.customerId().toString()) : data.customerId();
            if (rawCustomer != null) {
                UUID wanted = uuid(rawCustomer, "customerId");
                if (o.customerId() != null && !o.customerId().equals(wanted) && !proposals.listByOpportunity(o.id()).isEmpty()) {
                    throw invalid("customerId", "O cliente não muda depois que a oportunidade tem proposta.");
                }
                Proposal.Customer c = lookups.customer("OPPORTUNITY_INVALID", rawCustomer, data.unitId(), false, o.customerId());
                party = new Opportunity.Party(o.leadId(), c.id(), c.unitId(), c.unitName());
            }
            return o.update(party, data, today(), clock.instant(), user.username());
        });
    }

    /** Muda de etapa (avança ou volta), com a nova próxima ação; grava a linha da aba Etapas. */
    @Transactional
    public OpportunityRepository.Summary changeStage(UUID id, long expectedVersion, String stage, String nextActionDate,
                                                     String nextActionNote, String note) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        List<OpportunityRepository.Stage> stages = repository.stages();
        String code = stage == null ? "" : stage.strip();
        if (stages.stream().noneMatch(s -> s.code().equals(code))) throw invalid("stage", "Etapa inválida.");
        List<FieldIssue> issues = new ArrayList<>();
        boolean semProxima = (nextActionDate == null || nextActionDate.isBlank()) && (nextActionNote == null || nextActionNote.isBlank());
        Crm.NextAction informed = semProxima ? null : nextAction(nextActionDate, nextActionNote, issues);
        String why = note == null || note.isBlank() ? null : note.strip();
        if (why != null && why.length() > 300) issues.add(new FieldIssue("note", "Máximo de 300 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.", issues);
        Opportunity current = lock(id, expectedVersion);
        Crm.NextAction next = informed == null ? current.nextAction() : informed;
        if (current.isOpen() && current.stage().equals(code) && next.equals(current.nextAction())) {
            return repository.findById(id).orElseThrow();
        }
        Instant now = clock.instant();
        Opportunity updated = current.changeStage(code, next, now, user.username());
        save(user, current, updated, "OPPORTUNITY_STAGE_CHANGED", why);
        if (!current.stage().equals(code)) {
            stageChange(updated, current.stage(), stages, now, user.username(), why);
            stageEvent(user, updated, current.stage());
        }
        return repository.findById(id).orElseThrow();
    }

    /** Perdida, com o motivo da lista (texto obrigatório em "Outro"). */
    @Transactional
    public OpportunityRepository.Summary lose(UUID id, long expectedVersion, String reason, String note) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        Opportunity current = lock(id, expectedVersion);
        for (ProposalRepository.Summary p : proposals.listByOpportunity(id)) {
            if (p.proposal().status() == Proposal.Status.ABERTA) {
                throw new InvalidStateException("A proposta " + p.proposal().code()
                        + " desta oportunidade está aberta. Registre a perda na proposta.");
            }
        }
        lost(user, current, reason, note, null);
        return repository.findById(id).orElseThrow();
    }

    /** RecordInteraction na oportunidade: aberta, precisa da próxima ação. Idempotente pela chave. */
    @Transactional
    public Interaction recordInteraction(UUID id, String idempotencyKey, Interaction.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RecordInteraction", Map.of("opportunityId", id.toString(), "data", data));
        if (done.isPresent()) {
            UUID iid = UUID.fromString(done.get());
            return interactions.list(null, id).stream().filter(i -> i.id().equals(iid)).findFirst().orElseThrow();
        }
        Opportunity current = repository.findByIdForUpdate(id).orElseThrow(OpportunityService::notFound);
        Instant now = clock.instant();
        Interaction i = Interaction.record(null, id, data, current.isOpen(), today(), now, user.username());
        interactions.insert(i);
        save(user, current, current.interacted(i.occurredOn(), i.nextAction(), now, user.username()),
                "OPPORTUNITY_INTERACTION_RECORDED", i.kind().name() + ": " + i.summary());
        leadService.interactionEvent(user, i);
        receipts.complete(user.username(), key, i.id().toString());
        return i;
    }

    /** Nome e percentual de fechamento de uma etapa (configuração do funil, como no SAP B1). */
    @Transactional
    public OpportunityRepository.Stage updateStage(String code, long expectedVersion, String name, String closePercent) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CRM_STAGE_ADMIN);
        OpportunityRepository.Stage current = repository.stageForUpdate(code).orElseThrow(() -> new NotFoundException("Etapa não encontrada."));
        if (current.version() != expectedVersion) throw new VersionConflictException(STAGE_ENTITY, expectedVersion, current.version());
        List<FieldIssue> issues = new ArrayList<>();
        String n = name == null ? "" : name.strip();
        if (n.isEmpty()) issues.add(new FieldIssue("name", "Informe o nome da etapa."));
        else if (n.length() > 60) issues.add(new FieldIssue("name", "Máximo de 60 caracteres."));
        BigDecimal pct = null;
        try {
            pct = new BigDecimal(closePercent == null ? "" : closePercent.strip().replace(',', '.'));
            if (pct.signum() < 0 || pct.compareTo(BigDecimal.valueOf(100)) > 0 || pct.scale() > 2) {
                issues.add(new FieldIssue("closePercent", "De 0 a 100, com até duas casas."));
            }
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue("closePercent", "Percentual inválido."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("STAGE_INVALID", "Corrija os campos indicados.", issues);
        if (n.equals(current.name()) && pct.compareTo(current.closePercent()) == 0) return current;
        OpportunityRepository.Stage updated = new OpportunityRepository.Stage(code, n, current.position(), pct.setScale(2),
                current.version() + 1, clock.instant(), user.username());
        repository.updateStage(updated, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        if (!n.equals(current.name())) changes.put("name", new AuditEntry.Change(current.name(), n));
        if (pct.compareTo(current.closePercent()) != 0) {
            changes.put("closePercent", new AuditEntry.Change(current.closePercent().toPlainString(), updated.closePercent().toPlainString()));
        }
        audit.record(new AuditEntry(user.username(), "OPPORTUNITY_STAGE_CONFIGURED", STAGE_ENTITY, code, updated.version(), null,
                changes, CorrelationId.current()));
        outbox.append("OpportunityStageConfigured", STAGE_ENTITY, code, Map.of("stage", code,
                "closePercent", updated.closePercent().toPlainString()), user.username());
        return updated;
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> stageHistory(String code) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return auditQuery.history(STAGE_ENTITY, code);
    }

    // ───────────── Ganchos das propostas ─────────────

    /**
     * A oportunidade da proposta nova: a informada (aberta, do mesmo cliente) ou, sem ela, uma criada na hora na etapa
     * Proposta, para que nenhuma proposta fique fora do funil.
     */
    UUID forNewProposal(CurrentUser user, String rawOpportunityId, Proposal.Customer customer, String title, long totalCents,
                        LocalDate validUntil) {
        Instant now = clock.instant();
        if (rawOpportunityId != null && !rawOpportunityId.isBlank()) {
            UUID id = uuid(rawOpportunityId, "opportunityId");
            Opportunity o = repository.findByIdForUpdate(id).orElseThrow(() -> new RuleViolationException("PROPOSAL_INVALID",
                    "Corrija os campos indicados.", List.of(new FieldIssue("opportunityId", "Oportunidade não encontrada."))));
            if (!o.isOpen()) throw new InvalidStateException("A oportunidade " + o.code() + " não está aberta.");
            if (o.customerId() == null) {
                throw new RuleViolationException("PROPOSAL_INVALID", "Converta a prospecção em cliente antes de fazer a proposta.",
                        List.of(new FieldIssue("opportunityId", "Oportunidade sem cliente.")));
            }
            if (!o.customerId().equals(customer.id())) {
                throw new RuleViolationException("PROPOSAL_INVALID", "A proposta precisa ser para o cliente da oportunidade.",
                        List.of(new FieldIssue("customerId", "Cliente diferente do da oportunidade " + o.code() + ".")));
            }
            return o.id();
        }
        List<OpportunityRepository.Stage> stages = repository.stages();
        Opportunity o = Opportunity.forProposal(repository.nextCode(), new Opportunity.Party(null, customer.id(), customer.unitId(),
                customer.unitName()), title, totalCents, validUntil, PROPOSAL_STAGE, now, user.username());
        repository.insert(o);
        stageChange(o, null, stages, now, user.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, o.code()));
        o.flat().forEach((f, v) -> {
            if (v != null) changes.put(f, new AuditEntry.Change(null, v));
        });
        record(user, "OPPORTUNITY_OPENED", o, "Criada com a proposta", changes);
        opened(user, o);
        return o.id();
    }

    /** A unidade da oportunidade, para a proposta feita por ela sem escolher outra. */
    String unitOf(String rawOpportunityId) {
        if (rawOpportunityId == null || rawOpportunityId.isBlank()) return null;
        try {
            return repository.findById(UUID.fromString(rawOpportunityId.strip()))
                    .map(s -> s.opportunity().unitId() == null ? null : s.opportunity().unitId().toString()).orElse(null);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Proposta emitida: a oportunidade numa etapa anterior passa para Proposta. */
    void proposalIssued(CurrentUser user, UUID opportunityId) {
        Opportunity current = repository.findByIdForUpdate(opportunityId).orElseThrow();
        List<OpportunityRepository.Stage> stages = repository.stages();
        if (!current.isOpen() || position(stages, current.stage()) >= position(stages, PROPOSAL_STAGE)) return;
        Instant now = clock.instant();
        Opportunity updated = current.reach(PROPOSAL_STAGE, now, user.username());
        save(user, current, updated, "OPPORTUNITY_STAGE_CHANGED", "Proposta emitida");
        stageChange(updated, current.stage(), stages, now, user.username());
        stageEvent(user, updated, current.stage());
    }

    /** A proposta virou o pedido {@code orderCode}: a oportunidade é ganha. */
    void proposalWon(CurrentUser user, UUID opportunityId, String orderCode) {
        Opportunity current = repository.findByIdForUpdate(opportunityId).orElseThrow();
        if (!current.isOpen()) return;
        Instant now = clock.instant();
        Opportunity won = current.win(orderCode, now, user.username());
        save(user, current, won, "OPPORTUNITY_WON", "Pedido " + orderCode);
        stageChange(won, current.stage(), repository.stages(), now, user.username());
        stageEvent(user, won, current.stage());
    }

    /** A proposta foi perdida: sem outra proposta aberta, a oportunidade também é perdida, com o motivo informado. */
    void proposalLost(CurrentUser user, UUID opportunityId, UUID proposalId, String reason, String note) {
        Opportunity current = repository.findByIdForUpdate(opportunityId).orElseThrow();
        if (!current.isOpen()) return;
        boolean otherOpen = proposals.listByOpportunity(opportunityId).stream()
                .anyMatch(p -> !p.proposal().id().equals(proposalId) && p.proposal().status() == Proposal.Status.ABERTA);
        if (otherOpen) return;
        lost(user, current, reason, note, "Proposta perdida");
    }

    // ───────────── Apoio ─────────────

    private void lost(CurrentUser user, Opportunity current, String reason, String note, String auditReason) {
        Instant now = clock.instant();
        Opportunity lost = current.lose(reason, note, now, user.username());
        save(user, current, lost, "OPPORTUNITY_LOST", auditReason != null ? auditReason : lost.lossNote());
        stageChange(lost, current.stage(), repository.stages(), now, user.username());
        stageEvent(user, lost, current.stage());
    }

    private void opened(CurrentUser user, Opportunity o) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("opportunityId", o.id().toString());
        payload.put("leadId", o.leadId() == null ? null : o.leadId().toString());
        payload.put("customerId", o.customerId() == null ? null : o.customerId().toString());
        payload.put("estimatedCents", Long.toString(o.potentialCents()));
        outbox.append("OpportunityOpened", ENTITY, o.id().toString(), payload, user.username());
    }

    private void stageEvent(CurrentUser user, Opportunity o, String from) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("opportunityId", o.id().toString());
        payload.put("fromStage", from);
        payload.put("toStage", o.isOpen() ? o.stage() : o.status().name());
        payload.put("lossReason", o.lossReason() == null ? null : o.lossReason().name());
        outbox.append("OpportunityStageChanged", ENTITY, o.id().toString(), payload, user.username());
    }

    /** Linha da aba Etapas: percentual da etapa (aberta), 100% (ganha) ou 0% (perdida), com o potencial e o ponderado. */
    private void stageChange(Opportunity o, String from, List<OpportunityRepository.Stage> stages, Instant now, String actor) {
        stageChange(o, from, stages, now, actor, null);
    }

    private void stageChange(Opportunity o, String from, List<OpportunityRepository.Stage> stages, Instant now, String actor,
                             String note) {
        BigDecimal pct = switch (o.status()) {
            case GANHA -> BigDecimal.valueOf(100);
            case PERDIDA -> BigDecimal.ZERO;
            case ABERTA -> stages.stream().filter(s -> s.code().equals(o.stage())).findFirst().orElseThrow().closePercent();
        };
        repository.insertStageChange(new OpportunityRepository.StageChange(UUID.randomUUID(), o.id(), from, o.stage(), o.status(),
                pct, o.potentialCents(), Crm.weighted(o.potentialCents(), pct), now, actor, note));
    }

    private static int position(List<OpportunityRepository.Stage> stages, String code) {
        return stages.stream().filter(s -> s.code().equals(code)).findFirst().map(OpportunityRepository.Stage::position).orElse(0);
    }

    private Opportunity lock(UUID id, long expectedVersion) {
        Opportunity current = repository.findByIdForUpdate(id).orElseThrow(OpportunityService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        return current;
    }

    private OpportunityRepository.Summary change(CurrentUser user, UUID id, long expectedVersion, String action, String reason,
                                                 UnaryOperator<Opportunity> op) {
        Opportunity current = lock(id, expectedVersion);
        Opportunity updated = op.apply(current);
        save(user, current, updated, action, reason);
        return repository.findById(id).orElseThrow();
    }

    private void save(CurrentUser user, Opportunity current, Opportunity updated, String action, String reason) {
        if (updated == current) return;
        if (!repository.update(updated, current.version())) {
            throw new VersionConflictException(ENTITY, current.version(), current.version() + 1);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        Map<String, String> before = current.flat();
        updated.flat().forEach((f, v) -> {
            if (!Objects.equals(before.get(f), v)) changes.put(f, new AuditEntry.Change(before.get(f), v));
        });
        record(user, action, updated, reason, changes);
        if (action.equals("OPPORTUNITY_UPDATED")) {
            outbox.append("OpportunityUpdated", ENTITY, updated.id().toString(), Map.of("opportunityId", updated.id().toString(),
                    "changedFields", List.copyOf(changes.keySet())), user.username());
        }
    }

    private void checkOwner(String owner) {
        if (owner == null || owner.isBlank()) return;
        if (users.activeUsers().stream().noneMatch(u -> u.username().equals(owner.strip())) && !employees.isActive(owner.strip())) {
            throw invalid("owner", "Escolha um usuário ou colaborador ativo.");
        }
    }

    private Crm.NextAction nextAction(String rawDate, String rawNote, List<FieldIssue> issues) {
        LocalDate d = null;
        try {
            d = rawDate == null || rawDate.isBlank() ? null : LocalDate.parse(rawDate.strip());
        } catch (java.time.format.DateTimeParseException e) {
            issues.add(new FieldIssue("nextActionDate", "Data inválida."));
        }
        String note = rawNote == null || rawNote.isBlank() ? null : rawNote.strip();
        if (d == null && issues.isEmpty()) issues.add(new FieldIssue("nextActionDate", "Informe a data da próxima ação."));
        if (note == null) issues.add(new FieldIssue("nextActionNote", "Descreva a próxima ação."));
        else if (note.length() > 300) issues.add(new FieldIssue("nextActionNote", "Máximo de 300 caracteres."));
        if (d != null && d.isBefore(today())) issues.add(new FieldIssue("nextActionDate", "A próxima ação não pode ser antes de hoje."));
        return issues.isEmpty() ? new Crm.NextAction(d, note) : Crm.NextAction.NONE;
    }

    private void record(CurrentUser user, String action, Opportunity o, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, o.id().toString(), o.version(), reason, changes,
                CorrelationId.current()));
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(SalesOrderService.BUSINESS_ZONE));
    }

    private static UUID uuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw invalid(field, "Identificador inválido.");
        }
    }

    private static RuleViolationException invalid(String field, String message) {
        return new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.", List.of(new FieldIssue(field, message)));
    }

    static NotFoundException notFound() {
        return new NotFoundException("Oportunidade não encontrada.");
    }
}
