package br.com.fourtech.rendamais.auditoria.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Porta pública de leitura da trilha: histórico de um registro, do mais recente ao mais antigo. */
public interface AuditQuery {

    record AuditRecord(Instant occurredAt, String actor, String action, long entityVersion, String reason,
                       Map<String, AuditEntry.Change> changes, String correlationId) { }

    List<AuditRecord> history(String entityType, String entityId);
}
