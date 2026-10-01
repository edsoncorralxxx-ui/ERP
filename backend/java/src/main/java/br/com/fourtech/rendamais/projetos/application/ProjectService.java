package br.com.fourtech.rendamais.projetos.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import br.com.fourtech.rendamais.projetos.api.EquipmentModelApi;
import br.com.fourtech.rendamais.projetos.api.ProjectProvisioningApi;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import br.com.fourtech.rendamais.projetos.domain.Equipment;
import br.com.fourtech.rendamais.projetos.domain.EquipmentModel;
import br.com.fourtech.rendamais.projetos.domain.Project;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Projetos e equipamentos: criados e encerrados pelo comercial (na transação da confirmação ou do cancelamento do
 * pedido) e consultados nas janelas Carteira de projetos, Detalhe do projeto e Equipamentos.
 */
@Service
public class ProjectService implements ProjectProvisioningApi, ProjectQueryApi, EquipmentModelApi {

    static final String PROJECT = "project";
    static final String EQUIPMENT = "equipment";
    static final String MODEL = "equipment_model";

    private final ProjectRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public ProjectService(ProjectRepository repository, AuditTrail audit, AuditQuery auditQuery, Outbox outbox,
                          CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Provisioned provisionFor(ProvisionRequest r) {
        Optional<Project> existing = repository.findByOrderForUpdate(r.orderId());
        if (existing.isPresent()) {
            Project p = existing.get();
            return new Provisioned(p.id(), p.code(), repository.equipmentOf(p.id()).stream().map(Equipment::id).toList());
        }
        String actor = CurrentUserHolder.actorName();
        Instant now = clock.instant();
        Project project = Project.plan(repository.nextProjectCode(), r.name(), r.orderId(), r.orderCode(), r.customerId(),
                r.unitId(), r.unitName(), r.contractDelivery(), r.contractCents(), now, actor);
        repository.insert(project);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, project.code()));
        changes.put("name", new AuditEntry.Change(null, project.name()));
        changes.put("order", new AuditEntry.Change(null, project.orderCode()));
        changes.put("unit", new AuditEntry.Change(null, project.unitName()));
        changes.put("stage", new AuditEntry.Change(null, project.stage().name()));
        audit.record(new AuditEntry(actor, "PROJECT_CREATED", PROJECT, project.id().toString(), project.version(), null, changes,
                CorrelationId.current()));
        outbox.append("ProjectCreated", PROJECT, project.id().toString(), Map.of("projectId", project.id().toString(),
                "orderId", r.orderId().toString(), "customerId", r.customerId().toString(), "unitId", r.unitId().toString()), actor);

