package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.BomService;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

/** BOM do modelo e das submontagens (Sprint 10): lista, cadastro, a BOM com a árvore de submontagens, edição e histórico. */
@RestController
@RequestMapping("/api/v1/boms")
class BomController {

    private final BomService service;

    BomController(BomService service) {
        this.service = service;
    }

    record BomSummaryDto(String id, String code, String name, String modelId, String modelCode, String modelName, String totalCents,
                         int pending, int lineCount, Instant updatedAt, String updatedBy) {
        static BomSummaryDto of(BomService.BomSummary s) {
            Bom b = s.bom();
            return new BomSummaryDto(b.id().toString(), b.code(), b.name(), str(b.modelId()), s.modelCode(), s.modelName(),
                    Long.toString(s.totalCents()), s.pending(), s.lineCount(), s.updatedAt(), s.updatedBy());
        }
    }

    record LineDto(String id, int position, String kind, String itemId, String itemCode, boolean itemActive, String childBomId,
                   String childBomCode, String childBomName, String referenceCode, String description, String quantity, String uom,
                   String unitCost, String lineCents, int pending, String category, String supplier, String material, String notes,
                   String itemReferenceCost) {
        static LineDto of(BomService.LineView v) {
            BomLine l = v.line();
            return new LineDto(l.id().toString(), l.position(), l.kind().name(), str(l.itemId()), v.itemCode(), v.itemActive(),
                    str(v.childBomId()), v.childBomCode(), v.childBomName(), l.referenceCode(), l.description(), plain(l.quantity()), l.uom(),
                    plain(l.unitCost()), v.lineCents() == null ? null : v.lineCents().toString(), v.pending(), l.category(), l.supplier(),
                    l.material(), l.notes(), plain(v.itemReferenceCost()));
        }
    }

    record CategoryDto(String category, String cents, int lines) { }

    record ProblemDto(String severity, Integer position, String message) {
        static ProblemDto of(BomService.Problem p) {
            return new ProblemDto(p.severity(), p.position(), p.message());
        }
    }

    record ParentDto(String bomId, String bomCode, String bomName) { }

    record TreeDto(String bomId, String code, String name, String quantity, String totalCents, int pending, int itemLines,
                   List<TreeDto> children) {
        static TreeDto of(BomService.TreeNode n) {
            return new TreeDto(n.bomId().toString(), n.code(), n.name(), plain(n.quantity()), Long.toString(n.totalCents()), n.pending(),
                    n.itemLines(), n.children().stream().map(TreeDto::of).toList());
        }
    }

    record BomDto(String id, String code, String name, String modelId, String modelCode, String modelName, String informedTotalCents,
                  String notes, String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy, String totalCents,
                  int pending, List<LineDto> lines, List<CategoryDto> categories, List<ProblemDto> problems, List<ParentDto> usedBy,
                  TreeDto tree) {
        static BomDto of(BomService.BomView v) {
            Bom b = v.bom();
            var c = v.content();
            return new BomDto(b.id().toString(), b.code(), b.name(), str(b.modelId()), v.modelCode(), v.modelName(),
                    c.informedTotalCents() == null ? null : c.informedTotalCents().toString(), c.notes(), Long.toString(c.version()),
                    b.createdAt(), b.createdBy(), c.updatedAt(), c.updatedBy(), Long.toString(v.totalCents()), v.pending(),
                    v.lines().stream().map(LineDto::of).toList(),
                    v.categories().stream().map(x -> new CategoryDto(x.category(), Long.toString(x.cents()), x.lines())).toList(),
                    v.problems().stream().map(ProblemDto::of).toList(),
                    v.usedBy().stream().map(p -> new ParentDto(p.bomId().toString(), p.bomCode(), p.bomName())).toList(),
                    TreeDto.of(v.tree()));
        }
    }

    @GetMapping
    List<BomSummaryDto> list(@RequestParam(value = "search", required = false) String search) {
        return service.list(search).stream().map(BomSummaryDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<BomDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<BomDto> create(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                  @RequestBody BomService.CreateRequest body) {
        return respond(HttpStatus.CREATED, service.create(key, body));
    }

    @PutMapping("/{id}")
    ResponseEntity<BomDto> save(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                @RequestBody BomService.BomData body) {
        return respond(HttpStatus.OK, service.save(id, Versions.required(ifMatch), body));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<BomDto> respond(HttpStatus status, BomService.BomView v) {
        return ResponseEntity.status(status).eTag("\"" + v.content().version() + "\"").body(BomDto.of(v));
    }

    static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }

    static String str(UUID id) {
        return id == null ? null : id.toString();
    }
}
