package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.ProposalRepository;
import br.com.fourtech.rendamais.comercial.application.ProposalService;
import br.com.fourtech.rendamais.comercial.application.SalesOrderService;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
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
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Oportunidades e propostas (S4): rascunho com Idempotency-Key; alteração, emissão, nova revisão e perda com If-Match;
 * conversão em pedido com Idempotency-Key.
 */
@RestController
@RequestMapping("/api/v1/proposals")
class ProposalController {

    private final ProposalService service;
    private final SalesOrderService orders;

    ProposalController(ProposalService service, SalesOrderService orders) {
        this.service = service;
        this.orders = orders;
    }

    record ProposalRequest(String opportunityId, String customerId, String unitId, String title, String validUntil, String paymentTerms,
                           List<CommercialDtos.LineDto> lines) {
        Proposal.Data toData() {
            return new Proposal.Data(opportunityId, customerId, unitId, title, validUntil, paymentTerms, CommercialDtos.data(lines));
        }
    }

    record RevisionDto(String id, int revision, String status, LocalDate validUntil, String paymentTerms, String totalCents,
                       Instant issuedAt, String issuedBy, List<CommercialDtos.LineDto> lines) {
        static RevisionDto of(Proposal.Revision r) {
            return new RevisionDto(r.id().toString(), r.number(), r.status().name(), r.validUntil(), r.paymentTerms(),
                    Long.toString(r.totalCents()), r.issuedAt(), r.issuedBy(), CommercialDtos.dtos(r.lines()));
        }
    }

    record ProposalDto(String id, String code, String opportunityId, String opportunityCode, String customerId, String customerCode, String customerName, String unitId,
                       String unitName, String title, String status, String outcomeReason, int currentRevision,
                       List<RevisionDto> revisions, String version, Instant createdAt, String createdBy, Instant updatedAt,
                       String updatedBy) {
        static ProposalDto of(ProposalRepository.Summary s) {
            Proposal p = s.proposal();
            return new ProposalDto(p.id().toString(), p.code(), p.opportunityId().toString(), s.opportunityCode(), p.customerId().toString(), s.customerCode(), s.customerName(),
                    p.unitId() == null ? null : p.unitId().toString(), p.unitName(), p.title(), p.status().name(), p.outcomeReason(),
                    p.current().number(), p.revisions().stream().map(RevisionDto::of).toList(), Long.toString(p.version()),
                    p.createdAt(), p.createdBy(), p.updatedAt(), p.updatedBy());
        }
    }

    record ProposalSummary(String id, String code, String opportunityCode, String customerCode, String customerName, String unitName, String title,
                           String status, int revision, String revisionStatus, LocalDate validUntil, String totalCents,
                           String version) {
        static ProposalSummary of(ProposalRepository.Summary s) {
            Proposal p = s.proposal();
            Proposal.Revision r = p.current();
            return new ProposalSummary(p.id().toString(), p.code(), s.opportunityCode(), s.customerCode(), s.customerName(), p.unitName(), p.title(),
                    p.status().name(), r.number(), r.status().name(), r.validUntil(), Long.toString(r.totalCents()),
                    Long.toString(p.version()));
        }
    }

    /** {@code lossReason}: motivo da lista do CRM (PRECO, PRAZO, CONCORRENTE, SEM_ORCAMENTO, DESISTIU, OUTRO). */
    record OutcomeRequest(String outcome, String reason, String lossReason) { }

    record ConvertRequest(String unitId, String contractDate) { }

    @GetMapping
    List<ProposalSummary> list(@RequestParam(value = "search", required = false) String search,
                               @RequestParam(value = "status", required = false) String status) {
        Proposal.Status s = status == null || status.isBlank() || "TODOS".equalsIgnoreCase(status) ? null
                : Proposal.Status.valueOf(status.toUpperCase(Locale.ROOT));
        return service.list(search, s).stream().map(ProposalSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<ProposalDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<ProposalDto> draft(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                      @RequestBody ProposalRequest body) {
        return respond(HttpStatus.CREATED, service.draft(key, body.toData()));
    }

    @PutMapping("/{id}")
    ResponseEntity<ProposalDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                       @RequestBody ProposalRequest body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body.toData()));
    }

    @PostMapping("/{id}/issue")
    ResponseEntity<ProposalDto> issue(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.issue(id, Versions.required(ifMatch)));
    }

    @PostMapping("/{id}/revisions")
    ResponseEntity<ProposalDto> newRevision(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.newRevision(id, Versions.required(ifMatch)));
    }

    /** RecordProposalOutcome: aqui só a perda; o ganho é a conversão em pedido. */
    @PostMapping("/{id}/outcome")
    ResponseEntity<ProposalDto> outcome(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody OutcomeRequest body) {
        long version = Versions.required(ifMatch);
        if (!"PERDIDA".equalsIgnoreCase(body.outcome() == null ? "" : body.outcome().strip())) {
            throw new RuleViolationException("PROPOSAL_INVALID",
                    "Registre aqui só a perda; o ganho é registrado ao converter a proposta em pedido.",
                    List.of(new FieldIssue("outcome", "Use PERDIDA.")));
        }
        return respond(HttpStatus.OK, service.lose(id, version, body.reason(), body.lossReason()));
    }

    @PostMapping("/{id}/orders")
    ResponseEntity<SalesOrderController.OrderDto> convert(@PathVariable UUID id,
                                                          @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                                          @RequestBody(required = false) ConvertRequest body) {
        var view = orders.convertProposal(id, key, body == null ? null : body.unitId(), body == null ? null : body.contractDate());
        return SalesOrderController.respond(HttpStatus.CREATED, view);
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<ProposalDto> respond(HttpStatus status, ProposalRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.proposal().version() + "\"").body(ProposalDto.of(s));
    }
}
