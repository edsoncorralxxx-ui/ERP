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
 * Recebimentos (liquidações a receber): registrar com Idempotency-Key, consultar e estornar com motivo. O estorno é
 * idempotente pela própria liquidação: estornar de novo devolve o estorno existente.
 */
@RestController
@RequestMapping("/api/v1/settlements")
class SettlementController {

    private final SettlementService service;

    SettlementController(SettlementService service) {
        this.service = service;
    }

    record AllocationDto(String titleId, String titleCode, String titleLabel, String amountCents) { }

    record SettlementDto(String id, String code, String direction, String accountId, String accountCode, String accountName,
                         String customerId, String customerCode, String customerName, LocalDate effectiveDate, String totalCents,
                         String notes, List<AllocationDto> allocations, String status, String reversalReason, Instant reversedAt,
                         String reversedBy, String version, Instant createdAt, String createdBy) {
        static SettlementDto of(SettlementRepository.Summary v) {
            Settlement s = v.settlement();
            var r = s.reversal();
            return new SettlementDto(s.id().toString(), s.code(), s.direction().name(), s.accountId().toString(), v.accountCode(),
                    v.accountName(), s.counterpartyId().toString(), v.counterpartyCode(), v.counterpartyName(), s.effectiveDate(),
                    s.total().centsAsString(), s.notes(),
                    v.titles().stream().map(t -> new AllocationDto(t.id().toString(), t.code(), t.label(), Long.toString(t.amountCents()))).toList(),
                    s.status().name(), r == null ? null : r.reason(), r == null ? null : r.at(), r == null ? null : r.by(),
                    Long.toString(s.version()), s.createdAt(), s.createdBy());
        }
    }

    record AllocationRequest(String titleId, String amountCents, String expectedTitleVersion) { }

    record PostRequest(String direction, String accountId, String effectiveDate, String amountCents, List<AllocationRequest> allocations,
                       String notes) {
        SettlementService.PostData toData() {
            return new SettlementService.PostData(direction, accountId, effectiveDate, amountCents, allocations == null ? List.of()
                    : allocations.stream().map(a -> a == null ? null
                    : new SettlementService.AllocationData(a.titleId(), a.amountCents(), a.expectedTitleVersion())).toList(), notes);
        }
    }

    record ReversalRequest(String reason) { }

    @GetMapping
    List<SettlementDto> list(@RequestParam(value = "titleId", required = false) UUID titleId,
                             @RequestParam(value = "customerId", required = false) UUID customerId,
                             @RequestParam(value = "search", required = false) String search,
                             @RequestParam(value = "includeReversed", defaultValue = "true") boolean includeReversed) {
        return service.list(titleId, customerId, search, includeReversed).stream().map(SettlementDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<SettlementDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<SettlementDto> post(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                       @RequestBody PostRequest body) {
        return respond(HttpStatus.CREATED, service.post(key, body.toData()));
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
