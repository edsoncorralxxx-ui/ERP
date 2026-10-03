package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.domain.Interaction;

import java.util.List;
import java.util.UUID;

/** Porta de persistência das interações (Sprint 11). */
public interface InteractionRepository {

    void insert(Interaction interaction);

    /** As da prospecção (e das oportunidades dela) ou só as da oportunidade, da mais recente para a mais antiga. */
    List<Interaction> list(UUID leadId, UUID opportunityId);
}
