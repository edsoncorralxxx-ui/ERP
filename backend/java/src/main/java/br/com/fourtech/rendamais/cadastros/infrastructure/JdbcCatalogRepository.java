package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.CatalogRepository;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
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
class JdbcCatalogRepository implements CatalogRepository {

    private static final String UNITS = """
            select u.code, u.name, u.status, u.version, coalesce(u.updated_at, u.created_at) as updated_at,
                   coalesce(u.updated_by, u.created_by) as updated_by,
                   (select count(*) from item i where i.uom_code = u.code) as items
              from unit_of_measure u
            """;

    private static final String CATEGORIES = """
            select c.id, c.name, c.status, c.version, coalesce(c.updated_at, c.created_at) as updated_at,
                   coalesce(c.updated_by, c.created_by) as updated_by,
                   (select count(*) from item i where i.category_id = c.id) as items,
                   (select count(*) from partner_supplied_category s where s.category_id = c.id) as suppliers
              from item_category c
            """;

    private final JdbcClient jdbc;

    JdbcCatalogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<UnitOfMeasureEntry> units() {
        return jdbc.sql(UNITS + " order by u.code").query(JdbcCatalogRepository::unit).list();
    }

    @Override
    public Optional<UnitOfMeasureEntry> unit(String code, boolean forUpdate) {
        return jdbc.sql(UNITS + " where u.code = :code" + (forUpdate ? " for update of u" : "")).param("code", code)
                .query(JdbcCatalogRepository::unit).optional();
    }

    @Override
    public void insertUnit(String code, String name, Instant now, String actor) {
        jdbc.sql("insert into unit_of_measure (code, name, created_at, created_by) values (:code, :name, :now, :actor)")
                .param("code", code).param("name", name).param("now", Timestamp.from(now)).param("actor", actor).update();
    }

    @Override
    public boolean updateUnit(String code, long expectedVersion, String name, Partner.Status status, Instant now, String actor) {
        return jdbc.sql("""
                update unit_of_measure set name = :name, status = :status, version = version + 1, updated_at = :now,
                       updated_by = :actor
                 where code = :code and version = :expected
                """).param("name", name).param("status", status.name()).param("now", Timestamp.from(now))
                .param("actor", actor).param("code", code).param("expected", expectedVersion).update() == 1;
    }

    @Override
    public List<CategoryEntry> categories() {
        return jdbc.sql(CATEGORIES + " order by lower(c.name)").query(JdbcCatalogRepository::category).list();
    }

    @Override
    public Optional<CategoryEntry> category(UUID id, boolean forUpdate) {
        return jdbc.sql(CATEGORIES + " where c.id = :id" + (forUpdate ? " for update of c" : "")).param("id", id)
                .query(JdbcCatalogRepository::category).optional();
    }

    @Override
    public Optional<CategoryEntry> categoryByName(String name, UUID exceptId) {
        return jdbc.sql(CATEGORIES + " where lower(c.name) = lower(:name) and c.id <> :id").param("name", name)
                .param("id", exceptId).query(JdbcCatalogRepository::category).optional();
    }

    @Override
    public void insertCategory(UUID id, String name, Instant now, String actor) {
        jdbc.sql("insert into item_category (id, name, created_at, created_by) values (:id, :name, :now, :actor)")
                .param("id", id).param("name", name).param("now", Timestamp.from(now)).param("actor", actor).update();
    }

    @Override
    public boolean updateCategory(UUID id, long expectedVersion, String name, Partner.Status status, Instant now, String actor) {
        return jdbc.sql("""
                update item_category set name = :name, status = :status, version = version + 1, updated_at = :now,
                       updated_by = :actor
                 where id = :id and version = :expected
                """).param("name", name).param("status", status.name()).param("now", Timestamp.from(now))
                .param("actor", actor).param("id", id).param("expected", expectedVersion).update() == 1;
    }

    private static UnitOfMeasureEntry unit(ResultSet rs, int n) throws SQLException {
        return new UnitOfMeasureEntry(rs.getString("code"), rs.getString("name"), Partner.Status.valueOf(rs.getString("status")),
                rs.getLong("version"), instant(rs), rs.getString("updated_by"), rs.getLong("items"));
    }

    private static CategoryEntry category(ResultSet rs, int n) throws SQLException {
        return new CategoryEntry(rs.getObject("id", UUID.class), rs.getString("name"), Partner.Status.valueOf(rs.getString("status")),
                rs.getLong("version"), instant(rs), rs.getString("updated_by"), rs.getLong("items"), rs.getLong("suppliers"));
    }

    private static Instant instant(ResultSet rs) throws SQLException {
        Timestamp t = rs.getTimestamp("updated_at");
        return t == null ? null : t.toInstant();
    }
}
