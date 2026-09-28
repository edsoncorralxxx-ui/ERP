package br.com.fourtech.rendamais.projetos.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import br.com.fourtech.rendamais.projetos.api.ProjectProvisioningApi;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import br.com.fourtech.rendamais.projetos.domain.Equipment;
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
public class ProjectService implements ProjectProvisioningApi, ProjectQueryApi {

    static final String PROJECT = "project";
    static final String EQUIPMENT = "equipment";

    private final ProjectRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final Clock clock;

    public ProjectService(ProjectRepository repository, AuditTrail audit, AuditQuery auditQuery, Outbox outbox, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
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
            for (int seq = 1; seq <= line.quantity(); seq++) {
                Equipment e = Equipment.create(repository.nextEquipmentCode(), project, line.orderLineId(), seq, line.model(),
                        line.itemId(), now, actor);
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
                payload.put("modelId", e.model());
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
    public List<Equipment> equipmentOfProject(UUID id) {
        project(id);
        return repository.equipmentOf(id);
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
