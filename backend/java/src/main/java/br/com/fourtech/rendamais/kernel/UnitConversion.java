package br.com.fourtech.rendamais.kernel;

import java.math.BigDecimal;
import java.util.Objects;

/** Conversão explícita: 1 {@code from} = {@code factor} {@code to}. */
public record UnitConversion(UnitOfMeasure from, UnitOfMeasure to, BigDecimal factor) {
    public UnitConversion {
        Objects.requireNonNull(from);
        Objects.requireNonNull(to);
        if (factor == null || factor.signum() <= 0) {
            throw new IllegalArgumentException("Fator de conversão deve ser maior que zero");
        }
    }
}
