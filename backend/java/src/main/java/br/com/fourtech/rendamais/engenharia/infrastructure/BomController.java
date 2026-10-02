package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.BomService;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** BOM do modelo e das submontagens (Sprint 10): lista, cadastro, revisões, rascunho, aprovação e comparação. */
@RestController
@RequestMapping("/api/v1")
class BomController {

    private final BomService service;

    BomController(BomService service) {
        this.service = service;
    }

    record RevisionRefDto(String id, String label, String status, String totalCents, int pending, Instant approvedAt, String approvedBy) {
        static RevisionRefDto of(BomService.RevisionRef r) {
            return r == null ? null : new RevisionRefDto(r.id().toString(), r.label(), r.status(), Long.toString(r.totalCents()),
                    r.pending(), r.approvedAt(), r.approvedBy());
        }
    }

    record BomDto(String id, String code, String name, String modelId, String modelCode, String modelName, RevisionRefDto approved,
                  RevisionRefDto draft, int revisionCount, Instant createdAt, String createdBy) {
        static BomDto of(BomService.BomSummary s) {
            Bom b = s.bom();
            return new BomDto(b.id().toString(), b.code(), b.name(), b.modelId() == null ? null : b.modelId().toString(), s.modelCode(),
                    s.modelName(), RevisionRefDto.of(s.approved()), RevisionRefDto.of(s.draft()), s.revisionCount(), b.createdAt(),
                    b.createdBy());
        }
    }

    record LineDto(String id, int position, String kind, String itemId, String itemCode, boolean itemActive, String childRevisionId,
                   String childBomId, String childBomCode, String childBomName, String childRevisionLabel, String childRevisionStatus,
                   String referenceCode, String description, String quantity, String uom, String unitCost, String lineCents, int pending,
                   String category, String supplier, String material, String notes, String itemReferenceCost, String childLatestId,
                   String childLatestLabel) {
        static LineDto of(BomService.LineView v) {
            BomLine l = v.line();
            return new LineDto(l.id().toString(), l.position(), l.kind().name(), str(l.itemId()), v.itemCode(), v.itemActive(),
                    str(l.childRevisionId()), str(v.childBomId()), v.childBomCode(), v.childBomName(), v.childRevisionLabel(),
                    v.childRevisionStatus(), l.referenceCode(), l.description(), plain(l.quantity()), l.uom(), plain(l.unitCost()),
                    v.lineCents() == null ? null : v.lineCents().toString(), v.pending(), l.category(), l.supplier(), l.material(),
                    l.notes(), plain(v.itemReferenceCost()), str(v.childLatestId()), v.childLatestLabel());
        }
    }

    record CategoryDto(String category, String cents, int lines) { }

    record ProblemDto(String severity, Integer position, String message) {
        static ProblemDto of(BomService.Problem p) {
            return new ProblemDto(p.severity(), p.position(), p.message());
        }
    }

    record ParentDto(String bomId, String bomName, String revisionId, String revisionLabel, String status) { }

    record OutdatedDto(String bomId, String bomName, String revisionId, String revisionLabel, String usesLabel, boolean hasDraft) { }

    record PropagationDto(String bomId, String bomName, String fromLabel, String toLabel, String revisionId, String action) { }

    record RevisionDto(String id, String bomId, String bomCode, String bomName, String modelId, String modelCode, String modelName,
                       int revision, String label, String status, String basedOnId, String informedTotalCents, String notes,
                       String importId, Instant approvedAt, String approvedBy, String version, Instant createdAt, String createdBy,
                       Instant updatedAt, String updatedBy, String totalCents, int pending, List<LineDto> lines,
                       List<CategoryDto> categories, List<ProblemDto> problems, List<ParentDto> usedBy,
                       List<RevisionRefDto> revisions, List<OutdatedDto> outdatedParents) {
        static RevisionDto of(BomService.RevisionView v) {
            BomRevision r = v.revision();
            Bom b = v.bom();
            return new RevisionDto(r.id().toString(), b.id().toString(), b.code(), b.name(), str(b.modelId()), v.modelCode(), v.modelName(),
                    r.revision(), r.label(), r.status().name(), str(r.basedOnId()),
                    r.informedTotalCents() == null ? null : r.informedTotalCents().toString(), r.notes(), str(r.importId()),
                    r.approvedAt(), r.approvedBy(), Long.toString(r.version()), r.createdAt(), r.createdBy(), r.updatedAt(), r.updatedBy(),
                    Long.toString(v.totalCents()), v.pending(), v.lines().stream().map(LineDto::of).toList(),
                    v.categories().stream().map(c -> new CategoryDto(c.category(), Long.toString(c.cents()), c.lines())).toList(),
                    v.problems().stream().map(ProblemDto::of).toList(),
                    v.usedBy().stream().map(p -> new ParentDto(p.bomId().toString(), p.bomName(), p.revisionId().toString(),
                            p.revisionLabel(), p.status())).toList(),
                    v.revisions().stream().map(RevisionRefDto::of).toList(),
                    v.outdatedParents().stream().map(o -> new OutdatedDto(o.bomId().toString(), o.bomName(), o.revisionId().toString(),
                            o.revisionLabel(), o.usesLabel(), o.hasDraft())).toList());
        }
    }

