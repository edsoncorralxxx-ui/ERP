package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Obrigações fiscais e acessórias (Sprint 12, mock "Obrigações fiscais e acessórias"). Os modelos recorrentes criam a
 * ocorrência de cada competência uma vez só, a partir do início da receita no Renda+ e até o mês corrente; obrigações
 * avulsas entram por "Nova obrigação". "Vence esta semana" e "Atrasada" são calculadas pela data, nunca gravadas. O
 * PGDAS-D e o DAS de cada competência seguem a apuração: transmissão registrada = Entregue, guia paga = Pago.
 */
@Service
public class ObligationService {

    static final String ENTITY = "tax_obligation";
    public static final Set<String> STATUSES = Set.of("A_ENTREGAR", "EM_PREPARACAO", "EM_APURACAO", "ABERTO", "DECISAO_PENDENTE",
            "ENTREGUE", "PAGO");
    public static final Set<String> FINAL = Set.of("ENTREGUE", "PAGO");
    public static final Set<String> SPHERES = Set.of("FEDERAL", "ESTADUAL", "MUNICIPAL");

    private final ObligationRepository repository;
    private final TaxRepository taxes;
    private final FiscalService fiscal;
    private final FiscalLedger ledger;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public ObligationService(ObligationRepository repository, TaxRepository taxes, FiscalService fiscal, FiscalLedger ledger,
                             AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.taxes = taxes;
        this.fiscal = fiscal;
        this.ledger = ledger;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    public record CreateRequest(String name, String competence, String dueDate, String sphere, String kind, String responsible,
                                String detail, String status) { }

    public record UpdateRequest(String dueDate, String responsible, String detail, String status) { }

    public record DeliveryRequest(String deliveredOn, String receiptNumber, String notes) { }

    /**
     * Obrigação vista pela tela: a situação efetiva (a do PGDAS-D e do DAS vem da apuração), os dias até o vencimento e se
     * vem da apuração ({@code linked}: não se entrega por aqui).
     */
    public record View(ObligationRepository.Obligation obligation, String status, LocalDate deliveredOn, String receiptNumber,
                       long daysToDue, boolean late, boolean dueThisWeek, boolean linked) {
        public boolean done() {
            return FINAL.contains(status);
        }
    }

    /** Todas as obrigações, pelo vencimento, com as ocorrências recorrentes garantidas até o mês corrente. */
    @Transactional
    public List<View> list() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        ensureRecurring();
        return views(repository.list(null, null));
    }

    @Transactional(readOnly = true)
    public View get(UUID id) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return views(List.of(repository.find(id).orElseThrow(() -> new NotFoundException("Obrigação não encontrada.")))).getFirst();
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** Garante as ocorrências dos modelos recorrentes do início da receita no Renda+ até o mês corrente. */
    void ensureRecurring() {
        YearMonth current = ledger.currentMonth();
        Instant at = clock.instant();
        for (ObligationRepository.Template t : repository.templates()) {
            if (!t.active()) continue;
            if ("ANUAL".equals(t.periodicity())) {
                for (int y = ledger.revenueStart().getYear(); y <= current.getYear(); y++) {
                    YearMonth dueMonth = YearMonth.of(y + 1, t.dueMonth());
                    repository.ensure(occurrence(t, Integer.toString(y), dueMonth.atDay(Math.min(t.dueDay(), dueMonth.lengthOfMonth())), at));
                }
            } else {
                for (YearMonth m = ledger.revenueStart(); !m.isAfter(current); m = m.plusMonths(1)) {
                    YearMonth next = m.plusMonths(1);
                    repository.ensure(occurrence(t, m.toString(), next.atDay(Math.min(t.dueDay(), next.lengthOfMonth())), at));
                }
            }
        }
    }

    private static ObligationRepository.Obligation occurrence(ObligationRepository.Template t, String competence, LocalDate due, Instant at) {
        return new ObligationRepository.Obligation(UUID.randomUUID(), null, t.id(), t.code(), t.name(), competence, due, t.sphere(), t.kind(),
                t.responsible(), t.detail(), t.initialStatus(), null, null, null, 1, at, "sistema", null, null);
    }

