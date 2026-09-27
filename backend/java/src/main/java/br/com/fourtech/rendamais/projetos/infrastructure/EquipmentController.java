package br.com.fourtech.rendamais.projetos.infrastructure;

import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import br.com.fourtech.rendamais.projetos.application.ProjectRepository;
import br.com.fourtech.rendamais.projetos.application.ProjectService;
import br.com.fourtech.rendamais.projetos.domain.Equipment;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

/** Equipamentos (formulário "equipamentos"): lista, ficha e alteração de série e observações com If-Match. */
@RestController
@RequestMapping("/api/v1/equipment")
class EquipmentController {

    private final ProjectService service;

    EquipmentController(ProjectService service) {
        this.service = service;
    }

    record EquipmentDto(String id, String code, String model, String itemId, String projectId, String projectCode,
                        String orderCode, String customerId, String customerCode, String customerName, String unitId,
                        String unitName, String serialNumber, String notes, String status, LocalDate acceptedOn,
                        LocalDate warrantyStart, String version, Instant createdAt, String createdBy, Instant updatedAt,
                        String updatedBy) {
        static EquipmentDto of(ProjectRepository.EquipmentSummary s) {
            Equipment e = s.equipment();
            return new EquipmentDto(e.id().toString(), e.code(), e.model(), e.itemId() == null ? null : e.itemId().toString(),
                    e.projectId().toString(), s.projectCode(), s.orderCode(), e.customerId().toString(), s.customerCode(),
                    s.customerName(), e.unitId().toString(), e.unitName(), e.serialNumber(), e.notes(), e.status().name(),
                    e.acceptedOn(), e.warrantyStart(), Long.toString(e.version()), e.createdAt(), e.createdBy(), e.updatedAt(),
                    e.updatedBy());
        }
    }

    record EquipmentRequest(String serialNumber, String notes) { }

    @GetMapping
    List<EquipmentDto> list(@RequestParam(value = "search", required = false) String search,
                            @RequestParam(value = "projectId", required = false) UUID projectId,
                            @RequestParam(value = "includeCancelled", defaultValue = "false") boolean includeCancelled) {
        return service.listEquipment(search, projectId, includeCancelled).stream().map(EquipmentDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<EquipmentDto> get(@PathVariable UUID id) {
        return respond(service.equipment(id));
    }

    @PutMapping("/{id}")
    ResponseEntity<EquipmentDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody EquipmentRequest body) {
        return respond(service.updateEquipment(id, Versions.required(ifMatch), body.serialNumber(), body.notes()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.equipmentHistory(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<EquipmentDto> respond(ProjectRepository.EquipmentSummary s) {
        return ResponseEntity.ok().eTag("\"" + s.equipment().version() + "\"").body(EquipmentDto.of(s));
    }
}
