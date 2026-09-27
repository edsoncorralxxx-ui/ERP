package br.com.fourtech.rendamais.plataforma.eventos;

import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;

/** Outbox (US-206): o evento é gravado na mesma transação da operação; se a operação desfaz, o evento some junto. */
@Component
public class Outbox {

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final Clock clock;

    public Outbox(JdbcClient jdbc, JsonMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID append(String type, String aggregateType, String aggregateId, Map<String, ?> payload, String actor) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into outbox_event (id, event_type, aggregate_type, aggregate_id, payload, occurred_at, actor, correlation_id)
                values (:id, :type, :aggType, :aggId, cast(:payload as jsonb), :at, :actor, :corr)
                """)
                .param("id", id).param("type", type).param("aggType", aggregateType).param("aggId", aggregateId)
                .param("payload", json.writeValueAsString(payload)).param("at", Timestamp.from(clock.instant()))
                .param("actor", actor).param("corr", CorrelationId.current())
                .update();
        return id;
    }
}
