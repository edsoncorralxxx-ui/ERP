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
import br.com.fourtech.rendamais.fiscal.domain.RevenueKind;
import br.com.fourtech.rendamais.fiscal.domain.SimplesSimulation;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Fiscal gerencial (formulário "impostos"): receita por competência a partir das notas, RBT12 informado, simulação do
 * Simples Nacional com memória, conferência do contador, fechamento e reabertura, e as revisões dos parâmetros.
 *
 * <p>RBT12: a receita bruta total (produto + serviço) dos 12 meses anteriores à competência. O Renda+ só conhece a
 * receita a partir de {@code renda.fiscal.revenue-start} (o sistema começou do zero, decisão do PO) e dos meses já
 * encerrados; enquanto faltar algum dos 12, vale o RBT12 informado (o que o contador usou no PGDAS-D). Mês desconhecido
 * nunca é tratado como zero.
 */
@Service
public class FiscalService {

    static final String ENTITY = "tax_period";
    static final String PARAMETER_ENTITY = "tax_parameter_revision";
    static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    /** Origem do título a pagar do DAS: {@code competência:nº da conferência}. */
    public static final String DAS_ORIGIN = "TAX_PERIOD";
    /** Beneficiário do DAS: "Receita Federal — DAS", semeado pela migração V13 (decisão do PO na Sprint 8). */
    public static final UUID DAS_BENEFICIARY = UUID.fromString("00000000-0000-0000-0000-0000000000da");
    /** Categoria de despesa do DAS (semeada pela V13). */
    static final String DAS_CATEGORY = "IMPOSTOS_SIMPLES";

    private final TaxRepository repository;
    private final DocumentQueryApi documents;
    private final TitleIssuanceApi titleIssuance;
    private final TitleQueryApi titleQuery;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final JsonMapper json;
    private final Clock clock;
    private final YearMonth revenueStart;

    public FiscalService(TaxRepository repository, DocumentQueryApi documents, TitleIssuanceApi titleIssuance, TitleQueryApi titleQuery,
                         AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, JsonMapper json, Clock clock,
                         @Value("${renda.fiscal.revenue-start:2026-09}") String revenueStart) {
        this.repository = repository;
        this.documents = documents;
        this.titleIssuance = titleIssuance;
        this.titleQuery = titleQuery;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.json = json;
        this.clock = clock;
        this.revenueStart = YearMonth.parse(revenueStart);
    }

    public record InformRequest(String amountCents, String informedBy, String notes) { }

    public record ConfirmRequest(String amountCents, String dueDate, String notes) { }

    public record BracketRequest(String upToCents, String rate, String deductionCents) { }

    public record ParametersRequest(String validFrom, String productAnnex, String serviceAnnex, Map<String, List<BracketRequest>> brackets,
                                    String source, String notes) { }

    /** RBT12 da competência: o calculado das notas (se o Renda+ tem os 12 meses), o informado e os meses que faltam. */
    public record Rbt12View(Long calculatedCents, Long informedCents, List<YearMonth> missing, List<Map.Entry<YearMonth, Long>> months) {
        public SimplesSimulation.Rbt12 used() {
            if (calculatedCents != null) return new SimplesSimulation.Rbt12(calculatedCents, "CALCULADO");
            return informedCents == null ? null : new SimplesSimulation.Rbt12(informedCents, "INFORMADO");
        }
    }

    /** Linha da lista Impostos gerenciais. */
    public record PeriodSummary(YearMonth competence, boolean revenueKnown, DocumentQueryApi.Revenue revenue, TaxRepository.Period period,
                                TaxRepository.Simulation simulation, TaxRepository.Confirmation confirmation) {
        public String status() {
            return period == null ? "ABERTA" : period.status();
        }

        /** Diferença contador − simulação, quando há as duas e a simulação foi calculada. */
        public Long differenceCents() {
            return difference(simulation, confirmation);
        }
    }

