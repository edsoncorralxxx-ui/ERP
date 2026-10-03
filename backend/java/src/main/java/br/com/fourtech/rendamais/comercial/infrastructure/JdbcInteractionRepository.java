package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.InteractionRepository;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Interaction;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcInteractionRepository implements InteractionRepository {

    private final JdbcClient jdbc;

    JdbcInteractionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(Interaction i) {
        jdbc.sql("""
                insert into crm_interaction (id, lead_id, opportunity_id, kind, occurred_on, contact_name, summary, next_action_date,
                       next_action_note, created_at, created_by)
                values (:id, :lead, :opp, :kind, :on, :contact, :summary, :nextDate, :nextNote, :at, :by)
                """)
                .param("id", i.id()).param("lead", i.leadId()).param("opp", i.opportunityId()).param("kind", i.kind().name())
                .param("on", date(i.occurredOn())).param("contact", i.contactName()).param("summary", i.summary())
                .param("nextDate", date(i.nextAction().date())).param("nextNote", i.nextAction().note())
                .param("at", ts(i.createdAt())).param("by", i.createdBy())
                .update();
    }

    @Override
    public List<Interaction> list(UUID leadId, UUID opportunityId) {
        return jdbc.sql("""
                select * from crm_interaction
                 where (cast(:lead as uuid) is not null and (lead_id = cast(:lead as uuid)
                            or opportunity_id in (select id from opportunity where lead_id = cast(:lead as uuid))))
                    or (cast(:opp as uuid) is not null and opportunity_id = cast(:opp as uuid))
                 order by occurred_on desc, created_at desc
                """)
                .param("lead", leadId).param("opp", opportunityId)
                .query((rs, n) -> new Interaction(rs.getObject("id", UUID.class), rs.getObject("lead_id", UUID.class),
                        rs.getObject("opportunity_id", UUID.class), Interaction.Kind.valueOf(rs.getString("kind")),
                        localDate(rs, "occurred_on"), rs.getString("contact_name"), rs.getString("summary"),
                        new Crm.NextAction(localDate(rs, "next_action_date"), rs.getString("next_action_note")),
                        instant(rs, "created_at"), rs.getString("created_by"))).list();
    }
}
