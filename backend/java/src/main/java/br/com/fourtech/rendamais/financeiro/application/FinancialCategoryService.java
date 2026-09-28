package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.financeiro.domain.FinancialCategory;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Categorias financeiras (PD-010): a lista semeada no planning da Sprint 8 e as que o Administrador cadastra. O código
 * é derivado do nome na criação e não muda (os títulos guardam o código); o nome pode ser corrigido; a categoria do
 * sistema não é inativada.
 */
@Service
public class FinancialCategoryService {

    static final String ENTITY = "financial_category";

    private final FinancialCategoryRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Clock clock;

    public FinancialCategoryService(FinancialCategoryRepository repository, AuditTrail audit, AuditQuery auditQuery, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.clock = clock;
    }

    public record Request(String name, String direction, String status) { }

    @Transactional(readOnly = true)
    public List<FinancialCategory> list(String direction, boolean includeInactive) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        FinancialCategory.Direction d = null;
        if (direction != null && !direction.isBlank()) {
            try {
                d = FinancialCategory.Direction.valueOf(direction.strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new RuleViolationException("CATEGORY_INVALID", "Tipo deve ser RECEITA ou DESPESA.",
                        List.of(new FieldIssue("direction", "Use RECEITA ou DESPESA.")));
            }
        }
        return repository.list(d, includeInactive);
    }

    @Transactional(readOnly = true)
    public FinancialCategory get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional
    public FinancialCategory create(Request r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_CATEGORY_ADMIN);
        List<FieldIssue> issues = new ArrayList<>();
        String name = name(r == null ? null : r.name(), issues);
        FinancialCategory.Direction direction = FinancialCategory.Direction.DESPESA;
        if (r != null && r.direction() != null && !r.direction().isBlank()) {
            try {
                direction = FinancialCategory.Direction.valueOf(r.direction().strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("direction", "Tipo deve ser RECEITA ou DESPESA."));
            }
        }
        if (!issues.isEmpty()) throw new RuleViolationException("CATEGORY_INVALID", "Corrija os campos indicados.", issues);
        duplicate(name, null);
        String base = FinancialCategory.codeFor(name);
        String code = base;
        for (int i = 2; repository.codeExists(code); i++) code = base + "_" + i;
        Instant now = clock.instant();
        FinancialCategory c = new FinancialCategory(UUID.randomUUID(), code, name, direction, FinancialCategory.Status.ATIVO, false, 1,
                now, user.username(), now, user.username());
        repository.insert(c);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, c.code()));
        changes.put("name", new AuditEntry.Change(null, c.name()));
        changes.put("direction", new AuditEntry.Change(null, c.direction().name()));
        audit.record(new AuditEntry(user.username(), "FINANCIAL_CATEGORY_CREATED", ENTITY, c.id().toString(), c.version(), null, changes,
                CorrelationId.current()));
        return c;
    }

    /** Renomeia ou muda a situação, com a versão lida. O tipo (receita/despesa) e o código não mudam. */
    @Transactional
    public FinancialCategory update(UUID id, long expectedVersion, Request r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_CATEGORY_ADMIN);
        FinancialCategory before = find(id);
        if (before.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, before.version());
        List<FieldIssue> issues = new ArrayList<>();
        String name = r == null || r.name() == null ? before.name() : name(r.name(), issues);
        FinancialCategory.Status status = before.status();
        if (r != null && r.status() != null && !r.status().isBlank()) {
            try {
                status = FinancialCategory.Status.valueOf(r.status().strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("status", "Situação deve ser ATIVO ou INATIVO."));
            }
        }
        if (r != null && r.direction() != null && !r.direction().isBlank()
                && !before.direction().name().equals(r.direction().strip().toUpperCase(Locale.ROOT))) {
            issues.add(new FieldIssue("direction", "O tipo da categoria não muda; crie outra categoria."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("CATEGORY_INVALID", "Corrija os campos indicados.", issues);
        if (status == FinancialCategory.Status.INATIVO && before.system()) {
            throw new RuleViolationException("CATEGORY_INVALID", "A categoria " + before.name()
                    + " é usada pelo sistema e não pode ser inativada.", List.of(new FieldIssue("status", "Categoria do sistema.")));
        }
        duplicate(name, id);
        FinancialCategory after = new FinancialCategory(id, before.code(), name, before.direction(), status, before.system(),
                before.version() + 1, before.createdAt(), before.createdBy(), clock.instant(), user.username());
        repository.update(after, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        if (!Objects.equals(before.name(), after.name())) changes.put("name", new AuditEntry.Change(before.name(), after.name()));
        if (before.status() != after.status()) {
            changes.put("status", new AuditEntry.Change(before.status().name(), after.status().name()));
        }
        audit.record(new AuditEntry(user.username(), "FINANCIAL_CATEGORY_UPDATED", ENTITY, id.toString(), after.version(), null, changes,
                CorrelationId.current()));
        return after;
    }

    private void duplicate(String name, UUID self) {
        repository.findByName(name).filter(o -> !o.id().equals(self)).ifPresent(o -> {
            throw new RuleViolationException("CATEGORY_DUPLICATE", "Já existe a categoria " + o.name() + ".",
                    List.of(new FieldIssue("name", "Categoria já cadastrada com este nome.")));
        });
    }

    private static String name(String raw, List<FieldIssue> issues) {
        String name = raw == null ? null : raw.strip();
        if (name == null || name.isEmpty()) issues.add(new FieldIssue("name", "Informe o nome da categoria."));
        else if (name.length() > 100) issues.add(new FieldIssue("name", "Máximo de 100 caracteres."));
        return name;
    }

    private FinancialCategory find(UUID id) {
        return repository.find(id).orElseThrow(() -> new NotFoundException("Categoria financeira não encontrada."));
    }
}
