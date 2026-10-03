package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.HashSet;

/**
 * Agenda e funil do CRM (Sprint 11). A agenda agrupa as próximas ações (vencidas, hoje, próximos 7 dias, depois e
 * oportunidade aberta sem ação); o funil soma o potencial e o ponderado das abertas por etapa, as ganhas e perdidas no
 * período (com os motivos) e a conversão por etapa (IND-016), "não calculável" quando ninguém entrou na etapa.
 */
@Service
public class CrmQueries {

    public enum Bucket { SEM_ACAO, VENCIDA, HOJE, SEMANA, DEPOIS }

    public record AgendaItem(Bucket bucket, CrmQueryRepository.AgendaRow row) { }

    public record StageTotal(String code, String name, BigDecimal closePercent, int count, long potentialCents,
                             long weightedCents) { }

    /** IND-016 por etapa: entraram no período e, dessas, avançaram depois. {@code rate} nulo = não calculável. */
    public record Conversion(String code, String name, int entered, int advanced, BigDecimal rate) { }

    public record Closed(int count, long potentialCents) { }

    public record Funnel(LocalDate from, LocalDate to, List<StageTotal> stages, int openCount, long openPotentialCents,
                         long openWeightedCents, Closed won, Closed lost, Map<String, Closed> lostByReason,
                         List<Conversion> conversion) { }

    private final CrmQueryRepository repository;
    private final OpportunityRepository opportunities;
    private final Clock clock;

    public CrmQueries(CrmQueryRepository repository, OpportunityRepository opportunities, Clock clock) {
        this.repository = repository;
        this.opportunities = opportunities;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AgendaItem> agenda(String owner) {
        CurrentUserHolder.require(Permissions.LEAD_READ);
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        LocalDate today = today();
        List<AgendaItem> items = new ArrayList<>();
        for (CrmQueryRepository.AgendaRow r : repository.agenda(blank(owner))) {
            LocalDate d = r.nextActionDate();
            Bucket b = d == null ? Bucket.SEM_ACAO : d.isBefore(today) ? Bucket.VENCIDA : d.equals(today) ? Bucket.HOJE
                    : !d.isAfter(today.plusDays(7)) ? Bucket.SEMANA : Bucket.DEPOIS;
            items.add(new AgendaItem(b, r));
        }
        return items;
    }

    @Transactional(readOnly = true)
    public Funnel funnel(String rawFrom, String rawTo, String owner) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        LocalDate today = today();
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate from = parse(rawFrom, "from", today.withDayOfYear(1), issues);
        LocalDate to = parse(rawTo, "to", today, issues);
        if (issues.isEmpty() && to.isBefore(from)) issues.add(new FieldIssue("to", "O fim do período é antes do início."));
        if (!issues.isEmpty()) throw new RuleViolationException("FUNNEL_INVALID", "Corrija os campos indicados.", issues);
        Instant start = from.atStartOfDay(SalesOrderService.BUSINESS_ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(SalesOrderService.BUSINESS_ZONE).toInstant();
        String who = blank(owner);

        List<OpportunityRepository.Stage> stages = opportunities.stages();
        Map<String, long[]> sums = new HashMap<>();
        for (CrmQueryRepository.OpenRow r : repository.open(who)) {
            BigDecimal pct = stages.stream().filter(s -> s.code().equals(r.stage())).findFirst()
                    .map(OpportunityRepository.Stage::closePercent).orElse(BigDecimal.ZERO);
            long[] a = sums.computeIfAbsent(r.stage(), k -> new long[3]);
            a[0]++;
            a[1] += r.potentialCents();
            a[2] += Crm.weighted(r.potentialCents(), pct);
        }
        List<StageTotal> totals = new ArrayList<>();
        int openCount = 0;
        long openPotential = 0, openWeighted = 0;
        for (OpportunityRepository.Stage s : stages) {
            long[] a = sums.getOrDefault(s.code(), new long[3]);
            totals.add(new StageTotal(s.code(), s.name(), s.closePercent(), (int) a[0], a[1], a[2]));
            openCount += (int) a[0];
            openPotential += a[1];
            openWeighted += a[2];
        }

        int wonCount = 0, lostCount = 0;
        long wonSum = 0, lostSum = 0;
        Map<String, Closed> byReason = new LinkedHashMap<>();
        for (CrmQueryRepository.ClosedRow c : repository.closed(start, end, who)) {
            if (c.status().equals("GANHA")) {
                wonCount++;
                wonSum += c.potentialCents();
            } else {
                lostCount++;
                lostSum += c.potentialCents();
                Closed prev = byReason.getOrDefault(c.lossReason(), new Closed(0, 0));
                byReason.put(c.lossReason(), new Closed(prev.count() + 1, prev.potentialCents() + c.potentialCents()));
            }
        }

        Map<String, Integer> position = new HashMap<>();
        stages.forEach(s -> position.put(s.code(), s.position()));
        Map<UUID, List<CrmQueryRepository.Passage>> byOpp = new LinkedHashMap<>();
        repository.passages(who).forEach(p -> byOpp.computeIfAbsent(p.opportunityId(), k -> new ArrayList<>()).add(p));
        List<Conversion> conversion = new ArrayList<>();
        for (OpportunityRepository.Stage s : stages) {
            Set<UUID> entered = new HashSet<>();
            Set<UUID> advanced = new HashSet<>();
            byOpp.forEach((opp, list) -> {
                for (int i = 0; i < list.size(); i++) {
                    CrmQueryRepository.Passage p = list.get(i);
                    if (!p.toStage().equals(s.code()) || !p.status().equals("ABERTA")) continue;
                    if (p.changedAt().isBefore(start) || !p.changedAt().isBefore(end)) continue;
                    entered.add(opp);
                    for (int j = i + 1; j < list.size(); j++) {
                        CrmQueryRepository.Passage q = list.get(j);
                        if (q.status().equals("GANHA")
                                || (q.status().equals("ABERTA") && position.getOrDefault(q.toStage(), 0) > s.position())) {
                            advanced.add(opp);
                            break;
                        }
                    }
                    break;
                }
            });
            BigDecimal rate = entered.isEmpty() ? null : BigDecimal.valueOf(advanced.size()).multiply(BigDecimal.valueOf(100))
                    .divide(BigDecimal.valueOf(entered.size()), 2, RoundingMode.HALF_UP);
            conversion.add(new Conversion(s.code(), s.name(), entered.size(), advanced.size(), rate));
        }
        return new Funnel(from, to, totals, openCount, openPotential, openWeighted, new Closed(wonCount, wonSum),
                new Closed(lostCount, lostSum), byReason, conversion);
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(SalesOrderService.BUSINESS_ZONE));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static LocalDate parse(String raw, String field, LocalDate fallback, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) return fallback;
        try {
            return LocalDate.parse(raw.strip());
        } catch (java.time.format.DateTimeParseException e) {
            issues.add(new FieldIssue(field, "Data inválida."));
            return fallback;
        }
    }
}
