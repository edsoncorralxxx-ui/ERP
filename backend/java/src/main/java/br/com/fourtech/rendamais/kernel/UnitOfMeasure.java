package br.com.fourtech.rendamais.kernel;

import java.util.Locale;
import java.util.Objects;

/** Código de unidade de medida (ex.: UN, KG, M, H). */
public record UnitOfMeasure(String code) {
    public UnitOfMeasure {
        Objects.requireNonNull(code, "unidade obrigatória");
        code = code.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9]{1,10}")) {
            throw new IllegalArgumentException("Unidade de medida inválida: " + code);
        }
    }

    public static UnitOfMeasure of(String code) {
        return new UnitOfMeasure(code);
    }
}
