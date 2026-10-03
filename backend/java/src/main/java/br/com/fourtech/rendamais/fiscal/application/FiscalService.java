package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import br.com.fourtech.rendamais.financeiro.api.TitleIssuanceApi;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.fiscal.domain.SimplesCalculation;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Apuração do Simples Nacional (Sprint 12, mock "Apuração do Simples Nacional"): receita da competência por anexo com as
 * notas, RBT12 mês a mês, cálculo do DAS por anexo e por tributo com memória, transmissão do PGDAS-D registrada, guia DAS
 * (o valor declarado, com o título a pagar), fechamento por etapas, encerramento e reabertura, e as revisões dos
 * parâmetros. O cálculo do Renda+ nunca substitui o valor da guia (ADR-011): a diferença entre os dois aparece.
 */
@Service
public class FiscalService {

    static final String ENTITY = "tax_period";
    static final String PARAMETER_ENTITY = "tax_parameter_revision";
    /** Origem do título a pagar do DAS: {@code competência:nº da guia}. */
    public static final String DAS_ORIGIN = "TAX_PERIOD";
    /** Beneficiário do DAS: "Receita Federal — DAS", semeado pela migração V13 (decisão do PO na Sprint 8). */
    public static final UUID DAS_BENEFICIARY = UUID.fromString("00000000-0000-0000-0000-0000000000da");
    /** Categoria de despesa do DAS (semeada pela V13). */
    static final String DAS_CATEGORY = "IMPOSTOS_SIMPLES";
    /** Dia do vencimento do DAS no mês seguinte à competência. */
    static final int DAS_DUE_DAY = 20;

    /** Etapas do fechamento: código, nome, responsável e se se conclui sozinha pelos dados. */
    public enum Step {
        NOTAS_CONFERIDAS("Conferir notas de saída da competência", "Fiscal", false),
        NOTAS_AUTORIZADAS("Autorizar as notas pendentes", "Faturamento", true),
        CANCELAMENTOS_CONFERIDOS("Conferir cancelamentos e devoluções", "Fiscal", false),
        RECEITA_SEGREGADA("Segregar a receita por anexo", "Fiscal", true),
        RBT12_CONFERIDO("Conferir o RBT12 e as faixas", "Fiscal", false),
        PGDAS_TRANSMITIDO("Transmitir o PGDAS-D", "Fiscal", true),
        DAS_PAGO("Gerar e pagar o DAS", "Financeiro", true);

        private final String label;
        private final String responsible;
        private final boolean automatic;

        Step(String label, String responsible, boolean automatic) {
            this.label = label;
            this.responsible = responsible;
            this.automatic = automatic;
        }

        public String label() {
            return label;
        }

        public String responsible() {
            return responsible;
        }

        public boolean automatic() {
            return automatic;
        }
    }

    private final TaxRepository repository;
    private final FiscalLedger ledger;
    private final DocumentQueryApi documents;
    private final TitleIssuanceApi titleIssuance;
    private final TitleQueryApi titleQuery;
    private final TaxSetupRepository setup;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final JsonMapper json;
    private final Clock clock;

    public FiscalService(TaxRepository repository, FiscalLedger ledger, DocumentQueryApi documents, TitleIssuanceApi titleIssuance,
                         TitleQueryApi titleQuery, TaxSetupRepository setup, AuditTrail audit, AuditQuery auditQuery, Outbox outbox,
                         CommandReceipts receipts, JsonMapper json, Clock clock) {
        this.repository = repository;
        this.ledger = ledger;
        this.documents = documents;
        this.titleIssuance = titleIssuance;
        this.titleQuery = titleQuery;
        this.setup = setup;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.json = json;
        this.clock = clock;
    }

    public record InformRequest(String amountCents, String informedBy, String notes) { }

    public record DeclareRequest(String transmittedOn, String receiptNumber, String declaredRevenueCents, String notes) { }

    public record GuideRequest(String documentNumber, String dueDate, String principalCents, String fineCents, String interestCents,
                               String notes) { }

    public record StepRequest(Boolean done, String notes) { }

    public record BracketRequest(String upToCents, String rate, String deductionCents, List<String> shares) { }

    public record AnnexRequest(List<String> taxes, List<BracketRequest> brackets) { }

    public record ParametersRequest(String validFrom, Map<String, AnnexRequest> annexes, String source, String notes) { }

    /**
     * Cálculo mostrado: o último gravado (GRAVADO) ou, sem nenhum, a prévia com os dados de agora (PREVIA). {@code memory}
     * traz a receita, o RBT12, os anexos com a repartição, os tributos, os avisos e os motivos.
     */
    public record CalcView(String source, Integer seq, String result, Integer parameterRevision, Long rbt12Cents, String rbt12Origin,
                           long revenueCents, Long totalTaxCents, JsonNode memory, Instant createdAt, String createdBy) { }

    /** Etapa do fechamento: concluída (pelos dados ou à mão), com quem e quando, e o que falta. */
    public record StepView(Step step, boolean done, Instant doneAt, String doneBy, String detail) { }

    /** Guia com o título do DAS (situação e saldo de hoje) e a data do pagamento. */
    public record GuideView(TaxRepository.DasGuide guide, TitleQueryApi.TitleView title, LocalDate paidOn) {
        public String status() {
            if (guide.totalCents() == 0) return "PAGO";
            if (title == null || "CANCELLED".equals(title.status())) return "SUBSTITUIDA";
            return "SETTLED".equals(title.status()) ? "PAGO" : "ABERTO";
        }
    }

    /** Uma linha da aba RBT12: a receita do mês, o RBT12 que valeu para ele, a faixa (no Anexo II) e a alíquota efetiva média. */
    public record MonthRow(YearMonth competence, Long revenueCents, Long rbt12Cents, Integer bracket, BigDecimal effectiveRate) { }

