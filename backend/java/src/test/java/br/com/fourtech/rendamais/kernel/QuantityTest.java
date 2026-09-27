package br.com.fourtech.rendamais.kernel;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuantityTest {

    private static final UnitOfMeasure UN = UnitOfMeasure.of("un");
    private static final UnitOfMeasure CX = UnitOfMeasure.of("CX");

    @Test
    void naoSomaUnidadesDiferentesSemConversao() {
        assertThatThrownBy(() -> Quantity.of("2", UN).plus(Quantity.of("1", CX))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void converteComFatorExplicito() {
        Quantity caixas = Quantity.of("2", CX);
        Quantity unidades = caixas.convert(new UnitConversion(CX, UN, new BigDecimal("12")), RoundingPolicy.HALF_EVEN);
        assertThat(unidades).isEqualTo(Quantity.of("24", UN));
        assertThat(unidades.plus(Quantity.of("1", UN))).isEqualTo(Quantity.of("25.000000", UN));
    }

    @Test
    void rejeitaEscalaAcimaDeSeisCasasEmVezDeTruncar() {
        assertThatThrownBy(() -> Quantity.of("1.0000001", UN)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Quantity.of("1.500000", UN).value()).isEqualByComparingTo("1.5");
    }

    @Test
    void fatorDeConversaoPrecisaSerPositivo() {
        assertThatThrownBy(() -> new UnitConversion(CX, UN, BigDecimal.ZERO)).isInstanceOf(IllegalArgumentException.class);
    }
}
