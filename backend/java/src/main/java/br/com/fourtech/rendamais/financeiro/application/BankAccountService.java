package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Contas financeiras (caixa e bancos) e o extrato de movimentos. Quem lê contas a receber vê as contas e os saldos; só
 * quem tem {@code bank_account.admin} (o Administrador) cadastra e altera. A conta não é apagada: fica inativa.
 */
@Service
public class BankAccountService {

    static final String ENTITY = "bank_account";

    private final BankAccountRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Clock clock;

    public BankAccountService(BankAccountRepository repository, AuditTrail audit, AuditQuery auditQuery, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.clock = clock;
    }

    /** Campos da tela, como chegam da API. */
    public record Request(String name, String kind, String bank, String agency, String accountNumber, String openingCents,
                          String openingOn, String status) { }

    @Transactional(readOnly = true)
    public List<BankAccountRepository.Summary> list(boolean includeInactive) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.list(includeInactive);
    }

    @Transactional(readOnly = true)
    public BankAccountRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<BankAccountRepository.Movement> movements(UUID id, LocalDate from, LocalDate to) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        find(id);
        return repository.movements(id, from, to);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    public record Balances(LocalDate date, List<BankAccountRepository.BalanceAt> balances) { }

    /** Saldos realizados de todas as contas na data (padrão: hoje no fuso da empresa). */
    @Transactional(readOnly = true)
    public Balances balancesAt(LocalDate date) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        LocalDate d = date == null ? LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE)) : date;
        return new Balances(d, repository.balancesAt(d));
    }

    @Transactional
    public BankAccountRepository.Summary create(Request r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BANK_ACCOUNT_ADMIN);
        BankAccount.Data d = validate(r, null);
        Instant now = clock.instant();
        BankAccount a = new BankAccount(UUID.randomUUID(), repository.nextCode(), d.name(), d.kind(), d.bank(), d.agency(),
                d.accountNumber(), d.openingCents(), d.openingOn(), BankAccount.Status.ATIVO, 1, now, user.username(), now,
                user.username());
        repository.insert(a);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        diff(null, a).forEach(changes::put);
        audit.record(new AuditEntry(user.username(), "BANK_ACCOUNT_CREATED", ENTITY, a.id().toString(), a.version(), null, changes,
                CorrelationId.current()));
        return find(a.id());
    }

    /** Altera com a versão lida; saldo inicial e data só mudam enquanto a conta não tem movimento. */
    @Transactional
    public BankAccountRepository.Summary update(UUID id, long expectedVersion, Request r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BANK_ACCOUNT_ADMIN);
        BankAccountRepository.Summary current = find(id);
        BankAccount before = current.account();
        if (before.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, before.version());
        BankAccount.Data d = validate(r, before);
        if (current.movements() > 0 && (d.openingCents() != before.openingCents() || !d.openingOn().equals(before.openingOn()))) {
            throw new RuleViolationException("ACCOUNT_INVALID", "A conta já tem movimentos: o saldo inicial e a data não mudam mais.",
                    List.of(new FieldIssue(d.openingCents() != before.openingCents() ? "openingCents" : "openingOn",
                            "A conta já tem movimentos.")));
        }
        BankAccount after = new BankAccount(id, before.code(), d.name(), d.kind(), d.bank(), d.agency(), d.accountNumber(),
                d.openingCents(), d.openingOn(), d.status(), before.version() + 1, before.createdAt(), before.createdBy(),
                clock.instant(), user.username());
        repository.update(after, expectedVersion);
        audit.record(new AuditEntry(user.username(), "BANK_ACCOUNT_UPDATED", ENTITY, id.toString(), after.version(), null,
                diff(before, after), CorrelationId.current()));
        return find(id);
    }

    private BankAccount.Data validate(Request r, BankAccount current) {
        List<FieldIssue> issues = new ArrayList<>();
        String name = text(r.name());
        if (name == null) issues.add(new FieldIssue("name", "Informe o nome da conta."));
        else if (name.length() > 100) issues.add(new FieldIssue("name", "Máximo de 100 caracteres."));
        BankAccount.Kind kind = BankAccount.Kind.BANCO;
        try {
            if (r.kind() != null && !r.kind().isBlank()) kind = BankAccount.Kind.valueOf(r.kind().strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("kind", "Tipo deve ser CAIXA ou BANCO."));
        }
        String bank = text(r.bank());
        String agency = text(r.agency());
        String number = text(r.accountNumber());
        if (kind == BankAccount.Kind.BANCO && bank == null) issues.add(new FieldIssue("bank", "Informe o banco."));
        if (bank != null && bank.length() > 100) issues.add(new FieldIssue("bank", "Máximo de 100 caracteres."));
        if (agency != null && agency.length() > 20) issues.add(new FieldIssue("agency", "Máximo de 20 caracteres."));
        if (number != null && number.length() > 30) issues.add(new FieldIssue("accountNumber", "Máximo de 30 caracteres."));
        long opening = 0;
        if (r.openingCents() != null && !r.openingCents().isBlank()) {
            if (r.openingCents().strip().matches("-?\\d{1,15}")) opening = Long.parseLong(r.openingCents().strip());
            else issues.add(new FieldIssue("openingCents", "Valor em centavos inválido."));
        }
        LocalDate openingOn = current == null ? LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE)) : current.openingOn();
        if (r.openingOn() != null && !r.openingOn().isBlank()) {
            try {
                openingOn = LocalDate.parse(r.openingOn().strip());
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("openingOn", "Data inválida."));
            }
        }
        BankAccount.Status status = current == null ? BankAccount.Status.ATIVO : current.status();
        try {
            if (r.status() != null && !r.status().isBlank()) status = BankAccount.Status.valueOf(r.status().strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("status", "Situação deve ser ATIVO ou INATIVO."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("ACCOUNT_INVALID", "Corrija os campos indicados.", issues);
        repository.findByName(name).filter(o -> current == null || !o.id().equals(current.id())).ifPresent(o -> {
            throw new RuleViolationException("ACCOUNT_DUPLICATE", "Já existe a conta " + o.code() + " — " + o.name() + ".",
                    List.of(new FieldIssue("name", "Conta " + o.code() + " já cadastrada com este nome.")));
        });
        return new BankAccount.Data(name, kind, bank, agency, number, opening, openingOn, status);
    }

    private static Map<String, AuditEntry.Change> diff(BankAccount a, BankAccount b) {
        Map<String, AuditEntry.Change> out = new LinkedHashMap<>();
        put(out, "code", a == null ? null : a.code(), b.code());
        put(out, "name", a == null ? null : a.name(), b.name());
        put(out, "kind", a == null ? null : a.kind().name(), b.kind().name());
        put(out, "bank", a == null ? null : a.bank(), b.bank());
        put(out, "agency", a == null ? null : a.agency(), b.agency());
        put(out, "accountNumber", a == null ? null : a.accountNumber(), b.accountNumber());
        put(out, "openingCents", a == null ? null : Long.toString(a.openingCents()), Long.toString(b.openingCents()));
        put(out, "openingOn", a == null ? null : a.openingOn().toString(), b.openingOn().toString());
        put(out, "status", a == null ? null : a.status().name(), b.status().name());
        return out;
    }

    private static void put(Map<String, AuditEntry.Change> out, String field, String before, String after) {
        if (!Objects.equals(before, after)) out.put(field, new AuditEntry.Change(before, after));
    }

    private static String text(String raw) {
        return raw == null || raw.isBlank() ? null : raw.strip();
    }

    private BankAccountRepository.Summary find(UUID id) {
        return repository.find(id).orElseThrow(() -> new NotFoundException("Conta financeira não encontrada."));
    }
}
