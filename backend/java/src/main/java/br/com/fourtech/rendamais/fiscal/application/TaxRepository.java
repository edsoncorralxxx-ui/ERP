package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência do fiscal: parâmetros, competências, simulações, conferências e fechamentos. */
public interface TaxRepository {

    /** Competência: situação, RBT12 informado e versão (0 = ainda sem alteração). */
    record Period(UUID id, YearMonth competence, String status, Long informedRbt12Cents, String informedBy, String informedNotes,
                  long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        public boolean closed() {
            return "FECHADA".equals(status);
        }
    }

    /** Simulação preservada, com a revisão dos parâmetros usada e a memória do cálculo (JSON). */
    record Simulation(UUID id, UUID periodId, int seq, String result, UUID parameterRevisionId, Integer parameterRevision,
                      Long rbt12Cents, String rbt12Origin, long productRevenueCents, long serviceRevenueCents, Long productTaxCents,
                      Long serviceTaxCents, Long totalTaxCents, String memory, Instant createdAt, String createdBy) { }

    /** Conferência do contador; {@code titleId} é o título a pagar do DAS criado por ela (nulo quando o valor é zero). */
    record Confirmation(UUID id, UUID periodId, int seq, long amountCents, LocalDate dueDate, String notes, UUID simulationId,
                        UUID titleId, Instant createdAt, String createdBy) { }

    record Closure(UUID id, UUID periodId, String action, String reason, Long productRevenueCents, Long serviceRevenueCents,
                   UUID simulationId, UUID confirmationId, Instant occurredAt, String actor) { }

    /** Revisões, da mais recente para a mais antiga. */
    List<TaxParameters> parameters();

    /** Revisão vigente na competência: a de maior vigência até ela (e, na mesma vigência, a de maior número). */
    Optional<TaxParameters> parametersFor(YearMonth competence);

    /** Próximo número de revisão, com a tabela bloqueada contra outra revisão simultânea. */
    int lockNextRevision();

    void insertParameters(TaxParameters p);

    Optional<Period> find(YearMonth competence);

    List<Period> findBetween(YearMonth from, YearMonth to);

    /** Competência bloqueada para alteração; criada (aberta, versão 0) se ainda não existir. */
    Period lockOrCreate(YearMonth competence, Instant at, String actor);

    /** Grava situação, RBT12 informado e versão; confere a versão lida. */
    void update(Period p, long expectedVersion);

    /**
     * Situação da competência com bloqueio compartilhado até o fim da transação (a nota que consulta segura o
     * fechamento simultâneo); vazio se a competência nunca foi usada no fiscal (aberta).
     */
    Optional<String> statusForShare(YearMonth competence);

    /** Simulações da competência, da mais recente para a mais antiga. */
    List<Simulation> simulations(UUID periodId);

    Map<UUID, Simulation> latestSimulations(List<UUID> periodIds);

    void insertSimulation(Simulation s);

    /** Conferências da competência, da mais recente para a mais antiga. */
    List<Confirmation> confirmations(UUID periodId);

    Map<UUID, Confirmation> latestConfirmations(List<UUID> periodIds);

    void insertConfirmation(Confirmation c);

    /** Fechamentos e reaberturas, do mais recente para o mais antigo. */
    List<Closure> closures(UUID periodId);

    void insertClosure(Closure c);
}
