package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.EquipmentBomService;
import br.com.fourtech.rendamais.engenharia.domain.EquipmentBom;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** BOM do equipamento (aplicar, trocar a revisão, ajustar) e custo planejado do projeto. */
@RestController
@RequestMapping("/api/v1")
class EquipmentBomController {

    private final EquipmentBomService service;

    EquipmentBomController(EquipmentBomService service) {
        this.service = service;
    }

    record EquipmentRefDto(String id, String code, String projectId, String projectCode, String modelId, String modelCode, String modelName,
                           String serialNumber, boolean active) {
        static EquipmentRefDto of(ProjectQueryApi.EquipmentRef e) {
            return new EquipmentRefDto(e.id().toString(), e.code(), e.projectId().toString(), e.projectCode(), e.modelId().toString(),
                    e.modelCode(), e.modelName(), e.serialNumber(), e.active());
        }
    }

    record LineDto(String id, String parentId, int depth, int position, String kind, String itemId, String itemCode, String childRevisionId,
                   String referenceCode, String description, String quantity, String uom, String unitCost, String lineCents,
                   String category, String supplier, String material, String notes, String origin, String modelQuantity,
                   String modelUnitCost, String status, String state, String adjustmentReason) {
        static LineDto of(EquipmentBomService.LineView v) {
            EquipmentBom.Line l = v.line();
            return new LineDto(l.id().toString(), BomController.str(l.parentId()), v.depth(), l.position(), l.kind().name(),
                    BomController.str(l.itemId()), v.itemCode(), BomController.str(l.childRevisionId()), l.referenceCode(), l.description(),
                    BomController.plain(l.quantity()), l.uom(), BomController.plain(l.unitCost()),
                    v.lineCents() == null ? null : v.lineCents().toString(), l.category(), l.supplier(), l.material(), l.notes(),
                    l.origin().name(), BomController.plain(l.modelQuantity()), BomController.plain(l.modelUnitCost()), l.status().name(),
                    v.state(), l.adjustmentReason());
        }
    }

    record EquipmentBomDto(EquipmentRefDto equipment, boolean applied, String id, String bomId, String bomCode, String bomName,
                           String version, Instant appliedAt, String appliedBy, Instant updatedAt, String updatedBy, String totalCents,
                           int pending, String modelTotalCents, boolean modelChanged, int added, int removed, int changed,
                           List<LineDto> lines) {
        static EquipmentBomDto of(EquipmentBomService.EquipmentBomView v) {
            EquipmentRefDto eq = EquipmentRefDto.of(v.equipment());
            if (v.bom() == null) {
                return new EquipmentBomDto(eq, false, null, null, null, null, null, null, null, null, null, null, 0, null, false, 0, 0, 0,
                        List.of());
            }
            return new EquipmentBomDto(eq, true, v.bom().id().toString(), v.modelBom().id().toString(), v.modelBom().code(),
                    v.modelBom().name(), Long.toString(v.bom().version()), v.bom().appliedAt(), v.bom().appliedBy(), v.bom().updatedAt(),
                    v.bom().updatedBy(), Long.toString(v.totalCents()), v.pending(), Long.toString(v.modelTotalCents()), v.modelChanged(),
                    v.added(), v.removed(), v.changed(),
                    v.lines().stream().map(LineDto::of).toList());
        }
    }

    record EquipmentCostDto(EquipmentRefDto equipment, boolean applied, String bomId, String bomName, String costCents, int pending,
                            boolean adjusted) { }

    record PlannedCostDto(String projectId, String projectCode, String projectName, String stage, String contractCents,
                          String plannedCostCents, boolean complete, int withoutBom, String marginCents, String marginRate,
                          List<EquipmentCostDto> equipment) { }

    @GetMapping("/equipment/{id}/bom")
    ResponseEntity<EquipmentBomDto> get(@PathVariable UUID id) {
        return respond(service.view(id));
    }

    @PostMapping("/equipment/{id}/bom")
    ResponseEntity<EquipmentBomDto> apply(@RequestHeader(value = "Idempotency-Key", required = false) String key, @PathVariable UUID id,
                                          @RequestBody EquipmentBomService.ApplyRequest body) {
        return respond(service.apply(key, id, body));
    }

    @PostMapping("/equipment/{id}/bom/adjustments")
    ResponseEntity<EquipmentBomDto> adjust(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                           @RequestBody EquipmentBomService.AdjustRequest body) {
        return respond(service.adjust(id, Versions.required(ifMatch), body));
    }

    @GetMapping("/equipment/{id}/bom/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    @GetMapping("/projects/{id}/planned-cost")
    PlannedCostDto plannedCost(@PathVariable UUID id) {
        EquipmentBomService.PlannedCost c = service.plannedCost(id);
        return new PlannedCostDto(c.project().projectId().toString(), c.project().code(), c.project().name(), c.project().stage(),
                Long.toString(c.contractCents()), Long.toString(c.plannedCostCents()), c.complete(), c.withoutBom(),
                c.marginCents() == null ? null : c.marginCents().toString(),
                c.marginRate() == null ? null : c.marginRate().stripTrailingZeros().toPlainString(),
                c.equipment().stream().map(e -> new EquipmentCostDto(EquipmentRefDto.of(e.equipment()), e.applied(),
                        BomController.str(e.bomId()), e.bomName(), e.costCents() == null ? null : e.costCents().toString(), e.pending(), e.adjusted())).toList());
    }

    private static ResponseEntity<EquipmentBomDto> respond(EquipmentBomService.EquipmentBomView v) {
        ResponseEntity.BodyBuilder b = ResponseEntity.ok();
        if (v.bom() != null) b = b.eTag("\"" + v.bom().version() + "\"");
        return b.body(EquipmentBomDto.of(v));
    }
}
