package br.com.fourtech.rendamais.consultas;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Meu cockpit do mock (Sprint 13): os oito indicadores, os gráficos, o que precisa de atenção e as próximas entregas,
 * calculados com os dados que os módulos já gravam — notas de saída (faturamento), pedidos de venda (carteira), CRM
 * (funil), contas e movimentos (caixa), projetos e equipamentos (instalações e entregas) e saldos de estoque com o mínimo
 * da ficha do item. Ordens de produção e chamados de pós-venda ainda não têm módulo: vêm nulos e a tela diz isso. Cada
 * indicador exige a permissão de leitura do seu módulo; sem ela vem nulo. A análise com IA do mock vira regras (ADR-014).
 *
 * <p>{@code period}: AAAA-MM (mês), AAAA-Tn (trimestre) ou AAAA (ano). {@code compare}: ANTERIOR (período anterior do
 * mesmo tamanho), ANO_ANTERIOR (mesmo período do ano anterior) ou META (faturamento contra a meta; os demais contra o
 * período anterior).
 */
@RestController
class CockpitController {

    static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final String[] MES = {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"};
    private static final String[] MES_LONGO = {"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro",
            "Outubro", "Novembro", "Dezembro"};

    private final JdbcClient jdbc;
    private final Clock clock;

    CockpitController(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    record Periodo(String code, String label, LocalDate from, LocalDate to) {
        /** Último dia do período, limitado a hoje: os saldos (carteira, caixa, funil) são lidos nesse dia. */
        LocalDate ref(LocalDate today) {
            LocalDate last = to.minusDays(1);
            return last.isAfter(today) ? today : last;
        }
    }

    public record Kpi(Long value, Long previous, List<Long> series, String note) { }

    public record Series(String name, List<Long> values) { }

    public record Chart(List<String> categories, List<Series> series) { }

    public record Slice(String name, long value) { }

    public record Alert(String area, String icon, String text, String due, String level, String kind, String key) { }

    public record Delivery(String date, String customer, String equipment, String stage, UUID projectId) { }

    public record Cockpit(String period, String periodLabel, String compare, String compareLabel, String referenceDate,
                          Kpi billing, Kpi backlog, Integer backlogEquipment, Kpi funnel, Integer funnelOpen, Kpi cash,
                          Kpi production, Kpi installations, Kpi tickets, Kpi stockBelowMin, List<String> stockBelowMinNames,
                          Chart billingVsTarget, List<Slice> revenueMix, Chart backlogByMonth, Chart cashFlow, Chart production2,
                          Chart funnelByStage, List<Alert> alerts, List<Delivery> deliveries) { }

    @GetMapping("/api/v1/cockpit")
    @Transactional(readOnly = true)
    public Cockpit cockpit(@RequestParam(value = "period", required = false) String rawPeriod,
                           @RequestParam(value = "compare", defaultValue = "ANTERIOR") String compare) {
        CurrentUser u = CurrentUserHolder.get();
        LocalDate today = LocalDate.now(clock.withZone(ZONA));
        Periodo p = periodo(rawPeriod, today);
        String cmp = switch (compare.strip().toUpperCase()) {
            case "ANTERIOR", "ANO_ANTERIOR", "META" -> compare.strip().toUpperCase();
            default -> throw new RuleViolationException("COCKPIT_INVALID", "Corrija os campos indicados.",
                    List.of(new FieldIssue("compare", "Use ANTERIOR, ANO_ANTERIOR ou META.")));
        };
        Periodo base = comparado(p, cmp);
        LocalDate ref = p.ref(today), refBase = base.ref(today);
        YearMonth fim = YearMonth.from(p.to().minusDays(1));
        List<YearMonth> ult9 = meses(fim, 9), ult12 = meses(fim, 12);

        Kpi billing = null;
        Chart fatMeta = null;
        List<Slice> mix = null;
        if (u.can(Permissions.DOCUMENT_READ)) {
            long v = faturado(p.from(), p.to());
            Long prev = "META".equals(cmp) ? metaFaturamento(p.from(), p.to()) : (Long) faturado(base.from(), base.to());
            billing = new Kpi(v, prev, ult9.stream().map(m -> faturado(m.atDay(1), m.plusMonths(1).atDay(1))).toList(), null);
            fatMeta = new Chart(rotulos(ult12), List.of(
                    new Series("Faturado", ult12.stream().map(m -> faturado(m.atDay(1), m.plusMonths(1).atDay(1))).toList()),
                    new Series("Meta", ult12.stream().map(m -> metaFaturamento(m.atDay(1), m.plusMonths(1).atDay(1))).toList())));
            mix = receitaPorLinha(ult12.get(0).atDay(1), fim.plusMonths(1).atDay(1));
        }

        Kpi backlog = null;
        Integer backlogEquip = null;
        Chart carteira = null;
        if (u.can(Permissions.SALES_ORDER_READ)) {
            backlog = new Kpi(carteira(ref), carteira(refBase), ult9.stream().map(m -> carteira(fimDe(m, today))).toList(), null);
            backlogEquip = jdbc.sql("""
                    select coalesce(sum(l.quantity), 0)::int from sales_order o join sales_order_line l on l.order_id = o.id
                     where l.kind = 'EQUIPAMENTO' and o.status in ('CONFIRMED', 'IN_EXECUTION')
                    """).query(Integer.class).single();
            carteira = carteiraPorMes();
        }

        Kpi funnel = null;
        Integer funnelOpen = null;
        Chart funil = null;
        if (u.can(Permissions.OPPORTUNITY_READ)) {
            long[] atual = funil(ref.plusDays(1));
            funnel = new Kpi(atual[1], funil(refBase.plusDays(1))[1], ult9.stream().map(m -> funil(fimDe(m, today).plusDays(1))[1]).toList(), null);
            funnelOpen = (int) atual[2];
            List<String> cats = new ArrayList<>();
            List<Long> valor = new ArrayList<>(), pond = new ArrayList<>();
            jdbc.sql("""
                    select s.name, coalesce(sum(x.potential), 0), coalesce(sum(x.potential * s.close_percent / 100), 0)
                      from opportunity_stage s
                      left join (select o.stage, o.potential_cents potential from opportunity o where o.status = 'ABERTA') x on x.stage = s.code
                     group by s.code, s.name, s.position order by s.position
                    """).query((rs, n) -> {
                cats.add(rs.getString(1));
                valor.add(rs.getBigDecimal(2).longValue());
                pond.add(rs.getBigDecimal(3).setScale(0, java.math.RoundingMode.HALF_UP).longValue());
                return null;
            }).list();
            funil = new Chart(cats, List.of(new Series("Valor", valor), new Series("Ponderado", pond)));
        }

        Kpi cash = null;
        Chart fluxo = null;
        if (u.can(Permissions.FINANCIAL_TITLE_READ)) {
            cash = new Kpi(caixa(ref), caixa(refBase), ult9.stream().map(m -> caixa(fimDe(m, today))).toList(), null);
            List<Long> ent = new ArrayList<>(), sai = new ArrayList<>();
            for (YearMonth m : ult12) {
                long[] es = entradasSaidas(m.atDay(1), m.plusMonths(1).atDay(1));
                ent.add(es[0]);
                sai.add(es[1]);
            }
            fluxo = new Chart(rotulos(ult12), List.of(new Series("Entradas", ent), new Series("Saídas", sai)));
        }

        Kpi inst = null;
        List<Delivery> entregas = List.of();
        if (u.can(Permissions.PROJECT_READ)) {
            long agora = instalacoes(today, today.plusDays(30));
            long antes = instalacoes(today.minusDays(30), today);
            inst = new Kpi(agora, antes, ult9.stream().map(m -> instalacoes(m.atDay(1), m.plusMonths(1).atDay(1))).toList(), null);
            entregas = entregas(today);
        }

        Kpi estoque = null;
        List<String> nomesEstoque = List.of();
        List<Map<String, Object>> abaixo = List.of();
        if (u.can(Permissions.STOCK_READ)) {
            abaixo = abaixoDoMinimo();
            nomesEstoque = abaixo.stream().map(r -> (String) r.get("description")).toList();
            estoque = new Kpi((long) abaixo.size(), null, null, null);
        }

        List<Alert> alertas = alertas(u, today, abaixo);
        return new Cockpit(p.code(), p.label(), cmp, switch (cmp) {
            case "ANO_ANTERIOR" -> base.label();
            case "META" -> "meta";
            default -> rotuloAnterior(p);
        }, ref.toString(), billing, backlog, backlogEquip, funnel, funnelOpen, cash, null, inst, null, estoque, nomesEstoque,
                fatMeta, mix, carteira, fluxo, null, funil, alertas, entregas);
    }

    public record Coluna(String title, String width, String type) { }

    public record Detalhe(String key, String title, String description, String icon, String totalLabel, String totalType,
                          long total, List<Coluna> columns, List<Map<String, Object>> rows, String openKind) { }

    /**
     * Dados do indicador (Cockpit-Dados): as linhas que formam o número do cartão. Cada linha traz {@code id} (o registro
     * que a seta abre, quando há), {@code cells} na ordem das colunas e {@code badge} (situação).
     */
    @GetMapping("/api/v1/cockpit/indicators/{key}")
    @Transactional(readOnly = true)
    public Detalhe indicator(@PathVariable String key, @RequestParam(value = "period", required = false) String rawPeriod) {
        LocalDate today = LocalDate.now(clock.withZone(ZONA));
        Periodo p = periodo(rawPeriod, today);
        return switch (key) {
            case "faturamento" -> {
                CurrentUserHolder.require(Permissions.DOCUMENT_READ);
                List<Map<String, Object>> rows = jdbc.sql("""
                        select d.id, d.series, d.number, d.issue_date, pt.legal_name, d.total_cents, d.authorization_status,
                               (select string_agg(l.description, ' · ' order by l.seq) from document_line l where l.document_id = d.id) itens,
                               exists (select 1 from document_line l where l.document_id = d.id and l.kind = 'SERVICO')
                               and not exists (select 1 from document_line l where l.document_id = d.id and l.kind = 'PRODUTO') servico
                          from business_document d join partner pt on pt.id = d.partner_id
                         where d.direction = 'SAIDA' and d.status = 'ATIVO' and d.issue_date >= :f and d.issue_date < :t
                         order by d.issue_date, d.number
                        """).param("f", Date.valueOf(p.from())).param("t", Date.valueOf(p.to())).query((rs, n) -> linha(rs.getObject(1),
                        List.of((rs.getBoolean(9) ? "NFS-e " : "NF-e ") + rs.getString(3), br(rs.getDate(4)), rs.getString(5),
                                str(rs.getString(8)), rs.getLong(6)),
                        "PENDENTE".equals(rs.getString(7)) ? "Pendente" : "Autorizada")).list();
                yield new Detalhe(key, "Notas fiscais emitidas", "Documentos de saída que formam o faturamento do período", "faturamento",
                        "Total faturado", "money", soma(rows, 4), List.of(new Coluna("Nota fiscal", "110px", ""), new Coluna("Emissão", "90px", ""),
                        new Coluna("Cliente", null, ""), new Coluna("Itens", null, ""), new Coluna("Valor (R$)", "130px", "money"),
                        new Coluna("Situação", "110px", "badge")), rows, "document");
            }
            case "carteira" -> {
                CurrentUserHolder.require(Permissions.SALES_ORDER_READ);
                List<Map<String, Object>> rows = jdbc.sql("""
                        select o.id, o.code, pt.legal_name,
                               (select string_agg(case when l.quantity > 1 then trim(to_char(l.quantity, 'FM999990')) || ' × ' else '' end
                                                  || l.description, ' + ' order by l.position) from sales_order_line l where l.order_id = o.id) equip,
                               o.promised_date, o.total_cents - coalesce((select sum(d.total_cents) from business_document d
                                                     where d.order_id = o.id and d.status = 'ATIVO' and d.direction = 'SAIDA'), 0) saldo,
                               pj.stage, o.status
                          from sales_order o join partner pt on pt.id = o.customer_id left join project pj on pj.id = o.project_id
                         where o.status in ('CONFIRMED', 'IN_EXECUTION')
                         order by o.promised_date nulls last, o.code
                        """).query((rs, n) -> linha(rs.getObject(1), List.of(rs.getString(2), rs.getString(3), str(rs.getString(4)),
                        br(rs.getDate(5)), rs.getLong(6)), etapaProjeto(rs.getString(7)))).list();
                yield new Detalhe(key, "Pedidos de venda em aberto", "Pedidos confirmados que ainda não foram faturados por completo", "vendas",
                        "Total da carteira", "money", soma(rows, 4), List.of(new Coluna("Pedido", "96px", ""), new Coluna("Cliente", null, ""),
                        new Coluna("Equipamento", null, ""), new Coluna("Entrega", "90px", ""), new Coluna("Saldo (R$)", "130px", "money"),
                        new Coluna("Etapa", "150px", "badge")), rows, "sales-order");
            }
            case "caixa" -> {
                CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
                LocalDate ref = p.ref(today);
                List<Map<String, Object>> rows = jdbc.sql("""
                        select a.id, a.code || ' — ' || a.name, case when a.kind = 'CAIXA' then '—'
                                    else coalesce(a.agency, '—') || ' / ' || coalesce(a.account_number, '—') end,
                               (select max(m.effective_date) from cash_movement m where m.account_id = a.id and m.effective_date <= :r),
                               a.opening_cents + coalesce((select sum(m.amount_cents) from cash_movement m
                                                            where m.account_id = a.id and m.effective_date <= :r), 0)
                          from bank_account a where a.status = 'ATIVO' and a.opening_on <= :r order by a.code
                        """).param("r", Date.valueOf(ref)).query((rs, n) -> linha(rs.getObject(1), List.of(rs.getString(2), rs.getString(3),
                        rs.getDate(4) == null ? "—" : br(rs.getDate(4)), rs.getLong(5)), "Ativa")).list();
                yield new Detalhe(key, "Contas bancárias e caixa", "Saldos pelos movimentos registrados até " + ref.format(BR), "bancos",
                        "Saldo total", "money", soma(rows, 3), List.of(new Coluna("Conta", null, ""), new Coluna("Agência / conta", "160px", ""),
                        new Coluna("Último movimento", "130px", ""), new Coluna("Saldo (R$)", "140px", "money"),
                        new Coluna("Situação", "110px", "badge")), rows, "bank-account");
            }
            case "instalacoes" -> {
                CurrentUserHolder.require(Permissions.PROJECT_READ);
                List<Map<String, Object>> rows = jdbc.sql("""
                        select pj.id, pj.contract_delivery, pt.legal_name, coalesce(e.model, '') || coalesce(' nº ' || e.serial_number, ''),
                               coalesce(u.city || ' / ' || u.state, pj.unit_name, '—'), pj.code, pj.stage
                          from equipment e join project pj on pj.id = e.project_id join partner pt on pt.id = e.customer_id
                          left join partner_unit u on u.id = e.unit_id
                         where pj.contract_delivery >= :f and pj.contract_delivery < :t and pj.stage not in ('ACEITO', 'ENCERRADO')
                         order by pj.contract_delivery, pt.legal_name, e.line_seq
                        """).param("f", Date.valueOf(today)).param("t", Date.valueOf(today.plusDays(30)))
                        .query((rs, n) -> linha(rs.getObject(1), List.of(br(rs.getDate(2)), rs.getString(3), rs.getString(4), rs.getString(5),
                                rs.getString(6)), etapaProjeto(rs.getString(7)))).list();
                yield new Detalhe(key, "Instalações programadas", "Próximos 30 dias, pela entrega contratual dos projetos", "instalacoes",
                        "Instalações", "count", rows.size(), List.of(new Coluna("Data", "90px", ""), new Coluna("Cliente", null, ""),
                        new Coluna("Equipamento", null, ""), new Coluna("Cidade / UF", "170px", ""), new Coluna("Projeto", "110px", ""),
                        new Coluna("Etapa", "150px", "badge")), rows, "project");
            }
            case "estoque" -> {
                CurrentUserHolder.require(Permissions.STOCK_READ);
                List<Map<String, Object>> rows = abaixoDoMinimo().stream().map(r -> linha(r.get("id"), List.of(r.get("code"), r.get("description"),
                        r.get("onHand"), r.get("min"), r.get("onOrder"), r.get("supplier")), (String) r.get("level"))).toList();
                yield new Detalhe(key, "Itens abaixo do estoque mínimo", "Materiais e peças que precisam de reposição", "estoque",
                        "Itens críticos", "count", rows.size(), List.of(new Coluna("Código", "90px", ""), new Coluna("Descrição", null, ""),
                        new Coluna("Disponível", "100px", "num"), new Coluna("Mínimo", "90px", "num"), new Coluna("Em pedido", "90px", "num"),
                        new Coluna("Fornecedor", null, ""), new Coluna("Situação", "110px", "badge")), rows, "item");
            }
            case "producao", "chamados" -> throw new RuleViolationException("COCKPIT_MODULE_MISSING",
                    ("producao".equals(key) ? "Ordens de produção" : "Chamados de pós-venda") + " ainda não têm módulo no sistema.", List.of());
            default -> throw new br.com.fourtech.rendamais.kernel.NotFoundException("Indicador não encontrado.");
        };
    }

    // ---------------------------------------------------------------- cálculos

    private long faturado(LocalDate from, LocalDate to) {
        return jdbc.sql("""
                select coalesce(sum(total_cents), 0) from business_document
                 where direction = 'SAIDA' and status = 'ATIVO' and issue_date >= :f and issue_date < :t
                """).param("f", Date.valueOf(from)).param("t", Date.valueOf(to)).query(Long.class).single();
    }

    private long metaFaturamento(LocalDate from, LocalDate to) {
        return jdbc.sql("select coalesce(sum(target_cents), 0) from billing_target where month >= :f and month < :t")
                .param("f", Date.valueOf(from)).param("t", Date.valueOf(to)).query(Long.class).single();
    }

    /**
     * Receita por linha de produto: cada modelo de balança (categoria Balanças de renda) é uma linha; os serviços se dividem
     * em contratos de manutenção (categorias Contratos e Manutenção) e instalação e serviços; os demais produtos são peças e
     * acessórios.
     */
    private List<Slice> receitaPorLinha(LocalDate from, LocalDate to) {
        List<Slice> all = jdbc.sql("""
                select case when c.code = 'BAL' then 'Balança ' || split_part(regexp_replace(i.description, '^Balança de renda ', ''), ' — ', 1)
                            when l.kind = 'SERVICO' and c.code in ('CTR', 'MAN') then 'Contratos de manutenção'
                            when l.kind = 'SERVICO' then 'Instalação e serviços'
                            else 'Peças e acessórios' end, sum(l.amount_cents)
                  from document_line l join business_document d on d.id = l.document_id
                  left join item i on i.id = l.item_id left join item_category c on c.id = i.category_id
                 where d.direction = 'SAIDA' and d.status = 'ATIVO' and d.issue_date >= :f and d.issue_date < :t
                 group by 1 order by 2 desc
                """).param("f", Date.valueOf(from)).param("t", Date.valueOf(to)).query((rs, n) -> new Slice(rs.getString(1), rs.getLong(2))).list();
        if (all.size() <= 6) return all;
        List<Slice> top = new ArrayList<>(all.subList(0, 5));
        top.add(new Slice("Outras linhas", all.subList(5, all.size()).stream().mapToLong(Slice::value).sum()));
        return top;
    }

    /** Carteira no dia {@code ref}: pedidos confirmados até o dia, menos o que já foi faturado deles até o dia. */
    private long carteira(LocalDate ref) {
        Timestamp fimDoDia = Timestamp.from(ref.plusDays(1).atStartOfDay(ZONA).toInstant());
        return jdbc.sql("""
                select coalesce(sum(greatest(o.total_cents - coalesce((select sum(d.total_cents) from business_document d
                        where d.order_id = o.id and d.status = 'ATIVO' and d.direction = 'SAIDA' and d.issue_date <= :r), 0), 0)), 0)
                  from sales_order o
                 where o.confirmed_at < :fim and (o.status in ('CONFIRMED', 'IN_EXECUTION', 'COMPLETED')
                       or (o.status = 'CANCELLED' and o.cancelled_at >= :fim))
                """).param("r", Date.valueOf(ref)).param("fim", fimDoDia).query(Long.class).single();
    }

    /** Saldo da carteira por mês da entrega prometida, separado pela etapa do projeto do pedido. */
    private Chart carteiraPorMes() {
        Map<YearMonth, long[]> por = new java.util.TreeMap<>();
        jdbc.sql("""
                select o.promised_date, coalesce(pj.stage, 'PLANEJADO'),
                       o.total_cents - coalesce((select sum(d.total_cents) from business_document d
                                                  where d.order_id = o.id and d.status = 'ATIVO' and d.direction = 'SAIDA'), 0)
                  from sales_order o left join project pj on pj.id = o.project_id
                 where o.status in ('CONFIRMED', 'IN_EXECUTION') and o.promised_date is not null
                """).query((rs, n) -> {
            long[] a = por.computeIfAbsent(YearMonth.from(rs.getDate(1).toLocalDate()), k -> new long[3]);
            int i = switch (rs.getString(2)) {
                case "PRODUCAO" -> 1;
                case "INSTALACAO", "ACEITO", "ENCERRADO" -> 2;
                default -> 0;
            };
            a[i] += Math.max(0, rs.getLong(3));
            return null;
        }).list();
        List<YearMonth> ms = new ArrayList<>(por.keySet());
        return new Chart(rotulos(ms), List.of(new Series("Em engenharia", ms.stream().map(m -> por.get(m)[0]).toList()),
                new Series("Em produção", ms.stream().map(m -> por.get(m)[1]).toList()),
                new Series("Aguardando instalação", ms.stream().map(m -> por.get(m)[2]).toList())));
    }

    /** Funil no instante {@code until}: [aberto, ponderado, quantidade], pela última passagem de etapa de cada oportunidade. */
    private long[] funil(LocalDate until) {
        return jdbc.sql("""
                select coalesce(sum(c.potential_cents), 0), coalesce(sum(c.weighted_cents), 0), count(*)
                  from opportunity o
                  join lateral (select * from opportunity_stage_change x where x.opportunity_id = o.id and x.changed_at < :until
                                 order by x.changed_at desc, x.id desc limit 1) c on true
                 where c.status = 'ABERTA'
                """).param("until", Timestamp.from(until.atStartOfDay(ZONA).toInstant()))
                .query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2), rs.getLong(3)}).single();
    }

    private long caixa(LocalDate ref) {
        return jdbc.sql("""
                select coalesce(sum(a.opening_cents), 0)
                       + coalesce((select sum(m.amount_cents) from cash_movement m join bank_account b on b.id = m.account_id
                                    where m.effective_date <= :r and b.opening_on <= :r), 0)
                  from bank_account a where a.opening_on <= :r
                """).param("r", Date.valueOf(ref)).query(Long.class).single();
    }

    /** Entradas e saídas de caixa do intervalo, sem as transferências entre contas. */
    private long[] entradasSaidas(LocalDate from, LocalDate to) {
        return jdbc.sql("""
                select coalesce(sum(amount_cents) filter (where amount_cents > 0), 0), coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0)
                  from cash_movement where effective_date >= :f and effective_date < :t and kind in ('SETTLEMENT', 'SETTLEMENT_REVERSAL')
                """).param("f", Date.valueOf(from)).param("t", Date.valueOf(to)).query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
    }

    /** Equipamentos com entrega contratual no intervalo (instalações programadas). */
    private long instalacoes(LocalDate from, LocalDate to) {
        return jdbc.sql("""
                select count(*) from equipment e join project pj on pj.id = e.project_id
                 where pj.contract_delivery >= :f and pj.contract_delivery < :t and pj.stage <> 'ENCERRADO'
                """).param("f", Date.valueOf(from)).param("t", Date.valueOf(to)).query(Long.class).single();
    }

    private List<Delivery> entregas(LocalDate today) {
        return jdbc.sql("""
                select pj.contract_delivery, pt.legal_name, coalesce(e.model, pj.name) || coalesce(' nº ' || e.serial_number, ''), pj.stage, pj.id
                  from project pj join partner pt on pt.id = pj.customer_id
                  left join equipment e on e.project_id = pj.id
                 where pj.contract_delivery >= :h and pj.stage not in ('ACEITO', 'ENCERRADO')
                 order by pj.contract_delivery, pt.legal_name, e.line_seq limit 12
                """).param("h", Date.valueOf(today)).query((rs, n) -> new Delivery(br(rs.getDate(1)), rs.getString(2), rs.getString(3),
                etapaProjeto(rs.getString(4)), (UUID) rs.getObject(5))).list();
    }

    /**
     * Itens com estoque mínimo na ficha e disponível (em estoque menos reservado) abaixo dele; Crítico quando nem o que
     * está em pedido cobre o mínimo.
     */
    private List<Map<String, Object>> abaixoDoMinimo() {
        return jdbc.sql("""
                select i.id, i.code, i.description, coalesce(sum(b.on_hand - b.reserved), 0), (i.profile ->> 'minStock')::numeric,
                       coalesce(sum(b.on_order), 0), coalesce(i.profile ->> 'preferredSupplier', '—'), i.uom_code
                  from item i left join item_stock_balance b on b.item_id = i.id
                 where i.status = 'ATIVO' and i.profile ->> 'minStock' ~ '^[0-9]+(\\.[0-9]+)?$' and (i.profile ->> 'minStock')::numeric > 0
                 group by i.id having coalesce(sum(b.on_hand - b.reserved), 0) < (i.profile ->> 'minStock')::numeric
                 order by (coalesce(sum(b.on_hand - b.reserved), 0) + coalesce(sum(b.on_order), 0)) / (i.profile ->> 'minStock')::numeric, i.code
                """).query((rs, n) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            BigDecimal saldo = rs.getBigDecimal(4), min = rs.getBigDecimal(5), ped = rs.getBigDecimal(6);
            boolean inteiro = "UN".equals(rs.getString(8)) || "PC".equals(rs.getString(8));
            m.put("id", rs.getObject(1));
            m.put("code", rs.getString(2));
            m.put("description", rs.getString(3));
            m.put("onHand", qtd(saldo, inteiro));
            m.put("min", qtd(min, inteiro));
            m.put("onOrder", qtd(ped, inteiro));
            m.put("supplier", "—".equals(rs.getString(7)) ? "—" : rs.getString(7));
            m.put("level", saldo.add(ped).compareTo(min) < 0 ? "Crítico" : "Em reposição");
            return m;
        }).list();
    }

    /** O que precisa de atenção: regras sobre os dados de cada módulo que o usuário pode ler (sem IA, ADR-014). */
    private List<Alert> alertas(CurrentUser u, LocalDate today, List<Map<String, Object>> abaixo) {
        List<Alert> a = new ArrayList<>();
        if (u.can(Permissions.PROJECT_READ)) {
            jdbc.sql("""
                    select pj.code, pj.name, pt.legal_name, pj.contract_delivery from project pj join partner pt on pt.id = pj.customer_id
                     where pj.contract_delivery < :h and pj.stage not in ('ACEITO', 'ENCERRADO') order by pj.contract_delivery limit 3
                    """).param("h", Date.valueOf(today)).query((rs, n) -> a.add(new Alert("Projetos", "rp-ico-projetos",
                    rs.getString(1) + " — " + rs.getString(3) + " atrasado " + ChronoUnit.DAYS.between(rs.getDate(4).toLocalDate(), today) + " dias",
                    br(rs.getDate(4)), "Atrasada", "project", null))).list();
        }
        abaixo.stream().filter(r -> "Crítico".equals(r.get("level"))).limit(3).forEach(r -> a.add(new Alert("Estoque", "rp-ico-estoque",
                r.get("description") + ": " + r.get("onHand") + " em estoque, mínimo " + r.get("min"), "Hoje", "Crítico", "item", r.get("id").toString())));
        if (u.can(Permissions.FINANCIAL_TITLE_READ)) {
            jdbc.sql("""
                    select coalesce(sum(original_cents - received_cents), 0), count(*), min(due_date) from financial_title
                     where direction = 'RECEIVABLE' and lifecycle = 'ACTIVE' and received_cents < original_cents and due_date < :d
                    """).param("d", Date.valueOf(today.minusDays(15))).query((rs, n) -> {
                if (rs.getLong(2) > 0) a.add(new Alert("Financeiro", "rp-ico-financas", reais(rs.getLong(1)) + " a receber vencidos há mais de 15 dias ("
                        + rs.getLong(2) + (rs.getLong(2) == 1 ? " título)" : " títulos)"), br(rs.getDate(3)), "Atenção", "receivables", null));
                return null;
            }).list();
            jdbc.sql("""
                    select coalesce(sum(original_cents - received_cents), 0), count(*), min(due_date) from financial_title
                     where direction = 'PAYABLE' and lifecycle = 'ACTIVE' and received_cents < original_cents and due_date >= :h and due_date < :t
                    """).param("h", Date.valueOf(today)).param("t", Date.valueOf(today.plusDays(8))).query((rs, n) -> {
                if (rs.getLong(2) > 0) a.add(new Alert("Financeiro", "rp-ico-financas", reais(rs.getLong(1)) + " a pagar nos próximos 7 dias ("
                        + rs.getLong(2) + (rs.getLong(2) == 1 ? " título)" : " títulos)"), br(rs.getDate(3)), "Informativo", "payables", null));
                return null;
            }).list();
        }
        if (u.can(Permissions.OPPORTUNITY_READ)) {
            jdbc.sql("""
                    select o.id, o.code, o.expected_close,
                           (:h - coalesce(greatest((select max(a.day) from crm_activity a where a.opportunity_id = o.id and a.status = 'CONCLUIDA'),
                                    o.last_interaction, (select max(c.changed_at)::date from opportunity_stage_change c where c.opportunity_id = o.id)),
                                    o.created_at::date)) dias,
                           (select min(a.day) from crm_activity a where a.opportunity_id = o.id and a.status = 'PLANEJADA') proxima
                      from opportunity o where o.status = 'ABERTA'
                    """).param("h", Date.valueOf(today)).query((rs, n) -> {
                int dias = rs.getInt(4);
                Date prox = rs.getDate(5);
                if (dias >= 14 && (prox == null || prox.toLocalDate().isBefore(today))) {
                    a.add(new Alert("Comercial", "rp-ico-oportunidades", rs.getString(2) + " sem atividade há " + dias + " dias",
                            rs.getDate(3) == null ? "—" : br(rs.getDate(3)), "Atenção", "opportunity", rs.getObject(1).toString()));
                }
                return null;
            }).list();
        }
        if (u.can(Permissions.TAX_READ)) {
            jdbc.sql("""
                    select name, due_date from tax_obligation where status not in ('ENTREGUE', 'PAGO') and due_date >= :h and due_date < :t
                     order by due_date limit 2
                    """).param("h", Date.valueOf(today)).param("t", Date.valueOf(today.plusDays(10)))
                    .query((rs, n) -> a.add(new Alert("Fiscal", "rp-ico-fiscal", rs.getString(1) + " vence em " + br(rs.getDate(2)), br(rs.getDate(2)),
                            "Informativo", "tax-obligations", null))).list();
        }
        return a;
    }

    // ---------------------------------------------------------------- auxiliares

    private Periodo periodo(String raw, LocalDate today) {
        String s = raw == null || raw.isBlank() ? YearMonth.from(today).toString() : raw.strip().toUpperCase();
        try {
            if (s.matches("\\d{4}-\\d{2}")) {
                YearMonth m = YearMonth.parse(s);
                return new Periodo(s, MES_LONGO[m.getMonthValue() - 1] + " de " + m.getYear(), m.atDay(1), m.plusMonths(1).atDay(1));
            }
            if (s.matches("\\d{4}-T[1-4]")) {
                int y = Integer.parseInt(s.substring(0, 4)), q = s.charAt(6) - '0';
                LocalDate f = LocalDate.of(y, (q - 1) * 3 + 1, 1);
                return new Periodo(s, new String[] {"Primeiro", "Segundo", "Terceiro", "Quarto"}[q - 1] + " trimestre de " + y, f, f.plusMonths(3));
            }
            if (s.matches("\\d{4}")) {
                int y = Integer.parseInt(s);
                return new Periodo(s, "Ano de " + y, LocalDate.of(y, 1, 1), LocalDate.of(y + 1, 1, 1));
            }
        } catch (java.time.DateTimeException e) {
            // cai no erro abaixo
        }
        throw new RuleViolationException("COCKPIT_INVALID", "Corrija os campos indicados.",
                List.of(new FieldIssue("period", "Período no formato AAAA-MM, AAAA-Tn ou AAAA.")));
    }

    private Periodo comparado(Periodo p, String cmp) {
        if ("ANO_ANTERIOR".equals(cmp)) {
            LocalDate f = p.from().minusYears(1), t = p.to().minusYears(1);
            String code = p.code().replaceFirst("^\\d{4}", String.valueOf(f.getYear()));
            return new Periodo(code, p.label().replaceFirst("\\d{4}$", String.valueOf(f.getYear())), f, t);
        }
        long meses = ChronoUnit.MONTHS.between(p.from(), p.to());
        return new Periodo("", "", p.from().minusMonths(meses), p.from());
    }

    private static String rotuloAnterior(Periodo p) {
        long meses = ChronoUnit.MONTHS.between(p.from(), p.to());
        return meses == 1 ? "mês anterior" : meses == 3 ? "trimestre anterior" : "ano anterior";
    }

    private static List<YearMonth> meses(YearMonth fim, int n) {
        List<YearMonth> l = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) l.add(fim.minusMonths(i));
        return l;
    }

    private static List<String> rotulos(List<YearMonth> ms) {
        return ms.stream().map(m -> MES[m.getMonthValue() - 1]).toList();
    }

    private static LocalDate fimDe(YearMonth m, LocalDate today) {
        LocalDate f = m.atEndOfMonth();
        return f.isAfter(today) ? today : f;
    }

    private static String etapaProjeto(String stage) {
        if (stage == null) return "Aguardando início";
        return switch (stage) {
            case "PLANEJADO" -> "Aguardando início";
            case "ENGENHARIA" -> "Em engenharia";
            case "SUPRIMENTOS" -> "Em suprimentos";
            case "PRODUCAO" -> "Em produção";
            case "INSTALACAO" -> "Aguardando instalação";
            case "ACEITO" -> "Aceito";
            default -> "Encerrado";
        };
    }

    private static Map<String, Object> linha(Object id, List<Object> cells, String badge) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("cells", cells);
        m.put("badge", badge);
        return m;
    }

    private static long soma(List<Map<String, Object>> rows, int col) {
        return rows.stream().mapToLong(r -> ((Number) ((List<?>) r.get("cells")).get(col)).longValue()).sum();
    }

    private static String qtd(BigDecimal v, boolean inteiro) {
        java.text.NumberFormat f = java.text.NumberFormat.getNumberInstance(java.util.Locale.forLanguageTag("pt-BR"));
        f.setMinimumFractionDigits(inteiro ? 0 : 3);
        f.setMaximumFractionDigits(inteiro ? 0 : 3);
        return f.format(v);
    }

    private static String reais(long cents) {
        java.text.NumberFormat f = java.text.NumberFormat.getNumberInstance(java.util.Locale.forLanguageTag("pt-BR"));
        f.setMaximumFractionDigits(0);
        return "R$ " + f.format(Math.round(cents / 100.0));
    }

    private static String br(Date d) {
        return d == null ? "—" : d.toLocalDate().format(BR);
    }

    private static String str(String s) {
        return s == null ? "—" : s;
    }
}
