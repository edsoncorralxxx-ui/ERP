package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import br.com.fourtech.rendamais.fiscal.application.FiscalLedger;
import br.com.fourtech.rendamais.fiscal.application.FiscalService;
import br.com.fourtech.rendamais.fiscal.application.TaxRepository;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Apuração do Simples Nacional: histórico de competências, ficha da competência (If-Match com a versão; 0 enquanto nada
 * foi feito), cálculo (Idempotency-Key), transmissão do PGDAS-D, guia DAS, etapas do fechamento, encerrar e reabrir,
 * RBT12 informado e as revisões dos parâmetros. Valores em centavos como texto de inteiro e alíquotas como fração
 * (ADR-006).
 */
@RestController
@RequestMapping("/api/v1")
class FiscalController {

    private final FiscalService service;

    FiscalController(FiscalService service) {
        this.service = service;
    }

    record GuideDto(String id, int seq, String documentNumber, String principalCents, String fineCents, String interestCents,
                    String totalCents, LocalDate dueDate, String notes, String titleId, String titleCode, String titleStatus,
                    String titleBalanceCents, String status, LocalDate paidOn, Instant createdAt, String createdBy) {
        static GuideDto of(FiscalService.GuideView v) {
            if (v == null) return null;
            TaxRepository.DasGuide g = v.guide();
            var t = v.title();
            return new GuideDto(g.id().toString(), g.seq(), g.documentNumber(), Long.toString(g.principalCents()), Long.toString(g.fineCents()),
                    Long.toString(g.interestCents()), Long.toString(g.totalCents()), g.dueDate(), g.notes(),
                    g.titleId() == null ? null : g.titleId().toString(), t == null ? null : t.code(), t == null ? null : t.status(),
                    t == null ? null : Long.toString(t.balanceCents()), v.status(), v.paidOn(), g.createdAt(), g.createdBy());
        }
    }

    record SummaryDto(String competence, String status, String version, String revenueCents, boolean revenueKnown, String rbt12Cents,
                      String effectiveRate, String calculatedCents, boolean calculationStored, GuideDto guide) {
        static SummaryDto of(FiscalService.PeriodSummary s) {
            return new SummaryDto(s.competence().toString(), s.status(), Long.toString(s.version()), Long.toString(s.revenueCents()),
                    s.revenueKnown(), text(s.rbt12Cents()), rate(s.effectiveRate()), text(s.calculatedCents()), s.calculationStored(),
                    GuideDto.of(s.guide()));
        }
    }

    record PartDto(String documentId, String code, String kind, String series, String number, LocalDate issueDate, String customerCode,
                   String customerName, String orderCode, String description, String annex, String cents, int defaultLines,
                   String authorization, String version) { }

    record MonthDto(String competence, String cents, String origin) { }

    record Rbt12Dto(String calculatedCents, String informedCents, String informedBy, String informedNotes, String usedCents,
                    String usedOrigin, List<String> missing, List<MonthDto> months) { }

    record CalculationDto(String source, Integer seq, String result, Integer parameterRevision, String rbt12Cents, String rbt12Origin,
                          String revenueCents, String totalTaxCents, JsonNode memory, Instant createdAt, String createdBy) { }

    record SimulationDto(String id, int seq, String result, Integer parameterRevision, String rbt12Cents, String rbt12Origin,
                         String revenueCents, String totalTaxCents, Instant createdAt, String createdBy) { }

    record DeclarationDto(String id, int seq, LocalDate transmittedOn, String receiptNumber, String declaredRevenueCents, String notes,
                          Instant createdAt, String createdBy) { }

    record StepDto(String code, String name, String responsible, boolean automatic, boolean done, Instant doneAt, String doneBy,
                   String detail) { }

    record ClosureDto(String action, String reason, String revenueCents, Instant occurredAt, String actor) { }

    record MonthRowDto(String competence, String revenueCents, String rbt12Cents, Integer bracket, String effectiveRate) { }

    record LimitsDto(String annualLimitCents, String sublimitCents, String tolerance, String alertThreshold) { }

    record BracketDto(String upToCents, String rate, String deductionCents, List<String> shares) { }

    record AnnexDto(String annex, String label, List<String> taxes, List<BracketDto> brackets) { }

