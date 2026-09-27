package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.SalesOrderRepository;
import br.com.fourtech.rendamais.comercial.domain.SalesOrder;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcSalesOrderRepository implements SalesOrderRepository {

    private static final String SELECT = """
            select o.*, p.code as partner_code, p.legal_name as partner_name, pp.code as proposal_code
              from sales_order o join partner p on p.id = o.customer_id left join proposal pp on pp.id = o.proposal_id
            """;

    private final JdbcClient jdbc;

    JdbcSalesOrderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("PV%05d", jdbc.sql("select nextval('sales_order_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(SalesOrder o) {
        bind(jdbc.sql("""
                insert into sales_order (id, code, customer_id, unit_id, unit_name, proposal_id, proposal_revision, contract_date,
                       promised_date, notes, status, total_cents, confirmed_at, confirmed_by, snapshot_hash, project_id,
                       cancelled_at, cancelled_by, cancel_reason, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :customer, :unit, :unitName, :proposal, :proposalRev, :contract, :promised, :notes, :status,
                        :total, :confirmedAt, :confirmedBy, :hash, :project, :cancelledAt, :cancelledBy, :cancelReason, :version,
                        :createdAt, :createdBy, :updatedAt, :updatedBy)
                """), o)
                .param("code", o.code()).param("proposal", o.proposalId()).param("proposalRev", o.proposalRevision())
                .param("createdAt", ts(o.createdAt())).param("createdBy", o.createdBy())
                .update();
        writeChildren(o);
    }

    @Override
    public boolean update(SalesOrder o, long expectedVersion) {
        int rows = bind(jdbc.sql("""
                update sales_order set customer_id = :customer, unit_id = :unit, unit_name = :unitName, contract_date = :contract,
                       promised_date = :promised, notes = :notes, status = :status, total_cents = :total,
                       confirmed_at = :confirmedAt, confirmed_by = :confirmedBy, snapshot_hash = :hash, project_id = :project,
                       cancelled_at = :cancelledAt, cancelled_by = :cancelledBy, cancel_reason = :cancelReason,
                       version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """), o).param("expected", expectedVersion).update();
        if (rows != 1) return false;
        jdbc.sql("delete from sales_order_line where order_id = :id").param("id", o.id()).update();
        jdbc.sql("delete from sales_order_installment where order_id = :id").param("id", o.id()).update();
        writeChildren(o);
        return true;
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec s, SalesOrder o) {
        SalesOrder.Confirmation c = o.confirmation();
        SalesOrder.Cancellation x = o.cancellation();
        return s.param("id", o.id()).param("customer", o.customerId()).param("unit", o.unitId()).param("unitName", o.unitName())
                .param("contract", date(o.contractDate())).param("promised", date(o.promisedDate())).param("notes", o.notes())
                .param("status", o.status().name()).param("total", o.totalCents())
                .param("confirmedAt", c == null ? null : ts(c.at())).param("confirmedBy", c == null ? null : c.by())
                .param("hash", c == null ? null : c.snapshotHash()).param("project", c == null ? null : c.projectId())
                .param("cancelledAt", x == null ? null : ts(x.at())).param("cancelledBy", x == null ? null : x.by())
                .param("cancelReason", x == null ? null : x.reason()).param("version", o.version())
                .param("updatedAt", ts(o.updatedAt())).param("updatedBy", o.updatedBy());
    }

    private void writeChildren(SalesOrder o) {
        SalesLinesSql.insert(jdbc, "sales_order_line", "order_id", o.id(), o.lines());
        for (SalesOrder.Installment i : o.installments()) {
            jdbc.sql("insert into sales_order_installment (order_id, seq, due_date, amount_cents, milestone) values (:o, :s, :d, :a, :m)")
                    .param("o", o.id()).param("s", i.seq()).param("d", date(i.dueDate())).param("a", i.amountCents())
                    .param("m", i.milestone()).update();
        }
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where o.id = :id").param("id", id).query(this::summary).optional();
    }

    @Override
    public Optional<SalesOrder> findByIdForUpdate(UUID id) {
        return jdbc.sql("select * from sales_order where id = :id for update").param("id", id).query(this::order).optional();
    }

    @Override
    public Optional<UUID> activeForProposal(UUID proposalId) {
        return jdbc.sql("select id from sales_order where proposal_id = :p and status <> 'CANCELLED'").param("p", proposalId)
                .query(UUID.class).optional();
    }

    @Override
    public List<Summary> list(String search, SalesOrder.Status status, int limit) {
        return jdbc.sql(SELECT + """
                 where (cast(:status as varchar) is null or o.status = cast(:status as varchar))
                   and (cast(:term as varchar) is null
                        or o.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.code ilike '%' || cast(:term as varchar) || '%'
                        or o.unit_name ilike '%' || cast(:term as varchar) || '%')
                 order by o.code desc limit :limit
                """)
                .param("status", status == null ? null : status.name()).param("term", search).param("limit", limit)
                .query(this::summary).list();
    }

    private Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(order(rs, n), rs.getString("partner_code"), rs.getString("partner_name"), rs.getString("proposal_code"));
    }

    private SalesOrder order(ResultSet rs, int n) throws SQLException {
        UUID id = rs.getObject("id", UUID.class);
        List<SalesOrder.Installment> installments = jdbc.sql("select * from sales_order_installment where order_id = :id order by seq")
                .param("id", id).query((r, k) -> new SalesOrder.Installment(r.getInt("seq"), localDate(r, "due_date"),
                        r.getLong("amount_cents"), r.getString("milestone"))).list();
        SalesOrder.Confirmation confirmation = rs.getTimestamp("confirmed_at") == null ? null
                : new SalesOrder.Confirmation(instant(rs, "confirmed_at"), rs.getString("confirmed_by"), rs.getString("snapshot_hash"),
                rs.getObject("project_id", UUID.class));
        SalesOrder.Cancellation cancellation = rs.getTimestamp("cancelled_at") == null ? null
                : new SalesOrder.Cancellation(instant(rs, "cancelled_at"), rs.getString("cancelled_by"), rs.getString("cancel_reason"));
        int rev = rs.getInt("proposal_revision");
        Integer proposalRevision = rs.wasNull() ? null : rev;
        return new SalesOrder(id, rs.getString("code"), rs.getObject("customer_id", UUID.class), rs.getObject("unit_id", UUID.class),
                rs.getString("unit_name"), rs.getObject("proposal_id", UUID.class), proposalRevision,
                localDate(rs, "contract_date"), localDate(rs, "promised_date"), rs.getString("notes"),
                SalesLinesSql.load(jdbc, "sales_order_line", "order_id", id), installments,
                SalesOrder.Status.valueOf(rs.getString("status")), confirmation, cancellation, rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }
}
