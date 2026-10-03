package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.ObligationRepository;
import br.com.fourtech.rendamais.fiscal.application.ObligationService;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Obrigações fiscais e acessórias: lista (com as recorrentes garantidas), nova, alterar, entregar e a agenda em .ics. */
@RestController
@RequestMapping("/api/v1/tax-obligations")
class ObligationController {

    private final ObligationService service;

    ObligationController(ObligationService service) {
        this.service = service;
    }

    record ObligationDto(String id, String code, String templateCode, String name, String competence, LocalDate dueDate, String sphere,
                         String kind, String responsible, String detail, String status, LocalDate deliveredOn, String receiptNumber,
                         String notes, long daysToDue, boolean late, boolean dueThisWeek, boolean linked, String version,
                         Instant updatedAt, String updatedBy) {
        static ObligationDto of(ObligationService.View v) {
            ObligationRepository.Obligation o = v.obligation();
            return new ObligationDto(o.id().toString(), o.code(), o.templateCode(), o.name(), o.competence(), o.dueDate(), o.sphere(), o.kind(),
                    o.responsible(), o.detail(), v.status(), v.deliveredOn(), v.receiptNumber(), o.notes(), v.daysToDue(), v.late(),
                    v.dueThisWeek(), v.linked(), Long.toString(o.version()), o.updatedAt() == null ? o.createdAt() : o.updatedAt(),
                    o.updatedBy() == null ? o.createdBy() : o.updatedBy());
        }
    }

    @GetMapping
    List<ObligationDto> list() {
        return service.list().stream().map(ObligationDto::of).toList();
    }

    @GetMapping(value = "/calendar.ics", produces = "text/calendar")
    ResponseEntity<byte[]> calendar() {
        return ResponseEntity.ok().contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"obrigacoes-fiscais.ics\"")
                .body(service.calendar().getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/{id}")
    ResponseEntity<ObligationDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    @PostMapping
    ResponseEntity<ObligationDto> create(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                         @RequestBody(required = false) ObligationService.CreateRequest body) {
        return respond(HttpStatus.CREATED, service.create(key, body));
    }

    @PutMapping("/{id}")
    ResponseEntity<ObligationDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                         @RequestBody(required = false) ObligationService.UpdateRequest body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body));
    }

    @PostMapping("/{id}/deliveries")
    ResponseEntity<ObligationDto> deliver(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                          @RequestBody(required = false) ObligationService.DeliveryRequest body) {
        return respond(HttpStatus.OK, service.deliver(id, Versions.required(ifMatch), body));
    }

    private static ResponseEntity<ObligationDto> respond(HttpStatus status, ObligationService.View v) {
        return ResponseEntity.status(status).eTag("\"" + v.obligation().version() + "\"").body(ObligationDto.of(v));
    }
}
