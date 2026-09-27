package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import br.com.fourtech.rendamais.comercial.domain.SalesLine;
import br.com.fourtech.rendamais.comercial.domain.SalesOrder;
import br.com.fourtech.rendamais.financeiro.api.TitleIssuanceApi;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import br.com.fourtech.rendamais.projetos.api.ProjectProvisioningApi;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Casos de uso do pedido de venda (formulário "pedidos"): rascunho (direto ou convertido da proposta), alteração do
 * rascunho, confirmação e cancelamento. Confirmar cria, numa única transação, o projeto, os equipamentos e um título a
 * receber por parcela — uma única vez (INV-SO-5), mesmo com a confirmação repetida ou concorrente.
 */
@Service
public class SalesOrderService {

    static final String ENTITY = "sales_order";
    /** Origem dos títulos a receber: uma por parcela, "{pedido}:{sequência}" (INV-FT-3). */
    public static final String INSTALLMENT_ORIGIN = "SALES_ORDER_INSTALLMENT";
    /** Categoria dos títulos do pedido. Premissa até o plano de categorias (PD-010). */
    static final String REVENUE_CATEGORY = "RECEITA_VENDA";
    /** Datas de negócio (emissão do título) no fuso da empresa; instantes de auditoria continuam em UTC. */
    static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final SalesOrderRepository repository;
    private final ProposalRepository proposals;
    private final CommercialLookups lookups;
    private final ProjectProvisioningApi provisioning;
    private final ProjectQueryApi projects;
    private final TitleIssuanceApi titles;
    private final TitleQueryApi titleQuery;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public SalesOrderService(SalesOrderRepository repository, ProposalRepository proposals, CommercialLookups lookups,
                             ProjectProvisioningApi provisioning, ProjectQueryApi projects, TitleIssuanceApi titles,
                             TitleQueryApi titleQuery, AuditTrail audit, AuditQuery auditQuery, Outbox outbox,
                             CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.proposals = proposals;
        this.lookups = lookups;
        this.provisioning = provisioning;
        this.projects = projects;
        this.titles = titles;
        this.titleQuery = titleQuery;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Pedido com o que a confirmação gerou: projeto, equipamentos e títulos (vazios em rascunho). */
    public record OrderView(SalesOrderRepository.Summary summary, Optional<ProjectQueryApi.ProjectView> project,
                            List<TitleQueryApi.TitleView> titles) { }

    @Transactional(readOnly = true)
    public List<SalesOrderRepository.Summary> list(String search, SalesOrder.Status status) {
        CurrentUserHolder.require(Permissions.SALES_ORDER_READ);
        return repository.list(search == null || search.isBlank() ? null : search.strip(), status, 500);
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID id) {
        CurrentUserHolder.require(Permissions.SALES_ORDER_READ);
        return view(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.SALES_ORDER_READ);
        repository.findById(id).orElseThrow(SalesOrderService::notFound);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** Pedido em rascunho; a mesma chave devolve o mesmo pedido. */
    @Transactional
    public OrderView draft(String idempotencyKey, SalesOrder.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SALES_ORDER_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "DraftSalesOrder", data);
        if (done.isPresent()) return view(UUID.fromString(done.get()));
        Proposal.Customer customer = lookups.customer("ORDER_INVALID", data.customerId(), data.unitId(), true, null);
        SalesOrder o = SalesOrder.draft(repository.nextCode(), customer, data, lookups.items(), clock.instant(), user.username());
        repository.insert(o);
        drafted(user, o, null);
        receipts.complete(user.username(), key, o.id().toString());
        return view(o.id());
    }

    /**
     * ConvertProposalToOrder: a revisão emitida vigente vira um pedido em rascunho (sem parcelas, para o comercial
     * completar) e a proposta é registrada como ganha. Uma proposta gera um único pedido não cancelado.
     */
    @Transactional
    public OrderView convertProposal(UUID proposalId, String idempotencyKey, String unitId, String contractDate) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SALES_ORDER_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        Map<String, String> request = new LinkedHashMap<>();
        request.put("proposalId", proposalId.toString());
        request.put("unitId", unitId);
        request.put("contractDate", contractDate);
        var done = receipts.claim(user.username(), key, "ConvertProposalToOrder", request);
        if (done.isPresent()) return view(UUID.fromString(done.get()));
        Proposal proposal = proposals.findByIdForUpdate(proposalId).orElseThrow(ProposalService::notFound);
        Optional<UUID> existing = repository.activeForProposal(proposalId);
        if (existing.isPresent()) {
            receipts.complete(user.username(), key, existing.get().toString());
            return view(existing.get());
        }
        String unit = unitId == null || unitId.isBlank() ? (proposal.unitId() == null ? null : proposal.unitId().toString()) : unitId;
        Proposal.Customer customer = lookups.customer("ORDER_INVALID", proposal.customerId().toString(), unit, true, null);
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate contract = contractDate == null || contractDate.isBlank() ? LocalDate.now(clock.withZone(BUSINESS_ZONE)) : parse(contractDate, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("ORDER_INVALID", "Corrija os campos indicados.", issues);
        Instant now = clock.instant();
        Proposal won = proposal.win(now, user.username());
        SalesOrder o = SalesOrder.fromProposal(repository.nextCode(), won, customer, contract, now, user.username());
        repository.insert(o);
        proposals.update(won, proposal.version());
        audit.record(new AuditEntry(user.username(), "PROPOSAL_WON", ProposalService.ENTITY, proposalId.toString(), won.version(), null,
                Map.of("status", new AuditEntry.Change(proposal.status().name(), won.status().name()),
                        "order", new AuditEntry.Change(null, o.code())), CorrelationId.current()));
        outbox.append("ProposalOutcomeRecorded", ProposalService.ENTITY, proposalId.toString(), Map.of("proposalId",
                proposalId.toString(), "revision", won.current().number(), "outcome", "GANHA", "reason", o.code()), user.username());
        drafted(user, o, proposal);
        receipts.complete(user.username(), key, o.id().toString());
        return view(o.id());
    }

    /** Altera o rascunho com a versão lida (If-Match). */
    @Transactional
    public OrderView update(UUID id, long expectedVersion, SalesOrder.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SALES_ORDER_UPDATE);
        SalesOrder current = lockAt(id, expectedVersion);
        Proposal.Customer customer = lookups.customer("ORDER_INVALID", data.customerId(), data.unitId(), true, current.customerId());
        SalesOrder updated = current.update(customer, data, lookups.items(), clock.instant(), user.username());
        repository.update(updated, expectedVersion);
        Map<String, AuditEntry.Change> changes = changes(current, updated);
        record(user, "SALES_ORDER_UPDATED", updated, null, changes);
        outbox.append("SalesOrderUpdated", ENTITY, id.toString(),
                Map.of("orderId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return view(id);
    }

    /**
     * ConfirmSalesOrder (docs/backend/13, §2), numa transação: bloqueia o pedido, confere versão e invariantes, cria
     * projeto e equipamentos, emite um título por parcela, grava a confirmação, a auditoria, os eventos e o recibo. Pedido
     * já confirmado devolve a confirmação existente, sem novos efeitos (INV-SO-5).
     */
    @Transactional
    public OrderView confirm(UUID id, long expectedVersion, String idempotencyKey) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SALES_ORDER_CONFIRM);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "ConfirmSalesOrder", Map.of("orderId", id.toString(), "expectedVersion", expectedVersion));
        if (done.isPresent()) return view(UUID.fromString(done.get()));
        SalesOrder current = repository.findByIdForUpdate(id).orElseThrow(SalesOrderService::notFound);
        if (current.confirmation() != null && current.status() != SalesOrder.Status.CANCELLED) {
            receipts.complete(user.username(), key, id.toString());
            return view(id);
        }
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        current.checkConfirmable();
        lookups.confirmationProblem(current.customerId(), current.unitId()).ifPresent(problem -> {
            throw new RuleViolationException("PARTNER_INACTIVE_OR_UNIT_MISMATCH", problem, List.of(new FieldIssue("unitId", problem)));
        });