    /** Linha do Histórico de competências. */
    public record PeriodSummary(YearMonth competence, String status, long version, long revenueCents, boolean revenueKnown,
                                Long rbt12Cents, BigDecimal effectiveRate, Long calculatedCents, boolean calculationStored,
                                GuideView guide) { }

    /** Ficha da competência, com tudo o que as abas mostram. */
    public record PeriodDetail(YearMonth competence, String status, long version, FiscalLedger.Month revenue,
                               List<DocumentQueryApi.AnnexPart> parts, FiscalLedger.Rbt12View rbt12, TaxParameters parameters,
                               CalcView calculation, List<TaxRepository.Simulation> simulations, List<GuideView> guides,
                               List<TaxRepository.Declaration> declarations, List<StepView> steps, List<TaxRepository.Closure> closures,
                               List<MonthRow> rbt12Months, LocalDate dasDueDate, Long differenceCents, long yearToDateCents,
                               TaxSetupRepository.Profile profile, List<String> alerts, TaxRepository.Period period) { }

    // ───────────── Consultas ─────────────

    /** Histórico de competências do ano, da mais recente para a mais antiga (até o mês corrente). */
    @Transactional(readOnly = true)
    public List<PeriodSummary> list(int year) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        YearMonth current = ledger.currentMonth();
        YearMonth from = YearMonth.of(year, 1);
        YearMonth to = YearMonth.of(year, 12).isAfter(current) ? current : YearMonth.of(year, 12);
        if (to.isBefore(from)) return List.of();
        Map<YearMonth, FiscalLedger.Month> book = ledger.months(from.minusMonths(12), to);
        Map<YearMonth, TaxRepository.Period> periods = new LinkedHashMap<>();
        repository.findBetween(from, to).forEach(p -> periods.put(p.competence(), p));
        List<UUID> ids = periods.values().stream().map(TaxRepository.Period::id).toList();
        Map<UUID, TaxRepository.Simulation> sims = repository.latestSimulations(ids);
        Map<UUID, GuideView> guides = latestGuideViews(ids);
        List<PeriodSummary> out = new ArrayList<>();
        for (YearMonth m = to; !m.isBefore(from); m = m.minusMonths(1)) {
            TaxRepository.Period p = periods.get(m);
            FiscalLedger.Month month = book.get(m);
            SimplesCalculation.Result preview = ledger.preview(m, book, p == null ? null : p.informedRbt12Cents());
            TaxRepository.Simulation s = p == null ? null : sims.get(p.id());
            FiscalLedger.Rbt12View rb = ledger.rbt12(m, p == null ? null : p.informedRbt12Cents(), book);
            Long calc = s != null ? s.totalTaxCents() : preview.totalTaxCents();
            out.add(new PeriodSummary(m, p == null ? TaxRepository.EM_APURACAO : p.status(), p == null ? 0 : p.version(),
                    month.totalCents(), month.known() || !m.isBefore(ledger.revenueStart()), rb.used() == null ? null : rb.used().cents(),
                    average(calc, month.totalCents()), calc, s != null, p == null ? null : guides.get(p.id())));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public PeriodDetail detail(String competence) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return detail(month(competence));
    }

    private PeriodDetail detail(YearMonth c) {
        Optional<TaxRepository.Period> p = repository.find(c);
        Long informed = p.map(TaxRepository.Period::informedRbt12Cents).orElse(null);
        Map<YearMonth, FiscalLedger.Month> book = ledger.months(c.minusMonths(23), c);
        FiscalLedger.Month revenue = ledger.month(c);
        book.put(c, revenue);
        List<DocumentQueryApi.AnnexPart> parts = documents.parts(c);
        FiscalLedger.Rbt12View rbt12 = ledger.rbt12(c, informed, book);
        List<TaxRepository.Simulation> sims = p.map(x -> repository.simulations(x.id())).orElse(List.of());
        List<GuideView> guides = guideViews(p.map(x -> repository.guides(x.id())).orElse(List.of()));
        List<TaxRepository.Declaration> declarations = p.map(x -> repository.declarations(x.id())).orElse(List.of());
        List<TaxRepository.ClosingStep> manual = p.map(x -> repository.closingSteps(x.id())).orElse(List.of());
        CalcView calc = sims.isEmpty() ? previewView(c, book, informed) : storedView(sims.getFirst());
        List<StepView> steps = steps(parts, manual, declarations, guides);
        List<MonthRow> rows = new ArrayList<>();
        for (YearMonth m = c; m.isAfter(c.minusMonths(12)); m = m.minusMonths(1)) {
            FiscalLedger.Month x = book.get(m);
            SimplesCalculation.Result r = ledger.preview(m, book, m.equals(c) ? informed : null);
            FiscalLedger.Rbt12View rv = ledger.rbt12(m, m.equals(c) ? informed : null, book);
            SimplesCalculation.AnnexResult ii = r.calculable() ? r.of(Annex.II) : null;
            boolean known = x.known() || m.equals(c);
            rows.add(new MonthRow(m, known ? x.totalCents() : null, rv.used() == null ? null : rv.used().cents(),
                    ii == null ? null : ii.bracket(), average(r.totalTaxCents(), x.totalCents())));
        }
        Long difference = null;
        if (!guides.isEmpty() && !sims.isEmpty() && sims.getFirst().totalTaxCents() != null) {
            difference = guides.getFirst().guide().principalCents() - sims.getFirst().totalTaxCents();
        }
        TaxSetupRepository.Profile profile = setup.profile();
        long ytd = ledger.yearToDate(c, book);
        return new PeriodDetail(c, p.map(TaxRepository.Period::status).orElse(TaxRepository.EM_APURACAO), p.map(TaxRepository.Period::version).orElse(0L),
                revenue, parts, rbt12, repository.parametersFor(c).orElse(null), calc, sims, guides, declarations, steps,
                p.map(x -> repository.closures(x.id())).orElse(List.of()), rows, c.plusMonths(1).atDay(DAS_DUE_DAY), difference, ytd,
                profile, alerts(c, revenue, parts, sims, calc, ytd, rbt12, profile), p.orElse(null));
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(String competence) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return repository.find(month(competence)).map(p -> auditQuery.history(ENTITY, p.id().toString())).orElse(List.of());
    }

