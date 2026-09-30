package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.financeiro.api.CashFlowPendingSource;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Fluxo de caixa (formulário "caixa", IND-009 e IND-010), mês a mês, com realizado e previsto separados:
 * <ul>
 *   <li>mês passado: só o realizado (movimentos das contas);</li>
 *   <li>mês corrente: realizado até hoje, em atraso (títulos vencidos com saldo) e previsto de hoje ao fim do mês;</li>
 *   <li>mês futuro: previsto (saldo dos títulos ativos pelo vencimento).</li>
 * </ul>
 * Saldo final = saldo inicial + entradas − saídas, e é o saldo inicial do mês seguinte (saldos não se somam entre meses).
 * Com filtro de categoria o saldo inicial é zero: a grade mostra o fluxo da categoria. Pendências (obrigações ainda sem
 * título) vêm das portas {@link CashFlowPendingSource}, sem valor.
 */
@Service
public class CashFlowService {

    static final int MAX_MONTHS = 24;
    /** Início das buscas de títulos em atraso (qualquer vencimento antes de hoje). */
    private static final LocalDate SINCE = LocalDate.of(1900, 1, 1);

    public enum Period { REALIZADO, CORRENTE, PREVISTO }

    public enum Column { OPENING, REALIZED_IN, REALIZED_OUT, OVERDUE_IN, OVERDUE_OUT, FORECAST_IN, FORECAST_OUT }

    public record Month(YearMonth month, Period period, long openingCents, long realizedInCents, long realizedOutCents, long overdueInCents,
                        long overdueOutCents, long forecastInCents, long forecastOutCents, long closingCents) { }

    public record Flow(LocalDate today, YearMonth from, YearMonth to, UUID accountId, String category, List<Month> months,
                       List<CashFlowPendingSource.Pending> pendings) { }

    public record Composition(YearMonth month, Column column, List<CashFlowQueries.Line> lines, long totalCents) { }

    private final CashFlowQueries queries;
    private final List<CashFlowPendingSource> pendingSources;
    private final Clock clock;

    public CashFlowService(CashFlowQueries queries, List<CashFlowPendingSource> pendingSources, Clock clock) {
        this.queries = queries;
        this.pendingSources = List.copyOf(pendingSources);
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Flow flow(String from, String to, UUID accountId, String category) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        LocalDate today = today();
        YearMonth current = YearMonth.from(today);
        YearMonth f = month(from, "from", current.minusMonths(3));
        YearMonth t = month(to, "to", current.plusMonths(6));
        if (t.isBefore(f) || ChronoUnit.MONTHS.between(f, t) >= MAX_MONTHS) {
            throw new RuleViolationException("CASH_FLOW_INVALID", "Escolha de 1 a " + MAX_MONTHS + " meses, com o início antes do fim.",
                    List.of(new FieldIssue("to", "De 1 a " + MAX_MONTHS + " meses.")));
        }
        String cat = category == null || category.isBlank() ? null : category.strip();
        List<Month> months = new ArrayList<>();
        long opening = opening(f, today, accountId, cat);
        for (YearMonth m = f; !m.isAfter(t); m = m.plusMonths(1)) {
            Period period = period(m, today);
            long rin = 0, rout = 0, oin = 0, oout = 0, fin = 0, fout = 0;
            if (period != Period.PREVISTO) {
                LocalDate end = period == Period.CORRENTE ? today : m.atEndOfMonth();
                rin = sum(queries.realizedLines(m.atDay(1), end, accountId, cat, true));
                rout = sum(queries.realizedLines(m.atDay(1), end, accountId, cat, false));
            }
            if (period == Period.CORRENTE) {
                oin = sum(queries.titleLines(SINCE, today.minusDays(1), cat, true));
                oout = sum(queries.titleLines(SINCE, today.minusDays(1), cat, false));
            }
            if (period != Period.REALIZADO) {
                LocalDate start = period == Period.CORRENTE ? today : m.atDay(1);
                fin = sum(queries.titleLines(start, m.atEndOfMonth(), cat, true));
                fout = sum(queries.titleLines(start, m.atEndOfMonth(), cat, false));
            }
            long closing = opening + rin - rout + oin - oout + fin - fout;
            months.add(new Month(m, period, opening, rin, rout, oin, oout, fin, fout, closing));
            opening = closing;
        }
        List<CashFlowPendingSource.Pending> pendings = new ArrayList<>();
        for (CashFlowPendingSource s : pendingSources) {
            s.pendingBetween(f, t, today).stream().filter(p -> cat == null || cat.equals(p.category())).forEach(pendings::add);
        }
        return new Flow(today, f, t, accountId, cat, months, pendings);
    }

