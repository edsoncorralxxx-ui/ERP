package br.com.fourtech.rendamais.kernel;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.IntStream;

/**
 * Valor monetário em centavos inteiros com moeda explícita. Imutável; nunca usa ponto flutuante.
 * Invariantes INV-MON-1 a INV-MON-4 (docs/backend/12-b01-modelo-de-dominio.md).
 */
public final class Money implements Comparable<Money> {

    private final long cents;
    private final Currency currency;

    private Money(long cents, Currency currency) {
        this.cents = cents;
        this.currency = Objects.requireNonNull(currency, "moeda obrigatória");
    }

    public static Money ofCents(long cents, Currency currency) {
        return new Money(cents, currency);
    }

    public static Money zero(Currency currency) {
        return new Money(0, currency);
    }

    /** Converte a representação da API (string de inteiro em centavos, ex.: "5550000"). */
    public static Money parseCents(String amountCents, Currency currency) {
        if (amountCents == null || !amountCents.matches("-?\\d{1,18}")) {
            throw new IllegalArgumentException("Valor em centavos inválido: " + amountCents);
        }
        return new Money(Long.parseLong(amountCents), currency);
    }

    /** Converte um valor decimal em reais, exigindo no máximo duas casas (sem arredondar silenciosamente). */
    public static Money ofDecimal(BigDecimal amount, Currency currency) {
        if (amount.stripTrailingZeros().scale() > 2) {
            throw new IllegalArgumentException("Valor com mais de duas casas decimais: " + amount);
        }
        return new Money(amount.movePointRight(2).longValueExact(), currency);
    }

    public long cents() {
        return cents;
    }

    public Currency currency() {
        return currency;
    }

    public String centsAsString() {
        return Long.toString(cents);
    }

    public BigDecimal toDecimal() {
        return BigDecimal.valueOf(cents, 2);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(cents, other.cents), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(cents, other.cents), currency);
    }

    public Money negate() {
        return new Money(Math.negateExact(cents), currency);
    }

    public boolean isZero() {
        return cents == 0;
    }

    public boolean isNegative() {
        return cents < 0;
    }

    /** Multiplica por um fator decimal exato e arredonda uma única vez pela política informada. */
    public Money times(BigDecimal factor, RoundingPolicy rounding) {
        Objects.requireNonNull(rounding, "política de arredondamento obrigatória");
        BigDecimal result = BigDecimal.valueOf(cents).multiply(factor).setScale(0, rounding.mode());
        return new Money(result.longValueExact(), currency);
    }

    /** Divide em {@code parts} partes iguais; a soma é exatamente este valor. */
    public List<Money> split(int parts, AllocationPolicy policy) {
        if (parts <= 0) {
            throw new IllegalArgumentException("Número de partes deve ser maior que zero");
        }
        return allocate(IntStream.range(0, parts).mapToObj(i -> BigDecimal.ONE).toList(), policy);
    }

    /**
     * Divide proporcionalmente aos pesos (não negativos, soma maior que zero).
     * Cada parte recebe a sua fração truncada; os centavos restantes são distribuídos pela política,
     * de forma que a soma é sempre exatamente este valor (INV-MON-2).
     */
    public List<Money> allocate(List<BigDecimal> weights, AllocationPolicy policy) {
        Objects.requireNonNull(policy, "política de alocação obrigatória");
        if (weights.isEmpty()) {
            throw new IllegalArgumentException("Informe ao menos um peso");
        }
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (BigDecimal w : weights) {
            if (w.signum() < 0) {
                throw new IllegalArgumentException("Peso negativo não é permitido");
            }
            totalWeight = totalWeight.add(w);
        }
        if (totalWeight.signum() == 0) {
            throw new IllegalArgumentException("A soma dos pesos deve ser maior que zero");
        }

        int sign = Long.signum(cents);
        BigInteger magnitude = BigInteger.valueOf(cents).abs();
        int n = weights.size();
        long[] base = new long[n];
        BigDecimal[] remainders = new BigDecimal[n];
        long assigned = 0;
        for (int i = 0; i < n; i++) {
            BigDecimal exact = new BigDecimal(magnitude).multiply(weights.get(i));
            BigDecimal[] qr = exact.divideAndRemainder(totalWeight);
            base[i] = qr[0].longValueExact();
            remainders[i] = qr[1];
            assigned += base[i];
        }
        long residual = magnitude.longValueExact() - assigned;

        List<Integer> order = new ArrayList<>(IntStream.range(0, n).boxed().toList());
        switch (policy) {
            case RESIDUAL_FROM_FIRST -> { }
            case RESIDUAL_FROM_LAST -> order.sort(Comparator.reverseOrder());
            case LARGEST_REMAINDER -> order.sort(Comparator.comparing((Integer i) -> remainders[i]).reversed()
                    .thenComparing(Comparator.naturalOrder()));
        }
        for (int k = 0; k < residual; k++) {
            base[order.get(k % n)]++;
        }

        List<Money> result = new ArrayList<>(n);
        for (long part : base) {
            result.add(new Money(sign * part, currency));
        }
        return List.copyOf(result);
    }

    private void requireSameCurrency(Money other) {
        if (other.currency != currency) {
            throw new IllegalArgumentException("Moedas diferentes: " + currency + " e " + other.currency);
        }
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(cents, other.cents);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Money m && m.cents == cents && m.currency == currency;
    }

    @Override
    public int hashCode() {
        return Objects.hash(cents, currency);
    }

    @Override
    public String toString() {
        return currency + " " + toDecimal().setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }
}
