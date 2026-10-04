package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.PriceListService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Tabelas de preço e os preços de cada item (Sprint 13). */
@RestController
class PriceListController {

    private final PriceListService service;

    PriceListController(PriceListService service) {
        this.service = service;
    }

    record ItemPricesRequest(List<PriceListService.ItemPriceData> rows) { }

    @GetMapping("/api/v1/price-lists")
    List<PriceListService.PriceList> lists() {
        return service.lists();
    }

    @PostMapping("/api/v1/price-lists")
    ResponseEntity<PriceListService.PriceList> register(@RequestBody PriceListService.PriceListData body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.register(body));
    }

    @GetMapping("/api/v1/price-lists/items/{itemId}")
    List<PriceListService.ItemPrice> itemPrices(@PathVariable UUID itemId) {
        return service.itemPrices(itemId);
    }

    @PutMapping("/api/v1/price-lists/items/{itemId}")
    List<PriceListService.ItemPrice> replace(@PathVariable UUID itemId, @RequestBody ItemPricesRequest body) {
        return service.replaceItemPrices(itemId, body == null ? List.of() : body.rows());
    }
}
