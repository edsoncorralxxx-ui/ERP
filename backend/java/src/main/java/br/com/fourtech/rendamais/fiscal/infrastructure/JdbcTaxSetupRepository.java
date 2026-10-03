package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.TaxSetupRepository;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
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
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

@Repository
class JdbcTaxSetupRepository implements TaxSetupRepository {

    private final JdbcClient jdbc;

    JdbcTaxSetupRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Profile profile() {
        return jdbc.sql("select * from tax_company_profile where id = 1").query((rs, n) -> new Profile(rs.getString("regime"),
                date(rs, "opted_since"), rs.getString("cnae_main"), rs.getString("cnae_secondary"), rs.getString("revenue_recognition"),
                rs.getString("nfse_issuer"), rs.getLong("annual_limit_cents"), rs.getLong("sublimit_cents"), rs.getBigDecimal("tolerance"),
                rs.getBigDecimal("alert_threshold"), rs.getLong("version"), instant(rs, "updated_at"), rs.getString("updated_by")))
                .single();
    }

    @Override
    public void updateProfile(Profile p, long expectedVersion) {
        int n = jdbc.sql("""
                update tax_company_profile set opted_since = :since, cnae_main = :main, cnae_secondary = :sec, nfse_issuer = :nfse,
                       annual_limit_cents = :limit, sublimit_cents = :sub, tolerance = :tol, alert_threshold = :alert,
                       version = :version, updated_at = :at, updated_by = :by
                 where id = 1 and version = :expected
                """)
                .param("since", p.optedSince() == null ? null : Date.valueOf(p.optedSince())).param("main", p.cnaeMain())
                .param("sec", p.cnaeSecondary()).param("nfse", p.nfseIssuer()).param("limit", p.annualLimitCents())
                .param("sub", p.sublimitCents()).param("tol", p.tolerance()).param("alert", p.alertThreshold())
                .param("version", p.version()).param("at", ts(p.updatedAt())).param("by", p.updatedBy()).param("expected", expectedVersion)
                .update();
        if (n != 1) throw new VersionConflictException("tax_company_profile", expectedVersion, p.version() - 1);
    }

    @Override
    public List<Activity> activities() {
        return jdbc.sql("select * from tax_activity order by position, name").query(JdbcTaxSetupRepository::activity).list();
    }

    @Override
    public Optional<Activity> activity(UUID id) {
        return jdbc.sql("select * from tax_activity where id = :id for update").param("id", id).query(JdbcTaxSetupRepository::activity)
                .optional();
    }

    @Override
    public void insertActivity(Activity a) {
        jdbc.sql("""
                insert into tax_activity (id, position, name, framing, annex, taxes, status, version, created_at, created_by)
                values (:id, :pos, :name, :framing, :annex, :taxes, :status, :version, :at, :by)
                """)
                .param("id", a.id()).param("pos", a.position()).param("name", a.name()).param("framing", a.framing())
                .param("annex", a.annex()).param("taxes", a.taxes()).param("status", a.status()).param("version", a.version())
                .param("at", ts(a.createdAt())).param("by", a.createdBy()).update();
    }

