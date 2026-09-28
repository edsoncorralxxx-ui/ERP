package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Contas financeiras onde os recebimentos entram: lista com saldo e cadastro mínimo (Administrador). */
@Service
public class BankAccountService {

    static final String ENTITY = "bank_account";

    private final BankAccountRepository repository;
    private final AuditTrail audit;
    private final CommandReceipts receipts;
    private final Clock clock;

    public BankAccountService(BankAccountRepository repository, AuditTrail audit, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Quem consulta títulos vê as contas e os saldos (a tela de recebimento escolhe a conta). */
    @Transactional(readOnly = true)
    public List<BankAccountRepository.WithBalance> list(boolean includeInactive) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(includeInactive);
    }

    @Transactional(readOnly = true)
    public BankAccountRepository.WithBalance get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.findWithBalance(id).orElseThrow(() -> new NotFoundException("Conta não encontrada."));
    }

    /** Nova conta; a mesma chave devolve a mesma conta. O nome é único, sem diferenciar maiúsculas. */
    @Transactional
    public BankAccountRepository.WithBalance create(String idempotencyKey, BankAccount.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BANK_ACCOUNT_MANAGE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterBankAccount", data);
        if (done.isPresent()) return get(UUID.fromString(done.get()));
        BankAccount a = BankAccount.create(repository.nextCode(), data, clock.instant(), user.username());
        if (repository.nameExists(a.name())) {
            throw new RuleViolationException("BANK_ACCOUNT_INVALID", "Já existe uma conta com este nome.",
                    List.of(new FieldIssue("name", "Já existe uma conta com este nome.")));
        }
        repository.insert(a);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, a.code()));
        changes.put("name", new AuditEntry.Change(null, a.name()));
        if (a.bank() != null) changes.put("bank", new AuditEntry.Change(null, a.bank()));
        changes.put("openingCents", new AuditEntry.Change(null, a.opening().centsAsString()));
        changes.put("openingOn", new AuditEntry.Change(null, a.openingOn().toString()));
        audit.record(new AuditEntry(user.username(), "BANK_ACCOUNT_REGISTERED", ENTITY, a.id().toString(), a.version(), null, changes,
                CorrelationId.current()));
        receipts.complete(user.username(), key, a.id().toString());
        return get(a.id());
    }
}
