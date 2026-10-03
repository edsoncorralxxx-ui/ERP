package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.TaxRepository;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcTaxRepository implements TaxRepository {

    private static final String SIMULATION = """
            select s.*, r.revision from tax_simulation s left join tax_parameter_revision r on r.id = s.parameter_revision_id
            """;

    private final JdbcClient jdbc;
    private final JsonMapper json;

    JdbcTaxRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<TaxParameters> parameters() {
        return jdbc.sql("select *, annexes::text as annexes_json from tax_parameter_revision order by revision desc")
                .query(this::parameters).list();
    }

    @Override
    public Optional<TaxParameters> parametersFor(YearMonth competence) {
        return jdbc.sql("""
                select *, annexes::text as annexes_json from tax_parameter_revision
                 where valid_from <= :c order by valid_from desc, revision desc limit 1
                """)
                .param("c", competence.toString()).query(this::parameters).optional();
    }

    @Override
    public int lockNextRevision() {
        jdbc.sql("lock table tax_parameter_revision in share row exclusive mode").update();
        return jdbc.sql("select coalesce(max(revision), 0) + 1 from tax_parameter_revision").query(Integer.class).single();
    }

    @Override
    public void insertParameters(TaxParameters p) {
        Map<String, Object> annexes = new LinkedHashMap<>();
        p.annexes().forEach((k, t) -> annexes.put(k.name(), Map.of("taxes", t.taxes(), "brackets", t.brackets().stream()
                .map(b -> Map.of("upToCents", Long.toString(b.upToCents()), "rate", b.rate().toPlainString(),
                        "deductionCents", Long.toString(b.deductionCents()), "shares", b.shares().stream().map(BigDecimal::toPlainString).toList()))
                .toList())));
        jdbc.sql("""
                insert into tax_parameter_revision (id, revision, regime, valid_from, annexes, source, notes, created_at, created_by)
                values (:id, :rev, :regime, :from, cast(:annexes as jsonb), :source, :notes, :at, :by)
                """)
                .param("id", p.id()).param("rev", p.revision()).param("regime", p.regime()).param("from", p.validFrom().toString())
                .param("annexes", json.writeValueAsString(annexes)).param("source", p.source()).param("notes", p.notes())
                .param("at", ts(p.createdAt())).param("by", p.createdBy()).update();
    }

    private TaxParameters parameters(ResultSet rs, int n) throws SQLException {
        JsonNode root = json.readTree(rs.getString("annexes_json"));
        Map<Annex, TaxParameters.AnnexTable> annexes = new EnumMap<>(Annex.class);
        for (Annex a : Annex.values()) {
            JsonNode t = root.get(a.name());
            if (t == null) continue;
            List<String> taxes = new ArrayList<>();
            t.get("taxes").forEach(x -> taxes.add(x.asString()));
            List<TaxParameters.Bracket> brackets = new ArrayList<>();
            t.get("brackets").forEach(b -> {
                List<BigDecimal> shares = new ArrayList<>();
                JsonNode sh = b.get("shares");
                if (sh != null) sh.forEach(x -> shares.add(new BigDecimal(x.asString())));
                brackets.add(new TaxParameters.Bracket(Long.parseLong(b.get("upToCents").asString()), new BigDecimal(b.get("rate").asString()),
                        Long.parseLong(b.get("deductionCents").asString()), shares));
            });
            annexes.put(a, new TaxParameters.AnnexTable(taxes, brackets));
        }
        return new TaxParameters(rs.getObject("id", UUID.class), rs.getInt("revision"), rs.getString("regime"),
                YearMonth.parse(rs.getString("valid_from")), annexes, rs.getString("source"), rs.getString("notes"),
                instant(rs, "created_at"), rs.getString("created_by"));
    }

    @Override
    public Optional<Period> find(YearMonth competence) {
        return jdbc.sql("select * from tax_period where competence = :c").param("c", competence.toString())
                .query(JdbcTaxRepository::period).optional();
    }

    @Override
    public List<Period> findBetween(YearMonth from, YearMonth to) {
        return jdbc.sql("select * from tax_period where competence between :f and :t order by competence")
                .param("f", from.toString()).param("t", to.toString()).query(JdbcTaxRepository::period).list();
    }

    @Override
    public List<YearMonth> closedCompetences() {
        return jdbc.sql("select competence from tax_period where status = 'ENCERRADA'").query((rs, n) -> YearMonth.parse(rs.getString(1))).list();
    }

    @Override
    public Period lockOrCreate(YearMonth competence, Instant at, String actor) {
        jdbc.sql("""
                insert into tax_period (id, competence, status, version, created_at, created_by)
                values (:id, :c, 'EM_APURACAO', 0, :at, :by) on conflict (competence) do nothing
                """)
                .param("id", UUID.randomUUID()).param("c", competence.toString()).param("at", ts(at)).param("by", actor).update();
        return jdbc.sql("select * from tax_period where competence = :c for update").param("c", competence.toString())
                .query(JdbcTaxRepository::period).single();
    }

    @Override
    public void update(Period p, long expectedVersion) {
        int n = jdbc.sql("""
                update tax_period set status = :status, informed_rbt12_cents = :rbt12, informed_by = :iby, informed_notes = :notes,
                       version = :version, updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """)
                .param("status", p.status()).param("rbt12", p.informedRbt12Cents()).param("iby", p.informedBy())
                .param("notes", p.informedNotes()).param("version", p.version()).param("at", ts(p.updatedAt()))
                .param("by", p.updatedBy()).param("id", p.id()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("tax_period", expectedVersion, p.version() - 1);
    }

    @Override
    public Optional<String> statusForShare(YearMonth competence) {
        return jdbc.sql("select status from tax_period where competence = :c for share").param("c", competence.toString())
                .query(String.class).optional();
    }

    @Override
    public List<Simulation> simulations(UUID periodId) {
        return jdbc.sql(SIMULATION + " where s.period_id = :p order by s.seq desc").param("p", periodId)
                .query(JdbcTaxRepository::simulation).list();
    }

    @Override
    public Map<UUID, Simulation> latestSimulations(List<UUID> periodIds) {
        Map<UUID, Simulation> out = new HashMap<>();
        if (periodIds.isEmpty()) return out;
        jdbc.sql(SIMULATION + """
                 where s.period_id in (:ids)
                   and s.seq = (select max(x.seq) from tax_simulation x where x.period_id = s.period_id)
                """)
                .param("ids", periodIds).query(JdbcTaxRepository::simulation).list().forEach(s -> out.put(s.periodId(), s));
        return out;
    }

    @Override
    public void insertSimulation(Simulation s) {
        jdbc.sql("""
                insert into tax_simulation (id, period_id, seq, result, parameter_revision_id, rbt12_cents, rbt12_origin,
                       product_revenue_cents, service_revenue_cents, product_tax_cents, service_tax_cents, total_tax_cents, annexes,
                       taxes, memory, created_at, created_by)
                values (:id, :p, :seq, :result, :rev, :rbt12, :origin, :pr, :sr, :pt, :st, :tt, cast(:annexes as jsonb),
                        cast(:taxes as jsonb), cast(:memory as jsonb), :at, :by)
                """)
                .param("id", s.id()).param("p", s.periodId()).param("seq", s.seq()).param("result", s.result())
                .param("rev", s.parameterRevisionId()).param("rbt12", s.rbt12Cents()).param("origin", s.rbt12Origin())
                .param("pr", s.productRevenueCents()).param("sr", s.serviceRevenueCents()).param("pt", s.productTaxCents())
                .param("st", s.serviceTaxCents()).param("tt", s.totalTaxCents()).param("annexes", s.annexes())
                .param("taxes", s.taxes()).param("memory", s.memory())
                .param("at", ts(s.createdAt())).param("by", s.createdBy()).update();
    }

    @Override
    public List<DasGuide> guides(UUID periodId) {
        return jdbc.sql("select * from tax_das_guide where period_id = :p order by seq desc").param("p", periodId)
                .query(JdbcTaxRepository::guide).list();
    }

    @Override
    public Map<UUID, DasGuide> latestGuides(List<UUID> periodIds) {
        Map<UUID, DasGuide> out = new HashMap<>();
        if (periodIds.isEmpty()) return out;
        jdbc.sql("""
                select * from tax_das_guide c where c.period_id in (:ids)
                   and c.seq = (select max(x.seq) from tax_das_guide x where x.period_id = c.period_id)
                """)
                .param("ids", periodIds).query(JdbcTaxRepository::guide).list().forEach(c -> out.put(c.periodId(), c));
        return out;
    }

    @Override
    public void insertGuide(DasGuide g) {
        jdbc.sql("""
                insert into tax_das_guide (id, period_id, seq, document_number, amount_cents, fine_cents, interest_cents, due_date, notes,
                       simulation_id, title_id, created_at, created_by)
                values (:id, :p, :seq, :number, :amount, :fine, :interest, :due, :notes, :sim, :title, :at, :by)
                """)
                .param("id", g.id()).param("p", g.periodId()).param("seq", g.seq()).param("number", g.documentNumber())
                .param("amount", g.principalCents()).param("fine", g.fineCents()).param("interest", g.interestCents())
                .param("due", Date.valueOf(g.dueDate())).param("notes", g.notes()).param("sim", g.simulationId())
                .param("title", g.titleId()).param("at", ts(g.createdAt())).param("by", g.createdBy()).update();
    }

    @Override
    public List<Declaration> declarations(UUID periodId) {
        return jdbc.sql("select * from tax_pgdas_declaration where period_id = :p order by seq desc").param("p", periodId)
                .query(JdbcTaxRepository::declaration).list();
    }

    @Override
    public Map<UUID, Declaration> latestDeclarations(List<UUID> periodIds) {
        Map<UUID, Declaration> out = new HashMap<>();
        if (periodIds.isEmpty()) return out;
        jdbc.sql("""
                select * from tax_pgdas_declaration c where c.period_id in (:ids)
                   and c.seq = (select max(x.seq) from tax_pgdas_declaration x where x.period_id = c.period_id)
                """)
                .param("ids", periodIds).query(JdbcTaxRepository::declaration).list().forEach(c -> out.put(c.periodId(), c));
        return out;
    }

    @Override
    public void insertDeclaration(Declaration d) {
        jdbc.sql("""
                insert into tax_pgdas_declaration (id, period_id, seq, transmitted_on, receipt_number, declared_revenue_cents, notes,
                       created_at, created_by)
                values (:id, :p, :seq, :on, :receipt, :revenue, :notes, :at, :by)
                """)
                .param("id", d.id()).param("p", d.periodId()).param("seq", d.seq()).param("on", Date.valueOf(d.transmittedOn()))
                .param("receipt", d.receiptNumber()).param("revenue", d.declaredRevenueCents()).param("notes", d.notes())
                .param("at", ts(d.createdAt())).param("by", d.createdBy()).update();
    }

    @Override
    public List<ClosingStep> closingSteps(UUID periodId) {
        return jdbc.sql("select * from tax_closing_step where period_id = :p").param("p", periodId)
                .query((rs, n) -> new ClosingStep(rs.getObject("period_id", UUID.class), rs.getString("step"), instant(rs, "done_at"),
                        rs.getString("done_by"), rs.getString("notes")))
                .list();
    }

    @Override
    public void insertClosingStep(ClosingStep s) {
        jdbc.sql("insert into tax_closing_step (period_id, step, done_at, done_by, notes) values (:p, :s, :at, :by, :notes)")
                .param("p", s.periodId()).param("s", s.step()).param("at", ts(s.doneAt())).param("by", s.doneBy())
                .param("notes", s.notes()).update();
    }

    @Override
    public void deleteClosingStep(UUID periodId, String step) {
        jdbc.sql("delete from tax_closing_step where period_id = :p and step = :s").param("p", periodId).param("s", step).update();
    }

    @Override
    public List<Closure> closures(UUID periodId) {
        return jdbc.sql("select * from tax_period_closure where period_id = :p order by occurred_at desc").param("p", periodId)
                .query((rs, n) -> new Closure(rs.getObject("id", UUID.class), rs.getObject("period_id", UUID.class), rs.getString("action"),
                        rs.getString("reason"), longOrNull(rs, "product_revenue_cents"), longOrNull(rs, "service_revenue_cents"),
                        rs.getObject("simulation_id", UUID.class), rs.getObject("confirmation_id", UUID.class), instant(rs, "occurred_at"),
                        rs.getString("actor")))
                .list();
    }

    @Override
    public void insertClosure(Closure c) {
        jdbc.sql("""
                insert into tax_period_closure (id, period_id, action, reason, product_revenue_cents, service_revenue_cents, simulation_id,
                       confirmation_id, occurred_at, actor)
                values (:id, :p, :action, :reason, :pr, :sr, :sim, :conf, :at, :by)
                """)
                .param("id", c.id()).param("p", c.periodId()).param("action", c.action()).param("reason", c.reason())
                .param("pr", c.productRevenueCents()).param("sr", c.serviceRevenueCents()).param("sim", c.simulationId())
                .param("conf", c.guideId()).param("at", ts(c.occurredAt())).param("by", c.actor()).update();
    }

    private static Period period(ResultSet rs, int n) throws SQLException {
        return new Period(rs.getObject("id", UUID.class), YearMonth.parse(rs.getString("competence")), rs.getString("status"),
                longOrNull(rs, "informed_rbt12_cents"), rs.getString("informed_by"), rs.getString("informed_notes"), rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static Simulation simulation(ResultSet rs, int n) throws SQLException {
        Long rev = longOrNull(rs, "revision");
        return new Simulation(rs.getObject("id", UUID.class), rs.getObject("period_id", UUID.class), rs.getInt("seq"), rs.getString("result"),
                rs.getObject("parameter_revision_id", UUID.class), rev == null ? null : rev.intValue(), longOrNull(rs, "rbt12_cents"),
                rs.getString("rbt12_origin"), rs.getLong("product_revenue_cents"), rs.getLong("service_revenue_cents"),
                longOrNull(rs, "product_tax_cents"), longOrNull(rs, "service_tax_cents"), longOrNull(rs, "total_tax_cents"),
                rs.getString("annexes"), rs.getString("taxes"), rs.getString("memory"), instant(rs, "created_at"), rs.getString("created_by"));
    }

    private static DasGuide guide(ResultSet rs, int n) throws SQLException {
        return new DasGuide(rs.getObject("id", UUID.class), rs.getObject("period_id", UUID.class), rs.getInt("seq"),
                rs.getString("document_number"), rs.getLong("amount_cents"), rs.getLong("fine_cents"), rs.getLong("interest_cents"),
                rs.getDate("due_date").toLocalDate(), rs.getString("notes"), rs.getObject("simulation_id", UUID.class),
                rs.getObject("title_id", UUID.class), instant(rs, "created_at"), rs.getString("created_by"));
    }

    private static Declaration declaration(ResultSet rs, int n) throws SQLException {
        return new Declaration(rs.getObject("id", UUID.class), rs.getObject("period_id", UUID.class), rs.getInt("seq"),
                rs.getDate("transmitted_on").toLocalDate(), rs.getString("receipt_number"), rs.getLong("declared_revenue_cents"),
                rs.getString("notes"), instant(rs, "created_at"), rs.getString("created_by"));
    }

    private static Long longOrNull(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
