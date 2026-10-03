package br.com.fourtech.rendamais.fiscal.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência do perfil fiscal dos itens. */
public interface ClassificationRepository {

    /** Perfil fiscal: CFOP interno e interestadual, CSOSN, origem, anexo (I a V ou INSUMO), atividade, NBS, retenção de ISS. */
    record Profile(UUID itemId, String cfopInternal, String cfopInterstate, String csosn, String origin, String annex, UUID activityId,
                   String nbs, String issRetention, boolean review, String reviewNote, long version, Instant createdAt, String createdBy,
                   Instant updatedAt, String updatedBy) { }

    Map<UUID, Profile> all();

    Optional<Profile> find(UUID itemId);

    Optional<Profile> findForUpdate(UUID itemId);

    void insert(Profile p);

    void update(Profile p, long expectedVersion);
}
