package br.com.fourtech.rendamais.estoque.infrastructure;

import br.com.fourtech.rendamais.estoque.application.StockRepository;
import br.com.fourtech.rendamais.estoque.application.StockService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Estoque (Sprint 13): depósitos, localizações e saldos informados. Depósito novo exige Idempotency-Key; alterações e
 * remoção exigem If-Match. Quantidades trafegam como texto decimal com ponto.
 */
@RestController
class StockController {

    private final StockService service;

    StockController(StockService service) {
        this.service = service;
    }

    record WarehouseDto(String id, String code, String name, String kind, String address, String responsible, String status,
                        String capacityKg, String volumeM3, String occupancyPercent, long positions, long items, String version) {
        static WarehouseDto of(StockRepository.Warehouse w) {
            return new WarehouseDto(w.id().toString(), w.code(), w.name(), w.kind(), w.address(), w.responsible(), w.status(),
                    plain(w.capacityKg()), plain(w.volumeM3()), plain(w.occupancyPercent()), w.positions(), w.items(),
                    Long.toString(w.version()));
        }
    }

    record LocationDto(String id, String warehouseId, String parentId, String code, String name, String level, String capacityKg,
                       String volumeM3, String occupancyPercent, boolean blockedEntry, boolean blockedExit, boolean quarantineOnly,
                       long children, long balances, String version) {
        static LocationDto of(StockRepository.Location l) {
            return new LocationDto(l.id().toString(), l.warehouseId().toString(), l.parentId() == null ? null : l.parentId().toString(),
                    l.code(), l.name(), l.level(), plain(l.capacityKg()), plain(l.volumeM3()), plain(l.occupancyPercent()),
                    l.blockedEntry(), l.blockedExit(), l.quarantineOnly(), l.children(), l.balances(), Long.toString(l.version()));
        }
    }

    record BalanceDto(String id, String itemId, String itemCode, String itemDescription, String uom, String warehouseId,
                      String warehouseCode, String warehouseName, String locationId, String locationCode, String lot, String onHand,
                      String reserved, String onOrder, String averageCost) {
        static BalanceDto of(StockRepository.Balance b) {
            return new BalanceDto(b.id().toString(), b.itemId().toString(), b.itemCode(), b.itemDescription(), b.uom(),
                    b.warehouseId().toString(), b.warehouseCode(), b.warehouseName(), b.locationId() == null ? null : b.locationId().toString(),
                    b.locationCode(), b.lot(), plain(b.onHand()), plain(b.reserved()), plain(b.onOrder()), plain(b.averageCost()));
        }
    }

    record TotalDto(String itemId, String onHand, String reserved, String onOrder, String averageCost) { }

    record BalancesRequest(List<StockService.BalanceData> rows) { }

    @GetMapping("/api/v1/warehouses")
    List<WarehouseDto> warehouses(@RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        return service.warehouses(status).stream().map(WarehouseDto::of).toList();
    }

    @GetMapping("/api/v1/warehouses/{id}")
    ResponseEntity<WarehouseDto> warehouse(@PathVariable UUID id) {
        StockRepository.Warehouse w = service.warehouse(id);
        return ResponseEntity.ok().eTag("\"" + w.version() + "\"").body(WarehouseDto.of(w));
    }

    @PostMapping("/api/v1/warehouses")
    ResponseEntity<WarehouseDto> registerWarehouse(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                                   @RequestBody StockService.WarehouseData body) {
        StockRepository.Warehouse w = service.registerWarehouse(key, body);
        return ResponseEntity.status(HttpStatus.CREATED).eTag("\"" + w.version() + "\"").body(WarehouseDto.of(w));
    }

    @PutMapping("/api/v1/warehouses/{id}")
    ResponseEntity<WarehouseDto> updateWarehouse(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                 @RequestBody StockService.WarehouseData body) {
        StockRepository.Warehouse w = service.updateWarehouse(id, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + w.version() + "\"").body(WarehouseDto.of(w));
    }

    @GetMapping("/api/v1/stock-locations")
    List<LocationDto> locations() {
        return service.locations().stream().map(LocationDto::of).toList();
    }

    @PostMapping("/api/v1/stock-locations")
    ResponseEntity<LocationDto> registerLocation(@RequestBody StockService.LocationData body) {
        StockRepository.Location l = service.registerLocation(body);
        return ResponseEntity.status(HttpStatus.CREATED).eTag("\"" + l.version() + "\"").body(LocationDto.of(l));
    }

    @PutMapping("/api/v1/stock-locations/{id}")
    ResponseEntity<LocationDto> updateLocation(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                               @RequestBody StockService.LocationData body) {
        StockRepository.Location l = service.updateLocation(id, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + l.version() + "\"").body(LocationDto.of(l));
    }

    @DeleteMapping("/api/v1/stock-locations/{id}")
    ResponseEntity<Void> deleteLocation(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        service.deleteLocation(id, Versions.required(ifMatch));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/stock-balances")
    List<BalanceDto> balances(@RequestParam(value = "itemId", required = false) UUID itemId,
                              @RequestParam(value = "warehouseId", required = false) UUID warehouseId,
                              @RequestParam(value = "locationId", required = false) UUID locationId) {
        return service.balances(itemId, warehouseId, locationId).stream().map(BalanceDto::of).toList();
    }

    @GetMapping("/api/v1/stock-balances/totals")
    List<TotalDto> totals() {
        return service.totals().stream().map(t -> new TotalDto(t.itemId().toString(), plain(t.onHand()), plain(t.reserved()),
                plain(t.onOrder()), plain(t.averageCost()))).toList();
    }

    @PutMapping("/api/v1/stock-balances/items/{itemId}")
    List<BalanceDto> replaceBalances(@PathVariable UUID itemId, @RequestBody BalancesRequest body) {
        return service.replaceBalances(itemId, body == null ? List.of() : body.rows()).stream().map(BalanceDto::of).toList();
    }

    private static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }
}
