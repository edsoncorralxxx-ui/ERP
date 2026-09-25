package br.com.fourtech.rendamais.plataforma.eventos;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;

/**
 * Consumidor que registra fatos operacionais (o que aconteceu, com qual registro, quando e por quem), base dos
 * indicadores do motor analítico. Um fato por evento.
 */
@Component
class OperationalFacts implements EventConsumer {

    private final JdbcClient jdbc;

    OperationalFacts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "fatos-operacionais";
    }

    @Override
    public boolean accepts(String eventType) {
        return true;
    }

    @Override
    public void handle(DomainEvent e) {
        jdbc.sql("""
                insert into operational_fact (event_id, fact_type, entity_type, entity_id, occurred_at, actor)
                values (:id, :type, :entityType, :entityId, :at, :actor)
                """)
                .param("id", e.id()).param("type", e.type()).param("entityType", e.aggregateType())
                .param("entityId", e.aggregateId()).param("at", Timestamp.from(e.occurredAt())).param("actor", e.actor())
                .update();
    }
}