        List<UUID> ids = new ArrayList<>();
        for (EquipmentLine line : r.lines()) {
            EquipmentModel model = modelFor(line.model(), now, actor);
            for (int seq = 1; seq <= line.quantity(); seq++) {
                Equipment e = Equipment.create(repository.nextEquipmentCode(), project, line.orderLineId(), seq, line.model(),
                        model.id(), line.itemId(), now, actor);
                repository.insert(e);
                Map<String, AuditEntry.Change> ec = new LinkedHashMap<>();
                ec.put("code", new AuditEntry.Change(null, e.code()));
                ec.put("model", new AuditEntry.Change(null, e.model()));
                ec.put("project", new AuditEntry.Change(null, project.code()));
                audit.record(new AuditEntry(actor, "EQUIPMENT_CREATED", EQUIPMENT, e.id().toString(), e.version(), null, ec,
                        CorrelationId.current()));
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("equipmentId", e.id().toString());
                payload.put("projectId", project.id().toString());
                payload.put("modelId", e.modelId().toString());
                payload.put("unitId", e.unitId().toString());
                outbox.append("EquipmentCreated", EQUIPMENT, e.id().toString(), payload, actor);
                ids.add(e.id());
            }
        }
        return new Provisioned(project.id(), project.code(), ids);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<UUID> closeForCancelledOrder(UUID orderId, String reason) {
        Optional<Project> found = repository.findByOrderForUpdate(orderId);
        if (found.isEmpty() || found.get().stage() == Project.Stage.ENCERRADO) return List.of();
        String actor = CurrentUserHolder.actorName();
        Instant now = clock.instant();
        Project current = found.get();
        Project closed = current.closeForCancellation(reason, now, actor);
        repository.update(closed);
        audit.record(new AuditEntry(actor, "PROJECT_CLOSED", PROJECT, closed.id().toString(), closed.version(), reason,
                Map.of("stage", new AuditEntry.Change(current.stage().name(), closed.stage().name())), CorrelationId.current()));
        outbox.append("ProjectStageChanged", PROJECT, closed.id().toString(),
                Map.of("projectId", closed.id().toString(), "stage", closed.stage().name(), "active", false), actor);
        for (Equipment e : repository.equipmentOf(closed.id())) {
            Equipment c = e.cancel(now, actor);
            if (c == e) continue;
            repository.update(c, e.version());
            audit.record(new AuditEntry(actor, "EQUIPMENT_CANCELLED", EQUIPMENT, c.id().toString(), c.version(), reason,
                    Map.of("status", new AuditEntry.Change(e.status().name(), c.status().name())), CorrelationId.current()));
            outbox.append("EquipmentUpdated", EQUIPMENT, c.id().toString(),
                    Map.of("equipmentId", c.id().toString(), "changedFields", List.of("status")), actor);
        }
        return List.of(closed.id());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ProjectView> forOrder(UUID orderId) {
        return repository.projectIdForOrder(orderId).flatMap(repository::findProject).map(s -> new ProjectView(s.project().id(),
                s.project().code(), s.project().stage().name(), repository.equipmentOf(s.project().id()).stream()
                .map(e -> new EquipmentView(e.id(), e.code(), e.model(), e.serialNumber(), e.status().name())).toList()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ProjectView> projectById(UUID id) {
        return repository.findProject(id).map(s -> new ProjectView(s.project().id(), s.project().code(), s.project().stage().name(),
                List.of()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EquipmentRef> equipmentById(UUID id) {
        return repository.findEquipment(id).map(ProjectService::ref);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CostBasis> costBasis(UUID projectId) {
        return repository.findProject(projectId).map(s -> {
            Project p = s.project();
            List<EquipmentRef> equipment = repository.listEquipment(null, projectId, true, 1000).stream()
                    .sorted(java.util.Comparator.comparing(es -> es.equipment().code())).map(ProjectService::ref).toList();
            return new CostBasis(p.id(), p.code(), p.name(), p.stage().name(), p.contractCents(), equipment);
        });
    }

    private static EquipmentRef ref(ProjectRepository.EquipmentSummary s) {
        Equipment e = s.equipment();
        return new EquipmentRef(e.id(), e.code(), e.projectId(), s.projectCode(), e.modelId(), s.modelCode(), s.modelName(),
                e.serialNumber(), e.status() == Equipment.Status.ATIVO);
    }

    // ───────────── Modelos de equipamento (Sprint 10) ─────────────

    @Override
    @Transactional(readOnly = true)
    public Optional<ModelRef> model(UUID id) {
        return repository.findModel(id).map(m -> modelRef(m.model()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ModelRef> modelByName(String name) {
        return repository.findModelByName(EquipmentModel.normalize(name)).map(ProjectService::modelRef);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public ModelRef provisionModel(String name) {
        return modelRef(modelFor(name, clock.instant(), CurrentUserHolder.actorName()));
    }

    /** O modelo pelo nome (o texto do pedido ou do arquivo da BOM); cadastra quando ainda não existe. */
    private EquipmentModel modelFor(String name, Instant now, String actor) {
        Optional<EquipmentModel> existing = repository.findModelByName(EquipmentModel.normalize(name));
        if (existing.isPresent()) return existing.get();
        EquipmentModel model = EquipmentModel.register(repository.nextModelCode(), name, now, actor);
        repository.insert(model);
        recordModel(actor, "EQUIPMENT_MODEL_REGISTERED", model, null, Map.of("code", new AuditEntry.Change(null, model.code()),
                "name", new AuditEntry.Change(null, model.name())));
        outbox.append("EquipmentModelRegistered", MODEL, model.id().toString(),
                Map.of("modelId", model.id().toString(), "name", model.name()), actor);
        return model;
    }

    @Transactional(readOnly = true)
    public List<ProjectRepository.ModelSummary> listModels(String search, boolean includeInactive) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        return repository.listModels(blankToNull(search), includeInactive, 500);
    }

    @Transactional(readOnly = true)
    public ProjectRepository.ModelSummary equipmentModel(UUID id) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        return repository.findModel(id).orElseThrow(ProjectService::modelNotFound);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> modelHistory(UUID id) {
        equipmentModel(id);
        return auditQuery.history(MODEL, id.toString());
    }

    /** RegisterEquipmentModel: o nome é único (sem diferenciar maiúsculas); repetir com a mesma chave devolve o mesmo. */
    @Transactional
    public ProjectRepository.ModelSummary registerModel(String idempotencyKey, String name) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterEquipmentModel", name == null ? "" : name);
        if (done.isPresent()) return repository.findModel(UUID.fromString(done.get())).orElseThrow();
        EquipmentModel model = EquipmentModel.register(repository.nextModelCode(), name, clock.instant(), user.username());
        uniqueName(model.name(), null);
        repository.insert(model);
        recordModel(user.username(), "EQUIPMENT_MODEL_REGISTERED", model, null,
                Map.of("code", new AuditEntry.Change(null, model.code()), "name", new AuditEntry.Change(null, model.name())));
        outbox.append("EquipmentModelRegistered", MODEL, model.id().toString(),
                Map.of("modelId", model.id().toString(), "name", model.name()), user.username());
        receipts.complete(user.username(), key, model.id().toString());
        return repository.findModel(model.id()).orElseThrow();
    }

    /** Renomear o modelo com a versão lida (If-Match). Os equipamentos guardam o texto do pedido e seguem o modelo. */
    @Transactional
    public ProjectRepository.ModelSummary renameModel(UUID id, long expectedVersion, String name) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        EquipmentModel current = repository.findModelForUpdate(id).orElseThrow(ProjectService::modelNotFound);
        if (current.version() != expectedVersion) throw new VersionConflictException(MODEL, expectedVersion, current.version());
        EquipmentModel renamed = current.rename(name, clock.instant(), user.username());
        if (renamed.name().equals(current.name())) return repository.findModel(id).orElseThrow();
        uniqueName(renamed.name(), id);
        repository.update(renamed, expectedVersion);
        recordModel(user.username(), "EQUIPMENT_MODEL_UPDATED", renamed, null,
                Map.of("name", new AuditEntry.Change(current.name(), renamed.name())));
        outbox.append("EquipmentModelUpdated", MODEL, id.toString(), Map.of("modelId", id.toString(), "changedFields", List.of("name")),
                user.username());
        return repository.findModel(id).orElseThrow();
    }

    /** Inativar com motivo: o modelo some das listas de escolha; equipamentos e BOMs existentes continuam. */
    @Transactional
    public ProjectRepository.ModelSummary deactivateModel(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        EquipmentModel current = repository.findModelForUpdate(id).orElseThrow(ProjectService::modelNotFound);
        if (current.status() == EquipmentModel.Status.INATIVO) return repository.findModel(id).orElseThrow();
        if (current.version() != expectedVersion) throw new VersionConflictException(MODEL, expectedVersion, current.version());
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("EQUIPMENT_MODEL_INVALID", "Informe o motivo da inativação.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        EquipmentModel inactive = current.deactivate(clock.instant(), user.username());
        repository.update(inactive, expectedVersion);
        recordModel(user.username(), "EQUIPMENT_MODEL_DEACTIVATED", inactive, why,
                Map.of("status", new AuditEntry.Change(current.status().name(), inactive.status().name())));
        outbox.append("EquipmentModelUpdated", MODEL, id.toString(),
                Map.of("modelId", id.toString(), "changedFields", List.of("status")), user.username());
        return repository.findModel(id).orElseThrow();
    }

    private void uniqueName(String name, UUID exceptId) {
        repository.findModelByName(name).filter(m -> !m.id().equals(exceptId)).ifPresent(m -> {
            throw new RuleViolationException("EQUIPMENT_MODEL_DUPLICATE", "Já existe o modelo " + m.code() + " — " + m.name() + ".",
                    List.of(new FieldIssue("name", "Já usado no modelo " + m.code() + ".")));
        });
    }

    private void recordModel(String actor, String action, EquipmentModel m, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(actor, action, MODEL, m.id().toString(), m.version(), reason, new LinkedHashMap<>(changes),
                CorrelationId.current()));
    }

    private static ModelRef modelRef(EquipmentModel m) {
        return new ModelRef(m.id(), m.code(), m.name(), m.status() == EquipmentModel.Status.ATIVO);
    }

    private static NotFoundException modelNotFound() {
        return new NotFoundException("Modelo de equipamento não encontrado.");
    }

    // ───────────── Consultas das janelas ─────────────

    @Transactional(readOnly = true)
    public List<ProjectRepository.ProjectSummary> listProjects(String search, Project.Stage stage, boolean includeClosed) {
        CurrentUserHolder.require(Permissions.PROJECT_READ);
        return repository.listProjects(blankToNull(search), stage, includeClosed, 500);
    }

    @Transactional(readOnly = true)
    public ProjectRepository.ProjectSummary project(UUID id) {
        CurrentUserHolder.require(Permissions.PROJECT_READ);
        return repository.findProject(id).orElseThrow(() -> new NotFoundException("Projeto não encontrado."));
    }

    @Transactional(readOnly = true)
    public List<ProjectRepository.EquipmentSummary> equipmentOfProject(UUID id) {
        project(id);
        return repository.listEquipment(null, id, true, 1000).stream()
                .sorted(java.util.Comparator.comparing(s -> s.equipment().code())).toList();
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> projectHistory(UUID id) {
        project(id);
        return auditQuery.history(PROJECT, id.toString());
    }

    @Transactional(readOnly = true)
    public List<ProjectRepository.EquipmentSummary> listEquipment(String search, UUID projectId, boolean includeCancelled) {
        CurrentUserHolder.require(Permissions.EQUIPMENT_READ);
        return repository.listEquipment(blankToNull(search), projectId, includeCancelled, 500);
    }

    @Transactional(readOnly = true)
    public ProjectRepository.EquipmentSummary equipment(UUID id) {
        CurrentUserHolder.require(Permissions.EQUIPMENT_READ);
        return repository.findEquipment(id).orElseThrow(ProjectService::equipmentNotFound);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> equipmentHistory(UUID id) {
        equipment(id);
        return auditQuery.history(EQUIPMENT, id.toString());
    }

    /** UpdateEquipment com a versão lida (If-Match): número de série único por modelo e observações. */
    @Transactional
    public ProjectRepository.EquipmentSummary updateEquipment(UUID id, long expectedVersion, String serialNumber, String notes) {
        CurrentUser user = CurrentUserHolder.require(Permissions.EQUIPMENT_UPDATE);
        Equipment current = repository.findEquipmentForUpdate(id).orElseThrow(ProjectService::equipmentNotFound);
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(EQUIPMENT, expectedVersion, current.version());
        }
        Equipment updated = current.update(serialNumber, notes, clock.instant(), user.username());
        if (updated.serialNumber() != null) {
            repository.codeWithSerial(updated.model(), updated.serialNumber(), id).ifPresent(other -> {
                throw new RuleViolationException("EQUIPMENT_SERIAL_DUPLICATE",
                        "A série " + updated.serialNumber() + " já está no equipamento " + other + " do mesmo modelo.",
                        List.of(new FieldIssue("serialNumber", "Já usada no equipamento " + other + ".")));
            });
        }
        repository.update(updated, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        audit.record(new AuditEntry(user.username(), "EQUIPMENT_UPDATED", EQUIPMENT, id.toString(), updated.version(), null, changes,
                CorrelationId.current()));
        outbox.append("EquipmentUpdated", EQUIPMENT, id.toString(),
                Map.of("equipmentId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return repository.findEquipment(id).orElseThrow();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static NotFoundException equipmentNotFound() {
        return new NotFoundException("Equipamento não encontrado.");
    }
}
