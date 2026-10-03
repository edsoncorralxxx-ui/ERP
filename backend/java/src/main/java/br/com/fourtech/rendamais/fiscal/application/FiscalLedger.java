package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.fiscal.domain.SimplesCalculation;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Receita mês a mês por anexo, de onde saem o RBT12 e as prévias do cálculo (Sprint 12). Antes do início da receita no
 * Renda+ ({@code renda.fiscal.revenue-start}) a receita do mês é o histórico informado (o declarado no PGDAS-D); a partir
 * dele, as notas. Um mês só é conhecido quando tem histórico (antes do início) ou já terminou (a partir do início); mês
 * desconhecido nunca é tratado como zero. Lê na transação de quem chama.
 */
@Component
public class FiscalLedger {

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    /** Receita de um mês por anexo; {@code origin} é NOTAS, HISTORICO ou nulo (desconhecido). */
    public record Month(YearMonth competence, Map<Annex, Long> byAnnex, String origin, int documents) {
        public long totalCents() {
            return byAnnex.values().stream().mapToLong(Long::longValue).sum();
        }

        public boolean known() {
            return origin != null;
        }

        /** Receita para o cálculo: anexos I, II e III sempre (zero se não houver), IV e V só com receita. */
        public Map<Annex, Long> forCalculation() {
            Map<Annex, Long> out = new EnumMap<>(Annex.class);
            out.put(Annex.I, 0L);
            out.put(Annex.II, 0L);
            out.put(Annex.III, 0L);
            byAnnex.forEach((a, c) -> {
                if (c > 0 || out.containsKey(a)) out.put(a, c);
            });
            return out;
        }
    }

    /** RBT12 da competência: o calculado (se todos os 12 meses são conhecidos), o informado e os meses que faltam. */
    public record Rbt12View(Long calculatedCents, Long informedCents, List<YearMonth> missing, List<Month> months) {
        public SimplesCalculation.Rbt12 used() {
            if (calculatedCents != null) return new SimplesCalculation.Rbt12(calculatedCents, "CALCULADO");
            return informedCents == null ? null : new SimplesCalculation.Rbt12(informedCents, "INFORMADO");
        }
    }

    private final DocumentQueryApi documents;
    private final TaxSetupRepository setup;
    private final TaxRepository taxes;
    private final Clock clock;
    private final YearMonth revenueStart;

    FiscalLedger(DocumentQueryApi documents, TaxSetupRepository setup, TaxRepository taxes, Clock clock,
                 @Value("${renda.fiscal.revenue-start:2026-09}") String revenueStart) {
        this.documents = documents;
        this.setup = setup;
        this.taxes = taxes;
        this.clock = clock;
        this.revenueStart = YearMonth.parse(revenueStart);
    }

    public YearMonth revenueStart() {
        return revenueStart;
    }

    public YearMonth currentMonth() {
        return YearMonth.now(clock.withZone(BUSINESS_ZONE));
    }

    /** Meses de {@code from} a {@code to}, inclusive. */
    public Map<YearMonth, Month> months(YearMonth from, YearMonth to) {
        Map<YearMonth, DocumentQueryApi.Revenue> notes = documents.revenue(from, to);
        Map<YearMonth, TaxSetupRepository.History> history = setup.history(from, to);
        YearMonth current = currentMonth();
        Map<YearMonth, Month> out = new TreeMap<>();
        for (YearMonth m = from; !m.isAfter(to); m = m.plusMonths(1)) {
            Map<Annex, Long> byAnnex = new EnumMap<>(Annex.class);
            String origin;
            int docs = 0;
            if (m.isBefore(revenueStart)) {
                TaxSetupRepository.History h = history.get(m);
                if (h != null) for (Annex a : Annex.values()) if (h.annexCents()[a.ordinal()] > 0) byAnnex.put(a, h.annexCents()[a.ordinal()]);
                origin = h == null ? null : "HISTORICO";
            } else {
                DocumentQueryApi.Revenue r = notes.get(m);
                if (r != null) {
                    r.byAnnex().forEach((k, v) -> byAnnex.put(Annex.valueOf(k), v));
                    docs = r.documents();
                }
                origin = m.isBefore(current) ? "NOTAS" : null;
            }
            out.put(m, new Month(m, byAnnex, origin, docs));
        }
        return out;
    }

    /** Receita da própria competência (o mês ainda aberto também conta: é o que está documentado até agora). */
    public Month month(YearMonth c) {
        Month m = months(c, c).get(c);
        return new Month(c, m.byAnnex(), m.origin() == null && !c.isBefore(revenueStart) ? "NOTAS" : m.origin(), m.documents());
    }

    public Rbt12View rbt12(YearMonth c, Long informedCents) {
        return rbt12(c, informedCents, months(c.minusMonths(12), c.minusMonths(1)));
    }

    /** RBT12 a partir dos meses já lidos (os 12 anteriores a {@code c} precisam estar em {@code book}). */
    public Rbt12View rbt12(YearMonth c, Long informedCents, Map<YearMonth, Month> book) {
        List<YearMonth> missing = new ArrayList<>();
        List<Month> months = new ArrayList<>();
        long sum = 0;
        for (YearMonth m = c.minusMonths(12); m.isBefore(c); m = m.plusMonths(1)) {
            Month x = book.get(m);
            if (x == null || !x.known()) missing.add(m);
            else {
                sum += x.totalCents();
                months.add(x);
            }
        }
        return new Rbt12View(missing.isEmpty() ? sum : null, informedCents, missing, missing.isEmpty() ? months : List.of());
    }

    /** Prévia do cálculo (não gravada): com a receita e o RBT12 de agora e os parâmetros vigentes. */
    public SimplesCalculation.Result preview(YearMonth c, Map<YearMonth, Month> book, Long informedCents) {
        Rbt12View r = rbt12(c, informedCents, book);
        Month m = book.containsKey(c) ? book.get(c) : month(c);
        TaxParameters p = taxes.parametersFor(c).orElse(null);
        return SimplesCalculation.calculate(c, p, r.used(), r.missing(), m.forCalculation());
    }

    /** Receita acumulada do ano até a competência (inclusive), com os meses conhecidos; o mês da competência conta mesmo aberto. */
    public long yearToDate(YearMonth c, Map<YearMonth, Month> book) {
        long sum = 0;
        for (YearMonth m = YearMonth.of(c.getYear(), 1); !m.isAfter(c); m = m.plusMonths(1)) {
            Month x = book.get(m);
            if (x != null) sum += x.totalCents();
        }
        return sum;
    }
}
