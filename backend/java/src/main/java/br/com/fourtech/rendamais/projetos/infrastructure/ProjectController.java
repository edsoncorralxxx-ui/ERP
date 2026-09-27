package br.com.fourtech.rendamais.projetos.infrastructure;

import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.projetos.application.ProjectRepository;
import br.com.fourtech.rendamais.projetos.application.ProjectService;
import br.com.fourtech.rendamais.projetos.domain.Project;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Carteira de projetos e Detalhe do projeto (Sprint 4). O projeto nasce da confirmação do pedido. */
@RestController
@RequestMapping("/api/v1/projects")
class ProjectController {

    private final ProjectService service;

    ProjectController(ProjectService service) {
        this.service = service;
    }

    record ProjectDto(String id, String code, String name, String orderId, String orderCode, String customerId,
                      String customerCode, String customerName, String unitId, String unitName, String stage,
                      LocalDate contractDelivery, String contractCents, int equipmentCount, String closedReason, String version,
                      Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static ProjectDto of(ProjectRepository.ProjectSummary s) {
            Project p = s.project();
            return new ProjectDto(p.id().toString(), p.code(), p.name(), p.orderId().toString(), p.orderCode(),
                    p.customerId().toString(), s.customerCode(), s.customerName(), p.unitId().toString(), p.unitName(),
                    p.stage().name(), p.contractDelivery(), Long.toString(p.contractCents()), s.equipmentCount(), p.closedReason(),
                    Long.toString(p.version()), p.createdAt(), p.createdBy(), p.updatedAt(), p.updatedBy());
        }
    }

    @GetMapping
    List<ProjectDto> list(@RequestParam(value = "search", required = false) String search,
                          @RequestParam(value = "stage", required = false) String stage,
                          @RequestParam(value = "includeClosed", defaultValue = "false") boolean includeClosed) {
        Project.Stage s = stage == null || stage.isBlank() ? null : Project.Stage.valueOf(stage.toUpperCase(Locale.ROOT));
        return service.listProjects(search, s, includeClosed).stream().map(ProjectDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<ProjectDto> get(@PathVariable UUID id) {
        ProjectRepository.ProjectSummary s = service.project(id);
        return ResponseEntity.ok().eTag("\"" + s.project().version() + "\"").body(ProjectDto.of(s));
    }

    @GetMapping("/{id}/equipment")
    List<EquipmentController.EquipmentDto> equipment(@PathVariable UUID id) {
        ProjectRepository.ProjectSummary s = service.project(id);
        return service.equipmentOfProject(id).stream()
                .map(e -> EquipmentController.EquipmentDto.of(new ProjectRepository.EquipmentSummary(e, s.project().code(),
                        s.project().orderCode(), s.customerCode(), s.customerName())))
                .toList();
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.projectHistory(id).stream().map(HistoryEntry::of).toList();
    }
}
