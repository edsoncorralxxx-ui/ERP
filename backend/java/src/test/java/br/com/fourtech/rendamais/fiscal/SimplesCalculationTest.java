package br.com.fourtech.rendamais.fiscal;

import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.fiscal.domain.SimplesCalculation;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Cálculo do DAS por anexo e por tributo com as tabelas da revisão 2 (LC 123/2006, mock da Sprint 12). */
class SimplesCalculationTest {

    private static final YearMonth SET = YearMonth.of(2026, 9);
    private static final long[] LIMITES = {18_000_000, 36_000_000, 72_000_000, 180_000_000, 360_000_000, 480_000_000};

    /** Revisão 2 como semeada pela V18: anexos I, II e III com a repartição. */
    static TaxParameters revisao2() {
        Map<Annex, TaxParameters.AnnexTable> a = new EnumMap<>(Annex.class);
        a.put(Annex.I, tabela(List.of("IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "ICMS"),
                new String[]{"0.04", "0.073", "0.095", "0.107", "0.143", "0.19"}, new long[]{0, 594_000, 1_386_000, 2_250_000, 8_730_000, 37_800_000},
                new String[][]{{"0.055", "0.035", "0.1274", "0.0276", "0.415", "0.34"}, {"0.055", "0.035", "0.1274", "0.0276", "0.415", "0.34"},
                        {"0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"}, {"0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"},
                        {"0.055", "0.035", "0.1274", "0.0276", "0.42", "0.335"}, {"0.135", "0.1", "0.2827", "0.0613", "0.421", "0"}}));
        String[] ii = {"0.055", "0.035", "0.1151", "0.0249", "0.375", "0.075", "0.32"};
        a.put(Annex.II, tabela(List.of("IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "IPI", "ICMS"),
                new String[]{"0.045", "0.078", "0.1", "0.112", "0.147", "0.3"}, new long[]{0, 594_000, 1_386_000, 2_250_000, 8_550_000, 72_000_000},
                new String[][]{ii, ii, ii, ii, ii, {"0.085", "0.075", "0.2096", "0.0454", "0.235", "0.35", "0"}}));
        a.put(Annex.III, tabela(List.of("IRPJ", "CSLL", "COFINS", "PIS/Pasep", "CPP", "ISS"),
                new String[]{"0.06", "0.112", "0.135", "0.16", "0.21", "0.33"}, new long[]{0, 936_000, 1_764_000, 3_564_000, 12_564_000, 64_800_000},
                new String[][]{{"0.04", "0.035", "0.1282", "0.0278", "0.434", "0.335"}, {"0.04", "0.035", "0.1405", "0.0305", "0.434", "0.32"},
                        {"0.04", "0.035", "0.1364", "0.0296", "0.434", "0.325"}, {"0.04", "0.035", "0.1364", "0.0296", "0.434", "0.325"},
                        {"0.04", "0.035", "0.1282", "0.0278", "0.434", "0.335"}, {"0.35", "0.15", "0.1603", "0.0347", "0.305", "0"}}));
        return new TaxParameters(UUID.randomUUID(), 2, TaxParameters.SIMPLES_NACIONAL, SET, a, "LC 123/2006", null, Instant.now(), "teste");
    }

    private static TaxParameters.AnnexTable tabela(List<String> tributos, String[] aliquotas, long[] deducoes, String[][] reparticao) {
        List<TaxParameters.Bracket> faixas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            faixas.add(new TaxParameters.Bracket(LIMITES[i], new BigDecimal(aliquotas[i]), deducoes[i],
                    java.util.Arrays.stream(reparticao[i]).map(BigDecimal::new).toList()));
        }
        return new TaxParameters.AnnexTable(tributos, faixas);
    }

    private static Map<Annex, Long> receita(long i, long ii, long iii) {
        Map<Annex, Long> m = new EnumMap<>(Annex.class);
        m.put(Annex.I, i);
        m.put(Annex.II, ii);
        m.put(Annex.III, iii);
        return m;
    }

    private static long tributo(SimplesCalculation.AnnexResult a, String t) {
        return a.taxes().stream().filter(x -> x.tax().equals(t)).findFirst().orElseThrow().cents();
    }

    @Test
    void exemploDoPlanningDe09de2026DaR$52415e79() {
        var r = SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(334_000_000, "CALCULADO"), List.of(),
                receita(1_184_000, 26_550_000, 10_906_000));
        assertThat(r.calculable()).isTrue();
        var i = r.of(Annex.I);
        var ii = r.of(Annex.II);
        var iii = r.of(Annex.III);
        assertThat(i.bracket()).isEqualTo(5);
        assertThat(i.effectiveRate()).isEqualByComparingTo("0.11686228");
        assertThat(i.taxCents()).isEqualTo(138_365);
        assertThat(ii.effectiveRate()).isEqualByComparingTo("0.12140120");
        assertThat(ii.taxCents()).isEqualTo(3_223_202);
        assertThat(iii.effectiveRate()).isEqualByComparingTo("0.17238323");
        assertThat(iii.taxCents()).isEqualTo(1_880_012);
        assertThat(r.totalTaxCents()).isEqualTo(5_241_579);
        assertThat(r.revenueCents()).isEqualTo(38_640_000);

        // ISS limitado a 5% de R$ 109.060,00; excesso de R$ 845,04 nos tributos federais.
        assertThat(tributo(iii, "ISS")).isEqualTo(545_300);
        assertThat(iii.issExcessCents()).isEqualTo(84_504);
        assertThat(tributo(iii, "IRPJ")).isEqualTo(80_283);
        assertThat(tributo(iii, "CPP")).isEqualTo(871_076);
        assertThat(r.warnings()).anyMatch(w -> w.contains("ISS limitado") && w.contains("R$ 845,04"));
        // Centavo do arredondamento na CPP: no Anexo II a soma dava R$ 0,01 a mais.
        assertThat(tributo(ii, "CPP")).isEqualTo(1_208_700);
        for (var a : r.annexes()) {
            assertThat(a.taxes().stream().mapToLong(SimplesCalculation.TaxShare::cents).sum()).isEqualTo(a.taxCents());
        }
        assertThat(r.taxes()).containsEntry("IRPJ", 265_169L).containsEntry("CSLL", 187_903L).containsEntry("COFINS", 645_927L)
                .containsEntry("PIS/Pasep", 139_874L).containsEntry("CPP", 2_137_889L).containsEntry("IPI", 241_740L)
                .containsEntry("ICMS", 1_077_777L).containsEntry("ISS", 545_300L);
    }