    /** Ficha da competência: receita, notas, RBT12, parâmetros vigentes, simulações, conferências e fechamentos. */
    public record PeriodDetail(YearMonth competence, boolean revenueKnown, DocumentQueryApi.Revenue revenue,
                               List<DocumentQueryApi.DocumentRef> documents, TaxRepository.Period period, Rbt12View rbt12,
                               TaxParameters parameters, List<TaxRepository.Simulation> simulations,
                               List<TaxRepository.Confirmation> confirmations, List<TaxRepository.Closure> closures,
                               Map<UUID, TitleQueryApi.TitleView> dasTitles) {
        public String status() {
            return period == null ? "ABERTA" : period.status();
        }

        public long version() {
            return period == null ? 0 : period.version();
        }

        public Long differenceCents() {
            return difference(simulations.isEmpty() ? null : simulations.getFirst(), confirmations.isEmpty() ? null : confirmations.getFirst());
        }
    }

    private static Long difference(TaxRepository.Simulation s, TaxRepository.Confirmation c) {
        if (s == null || c == null || s.totalTaxCents() == null) return null;
        return c.amountCents() - s.totalTaxCents();
    }

    /** Competências do ano, de janeiro a dezembro. */
    @Transactional(readOnly = true)
    public List<PeriodSummary> list(int year) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        YearMonth from = YearMonth.of(year, 1);
        YearMonth to = YearMonth.of(year, 12);
        Map<YearMonth, DocumentQueryApi.Revenue> revenue = documents.revenue(from, to);
        Map<YearMonth, TaxRepository.Period> periods = new LinkedHashMap<>();
        repository.findBetween(from, to).forEach(p -> periods.put(p.competence(), p));
        List<UUID> ids = periods.values().stream().map(TaxRepository.Period::id).toList();
        Map<UUID, TaxRepository.Simulation> sims = repository.latestSimulations(ids);
        Map<UUID, TaxRepository.Confirmation> confs = repository.latestConfirmations(ids);
        List<PeriodSummary> out = new ArrayList<>();
        for (YearMonth m = from; !m.isAfter(to); m = m.plusMonths(1)) {
            TaxRepository.Period p = periods.get(m);
            out.add(new PeriodSummary(m, !m.isBefore(revenueStart), revenue.getOrDefault(m, new DocumentQueryApi.Revenue(0, 0, 0)), p,
                    p == null ? null : sims.get(p.id()), p == null ? null : confs.get(p.id())));
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
        DocumentQueryApi.Revenue revenue = documents.revenue(c, c).getOrDefault(c, new DocumentQueryApi.Revenue(0, 0, 0));
        List<TaxRepository.Confirmation> confirmations = p.map(x -> repository.confirmations(x.id())).orElse(List.of());
        return new PeriodDetail(c, !c.isBefore(revenueStart), revenue, documents.documents(c), p.orElse(null), rbt12(c, p.orElse(null)),
                repository.parametersFor(c).orElse(null),
                p.map(x -> repository.simulations(x.id())).orElse(List.of()),
                confirmations,
                p.map(x -> repository.closures(x.id())).orElse(List.of()), dasTitles(confirmations));
    }

    /** Títulos do DAS das conferências, pelo id (o financeiro dá a situação e o saldo de hoje). */
    private Map<UUID, TitleQueryApi.TitleView> dasTitles(List<TaxRepository.Confirmation> confirmations) {
        List<UUID> ids = confirmations.stream().map(TaxRepository.Confirmation::titleId).filter(Objects::nonNull).toList();
        Map<UUID, TitleQueryApi.TitleView> out = new LinkedHashMap<>();
        titleQuery.byIds(ids).forEach(t -> out.put(t.id(), t));
        return out;
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(String competence) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return repository.find(month(competence)).map(p -> auditQuery.history(ENTITY, p.id().toString())).orElse(List.of());
    }

