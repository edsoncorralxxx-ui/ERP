package br.com.fourtech.rendamais.documentos.infrastructure;

import br.com.fourtech.rendamais.documentos.application.DocumentRepository;
import br.com.fourtech.rendamais.documentos.application.DocumentService;
import br.com.fourtech.rendamais.documentos.domain.BusinessDocument;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi.TitleView;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Documentos e faturamento: registrar a nota (RegisterDocument, com Idempotency-Key), vincular parcelas
 * (LinkDocumentToTitles, com If-Match e Idempotency-Key), desfazer vínculo, cancelar e classificar (com If-Match), e o
 * faturado das parcelas. Valores em centavos como texto de inteiro (ADR-006).
 */
@RestController
@RequestMapping("/api/v1")
class DocumentController {

    private final DocumentService service;

    DocumentController(DocumentService service) {
        this.service = service;
    }

    record LineDto(int seq, String description, String kind, String amountCents, String itemId, String annex, String annexSource) { }

    record LinkDto(String id, String titleId, String titleCode, String titleLabel, String amountCents, String status,
                   String removedReason, Instant removedAt, String removedBy, Instant createdAt, String createdBy) { }

    record DocumentDto(String id, String code, String direction, String kind, String customerId, String customerCode, String customerName,
                       String orderId, String orderCode, String series, String number, LocalDate issueDate, String competence, String totalCents, String linkedCents,
                       String unlinkedCents, List<LineDto> lines, List<LinkDto> links, String notes, String operationNature,
                       String projectId, String projectCode, int classificationRevision, String status, String cancelReason,
                       String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy,
                       String authorization, String authorizationProtocol) {
        static DocumentDto of(DocumentRepository.Summary s) {
            BusinessDocument d = s.document();
            return new DocumentDto(d.id().toString(), d.code(), d.direction().name(), d.kind(), d.partnerId().toString(), s.partnerCode(),
                    s.partnerName(), d.orderId() == null ? null : d.orderId().toString(), s.orderCode(), d.series(), d.number(), d.issueDate(), d.competence().toString(), d.total().centsAsString(),
                    d.linked().centsAsString(), d.unlinked().centsAsString(),
                    d.lines().stream().map(l -> new LineDto(l.seq(), l.description(), l.kind().name(), l.amount().centsAsString(),
                            l.itemId() == null ? null : l.itemId().toString(), l.annex(), l.annexSource())).toList(),
                    d.links().stream().map(l -> {
                        DocumentRepository.TitleRef t = s.titles().get(l.titleId());
                        return new LinkDto(l.id().toString(), l.titleId().toString(), t == null ? null : t.code(), t == null ? null : t.label(),
                                l.amount().centsAsString(), l.status().name(), l.removedReason(), l.removedAt(), l.removedBy(),
                                l.createdAt(), l.createdBy());
                    }).toList(),
                    d.notes(), d.operationNature() == null ? null : d.operationNature().name(),
                    d.projectId() == null ? null : d.projectId().toString(), s.projectCode(), d.classificationRev(), d.status().name(),
                    d.cancelReason(), Long.toString(d.version()), d.createdAt(), d.createdBy(), d.updatedAt(), d.updatedBy(),
                    s.authorization(), s.authorizationProtocol());
        }
    }

    record TitleDocumentDto(String documentId, String documentCode, String series, String number, LocalDate issueDate, String amountCents) { }

    record InvoicingDto(String titleId, String titleCode, String label, LocalDate dueDate, String titleStatus, String projectId,
                        String originalCents, String receivedCents, String balanceCents, String invoicedCents, String toInvoiceCents,
                        String toIssueCents, List<TitleDocumentDto> documents) {
        static InvoicingDto of(DocumentService.TitleInvoicing i) {
            TitleView t = i.title();
            return new InvoicingDto(t.id().toString(), t.code(), t.label(), t.dueDate(), t.status(),
                    t.projectId() == null ? null : t.projectId().toString(), Long.toString(t.originalCents()),
                    Long.toString(t.receivedCents()), Long.toString(t.balanceCents()), Long.toString(i.invoicedCents()),
                    Long.toString(i.toInvoiceCents()), Long.toString(i.toIssueCents()), i.documents().stream().map(l -> new TitleDocumentDto(l.documentId().toString(),
                    l.documentCode(), l.series(), l.number(), l.issueDate(), Long.toString(l.amountCents()))).toList());
        }
    }

