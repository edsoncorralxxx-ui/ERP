package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.CatalogRepository;
import br.com.fourtech.rendamais.cadastros.application.CatalogService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/** API de unidades de medida e categorias de item (S3-03). Todos leem; só o Administrador altera (catalog.admin). */
@RestController
class CatalogController {

    private final CatalogService service;

    CatalogController(CatalogService service) {
        this.service = service;
    }

    record UnitRequest(String code, String name, String status) { }

    record UnitResponse(String code, String name, String status, String version, long items, Instant updatedAt, String updatedBy) {
        static UnitResponse of(CatalogRepository.UnitOfMeasureEntry u) {
            return new UnitResponse(u.code(), u.name(), u.status().name(), Long.toString(u.version()), u.items(), u.updatedAt(),
                    u.updatedBy());
        }
    }

    record CategoryRequest(String name, String status) { }

    record CategoryResponse(String id, String name, String status, String version, long items, long suppliers,
                            Instant updatedAt, String updatedBy) {
        static CategoryResponse of(CatalogRepository.CategoryEntry c) {
            return new CategoryResponse(c.id().toString(), c.name(), c.status().name(), Long.toString(c.version()), c.items(),
                    c.suppliers(), c.updatedAt(), c.updatedBy());
        }
    }

    @GetMapping("/api/v1/units-of-measure")
    List<UnitResponse> units() {
        return service.units().stream().map(UnitResponse::of).toList();
    }

    @PostMapping("/api/v1/units-of-measure")
    ResponseEntity<UnitResponse> createUnit(@RequestBody UnitRequest body) {
        return unit(HttpStatus.CREATED, service.createUnit(body.code(), body.name()));
    }

    @PutMapping("/api/v1/units-of-measure/{code}")
    ResponseEntity<UnitResponse> updateUnit(@PathVariable String code,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody UnitRequest body) {
        return unit(HttpStatus.OK, service.updateUnit(code, version(ifMatch), body.name(), body.status()));
    }

    @GetMapping("/api/v1/item-categories")
    List<CategoryResponse> categories() {
        return service.categories().stream().map(CategoryResponse::of).toList();
    }

    @PostMapping("/api/v1/item-categories")
    ResponseEntity<CategoryResponse> createCategory(@RequestBody CategoryRequest body) {
        return category(HttpStatus.CREATED, service.createCategory(body.name()));
    }

    @PutMapping("/api/v1/item-categories/{id}")
    ResponseEntity<CategoryResponse> updateCategory(@PathVariable UUID id,
                                                    @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                    @RequestBody CategoryRequest body) {
        return category(HttpStatus.OK, service.updateCategory(id, version(ifMatch), body.name(), body.status()));
    }

    private static ResponseEntity<UnitResponse> unit(HttpStatus status, CatalogRepository.UnitOfMeasureEntry u) {
        return ResponseEntity.status(status).eTag("\"" + u.version() + "\"").body(UnitResponse.of(u));
    }

    private static ResponseEntity<CategoryResponse> category(HttpStatus status, CatalogRepository.CategoryEntry c) {
        return ResponseEntity.status(status).eTag("\"" + c.version() + "\"").body(CategoryResponse.of(c));
    }
}
