package br.com.fourtech.rendamais.projetos.infrastructure;

import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import br.com.fourtech.rendamais.projetos.application.ProjectRepository;
import br.com.fourtech.rendamais.projetos.application.ProjectService;
import br.com.fourtech.rendamais.projetos.domain.EquipmentModel;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Modelos de equipamento (Sprint 10): lista com a quantidade de equipamentos, cadastro, renomear e inativar. */
@RestController
@RequestMapping("/api/v1/equipment-models")
class EquipmentModelController {

    private final ProjectService service;

    EquipmentModelController(ProjectService service) {
        this.service = service;
    }

    record ModelDto(String id, String code, String name, String status, int equipmentCount, String version, Instant createdAt,
                    String createdBy, Instant updatedAt, String updatedBy) {
        static ModelDto of(ProjectRepository.ModelSummary s) {
            EquipmentModel m = s.model();
            return new ModelDto(m.id().toString(), m.code(), m.name(), m.status().name(), s.equipmentCount(),
                    Long.toString(m.version()), m.createdAt(), m.createdBy(), m.updatedAt(), m.updatedBy());
        }
    }

    record ModelRequest(String name) { }

    record DeactivationRequest(String reason) { }

    @GetMapping
    List<ModelDto> list(@RequestParam(value = "search", required = false) String search,
                        @RequestParam(value = "includeInactive", defaultValue = "false") boolean includeInactive) {
        return service.listModels(search, includeInactive).stream().map(ModelDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<ModelDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.equipmentModel(id));
    }

    @PostMapping
    ResponseEntity<ModelDto> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                      @RequestBody ModelRequest body) {
        return respond(HttpStatus.CREATED, service.registerModel(key, body == null ? null : body.name()));
    }

    @PutMapping("/{id}")
    ResponseEntity<ModelDto> rename(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                    @RequestBody ModelRequest body) {
        return respond(HttpStatus.OK, service.renameModel(id, Versions.required(ifMatch), body == null ? null : body.name()));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<ModelDto> deactivate(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody(required = false) DeactivationRequest body) {
        return respond(HttpStatus.OK, service.deactivateModel(id, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.modelHistory(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<ModelDto> respond(HttpStatus status, ProjectRepository.ModelSummary s) {
        return ResponseEntity.status(status).eTag("\"" + s.model().version() + "\"").body(ModelDto.of(s));
    }
}