    /** Linhas que formam o valor da célula; a soma é o valor mostrado na grade. */
    @Transactional(readOnly = true)
    public Composition composition(String month, String column, UUID accountId, String category) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        LocalDate today = today();
        YearMonth m = month(month, "month", null);
        Column c;
        try {
            c = Column.valueOf(column == null ? "" : column.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new RuleViolationException("CASH_FLOW_INVALID", "Coluna inválida.", List.of(new FieldIssue("column", "Coluna inválida.")));
        }
        String cat = category == null || category.isBlank() ? null : category.strip();
        Period period = period(m, today);
        LocalDate start = m.atDay(1);
        LocalDate realizedEnd = period == Period.CORRENTE ? today : m.atEndOfMonth();
        LocalDate forecastStart = period == Period.CORRENTE ? today : start;
        List<CashFlowQueries.Line> lines = switch (c) {
            case OPENING -> cat != null ? List.of()
                    : !start.isAfter(today) ? queries.accountBalances(start.minusDays(1), accountId)
                    : openingLines(m, today, accountId);
            case REALIZED_IN -> period == Period.PREVISTO ? List.of() : queries.realizedLines(start, realizedEnd, accountId, cat, true);
            case REALIZED_OUT -> period == Period.PREVISTO ? List.of() : queries.realizedLines(start, realizedEnd, accountId, cat, false);
            case OVERDUE_IN -> period == Period.CORRENTE ? queries.titleLines(SINCE, today.minusDays(1), cat, true) : List.of();
            case OVERDUE_OUT -> period == Period.CORRENTE ? queries.titleLines(SINCE, today.minusDays(1), cat, false) : List.of();
            case FORECAST_IN -> period == Period.REALIZADO ? List.of() : queries.titleLines(forecastStart, m.atEndOfMonth(), cat, true);
            case FORECAST_OUT -> period == Period.REALIZADO ? List.of() : queries.titleLines(forecastStart, m.atEndOfMonth(), cat, false);
        };
        return new Composition(m, c, lines, sum(lines));
    }

    /**
     * Saldo inicial de um mês futuro: o saldo realizado de hoje por conta, mais os títulos em atraso e os que vencem de hoje
     * até o dia anterior ao mês (a receber positivos, a pagar negativos).
     */
    private List<CashFlowQueries.Line> openingLines(YearMonth m, LocalDate today, UUID accountId) {
        List<CashFlowQueries.Line> out = new ArrayList<>(queries.accountBalances(today, accountId));
        LocalDate before = m.atDay(1).minusDays(1);
        out.addAll(queries.titleLines(SINCE, before, null, true));
        queries.titleLines(SINCE, before, null, false).forEach(l -> out.add(new CashFlowQueries.Line(l.targetKind(), l.targetId(),
                l.code(), l.date(), l.description(), l.party(), -l.amountCents())));
        return out;
    }

    private long opening(YearMonth first, LocalDate today, UUID accountId, String category) {
        if (category != null) return 0;
        LocalDate start = first.atDay(1);
        if (!start.isAfter(today)) return queries.realizedBalance(start.minusDays(1), accountId);
        LocalDate before = start.minusDays(1);
        return queries.realizedBalance(today, accountId) + sum(queries.titleLines(SINCE, before, null, true))
                - sum(queries.titleLines(SINCE, before, null, false));
    }

    private static Period period(YearMonth m, LocalDate today) {
        YearMonth current = YearMonth.from(today);
        return m.isBefore(current) ? Period.REALIZADO : m.isAfter(current) ? Period.PREVISTO : Period.CORRENTE;
    }

    private static long sum(List<CashFlowQueries.Line> lines) {
        return lines.stream().mapToLong(CashFlowQueries.Line::amountCents).sum();
    }

    private static YearMonth month(String raw, String field, YearMonth fallback) {
        if ((raw == null || raw.isBlank()) && fallback != null) return fallback;
        try {
            return YearMonth.parse(raw.strip());
        } catch (RuntimeException e) {
            throw new RuleViolationException("CASH_FLOW_INVALID", "Mês inválido; use AAAA-MM.", List.of(new FieldIssue(field, "Use AAAA-MM.")));
        }
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE));
    }
}
