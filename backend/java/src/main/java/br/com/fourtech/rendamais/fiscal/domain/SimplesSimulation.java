package br.com.fourtech.rendamais.fiscal.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Simulação gerencial do Simples Nacional de uma competência. Para cada tipo: faixa pelo RBT12 (a receita bruta total dos
 * 12 meses anteriores), alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 e imposto = receita do
 * tipo no mês × alíquota efetiva, arredondado ao centavo (HALF_EVEN, PD-002). Sem parâmetros vigentes, com RBT12
 * desconhecido ou acima do limite do regime, o resultado é "não calculável" com o motivo — nunca um valor menor.
 */
public final class SimplesSimulation {

    /** Faixa 6 dos anexos I a V: acima do sublimite, ICMS e ISS saem do DAS (não calculado aqui). */
    private static final int SUBLIMIT_BRACKET = 6;

    /** RBT12 usado: valor e origem (CALCULADO das notas, ou INFORMADO pelo contador). */
    public record Rbt12(long cents, String origin) { }

    /** Resultado de um tipo: anexo, faixa, alíquota nominal, parcela a deduzir, alíquota efetiva, receita e imposto. */
    public record KindResult(RevenueKind kind, String annex, int bracket, BigDecimal nominalRate, long deductionCents,
                             BigDecimal effectiveRate, long revenueCents, long taxCents) { }

    public record Result(boolean calculable, List<String> reasons, List<KindResult> kinds, List<String> warnings) {
        public Long totalTaxCents() {
            return calculable ? kinds.stream().mapToLong(KindResult::taxCents).sum() : null;
        }

        public Long taxCents(RevenueKind kind) {
            return kinds.stream().filter(k -> k.kind() == kind).map(KindResult::taxCents).findFirst().orElse(null);
        }
    }

    private SimplesSimulation() { }

    /**
     * @param parameters revisão vigente na competência (nula se não houver)
     * @param rbt12 RBT12 conhecido (nulo se desconhecido)
     * @param missing meses que faltam para calcular o RBT12 (para a mensagem, quando {@code rbt12} é nulo)
     */
    public static Result simulate(YearMonth competence, TaxParameters parameters, Rbt12 rbt12, List<YearMonth> missing,
                                  long productRevenueCents, long serviceRevenueCents) {
        List<String> reasons = new ArrayList<>();
        if (parameters == null) {
            reasons.add("Sem parâmetros do Simples Nacional vigentes em " + label(competence) + ".");
        }
        if (rbt12 == null) {
            reasons.add("RBT12 desconhecido: o Renda+ não tem a receita de " + range(missing)
                    + "; informe o RBT12 que o contador usou no PGDAS-D.");
        } else if (rbt12.cents() <= 0) {
            reasons.add("RBT12 zero: início de atividade não é simulado nesta versão.");
        } else if (parameters != null && rbt12.cents() > parameters.limitCents()) {
            reasons.add("RBT12 de " + brl(rbt12.cents()) + " acima do limite do Simples Nacional (" + brl(parameters.limitCents()) + ").");
        }
        if (!reasons.isEmpty()) return new Result(false, reasons, List.of(), List.of());

        List<KindResult> kinds = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        BigDecimal base = BigDecimal.valueOf(rbt12.cents());
        for (RevenueKind kind : RevenueKind.values()) {
            List<TaxParameters.Bracket> list = parameters.brackets().get(kind);
            int index = 0;
            while (list.get(index).upToCents() < rbt12.cents()) index++;
            TaxParameters.Bracket b = list.get(index);
            // Numerador em centavos: RBT12 × nominal − parcela a deduzir.
            BigDecimal numerator = base.multiply(b.rate()).subtract(BigDecimal.valueOf(b.deductionCents()));
            BigDecimal effective = numerator.divide(base, MathContext.DECIMAL128).setScale(8, RoundingMode.HALF_EVEN);
            long revenue = kind == RevenueKind.SERVICO ? serviceRevenueCents : productRevenueCents;
            long tax = BigDecimal.valueOf(revenue).multiply(numerator).divide(base, 0, RoundingMode.HALF_EVEN).longValueExact();
            kinds.add(new KindResult(kind, parameters.annex(kind), index + 1, b.rate(), b.deductionCents(), effective, revenue, tax));
            if (index + 1 >= SUBLIMIT_BRACKET) {
                warnings.add(kind == RevenueKind.PRODUTO
                        ? "6ª faixa em produto: a alíquota nominal salta para " + percent(b.rate()) + "; acima de R$ 3.600.000,00 o ICMS sai do DAS e não é calculado aqui."
                        : "6ª faixa em serviço: a alíquota nominal salta para " + percent(b.rate()) + "; acima de R$ 3.600.000,00 o ISS sai do DAS e não é calculado aqui.");
            }
        }
        return new Result(true, List.of(), kinds, warnings);
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

    private static String brl(long cents) {
        return Money.ofCents(cents, Currency.BRL).toBrl();
    }
}