        List<ProjectProvisioningApi.EquipmentLine> equipmentLines = current.lines().stream()
                .filter(l -> l.kind() == SalesLine.Kind.EQUIPAMENTO)
                .map(l -> new ProjectProvisioningApi.EquipmentLine(l.id(), l.description(), l.itemId(), l.quantity().intValueExact()))
                .toList();
        ProjectProvisioningApi.Provisioned project = provisioning.provisionFor(new ProjectProvisioningApi.ProvisionRequest(
                current.id(), current.code(), "Pedido " + current.code() + " — " + current.unitName(), current.customerId(),
                current.unitId(), current.unitName(), current.promisedDate(), current.totalCents(), equipmentLines));

        int n = current.installments().size();
        List<TitleIssuanceApi.Installment> installments = current.installments().stream()
                .map(i -> new TitleIssuanceApi.Installment(originId(current.id(), i.seq()), i.dueDate(),
                        Money.ofCents(i.amountCents(), Currency.BRL), "Pedido " + current.code() + " — parcela " + i.seq() + "/" + n
                        + (i.milestone() == null ? "" : " — " + i.milestone())))
                .toList();
        List<UUID> titleIds = titles.issueReceivables(new TitleIssuanceApi.IssueRequest(INSTALLMENT_ORIGIN, current.customerId(),
                project.projectId(), LocalDate.now(clock.withZone(BUSINESS_ZONE)), REVENUE_CATEGORY, installments));

