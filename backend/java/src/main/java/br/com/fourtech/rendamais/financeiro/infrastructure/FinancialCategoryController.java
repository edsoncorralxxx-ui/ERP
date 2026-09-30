package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialCategoryService;
import br.com.fourtech.rendamais.financeiro.domain.FinancialCategory;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Categorias financeiras de receita e despesa (PD-010). Alterar exige {@code financial_category.admin}. */
@RestController
@RequestMapping("/api/v1/financial-categories")
class FinancialCategoryController {

    private final FinancialCategoryService service;

    FinancialCategoryController(FinancialCategoryService service) {
        this.service = service;
    }

    record CategoryDto(String id, String code, String name, String direction, String status, boolean system, String version,
                       Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static CategoryDto of(FinancialCategory c) {
            return new CategoryDto(c.id().toString(), c.code(), c.name(), c.direction().name(), c.status().name(), c.system(),
                    Long.toString(c.version()), c.createdAt(), c.createdBy(), c.updatedAt(), c.updatedBy());
        }
    }

    /** {@code direction}: RECEITA ou DESPESA (padrão: as duas). */
    @GetMapping
    List<CategoryDto> list(@RequestParam(value = "direction", required = false) String direction,
                           @RequestParam(value = "includeInactive", defaultValue = "false") boolean includeInactive) {
        return service.list(direction, includeInactive).stream().map(CategoryDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<CategoryDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<CategoryDto> create(@RequestBody FinancialCategoryService.Request body) {
        return respond(HttpStatus.CREATED, service.create(body));
    }

    @PutMapping("/{id}")
    ResponseEntity<CategoryDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                       @RequestBody FinancialCategoryService.Request body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<CategoryDto> respond(HttpStatus status, FinancialCategory c) {
        return ResponseEntity.status(status).eTag("\"" + c.version() + "\"").body(CategoryDto.of(c));
    }
}
