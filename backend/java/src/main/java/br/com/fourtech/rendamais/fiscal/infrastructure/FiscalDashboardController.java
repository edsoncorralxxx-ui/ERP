package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.FiscalDashboardService;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Painel fiscal da competência (padrão: o mês anterior ao corrente). */
@RestController
@RequestMapping("/api/v1/fiscal")
class FiscalDashboardController {

    private final FiscalDashboardService service;

    FiscalDashboardController(FiscalDashboardService service) {
        this.service = service;
    }

    record PointDto(String competence, String revenueCents, String rbt12Cents, Map<String, String> dasByAnnex, String dasCents) { }

    record GuideRowDto(String competence, LocalDate dueDate, String totalCents, String status, LocalDate paidOn) { }

    record DashboardDto(String competence, String status, String dasCents, String effectiveRate, LocalDate dasDueDate, String rbt12Cents,
                        Integer bracket, String yearToDateCents, String sublimitCents, String limitCents,
                        List<ObligationController.ObligationDto> nextWeek, List<ObligationController.ObligationDto> upcoming,
                        List<PointDto> series, Map<String, String> taxes, List<GuideRowDto> guides, int stepsDone, int stepsTotal,
                        List<String> alerts, String ibsCbsChoice, long daysToIbsDeadline, FiscalController.PeriodDto period) { }

    @GetMapping("/dashboard")
    DashboardDto dashboard(@RequestParam(value = "competence", required = false) String competence) {
        FiscalDashboardService.Dashboard d = service.dashboard(competence);
        Map<String, String> taxes = new LinkedHashMap<>();
        d.taxes().forEach((k, v) -> taxes.put(k, Long.toString(v)));
        return new DashboardDto(d.competence().toString(), d.detail().status(), FiscalController.text(d.dasCents()),
                FiscalController.rate(d.effectiveRate()), d.dasDueDate(), FiscalController.text(d.rbt12Cents()), d.bracket(),
                Long.toString(d.yearToDateCents()), Long.toString(d.sublimitCents()), Long.toString(d.limitCents()),
                d.nextWeek().stream().map(ObligationController.ObligationDto::of).toList(),
                d.upcoming().stream().map(ObligationController.ObligationDto::of).toList(),
                d.series().stream().map(p -> {
                    Map<String, String> byAnnex = new LinkedHashMap<>();
                    for (Annex a : List.of(Annex.I, Annex.II, Annex.III)) byAnnex.put(a.name(), FiscalController.text(p.dasByAnnex().get(a)));
                    return new PointDto(p.competence().toString(), Long.toString(p.revenueCents()), FiscalController.text(p.rbt12Cents()),
                            byAnnex, FiscalController.text(p.dasCents()));
                }).toList(),
                taxes, d.guides().stream().map(g -> new GuideRowDto(g.competence().toString(), g.dueDate(), FiscalController.text(g.totalCents()),
                        g.status(), g.paidOn())).toList(),
                d.stepsDone(), d.stepsTotal(), d.alerts(), d.ibsCbsChoice(), d.daysToIbsDeadline(), FiscalController.dto(d.detail()));
    }
}
