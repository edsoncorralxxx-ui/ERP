package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.BankAccountRepository;
import br.com.fourtech.rendamais.financeiro.application.BankAccountService;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.format.annotation.DateTimeFormat;
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
import java.util.UUID;

/** Contas financeiras (caixa e bancos), com saldo e extrato de movimentos. Alterar exige {@code bank_account.admin}. */
@RestController
@RequestMapping("/api/v1/bank-accounts")
class BankAccountController {

    private final BankAccountService service;

    BankAccountController(BankAccountService service) {
        this.service = service;
    }

    record AccountDto(String id, String code, String name, String kind, String bank, String agency, String accountNumber,
                      String openingCents, LocalDate openingOn, String balanceCents, long movements, String status, String version,
                      Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static AccountDto of(BankAccountRepository.Summary s) {
            BankAccount a = s.account();
            return new AccountDto(a.id().toString(), a.code(), a.name(), a.kind().name(), a.bank(), a.agency(), a.accountNumber(),
                    Long.toString(a.openingCents()), a.openingOn(), Long.toString(s.balanceCents()), s.movements(), a.status().name(),
                    Long.toString(a.version()), a.createdAt(), a.createdBy(), a.updatedAt(), a.updatedBy());
        }
    }

    record MovementDto(String id, LocalDate effectiveDate, String amountCents, String kind, String settlementId,
                       String settlementCode, String description, String balanceCents, Instant createdAt, String createdBy) {
        static MovementDto of(BankAccountRepository.Movement m) {
            return new MovementDto(m.id().toString(), m.effectiveDate(), Long.toString(m.amountCents()), m.kind(),
                    m.settlementId().toString(), m.settlementCode(), m.description(), Long.toString(m.runningCents()), m.createdAt(),
                    m.createdBy());
        }
    }

    @GetMapping
    List<AccountDto> list(@RequestParam(value = "includeInactive", defaultValue = "false") boolean includeInactive) {
        return service.list(includeInactive).stream().map(AccountDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<AccountDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<AccountDto> create(@RequestBody BankAccountService.Request body) {
        return respond(HttpStatus.CREATED, service.create(body));
    }

    @PutMapping("/{id}")
    ResponseEntity<AccountDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                      @RequestBody BankAccountService.Request body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body));
    }

    /** Extrato: movimentos com o saldo acumulado; {@code from}/{@code to} (AAAA-MM-DD) recortam o período. */
    @GetMapping("/{id}/movements")
    List<MovementDto> movements(@PathVariable UUID id, @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.movements(id, from, to).stream().map(MovementDto::of).toList();
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<AccountDto> respond(HttpStatus status, BankAccountRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.account().version() + "\"").body(AccountDto.of(s));
    }
}
