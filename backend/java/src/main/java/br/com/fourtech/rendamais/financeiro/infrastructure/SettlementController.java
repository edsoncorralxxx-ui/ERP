package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.SettlementRepository;
import br.com.fourtech.rendamais.financeiro.application.SettlementService;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Recebimentos (PostSettlement, com Idempotency-Key) e estornos (ReverseSettlement, idempotente pela liquidação).
 * Valores em centavos como texto de inteiro (ADR-006).
 */
@RestController
@RequestMapping("/api/v1/settlements")
class SettlementController {

    private final SettlementService service;

    SettlementController(SettlementService service) {
        this.service = service;
    }

    record AllocationDto(String titleId, String titleCode, String label, String amountCents) { }

    record SettlementDto(String id, String code, String direction, String accountId, String accountCode, String accountName,
                         String customerId, String customerCode, String customerName, LocalDate effectiveDate, String amountCents,
                         String creditCents, List<AllocationDto> allocations, String notes, String status, String reversalReason,
                         LocalDate reversalDate, Instant reversedAt, String reversedBy, String version, Instant createdAt,
                         String createdBy) {
        static SettlementDto of(SettlementRepository.Summary v) {
            Settlement s = v.settlement();
            Settlement.Reversal r = s.reversal();
            return new SettlementDto(s.id().toString(), s.code(), s.direction().name(), s.accountId().toString(), v.accountCode(),
                    v.accountName(), s.counterpartyId().toString(), v.counterpartyCode(), v.counterpartyName(), s.effectiveDate(),
                    s.total().centsAsString(), "0", v.titles().stream().map(t -> new AllocationDto(t.titleId().toString(), t.code(),
                    t.label(), Long.toString(t.amountCents()))).toList(), s.notes(), s.status().name(),
                    r == null ? null : r.reason(), r == null ? null : r.effectiveDate(), r == null ? null : r.at(),
                    r == null ? null : r.by(), Long.toString(s.version()), s.createdAt(), s.createdBy());
        }
    }

    record ReversalRequest(String reason) { }

    @GetMapping
    List<SettlementDto> list(@RequestParam(value = "titleId", required = false) UUID titleId,
                             @RequestParam(value = "accountId", required = false) UUID accountId) {
        return service.list(titleId, accountId).stream().map(SettlementDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<SettlementDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<SettlementDto> post(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                       @RequestBody SettlementService.PostRequest body) {
        return respond(HttpStatus.CREATED, service.post(key, body));
    }

    @PostMapping("/{id}/reversals")
    ResponseEntity<SettlementDto> reverse(@PathVariable UUID id, @RequestBody(required = false) ReversalRequest body) {
        return respond(HttpStatus.OK, service.reverse(id, body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<SettlementDto> respond(HttpStatus status, SettlementRepository.Summary v) {
        return ResponseEntity.status(status).eTag("\"" + v.settlement().version() + "\"").body(SettlementDto.of(v));
    }
}