    /**
     * RBT12 calculado: só quando o Renda+ conhece os 12 meses anteriores (a partir do início da receita e já encerrados);
     * senão, os meses que faltam.
     */
    private Rbt12View rbt12(YearMonth c, TaxRepository.Period p) {
        YearMonth first = c.minusMonths(12);
        YearMonth last = c.minusMonths(1);
        YearMonth current = YearMonth.now(clock.withZone(BUSINESS_ZONE));
        Map<YearMonth, DocumentQueryApi.Revenue> revenue = documents.revenue(first, last);
        List<YearMonth> missing = new ArrayList<>();
        List<Map.Entry<YearMonth, Long>> months = new ArrayList<>();
        long sum = 0;
        for (YearMonth m = first; !m.isAfter(last); m = m.plusMonths(1)) {
            long cents = revenue.getOrDefault(m, new DocumentQueryApi.Revenue(0, 0, 0)).totalCents();
            if (m.isBefore(revenueStart) || !m.isBefore(current)) missing.add(m);
            else {
                sum += cents;
                months.add(Map.entry(m, cents));
            }
        }
        return new Rbt12View(missing.isEmpty() ? sum : null, p == null ? null : p.informedRbt12Cents(), missing,
                missing.isEmpty() ? months : List.of());
    }

    /** Informa o RBT12 da competência (o do PGDAS-D), com quem informou; nova versão a cada alteração. */
    @Transactional
    public PeriodDetail informRbt12(String competence, long expectedVersion, InformRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_CONFIRM);
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

    /** Simula a competência com os parâmetros vigentes e o RBT12 conhecido; a mesma chave não repete a simulação. */
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
        DocumentQueryApi.Revenue revenue = documents.revenue(c, c).getOrDefault(c, new DocumentQueryApi.Revenue(0, 0, 0));
        Rbt12View rbt12 = rbt12(c, p);
        TaxParameters parameters = repository.parametersFor(c).orElse(null);
        SimplesSimulation.Result result = SimplesSimulation.simulate(c, parameters, rbt12.used(), rbt12.missing(),
                revenue.productCents(), revenue.serviceCents());
        List<TaxRepository.Simulation> previous = repository.simulations(p.id());
        SimplesSimulation.Rbt12 used = rbt12.used();
        TaxRepository.Simulation s = new TaxRepository.Simulation(UUID.randomUUID(), p.id(), previous.size() + 1,
                result.calculable() ? "CALCULADA" : "NAO_CALCULAVEL", parameters == null ? null : parameters.id(),
                parameters == null ? null : parameters.revision(), used == null ? null : used.cents(), used == null ? null : used.origin(),
                revenue.productCents(), revenue.serviceCents(), result.taxCents(RevenueKind.PRODUTO), result.taxCents(RevenueKind.SERVICO),
                result.totalTaxCents(), json.writeValueAsString(memory(c, parameters, rbt12, revenue, result)), at, user.username());
        repository.insertSimulation(s);
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("simulation", new AuditEntry.Change(null, "Simulação " + s.seq()));
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

