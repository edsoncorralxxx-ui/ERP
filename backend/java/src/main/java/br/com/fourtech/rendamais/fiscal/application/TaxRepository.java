package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Porta de persistência da apuração: parâmetros, competências, cálculos, transmissões do PGDAS-D, guias DAS, etapas do
 * fechamento e fechamentos.
 */
public interface TaxRepository {

    String EM_APURACAO = "EM_APURACAO";
    String ENCERRADA = "ENCERRADA";

    /** Competência: situação, RBT12 informado (reserva) e versão (0 = ainda sem alteração). */
    record Period(UUID id, YearMonth competence, String status, Long informedRbt12Cents, String informedBy, String informedNotes,
                  long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        public boolean closed() {
            return ENCERRADA.equals(status);
        }
    }

    /**
     * Cálculo preservado, com a revisão dos parâmetros, o resultado por anexo e por tributo (JSON) e a memória. Produto =
     * anexos I, II, IV e V; serviço = anexo III (as colunas da Sprint 7 continuam preenchidas).
     */
    record Simulation(UUID id, UUID periodId, int seq, String result, UUID parameterRevisionId, Integer parameterRevision,
                      Long rbt12Cents, String rbt12Origin, long productRevenueCents, long serviceRevenueCents, Long productTaxCents,
                      Long serviceTaxCents, Long totalTaxCents, String annexes, String taxes, String memory, Instant createdAt,
                      String createdBy) { }

    /** Guia DAS (o valor declarado no PGDAS-D); {@code titleId} é o título a pagar criado por ela (nulo quando o total é zero). */
    record DasGuide(UUID id, UUID periodId, int seq, String documentNumber, long principalCents, long fineCents, long interestCents,
                    LocalDate dueDate, String notes, UUID simulationId, UUID titleId, Instant createdAt, String createdBy) {
        public long totalCents() {
            return principalCents + fineCents + interestCents;
        }
    }

    /** Transmissão do PGDAS-D registrada. */
    record Declaration(UUID id, UUID periodId, int seq, LocalDate transmittedOn, String receiptNumber, long declaredRevenueCents,
                       String notes, Instant createdAt, String createdBy) { }

    /** Etapa do fechamento marcada à mão. */
    record ClosingStep(UUID periodId, String step, Instant doneAt, String doneBy, String notes) { }

    record Closure(UUID id, UUID periodId, String action, String reason, Long productRevenueCents, Long serviceRevenueCents,
                   UUID simulationId, UUID guideId, Instant occurredAt, String actor) { }

    /** Revisões, da mais recente para a mais antiga. */
    List<TaxParameters> parameters();

    /** Revisão vigente na competência: a de maior vigência até ela (e, na mesma vigência, a de maior número). */
    Optional<TaxParameters> parametersFor(YearMonth competence);

    /** Próximo número de revisão, com a tabela bloqueada contra outra revisão simultânea. */
    int lockNextRevision();

    void insertParameters(TaxParameters p);

    Optional<Period> find(YearMonth competence);

    List<Period> findBetween(YearMonth from, YearMonth to);

    /** Competências encerradas. */
    List<YearMonth> closedCompetences();

    /** Competência bloqueada para alteração; criada (em apuração, versão 0) se ainda não existir. */
    Period lockOrCreate(YearMonth competence, Instant at, String actor);

    /** Grava situação, RBT12 informado e versão; confere a versão lida. */
    void update(Period p, long expectedVersion);

    /**
     * Situação da competência com bloqueio compartilhado até o fim da transação (a nota que consulta segura o
     * encerramento simultâneo); vazio se a competência nunca foi usada no fiscal (em apuração).
     */
    Optional<String> statusForShare(YearMonth competence);

    /** Cálculos da competência, do mais recente para o mais antigo. */
    List<Simulation> simulations(UUID periodId);

    Map<UUID, Simulation> latestSimulations(List<UUID> periodIds);

    void insertSimulation(Simulation s);

    /** Guias da competência, da mais recente para a mais antiga. */
    List<DasGuide> guides(UUID periodId);

    Map<UUID, DasGuide> latestGuides(List<UUID> periodIds);

    void insertGuide(DasGuide g);

    /** Transmissões da competência, da mais recente para a mais antiga. */
    List<Declaration> declarations(UUID periodId);

    Map<UUID, Declaration> latestDeclarations(List<UUID> periodIds);

    void insertDeclaration(Declaration d);

    List<ClosingStep> closingSteps(UUID periodId);

    void insertClosingStep(ClosingStep s);

    void deleteClosingStep(UUID periodId, String step);

    /** Fechamentos e reaberturas, do mais recente para o mais antigo. */
    List<Closure> closures(UUID periodId);

    void insertClosure(Closure c);
}
