package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.BankAccountRepository;
import br.com.fourtech.rendamais.financeiro.application.BankAccountService;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
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

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Contas financeiras (caixa e bancos) com o saldo atual: abertura + movimentos de caixa. */
@RestController
@RequestMapping("/api/v1/bank-accounts")
class BankAccountController {

    private final BankAccountService service;

    BankAccountController(BankAccountService service) {
        this.service = service;
    }

    record AccountDto(String id, String code, String name, String bank, String openingCents, LocalDate openingOn, String balanceCents,
                      String status, String version) {
        static AccountDto of(BankAccountRepository.WithBalance w) {
            BankAccount a = w.account();
            return new AccountDto(a.id().toString(), a.code(), a.name(), a.bank(), a.opening().centsAsString(), a.openingOn(),
                    Long.toString(w.balanceCents()), a.active() ? "ATIVO" : "INATIVO", Long.toString(a.version()));
        }
    }

    record AccountRequest(String name, String bank, String openingCents, String openingOn) { }

    @GetMapping
    List<AccountDto> list(@RequestParam(value = "includeInactive", defaultValue = "false") boolean includeInactive) {
        return service.list(includeInactive).stream().map(AccountDto::of).toList();
    }

    @GetMapping("/{id}")
    AccountDto get(@PathVariable UUID id) {
        return AccountDto.of(service.get(id));
    }

    @PostMapping
    ResponseEntity<AccountDto> create(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                      @RequestBody AccountRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(AccountDto.of(service.create(key, new BankAccount.Data(body.name(), body.bank(), body.openingCents(), body.openingOn()))));
    }
}
