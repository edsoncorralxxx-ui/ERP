package br.com.fourtech.rendamais.estoque.infrastructure;

import br.com.fourtech.rendamais.estoque.application.StockRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcStockRepository implements StockRepository {

    private static final String WAREHOUSES = """
            select w.*, (select count(*) from stock_location l where l.warehouse_id = w.id and l.level = 'POSICAO') as positions,
                   (select count(distinct b.item_id) from item_stock_balance b where b.warehouse_id = w.id) as items
              from warehouse w
            """;

    private static final String LOCATIONS = """
            select l.*, (select count(*) from stock_location c where c.parent_id = l.id) as children,
                   (select count(*) from item_stock_balance b where b.location_id = l.id) as balances
              from stock_location l
            """;

    private final JdbcClient jdbc;

    JdbcStockRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Warehouse> warehouses(String status) {
        String s = status == null || "TODOS".equalsIgnoreCase(status) ? null : status.toUpperCase(java.util.Locale.ROOT);
        return jdbc.sql(WAREHOUSES + " where (cast(:s as varchar) is null or w.status = cast(:s as varchar)) order by w.code")
                .param("s", s).query(JdbcStockRepository::warehouse).list();
    }

    @Override
    public Optional<Warehouse> warehouse(UUID id, boolean forUpdate) {
        return jdbc.sql(WAREHOUSES + " where w.id = :id" + (forUpdate ? " for update of w" : "")).param("id", id)
                .query(JdbcStockRepository::warehouse).optional();
    }

    @Override
    public boolean warehouseCodeExists(String code) {
        return jdbc.sql("select count(*) from warehouse where code = :c").param("c", code).query(Long.class).single() > 0;
    }

    @Override
    public void insertWarehouse(Warehouse w, Instant now, String actor) {
        jdbc.sql("""
                insert into warehouse (id, code, name, kind, address, responsible, status, capacity_kg, volume_m3, occupancy_percent,
                                       version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :kind, :address, :resp, :status, :cap, :vol, :occ, 1, :at, :by, :at, :by)
                """).param("id", w.id()).param("code", w.code()).param("name", w.name()).param("kind", w.kind())
                .param("address", w.address()).param("resp", w.responsible()).param("status", w.status()).param("cap", w.capacityKg())
                .param("vol", w.volumeM3()).param("occ", w.occupancyPercent()).param("at", Timestamp.from(now)).param("by", actor).update();
    }

    @Override
    public boolean updateWarehouse(Warehouse w, long expectedVersion, Instant now, String actor) {
        return jdbc.sql("""
                update warehouse set name = :name, kind = :kind, address = :address, responsible = :resp, status = :status,
                       capacity_kg = :cap, volume_m3 = :vol, occupancy_percent = :occ, version = version + 1, updated_at = :at,
                       updated_by = :by
                 where id = :id and version = :expected
                """).param("id", w.id()).param("name", w.name()).param("kind", w.kind()).param("address", w.address())
                .param("resp", w.responsible()).param("status", w.status()).param("cap", w.capacityKg()).param("vol", w.volumeM3())
                .param("occ", w.occupancyPercent()).param("at", Timestamp.from(now)).param("by", actor).param("expected", expectedVersion)
                .update() == 1;
    }

    @Override
    public List<Location> locations() {
        return jdbc.sql(LOCATIONS + " order by l.warehouse_id, l.position, l.code").query(JdbcStockRepository::location).list();
    }

    @Override
    public Optional<Location> location(UUID id, boolean forUpdate) {
        return jdbc.sql(LOCATIONS + " where l.id = :id" + (forUpdate ? " for update of l" : "")).param("id", id)
                .query(JdbcStockRepository::location).optional();
    }

    @Override
    public boolean locationCodeExists(String code, UUID exceptId) {
        return jdbc.sql("select count(*) from stock_location where code = :c and id <> :id").param("c", code).param("id", exceptId)
                .query(Long.class).single() > 0;
    }

    @Override
    public void insertLocation(Location l, Instant now, String actor) {
        int pos = jdbc.sql("select coalesce(max(position), -1) + 1 from stock_location where warehouse_id = :w and parent_id is not distinct from :p")
                .param("w", l.warehouseId()).param("p", l.parentId()).query(Integer.class).single();
        jdbc.sql("""
                insert into stock_location (id, warehouse_id, parent_id, code, name, level, capacity_kg, volume_m3, occupancy_percent,
                                            blocked_entry, blocked_exit, quarantine_only, position, version, created_at, created_by,
                                            updated_at, updated_by)
                values (:id, :w, :p, :code, :name, :level, :cap, :vol, :occ, :be, :bx, :q, :pos, 1, :at, :by, :at, :by)
                """).param("id", l.id()).param("w", l.warehouseId()).param("p", l.parentId()).param("code", l.code()).param("name", l.name())
                .param("level", l.level()).param("cap", l.capacityKg()).param("vol", l.volumeM3()).param("occ", l.occupancyPercent())
                .param("be", l.blockedEntry()).param("bx", l.blockedExit()).param("q", l.quarantineOnly()).param("pos", pos)
                .param("at", Timestamp.from(now)).param("by", actor).update();
    }

    @Override
    public boolean updateLocation(Location l, long expectedVersion, Instant now, String actor) {
        return jdbc.sql("""
                update stock_location set code = :code, name = :name, level = :level, capacity_kg = :cap, volume_m3 = :vol,
                       occupancy_percent = :occ, blocked_entry = :be, blocked_exit = :bx, quarantine_only = :q, version = version + 1,
                       updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """).param("id", l.id()).param("code", l.code()).param("name", l.name()).param("level", l.level())
                .param("cap", l.capacityKg()).param("vol", l.volumeM3()).param("occ", l.occupancyPercent()).param("be", l.blockedEntry())
                .param("bx", l.blockedExit()).param("q", l.quarantineOnly()).param("at", Timestamp.from(now)).param("by", actor)
                .param("expected", expectedVersion).update() == 1;
    }

    @Override
    public void deleteLocation(UUID id) {
        jdbc.sql("delete from stock_location where id = :id").param("id", id).update();
    }

    @Override
    public List<Balance> balances(UUID itemId, UUID warehouseId, UUID locationId) {
        return jdbc.sql("""
                with recursive sub as (
                    select id from stock_location where id = cast(:loc as uuid)
                    union all select l.id from stock_location l join sub on l.parent_id = sub.id)
                select b.*, i.code as item_code, i.description as item_description, i.uom_code, w.code as warehouse_code,
                       w.name as warehouse_name, l.code as location_code
                  from item_stock_balance b join item i on i.id = b.item_id join warehouse w on w.id = b.warehouse_id
                  left join stock_location l on l.id = b.location_id
                 where (cast(:item as uuid) is null or b.item_id = cast(:item as uuid))
                   and (cast(:wh as uuid) is null or b.warehouse_id = cast(:wh as uuid))
                   and (cast(:loc as uuid) is null or b.location_id in (select id from sub))
                 order by w.code, l.code nulls last, i.code, b.lot
                """).param("item", itemId).param("wh", warehouseId).param("loc", locationId)
                .query((rs, n) -> new Balance(rs.getObject("id", UUID.class), rs.getObject("item_id", UUID.class), rs.getString("item_code"),
                        rs.getString("item_description"), rs.getString("uom_code"), rs.getObject("warehouse_id", UUID.class),
                        rs.getString("warehouse_code"), rs.getString("warehouse_name"), rs.getObject("location_id", UUID.class),
                        rs.getString("location_code"), rs.getString("lot"), rs.getBigDecimal("on_hand"), rs.getBigDecimal("reserved"),
                        rs.getBigDecimal("on_order"), rs.getBigDecimal("average_cost"))).list();
    }

    @Override
    public List<Total> totals() {
        return jdbc.sql("""
                select item_id, sum(on_hand) as on_hand, sum(reserved) as reserved, sum(on_order) as on_order,
                       case when sum(on_hand) > 0 and count(average_cost) > 0
                            then sum(on_hand * coalesce(average_cost, 0)) / nullif(sum(case when average_cost is not null then on_hand end), 0)
                            else max(average_cost) end as average_cost
                  from item_stock_balance group by item_id
                """).query((rs, n) -> new Total(rs.getObject("item_id", UUID.class), rs.getBigDecimal("on_hand"), rs.getBigDecimal("reserved"),
                rs.getBigDecimal("on_order"), rs.getBigDecimal("average_cost"))).list();
    }

    @Override
    public void replaceBalances(UUID itemId, List<Balance> rows, Instant now, String actor) {
        jdbc.sql("delete from item_stock_balance where item_id = :item").param("item", itemId).update();
        for (Balance b : rows) {
            jdbc.sql("""
                    insert into item_stock_balance (id, item_id, warehouse_id, location_id, lot, on_hand, reserved, on_order, average_cost,
                                                    updated_at, updated_by)
                    values (:id, :item, :w, :l, :lot, :oh, :r, :oo, :ac, :at, :by)
                    """).param("id", b.id()).param("item", itemId).param("w", b.warehouseId()).param("l", b.locationId()).param("lot", b.lot())
                    .param("oh", b.onHand()).param("r", b.reserved()).param("oo", b.onOrder()).param("ac", b.averageCost())
                    .param("at", Timestamp.from(now)).param("by", actor).update();
        }
    }

    private static Warehouse warehouse(ResultSet rs, int n) throws SQLException {
        return new Warehouse(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"), rs.getString("kind"),
                rs.getString("address"), rs.getString("responsible"), rs.getString("status"), rs.getBigDecimal("capacity_kg"),
                rs.getBigDecimal("volume_m3"), rs.getBigDecimal("occupancy_percent"), rs.getLong("version"), rs.getLong("positions"),
                rs.getLong("items"));
    }

    private static Location location(ResultSet rs, int n) throws SQLException {
        return new Location(rs.getObject("id", UUID.class), rs.getObject("warehouse_id", UUID.class), rs.getObject("parent_id", UUID.class),
                rs.getString("code"), rs.getString("name"), rs.getString("level"), rs.getBigDecimal("capacity_kg"), rs.getBigDecimal("volume_m3"),
                rs.getBigDecimal("occupancy_percent"), rs.getBoolean("blocked_entry"), rs.getBoolean("blocked_exit"),
                rs.getBoolean("quarantine_only"), rs.getInt("position"), rs.getLong("version"), rs.getLong("children"), rs.getLong("balances"));
    }
}
