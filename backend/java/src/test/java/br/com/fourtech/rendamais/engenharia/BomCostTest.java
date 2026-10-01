package br.com.fourtech.rendamais.engenharia;

import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Custo da BOM: linha arredondada nos centavos uma vez, submontagem × quantidade, pendência nunca vira zero. */
class BomCostTest {

    private static BomCost.Node item(String qty, String cost) {
        return new BomCost.Node(BomCost.Kind.ITEM, qty == null ? null : new BigDecimal(qty), cost == null ? null : new BigDecimal(cost),
                true, List.of());
    }

    private static BomCost.Node sub(String qty, BomCost.Node... lines) {
        return new BomCost.Node(BomCost.Kind.SUBASSEMBLY, qty == null ? null : new BigDecimal(qty), null, true, List.of(lines));
    }

    @Test
    void linhaArredondaMeioParaCimaUmaVez() {
        assertThat(BomCost.itemCents(new BigDecimal("0.5"), new BigDecimal("0.8"))).isEqualTo(40);
        assertThat(BomCost.itemCents(new BigDecimal("3"), new BigDecimal("0.335"))).isEqualTo(101); // 1,005 → 1,01
        assertThat(BomCost.itemCents(new BigDecimal("1.333333"), new BigDecimal("3"))).isEqualTo(400); // 3,999999 → 4,00
    }

    @Test
    void submontagemMultiplicaOTotalDelaEArredondaNoFim() {
        BomCost.Node painel = sub("2", item("1", "0.335"), item("1", "0.335")); // 0,34 + 0,34 = 0,68 × 2
        BomCost.Total t = BomCost.total(List.of(painel, item("1", "10")));
        assertThat(t.cents()).isEqualTo(136 + 1000);
        assertThat(BomCost.subassemblyCents(101, new BigDecimal("0.5"))).isEqualTo(51);
    }

    @Test
    void linhaSemQuantidadeOuSemCustoFicaPendenteENaoEntraNaSoma() {
        BomCost.Total t = BomCost.total(List.of(item(null, "9.44"), item("2", null), sub("1", item(null, "5"), item("1", "5")),
                item("1", "100")));
        assertThat(t.cents()).isEqualTo(500 + 10000);
        assertThat(t.pending()).isEqualTo(3);
        assertThat(t.complete()).isFalse();
        BomCost.Node retirada = new BomCost.Node(BomCost.Kind.ITEM, BigDecimal.ONE, new BigDecimal("50"), false, List.of());
        assertThat(BomCost.total(List.of(retirada, item("1", "1"))).cents()).isEqualTo(100);
    }
}
