package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Consultas do CRM pelo mock (Sprint 13): o painel comercial (funil em aberto, previsão ponderada, conversão em 12 meses,
 * meta do mês, funil por etapa e por origem, fechamentos previstos por mês e os alertas), o quadro de leads e o quadro
 * de oportunidades que alimenta a lista, a visão por etapa e o kanban. A "Análise com IA" do mock é feita por regras
 * explícitas (oportunidade parada, previsão do mês contra a meta), sem percentual de confiança inventado.
 */
@Service
public class CrmPanelService {

    private final JdbcClient jdbc;
    private final AuditTrail audit;
    private final Clock clock;

    public CrmPanelService(JdbcClient jdbc, AuditTrail audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    public record OpportunityRow(UUID id, String code, String title, UUID customerId, String customerCode, String customerName,
                                 UUID leadId, String leadCode, String leadName, String stage, String stageName, int stagePosition,
                                 BigDecimal closePercent, String status, long potentialCents, long weightedCents, String expectedClose,
                                 String owner, String source, String lastActivity, Integer daysWithoutActivity, String nextActivity,
                                 String closedAt, String version) { }

    public record LeadRow(UUID id, String code, String contactName, String companyName, String city, String state, Integer dailyCapacityTons,
                          Integer score, String stage, String source, String owner, String phone, String email, String interestItem,
                          String lastContact, Integer daysSinceContact, UUID partnerId, String version) { }

    public record Kpi(long value, Long previous, List<Long> series, String note) { }

    public record StageBar(String code, String name, BigDecimal closePercent, long potentialCents, long weightedCents, int count) { }

    public record SourceSlice(String source, long potentialCents, int count) { }

    public record Alert(String kind, String title, String text, UUID opportunityId) { }

    public record Dashboard(String month, String owner, Kpi openFunnel, int openCount, Kpi weighted, Kpi conversionPercent,
                            Long targetCents, long wonCents, List<Long> wonSeries, List<StageBar> stages, List<SourceSlice> sources,
                            List<OpportunityRow> forecast, List<Alert> alerts) { }

    // ───────────── Oportunidades ─────────────

    @Transactional(readOnly = true)
    public List<OpportunityRow> opportunities(String owner) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return opportunityRows(owner);
    }

    private List<OpportunityRow> opportunityRows(String owner) {
        LocalDate today = today();
        return jdbc.sql("""
                select o.id, o.code, o.name, o.customer_id, p.code as customer_code, p.legal_name as customer_name, o.lead_id,
                       l.code as lead_code, l.company_name as lead_name, o.stage, s.name as stage_name, s.position, s.close_percent,
                       o.status, o.potential_cents, o.expected_close, o.owner, o.source, o.closed_at, o.version,
                       greatest((select max(a.day) from crm_activity a where a.opportunity_id = o.id and a.status = 'CONCLUIDA'),
                                o.last_interaction,
                                (select max(c.changed_at)::date from opportunity_stage_change c where c.opportunity_id = o.id)) as last_activity,
                       (select min(a.day) from crm_activity a where a.opportunity_id = o.id and a.status = 'PLANEJADA') as next_activity
                  from opportunity o
                  join opportunity_stage s on s.code = o.stage
                  left join partner p on p.id = o.customer_id
                  left join lead l on l.id = o.lead_id
                 where (cast(:owner as text) is null or o.owner = :owner)
                 order by case o.status when 'ABERTA' then 0 when 'GANHA' then 1 else 2 end, s.position desc, o.potential_cents desc, o.code
                """).param("owner", owner == null || owner.isBlank() ? null : owner.strip()).query((rs, n) -> {
            String status = rs.getString("status");
            BigDecimal pct = "GANHA".equals(status) ? BigDecimal.valueOf(100) : "PERDIDA".equals(status) ? BigDecimal.ZERO : rs.getBigDecimal("close_percent");
            long potential = rs.getLong("potential_cents");
            LocalDate last = rs.getDate("last_activity") == null ? null : rs.getDate("last_activity").toLocalDate();
            Timestamp closed = rs.getTimestamp("closed_at");
            return new OpportunityRow(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                    rs.getObject("customer_id", UUID.class), rs.getString("customer_code"), rs.getString("customer_name"),
                    rs.getObject("lead_id", UUID.class), rs.getString("lead_code"), rs.getString("lead_name"), rs.getString("stage"),
                    rs.getString("stage_name"), rs.getInt("position"), pct, status, potential, weighted(potential, pct),
                    date(rs.getDate("expected_close")), rs.getString("owner"), rs.getString("source"), last == null ? null : last.toString(),
                    last == null ? null : (int) Math.max(0, ChronoUnit.DAYS.between(last, today)), date(rs.getDate("next_activity")),
                    closed == null ? null : closed.toInstant().atZone(SalesOrderService.BUSINESS_ZONE).toLocalDate().toString(),
                    Long.toString(rs.getLong("version")));
        }).list();
    }