    record ParametersDto(String id, int revision, String regime, String validFrom, List<AnnexDto> annexes, String source, String notes,
                         Instant createdAt, String createdBy) {
        static ParametersDto of(TaxParameters p) {
            if (p == null) return null;
            return new ParametersDto(p.id().toString(), p.revision(), p.regime(), p.validFrom().toString(),
                    p.annexes().entrySet().stream().map(e -> new AnnexDto(e.getKey().name(), e.getKey().label(), e.getValue().taxes(),
                            e.getValue().brackets().stream().map(b -> new BracketDto(Long.toString(b.upToCents()), b.rate().toPlainString(),
                                    Long.toString(b.deductionCents()), b.shares().stream().map(BigDecimal::toPlainString).toList())).toList()))
                            .toList(),
                    p.source(), p.notes(), p.createdAt(), p.createdBy());
        }
    }

    record PeriodDto(String competence, String status, String version, String revenueCents, Map<String, String> revenueByAnnex,
                     int documentCount, List<PartDto> documents, Rbt12Dto rbt12, ParametersDto parameters, CalculationDto calculation,
                     List<SimulationDto> simulations, List<GuideDto> guides, List<DeclarationDto> declarations, List<StepDto> steps,
                     List<ClosureDto> closures, List<MonthRowDto> rbt12Months, LocalDate dasDueDate, String differenceCents,
                     String yearToDateCents, LimitsDto limits, List<String> alerts) { }

    record ReasonRequest(String reason) { }

    /** Histórico de competências do ano (padrão: o ano corrente), da mais recente para a mais antiga. */
    @GetMapping("/tax-periods")
    List<SummaryDto> list(@RequestParam(value = "year", required = false) Integer year) {
        int y = year == null ? YearMonth.now(ZoneId.of("America/Sao_Paulo")).getYear() : year;
        if (y < 2000 || y > 2100) throw new IllegalArgumentException("Ano inválido: " + y);
        return service.list(y).stream().map(SummaryDto::of).toList();
    }

    @GetMapping("/tax-periods/{competence}")
    ResponseEntity<PeriodDto> get(@PathVariable String competence) {
        return respond(HttpStatus.OK, service.detail(competence));
    }

    @PutMapping("/tax-periods/{competence}/rbt12")
    ResponseEntity<PeriodDto> inform(@PathVariable String competence, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestBody(required = false) FiscalService.InformRequest body) {
        return respond(HttpStatus.OK, service.informRbt12(competence, Versions.required(ifMatch), body));
    }

    @PostMapping("/tax-periods/{competence}/simulations")
    ResponseEntity<PeriodDto> simulate(@PathVariable String competence,
                                       @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return respond(HttpStatus.CREATED, service.simulate(competence, key));
    }

    @PostMapping("/tax-periods/{competence}/declarations")
    ResponseEntity<PeriodDto> declare(@PathVariable String competence, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                      @RequestBody(required = false) FiscalService.DeclareRequest body) {
        return respond(HttpStatus.CREATED, service.declare(competence, Versions.required(ifMatch), body));
    }

    @PostMapping("/tax-periods/{competence}/das-guides")
    ResponseEntity<PeriodDto> issueGuide(@PathVariable String competence,
                                         @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                         @RequestBody(required = false) FiscalService.GuideRequest body) {
        return respond(HttpStatus.CREATED, service.issueGuide(competence, Versions.required(ifMatch), body));
    }

    @PutMapping("/tax-periods/{competence}/closing-steps/{step}")
    ResponseEntity<PeriodDto> step(@PathVariable String competence, @PathVariable String step,
                                   @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                   @RequestBody(required = false) FiscalService.StepRequest body) {
        return respond(HttpStatus.OK, service.closingStep(competence, step, Versions.required(ifMatch), body));
    }