    @Override
    public void updateActivity(Activity a, long expectedVersion) {
        int n = jdbc.sql("""
                update tax_activity set name = :name, framing = :framing, annex = :annex, taxes = :taxes, status = :status,
                       version = :version, updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """)
                .param("name", a.name()).param("framing", a.framing()).param("annex", a.annex()).param("taxes", a.taxes())
                .param("status", a.status()).param("version", a.version()).param("at", ts(a.updatedAt())).param("by", a.updatedBy())
                .param("id", a.id()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("tax_activity", expectedVersion, a.version() - 1);
    }

    @Override
    public List<IbsCbsOption> ibsCbsOptions() {
        return jdbc.sql("select * from tax_ibs_cbs_option order by created_at desc")
                .query((rs, n) -> new IbsCbsOption(rs.getObject("id", UUID.class), rs.getString("period"), rs.getString("choice"),
                        date(rs, "deadline"), date(rs, "withdrawal_until"), rs.getString("notes"), instant(rs, "created_at"),
                        rs.getString("created_by")))
                .list();
    }

    @Override
    public void insertIbsCbsOption(IbsCbsOption o) {
        jdbc.sql("""
                insert into tax_ibs_cbs_option (id, period, choice, deadline, withdrawal_until, notes, created_at, created_by)
                values (:id, :period, :choice, :deadline, :until, :notes, :at, :by)
                """)
                .param("id", o.id()).param("period", o.period()).param("choice", o.choice()).param("deadline", Date.valueOf(o.deadline()))
                .param("until", Date.valueOf(o.withdrawalUntil())).param("notes", o.notes()).param("at", ts(o.createdAt()))
                .param("by", o.createdBy()).update();
    }

    @Override
    public Map<YearMonth, History> history(YearMonth from, YearMonth to) {
        Map<YearMonth, History> out = new TreeMap<>();
        jdbc.sql("select * from tax_revenue_history where competence between :f and :t").param("f", from.toString())
                .param("t", to.toString()).query(JdbcTaxSetupRepository::history).list().forEach(h -> out.put(h.competence(), h));
        return out;
    }

    @Override
    public Optional<History> historyForUpdate(YearMonth competence) {
        return jdbc.sql("select * from tax_revenue_history where competence = :c for update").param("c", competence.toString())
                .query(JdbcTaxSetupRepository::history).optional();
    }

    @Override
    public void insertHistory(History h) {
        jdbc.sql("""
                insert into tax_revenue_history (competence, annex1_cents, annex2_cents, annex3_cents, annex4_cents, annex5_cents, source,
                       informed_by, notes, version, created_at, created_by)
                values (:c, :a1, :a2, :a3, :a4, :a5, :source, :iby, :notes, :version, :at, :by)
                """)
                .param("c", h.competence().toString()).param("a1", h.annexCents()[0]).param("a2", h.annexCents()[1])
                .param("a3", h.annexCents()[2]).param("a4", h.annexCents()[3]).param("a5", h.annexCents()[4]).param("source", h.source())
                .param("iby", h.informedBy()).param("notes", h.notes()).param("version", h.version()).param("at", ts(h.createdAt()))
                .param("by", h.createdBy()).update();
    }

    @Override
    public void updateHistory(History h, long expectedVersion) {
        int n = jdbc.sql("""
                update tax_revenue_history set annex1_cents = :a1, annex2_cents = :a2, annex3_cents = :a3, annex4_cents = :a4,
                       annex5_cents = :a5, source = :source, informed_by = :iby, notes = :notes, version = :version, updated_at = :at,
                       updated_by = :by
                 where competence = :c and version = :expected
                """)
                .param("c", h.competence().toString()).param("a1", h.annexCents()[0]).param("a2", h.annexCents()[1])
                .param("a3", h.annexCents()[2]).param("a4", h.annexCents()[3]).param("a5", h.annexCents()[4]).param("source", h.source())
                .param("iby", h.informedBy()).param("notes", h.notes()).param("version", h.version()).param("at", ts(h.updatedAt()))
                .param("by", h.updatedBy()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("tax_revenue_history", expectedVersion, h.version() - 1);
    }

    @Override
    public boolean importExists(String hash) {
        return jdbc.sql("select exists(select 1 from tax_revenue_import where file_hash = :h)").param("h", hash).query(Boolean.class).single();
    }

    @Override
    public void insertImport(UUID id, String hash, String fileName, int months, Instant at, String by) {
        jdbc.sql("""
                insert into tax_revenue_import (id, file_hash, file_name, months, created_at, created_by)
                values (:id, :h, :name, :months, :at, :by)
                """)
                .param("id", id).param("h", hash).param("name", fileName).param("months", months).param("at", ts(at)).param("by", by).update();
    }

    private static Activity activity(ResultSet rs, int n) throws SQLException {
        return new Activity(rs.getObject("id", UUID.class), rs.getInt("position"), rs.getString("name"), rs.getString("framing"),
                rs.getString("annex"), rs.getString("taxes"), rs.getString("status"), rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static History history(ResultSet rs, int n) throws SQLException {
        return new History(YearMonth.parse(rs.getString("competence")), new long[]{rs.getLong("annex1_cents"), rs.getLong("annex2_cents"),
                rs.getLong("annex3_cents"), rs.getLong("annex4_cents"), rs.getLong("annex5_cents")}, rs.getString("source"),
                rs.getString("informed_by"), rs.getString("notes"), rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    static LocalDate date(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
