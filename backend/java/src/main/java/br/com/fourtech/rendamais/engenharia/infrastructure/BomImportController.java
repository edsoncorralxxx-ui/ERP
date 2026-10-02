package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.BomImportService;
import org.springframework.http.HttpStatus;
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

/** Carga da BOM do arquivo JSON: enviar (prévia), consultar e confirmar (ImportBom, com Idempotency-Key). */
@RestController
@RequestMapping("/api/v1/bom-imports")
class BomImportController {

    private final BomImportService service;

    BomImportController(BomImportService service) {
        this.service = service;
    }

    record LineDto(String group, String category, int sourceNo, String referenceCode, boolean generatedCode, String description,
                   String quantity, String uom, String unitCost, String lineCents, String itemCode, boolean newItem, String supplier,
                   String material) { }

    record GroupDto(String name, String parent, int lines, String totalCents, int pending, String informedCents) { }

    record ImportDto(String id, String fileName, String status, String product, String revisionLabel, String revisionDate, int lineCount,
                     String totalCents, int pending, String informedTotalCents, List<GroupDto> groups,
                     List<BomController.ProblemDto> problems, int newItems, int existingItems, List<String> newUnits,
                     List<String> newCategories, List<String> fileNotes, List<LineDto> lines, String bomId,
                     Instant createdAt, String createdBy, Instant confirmedAt, String confirmedBy) {
        static ImportDto of(BomImportService.Preview p) {
            var i = p.bomImport();
            return new ImportDto(i.id().toString(), i.fileName(), i.status(), p.product(), p.revisionLabel(), p.revisionDate(), p.lineCount(),
                    Long.toString(p.totalCents()), p.pending(), p.informedTotalCents() == null ? null : p.informedTotalCents().toString(),
                    p.groups().stream().map(g -> new GroupDto(g.name(), g.parent(), g.lines(), Long.toString(g.totalCents()), g.pending(),
                            g.informedCents() == null ? null : g.informedCents().toString())).toList(),
                    p.problems().stream().map(BomController.ProblemDto::of).toList(), p.newItems(), p.existingItems(), p.newUnits(),
                    p.newCategories(), p.fileNotes(),
                    p.lines().stream().map(l -> new LineDto(l.group(), l.category(), l.sourceNo(), l.referenceCode(), l.generatedCode(),
                            l.description(), BomController.plain(l.quantity()), l.uom(), BomController.plain(l.unitCost()),
                            l.lineCents() == null ? null : l.lineCents().toString(), l.itemCode(), l.newItem(), l.supplier(),
                            l.material())).toList(),
                    BomController.str(p.bomId()), i.createdAt(), i.createdBy(), i.confirmedAt(),
                    i.confirmedBy());
        }
    }

    @PostMapping
    ResponseEntity<ImportDto> upload(@RequestBody BomImportService.ImportRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ImportDto.of(service.upload(body)));
    }

    @GetMapping("/{id}")
    ImportDto get(@PathVariable UUID id) {
        return ImportDto.of(service.get(id));
    }

    @PostMapping("/{id}/confirmation")
    ImportDto confirm(@RequestHeader(value = "Idempotency-Key", required = false) String key, @PathVariable UUID id) {
        return ImportDto.of(service.confirm(key, id));
    }
}
