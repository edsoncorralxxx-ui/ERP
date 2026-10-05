package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.LeadRepository;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcLeadRepository implements LeadRepository {

    private static final String SELECT = """
            select l.*, p.code as partner_code, p.legal_name as partner_name,
                   (select count(*) from opportunity o where o.lead_id = l.id and o.status = 'ABERTA') as open_opportunities
              from lead l left join partner p on p.id = l.partner_id
            """;

    private final JdbcClient jdbc;

    JdbcLeadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("L-%04d", jdbc.sql("select nextval('lead_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Lead l) {
        jdbc.sql("""
                insert into lead (id, code, company_name, trade_name, city, state, has_renda, rating, stage, discard_reason, owner,
                       source, contact_name, contact_phone, contact_email, notes, partner_id, next_action_date, next_action_note,
                       last_interaction, import_id, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :company, :trade, :city, :state, :renda, :rating, :stage, :reason, :owner, :source, :contact,
                        :phone, :email, :notes, :partner, :nextDate, :nextNote, :last, :import, :version, :createdAt, :createdBy,
                        :updatedAt, :updatedBy)
                """)
                .params(params(l)).param("code", l.code()).param("import", l.importId())
                .param("createdAt", ts(l.createdAt())).param("createdBy", l.createdBy())
                .update();
    }

    @Override
    public boolean update(Lead l, long expectedVersion) {
        return jdbc.sql("""
                update lead set company_name = :company, trade_name = :trade, city = :city, state = :state, has_renda = :renda,
                       rating = :rating, stage = :stage, discard_reason = :reason, owner = :owner, source = :source,
                       contact_name = :contact, contact_phone = :phone, contact_email = :email, notes = :notes,
                       partner_id = :partner, next_action_date = :nextDate, next_action_note = :nextNote,
                       last_interaction = :last, version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .params(params(l)).param("expected", expectedVersion)
                .update() == 1;
    }

    private static java.util.Map<String, Object> params(Lead l) {
        java.util.Map<String, Object> m = new java.util.HashMap<>();
        m.put("id", l.id());
        m.put("company", l.companyName());
        m.put("trade", l.tradeName());
        m.put("city", l.city());
        m.put("state", l.state());
        m.put("renda", l.hasRenda().name());
        m.put("rating", l.rating());
        m.put("stage", l.stage().name());
        m.put("reason", l.discardReason());
        m.put("owner", l.owner());
        m.put("source", l.source().name());
        m.put("contact", l.contactName());
        m.put("phone", l.contactPhone());
        m.put("email", l.contactEmail());
        m.put("notes", l.notes());
        m.put("partner", l.partnerId());
        m.put("nextDate", date(l.nextAction().date()));
        m.put("nextNote", l.nextAction().note());
        m.put("last", date(l.lastInteraction()));
        m.put("version", l.version());
        m.put("updatedAt", ts(l.updatedAt()));
        m.put("updatedBy", l.updatedBy());
        return m;
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where l.id = :id").param("id", id).query(this::summary).optional();
    }

    @Override
    public Optional<Lead> findByIdForUpdate(UUID id) {
        return jdbc.sql("select * from lead where id = :id for update").param("id", id).query(JdbcLeadRepository::lead).optional();
    }

    @Override
    public List<Summary> list(String search, Lead.Stage stage, int limit) {
        return jdbc.sql(SELECT + """
                 where (cast(:stage as varchar) is null or l.stage = cast(:stage as varchar))
                   and (cast(:term as varchar) is null
                        or l.code ilike '%' || cast(:term as varchar) || '%'
                        or l.company_name ilike '%' || cast(:term as varchar) || '%'
                        or l.trade_name ilike '%' || cast(:term as varchar) || '%'
                        or l.city ilike '%' || cast(:term as varchar) || '%'
                        or l.contact_name ilike '%' || cast(:term as varchar) || '%')
                 order by l.code desc limit :limit
                """)
                .param("stage", stage == null ? null : stage.name()).param("term", search).param("limit", limit)
                .query(this::summary).list();
    }

    @Override
    public List<NameRef> names() {
        return jdbc.sql("select id, code, company_name, city, state from lead order by code")
                .query((rs, n) -> new NameRef(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("company_name"),
                        rs.getString("city"), rs.getString("state"))).list();
    }

    private Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(lead(rs, n), rs.getString("partner_code"), rs.getString("partner_name"), rs.getInt("open_opportunities"));
    }

    static Lead lead(ResultSet rs, int n) throws SQLException {
        int rating = rs.getInt("rating");
        Integer r = rs.wasNull() ? null : rating;
        return new Lead(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("company_name"),
                rs.getString("trade_name"), rs.getString("city"), rs.getString("state"),
                Lead.HasRenda.valueOf(rs.getString("has_renda")), r, Lead.Stage.valueOf(rs.getString("stage")),
                rs.getString("discard_reason"), rs.getString("owner"), Crm.Source.valueOf(rs.getString("source")),
                rs.getString("contact_name"), rs.getString("contact_phone"), rs.getString("contact_email"), rs.getString("notes"),
                rs.getObject("partner_id", UUID.class),
                new Crm.NextAction(localDate(rs, "next_action_date"), rs.getString("next_action_note")),
                localDate(rs, "last_interaction"), rs.getObject("import_id", UUID.class), rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }
}
