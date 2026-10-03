package br.com.fourtech.rendamais.fiscal.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cálculo do DAS de uma competência, por anexo e por tributo (Sprint 12). Para cada anexo com receita: faixa pelo RBT12
 * (a receita bruta total dos 12 meses anteriores, a mesma para todos os anexos), alíquota efetiva = (RBT12 × alíquota
 * nominal − parcela a deduzir) ÷ RBT12 e DAS do anexo = receita do anexo × alíquota efetiva, em centavos, meio para o par
 * (HALF_EVEN, PD-002). A repartição dá a parte de cada tributo (HALF_EVEN, com a diferença de centavos no tributo de
 * maior participação, para os tributos somarem exatamente o DAS do anexo). No anexo com ISS, se o ISS efetivo passar de
 * 5% da receita, o ISS fica em 5% e o excesso vai para os demais tributos na proporção de cada um. Sem parâmetros
 * vigentes, com RBT12 desconhecido ou acima do limite do regime, o resultado é "não calculável" com o motivo — nunca um
 * valor menor.
 */
public final class SimplesCalculation {

    /** Faixa 6 dos anexos: acima do sublimite, ICMS e ISS saem do DAS (não calculados aqui). */
    private static final int SUBLIMIT_BRACKET = 6;
    /** Teto do ISS no DAS: 5% da receita do anexo. */
    public static final BigDecimal ISS_CAP = new BigDecimal("0.05");
    public static final String ISS = "ISS";

    /** RBT12 usado: valor e origem (CALCULADO das notas e do histórico, ou INFORMADO). */
    public record Rbt12(long cents, String origin) { }

    /** Parte de um tributo no DAS do anexo: a fração aplicada (já com o teto do ISS) e o valor. */
    public record TaxShare(String tax, BigDecimal share, long cents) { }

    /** Resultado de um anexo; {@code issExcessCents} é o excesso de ISS redistribuído (0 se não houve teto). */
    public record AnnexResult(Annex annex, int bracket, BigDecimal nominalRate, long deductionCents, BigDecimal effectiveRate,
                              long revenueCents, long taxCents, List<TaxShare> taxes, long issExcessCents) { }

    public record Result(boolean calculable, List<String> reasons, List<AnnexResult> annexes, List<String> warnings) {

        public Long totalTaxCents() {
            return calculable ? annexes.stream().mapToLong(AnnexResult::taxCents).sum() : null;
        }

        public long revenueCents() {
            return annexes.stream().mapToLong(AnnexResult::revenueCents).sum();
        }

        /** Valor por tributo somado nos anexos, na ordem em que os tributos aparecem. */
        public Map<String, Long> taxes() {
            Map<String, Long> out = new LinkedHashMap<>();
            for (AnnexResult a : annexes) for (TaxShare t : a.taxes()) out.merge(t.tax(), t.cents(), Long::sum);
            return out;
        }

        public AnnexResult of(Annex annex) {
            return annexes.stream().filter(a -> a.annex() == annex).findFirst().orElse(null);
        }
    }

    private SimplesCalculation() { }

