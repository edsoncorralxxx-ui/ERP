package br.com.fourtech.rendamais.engenharia.domain;

import br.com.fourtech.rendamais.kernel.InvalidStateException;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Revisão da BOM: nasce em rascunho, e depois de aprovada não muda mais. Quando outra revisão da mesma BOM é aprovada, a
 * anterior fica substituída — continua valendo para os equipamentos e as BOMs que já a usam.
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

    public static BomRevision draft(UUID bomId, int revision, UUID basedOnId, Long informedTotalCents, String notes, UUID importId,
                                    Instant now, String actor) {
        return new BomRevision(UUID.randomUUID(), bomId, revision, Status.DRAFT, basedOnId, informedTotalCents, notes, importId, null,
                null, 1, now, actor, now, actor);
    }

    /** Rótulo da revisão como na origem: 00, 01, 02… */
    public String label() {
        return label(revision);
    }

    public static String label(int revision) {
        return String.format("%02d", revision);
    }

    public BomRevision edit(Long informedTotalCents, String notes, Instant now, String actor) {
        requireDraft();
        return new BomRevision(id, bomId, revision, status, basedOnId, informedTotalCents, notes, importId, approvedAt, approvedBy,
                version + 1, createdAt, createdBy, now, actor);
    }

    public BomRevision approve(Instant now, String actor) {
        requireDraft();
        return new BomRevision(id, bomId, revision, Status.APPROVED, basedOnId, informedTotalCents, notes, importId, now, actor,
                version + 1, createdAt, createdBy, now, actor);
    }

    public BomRevision supersede(Instant now, String actor) {
        return new BomRevision(id, bomId, revision, Status.SUPERSEDED, basedOnId, informedTotalCents, notes, importId, approvedAt,
                approvedBy, version + 1, createdAt, createdBy, now, actor);
    }

    public void requireDraft() {
        if (status != Status.DRAFT) {
            throw new InvalidStateException("A revisão " + label() + " já foi aprovada e não muda mais. Crie uma revisão nova.");
        }
    }
}
