package br.com.fourtech.rendamais.auditoria.infrastructure;

import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

@Component
class JdbcAuditTrail implements AuditTrail {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    JdbcAuditTrail(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AuditEntry e) {
        Map<String, Map<String, String>> changes = new TreeMap<>();
        e.changes().forEach((field, c) -> {
            Map<String, String> v = new LinkedHashMap<>();
            v.put("antes", c.before());
            v.put("depois", c.after());
            changes.put(field, v);
        });
        jdbc.sql("""
                insert into audit_event (actor, action, entity_type, entity_id, entity_version, reason, changes, correlation_id)
                values (:actor, :action, :entityType, :entityId, :entityVersion, :reason, cast(:changes as jsonb), :correlationId)
                """)
                .param("actor", e.actor())
                .param("action", e.action())
                .param("entityType", e.entityType())
                .param("entityId", e.entityId())
                .param("entityVersion", e.entityVersion())
                .param("reason", e.reason())
                .param("changes", json.writeValueAsString(changes))
                .param("correlationId", e.correlationId())
                .update();
    }
}
