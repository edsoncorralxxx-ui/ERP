package br.com.fourtech.rendamais.kernel;

import java.util.Locale;
import java.util.Objects;

/**
 * CNPJ normalizado (14 caracteres, sem máscara), com validação dos dígitos verificadores.
 * Aceita o formato numérico e o alfanumérico (letras A–Z nas 12 primeiras posições; dígitos
 * verificadores numéricos), em que cada caractere vale o seu código ASCII menos 48.
 */
public record Cnpj(String value) {

    private static final int[] PESOS_1 = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
    private static final int[] PESOS_2 = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

    public Cnpj {
        Objects.requireNonNull(value, "CNPJ obrigatório");
        value = normalize(value);
        if (!value.matches("[0-9A-Z]{12}[0-9]{2}")) {
            throw new IllegalArgumentException("CNPJ deve ter 14 caracteres (12 alfanuméricos e 2 dígitos)");
        }
        if (value.chars().distinct().count() == 1) {
            throw new IllegalArgumentException("CNPJ inválido");
        }
        int dv1 = digit(value.substring(0, 12), PESOS_1);
        int dv2 = digit(value.substring(0, 12) + dv1, PESOS_2);
        if (value.charAt(12) - '0' != dv1 || value.charAt(13) - '0' != dv2) {
            throw new IllegalArgumentException("Dígitos verificadores do CNPJ não conferem");
        }
    }

    public static Cnpj of(String raw) {
        return new Cnpj(raw);
    }

    public static String normalize(String raw) {
        return raw.replaceAll("[.\\-/\\s]", "").toUpperCase(Locale.ROOT);
    }

    /** Formato de exibição 00.000.000/0000-00. */
    public String formatted() {
        return value.substring(0, 2) + "." + value.substring(2, 5) + "." + value.substring(5, 8) + "/"
                + value.substring(8, 12) + "-" + value.substring(12);
    }

    private static int digit(String base, int[] pesos) {
        int soma = 0;
        for (int i = 0; i < base.length(); i++) {
            soma += (base.charAt(i) - 48) * pesos[i];
        }
        int resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    }
}
