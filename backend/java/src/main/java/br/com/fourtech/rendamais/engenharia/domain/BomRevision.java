package br.com.fourtech.rendamais.engenharia.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Conteúdo da BOM (tabela {@code bom_revision}, uma linha por BOM desde a decisão do PO de 02/10/2026): as linhas, o
 * total informado da origem e as observações, editáveis a qualquer momento, com a versão para o If-Match. O histórico
 * fica na auditoria. Os campos de revisão e situação ficaram da primeira entrega da Sprint 10 e não mudam mais.
 */
public record BomRevision(UUID id, UUID bomId, int revision, Status status, UUID basedOnId, Long informedTotalCents, String notes,
                          UUID importId, Instant approvedAt, String approvedBy, long version, Instant createdAt, String createdBy,
                          Instant updatedAt, String updatedBy) {

    public enum Status { DRAFT, APPROVED, SUPERSEDED }

    public BomRevision {
        Objects.requireNonNull(id);
        Objects.requireNonNull(bomId);
        Objects.requireNonNull(status);
    }

    /** Conteúdo vazio de uma BOM nova. */
    public static BomRevision current(UUID bomId, Instant now, String actor) {
        return new BomRevision(UUID.randomUUID(), bomId, 0, Status.APPROVED, null, null, null, null, now, actor, 1, now, actor, now, actor);
    }

    public BomRevision edit(Long informedTotalCents, String notes, Instant now, String actor) {
        return new BomRevision(id, bomId, revision, status, basedOnId, informedTotalCents, notes, importId, approvedAt, approvedBy,
                version + 1, createdAt, createdBy, now, actor);
    }
}
