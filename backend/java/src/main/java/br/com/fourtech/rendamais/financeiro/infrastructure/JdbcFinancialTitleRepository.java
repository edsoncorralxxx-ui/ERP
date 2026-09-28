package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialTitleRepository;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcFinancialTitleRepository implements FinancialTitleRepository {

    private static final String SELECT = """
            select t.*, p.code as partner_code, p.legal_name as partner_name
              from financial_title t join partner p on p.id = t.counterparty_id
            """;

    private final JdbcClient jdbc;

    JdbcFinancialTitleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextReceivableCode() {
        return String.format("CR%05d", jdbc.sql("select nextval('receivable_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(FinancialTitle t) {
        jdbc.sql("""
                insert into financial_title (id, code, direction, counterparty_id, origin_type, origin_id, origin_label, project_id,
                       category, competence, issue_date, due_date, original_cents, received_cents, lifecycle, cancel_reason, version, created_at,
                       created_by, updated_at, updated_by)
                values (:id, :code, :direction, :counterparty, :originType, :originId, :label, :project, :category, :competence,
                        :issue, :due, :cents, :received, :lifecycle, :reason, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", t.id()).param("code", t.code()).param("direction", t.direction().name())
                .param("counterparty", t.counterpartyId()).param("originType", t.originType()).param("originId", t.originId())
                .param("label", t.originLabel()).param("project", t.projectId()).param("category", t.category())
                .param("competence", t.competence().toString()).param("issue", Date.valueOf(t.issueDate()))
                .param("due", Date.valueOf(t.dueDate())).param("cents", t.original().cents())
                .param("received", t.received().cents()).param("lifecycle", t.lifecycle().name())
                .param("reason", t.cancelReason()).param("version", t.version())
                .param("createdAt", ts(t.createdAt())).param("createdBy", t.createdBy())
                .param("updatedAt", ts(t.updatedAt())).param("updatedBy", t.updatedBy())
                .update();
    }

    @Override
    public void update(FinancialTitle t) {
        jdbc.sql("""
                update financial_title set received_cents = :received, lifecycle = :lifecycle, cancel_reason = :reason,
                       version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id
                """)
                .param("received", t.received().cents()).param("lifecycle", t.lifecycle().name())
                .param("reason", t.cancelReason()).param("version", t.version())
                .param("updatedAt", ts(t.updatedAt())).param("updatedBy", t.updatedBy()).param("id", t.id())
                .update();
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where t.id = :id").param("id", id).query(JdbcFinancialTitleRepository::summary).optional();
    }

    @Override
    public List<FinancialTitle> findByOriginForUpdate(String originType, List<String> originIds) {
        if (originIds.isEmpty()) return List.of();
        return jdbc.sql("select * from financial_title where origin_type = :type and origin_id in (:ids) order by id for update")
                .param("type", originType).param("ids", originIds).query(JdbcFinancialTitleRepository::title).list();
    }

    @Override
    public List<FinancialTitle> findByIdsForUpdate(List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select * from financial_title where id in (:ids) order by id for update")
                .param("ids", ids).query(JdbcFinancialTitleRepository::title).list();
    }

    @Override
    public List<FinancialTitle> findByOrigin(String originType, List<String> originIds) {
        if (originIds.isEmpty()) return List.of();
        return jdbc.sql("select * from financial_title where origin_type = :type and origin_id in (:ids) order by due_date, code")
                .param("type", originType).param("ids", originIds).query(JdbcFinancialTitleRepository::title).list();
    }

    @Override
    public List<FinancialTitle> findByIds(List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select * from financial_title where id in (:ids) order by due_date, code")
                .param("ids", ids).query(JdbcFinancialTitleRepository::title).list();
    }

    @Override
    public List<FinancialTitle> activeReceivablesOf(UUID counterpartyId) {
        return jdbc.sql("""
                select * from financial_title
                 where direction = 'RECEIVABLE' and counterparty_id = :p and lifecycle <> 'CANCELLED'
                 order by due_date, code
                """)
                .param("p", counterpartyId).query(JdbcFinancialTitleRepository::title).list();
    }

    @Override
    public List<Summary> listReceivables(String search, UUID projectId, UUID counterpartyId, Filter filter, LocalDate today, int limit) {
        return jdbc.sql(SELECT + """
                 where t.direction = 'RECEIVABLE'
                   and case :filter
                         when 'OPEN' then t.lifecycle = 'ACTIVE' and t.received_cents < t.original_cents
                         when 'OVERDUE' then t.lifecycle = 'ACTIVE' and t.received_cents < t.original_cents and t.due_date < :today
                         when 'SETTLED' then t.lifecycle = 'ACTIVE' and t.received_cents = t.original_cents
                         when 'CANCELLED' then t.lifecycle = 'CANCELLED'
                         when 'ACTIVE' then t.lifecycle <> 'CANCELLED'
                         else true end
                   and (cast(:project as uuid) is null or t.project_id = cast(:project as uuid))
                   and (cast(:partner as uuid) is null or t.counterparty_id = cast(:partner as uuid))
                   and (cast(:term as varchar) is null
                        or t.code ilike '%' || cast(:term as varchar) || '%'
                        or t.origin_label ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.code ilike '%' || cast(:term as varchar) || '%')
                 order by t.due_date, t.code limit :limit
                """)
                .param("filter", filter.name()).param("today", Date.valueOf(today)).param("project", projectId).param("partner", counterpartyId)
                .param("term", search).param("limit", limit)
                .query(JdbcFinancialTitleRepository::summary).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(title(rs, n), rs.getString("partner_code"), rs.getString("partner_name"));
    }

    private static FinancialTitle title(ResultSet rs, int n) throws SQLException {
        return new FinancialTitle(rs.getObject("id", UUID.class), rs.getString("code"),
                FinancialTitle.Direction.valueOf(rs.getString("direction")), rs.getObject("counterparty_id", UUID.class),
                rs.getString("origin_type"), rs.getString("origin_id"), rs.getString("origin_label"),
                rs.getObject("project_id", UUID.class), rs.getString("category"), YearMonth.parse(rs.getString("competence")),
                rs.getDate("issue_date").toLocalDate(), rs.getDate("due_date").toLocalDate(),
                Money.ofCents(rs.getLong("original_cents"), Currency.BRL), Money.ofCents(rs.getLong("received_cents"), Currency.BRL),
                FinancialTitle.Lifecycle.valueOf(rs.getString("lifecycle")),
                rs.getString("cancel_reason"), rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"),
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
