package br.com.fourtech.rendamais.documentos.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.comercial.api.SalesOrderQueryApi;
import br.com.fourtech.rendamais.documentos.domain.BusinessDocument;
import br.com.fourtech.rendamais.documentos.domain.InvoiceProposal;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi.TitleView;
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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Documentos e faturamento (formulário "documentos" do B01): registrar a nota emitida fora do Renda+ a partir do pedido,
 * desfazer um vínculo, cancelar e classificar. Regime de caixa (decisão do PO na Review da Sprint 6, PD-023): a nota
 * fatura só o que já foi recebido — o a emitir de cada parcela é recebido − faturado —, e o sistema monta as linhas
 * (proporcionais ao pedido) e os vínculos (pela ordem de vencimento). O vínculo, numa transação: bloqueia o documento
 * (Σ vínculos ≤ total) e depois as parcelas em ordem crescente de id, relendo o recebido delas já com o bloqueio. A
 * nota não muda saldo a receber nem caixa.
 */
@Service
public class DocumentService {

    static final String ENTITY = "business_document";
    /** Entidade dos títulos no histórico (o mesmo nome usado pelo financeiro). */
    static final String TITLE_ENTITY = "financial_title";
    /** Datas de negócio no fuso da empresa; instantes de auditoria continuam em UTC. */
    static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final DocumentRepository repository;
    private final TitleQueryApi titles;
    private final SalesOrderQueryApi orders;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public DocumentService(DocumentRepository repository, TitleQueryApi titles, SalesOrderQueryApi orders, AuditTrail audit,
                           AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.titles = titles;
        this.orders = orders;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    /**
     * Corpo do RegisterDocument, como chega da API: o pedido, os dados da nota emitida e, se for menor que o a emitir do
     * pedido, o valor da nota; valores em centavos como texto de inteiro (ADR-006). Linhas e vínculos vêm do pedido.
     */
    public record RegisterRequest(String direction, String orderId, String series, String number, String issueDate,
                                  String competence, String amountCents, String notes) { }

    public record LinkRequest(String titleId, String amountCents) { }

    public record ClassifyRequest(String operationNature, String projectId) { }

    /**
     * Faturado de uma parcela: o título, quanto já foi faturado, quanto falta faturar do valor, quanto do recebido ainda
     * não tem nota (a emitir) e os documentos vinculados.
     */
    public record TitleInvoicing(TitleView title, long invoicedCents, long toInvoiceCents, long toIssueCents,
                                 List<DocumentRepository.TitleLink> documents) { }

    /** Parcela do pedido vista pelo caixa: faturado, a emitir e quanto a nota proposta vincula a ela. */
    public record ParcelInvoicing(TitleView title, long invoicedCents, long toIssueCents, long proposedCents) { }

    /**
     * Pedido visto pelo caixa: recebido, faturado, a emitir (recebido sem nota), faturado além do recebido (depois de um
     * estorno) e a nota proposta para o valor pedido (o a emitir, por padrão).
     */
    public record OrderInvoicing(SalesOrderQueryApi.OrderRef order, List<ParcelInvoicing> parcels, long receivedCents,
                                 long invoicedCents, long toIssueCents, long beyondReceivedCents, long proposedCents,
                                 InvoiceProposal.Result proposal) { }

    @Transactional(readOnly = true)
    public List<DocumentRepository.Summary> list(String search, DocumentRepository.Filter filter, YearMonth competence, UUID customerId) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        return repository.list(search == null || search.isBlank() ? null : search.strip(), filter, competence, customerId, 500);
    }

