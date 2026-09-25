package br.com.fourtech.rendamais.kernel;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Quantidade decimal exata com unidade explícita (INV-QTY-1, INV-QTY-2).
 * Escala máxima {@link #MAX_SCALE} (premissa PD-007).
 */
public record Quantity(BigDecimal value, UnitOfMeasure unit) implements Comparable<Quantity> {

    public static final int MAX_SCALE = 6;

    public Quantity {
        Objects.requireNonNull(value, "quantidade obrigatória");
        Objects.requireNonNull(unit, "unidade obrigatória");
        BigDecimal normalized = value.stripTrailingZeros();
        if (normalized.scale() > MAX_SCALE) {
            throw new IllegalArgumentException("Quantidade com mais de " + MAX_SCALE + " casas decimais: " + value);
        }
        value = normalized.scale() < 0 ? normalized.setScale(0) : normalized;
    }

    public static Quantity of(String value, UnitOfMeasure unit) {
        return new Quantity(new BigDecimal(value), unit);
    }

    public Quantity plus(Quantity other) {
        requireSameUnit(other);
        return new Quantity(value.add(other.value), unit);
    }

    public Quantity minus(Quantity other) {
        requireSameUnit(other);
        return new Quantity(value.subtract(other.value), unit);
    }

    public boolean isPositive() {
        return value.signum() > 0;
    }

    /** Converte para outra unidade; o arredondamento, se necessário, é explícito. */
    public Quantity convert(UnitConversion conversion, RoundingPolicy rounding) {
        if (!conversion.from().equals(unit)) {
            throw new IllegalArgumentException("Conversão de " + conversion.from().code() + " não se aplica a " + unit.code());
        }
        BigDecimal converted = value.multiply(conversion.factor()).setScale(MAX_SCALE, rounding.mode());
        return new Quantity(converted, conversion.to());
    }

    private void requireSameUnit(Quantity other) {
        if (!other.unit.equals(unit)) {
            throw new IllegalArgumentException("Unidades diferentes sem conversão: " + unit.code() + " e " + other.unit.code());
        }
    }

    @Override
    public int compareTo(Quantity other) {
        requireSameUnit(other);
        return value.compareTo(other.value);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Quantity q && q.unit.equals(unit) && q.value.compareTo(value) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(value.stripTrailingZeros(), unit);
    }
}