    // ───────────── Leads ─────────────

    @Transactional(readOnly = true)
    public List<LeadRow> leads() {
        CurrentUserHolder.require(Permissions.LEAD_READ);
        LocalDate today = today();
        return jdbc.sql("""
                select l.*, greatest(l.last_interaction,
                       (select max(a.day) from crm_activity a where a.lead_id = l.id and a.status = 'CONCLUIDA')) as last_contact
                  from lead l
                 order by case l.stage when 'DESCARTADO' then 1 else 0 end, l.score desc nulls last, l.code
                """).query((rs, n) -> {
            LocalDate last = rs.getDate("last_contact") == null ? null : rs.getDate("last_contact").toLocalDate();
            return new LeadRow(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("contact_name"), rs.getString("company_name"),
                    rs.getString("city"), rs.getString("state"), (Integer) rs.getObject("daily_capacity_tons"),
                    rs.getObject("score") == null ? null : rs.getInt("score"), rs.getString("stage"), rs.getString("source"), rs.getString("owner"),
                    rs.getString("contact_phone"), rs.getString("contact_email"), rs.getString("interest_item"),
                    last == null ? null : last.toString(), last == null ? null : (int) Math.max(0, ChronoUnit.DAYS.between(last, today)),
                    rs.getObject("partner_id", UUID.class), Long.toString(rs.getLong("version")));
        }).list();
    }

    public record Qualification(Integer dailyCapacityTons, Integer score, String interestItem) { }

