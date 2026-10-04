package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.domain.Employee;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Colaboradores (Sprint 13): cadastrar (idempotente), alterar com versão, inativar e reativar, com auditoria e evento. */
@Service
public class EmployeeService {

    static final String ENTITY = "employee";

    private final EmployeeRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public EmployeeService(EmployeeRepository repository, AuditTrail audit, AuditQuery auditQuery, Outbox outbox,
                           CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Employee> list(String search, Partner.Status status) {
        CurrentUserHolder.require(Permissions.EMPLOYEE_READ);
        return repository.list(search == null ? null : search.strip(), status);
    }

    @Transactional(readOnly = true)
    public Employee get(UUID id) {
        CurrentUserHolder.require(Permissions.EMPLOYEE_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.EMPLOYEE_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional
    public Employee register(String idempotencyKey, Employee.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.EMPLOYEE_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterEmployee", data);
        if (done.isPresent()) return find(UUID.fromString(done.get()));
        Employee e = Employee.register(data, clock.instant(), user.username());
        if (repository.codeExists(e.code())) {
            throw new RuleViolationException("EMPLOYEE_CODE_DUPLICATE", "Já existe um colaborador com a matrícula " + e.code() + ".",
                    List.of(new FieldIssue("code", "Matrícula já usada.")));
        }
        repository.insert(e);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        e.diff(blank(e)).forEach((f, v) -> {
            if (v[0] != null) changes.put(f, new AuditEntry.Change(null, v[0]));
        });
        record(user, "EMPLOYEE_REGISTERED", e, null, changes);
        outbox.append("EmployeeRegistered", ENTITY, e.id().toString(), Map.of("employeeId", e.id().toString()), user.username());
        receipts.complete(user.username(), key, e.id().toString());
        return e;
    }

    @Transactional
    public Employee update(UUID id, long expectedVersion, Employee.Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.EMPLOYEE_ADMIN);
        Employee current = find(id);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Employee updated = current.update(data, clock.instant(), user.username());
        if (!repository.update(updated, expectedVersion)) {
            throw new VersionConflictException(ENTITY, expectedVersion, find(id).version());
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, "EMPLOYEE_UPDATED", updated, null, changes);
        outbox.append("EmployeeUpdated", ENTITY, id.toString(),
                Map.of("employeeId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return updated;
    }

    /** Inativa ou reativa: idempotente. */
    @Transactional
    public Employee setStatus(UUID id, long expectedVersion, Partner.Status status) {
        CurrentUser user = CurrentUserHolder.require(Permissions.EMPLOYEE_ADMIN);
        Employee current = find(id);
        if (current.status() == status) return current;
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Employee changed = current.withStatus(status, clock.instant(), user.username());
        repository.update(changed, expectedVersion);
        record(user, status == Partner.Status.ATIVO ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED", changed, null,
                Map.of("status", new AuditEntry.Change(current.status().name(), status.name())));
        outbox.append("EmployeeUpdated", ENTITY, id.toString(), Map.of("employeeId", id.toString(), "changedFields", List.of("status")),
                user.username());
        return changed;
    }

    private Employee find(UUID id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Colaborador não encontrado."));
    }

    private static Employee blank(Employee e) {
        return new Employee(e.id(), null, null, null, null, null, null, null, null, null, 0, null, null, null, null);
    }

    private void record(CurrentUser user, String action, Employee e, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, e.id().toString(), e.version(), reason, changes,
                CorrelationId.current()));
    }
}
