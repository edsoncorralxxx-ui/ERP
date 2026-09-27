package br.com.fourtech.rendamais.plataforma.web;

import br.com.fourtech.rendamais.auditoria.api.AuditQuery;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Linha da aba Histórico nas APIs: quando, quem, a operação, o que mudou (antes → depois) e o motivo. */
public record HistoryEntry(Instant occurredAt, String actor, String action, long version, String reason,
                           Map<String, Map<String, String>> changes) {

    public static HistoryEntry of(AuditQuery.AuditRecord r) {
        Map<String, Map<String, String>> changes = new LinkedHashMap<>();
        r.changes().forEach((f, c) -> {
            Map<String, String> v = new LinkedHashMap<>();
            v.put("before", c.before());
            v.put("after", c.after());
            changes.put(f, v);
        });
        return new HistoryEntry(r.occurredAt(), r.actor(), r.action(), r.entityVersion(), r.reason(), changes);
    }
}
