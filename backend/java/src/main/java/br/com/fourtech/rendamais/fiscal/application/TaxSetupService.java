package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Tabelas e parâmetros do Simples (Sprint 12, mock "Tabelas e parâmetros do Simples Nacional"): dados da empresa no
 * Simples e limites, atividades e anexos, a opção por IBS e CBS de 2027 e o histórico de receita anterior ao Renda+
 * (digitado por competência ou carregado de um arquivo JSON, com prévia e confirmação; o mesmo arquivo não carrega duas
 * vezes).
 */
@Service
public class TaxSetupService {

    static final String PROFILE_ENTITY = "tax_company_profile";
    static final String ACTIVITY_ENTITY = "tax_activity";
    static final String HISTORY_ENTITY = "tax_revenue_history";
    /** Opção por IBS e CBS do 1º semestre de 2027: prazo, vigência e desistência (mock "Tabelas e parâmetros"). */
    public static final String IBS_PERIOD = "2027-S1";
    public static final LocalDate IBS_DEADLINE = LocalDate.of(2026, 9, 30);
    public static final LocalDate IBS_WITHDRAWAL = LocalDate.of(2026, 11, 30);
    public static final LocalDate IBS_FROM = LocalDate.of(2027, 1, 1);
    public static final LocalDate IBS_TO = LocalDate.of(2027, 6, 30);
    /** Obrigação semeada pela V18 com o prazo da opção. */
    static final String IBS_OBLIGATION_NAME = "Opção por IBS e CBS fora do DAS (1º semestre de 2027)";

    private final TaxSetupRepository repository;
    private final ObligationRepository obligations;
    private final FiscalLedger ledger;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final JsonMapper json;
    private final Clock clock;

    public TaxSetupService(TaxSetupRepository repository, ObligationRepository obligations, FiscalLedger ledger, AuditTrail audit,
                           AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, JsonMapper json, Clock clock) {
        this.repository = repository;
        this.obligations = obligations;
        this.ledger = ledger;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.json = json;
        this.clock = clock;
    }

    public record ProfileRequest(String optedSince, String cnaeMain, String cnaeSecondary, String nfseIssuer, String annualLimitCents,
                                 String sublimitCents, String tolerance, String alertThreshold) { }

    public record ActivityRequest(String name, String framing, String annex, String taxes, Boolean active) { }

    public record OptionRequest(String choice, String notes) { }

    public record HistoryRequest(String annexICents, String annexIICents, String annexIIICents, String annexIVCents, String annexVCents,
                                 String informedBy, String notes) { }

    public record ImportRequest(String fileName, String content, Boolean confirm) { }

    /** Dados da empresa no Simples, as atividades com quantos itens têm cada uma, e a opção IBS/CBS vigente. */
    public record Setup(TaxSetupRepository.Profile profile, List<TaxSetupRepository.Activity> activities,
                        List<TaxSetupRepository.IbsCbsOption> options, YearMonth revenueStart) { }

    /** Linha do arquivo de histórico: competência, receita por anexo e o problema (que bloqueia) ou o aviso. */
    public record ImportLine(int line, String competence, long[] annexCents, long totalCents, String problem, String warning) { }

    public record ImportPreview(String fileName, String hash, boolean alreadyLoaded, boolean confirmed, int months, List<ImportLine> lines,
                                List<String> problems) { }

