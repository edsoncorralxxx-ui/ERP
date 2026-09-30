package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.CashFlowService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Fluxo de caixa mês a mês (realizado e previsto separados) e a composição de cada valor. Valores em centavos (ADR-006). */
@RestController
@RequestMapping("/api/v1/cash-flow")
class CashFlowController {

    private final CashFlowService service;

    CashFlowController(CashFlowService service) {
        this.service = service;
    }

    record MonthDto(String month, String period, String openingCents, String realizedInCents, String realizedOutCents, String overdueInCents,
                    String overdueOutCents, String forecastInCents, String forecastOutCents, String closingCents) { }

    record PendingDto(String month, String category, String reference, String message) { }

    record FlowDto(LocalDate today, String from, String to, String accountId, String category, List<MonthDto> months,
                   List<PendingDto> pendings) { }

    record LineDto(String targetKind, String targetId, String code, LocalDate date, String description, String party, String amountCents) { }

    record CompositionDto(String month, String column, List<LineDto> lines, String totalCents) { }

    /** {@code from}/{@code to}: AAAA-MM (padrão: 3 meses antes a 6 depois do mês atual; até 24 meses). */
    @GetMapping
    FlowDto flow(@RequestParam(value = "from", required = false) String from, @RequestParam(value = "to", required = false) String to,
                 @RequestParam(value = "accountId", required = false) UUID accountId,
                 @RequestParam(value = "category", required = false) String category) {
        var f = service.flow(from, to, accountId, category);
        return new FlowDto(f.today(), f.from().toString(), f.to().toString(), f.accountId() == null ? null : f.accountId().toString(),
                f.category(), f.months().stream().map(m -> new MonthDto(m.month().toString(), m.period().name(), s(m.openingCents()),
                        s(m.realizedInCents()), s(m.realizedOutCents()), s(m.overdueInCents()), s(m.overdueOutCents()), s(m.forecastInCents()),
                        s(m.forecastOutCents()), s(m.closingCents()))).toList(),
                f.pendings().stream().map(p -> new PendingDto(p.month().toString(), p.category(), p.reference(), p.message())).toList());
    }

    /** {@code column}: OPENING, REALIZED_IN, REALIZED_OUT, OVERDUE_IN, OVERDUE_OUT, FORECAST_IN ou FORECAST_OUT. */
    @GetMapping("/composition")
    CompositionDto composition(@RequestParam("month") String month, @RequestParam("column") String column,
                               @RequestParam(value = "accountId", required = false) UUID accountId,
                               @RequestParam(value = "category", required = false) String category) {
        var c = service.composition(month, column, accountId, category);
        return new CompositionDto(c.month().toString(), c.column().name(), c.lines().stream().map(l -> new LineDto(l.targetKind(),
                l.targetId().toString(), l.code(), l.date(), l.description(), l.party(), s(l.amountCents()))).toList(), s(c.totalCents()));
    }

    private static String s(long v) {
        return Long.toString(v);
    }
}
