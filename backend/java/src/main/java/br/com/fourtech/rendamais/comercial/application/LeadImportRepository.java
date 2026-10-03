package br.com.fourtech.rendamais.comercial.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das cargas da lista de prospecção (Sprint 11). */
public interface LeadImportRepository {

    record LeadImport(UUID id, String fileName, String hash, String content, String status, Instant createdAt, String createdBy,
                      Instant confirmedAt, String confirmedBy) { }

    void insert(LeadImport i);

    Optional<LeadImport> findByHash(String hash);

    Optional<LeadImport> find(UUID id);

    Optional<LeadImport> findForUpdate(UUID id);

    void confirm(UUID id, Instant at, String by);

    /** Códigos das prospecções criadas pela carga, na ordem do arquivo. */
    java.util.List<String> createdCodes(UUID id);
}