    record ParcelDto(String titleId, String titleCode, String label, LocalDate dueDate, String titleStatus, String originalCents,
                     String receivedCents, String invoicedCents, String toIssueCents, String proposedCents) { }

    record ProposedLineDto(int seq, String description, String kind, String amountCents) { }

    /** Um tipo da nota no pedido: total das linhas, recebido (proporcional), faturado e a emitir. */
    record KindDto(String orderCents, String receivedCents, String invoicedCents, String toIssueCents) {
        static KindDto of(DocumentService.KindSplit k) {
            return new KindDto(Long.toString(k.orderCents()), Long.toString(k.receivedCents()), Long.toString(k.invoicedCents()),
                    Long.toString(k.toIssueCents()));
        }
    }

    /**
     * Pedido visto pelo caixa: recebido, faturado, a emitir, o a emitir de produto ({@code productCents}) e de serviço
     * ({@code serviceCents}), o detalhe de cada tipo e a nota proposta do tipo {@code kind} (linhas e parcelas).
     */
    record OrderInvoicingDto(String id, String orderCode, String orderStatus, String customerId, String customerCode, String customerName,
                             String projectId, String totalCents, String receivedCents, String invoicedCents, String toIssueCents,
                             String beyondReceivedCents, String productCents, String serviceCents, KindDto product, KindDto service,
                             String kind, String proposedCents, List<ParcelDto> parcels, List<ProposedLineDto> lines) {
        static OrderInvoicingDto of(DocumentService.OrderInvoicing o) {
            var r = o.order();
            return new OrderInvoicingDto(r.id().toString(), r.code(), r.status(), r.customerId().toString(), r.customerCode(),
                    r.customerName(), r.projectId() == null ? null : r.projectId().toString(), Long.toString(r.totalCents()),
                    Long.toString(o.receivedCents()), Long.toString(o.invoicedCents()), Long.toString(o.toIssueCents()),
                    Long.toString(o.beyondReceivedCents()), Long.toString(o.product().toIssueCents()),
                    Long.toString(o.service().toIssueCents()), KindDto.of(o.product()), KindDto.of(o.service()), o.kind().name(),
                    Long.toString(o.proposedCents()),
                    o.parcels().stream().map(p -> new ParcelDto(p.title().id().toString(), p.title().code(), p.title().label(),
                            p.title().dueDate(), p.title().status(), Long.toString(p.title().originalCents()),
                            Long.toString(p.title().receivedCents()), Long.toString(p.invoicedCents()), Long.toString(p.toIssueCents()),
                            Long.toString(p.proposedCents()))).toList(),
                    o.proposal().lines().stream().map(l -> new ProposedLineDto(l.seq(), l.description(), l.kind().name(),
                            l.amount().centsAsString())).toList());
        }
    }

    record LinksRequest(List<DocumentService.LinkRequest> links) { }

    record ReasonRequest(String reason) { }

    /** {@code status}: ATIVOS (padrão), CANCELADOS ou TODOS; {@code competence} no formato AAAA-MM. */
    @GetMapping("/documents")
    List<DocumentDto> list(@RequestParam(value = "search", required = false) String search,
                           @RequestParam(value = "status", required = false) String status,
                           @RequestParam(value = "competence", required = false) String competence,
                           @RequestParam(value = "customerId", required = false) UUID customerId) {
        DocumentRepository.Filter filter = switch (status == null || status.isBlank() ? "ATIVOS" : status.strip().toUpperCase(Locale.ROOT)) {
            case "ATIVOS" -> DocumentRepository.Filter.ACTIVE;
            case "CANCELADOS" -> DocumentRepository.Filter.CANCELLED;
            case "TODOS" -> DocumentRepository.Filter.ALL;
            default -> throw new IllegalArgumentException("Situação inválida: " + status);
        };
        YearMonth month = competence == null || competence.isBlank() ? null : YearMonth.parse(competence.strip());
        return service.list(search, filter, month, customerId).stream().map(DocumentDto::of).toList();
    }

