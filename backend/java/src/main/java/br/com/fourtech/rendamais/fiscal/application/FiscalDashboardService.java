package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.fiscal.domain.SimplesCalculation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Painel fiscal (Sprint 12, mock "Painel fiscal"): indicadores da competência (DAS, RBT12, receita do ano contra o
 * sublimite, obrigações dos próximos 7 dias), as séries dos gráficos (RBT12 × limites, DAS por tributo, DAS por anexo em
 * 12 competências), próximas obrigações, barras de limite e de fechamento, últimas guias e alertas por regra (a IA fica
 * desligada, ADR-014). Competências sem cálculo gravado entram pela prévia com os dados de agora.
 */
@Service
public class FiscalDashboardService {

    private final FiscalService fiscal;
    private final FiscalLedger ledger;
    private final TaxRepository taxes;
    private final ObligationService obligations;
    private final TaxSetupRepository setup;
    private final java.time.Clock clock;

    public FiscalDashboardService(FiscalService fiscal, FiscalLedger ledger, TaxRepository taxes, ObligationService obligations,
                                  TaxSetupRepository setup, java.time.Clock clock) {
        this.clock = clock;
        this.fiscal = fiscal;
        this.ledger = ledger;
        this.taxes = taxes;
        this.obligations = obligations;
        this.setup = setup;
    }

    /** Uma competência das séries: receita, RBT12 e DAS por anexo (prévia ou gravado). */
    public record MonthPoint(YearMonth competence, long revenueCents, Long rbt12Cents, Map<Annex, Long> dasByAnnex, Long dasCents) { }

    /** Guia ou, sem guia, o cálculo da competência. */
    public record GuideRow(YearMonth competence, LocalDate dueDate, Long totalCents, String status, LocalDate paidOn) { }

    public record Dashboard(YearMonth competence, FiscalService.PeriodDetail detail, Long dasCents, BigDecimal effectiveRate,
                            LocalDate dasDueDate, Long rbt12Cents, Integer bracket, long yearToDateCents, long sublimitCents,
                            long limitCents, List<ObligationService.View> nextWeek, List<ObligationService.View> upcoming,
                            List<MonthPoint> series, Map<String, Long> taxes, List<GuideRow> guides, int stepsDone, int stepsTotal,
                            List<String> alerts, String ibsCbsChoice, long daysToIbsDeadline) { }

    /** Painel da competência (padrão: o mês anterior ao corrente, o que está sendo apurado). */
    @Transactional
    public Dashboard dashboard(String competence) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        YearMonth c = competence == null || competence.isBlank() ? ledger.currentMonth().minusMonths(1) : FiscalService.month(competence);
        List<ObligationService.View> all = obligations.list();
        FiscalService.PeriodDetail d = fiscal.detail(c.toString());
        Map<YearMonth, FiscalLedger.Month> book = ledger.months(c.minusMonths(23), c);
        book.put(c, d.revenue());
        Map<YearMonth, TaxRepository.Period> periods = new LinkedHashMap<>();
        taxes.findBetween(c.minusMonths(11), c).forEach(p -> periods.put(p.competence(), p));
        List<UUID> ids = periods.values().stream().map(TaxRepository.Period::id).toList();
        Map<UUID, FiscalService.GuideView> guides = fiscal.latestGuideViews(ids);
        List<MonthPoint> series = new ArrayList<>();
        for (YearMonth m = c.minusMonths(11); !m.isAfter(c); m = m.plusMonths(1)) {
            TaxRepository.Period p = periods.get(m);
            Long informed = p == null ? null : p.informedRbt12Cents();
            SimplesCalculation.Result r = ledger.preview(m, book, informed);
            FiscalLedger.Rbt12View rb = ledger.rbt12(m, informed, book);
            Map<Annex, Long> byAnnex = new LinkedHashMap<>();
            for (Annex a : List.of(Annex.I, Annex.II, Annex.III)) {
                SimplesCalculation.AnnexResult x = r.calculable() ? r.of(a) : null;
                byAnnex.put(a, x == null ? null : x.taxCents());
            }
            series.add(new MonthPoint(m, book.get(m).totalCents(), rb.used() == null ? null : rb.used().cents(), byAnnex, r.totalTaxCents()));
        }
        List<GuideRow> rows = new ArrayList<>();
        for (int k = 0; k < 4; k++) {
            YearMonth m = c.minusMonths(k);
            TaxRepository.Period p = periods.get(m);
            FiscalService.GuideView g = p == null ? null : guides.get(p.id());
            MonthPoint point = series.get(series.size() - 1 - k);
            rows.add(g == null ? new GuideRow(m, m.plusMonths(1).atDay(FiscalService.DAS_DUE_DAY), point.dasCents(), "SEM_GUIA", null)
                    : new GuideRow(m, g.guide().dueDate(), g.guide().totalCents(), g.status(), g.paidOn()));
        }
        FiscalService.GuideView guide = d.guides().isEmpty() ? null : d.guides().getFirst();
        Long das = guide != null ? Long.valueOf(guide.guide().totalCents()) : d.calculation().totalTaxCents();
        Map<String, Long> byTax = new LinkedHashMap<>();
        var taxesNode = d.calculation().memory().get("taxes");
        if (taxesNode != null) taxesNode.properties().forEach(e -> byTax.put(e.getKey(), Long.parseLong(e.getValue().asString())));
        Integer bracket = null;
        var annexes = d.calculation().memory().get("annexes");
        if (annexes != null) for (var a : annexes) if ("II".equals(a.get("annex").asString())) bracket = a.get("bracket").asInt();
        TaxSetupRepository.Profile profile = d.profile();
        List<ObligationService.View> nextWeek = all.stream().filter(ObligationService.View::dueThisWeek).toList();
        List<ObligationService.View> upcoming = all.stream().filter(v -> !v.done() && v.daysToDue() <= 36).toList();
        List<String> alerts = new ArrayList<>();
        List<TaxSetupRepository.IbsCbsOption> options = setup.ibsCbsOptions();
        LocalDate today = LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE));
        long daysToIbs = java.time.temporal.ChronoUnit.DAYS.between(today, TaxSetupService.IBS_DEADLINE);
        if (options.isEmpty()) {
            alerts.add(daysToIbs >= 0
                    ? "Opção por IBS e CBS fora do DAS no 1º semestre de 2027: o prazo termina em 30/09/2026, daqui a " + daysToIbs + " dias."
                    : "Opção por IBS e CBS no 1º semestre de 2027: o prazo terminou em 30/09/2026. Registre a decisão tomada no portal "
                    + "(a desistência vai até 30/11/2026).");
        }
        alerts.addAll(d.alerts());
        int done = (int) d.steps().stream().filter(FiscalService.StepView::done).count();
        Long rbt12 = d.rbt12().used() == null ? null : d.rbt12().used().cents();
        return new Dashboard(c, d, das, FiscalService.average(d.calculation().totalTaxCents(), d.revenue().totalCents()),
                guide != null ? guide.guide().dueDate() : d.dasDueDate(), rbt12, bracket, d.yearToDateCents(), profile.sublimitCents(),
                profile.annualLimitCents(), nextWeek, upcoming, series, byTax, rows, done, d.steps().size(), alerts,
                options.isEmpty() ? null : options.getFirst().choice(), daysToIbs);
    }
}
