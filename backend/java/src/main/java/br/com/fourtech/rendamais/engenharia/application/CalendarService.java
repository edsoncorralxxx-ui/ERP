package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Calendários e feriados (Sprint 13, mock "Calendários e feriados"): jornada (dias da semana, entrada, saída e
 * intervalo), UF e município, e os feriados de cada ano. "Importar nacionais" calcula os feriados nacionais do ano
 * (Páscoa pelo algoritmo de Gauss/Meeus); "Copiar para outro ano" leva os feriados de data fixa. Todos leem
 * ({@code calendar.read}); só o Administrador altera ({@code calendar.admin}).
 */
@Service
public class CalendarService {

    static final String ENTITY = "work_calendar";
    public static final Set<String> KINDS = Set.of("NACIONAL", "ESTADUAL", "MUNICIPAL", "PONTO_FACULTATIVO", "EMPRESA");

    private final JdbcClient jdbc;
    private final AuditTrail audit;
    private final Outbox outbox;
    private final Clock clock;

    public CalendarService(JdbcClient jdbc, AuditTrail audit, Outbox outbox, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.outbox = outbox;
        this.clock = clock;
    }

    public record Calendar(UUID id, String name, String state, String city, String workdays, String startTime, String endTime,
                           String breakStart, String breakEnd, long version) { }

    public record Holiday(String day, String description, String kind) { }

    public record CalendarData(String name, String state, String city, String workdays, String startTime, String endTime,
                               String breakStart, String breakEnd) { }

    @Transactional(readOnly = true)
    public List<Calendar> list() {
        CurrentUserHolder.require(Permissions.CALENDAR_READ);
        return jdbc.sql("select * from work_calendar order by position, name").query((rs, n) -> map(rs)).list();
    }

    @Transactional(readOnly = true)
    public List<Holiday> holidays(UUID calendarId, int year) {
        CurrentUserHolder.require(Permissions.CALENDAR_READ);
        find(calendarId, false);
        return jdbc.sql("""
                select day, description, kind from calendar_holiday where calendar_id = :id and extract(year from day) = :y order by day
                """).param("id", calendarId).param("y", year)
                .query((rs, n) -> new Holiday(rs.getDate("day").toLocalDate().toString(), rs.getString("description"), rs.getString("kind")))
                .list();
    }

