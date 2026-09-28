package br.com.fourtech.rendamais.fiscal;

import br.com.fourtech.rendamais.fiscal.domain.RevenueKind;
import br.com.fourtech.rendamais.fiscal.domain.SimplesSimulation;
import br.com.fourtech.rendamais.fiscal.domain.TaxParameters;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Cálculo da simulação com as tabelas da revisão 1 (Anexo II para produto, Anexo III para serviço, planilha FOURTECH). */
class SimplesSimulationTest {

    private static final YearMonth SET = YearMonth.of(2026, 9);

    static TaxParameters revisao1() {
        return new TaxParameters(UUID.randomUUID(), 1, TaxParameters.SIMPLES_NACIONAL, SET, "II", "III", Map.of(
                RevenueKind.PRODUTO, List.of(b(18_000_000, "0.045", 0), b(36_000_000, "0.078", 594_000), b(72_000_000, "0.100", 1_386_000),
                        b(180_000_000, "0.112", 2_250_000), b(360_000_000, "0.147", 8_550_000), b(480_000_000, "0.300", 72_000_000)),
                RevenueKind.SERVICO, List.of(b(18_000_000, "0.060", 0), b(36_000_000, "0.112", 936_000), b(72_000_000, "0.135", 1_764_000),
                        b(180_000_000, "0.160", 3_564_000), b(360_000_000, "0.210", 12_564_000), b(480_000_000, "0.330", 64_800_000))),
                "Planilha FOURTECH", null, Instant.now(), "teste");
    }

    private static TaxParameters.Bracket b(long upTo, String rate, long deduction) {
        return new TaxParameters.Bracket(upTo, new BigDecimal(rate), deduction);
    }

    @Test
    void exemploDoPlanningDaSimulacaoDe1325e32() {
        // RBT12 de R$ 300.000,00 (2ª faixa): 5,82% no produto e 8,08% no serviço.
        var r = SimplesSimulation.simulate(SET, revisao1(), new SimplesSimulation.Rbt12(30_000_000, "INFORMADO"), List.of(),
                1_286_174, 713_826);
        assertThat(r.calculable()).isTrue();
        assertThat(r.kinds()).extracting(SimplesSimulation.KindResult::bracket).containsExactly(2, 2);
        assertThat(r.kinds().get(0).effectiveRate()).isEqualByComparingTo("0.0582");
        assertThat(r.kinds().get(1).effectiveRate()).isEqualByComparingTo("0.0808");
        assertThat(r.taxCents(RevenueKind.PRODUTO)).isEqualTo(74_855);
        assertThat(r.taxCents(RevenueKind.SERVICO)).isEqualTo(57_677);
        assertThat(r.totalTaxCents()).isEqualTo(132_532);
        assertThat(r.warnings()).isEmpty();
    }

    @Test
    void limitesDasFaixasEAlertaDaSextaFaixa() {
        // R$ 180.000,00 ainda é a 1ª faixa (alíquota nominal); R$ 180.000,01 já é a 2ª.
        var f1 = SimplesSimulation.simulate(SET, revisao1(), new SimplesSimulation.Rbt12(18_000_000, "CALCULADO"), List.of(), 100_000, 0);
        assertThat(f1.kinds().get(0).bracket()).isEqualTo(1);
        assertThat(f1.taxCents(RevenueKind.PRODUTO)).isEqualTo(4_500);
        var f2 = SimplesSimulation.simulate(SET, revisao1(), new SimplesSimulation.Rbt12(18_000_001, "CALCULADO"), List.of(), 100_000, 0);
        assertThat(f2.kinds().get(0).bracket()).isEqualTo(2);
        // 6ª faixa: salto para 30% e 33%, com o aviso de ICMS/ISS fora do DAS.
        var f6 = SimplesSimulation.simulate(SET, revisao1(), new SimplesSimulation.Rbt12(400_000_000, "INFORMADO"), List.of(), 100_000, 100_000);
        assertThat(f6.kinds()).extracting(SimplesSimulation.KindResult::bracket).containsExactly(6, 6);
        // (4.000.000 × 30% − 720.000) ÷ 4.000.000 = 12%; (4.000.000 × 33% − 648.000) ÷ 4.000.000 = 16,8%.
        assertThat(f6.taxCents(RevenueKind.PRODUTO)).isEqualTo(12_000);
        assertThat(f6.taxCents(RevenueKind.SERVICO)).isEqualTo(16_800);
        assertThat(f6.warnings()).hasSize(2).first().asString().contains("6ª faixa", "30%", "ICMS");
    }

    @Test
    void naoCalculavelSemParametroSemRbt12OuAcimaDoLimite() {
        var semNada = SimplesSimulation.simulate(SET, null, null, List.of(YearMonth.of(2025, 9), YearMonth.of(2026, 8)), 100, 0);
        assertThat(semNada.calculable()).isFalse();
        assertThat(semNada.totalTaxCents()).isNull();
        assertThat(semNada.reasons()).hasSize(2);
        assertThat(String.join(" ", semNada.reasons())).contains("Sem parâmetros", "09/2025 a 08/2026", "PGDAS-D");
        var acima = SimplesSimulation.simulate(SET, revisao1(), new SimplesSimulation.Rbt12(480_000_001, "INFORMADO"), List.of(), 100, 0);
        assertThat(acima.calculable()).isFalse();
        assertThat(acima.reasons().getFirst()).contains("R$ 4.800.000,01", "limite", "R$ 4.800.000,00");
    }
}