    /** Moagem, pontuação e produto de interesse do lead (painel lateral da janela Leads). */
    @Transactional
    public long qualify(UUID leadId, long expectedVersion, Qualification q) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_UPDATE);
        var cur = jdbc.sql("select version, daily_capacity_tons, score, interest_item from lead where id = :id for update").param("id", leadId)
                .query((rs, n) -> new Object[] {rs.getLong(1), rs.getObject(2), rs.getObject(3), rs.getString(4)}).optional()
                .orElseThrow(() -> new NotFoundException("Prospecção não encontrada."));
        if ((Long) cur[0] != expectedVersion) throw new VersionConflictException("lead", expectedVersion, (Long) cur[0]);
        List<FieldIssue> issues = new ArrayList<>();
        if (q.dailyCapacityTons() != null && (q.dailyCapacityTons() < 0 || q.dailyCapacityTons() > 100000)) {
            issues.add(new FieldIssue("dailyCapacityTons", "Moagem de 0 a 100.000 t/dia."));
        }
        if (q.score() != null && (q.score() < 0 || q.score() > 100)) issues.add(new FieldIssue("score", "Pontuação de 0 a 100."));
        String interest = q.interestItem() == null || q.interestItem().isBlank() ? null : q.interestItem().strip();
        if (interest != null && interest.length() > 120) issues.add(new FieldIssue("interestItem", "Máximo de 120 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("LEAD_INVALID", "Corrija os campos indicados.", issues);
        jdbc.sql("""
                update lead set daily_capacity_tons = :cap, score = :score, interest_item = :interest, version = version + 1,
                       updated_at = :now, updated_by = :by where id = :id
                """).param("id", leadId).param("cap", q.dailyCapacityTons()).param("score", q.score()).param("interest", interest)
                .param("now", Timestamp.from(clock.instant())).param("by", user.username()).update();
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        put(changes, "dailyCapacityTons", str(cur[1]), str(q.dailyCapacityTons()));
        put(changes, "score", str(cur[2]), str(q.score()));
        put(changes, "interestItem", (String) cur[3], interest);
        long v = (Long) cur[0] + 1;
        audit.record(new AuditEntry(user.username(), "LEAD_UPDATED", "lead", leadId.toString(), v, null, changes, CorrelationId.current()));
        return v;
    }

    // ───────────── Painel comercial ─────────────

    @Transactional(readOnly = true)
    public Dashboard dashboard(String rawMonth, String rawOwner) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        LocalDate today = today();
        YearMonth month;
        try {
            month = rawMonth == null || rawMonth.isBlank() ? YearMonth.from(today) : YearMonth.parse(rawMonth.strip());
        } catch (java.time.format.DateTimeParseException e) {
            throw new RuleViolationException("CRM_PANEL_INVALID", "Corrija os campos indicados.", List.of(new FieldIssue("month", "Mês no formato AAAA-MM.")));
        }
        String owner = rawOwner == null || rawOwner.isBlank() ? null : rawOwner.strip();
        List<OpportunityRow> all = opportunityRows(owner);
        List<OpportunityRow> open = all.stream().filter(o -> "ABERTA".equals(o.status())).toList();
        long openValue = open.stream().mapToLong(OpportunityRow::potentialCents).sum();
        long weightedValue = open.stream().mapToLong(OpportunityRow::weightedCents).sum();

        // Séries dos últimos 8 meses: o funil aberto e o ponderado no fim de cada mês, pelo histórico de etapas.
        List<Long> openSeries = new ArrayList<>(), weightedSeries = new ArrayList<>(), conversionSeries = new ArrayList<>(), wonSeries = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            YearMonth m = month.minusMonths(i);
            long[] snap = snapshot(m.plusMonths(1).atDay(1), owner);
            boolean atual = i == 0 && !month.isBefore(YearMonth.from(today));
            openSeries.add(atual ? openValue : snap[0]);
            weightedSeries.add(atual ? weightedValue : snap[1]);
            conversionSeries.add(conversion(m, owner));
            wonSeries.add(won(m, owner));
        }
        long[] prev = snapshot(month.atDay(1), owner);
        long conv = conversion(month, owner), convPrev = conversion(month.minusMonths(12), owner);
        Long target = jdbc.sql("select target_cents from sales_target where month = :m and coalesce(owner, '') = coalesce(:o, '')")
                .param("m", java.sql.Date.valueOf(month.atDay(1))).param("o", owner).query(Long.class).optional().orElse(null);
        long wonValue = won(month, owner);

        List<StageBar> stages = jdbc.sql("select code, name, close_percent from opportunity_stage order by position").query((rs, n) -> {
            String code = rs.getString(1);
            List<OpportunityRow> in = open.stream().filter(o -> o.stage().equals(code)).toList();
            return new StageBar(code, rs.getString(2), rs.getBigDecimal(3), in.stream().mapToLong(OpportunityRow::potentialCents).sum(),
                    in.stream().mapToLong(OpportunityRow::weightedCents).sum(), in.size());
        }).list();
        Map<String, long[]> bySource = new LinkedHashMap<>();
        open.forEach(o -> {
            long[] a = bySource.computeIfAbsent(o.source(), k -> new long[2]);
            a[0] += o.potentialCents();
            a[1]++;
        });
        List<SourceSlice> sources = bySource.entrySet().stream().sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                .map(e -> new SourceSlice(e.getKey(), e.getValue()[0], (int) e.getValue()[1])).toList();
        List<OpportunityRow> forecast = open.stream().filter(o -> o.expectedClose() != null)
                .sorted((a, b) -> a.expectedClose().compareTo(b.expectedClose())).toList();

        List<Alert> alerts = new ArrayList<>();
        // Parada: 14 dias ou mais sem atividade e sem próxima atividade em dia (nenhuma, ou só uma já vencida).
        open.stream().filter(o -> o.daysWithoutActivity() != null && o.daysWithoutActivity() >= 14
                        && (o.nextActivity() == null || LocalDate.parse(o.nextActivity()).isBefore(today)))
                .sorted((a, b) -> b.daysWithoutActivity() - a.daysWithoutActivity()).limit(3)
                .forEach(o -> alerts.add(new Alert("PARADA", "Oportunidade parada", o.code() + " (" + nome(o) + ") está há "
                        + o.daysWithoutActivity() + " dias sem atividade na etapa " + o.stageName() + ".", o.id())));
        long closingWeighted = open.stream().filter(o -> o.expectedClose() != null && YearMonth.from(LocalDate.parse(o.expectedClose())).equals(month))
                .mapToLong(OpportunityRow::weightedCents).sum();
        if (target != null && target > 0) {
            long falta = Math.max(0, target - wonValue);
            alerts.add(new Alert("PREVISAO", "Previsão do mês", "Vendido no mês: " + reais(wonValue) + " de " + reais(target)
                    + ". Faltam " + reais(falta) + "; o ponderado das oportunidades com fechamento previsto no mês é " + reais(closingWeighted) + ".", null));
        }
        open.stream().filter(o -> o.expectedClose() != null && LocalDate.parse(o.expectedClose()).isBefore(today)).limit(3)
                .forEach(o -> alerts.add(new Alert("ATRASADA", "Previsão de fechamento vencida", o.code() + " (" + nome(o)
                        + ") tinha fechamento previsto para " + br(o.expectedClose()) + ". Atualize a previsão ou a etapa.", o.id())));

        return new Dashboard(month.toString(), owner, new Kpi(openValue, prev[0], openSeries, null), open.size(),
                new Kpi(weightedValue, prev[1], weightedSeries, null), new Kpi(conv, convPrev, conversionSeries, null), target, wonValue,
                wonSeries, stages, sources, forecast, alerts);
    }

    /** Funil aberto e ponderado no instante {@code until}: a última passagem de etapa de cada oportunidade antes dele. */
    private long[] snapshot(LocalDate until, String owner) {
        return jdbc.sql("""
                select coalesce(sum(c.potential_cents), 0), coalesce(sum(c.weighted_cents), 0)
                  from opportunity o
                  join lateral (select * from opportunity_stage_change x where x.opportunity_id = o.id and x.changed_at < :until
                                 order by x.changed_at desc, x.id desc limit 1) c on true
                 where c.status = 'ABERTA' and (cast(:owner as text) is null or o.owner = :owner)
                """).param("until", Timestamp.from(until.atStartOfDay(SalesOrderService.BUSINESS_ZONE).toInstant())).param("owner", owner)
                .query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
    }

    /** Conversão dos 12 meses que terminam em {@code m}: ganhas ÷ fechadas (ganhas + perdidas), em %. */
    private long conversion(YearMonth m, String owner) {
        var r = jdbc.sql("""
                select count(*) filter (where status = 'GANHA'), count(*) from opportunity
                 where status in ('GANHA', 'PERDIDA') and closed_at >= :from and closed_at < :to
                   and (cast(:owner as text) is null or owner = :owner)
                """).param("from", start(m.minusMonths(11))).param("to", start(m.plusMonths(1))).param("owner", owner)
                .query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
        return r[1] == 0 ? 0 : Math.round(r[0] * 100.0 / r[1]);
    }

    /**
     * Vendido no mês, para a meta: pedidos confirmados no mês (sem os cancelados). Com responsável, só os pedidos que vieram
     * de propostas das oportunidades dele.
     */
    private long won(YearMonth m, String owner) {
        return jdbc.sql("""
                select coalesce(sum(so.total_cents), 0) from sales_order so
                  left join proposal pp on pp.id = so.proposal_id
                  left join opportunity o on o.id = pp.opportunity_id
                 where so.confirmed_at >= :from and so.confirmed_at < :to and so.status <> 'CANCELLED'
                   and (cast(:owner as text) is null or o.owner = :owner)
                """).param("from", start(m)).param("to", start(m.plusMonths(1))).param("owner", owner).query(Long.class).single();
    }

    private static Timestamp start(YearMonth m) {
        return Timestamp.from(m.atDay(1).atStartOfDay(SalesOrderService.BUSINESS_ZONE).toInstant());
    }

    private static String nome(OpportunityRow o) {
        return o.customerName() != null ? o.customerName() : o.leadName();
    }

    private static long weighted(long potential, BigDecimal pct) {
        return BigDecimal.valueOf(potential).multiply(pct).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
    }

    private static String reais(long cents) {
        BigDecimal v = BigDecimal.valueOf(cents, 2);
        String s = String.format(java.util.Locale.ROOT, "%,.2f", v).replace(',', '#').replace('.', ',').replace('#', '.');
        return "R$ " + s;
    }

    private static String br(String iso) {
        return iso.substring(8, 10) + "/" + iso.substring(5, 7) + "/" + iso.substring(0, 4);
    }

    private static String date(java.sql.Date d) {
        return d == null ? null : d.toLocalDate().toString();
    }

    private static void put(Map<String, AuditEntry.Change> m, String k, String a, String b) {
        if (!Objects.equals(a, b)) m.put(k, new AuditEntry.Change(a, b));
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(SalesOrderService.BUSINESS_ZONE));
    }
}