    /** Memória do cálculo: origem do RBT12 (mês a mês, se calculado), revisão usada, faixa e fórmula por tipo. */
    private Map<String, Object> memory(YearMonth c, TaxParameters parameters, Rbt12View rbt12, DocumentQueryApi.Revenue revenue,
                                       SimplesSimulation.Result result) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("competence", c.toString());
        m.put("parameterRevision", parameters == null ? null : parameters.revision());
        m.put("parameterValidFrom", parameters == null ? null : parameters.validFrom().toString());
        m.put("parameterSource", parameters == null ? null : parameters.source());
        SimplesSimulation.Rbt12 used = rbt12.used();
        m.put("rbt12Cents", used == null ? null : Long.toString(used.cents()));
        m.put("rbt12Origin", used == null ? null : used.origin());
        m.put("rbt12Months", rbt12.months().stream().map(e -> Map.of("competence", e.getKey().toString(), "cents", Long.toString(e.getValue())))
                .toList());
        m.put("rbt12Missing", rbt12.missing().stream().map(YearMonth::toString).toList());
        m.put("informedRbt12Cents", rbt12.informedCents() == null ? null : Long.toString(rbt12.informedCents()));
        m.put("productRevenueCents", Long.toString(revenue.productCents()));
        m.put("serviceRevenueCents", Long.toString(revenue.serviceCents()));
        m.put("reasons", result.reasons());
        m.put("warnings", result.warnings());
        m.put("kinds", result.kinds().stream().map(k -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("kind", k.kind().name());
            x.put("annex", k.annex());
            x.put("bracket", k.bracket());
            x.put("nominalRate", k.nominalRate().toPlainString());
            x.put("deductionCents", Long.toString(k.deductionCents()));
            x.put("effectiveRate", k.effectiveRate().toPlainString());
            x.put("revenueCents", Long.toString(k.revenueCents()));
            x.put("taxCents", Long.toString(k.taxCents()));
            return x;
        }).toList());
        return m;
    }

    /**
     * Registra o valor apurado pelo contador e o vencimento; a conferência anterior fica no histórico. Na mesma transação
     * nasce o título a pagar do DAS (Sprint 8): reconferir cancela o DAS anterior sem pagamento e cria outro, para haver um
     * só DAS ativo na competência; DAS com pagamento recusa a reconferência ({@code TAX_DAS_PAID}); valor zero não cria
     * título.
     */
    @Transactional
    public PeriodDetail confirm(String competence, long expectedVersion, ConfirmRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_CONFIRM);
        YearMonth c = month(competence);
        List<FieldIssue> issues = new ArrayList<>();
        Long amount = null;
        try {
            Money m = Money.parseCents(r == null || r.amountCents() == null ? null : r.amountCents().strip(), Currency.BRL);
            if (m.isNegative()) issues.add(new FieldIssue("amountCents", "O valor não pode ser negativo."));
            else amount = m.cents();
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("amountCents", "Informe o valor apurado pelo contador."));
        }
        LocalDate due = null;
        try {
            due = LocalDate.parse(r == null || r.dueDate() == null ? "" : r.dueDate().strip());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("dueDate", "Informe o vencimento."));
        }
        String notes = notes(r == null ? null : r.notes(), issues);
        invalid(issues);
        Instant at = clock.instant();
        TaxRepository.Period p = open(c, expectedVersion, at, user);
        List<TaxRepository.Simulation> sims = repository.simulations(p.id());
        List<TaxRepository.Confirmation> previous = repository.confirmations(p.id());
        int seq = previous.size() + 1;
        String label = SimplesSimulation.label(c);
        List<TitleQueryApi.TitleView> activeDas = titleQuery.byIds(previous.stream().map(TaxRepository.Confirmation::titleId)
                .filter(Objects::nonNull).toList()).stream().filter(t -> !"CANCELLED".equals(t.status())).toList();
        for (TitleQueryApi.TitleView t : activeDas) {
            if (t.receivedCents() > 0) {
                throw new RuleViolationException("TAX_DAS_PAID", "O DAS " + t.code() + " da competência " + label + " tem pagamento de "
                        + brl(t.receivedCents()) + "; estorne o pagamento do DAS antes de registrar outra conferência.",
                        List.of(new FieldIssue("amountCents", "DAS " + t.code() + " com pagamento.")));
            }
        }
        if (!activeDas.isEmpty()) {
            titleIssuance.cancelOpen(DAS_ORIGIN, activeDas.stream().map(TitleQueryApi.TitleView::originId).toList(),
                    "Substituído pela conferência " + seq + " do contador.");
        }
        UUID titleId = null;
        if (amount > 0) {
            titleId = titleIssuance.issuePayables(new TitleIssuanceApi.PayableRequest(DAS_ORIGIN, DAS_BENEFICIARY, null,
                    LocalDate.now(clock.withZone(BUSINESS_ZONE)), DAS_CATEGORY, c, List.of(new TitleIssuanceApi.Installment(c + ":" + seq, due,
                    Money.ofCents(amount, Currency.BRL), "DAS " + label)))).getFirst();
        }
        TaxRepository.Confirmation conf = new TaxRepository.Confirmation(UUID.randomUUID(), p.id(), seq, amount, due, notes,
                sims.isEmpty() ? null : sims.getFirst().id(), titleId, at, user.username());
        repository.insertConfirmation(conf);
        TaxRepository.Period changed = bump(p, at, user);
        repository.update(changed, p.version());
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("confirmedAmount", new AuditEntry.Change(previous.isEmpty() ? null : brl(previous.getFirst().amountCents()), brl(amount)));
        changes.put("dueDate", new AuditEntry.Change(previous.isEmpty() ? null : previous.getFirst().dueDate().toString(), due.toString()));
        Long diff = difference(sims.isEmpty() ? null : sims.getFirst(), conf);
        if (diff != null) changes.put("difference", new AuditEntry.Change(null, brl(diff)));
        if (titleId != null || !activeDas.isEmpty()) {
            String das = titleId == null ? null : titleQuery.byIds(List.of(titleId)).getFirst().code();
            changes.put("dasTitle", new AuditEntry.Change(activeDas.isEmpty() ? null : activeDas.getFirst().code(), das));
        }
        audit.record(new AuditEntry(user.username(), "TAX_PERIOD_CONFIRMED", ENTITY, p.id().toString(), changed.version(), notes, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taxPeriodId", p.id().toString());
        payload.put("competence", c.toString());
        payload.put("confirmedAmountCents", Long.toString(amount));
        payload.put("dueDate", due.toString());
        payload.put("titleId", titleId == null ? null : titleId.toString());
        outbox.append("TaxPeriodConfirmed", ENTITY, p.id().toString(), payload, user.username());
        return detail(c);
    }

    /** Fecha a competência conferida: congela a receita, a simulação e a conferência; fechar de novo não muda nada. */
    @Transactional
    public PeriodDetail close(String competence, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PERIOD_CLOSE);
        YearMonth c = month(competence);
        Instant at = clock.instant();
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        if (p.closed()) return detail(c);
        if (p.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, p.version());
        List<TaxRepository.Confirmation> confs = repository.confirmations(p.id());
        if (confs.isEmpty()) {
            throw new RuleViolationException("TAX_PERIOD_INVALID", "Registre a conferência do contador antes de fechar a competência "
                    + SimplesSimulation.label(c) + ".", List.of(new FieldIssue("confirmation", "Sem conferência do contador.")));
        }
        List<TaxRepository.Simulation> sims = repository.simulations(p.id());
        DocumentQueryApi.Revenue revenue = documents.revenue(c, c).getOrDefault(c, new DocumentQueryApi.Revenue(0, 0, 0));
        repository.insertClosure(new TaxRepository.Closure(UUID.randomUUID(), p.id(), "FECHAMENTO", null, revenue.productCents(),
                revenue.serviceCents(), sims.isEmpty() ? null : sims.getFirst().id(), confs.getFirst().id(), at, user.username()));
        TaxRepository.Period changed = withStatus(p, "FECHADA", at, user);
        repository.update(changed, p.version());
        audit.record(new AuditEntry(user.username(), "TAX_PERIOD_CLOSED", ENTITY, p.id().toString(), changed.version(), null,
                Map.of("status", new AuditEntry.Change("ABERTA", "FECHADA"),
                        "revenue", new AuditEntry.Change(null, brl(revenue.totalCents()))), CorrelationId.current()));
        outbox.append("TaxPeriodClosed", ENTITY, p.id().toString(), Map.of("taxPeriodId", p.id().toString(), "competence", c.toString()),
                user.username());
        return detail(c);
    }

    /** Reabre a competência fechada, com motivo. */
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
        if (!p.closed()) throw new InvalidStateException("A competência " + SimplesSimulation.label(c) + " não está fechada.");
        repository.insertClosure(new TaxRepository.Closure(UUID.randomUUID(), p.id(), "REABERTURA", why, null, null, null, null, at,
                user.username()));
        TaxRepository.Period changed = withStatus(p, "ABERTA", at, user);
        repository.update(changed, p.version());
        audit.record(new AuditEntry(user.username(), "TAX_PERIOD_REOPENED", ENTITY, p.id().toString(), changed.version(), why,
                Map.of("status", new AuditEntry.Change("FECHADA", "ABERTA")), CorrelationId.current()));
        outbox.append("TaxPeriodReopened", ENTITY, p.id().toString(), Map.of("taxPeriodId", p.id().toString(), "competence", c.toString(),
                "reason", why), user.username());
        return detail(c);
    }

    @Transactional(readOnly = true)
    public List<TaxParameters> parameters() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return repository.parameters();
    }

    /** Nova revisão dos parâmetros, com vigência; a mesma chave devolve a mesma revisão. */
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
        Map<RevenueKind, List<TaxParameters.Bracket>> brackets = new EnumMap<>(RevenueKind.class);
        for (RevenueKind kind : RevenueKind.values()) {
            List<BracketRequest> raw = r == null || r.brackets() == null ? null : r.brackets().get(kind.name());
            if (raw == null) continue;
            List<TaxParameters.Bracket> list = new ArrayList<>();
            for (int i = 0; i < raw.size(); i++) {
                BracketRequest b = raw.get(i);
                String f = "brackets." + kind.name() + "[" + i + "]";
                try {
                    list.add(new TaxParameters.Bracket(Long.parseLong(b.upToCents().strip()), new BigDecimal(b.rate().strip()),
                            Long.parseLong(b.deductionCents().strip())));
                } catch (RuntimeException e) {
                    issues.add(new FieldIssue(f, "Faixa inválida: limite e parcela em centavos, alíquota como fração (ex.: 0.078)."));
                }
            }
            brackets.put(kind, list);
        }
        String productAnnex = r == null ? null : r.productAnnex();
        String serviceAnnex = r == null ? null : r.serviceAnnex();
        String source = r == null ? null : r.source();
        TaxParameters.validate(productAnnex, serviceAnnex, brackets, source, issues);
        String notes = notes(r == null ? null : r.notes(), issues);
        TaxParameters.requireValid(issues);
        int revision = repository.lockNextRevision();
        TaxParameters p = new TaxParameters(UUID.randomUUID(), revision, TaxParameters.SIMPLES_NACIONAL, validFrom, productAnnex.strip(),
                serviceAnnex.strip(), TaxParameters.copy(brackets), source.strip(), notes, clock.instant(), user.username());
        repository.insertParameters(p);
        audit.record(new AuditEntry(user.username(), "TAX_PARAMETERS_REVISED", PARAMETER_ENTITY, p.id().toString(), revision, notes,
                Map.of("revision", new AuditEntry.Change(null, Integer.toString(revision)),
                        "validFrom", new AuditEntry.Change(null, validFrom.toString()),
                        "annexes", new AuditEntry.Change(null, "Produto " + p.productAnnex() + ", Serviço " + p.serviceAnnex())),
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

    /** Competência bloqueada, aberta e na versão lida pelo cliente. */
    private TaxRepository.Period open(YearMonth c, long expectedVersion, Instant at, CurrentUser user) {
        TaxRepository.Period p = repository.lockOrCreate(c, at, user.username());
        requireOpen(p);
        if (p.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, p.version());
        return p;
    }

    private static void requireOpen(TaxRepository.Period p) {
        if (p.closed()) {
            String label = SimplesSimulation.label(p.competence());
            throw new RuleViolationException("TAX_PERIOD_CLOSED", "A competência " + label + " está fechada; reabra para alterar.",
                    List.of(new FieldIssue("competence", "Competência " + label + " fechada.")));
        }
    }

    private static TaxRepository.Period bump(TaxRepository.Period p, Instant at, CurrentUser user) {
        return withStatus(p, p.status(), at, user);
    }

    private static TaxRepository.Period withStatus(TaxRepository.Period p, String status, Instant at, CurrentUser user) {
        return new TaxRepository.Period(p.id(), p.competence(), status, p.informedRbt12Cents(), p.informedBy(), p.informedNotes(),
                p.version() + 1, p.createdAt(), p.createdBy(), at, user.username());
    }

    private static YearMonth month(String raw) {
        try {
            return YearMonth.parse(Objects.requireNonNull(raw).strip());
        } catch (RuntimeException e) {
            throw new RuleViolationException("TAX_INVALID", "Competência inválida; use AAAA-MM.",
                    List.of(new FieldIssue("competence", "Use AAAA-MM.")));
        }
    }

    private static Long positive(String raw, String field, String missing, List<FieldIssue> issues) {
        try {
            Money m = Money.parseCents(raw == null ? null : raw.strip(), Currency.BRL);
            if (m.cents() > 0) return m.cents();
        } catch (IllegalArgumentException e) {
            // cai na mensagem abaixo
        }
        issues.add(new FieldIssue(field, missing));
        return null;
    }

    private static String notes(String raw, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) return null;
        if (raw.strip().length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        return raw.strip();
    }

    private static void invalid(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("TAX_INVALID", "Corrija os campos indicados.", issues);
    }

    private static String brl(long cents) {
        return Money.ofCents(cents, Currency.BRL).toBrl();
    }
}
