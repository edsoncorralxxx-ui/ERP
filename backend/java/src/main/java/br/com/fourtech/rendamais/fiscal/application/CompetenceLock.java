package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.documentos.api.CompetenceLockGuard;
import br.com.fourtech.rendamais.fiscal.domain.SimplesSimulation;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.List;

/**
 * Competência fechada não recebe nem perde nota (decisão do PO na Sprint 7). Lê a situação com bloqueio compartilhado:
 * um fechamento simultâneo espera a nota terminar, e a nota que chega depois do fechamento é recusada.
 */
@Component
class CompetenceLock implements CompetenceLockGuard {

    private final TaxRepository repository;

    CompetenceLock(TaxRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void checkOpen(YearMonth competence, String operation) {
        if (repository.statusForShare(competence).filter("FECHADA"::equals).isPresent()) {
            String label = SimplesSimulation.label(competence);
            throw new RuleViolationException("TAX_PERIOD_CLOSED", "A competência " + label + " está fechada no fiscal; reabra a "
                    + "competência em Impostos gerenciais para " + operation + ".",
                    List.of(new FieldIssue("competence", "Competência " + label + " fechada.")));
        }
    }
}
