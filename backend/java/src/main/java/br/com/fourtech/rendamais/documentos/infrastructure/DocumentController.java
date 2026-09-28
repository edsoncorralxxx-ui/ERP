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

    record LineDto(int seq, String description, String kind, String amountCents) { }

    record LinkDto(String id, String titleId, String titleCode, String titleLabel, String amountCents, String status,
                   String removedReason, Instant removedAt, String removedBy, Instant createdAt, String createdBy) { }

    record DocumentDto(String id, String code, String direction, String customerId, String customerCode, String customerName,
                       String series, String number, LocalDate issueDate, String competence, String totalCents, String linkedCents,
                       String unlinkedCents, List<LineDto> lines, List<LinkDto> links, String notes, String operationNature,
                       String projectId, String projectCode, int classificationRevision, String status, String cancelReason,
                       String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static DocumentDto of(DocumentRepository.Summary s) {
            BusinessDocument d = s.document();
            return new DocumentDto(d.id().toString(), d.code(), d.direction().name(), d.partnerId().toString(), s.partnerCode(),
                    s.partnerName(), d.series(), d.number(), d.issueDate(), d.competence().toString(), d.total().centsAsString(),
                    d.linked().centsAsString(), d.unlinked().centsAsString(),
                    d.lines().stream().map(l -> new LineDto(l.seq(), l.description(), l.kind().name(), l.amount().centsAsString())).toList(),
                    d.links().stream().map(l -> {
                        DocumentRepository.TitleRef t = s.titles().get(l.titleId());
                        return new LinkDto(l.id().toString(), l.titleId().toString(), t == null ? null : t.code(), t == null ? null : t.label(),
                                l.amount().centsAsString(), l.status().name(), l.removedReason(), l.removedAt(), l.removedBy(),
                                l.createdAt(), l.createdBy());
                    }).toList(),
                    d.notes(), d.operationNature() == null ? null : d.operationNature().name(),
                    d.projectId() == null ? null : d.projectId().toString(), s.projectCode(), d.classificationRev(), d.status().name(),
                    d.cancelReason(), Long.toString(d.version()), d.createdAt(), d.createdBy(), d.updatedAt(), d.updatedBy());
        }
    }

    record TitleDocumentDto(String documentId, String documentCode, String series, String number, LocalDate issueDate, String amountCents) { }

    record InvoicingDto(String titleId, String titleCode, String label, LocalDate dueDate, String titleStatus, String projectId,
                        String originalCents, String receivedCents, String balanceCents, String invoicedCents, String toInvoiceCents,
                        List<TitleDocumentDto> documents) {
        static InvoicingDto of(DocumentService.TitleInvoicing i) {
            TitleView t = i.title();
            return new InvoicingDto(t.id().toString(), t.code(), t.label(), t.dueDate(), t.status(),
                    t.projectId() == null ? null : t.projectId().toString(), Long.toString(t.originalCents()),
                    Long.toString(t.receivedCents()), Long.toString(t.balanceCents()), Long.toString(i.invoicedCents()),
                    Long.toString(i.toInvoiceCents()), i.documents().stream().map(l -> new TitleDocumentDto(l.documentId().toString(),
                    l.documentCode(), l.series(), l.number(), l.issueDate(), Long.toString(l.amountCents()))).toList());
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

    private static ResponseEntity<DocumentDto> respond(HttpStatus status, DocumentRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.document().version() + "\"").body(DocumentDto.of(s));
    }
}