    @Transactional(readOnly = true)
    public DocumentRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        return view(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        view(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /**
     * Faturado das parcelas: pelos ids ou, com {@code customerId}, as parcelas a receber não canceladas do cliente
     * (as que a tela oferece para vincular). IND-003 por parcela: a faturar = valor − faturado.
     */
    @Transactional(readOnly = true)
    public List<TitleInvoicing> invoicing(UUID customerId, List<UUID> titleIds) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        List<TitleView> found = customerId != null ? titles.activeReceivablesOf(customerId)
                : titleIds == null || titleIds.isEmpty() ? List.of() : titles.byIds(titleIds);
        List<UUID> ids = found.stream().map(TitleView::id).toList();
        Map<UUID, Long> invoiced = repository.invoiced(ids);
        Map<UUID, List<DocumentRepository.TitleLink>> links = repository.activeLinks(ids).stream()
                .collect(Collectors.groupingBy(DocumentRepository.TitleLink::titleId));
        return found.stream().map(t -> {
            long done = invoiced.getOrDefault(t.id(), 0L);
            long limit = "CANCELLED".equals(t.status()) ? done : t.originalCents();
            return new TitleInvoicing(t, done, limit - done, toIssue(t, done), links.getOrDefault(t.id(), List.of()));
        }).toList();
    }

    /** Recebido sem nota da parcela (regime de caixa); parcela cancelada não tem nada a emitir. */
    private static long toIssue(TitleView t, long invoiced) {
        return "CANCELLED".equals(t.status()) ? 0 : Math.max(0, t.receivedCents() - invoiced);
    }

    /** Pedidos confirmados vistos pelo caixa; {@code onlyToIssue} deixa só os que têm recebimento sem nota. */
    @Transactional(readOnly = true)
    public List<OrderInvoicing> orders(String search, boolean onlyToIssue) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        List<SalesOrderQueryApi.OrderRef> refs = orders.confirmedOrders(search);
        List<UUID> ids = refs.stream().flatMap(o -> o.titleIds().stream()).toList();
        Map<UUID, TitleView> byId = byId(titles.byIds(ids));
        Map<UUID, Long> invoiced = repository.invoiced(ids);
        return refs.stream().map(o -> orderInvoicing(o, byId, invoiced, null))
                .filter(o -> !onlyToIssue || o.toIssueCents() > 0).toList();
    }

    /** Um pedido visto pelo caixa, com a nota proposta para {@code amountCents} (o a emitir, se vazio). */
    @Transactional(readOnly = true)
    public OrderInvoicing order(UUID orderId, String amountCents) {
        CurrentUserHolder.require(Permissions.DOCUMENT_READ);
        SalesOrderQueryApi.OrderRef o = confirmedOrder(orderId);
        Map<UUID, TitleView> byId = byId(titles.byIds(o.titleIds()));
        OrderInvoicing all = orderInvoicing(o, byId, repository.invoiced(o.titleIds()), null);
        return orderInvoicing(o, byId, repository.invoiced(o.titleIds()), amount(amountCents, all.toIssueCents(), o));
    }

    private OrderInvoicing orderInvoicing(SalesOrderQueryApi.OrderRef o, Map<UUID, TitleView> byId, Map<UUID, Long> invoiced, Long amount) {
        List<TitleView> ts = o.titleIds().stream().map(byId::get).filter(Objects::nonNull)
                .sorted(java.util.Comparator.comparing(TitleView::dueDate).thenComparing(TitleView::code)).toList();
        List<InvoiceProposal.Parcel> parcels = ts.stream()
                .map(t -> new InvoiceProposal.Parcel(t.id(), toIssue(t, invoiced.getOrDefault(t.id(), 0L)))).toList();
        long toIssue = InvoiceProposal.toIssue(parcels);
        long proposed = amount == null ? toIssue : amount;
        InvoiceProposal.Result proposal = InvoiceProposal.of(proposed, parcels, lines(o));
        Map<UUID, Long> perTitle = proposal.links().stream()
                .collect(Collectors.toMap(BusinessDocument.LinkRequest::titleId, l -> l.amount().cents()));
        long received = ts.stream().filter(t -> !"CANCELLED".equals(t.status())).mapToLong(TitleView::receivedCents).sum();
        long done = ts.stream().mapToLong(t -> invoiced.getOrDefault(t.id(), 0L)).sum();
        List<ParcelInvoicing> views = ts.stream().map(t -> new ParcelInvoicing(t, invoiced.getOrDefault(t.id(), 0L),
                toIssue(t, invoiced.getOrDefault(t.id(), 0L)), perTitle.getOrDefault(t.id(), 0L))).toList();
        return new OrderInvoicing(o, views, received, done, toIssue, Math.max(0, done - received), proposed, proposal);
    }

    private static List<InvoiceProposal.OrderLine> lines(SalesOrderQueryApi.OrderRef o) {
        return o.lines().stream().map(l -> new InvoiceProposal.OrderLine(l.kind(), l.description(), l.totalCents())).toList();
    }

    private SalesOrderQueryApi.OrderRef confirmedOrder(UUID orderId) {
        return orders.confirmed(orderId).orElseThrow(() -> new RuleViolationException("DOCUMENT_INVALID",
                "Pedido não encontrado ou não confirmado.", List.of(new FieldIssue("orderId", "Escolha um pedido confirmado."))));
    }

