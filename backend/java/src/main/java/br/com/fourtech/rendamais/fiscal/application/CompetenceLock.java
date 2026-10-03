package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.documentos.api.CompetenceLockGuard;
import br.com.fourtech.rendamais.fiscal.domain.SimplesCalculation;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.List;

/**
 * Competência encerrada não recebe nem perde nota (decisão do PO na Sprint 7). Lê a situação com bloqueio compartilhado:
 * um encerramento simultâneo espera a nota terminar, e a nota que chega depois do encerramento é recusada.
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
        if (repository.statusForShare(competence).filter(TaxRepository.ENCERRADA::equals).isPresent()) {
            String label = SimplesCalculation.label(competence);
            throw new RuleViolationException("TAX_PERIOD_CLOSED", "A competência " + label + " está encerrada no fiscal; reabra a "
                    + "competência em Apuração do Simples para " + operation + ".",
                    List.of(new FieldIssue("competence", "Competência " + label + " encerrada.")));
        }
    }
}
