package br.com.fourtech.rendamais.kernel;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CnpjTest {

    @Test
    void aceitaCnpjNumericoComOuSemMascara() {
        assertThat(Cnpj.of("11.222.333/0001-81").value()).isEqualTo("11222333000181");
        assertThat(Cnpj.of("11222333000181").formatted()).isEqualTo("11.222.333/0001-81");
    }

    @Test
    void aceitaCnpjAlfanumerico() {
        assertThat(Cnpj.of("12.abc.345/01de-35").value()).isEqualTo("12ABC34501DE35");
    }

    @ParameterizedTest
    @ValueSource(strings = {"11.222.333/0001-82", "11111111111111", "1122233300018", "12ABC34501DE36", "1A.222.333/0001-8X"})
    void rejeitaInvalidos(String raw) {
        assertThatThrownBy(() -> Cnpj.of(raw)).isInstanceOf(IllegalArgumentException.class);
    }
}
