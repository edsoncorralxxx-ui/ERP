package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.OpportunityRepository;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Opportunity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcOpportunityRepository implements OpportunityRepository {

    private static final String SELECT = """
            select o.*, l.code as lead_code, l.company_name as lead_name, p.code as partner_code, p.legal_name as partner_name
              from opportunity o left join lead l on l.id = o.lead_id left join partner p on p.id = o.customer_id
            """;

    private final JdbcClient jdbc;

    JdbcOpportunityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("OP-%06d", jdbc.sql("select nextval('opportunity_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Opportunity o) {
        jdbc.sql("""
                insert into opportunity (id, code, name, lead_id, customer_id, unit_id, unit_name, owner, source, interest,
                       potential_cents, expected_close, stage, status, loss_reason, loss_note, closed_at, won_order_code,
                       next_action_date, next_action_note, last_interaction, notes, version, created_at, created_by, updated_at,
                       updated_by)
                values (:id, :code, :name, :lead, :customer, :unit, :unitName, :owner, :source, :interest, :potential, :expectedClose,
                        :stage, :status, :reason, :note, :closed, :order, :nextDate, :nextNote, :last, :notes, :version,
                        :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .params(params(o)).param("code", o.code()).param("createdAt", ts(o.createdAt())).param("createdBy", o.createdBy())
                .update();
        writeCompetitors(o);
    }

    @Override
    public boolean update(Opportunity o, long expectedVersion) {
        int rows = jdbc.sql("""
                update opportunity set name = :name, lead_id = :lead, customer_id = :customer, unit_id = :unit,
                       unit_name = :unitName, owner = :owner, source = :source, interest = :interest, potential_cents = :potential,
                       expected_close = :expectedClose, stage = :stage, status = :status, loss_reason = :reason, loss_note = :note,
                       closed_at = :closed, won_order_code = :order, next_action_date = :nextDate, next_action_note = :nextNote,
                       last_interaction = :last, notes = :notes, version = :version, updated_at = :updatedAt,
                       updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .params(params(o)).param("expected", expectedVersion)
                .update();
        if (rows != 1) return false;
        jdbc.sql("delete from opportunity_competitor where opportunity_id = :id").param("id", o.id()).update();
        writeCompetitors(o);
        return true;
    }

    private void writeCompetitors(Opportunity o) {
        for (int i = 0; i < o.competitors().size(); i++) {
            Opportunity.Competitor c = o.competitors().get(i);
            jdbc.sql("insert into opportunity_competitor (opportunity_id, position, name, threat, notes) values (:o, :p, :n, :t, :x)")
                    .param("o", o.id()).param("p", i + 1).param("n", c.name()).param("t", c.threat().name()).param("x", c.notes())
                    .update();
        }
    }

    private static Map<String, Object> params(Opportunity o) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", o.id());
        m.put("name", o.name());
        m.put("lead", o.leadId());
        m.put("customer", o.customerId());
        m.put("unit", o.unitId());
        m.put("unitName", o.unitName());
        m.put("owner", o.owner());
        m.put("source", o.source().name());
        m.put("interest", o.interest().name());
        m.put("potential", o.potentialCents());
        m.put("expectedClose", date(o.expectedClose()));
        m.put("stage", o.stage());
        m.put("status", o.status().name());
        m.put("reason", o.lossReason() == null ? null : o.lossReason().name());
        m.put("note", o.lossNote());
        m.put("closed", ts(o.closedAt()));
        m.put("order", o.wonOrderCode());
        m.put("nextDate", date(o.nextAction().date()));
        m.put("nextNote", o.nextAction().note());
        m.put("last", date(o.lastInteraction()));
        m.put("notes", o.notes());
        m.put("version", o.version());
        m.put("updatedAt", ts(o.updatedAt()));
        m.put("updatedBy", o.updatedBy());
        return m;
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where o.id = :id").param("id", id).query(this::summary).optional();
    }

    @Override
    public Optional<Opportunity> findByIdForUpdate(UUID id) {
        return jdbc.sql("select * from opportunity where id = :id for update").param("id", id).query(this::opportunity).optional();
    }

    @Override
    public List<Summary> list(String search, Opportunity.Status status, String stage, UUID leadId, UUID customerId, int limit) {
        return jdbc.sql(SELECT + """
                 where (cast(:status as varchar) is null or o.status = cast(:status as varchar))
                   and (cast(:stage as varchar) is null or o.stage = cast(:stage as varchar))
                   and (cast(:lead as uuid) is null or o.lead_id = cast(:lead as uuid))
                   and (cast(:customer as uuid) is null or o.customer_id = cast(:customer as uuid))
                   and (cast(:term as varchar) is null
                        or o.code ilike '%' || cast(:term as varchar) || '%'
                        or o.name ilike '%' || cast(:term as varchar) || '%'
                        or l.company_name ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%')
                 order by o.code desc limit :limit
                """)
                .param("status", status == null ? null : status.name()).param("stage", stage).param("lead", leadId)
                .param("customer", customerId).param("term", search).param("limit", limit)
                .query(this::summary).list();
    }

    @Override
    public List<Opportunity> openForLead(UUID leadId) {
        return jdbc.sql("select * from opportunity where lead_id = :l order by code for update").param("l", leadId)
                .query(this::opportunity).list();
    }

    @Override
    public void insertStageChange(StageChange c) {
        jdbc.sql("""
                insert into opportunity_stage_change (id, opportunity_id, from_stage, to_stage, status, close_percent,
                       potential_cents, weighted_cents, changed_at, changed_by, note)
                values (:id, :o, :from, :to, :status, :pct, :potential, :weighted, :at, :by, :note)
                """)
                .param("id", c.id()).param("o", c.opportunityId()).param("from", c.fromStage()).param("to", c.toStage())
                .param("status", c.status().name()).param("pct", c.closePercent()).param("potential", c.potentialCents())
                .param("weighted", c.weightedCents()).param("at", ts(c.changedAt())).param("by", c.changedBy())
                .param("note", c.note()).update();
    }

    @Override
    public List<StageChange> stageChanges(UUID opportunityId) {
        return jdbc.sql("select * from opportunity_stage_change where opportunity_id = :o order by changed_at, id")
                .param("o", opportunityId)
                .query((rs, n) -> new StageChange(rs.getObject("id", UUID.class), rs.getObject("opportunity_id", UUID.class),
                        rs.getString("from_stage"), rs.getString("to_stage"), Opportunity.Status.valueOf(rs.getString("status")),
                        rs.getBigDecimal("close_percent"), rs.getLong("potential_cents"), rs.getLong("weighted_cents"),
                        instant(rs, "changed_at"), rs.getString("changed_by"), rs.getString("note"))).list();
    }

    @Override
    public List<Stage> stages() {
        return jdbc.sql("select * from opportunity_stage order by position").query(JdbcOpportunityRepository::stage).list();
    }

    @Override
    public Optional<Stage> stageForUpdate(String code) {
        return jdbc.sql("select * from opportunity_stage where code = :c for update").param("c", code)
                .query(JdbcOpportunityRepository::stage).optional();
    }

    @Override
    public boolean updateStage(Stage s, long expectedVersion) {
        return jdbc.sql("""
                update opportunity_stage set name = :name, close_percent = :pct, version = :version, updated_at = :at,
                       updated_by = :by
                 where code = :code and version = :expected
                """)
                .param("name", s.name()).param("pct", s.closePercent()).param("version", s.version())
                .param("at", ts(s.updatedAt())).param("by", s.updatedBy()).param("code", s.code())
                .param("expected", expectedVersion).update() == 1;
    }

    private static Stage stage(ResultSet rs, int n) throws SQLException {
        return new Stage(rs.getString("code"), rs.getString("name"), rs.getInt("position"), rs.getBigDecimal("close_percent"),
                rs.getLong("version"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(opportunity(rs, n), rs.getString("lead_code"), rs.getString("lead_name"), rs.getString("partner_code"),
                rs.getString("partner_name"));
    }

    private Opportunity opportunity(ResultSet rs, int n) throws SQLException {
        UUID id = rs.getObject("id", UUID.class);
        List<Opportunity.Competitor> competitors = jdbc.sql(
                        "select * from opportunity_competitor where opportunity_id = :o order by position").param("o", id)
                .query((r, k) -> new Opportunity.Competitor(r.getString("name"), Opportunity.Threat.valueOf(r.getString("threat")),
                        r.getString("notes"))).list();
        String reason = rs.getString("loss_reason");
        return new Opportunity(id, rs.getString("code"), rs.getString("name"), rs.getObject("lead_id", UUID.class),
                rs.getObject("customer_id", UUID.class), rs.getObject("unit_id", UUID.class), rs.getString("unit_name"),
                rs.getString("owner"), Crm.Source.valueOf(rs.getString("source")),
                Opportunity.Interest.valueOf(rs.getString("interest")), rs.getLong("potential_cents"),
                localDate(rs, "expected_close"), rs.getString("stage"), Opportunity.Status.valueOf(rs.getString("status")),
                reason == null ? null : Opportunity.LossReason.valueOf(reason), rs.getString("loss_note"),
                instant(rs, "closed_at"), rs.getString("won_order_code"),
                new Crm.NextAction(localDate(rs, "next_action_date"), rs.getString("next_action_note")),
                localDate(rs, "last_interaction"), rs.getString("notes"), competitors, rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }
}