    @Transactional(readOnly = true)
    public Setup setup() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return new Setup(repository.profile(), repository.activities(), repository.ibsCbsOptions(), ledger.revenueStart());
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> profileHistory() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return auditQuery.history(PROFILE_ENTITY, "1");
    }

    /** Altera os dados da empresa no Simples e os limites (If-Match). Regime e reconhecimento da receita não mudam nesta versão. */
    @Transactional
    public Setup updateProfile(long expectedVersion, ProfileRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate since = null;
        if (r != null && r.optedSince() != null && !r.optedSince().isBlank()) {
            since = FiscalService.date(r.optedSince(), "optedSince", "Data inválida.", issues);
        }
        String main = text(r == null ? null : r.cnaeMain(), "cnaeMain", 150, issues);
        String secondary = text(r == null ? null : r.cnaeSecondary(), "cnaeSecondary", 150, issues);
        String nfse = text(r == null ? null : r.nfseIssuer(), "nfseIssuer", 60, issues);
        Long limit = FiscalService.positive(r == null ? null : r.annualLimitCents(), "annualLimitCents", "Informe o limite anual.", issues);
        Long sub = FiscalService.positive(r == null ? null : r.sublimitCents(), "sublimitCents", "Informe o sublimite.", issues);
        if (limit != null && sub != null && sub > limit) issues.add(new FieldIssue("sublimitCents", "O sublimite não pode passar do limite anual."));
        BigDecimal tolerance = fraction(r == null ? null : r.tolerance(), "tolerance", true, issues);
        BigDecimal alert = fraction(r == null ? null : r.alertThreshold(), "alertThreshold", false, issues);
        FiscalService.invalid(issues);
        TaxSetupRepository.Profile p = repository.profile();
        if (p.version() != expectedVersion) throw new VersionConflictException(PROFILE_ENTITY, expectedVersion, p.version());
        Instant at = clock.instant();
        TaxSetupRepository.Profile changed = new TaxSetupRepository.Profile(p.regime(), since, main, secondary, p.revenueRecognition(), nfse,
                limit, sub, tolerance, alert, p.version() + 1, at, user.username());
        repository.updateProfile(changed, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        diff(changes, "optedSince", p.optedSince(), since);
        diff(changes, "cnaeMain", p.cnaeMain(), main);
        diff(changes, "cnaeSecondary", p.cnaeSecondary(), secondary);
        diff(changes, "nfseIssuer", p.nfseIssuer(), nfse);
        diff(changes, "annualLimit", FiscalService.brl(p.annualLimitCents()), FiscalService.brl(limit));
        diff(changes, "sublimit", FiscalService.brl(p.sublimitCents()), FiscalService.brl(sub));
        diff(changes, "tolerance", p.tolerance().stripTrailingZeros().toPlainString(), tolerance.stripTrailingZeros().toPlainString());
        diff(changes, "alertThreshold", p.alertThreshold().stripTrailingZeros().toPlainString(), alert.stripTrailingZeros().toPlainString());
        audit.record(new AuditEntry(user.username(), "TAX_PROFILE_UPDATED", PROFILE_ENTITY, "1", changed.version(), null, changes,
                CorrelationId.current()));
        outbox.append("TaxProfileUpdated", PROFILE_ENTITY, "1", Map.of("changedFields", List.copyOf(changes.keySet())), user.username());
        return setup();
    }

    /** Nova atividade, no fim da lista. */
    @Transactional
    public Setup addActivity(String idempotencyKey, ActivityRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterTaxActivity", r == null ? Map.of() : r);
        if (done.isPresent()) return setup();
        List<FieldIssue> issues = new ArrayList<>();
        Activity a = activity(r, issues);
        FiscalService.invalid(issues);
        Instant at = clock.instant();
        int position = repository.activities().stream().mapToInt(TaxSetupRepository.Activity::position).max().orElse(0) + 1;
        TaxSetupRepository.Activity created = new TaxSetupRepository.Activity(UUID.randomUUID(), position, a.name(), a.framing(), a.annex(),
                a.taxes(), a.active() ? "ATIVO" : "INATIVO", 1, at, user.username(), null, null);
        repository.insertActivity(created);
        audit.record(new AuditEntry(user.username(), "TAX_ACTIVITY_REGISTERED", ACTIVITY_ENTITY, created.id().toString(), 1, null,
                Map.of("name", new AuditEntry.Change(null, a.name()), "annex", new AuditEntry.Change(null, a.annex())), CorrelationId.current()));
        outbox.append("TaxProfileUpdated", ACTIVITY_ENTITY, created.id().toString(), Map.of("changedFields", List.of("activities")), user.username());
        receipts.complete(user.username(), key, created.id().toString());
        return setup();
    }

    @Transactional
    public Setup updateActivity(UUID id, long expectedVersion, ActivityRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        List<FieldIssue> issues = new ArrayList<>();
        Activity a = activity(r, issues);
        FiscalService.invalid(issues);
        TaxSetupRepository.Activity current = repository.activity(id).orElseThrow(() -> new NotFoundException("Atividade não encontrada."));
        if (current.version() != expectedVersion) throw new VersionConflictException(ACTIVITY_ENTITY, expectedVersion, current.version());
        Instant at = clock.instant();
        TaxSetupRepository.Activity changed = new TaxSetupRepository.Activity(id, current.position(), a.name(), a.framing(), a.annex(),
                a.taxes(), a.active() ? "ATIVO" : "INATIVO", current.version() + 1, current.createdAt(), current.createdBy(), at, user.username());
        repository.updateActivity(changed, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        diff(changes, "name", current.name(), a.name());
        diff(changes, "framing", current.framing(), a.framing());
        diff(changes, "annex", current.annex(), a.annex());
        diff(changes, "taxes", current.taxes(), a.taxes());
        diff(changes, "status", current.status(), changed.status());
        audit.record(new AuditEntry(user.username(), "TAX_ACTIVITY_UPDATED", ACTIVITY_ENTITY, id.toString(), changed.version(), null, changes,
                CorrelationId.current()));
        outbox.append("TaxProfileUpdated", ACTIVITY_ENTITY, id.toString(), Map.of("changedFields", List.of("activities")), user.username());
        return setup();
    }

    private record Activity(String name, String framing, String annex, String taxes, boolean active) { }

    private static Activity activity(ActivityRequest r, List<FieldIssue> issues) {
        String name = r == null || r.name() == null ? "" : r.name().strip();
        if (name.isEmpty() || name.length() > 150) issues.add(new FieldIssue("name", "Informe a atividade (até 150 caracteres)."));
        String framing = r == null || r.framing() == null ? "" : r.framing().strip();
        if (framing.isEmpty() || framing.length() > 60) issues.add(new FieldIssue("framing", "Informe o enquadramento (CNAE ou item da LC 116)."));
        Annex annex = Annex.parse(r == null ? null : r.annex());
        if (annex == null) issues.add(new FieldIssue("annex", "Escolha o anexo (I a V)."));
        String taxes = r == null || r.taxes() == null ? "" : r.taxes().strip();
        if (taxes.isEmpty() || taxes.length() > 150) issues.add(new FieldIssue("taxes", "Informe os tributos no DAS."));
        return new Activity(name, framing, annex == null ? null : annex.name(), taxes, r == null || r.active() == null || r.active());
    }

    /**
     * Registra a opção por IBS e CBS do 1º semestre de 2027 (dentro ou fora do DAS). Cada registro preserva o anterior; a
     * obrigação com o prazo da opção passa a Entregue. O prazo vencido não impede registrar a decisão já tomada no portal.
     */
    @Transactional
    public Setup registerOption(String idempotencyKey, OptionRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterIbsCbsOption", r == null ? Map.of() : r);
        if (done.isPresent()) return setup();
        String choice = r == null || r.choice() == null ? "" : r.choice().strip();
        List<FieldIssue> issues = new ArrayList<>();
        if (!choice.equals("DENTRO_DAS") && !choice.equals("FORA_DAS")) issues.add(new FieldIssue("choice", "Escolha dentro ou fora do DAS."));
        String notes = FiscalService.notes(r == null ? null : r.notes(), issues);
        FiscalService.invalid(issues);
        Instant at = clock.instant();
        List<TaxSetupRepository.IbsCbsOption> previous = repository.ibsCbsOptions();
        TaxSetupRepository.IbsCbsOption o = new TaxSetupRepository.IbsCbsOption(UUID.randomUUID(), IBS_PERIOD, choice, IBS_DEADLINE,
                IBS_WITHDRAWAL, notes, at, user.username());
        repository.insertIbsCbsOption(o);
        LocalDate today = LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE));
        obligations.list(IBS_DEADLINE, IBS_DEADLINE).stream().filter(x -> x.templateId() == null && IBS_OBLIGATION_NAME.equals(x.name())
                && !"ENTREGUE".equals(x.status())).findFirst().ifPresent(x -> {
            ObligationRepository.Obligation locked = obligations.findForUpdate(x.id()).orElseThrow();
            obligations.update(new ObligationRepository.Obligation(locked.id(), locked.code(), locked.templateId(), locked.templateCode(),
                    locked.name(), locked.competence(), locked.dueDate(), locked.sphere(), locked.kind(), locked.responsible(), locked.detail(),
                    "ENTREGUE", today, null, label(choice), locked.version() + 1, locked.createdAt(), locked.createdBy(), at, user.username()),
                    locked.version());
        });
        audit.record(new AuditEntry(user.username(), "TAX_IBS_CBS_OPTION_RECORDED", PROFILE_ENTITY, "1", previous.size() + 1, notes,
                Map.of("ibsCbsOption", new AuditEntry.Change(previous.isEmpty() ? null : label(previous.getFirst().choice()), label(choice))),
                CorrelationId.current()));
        outbox.append("TaxIbsCbsOptionRecorded", PROFILE_ENTITY, "1", Map.of("period", IBS_PERIOD, "choice", choice), user.username());
        receipts.complete(user.username(), key, o.id().toString());
        return setup();
    }

    static String label(String choice) {
        return "FORA_DAS".equals(choice) ? "IBS e CBS fora do DAS (regime regular)" : "IBS e CBS dentro do DAS";
    }

    // ───────────── Histórico de receita ─────────────

    @Transactional(readOnly = true)
    public List<TaxSetupRepository.History> history() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        YearMonth start = ledger.revenueStart();
        return List.copyOf(repository.history(start.minusYears(10), start.minusMonths(1)).values()).reversed();
    }

    /** Digita a receita de uma competência anterior ao Renda+ (If-Match; 0 quando ainda não há). */
    @Transactional
    public TaxSetupRepository.History recordHistory(String competence, long expectedVersion, HistoryRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        YearMonth c = FiscalService.month(competence);
        List<FieldIssue> issues = new ArrayList<>();
        requireBeforeStart(c, issues);
        long[] cents = new long[5];
        String[] raw = r == null ? new String[5] : new String[]{r.annexICents(), r.annexIICents(), r.annexIIICents(), r.annexIVCents(), r.annexVCents()};
        for (int i = 0; i < 5; i++) {
            if (raw[i] == null || raw[i].isBlank()) continue;
            Long v = FiscalService.nonNegative(raw[i], "annex" + Annex.values()[i].name() + "Cents", issues);
            cents[i] = v == null ? 0 : v;
        }
        String by = r == null || r.informedBy() == null ? "" : r.informedBy().strip();
        if (by.isEmpty() || by.length() > 100) issues.add(new FieldIssue("informedBy", "Informe quem passou o valor (até 100 caracteres)."));
        String notes = FiscalService.notes(r == null ? null : r.notes(), issues);
        FiscalService.invalid(issues);
        Instant at = clock.instant();
        TaxSetupRepository.History current = repository.historyForUpdate(c).orElse(null);
        long version = current == null ? 0 : current.version();
        if (version != expectedVersion) throw new VersionConflictException(HISTORY_ENTITY, expectedVersion, version);
        TaxSetupRepository.History h = save(c, cents, "DIGITADO", by, notes, current, at, user.username());
        audit.record(new AuditEntry(user.username(), "TAX_REVENUE_HISTORY_RECORDED", HISTORY_ENTITY, c.toString(), h.version(), notes,
                Map.of("revenue", new AuditEntry.Change(current == null ? null : FiscalService.brl(current.totalCents()),
                        FiscalService.brl(h.totalCents()))), CorrelationId.current()));
        outbox.append("TaxRevenueHistoryRecorded", HISTORY_ENTITY, c.toString(), Map.of("competences", List.of(c.toString()),
                "source", "DIGITADO"), user.username());
        return h;
    }

    private TaxSetupRepository.History save(YearMonth c, long[] cents, String source, String by, String notes,
                                            TaxSetupRepository.History current, Instant at, String actor) {
        if (current == null) {
            TaxSetupRepository.History h = new TaxSetupRepository.History(c, cents, source, by, notes, 1, at, actor, null, null);
            repository.insertHistory(h);
            return h;
        }
        TaxSetupRepository.History h = new TaxSetupRepository.History(c, cents, source, by, notes, current.version() + 1,
                current.createdAt(), current.createdBy(), at, actor);
        repository.updateHistory(h, current.version());
        return h;
    }

    private void requireBeforeStart(YearMonth c, List<FieldIssue> issues) {
        if (!c.isBefore(ledger.revenueStart())) {
            issues.add(new FieldIssue("competence", "A partir de " + label(ledger.revenueStart())
                    + " a receita vem das notas registradas no Renda+."));
        }
    }

    private static String label(YearMonth m) {
        return String.format("%02d/%d", m.getMonthValue(), m.getYear());
    }

    /**
     * Carga do histórico pelo arquivo JSON ({@code historicoReceita}: competência AAAA-MM, anexoI a anexoV e total em reais
     * com ponto decimal, como em {@code exemplos/fiscal-exemplo.json}). Sem {@code confirm}, só a prévia; com ele, grava as
     * linhas sem problema e guarda o hash, para o mesmo arquivo não carregar de novo.
     */
    @Transactional
    public ImportPreview importHistory(String idempotencyKey, ImportRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_PROFILE_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        String content = r == null || r.content() == null ? "" : r.content();
        if (content.isBlank()) {
            throw new RuleViolationException("TAX_INVALID", "Envie o conteúdo do arquivo.", List.of(new FieldIssue("content", "Arquivo vazio.")));
        }
        String hash = sha256(content);
        String fileName = r == null || r.fileName() == null ? null : r.fileName().strip();
        boolean confirm = r != null && Boolean.TRUE.equals(r.confirm());
        List<String> problems = new ArrayList<>();
        List<ImportLine> lines = parse(content, problems);
        boolean already = repository.importExists(hash);
        if (!confirm || already) return new ImportPreview(fileName, hash, already, false, (int) lines.stream().filter(l -> l.problem() == null).count(),
                lines, problems);
        var done = receipts.claim(user.username(), key, "ImportTaxRevenueHistory", Map.of("hash", hash));
        if (done.isPresent()) return new ImportPreview(fileName, hash, true, true, 0, lines, problems);
        if (!problems.isEmpty()) {
            throw new RuleViolationException("TAX_INVALID", "O arquivo não pôde ser lido: " + String.join(" ", problems),
                    List.of(new FieldIssue("content", problems.getFirst())));
        }
        Instant at = clock.instant();
        List<String> loaded = new ArrayList<>();
        for (ImportLine l : lines) {
            if (l.problem() != null) continue;
            YearMonth c = YearMonth.parse(l.competence());
            TaxSetupRepository.History current = repository.historyForUpdate(c).orElse(null);
            save(c, l.annexCents(), "ARQUIVO", fileName == null ? "Arquivo" : "Arquivo " + fileName, null, current, at, user.username());
            loaded.add(c.toString());
        }
        repository.insertImport(UUID.randomUUID(), hash, fileName, loaded.size(), at, user.username());
        audit.record(new AuditEntry(user.username(), "TAX_REVENUE_HISTORY_IMPORTED", HISTORY_ENTITY, hash, 1, fileName,
                Map.of("months", new AuditEntry.Change(null, Integer.toString(loaded.size()))), CorrelationId.current()));
        outbox.append("TaxRevenueHistoryRecorded", HISTORY_ENTITY, hash, Map.of("competences", loaded, "source", "ARQUIVO"), user.username());
        receipts.complete(user.username(), key, hash);
        return new ImportPreview(fileName, hash, false, true, loaded.size(), lines, problems);
    }

    private List<ImportLine> parse(String content, List<String> problems) {
        JsonNode root;
        try {
            root = json.readTree(content);
        } catch (RuntimeException e) {
            problems.add("O arquivo não é um JSON válido.");
            return List.of();
        }
        JsonNode list = root.isArray() ? root : root.get("historicoReceita");
        if (list == null || !list.isArray() || list.isEmpty()) {
            problems.add("O arquivo não tem a lista \"historicoReceita\".");
            return List.of();
        }
        Map<String, Integer> seen = new LinkedHashMap<>();
        List<ImportLine> out = new ArrayList<>();
        int n = 0;
        for (JsonNode item : list) {
            n++;
            String comp = item.hasNonNull("competencia") ? item.get("competencia").asString().strip() : "";
            long[] cents = new long[5];
            String problem = null;
            String warning = null;
            YearMonth c = null;
            try {
                c = YearMonth.parse(comp);
            } catch (RuntimeException e) {
                problem = "Competência inválida (use AAAA-MM).";
            }
            String[] keys = {"anexoI", "anexoII", "anexoIII", "anexoIV", "anexoV"};
            for (int i = 0; i < 5 && problem == null; i++) {
                if (!item.hasNonNull(keys[i])) continue;
                try {
                    BigDecimal v = new BigDecimal(item.get(keys[i]).asString().strip());
                    Money m = Money.ofDecimal(v, Currency.BRL);
                    if (m.isNegative()) problem = "Receita negativa no " + Annex.values()[i].label() + ".";
                    cents[i] = m.cents();
                } catch (RuntimeException e) {
                    problem = "Valor inválido no " + Annex.values()[i].label() + " (use reais com ponto: 1234.56).";
                }
            }
            long total = 0;
            for (long x : cents) total += x;
            if (problem == null && item.hasNonNull("total")) {
                try {
                    long t = Money.ofDecimal(new BigDecimal(item.get("total").asString().strip()), Currency.BRL).cents();
                    if (t != total) problem = "O total (" + FiscalService.brl(t) + ") não bate com a soma dos anexos (" + FiscalService.brl(total) + ").";
                } catch (RuntimeException e) {
                    problem = "Total inválido.";
                }
            }
            if (problem == null && !c.isBefore(ledger.revenueStart())) {
                problem = "A partir de " + label(ledger.revenueStart()) + " a receita vem das notas.";
            }
            if (problem == null && seen.containsKey(comp)) problem = "Competência repetida (linha " + seen.get(comp) + ").";
            if (problem == null) {
                seen.put(comp, n);
                TaxSetupRepository.History current = repository.history(c, c).get(c);
                if (current != null && current.totalCents() != total) {
                    warning = "Substitui o histórico de " + FiscalService.brl(current.totalCents()) + ".";
                }
            }
            out.add(new ImportLine(n, comp, cents, total, problem, warning));
        }
        return out;
    }

    private static String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ───────────── Apoio ─────────────

    private static String text(String raw, String field, int max, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) return null;
        if (raw.strip().length() > max) issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        return raw.strip();
    }

    /** Fração de 0 a 1 ("0.9" = 90%); {@code zeroOk} aceita zero. */
    private static BigDecimal fraction(String raw, String field, boolean zeroOk, List<FieldIssue> issues) {
        try {
            BigDecimal v = new BigDecimal(raw == null ? "" : raw.strip());
            boolean ok = (zeroOk ? v.signum() >= 0 : v.signum() > 0) && v.compareTo(BigDecimal.ONE) <= 0 && v.stripTrailingZeros().scale() <= 4;
            if (ok) return v;
        } catch (RuntimeException e) {
            // cai abaixo
        }
        issues.add(new FieldIssue(field, "Informe uma fração entre 0 e 1 (ex.: 0.9 para 90%)."));
        return null;
    }

    private static void diff(Map<String, AuditEntry.Change> changes, String field, Object before, Object after) {
        String b = before == null ? null : before.toString();
        String a = after == null ? null : after.toString();
        if (!Objects.equals(b, a)) changes.put(field, new AuditEntry.Change(b, a));
    }
}