    @GetMapping("/documents/{id}")
    ResponseEntity<DocumentDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping("/documents")
    ResponseEntity<DocumentDto> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                         @RequestBody DocumentService.RegisterRequest body) {
        return respond(HttpStatus.CREATED, service.register(key, body));
    }

    @PostMapping("/documents/{id}/links")
    ResponseEntity<DocumentDto> link(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                     @RequestBody(required = false) LinksRequest body) {
        return respond(HttpStatus.OK, service.addLinks(id, Versions.required(ifMatch), key, body == null ? null : body.links()));
    }

    @PostMapping("/documents/{id}/links/{linkId}/removals")
    ResponseEntity<DocumentDto> removeLink(@PathVariable UUID id, @PathVariable UUID linkId,
                                           @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                           @RequestBody(required = false) ReasonRequest body) {
        return respond(HttpStatus.OK, service.removeLink(id, linkId, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @PostMapping("/documents/{id}/cancellations")
    ResponseEntity<DocumentDto> cancel(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                       @RequestBody(required = false) ReasonRequest body) {
        return respond(HttpStatus.OK, service.cancel(id, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @PutMapping("/documents/{id}/classification")
    ResponseEntity<DocumentDto> classify(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                         @RequestBody(required = false) DocumentService.ClassifyRequest body) {
        return respond(HttpStatus.OK, service.classify(id, Versions.required(ifMatch), body));
    }

    record AuthorizationRequest(String status, String protocol) { }

    /** Situação de autorização da nota (Sprint 12): AUTORIZADA (com o protocolo) ou PENDENTE. */
    @PutMapping("/documents/{id}/authorization")
    ResponseEntity<DocumentDto> authorize(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                          @RequestBody(required = false) AuthorizationRequest body) {
        return respond(HttpStatus.OK, service.authorize(id, Versions.required(ifMatch), body == null ? null : body.status(),
                body == null ? null : body.protocol()));
    }

    @GetMapping("/documents/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    /** Faturado das parcelas: {@code customerId} (parcelas do cliente) ou {@code titleId} repetido. */
    @GetMapping("/invoicing")
    List<InvoicingDto> invoicing(@RequestParam(value = "customerId", required = false) UUID customerId,
                                 @RequestParam(value = "titleId", required = false) List<UUID> titleIds) {
        return service.invoicing(customerId, titleIds).stream().map(InvoicingDto::of).toList();
    }

    /** Pedidos confirmados vistos pelo caixa; {@code status}: A_EMITIR (padrão, só os com recebimento sem nota) ou TODOS. */
    @GetMapping("/invoicing/orders")
    List<OrderInvoicingDto> orders(@RequestParam(value = "search", required = false) String search,
                                   @RequestParam(value = "status", required = false) String status) {
        boolean onlyToIssue = switch (status == null || status.isBlank() ? "A_EMITIR" : status.strip().toUpperCase(Locale.ROOT)) {
            case "A_EMITIR" -> true;
            case "TODOS" -> false;
            default -> throw new IllegalArgumentException("Situação inválida: " + status);
        };
        return service.orders(search, onlyToIssue).stream().map(OrderInvoicingDto::of).toList();
    }

    /**
     * Um pedido visto pelo caixa, com a nota proposta do tipo {@code kind} (PRODUTO ou SERVICO; Produto, se houver) para
     * {@code amountCents} (o a emitir do tipo, se vazio).
     */
    @GetMapping("/invoicing/orders/{orderId}")
    OrderInvoicingDto order(@PathVariable UUID orderId, @RequestParam(value = "kind", required = false) String kind,
                            @RequestParam(value = "amountCents", required = false) String amountCents) {
        return OrderInvoicingDto.of(service.order(orderId, kind, amountCents));
    }

    private static ResponseEntity<DocumentDto> respond(HttpStatus status, DocumentRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.document().version() + "\"").body(DocumentDto.of(s));
    }
}
