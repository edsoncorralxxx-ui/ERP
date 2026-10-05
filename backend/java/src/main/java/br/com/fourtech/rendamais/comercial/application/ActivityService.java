package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.acesso.api.UserDirectory;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.EmployeeDirectory;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Atividades do CRM (Sprint 13, mock "Atividades e agenda"): visita técnica, reunião, ligação, e-mail e tarefa, com dia,
 * hora e duração, ligadas ao cliente, à prospecção e à oportunidade. "Hoje" e "Atrasada" saem da data; concluir guarda o
 * contato no histórico do cliente e da oportunidade. Ler pede {@code opportunity.read}; registrar e alterar,
 * {@code opportunity.update}.
 */
@Service
public class ActivityService {

    static final String ENTITY = "crm_activity";
    public static final Set<String> KINDS = Set.of("VISITA_TECNICA", "REUNIAO", "LIGACAO", "EMAIL", "TAREFA");

    private final JdbcClient jdbc;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final UserDirectory users;
    private final EmployeeDirectory employees;
    private final Clock clock;

    public ActivityService(JdbcClient jdbc, AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts,
                           UserDirectory users, EmployeeDirectory employees, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.users = users;
        this.employees = employees;
        this.clock = clock;
    }

    /** Atividade com os nomes do cliente, da prospecção e da oportunidade; {@code situation} já considera hoje e atraso. */
    public record Activity(UUID id, String kind, String subject, String day, String startTime, String endTime, int durationMin,
                           UUID partnerId, String partnerCode, String partnerName, UUID leadId, String leadCode, String leadName,
                           UUID opportunityId, String opportunityCode, String opportunityName, String owner, String status,
                           String situation, String notes, long version) { }

    public record Data(String kind, String subject, String day, String startTime, Integer durationMin, String partnerId,
                       String leadId, String opportunityId, String owner, String notes) { }

    public record Filter(LocalDate from, LocalDate to, String owner, String kind, UUID partnerId, UUID leadId, UUID opportunityId) { }

    private static final String SELECT = """
            select a.*, p.code as partner_code, p.legal_name as partner_name, l.code as lead_code, l.company_name as lead_name,
                   o.code as opportunity_code, o.name as opportunity_name
              from crm_activity a
              left join partner p on p.id = a.partner_id
              left join lead l on l.id = a.lead_id
              left join opportunity o on o.id = a.opportunity_id
            """;

