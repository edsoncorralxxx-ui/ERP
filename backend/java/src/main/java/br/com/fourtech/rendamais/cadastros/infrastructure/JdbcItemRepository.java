package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.ItemRepository;
import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcItemRepository implements ItemRepository {

    private static final String SELECT = """
            select i.id, i.code, i.description, i.nature, i.uom_code, i.category_id, c.name as category_name, i.stock_controlled,
                   i.reference_cost, i.status, i.version, i.created_at, i.created_by, i.updated_at, i.updated_by
              from item i join item_category c on c.id = i.category_id
            """;

    private final JdbcClient jdbc;

    JdbcItemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode(Item.Nature nature) {
        boolean material = nature == Item.Nature.MATERIAL;
        long n = jdbc.sql(material ? "select nextval('material_code_seq')" : "select nextval('service_code_seq')")
                .query(Long.class).single();
        return String.format(material ? "M%05d" : "S%05d", n);
    }

    @Override
    public void insert(Item i) {
        jdbc.sql("""
                insert into item (id, code, description, nature, uom_code, category_id, stock_controlled, reference_cost, status,
                                  version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :description, :nature, :uom, :category, :stock, :cost, :status, :version, :createdAt,
                        :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", i.id()).param("code", i.code()).param("description", i.description())
                .param("nature", i.nature().name()).param("uom", i.uom()).param("category", i.category().id())
                .param("stock", i.stockControlled()).param("cost", i.referenceCost()).param("status", i.status().name())
                .param("version", i.version()).param("createdAt", ts(i.createdAt())).param("createdBy", i.createdBy())
                .param("updatedAt", ts(i.updatedAt())).param("updatedBy", i.updatedBy())
                .update();
        writeConversions(i);
    }

    @Override
    public boolean update(Item i, long expectedVersion) {
        int rows = jdbc.sql("""
                update item set description = :description, uom_code = :uom, category_id = :category, stock_controlled = :stock,
                       reference_cost = :cost, status = :status, version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("description", i.description()).param("uom", i.uom()).param("category", i.category().id())
                .param("stock", i.stockControlled()).param("cost", i.referenceCost()).param("status", i.status().name())
                .param("version", i.version()).param("updatedAt", ts(i.updatedAt())).param("updatedBy", i.updatedBy())
                .param("id", i.id()).param("expected", expectedVersion)
                .update();
        if (rows != 1) return false;
        jdbc.sql("delete from item_conversion where item_id = :id").param("id", i.id()).update();
        writeConversions(i);
        return true;
    }

    private void writeConversions(Item i) {
        int pos = 0;
        for (Item.Conversion c : i.conversions()) {
            jdbc.sql("insert into item_conversion (id, item_id, position, from_uom, factor) values (:id, :item, :pos, :from, :factor)")
                    .param("id", c.id()).param("item", i.id()).param("pos", pos++).param("from", c.fromUom())
                    .param("factor", c.factor()).update();
        }
    }

    @Override
    public Optional<Item> findById(UUID id) {
        return load(SELECT + " where i.id = :id", id);
    }

    @Override
    public Optional<Item> findByIdForUpdate(UUID id) {
        return load(SELECT + " where i.id = :id for update of i", id);
    }

    private Optional<Item> load(String sql, UUID id) {
        return jdbc.sql(sql).param("id", id).query((rs, n) -> {
            List<Item.Conversion> conversions = jdbc.sql("""
                    select id, from_uom, factor from item_conversion where item_id = :id order by position
                    """).param("id", id).query((r, k) -> new Item.Conversion(r.getObject("id", UUID.class), r.getString("from_uom"),
                    r.getBigDecimal("factor"))).list();
            return new Item(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("description"),
                    Item.Nature.valueOf(rs.getString("nature")), rs.getString("uom_code"),
                    new Partner.Category(rs.getObject("category_id", UUID.class), rs.getString("category_name")),
                    rs.getBoolean("stock_controlled"), rs.getBigDecimal("reference_cost"),
                    Partner.Status.valueOf(rs.getString("status")), conversions, rs.getLong("version"), instant(rs, "created_at"),
                    rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
        }).optional();
    }

    @Override
    public List<Summary> list(String search, Item.Nature nature, UUID categoryId, Partner.Status status, int limit) {
        String term = search == null || search.isEmpty() ? null : search;
        return jdbc.sql(SELECT + """
                 where (cast(:status as varchar) is null or i.status = cast(:status as varchar))
                   and (cast(:nature as varchar) is null or i.nature = cast(:nature as varchar))
                   and (cast(:category as uuid) is null or i.category_id = cast(:category as uuid))
                   and (cast(:term as varchar) is null
                        or i.code ilike '%' || cast(:term as varchar) || '%'
                        or i.description ilike '%' || cast(:term as varchar) || '%')
                 order by i.code limit :limit
                """)
                .param("status", status == null ? null : status.name()).param("nature", nature == null ? null : nature.name())
                .param("category", categoryId).param("term", term).param("limit", limit)
                .query(JdbcItemRepository::summary).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        BigDecimal cost = rs.getBigDecimal("reference_cost");
        return new Summary(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("description"),
                Item.Nature.valueOf(rs.getString("nature")), rs.getString("uom_code"), rs.getString("category_name"),
                rs.getBoolean("stock_controlled"), cost, Partner.Status.valueOf(rs.getString("status")), rs.getLong("version"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