    /** Valor pedido para a nota: vazio é o a emitir; maior que zero e até o a emitir do pedido. */
    private static long amount(String raw, long toIssue, SalesOrderQueryApi.OrderRef o) {
        if (raw == null || raw.isBlank()) return toIssue;
        List<FieldIssue> issues = new ArrayList<>();
        Money m = cents(raw, "amountCents", issues);
        if (!issues.isEmpty()) throw new RuleViolationException("DOCUMENT_INVALID", "Valor da nota inválido.", issues);
        if (m.isZero() || m.isNegative()) {
            throw new RuleViolationException("DOCUMENT_INVALID", "O valor da nota deve ser maior que zero.",
                    List.of(new FieldIssue("amountCents", "Deve ser maior que zero.")));
        }
        if (m.cents() > toIssue) {
            throw new RuleViolationException("DOCUMENT_EXCEEDS_RECEIVED", "O valor de " + m.toBrl() + " passa do recebido sem nota do pedido "
                    + o.code() + " (" + brl(toIssue) + "). A nota só fatura o que já foi recebido.",
                    List.of(new FieldIssue("amountCents", "A emitir do pedido: " + brl(toIssue) + ".")));
        }
        return m.cents();
    }

    /**
     * RegisterDocument pelo caixa: a nota do pedido fatura o recebido sem nota (ou parte dele); o sistema monta as linhas
     * e os vínculos com as parcelas bloqueadas. A mesma chave devolve o mesmo documento.
     */
    @Transactional
    public DocumentRepository.Summary register(String idempotencyKey, RegisterRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.DOCUMENT_REGISTER);
        CurrentUserHolder.require(Permissions.DOCUMENT_LINK);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterDocument", r);
        if (done.isPresent()) return view(UUID.fromString(done.get()));