    @PostMapping("/tax-periods/{competence}/closures")
    ResponseEntity<PeriodDto> close(@PathVariable String competence, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.close(competence, Versions.required(ifMatch)));
    }

    @PostMapping("/tax-periods/{competence}/reopenings")
    ResponseEntity<PeriodDto> reopen(@PathVariable String competence, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestBody(required = false) ReasonRequest body) {
        return respond(HttpStatus.OK, service.reopen(competence, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @GetMapping("/tax-periods/{competence}/history")
    List<HistoryEntry> history(@PathVariable String competence) {
        return service.history(competence).stream().map(HistoryEntry::of).toList();
    }

    @GetMapping("/tax-parameters")
    List<ParametersDto> parameters() {
        return service.parameters().stream().map(ParametersDto::of).toList();
    }

    @PostMapping("/tax-parameters")
    ResponseEntity<ParametersDto> revise(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                         @RequestBody(required = false) FiscalService.ParametersRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ParametersDto.of(service.revise(key, body)));
    }

    static PeriodDto dto(FiscalService.PeriodDetail d) {
        FiscalLedger.Rbt12View rb = d.rbt12();
        TaxRepository.Period p = d.period();
        var used = rb.used();
        Map<String, String> byAnnex = new LinkedHashMap<>();
        d.revenue().forCalculation().forEach((a, v) -> byAnnex.put(a.name(), Long.toString(v)));
        Map<UUID, Integer> simSeq = new LinkedHashMap<>();
        d.simulations().forEach(s -> simSeq.put(s.id(), s.seq()));
        FiscalService.CalcView c = d.calculation();
        var profile = d.profile();
        return new PeriodDto(d.competence().toString(), d.status(), Long.toString(d.version()), Long.toString(d.revenue().totalCents()),
                byAnnex, d.revenue().documents(),
                d.parts().stream().map(FiscalController::part).toList(),
                new Rbt12Dto(text(rb.calculatedCents()), text(rb.informedCents()), p == null ? null : p.informedBy(),
                        p == null ? null : p.informedNotes(), used == null ? null : Long.toString(used.cents()),
                        used == null ? null : used.origin(), rb.missing().stream().map(YearMonth::toString).toList(),
                        rb.months().stream().map(m -> new MonthDto(m.competence().toString(), Long.toString(m.totalCents()), m.origin())).toList()),
                ParametersDto.of(d.parameters()),
                new CalculationDto(c.source(), c.seq(), c.result(), c.parameterRevision(), text(c.rbt12Cents()), c.rbt12Origin(),
                        Long.toString(c.revenueCents()), text(c.totalTaxCents()), c.memory(), c.createdAt(), c.createdBy()),
                d.simulations().stream().map(s -> new SimulationDto(s.id().toString(), s.seq(), s.result(), s.parameterRevision(),
                        text(s.rbt12Cents()), s.rbt12Origin(), Long.toString(s.productRevenueCents() + s.serviceRevenueCents()),
                        text(s.totalTaxCents()), s.createdAt(), s.createdBy())).toList(),
                d.guides().stream().map(GuideDto::of).toList(),
                d.declarations().stream().map(x -> new DeclarationDto(x.id().toString(), x.seq(), x.transmittedOn(), x.receiptNumber(),
                        Long.toString(x.declaredRevenueCents()), x.notes(), x.createdAt(), x.createdBy())).toList(),
                d.steps().stream().map(s -> new StepDto(s.step().name(), s.step().label(), s.step().responsible(), s.step().automatic(),
                        s.done(), s.doneAt(), s.doneBy(), s.detail())).toList(),
                d.closures().stream().map(x -> new ClosureDto(x.action(), x.reason(),
                        x.productRevenueCents() == null ? null : Long.toString(x.productRevenueCents() + x.serviceRevenueCents()),
                        x.occurredAt(), x.actor())).toList(),
                d.rbt12Months().stream().map(r -> new MonthRowDto(r.competence().toString(), text(r.revenueCents()), text(r.rbt12Cents()),
                        r.bracket(), rate(r.effectiveRate()))).toList(),
                d.dasDueDate(), text(d.differenceCents()), Long.toString(d.yearToDateCents()),
                new LimitsDto(Long.toString(profile.annualLimitCents()), Long.toString(profile.sublimitCents()),
                        profile.tolerance().stripTrailingZeros().toPlainString(), profile.alertThreshold().stripTrailingZeros().toPlainString()),
                d.alerts());
    }

    private static PartDto part(DocumentQueryApi.AnnexPart x) {
        return new PartDto(x.documentId().toString(), x.code(), x.kind(), x.series(), x.number(), x.issueDate(), x.customerCode(),
                x.customerName(), x.orderCode(), x.description(), x.annex(), Long.toString(x.cents()), x.defaultLines(), x.authorization(),
                Long.toString(x.version()));
    }

    private ResponseEntity<PeriodDto> respond(HttpStatus status, FiscalService.PeriodDetail d) {
        return ResponseEntity.status(status).eTag("\"" + d.version() + "\"").body(dto(d));
    }

    static String text(Long v) {
        return v == null ? null : Long.toString(v);
    }

    static String rate(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }
}
