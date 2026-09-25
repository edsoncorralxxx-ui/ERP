package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.plataforma.web.PreconditionRequiredException;
import br.com.fourtech.rendamais.plataforma.web.Versions;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Peças comuns às APIs de cadastros: versão do If-Match, filtro de situação e linha do histórico. */
final class ApiSupport {

    private ApiSupport() { }

    /** Linha da aba Histórico: quando, quem, o que mudou (antes → depois) e o motivo. */
    record HistoryEntry(Instant occurredAt, String actor, String action, long version, String reason,
                        Map<String, Map<String, String>> changes) {
        static HistoryEntry of(AuditQuery.AuditRecord r) {
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

    record DeactivateRequest(String reason) { }

    /** Versão lida pelo cliente; sem If-Match a alteração é recusada com 428. */
    static long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new PreconditionRequiredException();
        }
        return Versions.parse(ifMatch);
    }

    /** ATIVO (padrão), INATIVO ou TODOS (nulo). */
    static Partner.Status status(String raw) {
        return "TODOS".equalsIgnoreCase(raw) ? null : Partner.Status.valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
