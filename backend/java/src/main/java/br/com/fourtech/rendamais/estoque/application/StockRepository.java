package br.com.fourtech.rendamais.estoque.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência do estoque. */
public interface StockRepository {

    record Warehouse(UUID id, String code, String name, String kind, String address, String responsible, String status,
                     BigDecimal capacityKg, BigDecimal volumeM3, BigDecimal occupancyPercent, long version, long positions, long items) { }

    record Location(UUID id, UUID warehouseId, UUID parentId, String code, String name, String level, BigDecimal capacityKg,
                    BigDecimal volumeM3, BigDecimal occupancyPercent, boolean blockedEntry, boolean blockedExit, boolean quarantineOnly,
                    int position, long version, long children, long balances) { }

    record Balance(UUID id, UUID itemId, String itemCode, String itemDescription, String uom, UUID warehouseId, String warehouseCode,
                   String warehouseName, UUID locationId, String locationCode, String lot, BigDecimal onHand, BigDecimal reserved,
                   BigDecimal onOrder, BigDecimal averageCost) { }

    record Total(UUID itemId, BigDecimal onHand, BigDecimal reserved, BigDecimal onOrder, BigDecimal averageCost) { }

    List<Warehouse> warehouses(String status);

    Optional<Warehouse> warehouse(UUID id, boolean forUpdate);

    boolean warehouseCodeExists(String code);

    void insertWarehouse(Warehouse w, Instant now, String actor);

    boolean updateWarehouse(Warehouse w, long expectedVersion, Instant now, String actor);

    List<Location> locations();

    Optional<Location> location(UUID id, boolean forUpdate);

    boolean locationCodeExists(String code, UUID exceptId);

    void insertLocation(Location l, Instant now, String actor);

    boolean updateLocation(Location l, long expectedVersion, Instant now, String actor);

    void deleteLocation(UUID id);

    /** Saldos filtrados; {@code locationId} inclui os subníveis. */
    List<Balance> balances(UUID itemId, UUID warehouseId, UUID locationId);

    List<Total> totals();

    void replaceBalances(UUID itemId, List<Balance> rows, Instant now, String actor);
}