    @Test
    void agostoDe2026DaR$47866e71() {
        var r = SimplesCalculation.calculate(YearMonth.of(2026, 8), revisao2(), new SimplesCalculation.Rbt12(330_000_000, "CALCULADO"),
                List.of(), receita(1_260_000, 26_220_000, 8_520_000));
        assertThat(r.totalTaxCents()).isEqualTo(4_786_671);
        assertThat(tributo(r.of(Annex.III), "ISS")).isEqualTo(426_000);
    }

    @Test
    void primeiraFaixaUsaANominalESemTetoDeIss() {
        var r = SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(18_000_000, "INFORMADO"), List.of(),
                receita(0, 1_000_000, 1_000_000));
        assertThat(r.of(Annex.II).bracket()).isEqualTo(1);
        assertThat(r.of(Annex.II).taxCents()).isEqualTo(45_000);
        assertThat(r.of(Annex.III).taxCents()).isEqualTo(60_000);
        assertThat(r.of(Annex.III).issExcessCents()).isZero();
        assertThat(tributo(r.of(Annex.III), "ISS")).isEqualTo(20_100);
        assertThat(r.of(Annex.I).taxCents()).isZero();
        // Um centavo acima do limite da 1ª faixa já é a 2ª.
        var r2 = SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(18_000_001, "INFORMADO"), List.of(),
                receita(0, 1_000_000, 0));
        assertThat(r2.of(Annex.II).bracket()).isEqualTo(2);
    }

    @Test
    void sextaFaixaAvisaETiraIcmsEIssDoDas() {
        var r = SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(400_000_000, "INFORMADO"), List.of(),
                receita(0, 1_000_000, 1_000_000));
        assertThat(r.of(Annex.II).bracket()).isEqualTo(6);
        assertThat(tributo(r.of(Annex.II), "ICMS")).isZero();
        assertThat(tributo(r.of(Annex.III), "ISS")).isZero();
        assertThat(r.warnings()).anyMatch(w -> w.startsWith("6ª faixa no Anexo II"));
    }

    @Test
    void naoCalculavelSemParametrosRbt12OuAcimaDoLimite() {
        var semRbt = SimplesCalculation.calculate(SET, revisao2(), null, List.of(YearMonth.of(2025, 9), YearMonth.of(2026, 8)),
                receita(0, 100, 0));
        assertThat(semRbt.calculable()).isFalse();
        assertThat(semRbt.totalTaxCents()).isNull();
        assertThat(semRbt.reasons()).anyMatch(m -> m.contains("09/2025 a 08/2026"));
        assertThat(SimplesCalculation.calculate(SET, null, new SimplesCalculation.Rbt12(1, "INFORMADO"), List.of(), receita(0, 1, 0))
                .reasons()).anyMatch(m -> m.contains("Sem parâmetros"));
        assertThat(SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(480_000_001, "INFORMADO"), List.of(),
                receita(0, 1, 0)).reasons()).anyMatch(m -> m.contains("acima do limite"));
        Map<Annex, Long> comIv = receita(0, 1, 0);
        comIv.put(Annex.IV, 100L);
        assertThat(SimplesCalculation.calculate(SET, revisao2(), new SimplesCalculation.Rbt12(100, "INFORMADO"), List.of(), comIv)
                .reasons()).anyMatch(m -> m.contains("Anexo IV"));
    }
}
