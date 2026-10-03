package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.CrmQueryRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcCrmQueryRepository implements CrmQueryRepository {

    private final JdbcClient jdbc;

    JdbcCrmQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<AgendaRow> agenda(String owner) {
        return jdbc.sql("""
                select 'PROSPECCAO' as kind, l.id, l.code, l.company_name as name,
                       concat_ws(' / ', l.city, l.state) as party, l.owner, l.stage, l.next_action_date, l.next_action_note
                  from lead l
                 where l.stage <> 'DESCARTADO' and l.next_action_date is not null
                   and (cast(:owner as varchar) is null or l.owner = cast(:owner as varchar))
                union all
                select 'OPORTUNIDADE', o.id, o.code, o.name, coalesce(p.legal_name, l.company_name), o.owner, o.stage,
                       o.next_action_date, o.next_action_note
                  from opportunity o left join partner p on p.id = o.customer_id left join lead l on l.id = o.lead_id
                 where o.status = 'ABERTA'
                   and (cast(:owner as varchar) is null or o.owner = cast(:owner as varchar))
                 order by next_action_date nulls first, code
                """)
                .param("owner", owner)
                .query((rs, n) -> new AgendaRow(rs.getString("kind"), rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getString("name"), rs.getString("party"), rs.getString("owner"), rs.getString("stage"),
                        localDate(rs, "next_action_date"), rs.getString("next_action_note"))).list();
    }

    @Override
    public List<OpenRow> open(String owner) {
        return jdbc.sql("""
                select id, stage, potential_cents from opportunity
                 where status = 'ABERTA' and (cast(:owner as varchar) is null or owner = cast(:owner as varchar))
                """)
                .param("owner", owner)
                .query((rs, n) -> new OpenRow(rs.getObject("id", UUID.class), rs.getString("stage"), rs.getLong("potential_cents")))
                .list();
    }

    @Override
    public List<ClosedRow> closed(Instant from, Instant to, String owner) {
        return jdbc.sql("""
                select id, status, potential_cents, closed_at, loss_reason from opportunity
                 where status <> 'ABERTA' and closed_at >= :from and closed_at < :to
                   and (cast(:owner as varchar) is null or owner = cast(:owner as varchar))
                """)
                .param("from", ts(from)).param("to", ts(to)).param("owner", owner)
                .query((rs, n) -> new ClosedRow(rs.getObject("id", UUID.class), rs.getString("status"), rs.getLong("potential_cents"),
                        instant(rs, "closed_at"), rs.getString("loss_reason"))).list();
    }

    @Override
    public List<Passage> passages(String owner) {
        return jdbc.sql("""
                select c.opportunity_id, c.to_stage, c.status, c.changed_at
                  from opportunity_stage_change c join opportunity o on o.id = c.opportunity_id
                 where (cast(:owner as varchar) is null or o.owner = cast(:owner as varchar))
                 order by c.opportunity_id, c.changed_at, c.id
                """)
                .param("owner", owner)
                .query((rs, n) -> new Passage(rs.getObject("opportunity_id", UUID.class), rs.getString("to_stage"),
                        rs.getString("status"), instant(rs, "changed_at"))).list();
    }
}
