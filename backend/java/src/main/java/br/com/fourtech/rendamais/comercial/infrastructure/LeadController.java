package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.LeadRepository;
import br.com.fourtech.rendamais.comercial.application.LeadService;
import br.com.fourtech.rendamais.comercial.application.OpportunityService;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.InteractionDto;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.InteractionRequest;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.LeadDto;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.OpportunityDto;
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

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Prospecção (S11): cadastro com Idempotency-Key; alteração, descarte e conversão em cliente com If-Match; interações com
 * Idempotency-Key.
 */
@RestController
@RequestMapping("/api/v1/leads")
class LeadController {

    private final LeadService service;
    private final OpportunityService opportunities;

    LeadController(LeadService service, OpportunityService opportunities) {
        this.service = service;
        this.opportunities = opportunities;
    }

    record LeadRequest(String companyName, String tradeName, String city, String state, String hasRenda, Integer rating,
                       String stage, String owner, String source, String contactName, String contactPhone, String contactEmail,
                       String notes, String nextActionDate, String nextActionNote) {
        Lead.Data toData() {
            return new Lead.Data(companyName, tradeName, city, state, hasRenda, rating, stage, owner, source, contactName,
                    contactPhone, contactEmail, notes, nextActionDate, nextActionNote);
        }
    }

    record ReasonRequest(String reason) { }

    /** Sem {@code customerId}: cadastra o cliente com os dados da prospecção. Com ele: liga a um cliente que já existe. */
    record CustomerRequest(String customerId) { }

    @GetMapping
    List<LeadDto> list(@RequestParam(value = "search", required = false) String search,
                       @RequestParam(value = "stage", required = false) String stage) {
        Lead.Stage s = stage == null || stage.isBlank() || "TODAS".equalsIgnoreCase(stage) ? null
                : Lead.Stage.valueOf(stage.toUpperCase(Locale.ROOT));
        return service.list(search, s).stream().map(LeadDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<LeadDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<LeadDto> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                     @RequestBody LeadRequest body) {
        return respond(HttpStatus.CREATED, service.register(key, body.toData()));
    }

    @PutMapping("/{id}")
    ResponseEntity<LeadDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                   @RequestBody LeadRequest body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body.toData()));
    }

    @PostMapping("/{id}/discard")
    ResponseEntity<LeadDto> discard(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                    @RequestBody ReasonRequest body) {
        return respond(HttpStatus.OK, service.discard(id, Versions.required(ifMatch), body.reason()));
    }

    @PostMapping("/{id}/customer")
    ResponseEntity<LeadDto> customer(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestBody(required = false) CustomerRequest body) {
        long version = Versions.required(ifMatch);
        if (body == null || body.customerId() == null || body.customerId().isBlank()) {
            return respond(HttpStatus.OK, service.convertToCustomer(id, version));
        }
        UUID customer;
        try {
            customer = UUID.fromString(body.customerId().strip());
        } catch (IllegalArgumentException e) {
            throw new RuleViolationException("LEAD_INVALID", "Corrija os campos indicados.",
                    List.of(new FieldIssue("customerId", "Cliente inválido.")));
        }
        return respond(HttpStatus.OK, service.linkCustomer(id, version, customer));
    }

    @GetMapping("/{id}/interactions")
    List<InteractionDto> interactions(@PathVariable UUID id) {
        return service.interactions(id).stream().map(InteractionDto::of).toList();
    }

    @PostMapping("/{id}/interactions")
    ResponseEntity<InteractionDto> recordInteraction(@PathVariable UUID id,
                                                     @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                                     @RequestBody InteractionRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(InteractionDto.of(service.recordInteraction(id, key, body.toData())));
    }

    @GetMapping("/{id}/opportunities")
    List<OpportunityDto> opportunities(@PathVariable UUID id) {
        service.get(id);
        var stages = opportunities.stages();
        return opportunities.list(null, null, null, id, null).stream().map(s -> OpportunityDto.of(s, stages)).toList();
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<LeadDto> respond(HttpStatus status, LeadRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.lead().version() + "\"").body(LeadDto.of(s));
    }
}
