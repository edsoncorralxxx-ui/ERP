package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialCategoryRepository;
import br.com.fourtech.rendamais.financeiro.domain.FinancialCategory;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
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
class JdbcFinancialCategoryRepository implements FinancialCategoryRepository {

    private final JdbcClient jdbc;

    JdbcFinancialCategoryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(FinancialCategory c) {
        jdbc.sql("""
                insert into financial_category (id, code, name, direction, status, system, version, created_at, created_by, updated_at,
                       updated_by)
                values (:id, :code, :name, :direction, :status, :system, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", c.id()).param("code", c.code()).param("name", c.name()).param("direction", c.direction().name())
                .param("status", c.status().name()).param("system", c.system()).param("version", c.version())
                .param("createdAt", ts(c.createdAt())).param("createdBy", c.createdBy())
                .param("updatedAt", ts(c.updatedAt())).param("updatedBy", c.updatedBy())
                .update();
    }

    @Override
    public void update(FinancialCategory c, long expectedVersion) {
        int n = jdbc.sql("""
                update financial_category set name = :name, status = :status, version = :version, updated_at = :updatedAt,
                       updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("name", c.name()).param("status", c.status().name()).param("version", c.version())
                .param("updatedAt", ts(c.updatedAt())).param("updatedBy", c.updatedBy()).param("id", c.id())
                .param("expected", expectedVersion)
                .update();
        if (n != 1) throw new VersionConflictException("financial_category", expectedVersion, c.version() - 1);
    }

    @Override
    public Optional<FinancialCategory> find(UUID id) {
        return jdbc.sql("select * from financial_category where id = :id").param("id", id)
                .query(JdbcFinancialCategoryRepository::category).optional();
    }

    @Override
    public Optional<FinancialCategory> findByCode(String code) {
        return jdbc.sql("select * from financial_category where code = :code").param("code", code)
                .query(JdbcFinancialCategoryRepository::category).optional();
    }

    @Override
    public Optional<FinancialCategory> findByName(String name) {
        return jdbc.sql("select * from financial_category where lower(name) = lower(:name)").param("name", name)
                .query(JdbcFinancialCategoryRepository::category).optional();
    }

    @Override
    public boolean codeExists(String code) {
        return jdbc.sql("select exists(select 1 from financial_category where code = :code)").param("code", code)
                .query(Boolean.class).single();
    }

    @Override
    public List<FinancialCategory> list(FinancialCategory.Direction direction, boolean includeInactive) {
        return jdbc.sql("""
                select * from financial_category
                 where (cast(:direction as varchar) is null or direction = cast(:direction as varchar))
                   and (:all or status = 'ATIVO')
                 order by direction desc, name
                """)
                .param("direction", direction == null ? null : direction.name()).param("all", includeInactive)
                .query(JdbcFinancialCategoryRepository::category).list();
    }

    @Override
    public long titlesUsing(String code) {
        return jdbc.sql("select count(*) from financial_title where category = :code and lifecycle <> 'CANCELLED'")
                .param("code", code).query(Long.class).single();
    }

    private static FinancialCategory category(ResultSet rs, int n) throws SQLException {
        return new FinancialCategory(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                FinancialCategory.Direction.valueOf(rs.getString("direction")), FinancialCategory.Status.valueOf(rs.getString("status")),
                rs.getBoolean("system"), rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"),
                instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
