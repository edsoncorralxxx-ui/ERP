package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.domain.Lead;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das prospecções (Sprint 11). */
public interface LeadRepository {

    /** A prospecção com o cliente ligado e a contagem de oportunidades abertas. */
    record Summary(Lead lead, String customerCode, String customerName, int openOpportunities) { }

    /** Nome e cidade de uma prospecção já cadastrada, para os avisos de duplicidade da carga. */
    record NameRef(UUID id, String code, String companyName, String city, String state) { }

    /** Próximo número: PS00001. */
    String nextCode();

    void insert(Lead lead);

    boolean update(Lead lead, long expectedVersion);

    Optional<Summary> findById(UUID id);

    Optional<Lead> findByIdForUpdate(UUID id);

    List<Summary> list(String search, Lead.Stage stage, int limit);

    List<NameRef> names();
}