    /** Guias com o título do DAS e a data do pagamento, na ordem recebida. */
    List<GuideView> guideViews(List<TaxRepository.DasGuide> guides) {
        List<UUID> ids = guides.stream().map(TaxRepository.DasGuide::titleId).filter(Objects::nonNull).toList();
        Map<UUID, TitleQueryApi.TitleView> titles = new LinkedHashMap<>();
        titleQuery.byIds(ids).forEach(t -> titles.put(t.id(), t));
        Map<UUID, LocalDate> paid = titleQuery.lastSettlementDates(ids);
        return guides.stream().map(g -> {
            TitleQueryApi.TitleView t = g.titleId() == null ? null : titles.get(g.titleId());
            return new GuideView(g, t, t != null && "SETTLED".equals(t.status()) ? paid.get(t.id()) : null);
        }).toList();
    }

    /** Guia mais recente de cada competência, pelo id da competência. */
    Map<UUID, GuideView> latestGuideViews(List<UUID> periodIds) {
        Map<UUID, GuideView> out = new LinkedHashMap<>();
        guideViews(new ArrayList<>(repository.latestGuides(periodIds).values())).forEach(v -> out.put(v.guide().periodId(), v));
        return out;
    }

    private List<StepView> steps(List<DocumentQueryApi.AnnexPart> parts, List<TaxRepository.ClosingStep> manual,
                                 List<TaxRepository.Declaration> declarations, List<GuideView> guides) {
        List<StepView> out = new ArrayList<>();
        for (Step s : Step.values()) {
            switch (s) {
                case NOTAS_AUTORIZADAS -> {
                    List<String> pending = parts.stream().filter(x -> "PENDENTE".equals(x.authorization()))
                            .map(x -> x.code() + " (nº " + x.number() + ")").distinct().toList();
                    out.add(new StepView(s, pending.isEmpty(), null, null,
                            pending.isEmpty() ? null : "Pendentes de autorização: " + String.join(", ", pending) + "."));
                }
                case RECEITA_SEGREGADA -> {
                    long lines = parts.stream().mapToLong(DocumentQueryApi.AnnexPart::defaultLines).sum();
                    out.add(new StepView(s, lines == 0, null, null,
                            lines == 0 ? null : lines + (lines == 1 ? " linha de nota com item" : " linhas de nota com itens")
                                    + " sem classificação fiscal (anexo padrão)."));
                }
                case PGDAS_TRANSMITIDO -> {
                    TaxRepository.Declaration d = declarations.isEmpty() ? null : declarations.getFirst();
                    out.add(new StepView(s, d != null, d == null ? null : d.createdAt(), d == null ? null : d.createdBy(),
                            d == null ? "Registre a transmissão do PGDAS-D." : "Recibo " + d.receiptNumber() + "."));
                }
                case DAS_PAGO -> {
                    GuideView g = guides.isEmpty() ? null : guides.getFirst();
                    boolean paid = g != null && "PAGO".equals(g.status());
                    out.add(new StepView(s, paid, null, null, g == null ? "Gere a guia DAS." : paid ? null : "Registre o pagamento da guia."));
                }
                default -> {
                    TaxRepository.ClosingStep m = manual.stream().filter(x -> x.step().equals(s.name())).findFirst().orElse(null);
                    out.add(new StepView(s, m != null, m == null ? null : m.doneAt(), m == null ? null : m.doneBy(),
                            m == null ? null : m.notes()));
                }
            }
        }
        return out;
    }

    private List<String> alerts(YearMonth c, FiscalLedger.Month revenue, List<DocumentQueryApi.AnnexPart> parts,
                                List<TaxRepository.Simulation> sims, CalcView calc, long ytd, FiscalLedger.Rbt12View rbt12,
                                TaxSetupRepository.Profile profile) {
        List<String> out = new ArrayList<>();
        parts.stream().filter(x -> "PENDENTE".equals(x.authorization())).map(x -> x.documentId()).distinct().forEach(id -> {
            DocumentQueryApi.AnnexPart x = parts.stream().filter(y -> y.documentId().equals(id)).findFirst().orElseThrow();
            long total = parts.stream().filter(y -> y.documentId().equals(id)).mapToLong(DocumentQueryApi.AnnexPart::cents).sum();
            out.add("A nota " + x.number() + " (" + x.customerName() + ", " + SimplesCalculation.brl(total)
                    + ") ainda aguarda autorização e já está somada na receita de " + SimplesCalculation.label(c) + ".");
        });
        long defaults = parts.stream().mapToLong(DocumentQueryApi.AnnexPart::defaultLines).sum();
        if (defaults > 0) out.add(defaults + (defaults == 1 ? " linha de nota usa" : " linhas de nota usam")
                + " o anexo padrão por falta de classificação fiscal do item.");
        if (!sims.isEmpty() && sims.getFirst().productRevenueCents() + sims.getFirst().serviceRevenueCents() != revenue.totalCents()) {
            out.add("A receita mudou depois do último cálculo: calcule de novo.");
        }
        long alert = new BigDecimal(profile.sublimitCents()).multiply(profile.alertThreshold()).setScale(0, RoundingMode.HALF_EVEN).longValue();
        if (ytd >= profile.sublimitCents()) {
            out.add("A receita de " + c.getYear() + " (" + SimplesCalculation.brl(ytd) + ") passou do sublimite de "
                    + SimplesCalculation.brl(profile.sublimitCents()) + ": ICMS e ISS saem do DAS no ano seguinte.");
        } else if (ytd >= alert) {
            out.add("A receita de " + c.getYear() + " (" + SimplesCalculation.brl(ytd) + ") já é "
                    + percent1(ytd, profile.sublimitCents()) + " do sublimite de " + SimplesCalculation.brl(profile.sublimitCents()) + ".");
        }
        if (rbt12.used() == null) out.add("RBT12 desconhecido: registre o histórico de receita ou informe o RBT12.");
        return out;
    }

