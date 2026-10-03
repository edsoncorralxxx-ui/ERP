package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.LeadImportService;
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

/** Carga da lista de prospecção (S11): envio com a prévia; confirmação com Idempotency-Key. */
@RestController
@RequestMapping("/api/v1/lead-imports")
class LeadImportController {

    private final LeadImportService service;

    LeadImportController(LeadImportService service) {
        this.service = service;
    }

    record ImportDto(String id, String fileName, String status, String source, int lineCount, int toLoad, int blocked,
                     int warnings, List<LeadImportService.Line> lines, List<LeadImportService.Problem> problems,
                     List<String> createdCodes, Instant createdAt, String createdBy, Instant confirmedAt, String confirmedBy) {
        static ImportDto of(LeadImportService.Preview p) {
            var i = p.leadImport();
            return new ImportDto(i.id().toString(), i.fileName(), i.status(), p.source(), p.lineCount(), p.toLoad(), p.blocked(),
                    p.warnings(), p.lines(), p.problems(), p.createdCodes(), i.createdAt(), i.createdBy(), i.confirmedAt(),
                    i.confirmedBy());
        }
    }

    @PostMapping
    ResponseEntity<ImportDto> upload(@RequestBody LeadImportService.ImportRequest body) {
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
