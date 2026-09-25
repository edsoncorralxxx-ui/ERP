package br.com.fourtech.rendamais.auditoria.api;

import java.util.Map;
import java.util.Objects;

/**
 * Registro de auditoria. {@code changes} mapeia campo → [valor anterior, valor novo].
 * Não deve conter senhas, tokens ou conteúdo sensível desnecessário.
 */
public record AuditEntry(String actor, String action, String entityType, String entityId, long entityVersion,
                         String reason, Map<String, Change> changes, String correlationId) {

    public AuditEntry {
        Objects.requireNonNull(actor);
        Objects.requireNonNull(action);
        Objects.requireNonNull(entityType);
        Objects.requireNonNull(entityId);
        changes = Map.copyOf(changes);
    }

    public record Change(String before, String after) { }
}
