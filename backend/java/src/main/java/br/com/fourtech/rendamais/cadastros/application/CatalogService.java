package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.UnitOfMeasure;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Unidades de medida e categorias de item (S3-03). Todos leem; só quem tem {@code catalog.admin} (o Administrador,
 * decisão do PO) inclui, renomeia e inativa. Nada é apagado: unidade ou categoria em uso continua nos registros.
 */
@Service
public class CatalogService {

    static final String UNIT_ENTITY = "unit_of_measure";
    static final String CATEGORY_ENTITY = "item_category";

    private final CatalogRepository repository;
    private final AuditTrail audit;
    private final Clock clock;

    public CatalogService(CatalogRepository repository, AuditTrail audit, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CatalogRepository.UnitOfMeasureEntry> units() {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        return repository.units();
    }

    @Transactional
    public CatalogRepository.UnitOfMeasureEntry createUnit(String rawCode, String rawName) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CATALOG_ADMIN);
        String code = text(rawCode);
        String name = text(rawName);
        List<FieldIssue> issues = new java.util.ArrayList<>();
        if (code == null) {
            issues.add(new FieldIssue("code", "Informe o código da unidade."));
        } else {
            try {
                code = UnitOfMeasure.of(code).code();
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("code", "Use de 1 a 10 letras ou algarismos, sem espaços."));
            }
        }
        checkName(name, 60, "Informe o nome da unidade.", issues);
        invalid("UNIT_INVALID", issues);
        if (repository.unit(code, false).isPresent()) {
            throw new RuleViolationException("UNIT_DUPLICATE", "Já existe a unidade " + code + ".",
                    List.of(new FieldIssue("code", "Unidade " + code + " já cadastrada.")));
        }
        repository.insertUnit(code, name, clock.instant(), user.username());
        CatalogRepository.UnitOfMeasureEntry created = repository.unit(code, false).orElseThrow();
        record(user, "UNIT_CREATED", UNIT_ENTITY, code, created.version(), Map.of(
                "code", new AuditEntry.Change(null, code), "name", new AuditEntry.Change(null, name)));
        return created;
    }

    /** Renomeia ou muda a situação; o código não muda, porque os itens e documentos o guardam. */
    @Transactional
    public CatalogRepository.UnitOfMeasureEntry updateUnit(String code, long expectedVersion, String rawName, String rawStatus) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CATALOG_ADMIN);
        CatalogRepository.UnitOfMeasureEntry current = repository.unit(code, true)
                .orElseThrow(() -> new NotFoundException("Unidade de medida não encontrada."));
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(UNIT_ENTITY, expectedVersion, current.version());
        }
        String name = text(rawName);
        List<FieldIssue> issues = new java.util.ArrayList<>();
        checkName(name, 60, "Informe o nome da unidade.", issues);
        Partner.Status status = status(rawStatus, issues);
        invalid("UNIT_INVALID", issues);
        repository.updateUnit(code, expectedVersion, name, status, clock.instant(), user.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        change(changes, "name", current.name(), name);
        change(changes, "status", current.status().name(), status.name());
        CatalogRepository.UnitOfMeasureEntry updated = repository.unit(code, false).orElseThrow();
        record(user, "UNIT_UPDATED", UNIT_ENTITY, code, updated.version(), changes);
        return updated;
    }

    @Transactional(readOnly = true)
    public List<CatalogRepository.CategoryEntry> categories() {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        return repository.categories();
    }

    @Transactional
    public CatalogRepository.CategoryEntry createCategory(String rawName) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CATALOG_ADMIN);
        String name = text(rawName);
        List<FieldIssue> issues = new java.util.ArrayList<>();
        checkName(name, 100, "Informe o nome da categoria.", issues);
        invalid("CATEGORY_INVALID", issues);
        UUID id = UUID.randomUUID();
        uniqueName(name, id);
        repository.insertCategory(id, name, clock.instant(), user.username());
        CatalogRepository.CategoryEntry created = repository.category(id, false).orElseThrow();
        record(user, "CATEGORY_CREATED", CATEGORY_ENTITY, id.toString(), created.version(),
                Map.of("name", new AuditEntry.Change(null, name)));
        return created;
    }

    @Transactional
    public CatalogRepository.CategoryEntry updateCategory(UUID id, long expectedVersion, String rawName, String rawStatus) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CATALOG_ADMIN);
        CatalogRepository.CategoryEntry current = repository.category(id, true)
                .orElseThrow(() -> new NotFoundException("Categoria não encontrada."));
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(CATEGORY_ENTITY, expectedVersion, current.version());
        }
        String name = text(rawName);
        List<FieldIssue> issues = new java.util.ArrayList<>();
        checkName(name, 100, "Informe o nome da categoria.", issues);
        Partner.Status status = status(rawStatus, issues);
        invalid("CATEGORY_INVALID", issues);
        uniqueName(name, id);
        repository.updateCategory(id, expectedVersion, name, status, clock.instant(), user.username());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        change(changes, "name", current.name(), name);
        change(changes, "status", current.status().name(), status.name());
        CatalogRepository.CategoryEntry updated = repository.category(id, false).orElseThrow();
        record(user, "CATEGORY_UPDATED", CATEGORY_ENTITY, id.toString(), updated.version(), changes);
        return updated;
    }

    /**
     * Categorias escolhidas num cadastro: precisam existir e estar ativas; as que o registro já tinha continuam aceitas
     * mesmo depois de inativadas, para a edição não obrigar a tirá-las.
     */
    public List<Partner.Category> resolveCategories(List<String> ids, List<Partner.Category> alreadyChosen, String field) {
        List<Partner.Category> out = new java.util.ArrayList<>();
        List<FieldIssue> issues = new java.util.ArrayList<>();
        for (String raw : ids == null ? List.<String>of() : ids) {
            UUID id;
            try {
                id = UUID.fromString(Objects.requireNonNull(raw));
            } catch (RuntimeException e) {
                issues.add(new FieldIssue(field, "Categoria inválida."));
                continue;
            }
            var found = repository.category(id, false);
            boolean known = alreadyChosen.stream().anyMatch(c -> c.id().equals(id));
            if (found.isEmpty()) {
                issues.add(new FieldIssue(field, "Categoria não encontrada."));
            } else if (found.get().status() != Partner.Status.ATIVO && !known) {
                issues.add(new FieldIssue(field, "A categoria " + found.get().name() + " está inativa."));
            } else {
                out.add(new Partner.Category(id, found.get().name()));
            }
        }
        invalid("CATEGORY_INVALID", issues);
        return out;
    }

    private void uniqueName(String name, UUID id) {
        repository.categoryByName(name, id).ifPresent(other -> {
            throw new RuleViolationException("CATEGORY_DUPLICATE", "Já existe a categoria " + other.name() + ".",
                    List.of(new FieldIssue("name", "Categoria " + other.name() + " já cadastrada.")));
        });
    }

    private static Partner.Status status(String raw, List<FieldIssue> issues) {
        try {
            return Partner.Status.valueOf(raw == null ? "ATIVO" : raw.strip().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("status", "Situação deve ser ATIVO ou INATIVO."));
            return Partner.Status.ATIVO;
        }
    }

    private static void checkName(String name, int max, String missing, List<FieldIssue> issues) {
        if (name == null) issues.add(new FieldIssue("name", missing));
        else if (name.length() > max) issues.add(new FieldIssue("name", "Máximo de " + max + " caracteres."));
    }

    private static void invalid(String code, List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException(code, "Corrija os campos indicados.", issues);
    }

    private static void change(Map<String, AuditEntry.Change> changes, String field, String before, String after) {
        if (!Objects.equals(before, after)) changes.put(field, new AuditEntry.Change(before, after));
    }

    private void record(CurrentUser user, String action, String entity, String id, long version, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, entity, id, version, null, changes, CorrelationId.current()));
    }

    private static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }
}
