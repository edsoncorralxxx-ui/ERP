package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.TransferRepository;
import br.com.fourtech.rendamais.financeiro.application.TransferService;
import br.com.fourtech.rendamais.financeiro.domain.Transfer;
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

/** Transferências entre contas próprias (TransferBetweenAccounts, com Idempotency-Key) e o estorno. */
@RestController
@RequestMapping("/api/v1/transfers")
class TransferController {

    private final TransferService service;

    TransferController(TransferService service) {
        this.service = service;
    }

    record TransferDto(String id, String code, String fromAccountId, String fromAccountCode, String fromAccountName, String toAccountId,
                       String toAccountCode, String toAccountName, LocalDate effectiveDate, String amountCents, String notes, String status,
                       String reversalReason, LocalDate reversalDate, Instant reversedAt, String reversedBy, String version,
                       Instant createdAt, String createdBy) {
        static TransferDto of(TransferRepository.Summary s) {
            Transfer t = s.transfer();
            return new TransferDto(t.id().toString(), t.code(), t.fromAccountId().toString(), s.fromCode(), s.fromName(),
                    t.toAccountId().toString(), s.toCode(), s.toName(), t.effectiveDate(), Long.toString(t.amountCents()), t.notes(),
                    t.status().name(), t.reversalReason(), t.reversalDate(), t.reversedAt(), t.reversedBy(), Long.toString(t.version()),
                    t.createdAt(), t.createdBy());
        }
    }

    record ReversalRequest(String reason) { }

    @GetMapping
    List<TransferDto> list(@RequestParam(value = "accountId", required = false) UUID accountId) {
        return service.list(accountId).stream().map(TransferDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<TransferDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<TransferDto> post(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                     @RequestBody TransferService.PostRequest body) {
        return respond(HttpStatus.CREATED, service.post(key, body));
    }

    @PostMapping("/{id}/reversals")
    ResponseEntity<TransferDto> reverse(@PathVariable UUID id, @RequestBody(required = false) ReversalRequest body) {
        return respond(HttpStatus.OK, service.reverse(id, body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<TransferDto> respond(HttpStatus status, TransferRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.transfer().version() + "\"").body(TransferDto.of(s));
    }
}
