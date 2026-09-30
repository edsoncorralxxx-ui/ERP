package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.TransferRepository;
import br.com.fourtech.rendamais.financeiro.domain.Transfer;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcTransferRepository implements TransferRepository {

    private static final String SELECT = """
            select t.*, f.code as from_code, f.name as from_name, d.code as to_code, d.name as to_name
              from transfer t join bank_account f on f.id = t.from_account_id join bank_account d on d.id = t.to_account_id
            """;

    private final JdbcClient jdbc;

    JdbcTransferRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("TR%05d", jdbc.sql("select nextval('transfer_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Transfer t) {
        jdbc.sql("""
                insert into transfer (id, code, from_account_id, to_account_id, effective_date, amount_cents, notes, status, version,
                       created_at, created_by)
                values (:id, :code, :from, :to, :date, :cents, :notes, :status, :version, :at, :by)
                """)
                .param("id", t.id()).param("code", t.code()).param("from", t.fromAccountId()).param("to", t.toAccountId())
                .param("date", Date.valueOf(t.effectiveDate())).param("cents", t.amountCents()).param("notes", t.notes())
                .param("status", t.status().name()).param("version", t.version()).param("at", Timestamp.from(t.createdAt()))
                .param("by", t.createdBy())
                .update();
    }

    @Override
    public void reverse(Transfer t, long expectedVersion) {
        int n = jdbc.sql("""
                update transfer set status = :status, reversal_reason = :reason, reversal_date = :date, reversed_at = :at,
                       reversed_by = :by, version = :version
                 where id = :id and version = :expected
                """)
                .param("status", t.status().name()).param("reason", t.reversalReason()).param("date", Date.valueOf(t.reversalDate()))
                .param("at", Timestamp.from(t.reversedAt())).param("by", t.reversedBy()).param("version", t.version())
                .param("id", t.id()).param("expected", expectedVersion)
                .update();
        if (n != 1) throw new VersionConflictException("transfer", expectedVersion, t.version() - 1);
    }

    @Override
    public Optional<Summary> find(UUID id) {
        return jdbc.sql(SELECT + " where t.id = :id").param("id", id).query(JdbcTransferRepository::summary).optional();
    }

    @Override
    public Optional<Transfer> findForUpdate(UUID id) {
        return jdbc.sql("select * from transfer where id = :id for update").param("id", id).query(JdbcTransferRepository::transfer).optional();
    }

    @Override
    public List<Summary> list(UUID accountId, int limit) {
        return jdbc.sql(SELECT + """
                 where cast(:account as uuid) is null or t.from_account_id = cast(:account as uuid) or t.to_account_id = cast(:account as uuid)
                 order by t.effective_date desc, t.created_at desc limit :limit
                """)
                .param("account", accountId).param("limit", limit).query(JdbcTransferRepository::summary).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(transfer(rs, n), rs.getString("from_code"), rs.getString("from_name"), rs.getString("to_code"),
                rs.getString("to_name"));
    }

    private static Transfer transfer(ResultSet rs, int n) throws SQLException {
        Date reversal = rs.getDate("reversal_date");
        return new Transfer(rs.getObject("id", UUID.class), rs.getString("code"), rs.getObject("from_account_id", UUID.class),
                rs.getObject("to_account_id", UUID.class), rs.getDate("effective_date").toLocalDate(), rs.getLong("amount_cents"),
                rs.getString("notes"), Transfer.Status.valueOf(rs.getString("status")), rs.getString("reversal_reason"),
                reversal == null ? null : reversal.toLocalDate(), instant(rs, "reversed_at"), rs.getString("reversed_by"),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
