package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.ProposalRepository;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcProposalRepository implements ProposalRepository {

    private static final String SELECT = """
            select pp.*, p.code as partner_code, p.legal_name as partner_name
              from proposal pp join partner p on p.id = pp.customer_id
            """;

    private final JdbcClient jdbc;

    JdbcProposalRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("PR%05d", jdbc.sql("select nextval('proposal_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Proposal p) {
        jdbc.sql("""
                insert into proposal (id, code, customer_id, unit_id, unit_name, title, status, outcome_reason, current_revision,
                       version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :customer, :unit, :unitName, :title, :status, :reason, :rev, :version, :createdAt, :createdBy,
                        :updatedAt, :updatedBy)
                """)
                .param("id", p.id()).param("code", p.code()).param("customer", p.customerId()).param("unit", p.unitId())
                .param("unitName", p.unitName()).param("title", p.title()).param("status", p.status().name())
                .param("reason", p.outcomeReason()).param("rev", p.current().number()).param("version", p.version())
                .param("createdAt", ts(p.createdAt())).param("createdBy", p.createdBy())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy())
                .update();
        writeRevisions(p);
    }

    @Override
    public boolean update(Proposal p, long expectedVersion) {
        int rows = jdbc.sql("""
                update proposal set customer_id = :customer, unit_id = :unit, unit_name = :unitName, title = :title, status = :status,
                       outcome_reason = :reason, current_revision = :rev, version = :version, updated_at = :updatedAt,
                       updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("customer", p.customerId()).param("unit", p.unitId()).param("unitName", p.unitName())
                .param("title", p.title()).param("status", p.status().name()).param("reason", p.outcomeReason())
                .param("rev", p.current().number()).param("version", p.version()).param("updatedAt", ts(p.updatedAt()))
                .param("updatedBy", p.updatedBy()).param("id", p.id()).param("expected", expectedVersion)
                .update();
        if (rows != 1) return false;
        jdbc.sql("delete from proposal_revision where proposal_id = :id").param("id", p.id()).update();
        writeRevisions(p);
        return true;
    }

    private void writeRevisions(Proposal p) {
        for (Proposal.Revision r : p.revisions()) {
            jdbc.sql("""
                    insert into proposal_revision (id, proposal_id, revision, status, valid_until, payment_terms, total_cents,
                           issued_at, issued_by)
                    values (:id, :proposal, :rev, :status, :valid, :terms, :total, :issuedAt, :issuedBy)
                    """)
                    .param("id", r.id()).param("proposal", p.id()).param("rev", r.number()).param("status", r.status().name())
                    .param("valid", date(r.validUntil())).param("terms", r.paymentTerms()).param("total", r.totalCents())
                    .param("issuedAt", ts(r.issuedAt())).param("issuedBy", r.issuedBy())
                    .update();
            SalesLinesSql.insert(jdbc, "proposal_line", "revision_id", r.id(), r.lines());
        }
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where pp.id = :id").param("id", id).query(this::summary).optional();
    }

    @Override
    public Optional<Proposal> findByIdForUpdate(UUID id) {
        return jdbc.sql("select * from proposal where id = :id for update").param("id", id).query(this::proposal).optional();
    }

    @Override
    public List<Summary> list(String search, Proposal.Status status, int limit) {
        return jdbc.sql(SELECT + """
                 where (cast(:status as varchar) is null or pp.status = cast(:status as varchar))
                   and (cast(:term as varchar) is null
                        or pp.code ilike '%' || cast(:term as varchar) || '%'
                        or pp.title ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.code ilike '%' || cast(:term as varchar) || '%')
                 order by pp.code desc limit :limit
                """)
                .param("status", status == null ? null : status.name()).param("term", search).param("limit", limit)
                .query(this::summary).list();
    }

    private Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(proposal(rs, n), rs.getString("partner_code"), rs.getString("partner_name"));
    }

    private Proposal proposal(ResultSet rs, int n) throws SQLException {
        UUID id = rs.getObject("id", UUID.class);
        List<Proposal.Revision> revisions = jdbc.sql("select * from proposal_revision where proposal_id = :id order by revision")
                .param("id", id).query((r, k) -> {
                    UUID rid = r.getObject("id", UUID.class);
                    return new Proposal.Revision(rid, r.getInt("revision"), Proposal.RevisionStatus.valueOf(r.getString("status")),
                            localDate(r, "valid_until"), r.getString("payment_terms"),
                            SalesLinesSql.load(jdbc, "proposal_line", "revision_id", rid), r.getLong("total_cents"),
                            instant(r, "issued_at"), r.getString("issued_by"));
                }).list();
        return new Proposal(id, rs.getString("code"), rs.getObject("customer_id", UUID.class), rs.getObject("unit_id", UUID.class),
                rs.getString("unit_name"), rs.getString("title"), Proposal.Status.valueOf(rs.getString("status")),
                rs.getString("outcome_reason"), revisions, rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }
}