    /** Situação efetiva: PGDAS-D e DAS seguem a apuração da competência. */
    List<View> views(List<ObligationRepository.Obligation> list) {
        LocalDate today = LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE));
        List<YearMonth> competences = list.stream().filter(o -> "PGDAS_D".equals(o.templateCode()) || "DAS".equals(o.templateCode()))
                .map(o -> YearMonth.parse(o.competence())).distinct().toList();
        Map<YearMonth, UUID> periods = new HashMap<>();
        if (!competences.isEmpty()) {
            YearMonth min = competences.stream().min(YearMonth::compareTo).orElseThrow();
            YearMonth max = competences.stream().max(YearMonth::compareTo).orElseThrow();
            taxes.findBetween(min, max).forEach(p -> periods.put(p.competence(), p.id()));
        }
        List<UUID> ids = List.copyOf(periods.values());
        Map<UUID, TaxRepository.Declaration> declarations = taxes.latestDeclarations(ids);
        Map<UUID, FiscalService.GuideView> guides = fiscal.latestGuideViews(ids);
        List<View> out = new ArrayList<>();
        for (ObligationRepository.Obligation o : list) {
            String status = o.status();
            LocalDate on = o.deliveredOn();
            String receipt = o.receiptNumber();
            boolean linked = false;
            if ("PGDAS_D".equals(o.templateCode()) || "DAS".equals(o.templateCode())) {
                linked = true;
                UUID period = periods.get(YearMonth.parse(o.competence()));
                if ("PGDAS_D".equals(o.templateCode())) {
                    TaxRepository.Declaration d = period == null ? null : declarations.get(period);
                    if (d != null) {
                        status = "ENTREGUE";
                        on = d.transmittedOn();
                        receipt = d.receiptNumber();
                    }
                } else {
                    FiscalService.GuideView g = period == null ? null : guides.get(period);
                    if (g != null && "PAGO".equals(g.status())) {
                        status = "PAGO";
                        on = g.paidOn() != null ? g.paidOn() : g.guide().createdAt().atZone(FiscalLedger.BUSINESS_ZONE).toLocalDate();
                        receipt = g.guide().documentNumber();
                    } else if (g != null) {
                        status = "ABERTO";
                    }
                }
            }
            long days = ChronoUnit.DAYS.between(today, o.dueDate());
            boolean done = FINAL.contains(status);
            out.add(new View(o, status, on, receipt, days, !done && days < 0, !done && days >= 0 && days <= 7, linked));
        }
        return out;
    }

    /** Nova obrigação avulsa (fora dos modelos), com Idempotency-Key. */
    @Transactional
    public View create(String idempotencyKey, CreateRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_OBLIGATION_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterTaxObligation", r == null ? Map.of() : r);
        if (done.isPresent()) return get(UUID.fromString(done.get()));
        List<FieldIssue> issues = new ArrayList<>();
        String name = r == null || r.name() == null ? "" : r.name().strip();
        if (name.isEmpty() || name.length() > 150) issues.add(new FieldIssue("name", "Informe a obrigação (até 150 caracteres)."));
        String competence = r == null || r.competence() == null ? "" : r.competence().strip();
        if (!validCompetence(competence)) issues.add(new FieldIssue("competence", "Use AAAA-MM ou o ano (AAAA)."));
        LocalDate due = FiscalService.date(r == null ? null : r.dueDate(), "dueDate", "Informe o vencimento.", issues);
        String sphere = r == null || r.sphere() == null ? "" : r.sphere().strip();
        if (!SPHERES.contains(sphere)) issues.add(new FieldIssue("sphere", "Escolha Federal, Estadual ou Municipal."));
        String kind = r == null || r.kind() == null || r.kind().isBlank() ? "DECLARACAO" : r.kind().strip();
        if (!kind.equals("DECLARACAO") && !kind.equals("GUIA")) issues.add(new FieldIssue("kind", "Use DECLARACAO ou GUIA."));
        String responsible = r == null || r.responsible() == null ? "" : r.responsible().strip();
        if (responsible.isEmpty() || responsible.length() > 100) issues.add(new FieldIssue("responsible", "Informe o responsável."));
        String detail = FiscalService.notes(r == null ? null : r.detail(), issues);
        String status = r == null || r.status() == null || r.status().isBlank() ? "A_ENTREGAR" : r.status().strip();
        if (!STATUSES.contains(status) || FINAL.contains(status)) issues.add(new FieldIssue("status", "Situação inválida para uma obrigação nova."));
        FiscalService.invalid(issues);
        Instant at = clock.instant();
        ObligationRepository.Obligation o = new ObligationRepository.Obligation(UUID.randomUUID(), repository.nextCode(), null, null, name,
                competence, due, sphere, kind, responsible, detail, status, null, null, null, 1, at, user.username(), null, null);
        repository.insert(o);
        audit.record(new AuditEntry(user.username(), "TAX_OBLIGATION_REGISTERED", ENTITY, o.id().toString(), 1, detail,
                Map.of("name", new AuditEntry.Change(null, name), "dueDate", new AuditEntry.Change(null, due.toString())),
                CorrelationId.current()));
        outbox.append("TaxObligationRegistered", ENTITY, o.id().toString(), Map.of("obligationId", o.id().toString(), "name", name,
                "dueDate", due.toString()), user.username());
        receipts.complete(user.username(), key, o.id().toString());
        return get(o.id());
    }

    /** Altera vencimento, responsável, detalhe ou a situação de trabalho (If-Match); entregue não volta por aqui. */
    @Transactional
    public View update(UUID id, long expectedVersion, UpdateRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_OBLIGATION_UPDATE);
        ObligationRepository.Obligation o = locked(id, expectedVersion);
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate due = r == null || r.dueDate() == null || r.dueDate().isBlank() ? o.dueDate()
                : FiscalService.date(r.dueDate(), "dueDate", "Vencimento inválido.", issues);
        String responsible = r == null || r.responsible() == null || r.responsible().isBlank() ? o.responsible() : r.responsible().strip();
        if (responsible.length() > 100) issues.add(new FieldIssue("responsible", "Máximo de 100 caracteres."));
        String detail = r == null || r.detail() == null ? o.detail() : FiscalService.notes(r.detail(), issues);
        String status = r == null || r.status() == null || r.status().isBlank() ? o.status() : r.status().strip();
        if (!STATUSES.contains(status) || FINAL.contains(status)) {
            issues.add(new FieldIssue("status", "Para entregar ou pagar, use Entregue."));
        }
        FiscalService.invalid(issues);
        if (FINAL.contains(o.status())) throw new InvalidStateException("A obrigação " + o.name() + " já foi entregue.");
        Instant at = clock.instant();
        ObligationRepository.Obligation changed = new ObligationRepository.Obligation(o.id(), o.code(), o.templateId(), o.templateCode(),
                o.name(), o.competence(), due, o.sphere(), o.kind(), responsible, detail, status, null, null, o.notes(), o.version() + 1,
                o.createdAt(), o.createdBy(), at, user.username());
        repository.update(changed, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        if (!due.equals(o.dueDate())) changes.put("dueDate", new AuditEntry.Change(o.dueDate().toString(), due.toString()));
        if (!responsible.equals(o.responsible())) changes.put("responsible", new AuditEntry.Change(o.responsible(), responsible));
        if (!Objects.equals(detail, o.detail())) changes.put("detail", new AuditEntry.Change(o.detail(), detail));
        if (!status.equals(o.status())) changes.put("status", new AuditEntry.Change(o.status(), status));
        audit.record(new AuditEntry(user.username(), "TAX_OBLIGATION_UPDATED", ENTITY, id.toString(), changed.version(), null, changes,
                CorrelationId.current()));
        outbox.append("TaxObligationUpdated", ENTITY, id.toString(), Map.of("obligationId", id.toString(),
                "changedFields", List.copyOf(changes.keySet())), user.username());
        return get(id);
    }

    /** Marca a obrigação como entregue (declaração) ou paga (guia), com a data e o recibo. PGDAS-D e DAS seguem a apuração. */
    @Transactional
    public View deliver(UUID id, long expectedVersion, DeliveryRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_OBLIGATION_UPDATE);
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate on = r == null || r.deliveredOn() == null || r.deliveredOn().isBlank() ? LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE))
                : FiscalService.date(r.deliveredOn(), "deliveredOn", "Data inválida.", issues);
        if (on != null && on.isAfter(LocalDate.now(clock.withZone(FiscalLedger.BUSINESS_ZONE)))) {
            issues.add(new FieldIssue("deliveredOn", "A entrega não pode ter data futura."));
        }
        String receipt = r == null || r.receiptNumber() == null || r.receiptNumber().isBlank() ? null : r.receiptNumber().strip();
        if (receipt != null && receipt.length() > 60) issues.add(new FieldIssue("receiptNumber", "Máximo de 60 caracteres."));
        String notes = FiscalService.notes(r == null ? null : r.notes(), issues);
        FiscalService.invalid(issues);
        ObligationRepository.Obligation o = locked(id, expectedVersion);
        if ("PGDAS_D".equals(o.templateCode()) || "DAS".equals(o.templateCode())) {
            throw new RuleViolationException("TAX_OBLIGATION_LINKED", "O " + o.name() + " segue a Apuração do Simples: registre a "
                    + ("DAS".equals(o.templateCode()) ? "guia e o pagamento" : "transmissão") + " na competência " + o.competence() + ".",
                    List.of(new FieldIssue("obligation", "Obrigação da apuração.")));
        }
        if (FINAL.contains(o.status())) return get(id);
        String status = "GUIA".equals(o.kind()) ? "PAGO" : "ENTREGUE";
        Instant at = clock.instant();
        ObligationRepository.Obligation changed = new ObligationRepository.Obligation(o.id(), o.code(), o.templateId(), o.templateCode(),
                o.name(), o.competence(), o.dueDate(), o.sphere(), o.kind(), o.responsible(), o.detail(), status, on, receipt, notes,
                o.version() + 1, o.createdAt(), o.createdBy(), at, user.username());
        repository.update(changed, expectedVersion);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("status", new AuditEntry.Change(o.status(), status));
        changes.put("deliveredOn", new AuditEntry.Change(null, on.toString()));
        if (receipt != null) changes.put("receiptNumber", new AuditEntry.Change(null, receipt));
        audit.record(new AuditEntry(user.username(), "TAX_OBLIGATION_DELIVERED", ENTITY, id.toString(), changed.version(), notes, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("obligationId", id.toString());
        payload.put("status", status);
        payload.put("deliveredOn", on.toString());
        payload.put("receiptNumber", receipt);
        outbox.append("TaxObligationDelivered", ENTITY, id.toString(), payload, user.username());
        return get(id);
    }

    private ObligationRepository.Obligation locked(UUID id, long expectedVersion) {
        ObligationRepository.Obligation o = repository.findForUpdate(id).orElseThrow(() -> new NotFoundException("Obrigação não encontrada."));
        if (o.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, o.version());
        return o;
    }

    private static boolean validCompetence(String c) {
        try {
            if (c.matches("\\d{4}")) {
                Year.parse(c);
                return true;
            }
            YearMonth.parse(c);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Agenda das obrigações pendentes em iCalendar (.ics), um evento de dia inteiro por vencimento. */
    @Transactional
    public String calendar() {
        List<View> list = list().stream().filter(v -> !v.done()).toList();
        DateTimeFormatter day = DateTimeFormatter.BASIC_ISO_DATE;
        StringBuilder sb = new StringBuilder();
        sb.append("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Renda+ ERP//Obrigacoes fiscais//PT-BR\r\nCALSCALE:GREGORIAN\r\n");
        String stamp = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT).format(clock.instant().atZone(java.time.ZoneOffset.UTC));
        for (View v : list) {
            ObligationRepository.Obligation o = v.obligation();
            sb.append("BEGIN:VEVENT\r\n");
            sb.append("UID:").append(o.id()).append("@renda-erp\r\n");
            sb.append("DTSTAMP:").append(stamp).append("\r\n");
            sb.append("DTSTART;VALUE=DATE:").append(day.format(o.dueDate())).append("\r\n");
            sb.append("DTEND;VALUE=DATE:").append(day.format(o.dueDate().plusDays(1))).append("\r\n");
            sb.append("SUMMARY:").append(escape(o.name() + " — competência " + o.competence())).append("\r\n");
            if (o.detail() != null) sb.append("DESCRIPTION:").append(escape(o.detail() + " Responsável: " + o.responsible())).append("\r\n");
            sb.append("END:VEVENT\r\n");
        }
        sb.append("END:VCALENDAR\r\n");
        return sb.toString();
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n");
    }
}
