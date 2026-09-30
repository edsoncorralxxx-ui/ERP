package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
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
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Impostos gerenciais: competências do ano, ficha da competência (If-Match com a versão; 0 enquanto nada foi feito),
 * RBT12 informado, simulação (Idempotency-Key), conferência do contador, fechar e reabrir; revisões dos parâmetros.
 * Valores em centavos como texto de inteiro e alíquotas como fração (ADR-006).
 */
@RestController
@RequestMapping("/api/v1")
class FiscalController {

    private final FiscalService service;
    private final JsonMapper json;

    FiscalController(FiscalService service, JsonMapper json) {
        this.service = service;
        this.json = json;
    }

    record SummaryDto(String competence, String status, String version, boolean revenueKnown, String productRevenueCents,
                      String serviceRevenueCents, String revenueCents, int documentCount, String simulationResult, String simulationCents,
                      String confirmedCents, LocalDate dueDate, String differenceCents) {
        static SummaryDto of(FiscalService.PeriodSummary s) {
            DocumentQueryApi.Revenue r = s.revenue();
            return new SummaryDto(s.competence().toString(), s.status(), Long.toString(s.period() == null ? 0 : s.period().version()),
                    s.revenueKnown(), Long.toString(r.productCents()), Long.toString(r.serviceCents()), Long.toString(r.totalCents()),
                    r.documents(), s.simulation() == null ? null : s.simulation().result(),
                    s.simulation() == null ? null : text(s.simulation().totalTaxCents()),
                    s.confirmation() == null ? null : Long.toString(s.confirmation().amountCents()),
                    s.confirmation() == null ? null : s.confirmation().dueDate(), text(s.differenceCents()));
        }
    }

    record DocumentDto(String id, String code, String kind, String series, String number, LocalDate issueDate, String customerCode,
                       String customerName, String orderCode, String productCents, String serviceCents, String totalCents) { }

    record Rbt12Dto(String calculatedCents, String informedCents, String informedBy, String informedNotes, String usedCents,
                    String usedOrigin, List<String> missing) { }

    record SimulationDto(String id, int seq, String result, Integer parameterRevision, String rbt12Cents, String rbt12Origin,
                         String productRevenueCents, String serviceRevenueCents, String productTaxCents, String serviceTaxCents,
                         String totalTaxCents, JsonNode memory, Instant createdAt, String createdBy) { }

    /** Conferência do contador com o título do DAS que ela criou (código, situação e saldo de hoje). */
    record ConfirmationDto(String id, int seq, String amountCents, LocalDate dueDate, String notes, Integer simulationSeq,
                           String titleId, String titleCode, String titleStatus, String titleBalanceCents, Instant createdAt,
                           String createdBy) { }

    record ClosureDto(String action, String reason, String revenueCents, Instant occurredAt, String actor) { }

    record BracketDto(String upToCents, String rate, String deductionCents) { }

    record ParametersDto(String id, int revision, String regime, String validFrom, String productAnnex, String serviceAnnex,
                         Map<String, List<BracketDto>> brackets, String source, String notes, Instant createdAt, String createdBy) {
        static ParametersDto of(TaxParameters p) {
            if (p == null) return null;
            Map<String, List<BracketDto>> b = new LinkedHashMap<>();
            p.brackets().forEach((k, list) -> b.put(k.name(), list.stream().map(x -> new BracketDto(Long.toString(x.upToCents()),
                    x.rate().toPlainString(), Long.toString(x.deductionCents()))).toList()));
            return new ParametersDto(p.id().toString(), p.revision(), p.regime(), p.validFrom().toString(), p.productAnnex(),
                    p.serviceAnnex(), b, p.source(), p.notes(), p.createdAt(), p.createdBy());
        }
    }

    record PeriodDto(String competence, String status, String version, boolean revenueKnown, String productRevenueCents,
                     String serviceRevenueCents, String revenueCents, List<DocumentDto> documents, Rbt12Dto rbt12, ParametersDto parameters,
                     List<SimulationDto> simulations, List<ConfirmationDto> confirmations, List<ClosureDto> closures,
                     String differenceCents) { }

    record ReasonRequest(String reason) { }

    /** Competências do ano (padrão: o ano corrente), de janeiro a dezembro. */
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

    @PostMapping("/tax-periods/{competence}/confirmations")
    ResponseEntity<PeriodDto> confirm(@PathVariable String competence, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                      @RequestBody(required = false) FiscalService.ConfirmRequest body) {
        return respond(HttpStatus.CREATED, service.confirm(competence, Versions.required(ifMatch), body));
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

    private ResponseEntity<PeriodDto> respond(HttpStatus status, FiscalService.PeriodDetail d) {
        DocumentQueryApi.Revenue r = d.revenue();
        TaxRepository.Period p = d.period();
        FiscalService.Rbt12View rb = d.rbt12();
        var used = rb.used();
        Map<java.util.UUID, Integer> simSeq = new LinkedHashMap<>();
        d.simulations().forEach(s -> simSeq.put(s.id(), s.seq()));
        PeriodDto dto = new PeriodDto(d.competence().toString(), d.status(), Long.toString(d.version()), d.revenueKnown(),
                Long.toString(r.productCents()), Long.toString(r.serviceCents()), Long.toString(r.totalCents()),
                d.documents().stream().map(x -> new DocumentDto(x.id().toString(), x.code(), x.kind(), x.series(), x.number(), x.issueDate(),
                        x.customerCode(), x.customerName(), x.orderCode(), Long.toString(x.productCents()), Long.toString(x.serviceCents()),
                        Long.toString(x.totalCents()))).toList(),
                new Rbt12Dto(text(rb.calculatedCents()), text(rb.informedCents()), p == null ? null : p.informedBy(),
                        p == null ? null : p.informedNotes(), used == null ? null : Long.toString(used.cents()),
                        used == null ? null : used.origin(), rb.missing().stream().map(YearMonth::toString).toList()),
                ParametersDto.of(d.parameters()),
                d.simulations().stream().map(s -> new SimulationDto(s.id().toString(), s.seq(), s.result(), s.parameterRevision(),
                        text(s.rbt12Cents()), s.rbt12Origin(), Long.toString(s.productRevenueCents()), Long.toString(s.serviceRevenueCents()),
                        text(s.productTaxCents()), text(s.serviceTaxCents()), text(s.totalTaxCents()), json.readTree(s.memory()),
                        s.createdAt(), s.createdBy())).toList(),
                d.confirmations().stream().map(c -> {
                    TitleQueryApi.TitleView t = c.titleId() == null ? null : d.dasTitles().get(c.titleId());
                    return new ConfirmationDto(c.id().toString(), c.seq(), Long.toString(c.amountCents()), c.dueDate(), c.notes(),
                            c.simulationId() == null ? null : simSeq.get(c.simulationId()), c.titleId() == null ? null : c.titleId().toString(),
                            t == null ? null : t.code(), t == null ? null : t.status(), t == null ? null : Long.toString(t.balanceCents()),
                            c.createdAt(), c.createdBy());
                }).toList(),
                d.closures().stream().map(c -> new ClosureDto(c.action(), c.reason(),
                        c.productRevenueCents() == null ? null : Long.toString(c.productRevenueCents() + c.serviceRevenueCents()),
                        c.occurredAt(), c.actor())).toList(),
                text(d.differenceCents()));
        return ResponseEntity.status(status).eTag("\"" + d.version() + "\"").body(dto);
    }

    private static String text(Long v) {
        return v == null ? null : Long.toString(v);
    }
}
