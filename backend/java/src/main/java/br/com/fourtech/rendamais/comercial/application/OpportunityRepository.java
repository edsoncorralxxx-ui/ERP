package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.domain.Opportunity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das oportunidades, das etapas do funil e do histórico de etapas (Sprint 11). */
public interface OpportunityRepository {

    /** Etapa do funil com o percentual de fechamento (configuração do SAP B1). */
    record Stage(String code, String name, int position, BigDecimal closePercent, long version, Instant updatedAt,
                 String updatedBy) { }

    /** Oportunidade com os nomes da prospecção e do cliente. */
    record Summary(Opportunity opportunity, String leadCode, String leadName, String customerCode, String customerName) { }

    /** Linha da aba Etapas: passagem por uma etapa com o percentual e os valores da data. */
    record StageChange(UUID id, UUID opportunityId, String fromStage, String toStage, Opportunity.Status status,
                       BigDecimal closePercent, long potentialCents, long weightedCents, Instant changedAt, String changedBy) { }

    /** Próximo número: OP00001. */
    String nextCode();

    void insert(Opportunity opportunity);

    boolean update(Opportunity opportunity, long expectedVersion);

    Optional<Summary> findById(UUID id);

    Optional<Opportunity> findByIdForUpdate(UUID id);

    List<Summary> list(String search, Opportunity.Status status, String stage, UUID leadId, UUID customerId, int limit);

    List<Opportunity> openForLead(UUID leadId);

    void insertStageChange(StageChange change);

    List<StageChange> stageChanges(UUID opportunityId);

    List<Stage> stages();

    Optional<Stage> stageForUpdate(String code);

    boolean updateStage(Stage stage, long expectedVersion);
}