    @Transactional
    public Calendar register(CalendarData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CALENDAR_ADMIN);
        Valid v = validate(d);
        if (jdbc.sql("select count(*) from work_calendar where lower(name) = lower(:n)").param("n", v.name).query(Long.class).single() > 0) {
            throw new RuleViolationException("CALENDAR_INVALID", "Já existe o calendário " + v.name + ".",
                    List.of(new FieldIssue("name", "Nome já usado.")));
        }
        UUID id = UUID.randomUUID();
        Timestamp at = Timestamp.from(clock.instant());
        jdbc.sql("""
                insert into work_calendar (id, name, state, city, workdays, start_time, end_time, break_start, break_end, position,
                                           version, created_at, created_by, updated_at, updated_by)
                values (:id, :name, :state, :city, :wd, :st, :et, :bs, :be,
                        (select coalesce(max(position), -1) + 1 from work_calendar), 1, :at, :by, :at, :by)
                """).param("id", id).params(params(v)).param("at", at).param("by", user.username()).update();
        record(user, "CALENDAR_REGISTERED", id, 1, Map.of("name", new AuditEntry.Change(null, v.name)));
        return find(id, false);
    }

    @Transactional
    public Calendar update(UUID id, long expectedVersion, CalendarData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CALENDAR_ADMIN);
        Calendar current = find(id, true);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        Valid v = validate(d);
        jdbc.sql("""
                update work_calendar set name = :name, state = :state, city = :city, workdays = :wd, start_time = :st, end_time = :et,
                       break_start = :bs, break_end = :be, version = version + 1, updated_at = :at, updated_by = :by where id = :id
                """).param("id", id).params(params(v)).param("at", Timestamp.from(clock.instant())).param("by", user.username()).update();
        Calendar after = find(id, false);
        record(user, "CALENDAR_UPDATED", id, after.version(), Map.of("jornada", new AuditEntry.Change(summary(current), summary(after))));
        outbox.append("CalendarUpdated", ENTITY, id.toString(), Map.of("calendarId", id.toString()), user.username());
        return after;
    }

    /** Substitui os feriados do ano (If-Match com a versão do calendário). */
    @Transactional
    public Calendar replaceHolidays(UUID id, long expectedVersion, int year, List<Holiday> rows) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CALENDAR_ADMIN);
        Calendar current = find(id, true);
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        List<FieldIssue> issues = new ArrayList<>();
        List<Holiday> valid = new ArrayList<>();
        Set<LocalDate> days = new HashSet<>();
        for (int i = 0; i < (rows == null ? 0 : rows.size()); i++) {
            Holiday h = rows.get(i);
            String f = "rows[" + i + "].";
            LocalDate day = null;
            try {
                day = LocalDate.parse(h.day());
                if (day.getYear() != year) issues.add(new FieldIssue(f + "day", "Data fora de " + year + "."));
                else if (!days.add(day)) issues.add(new FieldIssue(f + "day", "Data repetida."));
            } catch (RuntimeException e) {
                issues.add(new FieldIssue(f + "day", "Data inválida."));
            }
            String desc = h.description() == null ? "" : h.description().strip();
            if (desc.isEmpty() || desc.length() > 120) issues.add(new FieldIssue(f + "description", desc.isEmpty() ? "Informe a descrição." : "Máximo de 120 caracteres."));
            String kind = h.kind() == null ? "" : h.kind().strip().toUpperCase(Locale.ROOT);
            if (!KINDS.contains(kind)) issues.add(new FieldIssue(f + "kind", "Tipo inválido."));
            if (day != null) valid.add(new Holiday(day.toString(), desc, kind));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("CALENDAR_INVALID", "Corrija as linhas indicadas.", issues);
        writeYear(id, year, valid);
        jdbc.sql("update work_calendar set version = version + 1, updated_at = :at, updated_by = :by where id = :id")
                .param("id", id).param("at", Timestamp.from(clock.instant())).param("by", user.username()).update();
        Calendar after = find(id, false);
        record(user, "CALENDAR_HOLIDAYS_UPDATED", id, after.version(), Map.of("feriados " + year,
                new AuditEntry.Change(null, Integer.toString(valid.size()))));
        outbox.append("CalendarUpdated", ENTITY, id.toString(), Map.of("calendarId", id.toString(), "year", year), user.username());
        return after;
    }

    /** Feriados nacionais do ano, pela lei (fixos e móveis); Carnaval e Corpus Christi como ponto facultativo. */
    public static List<Holiday> national(int year) {
        LocalDate easter = easter(year);
        List<Holiday> h = new ArrayList<>(List.of(
                new Holiday(LocalDate.of(year, 1, 1).toString(), "Confraternização universal", "NACIONAL"),
                new Holiday(easter.minusDays(48).toString(), "Carnaval", "PONTO_FACULTATIVO"),
                new Holiday(easter.minusDays(47).toString(), "Carnaval", "PONTO_FACULTATIVO"),
                new Holiday(easter.minusDays(2).toString(), "Paixão de Cristo", "NACIONAL"),
                new Holiday(LocalDate.of(year, 4, 21).toString(), "Tiradentes", "NACIONAL"),
                new Holiday(LocalDate.of(year, 5, 1).toString(), "Dia do Trabalho", "NACIONAL"),
                new Holiday(easter.plusDays(60).toString(), "Corpus Christi", "PONTO_FACULTATIVO"),
                new Holiday(LocalDate.of(year, 9, 7).toString(), "Independência do Brasil", "NACIONAL"),
                new Holiday(LocalDate.of(year, 10, 12).toString(), "Nossa Senhora Aparecida", "NACIONAL"),
                new Holiday(LocalDate.of(year, 11, 2).toString(), "Finados", "NACIONAL"),
                new Holiday(LocalDate.of(year, 11, 15).toString(), "Proclamação da República", "NACIONAL"),
                new Holiday(LocalDate.of(year, 11, 20).toString(), "Dia Nacional de Zumbi e da Consciência Negra", "NACIONAL"),
                new Holiday(LocalDate.of(year, 12, 25).toString(), "Natal", "NACIONAL")));
        h.sort((a, b) -> a.day().compareTo(b.day()));
        return h;
    }

    /** Acrescenta os feriados nacionais do ano que ainda não estão no calendário. */
    @Transactional
    public Calendar importNational(UUID id, long expectedVersion, int year) {
        List<Holiday> current = holidays(id, year);
        Set<String> have = new HashSet<>();
        current.forEach(h -> have.add(h.day()));
        List<Holiday> all = new ArrayList<>(current);
        national(year).stream().filter(h -> !have.contains(h.day())).forEach(all::add);
        all.sort((a, b) -> a.day().compareTo(b.day()));
        return replaceHolidays(id, expectedVersion, year, all);
    }

    /** Copia os feriados de um ano para outro, na mesma data (29/02 fora de ano bissexto fica de fora). */
    @Transactional
    public Calendar copyYear(UUID id, long expectedVersion, int from, int to) {
        List<Holiday> source = holidays(id, from);
        List<Holiday> target = new ArrayList<>();
        for (Holiday h : source) {
            LocalDate d = LocalDate.parse(h.day());
            try {
                target.add(new Holiday(LocalDate.of(to, d.getMonthValue(), d.getDayOfMonth()).toString(), h.description(), h.kind()));
            } catch (RuntimeException ignored) {
                // 29/02 em ano não bissexto
            }
        }
        return replaceHolidays(id, expectedVersion, to, target);
    }

    static LocalDate easter(int y) {
        int a = y % 19, b = y / 100, c = y % 100, d = b / 4, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30, i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31, day = (h + l - 7 * m + 114) % 31 + 1;
        return LocalDate.of(y, month, day);
    }

    private void writeYear(UUID id, int year, List<Holiday> rows) {
        jdbc.sql("delete from calendar_holiday where calendar_id = :id and extract(year from day) = :y").param("id", id).param("y", year).update();
        for (Holiday h : rows) {
            jdbc.sql("insert into calendar_holiday (id, calendar_id, day, description, kind) values (:hid, :id, :day, :d, :k)")
                    .param("hid", UUID.randomUUID()).param("id", id).param("day", Date.valueOf(LocalDate.parse(h.day())))
                    .param("d", h.description()).param("k", h.kind()).update();
        }
    }

    private record Valid(String name, String state, String city, String workdays, LocalTime start, LocalTime end, LocalTime breakStart,
                         LocalTime breakEnd) { }

    private static Valid validate(CalendarData d) {
        List<FieldIssue> issues = new ArrayList<>();
        String name = d.name() == null ? "" : d.name().strip();
        if (name.isEmpty() || name.length() > 60) issues.add(new FieldIssue("name", name.isEmpty() ? "Informe o nome." : "Máximo de 60 caracteres."));
        String state = d.state() == null || d.state().isBlank() ? null : d.state().strip().toUpperCase(Locale.ROOT);
        if (state != null && !state.matches("[A-Z]{2}")) issues.add(new FieldIssue("state", "UF com 2 letras."));
        String city = d.city() == null || d.city().isBlank() ? null : d.city().strip();
        if (city != null && city.length() > 100) issues.add(new FieldIssue("city", "Máximo de 100 caracteres."));
        String wd = d.workdays() == null ? "SSSSSNN" : d.workdays().strip().toUpperCase(Locale.ROOT);
        if (!wd.matches("[SN]{7}")) issues.add(new FieldIssue("workdays", "Sete letras S ou N (segunda a domingo)."));
        LocalTime st = time(d.startTime(), "startTime", true, issues), et = time(d.endTime(), "endTime", true, issues);
        LocalTime bs = time(d.breakStart(), "breakStart", false, issues), be = time(d.breakEnd(), "breakEnd", false, issues);
        if (st != null && et != null && !st.isBefore(et)) issues.add(new FieldIssue("endTime", "A saída precisa ser depois da entrada."));
        if ((bs == null) != (be == null)) issues.add(new FieldIssue("breakEnd", "Informe o início e o fim do intervalo."));
        if (bs != null && be != null && st != null && et != null && (!bs.isBefore(be) || bs.isBefore(st) || be.isAfter(et))) {
            issues.add(new FieldIssue("breakEnd", "Intervalo dentro da jornada, com início antes do fim."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("CALENDAR_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(name, state, city, wd, st, et, bs, be);
    }

    private static LocalTime time(String raw, String field, boolean required, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            if (required) issues.add(new FieldIssue(field, "Informe a hora."));
            return null;
        }
        try {
            return LocalTime.parse(raw.strip());
        } catch (DateTimeParseException e) {
            issues.add(new FieldIssue(field, "Hora no formato HH:MM."));
            return null;
        }
    }

    private static Map<String, Object> params(Valid v) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("name", v.name);
        m.put("state", v.state);
        m.put("city", v.city);
        m.put("wd", v.workdays);
        m.put("st", Time.valueOf(v.start));
        m.put("et", Time.valueOf(v.end));
        m.put("bs", v.breakStart == null ? null : Time.valueOf(v.breakStart));
        m.put("be", v.breakEnd == null ? null : Time.valueOf(v.breakEnd));
        return m;
    }

    private Calendar find(UUID id, boolean forUpdate) {
        return jdbc.sql("select * from work_calendar where id = :id" + (forUpdate ? " for update" : "")).param("id", id)
                .query((rs, n) -> map(rs)).optional().orElseThrow(() -> new NotFoundException("Calendário não encontrado."));
    }

    private static Calendar map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Calendar(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("state"), rs.getString("city"),
                rs.getString("workdays"), hhmm(rs.getTime("start_time")), hhmm(rs.getTime("end_time")), hhmm(rs.getTime("break_start")),
                hhmm(rs.getTime("break_end")), rs.getLong("version"));
    }

    private static String hhmm(Time t) {
        return t == null ? null : t.toLocalTime().toString().substring(0, 5);
    }

    private static String summary(Calendar c) {
        return c.name() + " " + c.workdays() + " " + c.startTime() + "–" + c.endTime()
                + (c.breakStart() == null ? "" : " intervalo " + c.breakStart() + "–" + c.breakEnd())
                + (c.state() == null ? "" : " " + c.state()) + (c.city() == null ? "" : " " + c.city());
    }

    private void record(CurrentUser user, String action, UUID id, long version, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, id.toString(), version, null, changes, CorrelationId.current()));
    }
}