        Parsed p = parse(r);
        SalesOrderQueryApi.OrderRef order = confirmedOrder(p.orderId());
        duplicate(p.series(), p.number(), order.customerId());
        // O a emitir é lido com as parcelas bloqueadas: outra nota do mesmo pedido espera esta terminar.
        List<TitleView> before = titles.byIds(order.titleIds());
        Map<UUID, Long> invoiced = repository.lockInvoicing(before.stream()
                .collect(Collectors.toMap(TitleView::id, TitleView::originalCents)));
        OrderInvoicing now = orderInvoicing(order, byId(titles.byIds(order.titleIds())), invoiced, null);
        if (now.toIssueCents() == 0) {
            throw new RuleViolationException("DOCUMENT_EXCEEDS_RECEIVED", "O pedido " + order.code()
                    + " não tem recebimento sem nota: a nota só fatura o que já foi recebido.",
                    List.of(new FieldIssue("orderId", "Nada a emitir neste pedido.")));
        }
        long amount = amount(p.amountCents(), now.toIssueCents(), order);
        InvoiceProposal.Result proposal = orderInvoicing(order, byId(titles.byIds(order.titleIds())), invoiced, amount).proposal();
        Instant at = clock.instant();
        BusinessDocument d = BusinessDocument.register(repository.nextCode(), BusinessDocument.Direction.SAIDA, order.customerId(),
                order.id(), p.series(), p.number(), p.issueDate(), p.competence(), proposal.lines(), p.notes(), at, user.username());
        try {
            repository.insert(d);
        } catch (DuplicateKeyException e) {
            // Outro registro simultâneo do mesmo número chegou primeiro.
            duplicate(p.series(), p.number(), order.customerId());
            throw e;
        }
        String customerLabel = order.customerCode() + " — " + order.customerName();
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, d.code()));
        changes.put("number", new AuditEntry.Change(null, "Série " + d.series() + " nº " + d.number()));
        changes.put("customer", new AuditEntry.Change(null, customerLabel));
        changes.put("order", new AuditEntry.Change(null, order.code()));
        changes.put("issueDate", new AuditEntry.Change(null, d.issueDate().toString()));
        changes.put("competence", new AuditEntry.Change(null, d.competence().toString()));
        changes.put("totalCents", new AuditEntry.Change(null, d.total().centsAsString()));
        audit.record(new AuditEntry(user.username(), "DOCUMENT_REGISTERED", ENTITY, d.id().toString(), d.version(), d.notes(), changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("documentId", d.id().toString());
        payload.put("direction", d.direction().name());
        payload.put("partnerId", d.partnerId().toString());
        payload.put("orderId", order.id().toString());
        payload.put("issueDate", d.issueDate().toString());
        payload.put("competence", d.competence().toString());
        payload.put("totalCents", d.total().centsAsString());
        payload.put("lines", d.lines().stream().map(l -> Map.of("description", l.description(), "kind", l.kind().name(),
                "amountCents", l.amount().centsAsString())).toList());
        outbox.append("DocumentRegistered", ENTITY, d.id().toString(), payload, user.username());
        link(user, d, proposal.links());
        receipts.complete(user.username(), key, d.id().toString());
        return view(d.id());
    }

    /** LinkDocumentToTitles: acrescenta vínculos a um documento ativo, com a versão lida; a mesma chave não repete. */
    @Transactional
    public DocumentRepository.Summary addLinks(UUID id, long expectedVersion, String idempotencyKey, List<LinkRequest> raw) {
        CurrentUser user = CurrentUserHolder.require(Permissions.DOCUMENT_LINK);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "LinkDocumentToTitles", Map.of("documentId", id.toString(),
                "links", raw == null ? List.of() : raw));
        if (done.isPresent()) return view(id);
        BusinessDocument current = repository.findForUpdate(id).orElseThrow(DocumentService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        List<FieldIssue> issues = new ArrayList<>();
        List<BusinessDocument.LinkRequest> links = links(raw, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("DOCUMENT_INVALID", "Corrija os vínculos indicados.", issues);
        link(user, current, links);
        receipts.complete(user.username(), key, id.toString());
        return view(id);
    }

    /**
     * Vincula com o documento já bloqueado (ou recém-criado): confere o total do documento, bloqueia as parcelas em ordem
     * de id, relê a situação delas e confere o faturado de cada uma contra o valor original (PD-023).
     */
    private void link(CurrentUser user, BusinessDocument current, List<BusinessDocument.LinkRequest> requests) {
        Instant now = clock.instant();
        BusinessDocument linked = current.addLinks(requests, now, user.username());
        List<UUID> ids = requests.stream().map(BusinessDocument.LinkRequest::titleId).toList();
        Map<UUID, TitleView> before = byId(titles.byIds(ids));
        Map<UUID, Long> limits = new LinkedHashMap<>();
        for (int i = 0; i < requests.size(); i++) {
            TitleView t = before.get(requests.get(i).titleId());
            if (t == null) {
                throw new RuleViolationException("DOCUMENT_INVALID", "Parcela não encontrada.",
                        List.of(new FieldIssue("links[" + i + "].titleId", "Parcela não encontrada.")));
            }
            limits.put(t.id(), t.originalCents());
        }
        Map<UUID, Long> invoiced = repository.lockInvoicing(limits);
        // Relida depois do bloqueio: um cancelamento de pedido que terminou antes aparece aqui.
        Map<UUID, TitleView> locked = byId(titles.byIds(ids));
        List<String[]> audited = new ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            BusinessDocument.LinkRequest r = requests.get(i);
            TitleView t = locked.get(r.titleId());
            String f = "links[" + i + "]";
            if (!"RECEIVABLE".equals(t.direction())) {
                throw new RuleViolationException("DOCUMENT_INVALID", "O título " + t.code() + " não é uma parcela a receber.",
                        List.of(new FieldIssue(f + ".titleId", "Não é conta a receber.")));
            }
            if (!current.partnerId().equals(t.counterpartyId())) {
                throw new RuleViolationException("DOCUMENT_INVALID", "A parcela " + t.code() + " é de outro cliente; a nota só se vincula "
                        + "a parcelas do cliente dela.", List.of(new FieldIssue(f + ".titleId", "Cliente diferente.")));
            }
            if ("CANCELLED".equals(t.status())) {
                throw new InvalidStateException("A parcela " + t.code() + " está cancelada e não recebe vínculo de documento.");
            }
            long already = invoiced.get(t.id());
            // Regime de caixa (PD-023, Review da Sprint 6): só o recebido que ainda não tem nota.
            long free = Math.max(0, t.receivedCents() - already);
            if (r.amount().cents() > free) {
                throw new RuleViolationException("LINK_EXCEEDS_TITLE", "O vínculo de " + r.amount().toBrl() + " passa do recebido sem nota "
                        + "na parcela " + t.code() + " (" + brl(free) + "). A nota só fatura o que já foi recebido.",
                        List.of(new FieldIssue(f + ".amountCents", "A emitir da parcela: " + brl(free) + ".")));
            }
            repository.setInvoiced(t.id(), already + r.amount().cents());
            audited.add(new String[]{t.id().toString(), t.code(), brl(already), brl(already + r.amount().cents()), r.amount().centsAsString()});
        }
        repository.update(linked, current.version());
        for (String[] a : audited) {
            audit.record(new AuditEntry(user.username(), "FINANCIAL_TITLE_DOCUMENT_LINKED", TITLE_ENTITY, a[0], 0, null,
                    Map.of("document", new AuditEntry.Change(null, current.code() + " — nº " + current.number()),
                            "invoiced", new AuditEntry.Change(a[2], a[3])), CorrelationId.current()));
        }
        audit.record(new AuditEntry(user.username(), "DOCUMENT_LINKED_TO_TITLES", ENTITY, current.id().toString(), linked.version(), null,
                Map.of("links", new AuditEntry.Change(null, audited.stream().map(a -> a[1] + ": " + brl(Long.parseLong(a[4])))
                                .collect(Collectors.joining(", "))),
                        "linkedCents", new AuditEntry.Change(current.linked().centsAsString(), linked.linked().centsAsString())),
                CorrelationId.current()));
        outbox.append("DocumentLinkedToTitles", ENTITY, current.id().toString(), linksPayload(linked), user.username());
    }

    /** RemoveDocumentLink: desfaz um vínculo com motivo; vínculo já desfeito devolve o documento como está. */
    @Transactional
    public DocumentRepository.Summary removeLink(UUID id, UUID linkId, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.DOCUMENT_LINK);
        BusinessDocument current = repository.findForUpdate(id).orElseThrow(DocumentService::notFound);
        BusinessDocument.Link link = current.links().stream().filter(l -> l.id().equals(linkId)).findFirst()
                .orElseThrow(() -> new NotFoundException("Vínculo não encontrado neste documento."));
        if (link.status() == BusinessDocument.LinkStatus.DESFEITO) return view(id);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        String why = reason(reason, "Informe o motivo para desfazer o vínculo.");
        Instant now = clock.instant();
        BusinessDocument changed = current.removeLink(linkId, why, now, user.username());
        unlinkTitles(user, current, List.of(link), why);
        repository.update(changed, current.version());
        audit.record(new AuditEntry(user.username(), "DOCUMENT_LINK_REMOVED", ENTITY, id.toString(), changed.version(), why,
                Map.of("linkedCents", new AuditEntry.Change(current.linked().centsAsString(), changed.linked().centsAsString())),
                CorrelationId.current()));
        outbox.append("DocumentLinkRemoved", ENTITY, id.toString(), Map.of("documentId", id.toString(), "linkId", linkId.toString(),
                "titleId", link.titleId().toString(), "amountCents", link.amount().centsAsString(), "reason", why), user.username());
        return view(id);
    }

    /** CancelDocument: motivo obrigatório; desfaz todos os vínculos; cancelar de novo devolve o cancelamento existente. */
    @Transactional
    public DocumentRepository.Summary cancel(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.DOCUMENT_CANCEL);
        BusinessDocument current = repository.findForUpdate(id).orElseThrow(DocumentService::notFound);
        if (current.status() == BusinessDocument.Status.CANCELADO) return view(id);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        String why = reason(reason, "Informe o motivo do cancelamento.");
        BusinessDocument cancelled = current.cancel(why, clock.instant(), user.username());
        unlinkTitles(user, current, current.activeLinks(), why);
        repository.update(cancelled, current.version());
        audit.record(new AuditEntry(user.username(), "DOCUMENT_CANCELLED", ENTITY, id.toString(), cancelled.version(), why,
                Map.of("status", new AuditEntry.Change(current.status().name(), cancelled.status().name()),
                        "linkedCents", new AuditEntry.Change(current.linked().centsAsString(), "0")), CorrelationId.current()));
        outbox.append("DocumentCancelled", ENTITY, id.toString(), Map.of("documentId", id.toString(), "reason", why,
                "releasedTitleIds", current.activeLinks().stream().map(l -> l.titleId().toString()).toList()), user.username());
        return view(id);
    }

    /** Devolve às parcelas (bloqueadas em ordem de id) o valor dos vínculos desfeitos. */
    private void unlinkTitles(CurrentUser user, BusinessDocument d, List<BusinessDocument.Link> links, String why) {
        if (links.isEmpty()) return;
        Map<UUID, Long> amounts = links.stream().collect(Collectors.toMap(BusinessDocument.Link::titleId, l -> l.amount().cents()));
        Map<UUID, Long> limits = byId(titles.byIds(List.copyOf(amounts.keySet()))).values().stream()
                .collect(Collectors.toMap(TitleView::id, TitleView::originalCents));
        Map<UUID, Long> invoiced = repository.lockInvoicing(limits);
        for (Map.Entry<UUID, Long> e : amounts.entrySet()) {
            long before = invoiced.get(e.getKey());
            long after = before - e.getValue();
            if (after < 0) throw new IllegalStateException("Faturado negativo na parcela " + e.getKey());
            repository.setInvoiced(e.getKey(), after);
            audit.record(new AuditEntry(user.username(), "FINANCIAL_TITLE_DOCUMENT_UNLINKED", TITLE_ENTITY, e.getKey().toString(), 0, why,
                    Map.of("document", new AuditEntry.Change(d.code() + " — nº " + d.number(), null),
                            "invoiced", new AuditEntry.Change(brl(before), brl(after))), CorrelationId.current()));
        }
    }

    /**
     * ClassifyDocument: natureza da operação e projeto (um dos projetos das parcelas vinculadas). Nunca inferida da
     * descrição; cada reclassificação é uma nova revisão.
     */
    @Transactional
    public DocumentRepository.Summary classify(UUID id, long expectedVersion, ClassifyRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.DOCUMENT_CLASSIFY);
        BusinessDocument current = repository.findForUpdate(id).orElseThrow(DocumentService::notFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        BusinessDocument.OperationNature nature;
        try {
            nature = BusinessDocument.OperationNature.valueOf(r == null || r.operationNature() == null ? "" : r.operationNature().strip());
        } catch (IllegalArgumentException e) {
            throw new RuleViolationException("DOCUMENT_INVALID", "Escolha a natureza da operação.",
                    List.of(new FieldIssue("operationNature", "Obrigatório.")));
        }
        UUID project = null;
        if (r.projectId() != null && !r.projectId().isBlank()) {
            List<FieldIssue> issues = new ArrayList<>();
            project = uuid(r.projectId(), "projectId", "Projeto inválido.", issues);
            List<UUID> linked = current.activeLinks().stream().map(BusinessDocument.Link::titleId).toList();
            UUID wanted = project;
            boolean ofLinked = project != null && titles.byIds(linked).stream().anyMatch(t -> wanted.equals(t.projectId()));
            if (!ofLinked) {
                throw new RuleViolationException("DOCUMENT_INVALID", "O projeto da classificação deve ser o de uma parcela vinculada.",
                        List.of(new FieldIssue("projectId", "Não é o projeto das parcelas vinculadas.")));
            }
        }
        BusinessDocument classified = current.classify(nature, project, clock.instant(), user.username());
        repository.update(classified, current.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("operationNature", new AuditEntry.Change(current.operationNature() == null ? null : current.operationNature().name(),
                nature.name()));
        if (!Objects.equals(current.projectId(), project)) {
            changes.put("project", new AuditEntry.Change(current.projectId() == null ? null : current.projectId().toString(),
                    project == null ? null : project.toString()));
        }
        changes.put("classificationRevision", new AuditEntry.Change(Integer.toString(current.classificationRev()),
                Integer.toString(classified.classificationRev())));
        audit.record(new AuditEntry(user.username(), "DOCUMENT_CLASSIFIED", ENTITY, id.toString(), classified.version(), null, changes,
                CorrelationId.current()));
        Map<String, Object> classes = new LinkedHashMap<>();
        classes.put("operationNature", nature.name());
        classes.put("projectId", project == null ? null : project.toString());
        classes.put("lineKinds", current.lines().stream().map(l -> l.kind().name()).distinct().toList());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("documentId", id.toString());
        payload.put("classificationRuleRevision", "MANUAL-" + classified.classificationRev());
        payload.put("classes", classes);
        outbox.append("DocumentClassified", ENTITY, id.toString(), payload, user.username());
        return view(id);
    }

    private void duplicate(String series, String number, UUID customer) {
        repository.findActiveNumber(BusinessDocument.Direction.SAIDA, customer, series, number).ifPresent(code -> {
            throw new RuleViolationException("DOCUMENT_DUPLICATE", "A nota série " + series + " nº " + number
                    + " deste cliente já está registrada como " + code + ".",
                    List.of(new FieldIssue("number", "Já registrada como " + code + ".")));
        });
    }

    private static Map<String, Object> linksPayload(BusinessDocument d) {
        return Map.of("documentId", d.id().toString(), "links", d.activeLinks().stream()
                .map(l -> Map.of("titleId", l.titleId().toString(), "amountCents", l.amount().centsAsString())).toList());
    }

    private record Parsed(UUID orderId, String series, String number, LocalDate issueDate, YearMonth competence, String amountCents,
                          String notes) { }

    /** Formato e campos obrigatórios; as regras com o pedido e as parcelas vêm depois. */
    private Parsed parse(RegisterRequest r) {
        List<FieldIssue> issues = new ArrayList<>();
        if (r.direction() != null && !r.direction().isBlank() && !"SAIDA".equals(r.direction().strip())) {
            issues.add(new FieldIssue("direction", "Nesta versão só há documentos de saída (SAIDA); os de entrada vêm com as contas a pagar."));
        }
        UUID order = uuid(r.orderId(), "orderId", "Escolha o pedido.", issues);
        String series = r.series() == null ? "" : r.series().strip();
        if (series.isEmpty()) issues.add(new FieldIssue("series", "Informe a série (ex.: 1)."));
        else if (!series.matches("[A-Za-z0-9]{1,10}")) issues.add(new FieldIssue("series", "Até 10 letras ou números."));
        String number = r.number() == null ? "" : r.number().strip();
        if (number.isEmpty()) issues.add(new FieldIssue("number", "Informe o número da nota."));
        else if (!number.matches("\\d{1,20}")) issues.add(new FieldIssue("number", "Só números, até 20 dígitos."));
        else number = number.replaceFirst("^0+(?=\\d)", "");
        LocalDate issue = null;
        if (r.issueDate() == null || r.issueDate().isBlank()) {
            issues.add(new FieldIssue("issueDate", "Informe a data de emissão."));
        } else {
            try {
                issue = LocalDate.parse(r.issueDate().strip());
                if (issue.isAfter(LocalDate.now(clock.withZone(BUSINESS_ZONE)))) {
                    issues.add(new FieldIssue("issueDate", "A emissão não pode ser futura."));
                }
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("issueDate", "Data inválida."));
            }
        }
        YearMonth competence = null;
        if (r.competence() == null || r.competence().isBlank()) {
            issues.add(new FieldIssue("competence", "Informe a competência (mês/ano)."));
        } else {
            try {
                competence = YearMonth.parse(r.competence().strip());
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("competence", "Competência inválida; use AAAA-MM."));
            }
        }
        if (r.notes() != null && r.notes().strip().length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("DOCUMENT_INVALID", "Corrija os campos indicados.", issues);
        String notes = r.notes() == null || r.notes().isBlank() ? null : r.notes().strip();
        return new Parsed(order, series.toUpperCase(java.util.Locale.ROOT), number, issue, competence, r.amountCents(), notes);
    }

    private static List<BusinessDocument.LinkRequest> links(List<LinkRequest> raw, List<FieldIssue> issues) {
        List<BusinessDocument.LinkRequest> out = new ArrayList<>();
        List<LinkRequest> list = raw == null ? List.of() : raw;
        for (int i = 0; i < list.size(); i++) {
            LinkRequest l = list.get(i);
            String f = "links[" + i + "]";
            UUID title = uuid(l == null ? null : l.titleId(), f + ".titleId", "Escolha a parcela.", issues);
            Money amount = cents(l == null ? null : l.amountCents(), f + ".amountCents", issues);
            if (title != null && amount != null) out.add(new BusinessDocument.LinkRequest(title, amount));
        }
        return out;
    }

    private static String reason(String raw, String missing) {
        String why = raw == null ? "" : raw.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("DOCUMENT_INVALID", missing,
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        return why;
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

    private static Map<UUID, TitleView> byId(List<TitleView> list) {
        return list.stream().collect(Collectors.toMap(TitleView::id, Function.identity()));
    }

    private static String brl(long cents) {
        return Money.ofCents(cents, Currency.BRL).toBrl();
    }

    private DocumentRepository.Summary view(UUID id) {
        return repository.find(id).orElseThrow(DocumentService::notFound);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Documento não encontrado.");
    }
}
