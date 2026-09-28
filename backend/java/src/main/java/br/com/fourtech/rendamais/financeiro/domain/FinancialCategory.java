package br.com.fourtech.rendamais.financeiro.domain;

import java.text.Normalizer;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * Categoria financeira de receita ou despesa (PD-010). O título guarda o {@code code}, que não muda depois de criado; o
 * nome pode ser corrigido. As categorias do sistema ({@code system}) são usadas pelo próprio Renda+ (receita dos pedidos,
 * DAS) e não são inativadas.
 */
public record FinancialCategory(UUID id, String code, String name, Direction direction, Status status, boolean system, long version,
                                Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {

    public enum Direction { RECEITA, DESPESA }

    public enum Status { ATIVO, INATIVO }

    /** Categoria dos títulos a receber gerados pelos pedidos. */
    public static final String SALES_REVENUE = "RECEITA_VENDA";
    /** Categoria do título do DAS gerado pela conferência do contador. */
    public static final String SIMPLES_TAX = "IMPOSTOS_SIMPLES";

    /** Código derivado do nome: sem acentos, maiúsculo, com "_" no lugar do que não é letra ou número. */
    public static String codeFor(String name) {
        String plain = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String code = plain.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", "");
        if (code.length() > 50) code = code.substring(0, 50);
        return code.isEmpty() ? "CATEGORIA" : code;
    }
}
