package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.ItemRepository;
import br.com.fourtech.rendamais.cadastros.application.ItemService;
import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.ItemData;
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
import java.util.Locale;
import java.util.UUID;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/**
 * API de materiais e serviços (S3-04). POST exige Idempotency-Key; PUT e inativação exigem If-Match. Custo de
 * referência e fator de conversão trafegam como texto decimal com ponto ("184.500000"), sem ponto flutuante (ADR-006).
 */
@RestController
@RequestMapping("/api/v1/items")
class ItemController {

    private final ItemService service;

    ItemController(ItemService service) {
        this.service = service;
    }

    record ConversionDto(String id, String fromUom, String factor) { }

    record ItemRequest(String description, String nature, String uom, String categoryId, Boolean stockControlled,
                       String referenceCost, List<ConversionDto> conversions) {
        ItemData toData() {
            return new ItemData(description, nature, uom, categoryId, stockControlled, referenceCost,
                    conversions == null ? List.of() : conversions.stream()
                            .map(c -> new ItemData.ConversionData(c.id(), c.fromUom(), c.factor())).toList());
        }
    }

    record CategoryDto(String id, String name) { }

    record ItemResponse(String id, String code, String description, String nature, String uom, CategoryDto category,
                        boolean stockControlled, String referenceCost, String status, List<ConversionDto> conversions,
                        String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static ItemResponse of(Item i) {
            return new ItemResponse(i.id().toString(), i.code(), i.description(), i.nature().name(), i.uom(),
                    new CategoryDto(i.category().id().toString(), i.category().name()), i.stockControlled(),
                    plain(i.referenceCost()), i.status().name(),
                    i.conversions().stream().map(c -> new ConversionDto(c.id().toString(), c.fromUom(), plain(c.factor()))).toList(),
                    Long.toString(i.version()), i.createdAt(), i.createdBy(), i.updatedAt(), i.updatedBy());
        }
    }

    record ItemSummary(String id, String code, String description, String nature, String uom, String category,
                       boolean stockControlled, String referenceCost, String status, String version) {
        static ItemSummary of(ItemRepository.Summary s) {
            return new ItemSummary(s.id().toString(), s.code(), s.description(), s.nature().name(), s.uom(), s.category(),
                    s.stockControlled(), plain(s.referenceCost()), s.status().name(), Long.toString(s.version()));
        }
    }

    @GetMapping
    List<ItemSummary> list(@RequestParam(value = "search", required = false) String search,
                           @RequestParam(value = "nature", required = false) String nature,
                           @RequestParam(value = "categoryId", required = false) UUID categoryId,
                           @RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        Item.Nature n = nature == null || nature.isBlank() ? null : Item.Nature.valueOf(nature.toUpperCase(Locale.ROOT));
        return service.list(search, n, categoryId, ApiSupport.status(status)).stream().map(ItemSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<ItemResponse> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<ItemResponse> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                          @RequestBody ItemRequest body) {
        return respond(HttpStatus.CREATED, service.register(key, body.toData()));
    }

    @PutMapping("/{id}")
    ResponseEntity<ItemResponse> update(@PathVariable UUID id,
                                        @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody ItemRequest body) {
        return respond(HttpStatus.OK, service.update(id, version(ifMatch), body.toData()));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<ItemResponse> deactivate(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody(required = false) ApiSupport.DeactivateRequest body) {
        return respond(HttpStatus.OK, service.deactivate(id, version(ifMatch), body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<ApiSupport.HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(ApiSupport.HistoryEntry::of).toList();
    }

    private static String plain(BigDecimal v) {
        return v == null ? null : v.toPlainString();
    }

    private static ResponseEntity<ItemResponse> respond(HttpStatus status, Item i) {
        return ResponseEntity.status(status).eTag("\"" + i.version() + "\"").body(ItemResponse.of(i));
    }
}