    record ComparisonRowDto(String status, String kind, String referenceCode, String description, String revisionBefore,
                            String revisionAfter, String quantityBefore, String quantityAfter, String unitCostBefore,
                            String unitCostAfter, String centsBefore, String centsAfter, String childRevisionBefore,
                            String childRevisionAfter) { }

    record ComparisonDto(String bomId, String bomName, RevisionRefDto from, RevisionRefDto to, String totalBefore, String totalAfter,
                         String difference, List<ComparisonRowDto> rows) { }

    @GetMapping("/boms")
    List<BomDto> list(@RequestParam(value = "search", required = false) String search) {
        return service.list(search).stream().map(BomDto::of).toList();
    }

    @GetMapping("/boms/{id}")
    BomDto get(@PathVariable UUID id) {
        return BomDto.of(service.get(id));
    }

    @PostMapping("/boms")
    ResponseEntity<BomDto> create(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                  @RequestBody BomService.CreateRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(BomDto.of(service.create(key, body)));
    }

    @PostMapping("/boms/{id}/revisions")
    ResponseEntity<RevisionDto> newRevision(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                            @PathVariable UUID id) {
        return respond(HttpStatus.CREATED, service.newRevision(key, id));
    }

    @GetMapping("/boms/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    @GetMapping("/bom-revisions/{id}")
    ResponseEntity<RevisionDto> revision(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.revision(id));
    }

    @PutMapping("/bom-revisions/{id}")
    ResponseEntity<RevisionDto> saveDraft(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                          @RequestBody BomService.DraftData body) {
        return respond(HttpStatus.OK, service.saveDraft(id, Versions.required(ifMatch), body));
    }

    @PostMapping("/bom-revisions/{id}/approval")
    ResponseEntity<RevisionDto> approve(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.approve(id));
    }

    @DeleteMapping("/bom-revisions/{id}")
    BomDto discard(@PathVariable UUID id) {
        return BomDto.of(service.discardDraft(id));
    }

    @PostMapping("/bom-revisions/{id}/propagation")
    List<PropagationDto> propagate(@PathVariable UUID id) {
        return service.propagate(id).stream().map(p -> new PropagationDto(p.bomId().toString(), p.bomName(), p.fromLabel(), p.toLabel(),
                p.revisionId().toString(), p.action())).toList();
    }

    @GetMapping("/bom-revisions/{id}/comparison")
    ComparisonDto compare(@PathVariable UUID id, @RequestParam("with") UUID with) {
        BomService.Comparison c = service.compare(with, id);
        return new ComparisonDto(c.bom().id().toString(), c.bom().name(), RevisionRefDto.of(c.from()), RevisionRefDto.of(c.to()),
                Long.toString(c.totalBefore()), Long.toString(c.totalAfter()), Long.toString(c.totalAfter() - c.totalBefore()),
                c.rows().stream().map(r -> new ComparisonRowDto(r.status(), r.kind(), r.referenceCode(), r.description(), r.before(),
                        r.after(), plain(r.quantityBefore()), plain(r.quantityAfter()), plain(r.unitCostBefore()), plain(r.unitCostAfter()),
                        r.centsBefore() == null ? null : r.centsBefore().toString(), r.centsAfter() == null ? null : r.centsAfter().toString(),
                        str(r.childRevisionBefore()), str(r.childRevisionAfter()))).toList());
    }

    private static ResponseEntity<RevisionDto> respond(HttpStatus status, BomService.RevisionView v) {
        return ResponseEntity.status(status).eTag("\"" + v.revision().version() + "\"").body(RevisionDto.of(v));
    }

    static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }

    static String str(UUID id) {
        return id == null ? null : id.toString();
    }
}
