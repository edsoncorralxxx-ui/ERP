package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.financeiro.api.CashFlowPendingSource;
import br.com.fourtech.rendamais.fiscal.domain.SimplesSimulation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Pendências fiscais do fluxo de caixa (Sprint 9): competência já encerrada, a partir do início da receita no Renda+, sem
 * conferência do contador. O DAS dela ainda não é título, então o caixa mostra a pendência no mês do vencimento (o
 * seguinte), sem valor — imposto desconhecido não é zero.
 */
@Component
class TaxCashFlowPendings implements CashFlowPendingSource {

    private final TaxRepository repository;
    private final YearMonth revenueStart;

    TaxCashFlowPendings(TaxRepository repository, @Value("${renda.fiscal.revenue-start:2026-09}") String revenueStart) {
        this.repository = repository;
        this.revenueStart = YearMonth.parse(revenueStart);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Pending> pendingBetween(YearMonth from, YearMonth to, LocalDate today) {
        YearMonth first = from.minusMonths(1).isBefore(revenueStart) ? revenueStart : from.minusMonths(1);
        YearMonth lastClosed = YearMonth.from(today).minusMonths(1);
        YearMonth last = to.minusMonths(1).isBefore(lastClosed) ? to.minusMonths(1) : lastClosed;
        if (last.isBefore(first)) return List.of();
        Map<YearMonth, UUID> periods = repository.findBetween(first, last).stream()
                .collect(Collectors.toMap(TaxRepository.Period::competence, TaxRepository.Period::id));
        Map<UUID, TaxRepository.Confirmation> confirmed = repository.latestConfirmations(List.copyOf(periods.values()));
        List<Pending> out = new ArrayList<>();
        for (YearMonth c = first; !c.isAfter(last); c = c.plusMonths(1)) {
            UUID id = periods.get(c);
            if (id == null || !confirmed.containsKey(id)) {
                out.add(new Pending(c.plusMonths(1), FiscalService.DAS_CATEGORY, c.toString(), "Pendência — imposto da competência "
                        + SimplesSimulation.label(c) + " não conferido pelo contador (DAS sem valor)"));
            }
        }
        return out;
    }
}