    @Transactional(readOnly = true)
    public List<Activity> list(Filter f) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        StringBuilder sql = new StringBuilder(SELECT).append(" where a.status <> 'CANCELADA'");
        Map<String, Object> p = new LinkedHashMap<>();
        if (f.from() != null) { sql.append(" and a.day >= :from"); p.put("from", Date.valueOf(f.from())); }
        if (f.to() != null) { sql.append(" and a.day <= :to"); p.put("to", Date.valueOf(f.to())); }
        if (f.owner() != null && !f.owner().isBlank()) { sql.append(" and a.owner = :owner"); p.put("owner", f.owner().strip()); }
        if (f.kind() != null && KINDS.contains(f.kind())) { sql.append(" and a.kind = :kind"); p.put("kind", f.kind()); }
        if (f.partnerId() != null) { sql.append(" and a.partner_id = :partner"); p.put("partner", f.partnerId()); }
        if (f.leadId() != null) { sql.append(" and a.lead_id = :lead"); p.put("lead", f.leadId()); }
        if (f.opportunityId() != null) { sql.append(" and a.opportunity_id = :opp"); p.put("opp", f.opportunityId()); }
        boolean historico = f.partnerId() != null || f.leadId() != null || f.opportunityId() != null;
        sql.append(historico ? " order by a.day desc, a.start_time desc" : " order by a.day, a.start_time, a.subject");
        var spec = jdbc.sql(sql.toString());
        for (var e : p.entrySet()) spec = spec.param(e.getKey(), e.getValue());
        LocalDate today = today();
        return spec.query((rs, n) -> activity(rs, today)).list();
    }

    @Transactional(readOnly = true)
    public Activity get(UUID id) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    @Transactional
    public Activity register(String idempotencyKey, Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterActivity", data);
        if (done.isPresent()) return find(UUID.fromString(done.get()));
        Valid v = validate(data, user.username());
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.sql("""
                insert into crm_activity (id, kind, subject, day, start_time, duration_min, partner_id, lead_id, opportunity_id, owner,
                       status, notes, version, created_at, created_by, updated_at, updated_by)
                values (:id, :kind, :subject, :day, :start, :dur, :partner, :lead, :opp, :owner, 'PLANEJADA', :notes, 1, :now, :by, :now, :by)
                """).param("id", id).param("kind", v.kind).param("subject", v.subject).param("day", Date.valueOf(v.day))
                .param("start", Time.valueOf(v.start)).param("dur", v.duration).param("partner", v.partner).param("lead", v.lead)
                .param("opp", v.opportunity).param("owner", v.owner).param("notes", v.notes).param("now", now).param("by", user.username())
                .update();
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        v.flat().forEach((k, x) -> {
            if (x != null) changes.put(k, new AuditEntry.Change(null, x));
        });
        audit.record(new AuditEntry(user.username(), "CRM_ACTIVITY_REGISTERED", ENTITY, id.toString(), 1, null, changes, CorrelationId.current()));
        outbox.append("CrmActivityRegistered", ENTITY, id.toString(), Map.of("activityId", id.toString()), user.username());
        receipts.complete(user.username(), key, id.toString());
        return find(id);
    }

    /** Altera (inclusive reagenda) uma atividade que não foi concluída nem cancelada. */
    @Transactional
    public Activity update(UUID id, long expectedVersion, Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        Activity current = lock(id, expectedVersion);
        if (!"PLANEJADA".equals(current.status())) {
            throw new InvalidStateException("A atividade já está " + ("CONCLUIDA".equals(current.status()) ? "concluída" : "cancelada") + " e não muda mais.");
        }
        Valid v = validate(data, current.owner());
        jdbc.sql("""
                update crm_activity set kind = :kind, subject = :subject, day = :day, start_time = :start, duration_min = :dur,
                       partner_id = :partner, lead_id = :lead, opportunity_id = :opp, owner = :owner, notes = :notes,
                       version = version + 1, updated_at = :now, updated_by = :by
                 where id = :id
                """).param("id", id).param("kind", v.kind).param("subject", v.subject).param("day", Date.valueOf(v.day))
                .param("start", Time.valueOf(v.start)).param("dur", v.duration).param("partner", v.partner).param("lead", v.lead)
                .param("opp", v.opportunity).param("owner", v.owner).param("notes", v.notes)
                .param("now", Timestamp.from(clock.instant())).param("by", user.username()).update();
        Activity after = find(id);
        record(user, "CRM_ACTIVITY_UPDATED", current, after, null);
        return after;
    }

    /** Conclui (com as anotações do contato) ou cancela. */
    @Transactional
    public Activity finish(UUID id, long expectedVersion, boolean done, String notes) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        Activity current = lock(id, expectedVersion);
        if (!"PLANEJADA".equals(current.status())) return current;
        String n = notes == null || notes.isBlank() ? current.notes() : notes.strip();
        if (n != null && n.length() > 2000) {
            throw new RuleViolationException("CRM_ACTIVITY_INVALID", "Corrija os campos indicados.", List.of(new FieldIssue("notes", "Máximo de 2000 caracteres.")));
        }
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.sql("""
                update crm_activity set status = :status, notes = :notes, completed_at = :done, version = version + 1,
                       updated_at = :now, updated_by = :by where id = :id
                """).param("id", id).param("status", done ? "CONCLUIDA" : "CANCELADA").param("notes", n)
                .param("done", done ? now : null).param("now", now).param("by", user.username()).update();
        Activity after = find(id);
        record(user, done ? "CRM_ACTIVITY_COMPLETED" : "CRM_ACTIVITY_CANCELLED", current, after, null);
        return after;
    }

    private void record(CurrentUser user, String action, Activity before, Activity after, String reason) {
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        Map<String, String> b = flat(before), a = flat(after);
        a.forEach((k, x) -> {
            if (!Objects.equals(b.get(k), x)) changes.put(k, new AuditEntry.Change(b.get(k), x));
        });
        audit.record(new AuditEntry(user.username(), action, ENTITY, after.id().toString(), after.version(), reason, changes, CorrelationId.current()));
    }

    private static Map<String, String> flat(Activity x) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("kind", x.kind());
        m.put("subject", x.subject());
        m.put("day", x.day());
        m.put("startTime", x.startTime());
        m.put("durationMin", Integer.toString(x.durationMin()));
        m.put("customer", x.partnerName());
        m.put("opportunity", x.opportunityCode());
        m.put("owner", x.owner());
        m.put("status", x.status());
        m.put("notes", x.notes());
        return m;
    }

    private Activity lock(UUID id, long expectedVersion) {
        Long v = jdbc.sql("select version from crm_activity where id = :id for update").param("id", id).query(Long.class).optional()
                .orElseThrow(() -> new NotFoundException("Atividade não encontrada."));
        if (v != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, v);
        return find(id);
    }

    private Activity find(UUID id) {
        LocalDate today = today();
        return jdbc.sql(SELECT + " where a.id = :id").param("id", id).query((rs, n) -> activity(rs, today)).optional()
                .orElseThrow(() -> new NotFoundException("Atividade não encontrada."));
    }

    private static Activity activity(ResultSet rs, LocalDate today) throws SQLException {
        LocalDate day = rs.getDate("day").toLocalDate();
        LocalTime start = rs.getTime("start_time").toLocalTime();
        int dur = rs.getInt("duration_min");
        String status = rs.getString("status");
        String situation = !"PLANEJADA".equals(status) ? status : day.isBefore(today) ? "ATRASADA" : day.equals(today) ? "HOJE" : "PLANEJADA";
        return new Activity(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("subject"), day.toString(),
                start.toString(), start.plusMinutes(dur).toString(), dur, rs.getObject("partner_id", UUID.class), rs.getString("partner_code"),
                rs.getString("partner_name"), rs.getObject("lead_id", UUID.class), rs.getString("lead_code"), rs.getString("lead_name"),
                rs.getObject("opportunity_id", UUID.class), rs.getString("opportunity_code"), rs.getString("opportunity_name"),
                rs.getString("owner"), status, situation, rs.getString("notes"), rs.getLong("version"));
    }

    private record Valid(String kind, String subject, LocalDate day, LocalTime start, int duration, UUID partner, UUID lead,
                         UUID opportunity, String owner, String notes) {
        Map<String, String> flat() {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("kind", kind);
            m.put("subject", subject);
            m.put("day", day.toString());
            m.put("startTime", start.toString());
            m.put("durationMin", Integer.toString(duration));
            m.put("owner", owner);
            m.put("notes", notes);
            return m;
        }
    }

    private Valid validate(Data d, String defaultOwner) {
        List<FieldIssue> issues = new ArrayList<>();
        String kind = d.kind() == null ? "" : d.kind().strip().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) issues.add(new FieldIssue("kind", "Escolha o tipo da atividade."));
        String subject = d.subject() == null ? "" : d.subject().strip();
        if (subject.isEmpty()) issues.add(new FieldIssue("subject", "Informe o assunto."));
        else if (subject.length() > 200) issues.add(new FieldIssue("subject", "Máximo de 200 caracteres."));
        LocalDate day = null;
        try {
            day = d.day() == null || d.day().isBlank() ? null : LocalDate.parse(d.day().strip());
        } catch (DateTimeParseException e) {
            issues.add(new FieldIssue("day", "Data inválida."));
        }
        if (day == null && issues.stream().noneMatch(i -> i.field().equals("day"))) issues.add(new FieldIssue("day", "Informe o dia."));
        LocalTime start = null;
        try {
            start = d.startTime() == null || d.startTime().isBlank() ? null : LocalTime.parse(d.startTime().strip());
        } catch (DateTimeParseException e) {
            issues.add(new FieldIssue("startTime", "Hora inválida (HH:MM)."));
        }
        if (start == null && issues.stream().noneMatch(i -> i.field().equals("startTime"))) issues.add(new FieldIssue("startTime", "Informe a hora."));
        int dur = d.durationMin() == null ? 60 : d.durationMin();
        if (dur < 5 || dur > 1440) issues.add(new FieldIssue("durationMin", "Duração de 5 minutos a 24 horas."));
        UUID opp = uuid(d.opportunityId(), "opportunityId", issues);
        UUID lead = uuid(d.leadId(), "leadId", issues);
        UUID partner = uuid(d.partnerId(), "partnerId", issues);
        if (opp != null) {
            var o = jdbc.sql("select customer_id, lead_id from opportunity where id = :id").param("id", opp)
                    .query((rs, n) -> new UUID[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}).optional();
            if (o.isEmpty()) issues.add(new FieldIssue("opportunityId", "Oportunidade não encontrada."));
            else {
                if (partner == null) partner = o.get()[0];
                if (lead == null) lead = o.get()[1];
            }
        }
        if (lead != null && jdbc.sql("select count(*) from lead where id = :id").param("id", lead).query(Long.class).single() == 0) {
            issues.add(new FieldIssue("leadId", "Prospecção não encontrada."));
        }
        if (partner != null && jdbc.sql("select count(*) from partner where id = :id").param("id", partner).query(Long.class).single() == 0) {
            issues.add(new FieldIssue("partnerId", "Cliente não encontrado."));
        }
        String owner = d.owner() == null || d.owner().isBlank() ? defaultOwner : d.owner().strip();
        if (owner.length() > 100) issues.add(new FieldIssue("owner", "Máximo de 100 caracteres."));
        else if (!owner.equals(defaultOwner) && !employees.isActive(owner) && users.activeUsers().stream().noneMatch(u -> u.username().equals(owner))) {
            issues.add(new FieldIssue("owner", "Escolha um usuário ou colaborador ativo."));
        }
        String notes = d.notes() == null || d.notes().isBlank() ? null : d.notes().strip();
        if (notes != null && notes.length() > 2000) issues.add(new FieldIssue("notes", "Máximo de 2000 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("CRM_ACTIVITY_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(kind, subject, day, start, dur, partner, lead, opp, owner, notes);
    }

    private static UUID uuid(String raw, String field, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Identificador inválido."));
            return null;
        }
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(SalesOrderService.BUSINESS_ZONE));
    }
}