    /**
     * @param parameters revisão vigente na competência (nula se não houver)
     * @param rbt12 RBT12 conhecido (nulo se desconhecido)
     * @param missing meses sem receita conhecida (para a mensagem, quando {@code rbt12} é nulo)
     * @param revenue receita da competência por anexo (anexos com zero também entram no resultado)
     */
    public static Result calculate(YearMonth competence, TaxParameters parameters, Rbt12 rbt12, List<YearMonth> missing,
                                   Map<Annex, Long> revenue) {
        List<String> reasons = new ArrayList<>();
        if (parameters == null) {
            reasons.add("Sem parâmetros do Simples Nacional vigentes em " + label(competence) + ".");
        }
        if (rbt12 == null) {
            reasons.add("RBT12 desconhecido: o Renda+ não tem a receita de " + range(missing)
                    + "; registre o histórico de receita ou informe o RBT12 que o contador usou no PGDAS-D.");
        } else if (rbt12.cents() <= 0) {
            reasons.add("RBT12 zero: início de atividade não é calculado nesta versão.");
        } else if (parameters != null && rbt12.cents() > parameters.limitCents()) {
            reasons.add("RBT12 de " + brl(rbt12.cents()) + " acima do limite do Simples Nacional (" + brl(parameters.limitCents()) + ").");
        }
        if (parameters != null) {
            revenue.forEach((annex, cents) -> {
                if (cents > 0 && parameters.table(annex) == null) {
                    reasons.add("A revisão " + parameters.revision() + " dos parâmetros não tem as faixas do " + annex.label() + ".");
                }
            });
        }
        if (!reasons.isEmpty()) return new Result(false, reasons, List.of(), List.of());

        List<AnnexResult> annexes = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        BigDecimal base = BigDecimal.valueOf(rbt12.cents());
        for (Annex annex : Annex.values()) {
            Long cents = revenue.get(annex);
            TaxParameters.AnnexTable table = parameters.table(annex);
            if (cents == null || table == null) continue;
            List<TaxParameters.Bracket> list = table.brackets();
            int index = 0;
            while (list.get(index).upToCents() < rbt12.cents()) index++;
            TaxParameters.Bracket b = list.get(index);
            // Numerador em centavos: RBT12 × nominal − parcela a deduzir.
            BigDecimal numerator = base.multiply(b.rate()).subtract(BigDecimal.valueOf(b.deductionCents()));
            BigDecimal effective = numerator.divide(base, MathContext.DECIMAL128).setScale(8, RoundingMode.HALF_EVEN);
            long tax = BigDecimal.valueOf(cents).multiply(numerator).divide(base, 0, RoundingMode.HALF_EVEN).longValueExact();
            List<TaxShare> shares = List.of();
            long issExcess = 0;
            if (table.hasShares()) {
                List<BigDecimal> weights = new ArrayList<>(b.shares());
                int iss = table.taxes().indexOf(ISS);
                long[] parts;
                BigDecimal[] applied = new BigDecimal[weights.size()];
                if (iss >= 0 && effective.multiply(weights.get(iss)).compareTo(ISS_CAP) > 0) {
                    long issCents = BigDecimal.valueOf(cents).multiply(ISS_CAP).setScale(0, RoundingMode.HALF_EVEN).longValueExact();
                    issExcess = BigDecimal.valueOf(tax).multiply(weights.get(iss)).setScale(0, RoundingMode.HALF_EVEN).longValueExact() - issCents;
                    List<BigDecimal> others = new ArrayList<>(weights);
                    others.set(iss, BigDecimal.ZERO);
                    parts = allocate(tax - issCents, others);
                    parts[iss] = issCents;
                    BigDecimal issShare = ISS_CAP.divide(effective, 8, RoundingMode.HALF_EVEN);
                    BigDecimal sumOthers = others.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
                    for (int i = 0; i < weights.size(); i++) {
                        applied[i] = i == iss ? issShare : weights.get(i).multiply(BigDecimal.ONE.subtract(issShare))
                                .divide(sumOthers, 8, RoundingMode.HALF_EVEN);
                    }
                    warnings.add("ISS limitado a 5% da receita do " + annex.label() + ": a diferença de " + brl(issExcess)
                            + " foi redistribuída aos tributos federais, na proporção de cada um.");
                } else {
                    parts = allocate(tax, weights);
                    for (int i = 0; i < weights.size(); i++) applied[i] = weights.get(i);
                }
                List<TaxShare> out = new ArrayList<>();
                for (int i = 0; i < weights.size(); i++) out.add(new TaxShare(table.taxes().get(i), applied[i], parts[i]));
                shares = List.copyOf(out);
            }
            annexes.add(new AnnexResult(annex, index + 1, b.rate(), b.deductionCents(), effective, cents, tax, shares, issExcess));
            if (index + 1 >= SUBLIMIT_BRACKET && cents > 0) {
                warnings.add("6ª faixa no " + annex.label() + ": a alíquota nominal salta para " + percent(b.rate())
                        + "; acima de R$ 3.600.000,00 ICMS e ISS saem do DAS e não são calculados aqui.");
            }
        }
        return new Result(true, List.of(), annexes, warnings);
    }

    /**
     * Reparte {@code total} centavos pelos pesos: cada parte arredondada (HALF_EVEN); a diferença de centavos vai para o
     * maior peso, para as partes somarem exatamente o total.
     */
    static long[] allocate(long total, List<BigDecimal> weights) {
        BigDecimal sum = weights.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        long[] parts = new long[weights.size()];
        if (sum.signum() == 0) return parts;
        int largest = 0;
        long allocated = 0;
        for (int i = 0; i < weights.size(); i++) {
            parts[i] = BigDecimal.valueOf(total).multiply(weights.get(i)).divide(sum, 0, RoundingMode.HALF_EVEN).longValueExact();
            allocated += parts[i];
            if (weights.get(i).compareTo(weights.get(largest)) > 0) largest = i;
        }
        parts[largest] += total - allocated;
        return parts;
    }

    public static String label(YearMonth m) {
        return String.format("%02d/%d", m.getMonthValue(), m.getYear());
    }

    private static String range(List<YearMonth> missing) {
        if (missing.isEmpty()) return "meses anteriores";
        if (missing.size() == 1) return label(missing.getFirst());
        return label(missing.getFirst()) + " a " + label(missing.getLast());
    }

    /** Percentual para mensagens: 0.078 → "7,8%". */
    public static String percent(BigDecimal fraction) {
        return fraction.movePointRight(2).stripTrailingZeros().toPlainString().replace('.', ',') + "%";
    }

    public static String brl(long cents) {
        return Money.ofCents(cents, Currency.BRL).toBrl();
    }
}
