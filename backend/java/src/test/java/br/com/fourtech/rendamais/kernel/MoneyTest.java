package br.com.fourtech.rendamais.kernel;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {

    private static Money brl(long cents) {
        return Money.ofCents(cents, Currency.BRL);
    }

    private static List<Long> cents(List<Money> parts) {
        return parts.stream().map(Money::cents).toList();
    }

    @Test
    void cemReaisEmTresParcelasColocaOCentavoNaPrimeira() {
        assertThat(cents(brl(10_000).split(3, AllocationPolicy.RESIDUAL_FROM_FIRST))).containsExactly(3_334L, 3_333L, 3_333L);
    }

    @Test
    void cemReaisEmTresParcelasComResiduoNaUltima() {
        assertThat(cents(brl(10_000).split(3, AllocationPolicy.RESIDUAL_FROM_LAST))).containsExactly(3_333L, 3_333L, 3_334L);
    }

    @Test
    void parcelas30_40_30DoExemploDoB01() {
        List<Money> p = brl(18_500_000).allocate(List.of(new BigDecimal("0.3"), new BigDecimal("0.4"), new BigDecimal("0.3")),
                AllocationPolicy.PREMISSA_VIGENTE);
        assertThat(cents(p)).containsExactly(5_550_000L, 7_400_000L, 5_550_000L);
    }

    @Test
    void milReaisEUmCentavoEmDuasMetades() {
        assertThat(cents(brl(100_001).split(2, AllocationPolicy.PREMISSA_VIGENTE))).containsExactly(50_001L, 50_000L);
    }

    @Test
    void valoresNegativosSaoDivididosSimetricamente() {
        assertThat(cents(brl(-10_000).split(3, AllocationPolicy.RESIDUAL_FROM_FIRST))).containsExactly(-3_334L, -3_333L, -3_333L);
    }

    @Test
    void maiorRestoRecebeOCentavo() {
        List<Money> p = brl(100).allocate(List.of(new BigDecimal("1"), new BigDecimal("2")), AllocationPolicy.LARGEST_REMAINDER);
        assertThat(cents(p)).containsExactly(33L, 67L);
    }

    @Test
    void multiplicacaoArredondaUmaVezPelaPolitica() {
        // 30% de R$ 100,01 = 3000,3 centavos → R$ 30,00
        assertThat(brl(10_001).times(new BigDecimal("0.3"), RoundingPolicy.HALF_EVEN).cents()).isEqualTo(3_000L);
        // 2,5 centavos: meio-par vai para o par (2), meio-acima vai para 3
        assertThat(brl(5).times(new BigDecimal("0.5"), RoundingPolicy.HALF_EVEN).cents()).isEqualTo(2L);
        assertThat(brl(5).times(new BigDecimal("0.5"), RoundingPolicy.HALF_UP).cents()).isEqualTo(3L);
    }

    @Test
    void naoSomaMoedasDiferentesNemAceitaMaisDeDuasCasas() {
        assertThatThrownBy(() -> Money.ofDecimal(new BigDecimal("1.005"), Currency.BRL)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Money.ofDecimal(new BigDecimal("55500.00"), Currency.BRL).cents()).isEqualTo(5_550_000L);
    }

    @Test
    void overflowNaoPassaSilenciosamente() {
        assertThatThrownBy(() -> brl(Long.MAX_VALUE).plus(brl(1))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void contratoDaApiEmCentavosComoTexto() {
        assertThat(Money.parseCents("5550000", Currency.BRL)).isEqualTo(brl(5_550_000));
        assertThat(brl(5_550_000).centsAsString()).isEqualTo("5550000");
        assertThat(brl(5_550_000).toString()).isEqualTo("BRL 55500.00");
        assertThatThrownBy(() -> Money.parseCents("55.500,00", Currency.BRL)).isInstanceOf(IllegalArgumentException.class);
    }

    /** Propriedade INV-MON-2: para qualquer total, pesos e política, a soma das partes é exatamente o total. */
    @Test
    void propriedadeSomaDasPartesSempreIgualAoTotal() {
        Random random = new Random(20260925L);
        for (int caso = 0; caso < 20_000; caso++) {
            long total = random.nextLong(-1_000_000_000_000L, 1_000_000_000_000L);
            int n = 1 + random.nextInt(24);
            List<BigDecimal> weights = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                weights.add(BigDecimal.valueOf(random.nextInt(1_000_000), random.nextInt(7)));
            }
            if (weights.stream().allMatch(w -> w.signum() == 0)) {
                weights.set(0, BigDecimal.ONE);
            }
            AllocationPolicy policy = AllocationPolicy.values()[random.nextInt(AllocationPolicy.values().length)];
            List<Money> parts = brl(total).allocate(weights, policy);

            assertThat(parts).hasSize(n);
            assertThat(parts.stream().mapToLong(Money::cents).sum()).as("caso %d", caso).isEqualTo(total);
            BigDecimal sumW = weights.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            for (int i = 0; i < n; i++) {
                BigDecimal exact = BigDecimal.valueOf(total).multiply(weights.get(i)).divide(sumW, 10, java.math.RoundingMode.HALF_EVEN);
                assertThat(BigDecimal.valueOf(parts.get(i).cents()).subtract(exact).abs())
                        .as("parte %d fica a menos de 1 centavo da fração exata", i)
                        .isLessThan(BigDecimal.ONE);
            }
        }
    }

    @Test
    void divisaoEDeterministica() {
        assertThat(brl(123_457).split(7, AllocationPolicy.LARGEST_REMAINDER))
                .isEqualTo(brl(123_457).split(7, AllocationPolicy.LARGEST_REMAINDER));
    }
}
