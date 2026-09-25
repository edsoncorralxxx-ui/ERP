package br.com.fourtech.rendamais.plataforma.eventos;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Entrega os eventos pendentes da outbox aos consumidores, um evento por transação. Vários servidores podem rodar ao
 * mesmo tempo: cada um pega eventos diferentes ({@code skip locked}). Um consumidor que falha deixa o evento pendente
 * para a próxima rodada, sem afetar os outros eventos.
 */
@Component
public class OutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(OutboxDispatcher.class);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() { };

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final List<EventConsumer> consumers;
    private final TransactionTemplate tx;

    public OutboxDispatcher(JdbcClient jdbc, JsonMapper json, List<EventConsumer> consumers, PlatformTransactionManager tm) {
        this.jdbc = jdbc;
        this.json = json;
        this.consumers = consumers;
        this.tx = new TransactionTemplate(tm);
    }

    @Scheduled(fixedDelayString = "${renda.outbox.poll-ms:2000}", initialDelayString = "${renda.outbox.poll-ms:2000}")
    public void poll() {
        dispatchPending();
    }

    /** Entrega o que estiver pendente; devolve quantos eventos foram publicados. */
    public int dispatchPending() {
        int published = 0;
        while (true) {
            Boolean done = tx.execute(t -> {
                List<DomainEvent> batch = jdbc.sql("""
                        select id, event_type, aggregate_type, aggregate_id, payload::text, occurred_at, actor, correlation_id
                          from outbox_event where published_at is null
                         order by occurred_at limit 1 for update skip locked
                        """).query((rs, n) -> new DomainEvent(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getString(4), json.readValue(rs.getString(5), MAP), rs.getTimestamp(6).toInstant(), rs.getString(7),
                        rs.getString(8))).list();
                if (batch.isEmpty()) {
                    return true;
                }
                DomainEvent e = batch.getFirst();
                deliver(e);
                jdbc.sql("update outbox_event set published_at = now() where id = :id").param("id", e.id()).update();
                return false;
            });
            if (Boolean.TRUE.equals(done)) {
                return published;
            }
            published++;
        }
    }

    /**
     * Entrega um evento a cada consumidor interessado, registrando o consumo; entregar de novo não reprocessa.
     * Deve rodar dentro de uma transação.
     */
    public void deliver(DomainEvent e) {
        for (EventConsumer c : consumers) {
            if (!c.accepts(e.type())) {
                continue;
            }
            int first = jdbc.sql("insert into event_consumption (consumer, event_id) values (:c, :id) on conflict do nothing")
                    .param("c", c.name()).param("id", e.id()).update();
            if (first == 1) {
                c.handle(e);
            } else {
                log.debug("Evento {} já consumido por {}", e.id(), c.name());
            }
        }
    }
}