        SalesOrder confirmed = current.confirm(project.projectId(), clock.instant(), user.username());
        repository.update(confirmed, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("status", new AuditEntry.Change(current.status().name(), confirmed.status().name()));
        changes.put("project", new AuditEntry.Change(null, project.projectCode()));
        changes.put("equipment", new AuditEntry.Change(null, Integer.toString(project.equipmentIds().size())));
        changes.put("titles", new AuditEntry.Change(null, Integer.toString(titleIds.size())));
        changes.put("snapshotHash", new AuditEntry.Change(null, confirmed.confirmation().snapshotHash()));
        record(user, "SALES_ORDER_CONFIRMED", confirmed, null, changes);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", id.toString());
        payload.put("customerId", confirmed.customerId().toString());
        payload.put("unitId", confirmed.unitId().toString());
        payload.put("totalCents", Long.toString(confirmed.totalCents()));
        payload.put("lines", confirmed.lines().size());
        payload.put("projectIds", List.of(project.projectId().toString()));
        payload.put("equipmentIds", project.equipmentIds().stream().map(UUID::toString).toList());
        payload.put("titleIds", titleIds.stream().map(UUID::toString).toList());
        outbox.append("SalesOrderConfirmed", ENTITY, id.toString(), payload, user.username());
        receipts.complete(user.username(), key, id.toString());
        return view(id);
    }

    /**
     * CancelSalesOrder (docs/backend/13, §3), premissa PD-003: rascunho cancela direto; confirmado cancela os títulos
     * abertos, encerra o projeto e cancela os equipamentos — ou recusa tudo (422 CANCELLATION_BLOCKED_BY_EFFECTS) se já
     * houver recebimento ou execução. Cancelar de novo devolve o cancelamento existente.
     */
    @Transactional
    public OrderView cancel(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.SALES_ORDER_CANCEL);
        SalesOrder current = repository.findByIdForUpdate(id).orElseThrow(SalesOrderService::notFound);
        if (current.status() == SalesOrder.Status.CANCELLED) return view(id);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("ORDER_INVALID", "Informe o motivo do cancelamento.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        SalesOrder cancelled = current.cancel(why, clock.instant(), user.username());
        List<UUID> cancelledTitles = List.of();
        List<UUID> closedProjects = List.of();
        if (current.confirmation() != null) {
            try {
                cancelledTitles = titles.cancelOpen(INSTALLMENT_ORIGIN,
                        current.installments().stream().map(i -> originId(id, i.seq())).toList(), why);
                closedProjects = provisioning.closeForCancelledOrder(id, why);
            } catch (InvalidStateException e) {
                throw new RuleViolationException("CANCELLATION_BLOCKED_BY_EFFECTS",
                        "O pedido " + current.code() + " não pode ser cancelado: " + e.getMessage(),
                        List.of(new FieldIssue("effects", e.getMessage())));
            }
        }
        repository.update(cancelled, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("status", new AuditEntry.Change(current.status().name(), cancelled.status().name()));
        if (!cancelledTitles.isEmpty()) changes.put("titles", new AuditEntry.Change(null, cancelledTitles.size() + " cancelados"));
        record(user, "SALES_ORDER_CANCELLED", cancelled, why, changes);
        outbox.append("SalesOrderCancelled", ENTITY, id.toString(), Map.of("orderId", id.toString(), "reason", why,
                "cancelledTitleIds", cancelledTitles.stream().map(UUID::toString).toList(),
                "cancelledProjectIds", closedProjects.stream().map(UUID::toString).toList()), user.username());
        return view(id);
    }

    static String originId(UUID orderId, int seq) {
        return orderId + ":" + seq;
    }

    private OrderView view(UUID id) {
        SalesOrderRepository.Summary s = repository.findById(id).orElseThrow(SalesOrderService::notFound);
        SalesOrder o = s.order();
        if (o.confirmation() == null) return new OrderView(s, Optional.empty(), List.of());
        return new OrderView(s, projects.forOrder(id),
                titleQuery.byOrigin(INSTALLMENT_ORIGIN, o.installments().stream().map(i -> originId(id, i.seq())).toList()));
    }

    private void drafted(CurrentUser user, SalesOrder o, Proposal proposal) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        SalesOrder.created(o).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        if (proposal != null) changes.put("proposal", new AuditEntry.Change(null, proposal.code() + " rev. " + proposal.current().number()));
        record(user, "SALES_ORDER_DRAFTED", o, null, changes);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", o.id().toString());
        payload.put("proposalId", proposal == null ? null : proposal.id().toString());
        payload.put("revision", proposal == null ? null : proposal.current().number());
        outbox.append("SalesOrderDrafted", ENTITY, o.id().toString(), payload, user.username());
    }

    private SalesOrder lockAt(UUID id, long expectedVersion) {
        SalesOrder current = repository.findByIdForUpdate(id).orElseThrow(SalesOrderService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        return current;
    }

    private static Map<String, AuditEntry.Change> changes(SalesOrder a, SalesOrder b) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        a.diff(b).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        return changes;
    }

    private void record(CurrentUser user, String action, SalesOrder o, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, o.id().toString(), o.version(), reason, changes,
                CorrelationId.current()));
    }

    private static LocalDate parse(String raw, List<FieldIssue> issues) {
        try {
            return LocalDate.parse(raw.strip());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("contractDate", "Data inválida."));
            return null;
        }
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Pedido não encontrado.");
    }
}