    static String percent1(long part, long whole) {
        return BigDecimal.valueOf(part).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(whole), 1, RoundingMode.HALF_EVEN)
                .toPlainString().replace('.', ',') + "%";
    }

    static BigDecimal average(Long tax, long revenue) {
        if (tax == null || revenue <= 0) return null;
        return BigDecimal.valueOf(tax).divide(BigDecimal.valueOf(revenue), 6, RoundingMode.HALF_EVEN);
    }

    private CalcView previewView(YearMonth c, Map<YearMonth, FiscalLedger.Month> book, Long informed) {
        FiscalLedger.Rbt12View rb = ledger.rbt12(c, informed, book);
        TaxParameters params = repository.parametersFor(c).orElse(null);
        FiscalLedger.Month m = book.get(c);
        SimplesCalculation.Result r = SimplesCalculation.calculate(c, params, rb.used(), rb.missing(), m.forCalculation());
        var used = rb.used();
        return new CalcView("PREVIA", null, r.calculable() ? "CALCULADA" : "NAO_CALCULAVEL", params == null ? null : params.revision(),
                used == null ? null : used.cents(), used == null ? null : used.origin(), m.totalCents(), r.totalTaxCents(),
                json.valueToTree(memory(c, params, rb, m, r)), null, null);
    }

    private CalcView storedView(TaxRepository.Simulation s) {
        return new CalcView("GRAVADO", s.seq(), s.result(), s.parameterRevision(), s.rbt12Cents(), s.rbt12Origin(),
                s.productRevenueCents() + s.serviceRevenueCents(), s.totalTaxCents(), json.readTree(s.memory()), s.createdAt(), s.createdBy());
    }

    // ───────────── Comandos ─────────────

    /** Informa o RBT12 da competência (reserva para mês sem histórico), com quem informou; nova versão a cada alteração. */
    @Transactional
    public PeriodDetail informRbt12(String competence, long expectedVersion, InformRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_DECLARE);
        YearMonth c = month(competence);
        List<FieldIssue> issues = new ArrayList<>();
        Long amount = positive(r == null ? null : r.amountCents(), "amountCents", "Informe o RBT12 (maior que zero).", issues);
        String by = r == null || r.informedBy() == null ? "" : r.informedBy().strip();
        if (by.isEmpty() || by.length() > 100) issues.add(new FieldIssue("informedBy", "Informe quem passou o valor (até 100 caracteres)."));
        String notes = notes(r == null ? null : r.notes(), issues);
        invalid(issues);
        Instant at = clock.instant();
        TaxRepository.Period p = open(c, expectedVersion, at, user);
        TaxRepository.Period changed = new TaxRepository.Period(p.id(), c, p.status(), amount, by, notes, p.version() + 1, p.createdAt(),
                p.createdBy(), at, user.username());
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("informedRbt12", new AuditEntry.Change(p.informedRbt12Cents() == null ? null : brl(p.informedRbt12Cents()), brl(amount)));
        changes.put("informedBy", new AuditEntry.Change(p.informedBy(), by));
        audit.record(new AuditEntry(user.username(), "TAX_RBT12_INFORMED", ENTITY, p.id().toString(), changed.version(), notes, changes,
                CorrelationId.current()));
        return detail(c);
    }

    /** Calcula a competência com os parâmetros vigentes e o RBT12 conhecido; a mesma chave não repete o cálculo. */
    @Transactional
    public PeriodDetail simulate(String competence, String idempotencyKey) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_SIMULATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        YearMonth c = month(competence);
        var done = receipts.claim(user.username(), key, "RecordTaxSimulation", Map.of("competence", c.toString()));
        if (done.isPresent()) return detail(c);
        Instant at = clock.instant();
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        requireOpen(p);
        FiscalLedger.Month revenue = ledger.month(c);
        FiscalLedger.Rbt12View rbt12 = ledger.rbt12(c, p.informedRbt12Cents());
        TaxParameters parameters = repository.parametersFor(c).orElse(null);
        SimplesCalculation.Result result = SimplesCalculation.calculate(c, parameters, rbt12.used(), rbt12.missing(), revenue.forCalculation());
        List<TaxRepository.Simulation> previous = repository.simulations(p.id());
        SimplesCalculation.Rbt12 used = rbt12.used();
        long service = revenue.byAnnex().getOrDefault(Annex.III, 0L);
        long product = revenue.totalCents() - service;
        Long serviceTax = null;
        Long productTax = null;
        if (result.calculable()) {
            SimplesCalculation.AnnexResult iii = result.of(Annex.III);
            serviceTax = iii == null ? 0 : iii.taxCents();
            productTax = result.totalTaxCents() - serviceTax;
        }
        Map<String, Object> memory = memory(c, parameters, rbt12, revenue, result);
        TaxRepository.Simulation s = new TaxRepository.Simulation(UUID.randomUUID(), p.id(), previous.size() + 1,
                result.calculable() ? "CALCULADA" : "NAO_CALCULAVEL", parameters == null ? null : parameters.id(),
                parameters == null ? null : parameters.revision(), used == null ? null : used.cents(), used == null ? null : used.origin(),
                product, service, productTax, serviceTax, result.totalTaxCents(), json.writeValueAsString(memory.get("annexes")),
                json.writeValueAsString(memory.get("taxes")), json.writeValueAsString(memory), at, user.username());
        repository.insertSimulation(s);
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("simulation", new AuditEntry.Change(null, "Cálculo " + s.seq()));
        changes.put("result", new AuditEntry.Change(null, result.calculable() ? brl(s.totalTaxCents()) : "Não calculável"));
        audit.record(new AuditEntry(user.username(), "TAX_SIMULATION_RECORDED", ENTITY, p.id().toString(), changed.version(),
                result.calculable() ? null : String.join(" ", result.reasons()), changes, CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taxPeriodId", p.id().toString());
        payload.put("competence", c.toString());
        payload.put("parameterRevision", s.parameterRevision());
        payload.put("result", s.totalTaxCents() == null ? null : Long.toString(s.totalTaxCents()));
        payload.put("status", s.result());
        outbox.append("TaxSimulationRecorded", ENTITY, p.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, s.id().toString());
        return detail(c);
    }

    /** Memória do cálculo: receita por anexo, origem do RBT12 (mês a mês), revisão usada, faixa, fórmula e repartição. */
    private Map<String, Object> memory(YearMonth c, TaxParameters parameters, FiscalLedger.Rbt12View rbt12, FiscalLedger.Month revenue,
                                       SimplesCalculation.Result result) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("competence", c.toString());
        m.put("parameterRevision", parameters == null ? null : parameters.revision());
        m.put("parameterValidFrom", parameters == null ? null : parameters.validFrom().toString());
        m.put("parameterSource", parameters == null ? null : parameters.source());
        SimplesCalculation.Rbt12 used = rbt12.used();
        m.put("rbt12Cents", used == null ? null : Long.toString(used.cents()));
        m.put("rbt12Origin", used == null ? null : used.origin());
        m.put("rbt12Months", rbt12.months().stream().map(e -> Map.of("competence", e.competence().toString(), "cents",
                Long.toString(e.totalCents()), "origin", e.origin())).toList());
        m.put("rbt12Missing", rbt12.missing().stream().map(YearMonth::toString).toList());
        m.put("informedRbt12Cents", rbt12.informedCents() == null ? null : Long.toString(rbt12.informedCents()));
        Map<String, String> rev = new LinkedHashMap<>();
        revenue.forCalculation().forEach((a, v) -> rev.put(a.name(), Long.toString(v)));
        m.put("revenue", rev);
        m.put("revenueCents", Long.toString(revenue.totalCents()));
        m.put("totalTaxCents", result.totalTaxCents() == null ? null : Long.toString(result.totalTaxCents()));
        m.put("reasons", result.reasons());
        m.put("warnings", result.warnings());
        m.put("annexes", result.annexes().stream().map(k -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("annex", k.annex().name());
            x.put("label", k.annex().label());
            x.put("bracket", k.bracket());
            x.put("nominalRate", k.nominalRate().toPlainString());
            x.put("deductionCents", Long.toString(k.deductionCents()));
            x.put("effectiveRate", k.effectiveRate().toPlainString());
            x.put("revenueCents", Long.toString(k.revenueCents()));
            x.put("taxCents", Long.toString(k.taxCents()));
            x.put("issExcessCents", Long.toString(k.issExcessCents()));
            x.put("taxes", k.taxes().stream().map(t -> Map.of("tax", t.tax(), "share", t.share().toPlainString(),
                    "cents", Long.toString(t.cents()))).toList());
            return x;
        }).toList());
        Map<String, String> taxes = new LinkedHashMap<>();
        result.taxes().forEach((k, v) -> taxes.put(k, Long.toString(v)));
        m.put("taxes", taxes);
        return m;
    }

    /** Registra a transmissão do PGDAS-D feita no portal (o Renda+ não transmite): data, recibo e receita declarada. */
    @Transactional
    public PeriodDetail declare(String competence, long expectedVersion, DeclareRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_DECLARE);
        YearMonth c = month(competence);
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate on = date(r == null ? null : r.transmittedOn(), "transmittedOn", "Informe a data da transmissão.", issues);
        if (on != null && on.isAfter(LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE)))) {
            issues.add(new FieldIssue("transmittedOn", "A transmissão não pode ter data futura."));
        }
        String receipt = r == null || r.receiptNumber() == null ? "" : r.receiptNumber().strip();
        if (receipt.isEmpty() || receipt.length() > 40) issues.add(new FieldIssue("receiptNumber", "Informe o número do recibo (até 40 caracteres)."));
        Long declared = null;
        if (r != null && r.declaredRevenueCents() != null && !r.declaredRevenueCents().isBlank()) {
            declared = nonNegative(r.declaredRevenueCents(), "declaredRevenueCents", issues);
        }
        String notes = notes(r == null ? null : r.notes(), issues);
        invalid(issues);
        Instant at = clock.instant();
        TaxRepository.Period p = open(c, expectedVersion, at, user);
        long revenue = declared != null ? declared : ledger.month(c).totalCents();
        List<TaxRepository.Declaration> previous = repository.declarations(p.id());
        TaxRepository.Declaration d = new TaxRepository.Declaration(UUID.randomUUID(), p.id(), previous.size() + 1, on, receipt, revenue,
                notes, at, user.username());
        repository.insertDeclaration(d);
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("pgdasReceipt", new AuditEntry.Change(previous.isEmpty() ? null : previous.getFirst().receiptNumber(), receipt));
        changes.put("transmittedOn", new AuditEntry.Change(null, on.toString()));
        changes.put("declaredRevenue", new AuditEntry.Change(null, brl(revenue)));
        audit.record(new AuditEntry(user.username(), "TAX_DECLARATION_RECORDED", ENTITY, p.id().toString(), changed.version(), notes,
                changes, CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taxPeriodId", p.id().toString());
        payload.put("competence", c.toString());
        payload.put("receiptNumber", receipt);
        payload.put("transmittedOn", on.toString());
        payload.put("declaredRevenueCents", Long.toString(revenue));
        outbox.append("TaxDeclarationRecorded", ENTITY, p.id().toString(), payload, user.username());
        return detail(c);
    }

    /**
     * Gera a guia DAS: número do documento, vencimento, principal (o declarado), multa e juros. Na mesma transação nasce o
     * título a pagar do DAS (Sprint 8): gerar de novo cancela o título anterior sem pagamento e cria outro, para haver um
     * só DAS ativo na competência; DAS com pagamento recusa ({@code TAX_DAS_PAID}); total zero não cria título.
     */
    @Transactional
    public PeriodDetail issueGuide(String competence, long expectedVersion, GuideRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_DAS_ISSUE);
        YearMonth c = month(competence);
        List<FieldIssue> issues = new ArrayList<>();
        Long principal = nonNegative(r == null ? null : r.principalCents(), "principalCents", issues);
        Long fine = r == null || r.fineCents() == null || r.fineCents().isBlank() ? Long.valueOf(0) : nonNegative(r.fineCents(), "fineCents", issues);
        Long interest = r == null || r.interestCents() == null || r.interestCents().isBlank() ? Long.valueOf(0)
                : nonNegative(r.interestCents(), "interestCents", issues);
        LocalDate due = date(r == null ? null : r.dueDate(), "dueDate", "Informe o vencimento.", issues);
        String number = r == null || r.documentNumber() == null || r.documentNumber().isBlank() ? null : r.documentNumber().strip();
        if (number != null && number.length() > 30) issues.add(new FieldIssue("documentNumber", "Máximo de 30 caracteres."));
        String notes = notes(r == null ? null : r.notes(), issues);
        invalid(issues);
        Instant at = clock.instant();
        TaxRepository.Period p = open(c, expectedVersion, at, user);
        List<TaxRepository.Simulation> sims = repository.simulations(p.id());
        List<TaxRepository.DasGuide> previous = repository.guides(p.id());
        int seq = previous.size() + 1;
        String label = SimplesCalculation.label(c);
        List<TitleQueryApi.TitleView> activeDas = titleQuery.byIds(previous.stream().map(TaxRepository.DasGuide::titleId)
                .filter(Objects::nonNull).toList()).stream().filter(t -> !"CANCELLED".equals(t.status())).toList();
        for (TitleQueryApi.TitleView t : activeDas) {
            if (t.receivedCents() > 0) {
                throw new RuleViolationException("TAX_DAS_PAID", "O DAS " + t.code() + " da competência " + label + " tem pagamento de "
                        + brl(t.receivedCents()) + "; estorne o pagamento do DAS antes de gerar outra guia.",
                        List.of(new FieldIssue("principalCents", "DAS " + t.code() + " com pagamento.")));
            }
        }
        if (!activeDas.isEmpty()) {
            titleIssuance.cancelOpen(DAS_ORIGIN, activeDas.stream().map(TitleQueryApi.TitleView::originId).toList(),
                    "Substituído pela guia " + seq + " do DAS.");
        }
        long total = principal + fine + interest;
        UUID titleId = null;
        if (total > 0) {
            titleId = titleIssuance.issuePayables(new TitleIssuanceApi.PayableRequest(DAS_ORIGIN, DAS_BENEFICIARY, null,
                    LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE)), DAS_CATEGORY, c, List.of(new TitleIssuanceApi.Installment(c + ":" + seq, due,
                    Money.ofCents(total, Currency.BRL), "DAS " + label)))).getFirst();
        }
        TaxRepository.DasGuide g = new TaxRepository.DasGuide(UUID.randomUUID(), p.id(), seq, number, principal, fine, interest, due, notes,
                sims.isEmpty() ? null : sims.getFirst().id(), titleId, at, user.username());
        repository.insertGuide(g);
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("dasTotal", new AuditEntry.Change(previous.isEmpty() ? null : brl(previous.getFirst().totalCents()), brl(total)));
        changes.put("dueDate", new AuditEntry.Change(previous.isEmpty() ? null : previous.getFirst().dueDate().toString(), due.toString()));
        if (number != null) changes.put("documentNumber", new AuditEntry.Change(null, number));
        if (!sims.isEmpty() && sims.getFirst().totalTaxCents() != null) {
            changes.put("difference", new AuditEntry.Change(null, brl(principal - sims.getFirst().totalTaxCents())));
        }
        if (titleId != null || !activeDas.isEmpty()) {
            String das = titleId == null ? null : titleQuery.byIds(List.of(titleId)).getFirst().code();
            changes.put("dasTitle", new AuditEntry.Change(activeDas.isEmpty() ? null : activeDas.getFirst().code(), das));
        }
        audit.record(new AuditEntry(user.username(), "TAX_DAS_GUIDE_ISSUED", ENTITY, p.id().toString(), changed.version(), notes, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taxPeriodId", p.id().toString());
        payload.put("competence", c.toString());
        payload.put("documentNumber", number);
        payload.put("totalCents", Long.toString(total));
        payload.put("dueDate", due.toString());
        payload.put("titleId", titleId == null ? null : titleId.toString());
        outbox.append("TaxDasGuideIssued", ENTITY, p.id().toString(), payload, user.username());
        return detail(c);
    }

    /** Conclui ou desfaz uma etapa manual do fechamento (as automáticas seguem os dados). */
    @Transactional
    public PeriodDetail closingStep(String competence, String stepCode, long expectedVersion, StepRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_CLOSE_STEP);
        YearMonth c = month(competence);
        Step step;
        try {
            step = Step.valueOf(stepCode == null ? "" : stepCode.strip());
        } catch (IllegalArgumentException e) {
            throw new RuleViolationException("TAX_INVALID", "Etapa desconhecida.", List.of(new FieldIssue("step", "Etapa desconhecida.")));
        }
        if (step.automatic()) {
            throw new RuleViolationException("TAX_INVALID", "A etapa \"" + step.label() + "\" se conclui sozinha pelos dados.",
                    List.of(new FieldIssue("step", "Etapa automática.")));
        }
        List<FieldIssue> issues = new ArrayList<>();
        String notes = notes(r == null ? null : r.notes(), issues);
        invalid(issues);
        boolean done = r == null || r.done() == null || r.done();
        Instant at = clock.instant();
        TaxRepository.Period p = open(c, expectedVersion, at, user);
        boolean was = repository.closingSteps(p.id()).stream().anyMatch(x -> x.step().equals(step.name()));
        if (was == done) return detail(c);
        if (done) repository.insertClosingStep(new TaxRepository.ClosingStep(p.id(), step.name(), at, user.username(), notes));
        else repository.deleteClosingStep(p.id(), step.name());
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        audit.record(new AuditEntry(user.username(), done ? "TAX_CLOSING_STEP_COMPLETED" : "TAX_CLOSING_STEP_UNDONE", ENTITY,
                p.id().toString(), changed.version(), notes, Map.of("step", new AuditEntry.Change(done ? null : step.label(),
                done ? step.label() : null)), CorrelationId.current()));
        if (done) {
            outbox.append("TaxClosingStepCompleted", ENTITY, p.id().toString(), Map.of("taxPeriodId", p.id().toString(),
                    "competence", c.toString(), "step", step.name()), user.username());
        }
        return detail(c);
    }

    /** Encerra a competência com as 7 etapas concluídas: congela a receita, o cálculo e a guia; encerrar de novo não muda nada. */
    @Transactional
    public PeriodDetail close(String competence, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_CLOSE);
        YearMonth c = month(competence);
        Instant at = clock.instant();
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        if (p.closed()) return detail(c);
        if (p.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, p.version());
        PeriodDetail d = detail(c);
        List<String> pending = d.steps().stream().filter(s -> !s.done()).map(s -> s.step().label()).toList();
        if (!pending.isEmpty()) {
            throw new RuleViolationException("TAX_PERIOD_INVALID", "Conclua as etapas do fechamento antes de encerrar a competência "
                    + SimplesCalculation.label(c) + ": " + String.join("; ", pending) + ".",
                    List.of(new FieldIssue("steps", pending.size() + (pending.size() == 1 ? " etapa pendente." : " etapas pendentes."))));
        }
        List<TaxRepository.Simulation> sims = repository.simulations(p.id());
        List<TaxRepository.DasGuide> guides = repository.guides(p.id());
        long service = d.revenue().byAnnex().getOrDefault(Annex.III, 0L);
        repository.insertClosure(new TaxRepository.Closure(UUID.randomUUID(), p.id(), "FECHAMENTO", null, d.revenue().totalCents() - service,
                service, sims.isEmpty() ? null : sims.getFirst().id(), guides.isEmpty() ? null : guides.getFirst().id(), at, user.username()));
        TaxRepository.Period changed = withStatus(p, TaxRepository.ENCERRADA, at, user);
        repository.update(changed, p.version());
        audit.record(new AuditEntry(user.username(), "TAX_PERIOD_CLOSED", ENTITY, p.id().toString(), changed.version(), null,
                Map.of("status", new AuditEntry.Change("Em apuração", "Encerrada"),
                        "revenue", new AuditEntry.Change(null, brl(d.revenue().totalCents()))), CorrelationId.current()));
        outbox.append("TaxPeriodClosed", ENTITY, p.id().toString(), Map.of("taxPeriodId", p.id().toString(), "competence", c.toString()),
                user.username());
        return detail(c);
    }

    /** Reabre a competência encerrada, com motivo. */
    @Transactional
    public PeriodDetail reopen(String competence, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_REOPEN);
        YearMonth c = month(competence);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("TAX_PERIOD_INVALID", "Informe o motivo da reabertura.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Instant at = clock.instant();
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        if (p.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, p.version());
        if (!p.closed()) throw new InvalidStateException("A competência " + SimplesCalculation.label(c) + " não está encerrada.");
        repository.insertClosure(new TaxRepository.Closure(UUID.randomUUID(), p.id(), "REABERTURA", why, null, null, null, null, at,
                user.username()));
        TaxRepository.Period changed = withStatus(p, TaxRepository.EM_APURACAO, at, user);
        repository.update(changed, p.version());
        audit.record(new AuditEntry(user.username(), "TAX_PERIOD_REOPENED", ENTITY, p.id().toString(), changed.version(), why,
                Map.of("status", new AuditEntry.Change("Encerrada", "Em apuração")), CorrelationId.current()));
        outbox.append("TaxPeriodReopened", ENTITY, p.id().toString(), Map.of("taxPeriodId", p.id().toString(), "competence", c.toString(),
                "reason", why), user.username());
        return detail(c);
    }

    // ───────────── Parâmetros ─────────────

    @Transactional(readOnly = true)
    public List<TaxParameters> parameters() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return repository.parameters();
    }

    /** Nova revisão dos parâmetros por anexo, com a repartição e a vigência; a mesma chave devolve a mesma revisão. */
    @Transactional
    public TaxParameters revise(String idempotencyKey, ParametersRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PARAMETER_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "ReviseTaxParameters", r == null ? Map.of() : r);
        if (done.isPresent()) {
            UUID id = UUID.fromString(done.get());
            return repository.parameters().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
        }
        List<FieldIssue> issues = new ArrayList<>();
        YearMonth validFrom = null;
        try {
            validFrom = YearMonth.parse(r == null || r.validFrom() == null ? "" : r.validFrom().strip());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("validFrom", "Informe a vigência (AAAA-MM)."));
        }
        Map<Annex, TaxParameters.AnnexTable> annexes = new EnumMap<>(Annex.class);
        if (r != null && r.annexes() != null) {
            r.annexes().forEach((name, raw) -> {
                Annex annex = Annex.parse(name);
                if (annex == null) {
                    issues.add(new FieldIssue("annexes." + name, "Anexo desconhecido; use I, II, III, IV ou V."));
                    return;
                }
                List<TaxParameters.Bracket> list = new ArrayList<>();
                List<BracketRequest> brackets = raw == null || raw.brackets() == null ? List.of() : raw.brackets();
                for (int i = 0; i < brackets.size(); i++) {
                    BracketRequest b = brackets.get(i);
                    try {
                        List<BigDecimal> shares = b.shares() == null ? List.of() : b.shares().stream().map(s -> new BigDecimal(s.strip())).toList();
                        list.add(new TaxParameters.Bracket(Long.parseLong(b.upToCents().strip()), new BigDecimal(b.rate().strip()),
                                Long.parseLong(b.deductionCents().strip()), shares));
                    } catch (RuntimeException e) {
                        issues.add(new FieldIssue("annexes." + annex.name() + ".brackets[" + i + "]",
                                "Faixa inválida: limite e parcela em centavos, alíquota e repartição como fração (ex.: 0.078)."));
                    }
                }
                annexes.put(annex, new TaxParameters.AnnexTable(raw == null || raw.taxes() == null ? List.of()
                        : raw.taxes().stream().map(t -> t == null ? "" : t.strip()).toList(), list));
            });
        }
        String source = r == null ? null : r.source();
        TaxParameters.validate(annexes, source, issues);
        String notes = notes(r == null ? null : r.notes(), issues);
        TaxParameters.requireValid(issues);
        int revision = repository.lockNextRevision();
        TaxParameters p = new TaxParameters(UUID.randomUUID(), revision, TaxParameters.SIMPLES_NACIONAL, validFrom, TaxParameters.copy(annexes),
                source.strip(), notes, clock.instant(), user.username());
        repository.insertParameters(p);
        audit.record(new AuditEntry(user.username(), "TAX_PARAMETERS_REVISED", PARAMETER_ENTITY, p.id().toString(), revision, notes,
                Map.of("revision", new AuditEntry.Change(null, Integer.toString(revision)),
                        "validFrom", new AuditEntry.Change(null, validFrom.toString()),
                        "annexes", new AuditEntry.Change(null, String.join(", ", annexes.keySet().stream().map(Annex::name).toList()))),
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("parameterId", p.id().toString());
        payload.put("revision", revision);
        payload.put("validFrom", validFrom.toString());
        payload.put("confirmedBy", p.source());
        outbox.append("TaxParameterRevised", PARAMETER_ENTITY, p.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, p.id().toString());
        return p;
    }

    // ───────────── Apoio ─────────────

    /** Competência bloqueada, em apuração e na versão lida pelo cliente. */
    private TaxRepository.Period open(YearMonth c, long expectedVersion, Instant at, CurrentUser user) {
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        requireOpen(p);
        if (p.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, p.version());
        return p;
    }

    private static void requireOpen(TaxRepository.Period p) {
        if (p.closed()) {
            String label = SimplesCalculation.label(p.competence());
            throw new RuleViolationException("TAX_PERIOD_CLOSED", "A competência " + label + " está encerrada; reabra para alterar.",
                    List.of(new FieldIssue("competence", "Competência " + label + " encerrada.")));
        }
    }

    private static TaxRepository.Period bump(TaxRepository.Period p, Instant at, CurrentUser user) {
        return withStatus(p, p.status(), at, user);
    }

    private static TaxRepository.Period withStatus(TaxRepository.Period p, String status, Instant at, CurrentUser user) {
        return new TaxRepository.Period(p.id(), p.competence(), status, p.informedRbt12Cents(), p.informedBy(), p.informedNotes(),
                p.version() + 1, p.createdAt(), p.createdBy(), at, user.username());
    }

    static YearMonth month(String raw) {
        try {
            return YearMonth.parse(Objects.requireNonNull(raw).strip());
        } catch (RuntimeException e) {
            throw new RuleViolationException("TAX_INVALID", "Competência inválida; use AAAA-MM.",
                    List.of(new FieldIssue("competence", "Use AAAA-MM.")));
        }
    }

    static Long positive(String raw, String field, String missing, List<FieldIssue> issues) {
        try {
            Money m = Money.parseCents(raw == null ? null : raw.strip(), Currency.BRL);
            if (m.cents() > 0) return m.cents();
        } catch (IllegalArgumentException e) {
            // cai na mensagem abaixo
        }
        issues.add(new FieldIssue(field, missing));
        return null;
    }

    static Long nonNegative(String raw, String field, List<FieldIssue> issues) {
        try {
            Money m = Money.parseCents(raw == null ? null : raw.strip(), Currency.BRL);
            if (!m.isNegative()) return m.cents();
            issues.add(new FieldIssue(field, "O valor não pode ser negativo."));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Informe o valor."));
        }
        return null;
    }

    static LocalDate date(String raw, String field, String missing, List<FieldIssue> issues) {
        try {
            return LocalDate.parse(raw == null ? "" : raw.strip());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue(field, missing));
            return null;
        }
    }

    static String notes(String raw, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) return null;
        if (raw.strip().length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        return raw.strip();
    }

    static void invalid(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("TAX_INVALID", "Corrija os campos indicados.", issues);
    }

    static String brl(long cents) {
        return Money.ofCents(cents, Currency.BRL).toBrl();
    }
}
