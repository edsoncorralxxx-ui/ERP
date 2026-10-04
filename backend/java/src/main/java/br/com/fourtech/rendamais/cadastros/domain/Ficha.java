package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Campos de ficha sem regra própria (abas Geral, Pagamento, Fiscal… do mock): cada chave tem tipo, tamanho e limites,
 * e o valor validado vai para a coluna {@code profile} (jsonb) do cadastro. Chave desconhecida é recusada; valor vazio
 * some do mapa. Números decimais ficam como texto com ponto ("3.00"), dinheiro em centavos (ADR-006).
 */
public final class Ficha {

    public enum Tipo { TEXTO, EMAIL, INTEIRO, DECIMAL, CENTAVOS, BOOLEANO, DATA, OPCAO }

    /** {@code casas} só para DECIMAL; {@code opcoes} só para OPCAO; {@code formato} opcional para TEXTO. */
    public record Campo(String chave, Tipo tipo, int max, BigDecimal minimo, BigDecimal maximo, int casas, List<String> opcoes,
                        Pattern formato, String dica) {
        public static Campo texto(String chave, int max) {
            return new Campo(chave, Tipo.TEXTO, max, null, null, 0, List.of(), null, null);
        }

        public static Campo formato(String chave, int max, String regex, String dica) {
            return new Campo(chave, Tipo.TEXTO, max, null, null, 0, List.of(), Pattern.compile(regex), dica);
        }

        public static Campo email(String chave) {
            return new Campo(chave, Tipo.EMAIL, 200, null, null, 0, List.of(), null, null);
        }

        public static Campo inteiro(String chave, long min, long max) {
            return new Campo(chave, Tipo.INTEIRO, 0, BigDecimal.valueOf(min), BigDecimal.valueOf(max), 0, List.of(), null, null);
        }

        public static Campo decimal(String chave, int casas, String min, String max) {
            return new Campo(chave, Tipo.DECIMAL, 0, new BigDecimal(min), new BigDecimal(max), casas, List.of(), null, null);
        }

        public static Campo centavos(String chave) {
            return new Campo(chave, Tipo.CENTAVOS, 0, BigDecimal.ZERO, new BigDecimal("999999999999"), 0, List.of(), null, null);
        }

        public static Campo booleano(String chave) {
            return new Campo(chave, Tipo.BOOLEANO, 0, null, null, 0, List.of(), null, null);
        }

        public static Campo data(String chave) {
            return new Campo(chave, Tipo.DATA, 0, null, null, 0, List.of(), null, null);
        }

        public static Campo opcao(String chave, String... opcoes) {
            return new Campo(chave, Tipo.OPCAO, 0, null, null, 0, List.of(opcoes), null, null);
        }
    }

    private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s]+\\.[^@\\s]+");

    private final Map<String, Campo> campos = new LinkedHashMap<>();

    public Ficha(Campo... lista) {
        for (Campo c : lista) {
            if (campos.put(c.chave(), c) != null) throw new IllegalArgumentException("Campo repetido: " + c.chave());
        }
    }

    public boolean has(String chave) {
        return campos.containsKey(chave);
    }

    /**
     * Valida os dados informados; problemas vão para {@code issues} com o campo {@code prefixo.chave}. O mapa devolvido
     * segue a ordem da ficha e não tem valores vazios.
     */
    public Map<String, Object> validar(Map<String, ?> dados, String prefixo, List<FieldIssue> issues) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (dados == null) return out;
        for (String k : dados.keySet()) {
            if (!campos.containsKey(k)) issues.add(new FieldIssue(prefixo + k, "Campo desconhecido."));
        }
        for (Campo c : campos.values()) {
            Object raw = dados.get(c.chave());
            if (raw == null) continue;
            String f = prefixo + c.chave();
            Object v = switch (c.tipo()) {
                case BOOLEANO -> booleano(raw, f, issues);
                case INTEIRO -> inteiro(raw, c, f, issues);
                case DECIMAL -> decimal(raw, c, f, issues);
                case CENTAVOS -> centavos(raw, c, f, issues);
                case DATA -> data(raw, f, issues);
                case OPCAO -> opcao(raw, c, f, issues);
                case EMAIL -> email(raw, f, issues);
                case TEXTO -> texto(raw, c, f, issues);
            };
            if (v != null) out.put(c.chave(), v);
        }
        return Collections.unmodifiableMap(out);
    }

    /** Valor legível de cada campo preenchido, para o histórico (diferenças campo a campo). */
    public Map<String, String> plano(Map<String, Object> perfil) {
        Map<String, String> m = new LinkedHashMap<>();
        for (Campo c : campos.values()) {
            Object v = perfil.get(c.chave());
            m.put(c.chave(), v == null ? null : switch (c.tipo()) {
                case BOOLEANO -> Boolean.TRUE.equals(v) ? "Sim" : "Não";
                case CENTAVOS -> "R$ " + brasileiro(BigDecimal.valueOf(((Number) v).longValue(), 2));
                case DECIMAL -> brasileiro(new BigDecimal(v.toString()));
                default -> v.toString();
            });
        }
        return m;
    }

    private static String brasileiro(BigDecimal v) {
        String plain = v.toPlainString();
        int dot = plain.indexOf('.');
        String inteiro = dot < 0 ? plain : plain.substring(0, dot);
        String frac = dot < 0 ? "" : "," + plain.substring(dot + 1);
        boolean neg = inteiro.startsWith("-");
        if (neg) inteiro = inteiro.substring(1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < inteiro.length(); i++) {
            if (i > 0 && (inteiro.length() - i) % 3 == 0) sb.append('.');
            sb.append(inteiro.charAt(i));
        }
        return (neg ? "-" : "") + sb + frac;
    }

    private static String strip(Object raw) {
        String s = raw.toString().strip();
        return s.isEmpty() ? null : s;
    }

    private static Object texto(Object raw, Campo c, String f, List<FieldIssue> issues) {
        String s = strip(raw);
        if (s == null) return null;
        if (s.length() > c.max()) issues.add(new FieldIssue(f, "Máximo de " + c.max() + " caracteres."));
        else if (c.formato() != null && !c.formato().matcher(s).matches()) issues.add(new FieldIssue(f, c.dica()));
        return s;
    }

    private static Object email(Object raw, String f, List<FieldIssue> issues) {
        String s = strip(raw);
        if (s == null) return null;
        if (s.length() > 200 || !EMAIL.matcher(s).matches()) issues.add(new FieldIssue(f, "E-mail inválido."));
        return s;
    }

    private static Object booleano(Object raw, String f, List<FieldIssue> issues) {
        if (raw instanceof Boolean b) return b ? Boolean.TRUE : null;
        String s = strip(raw);
        if (s == null || "false".equalsIgnoreCase(s)) return null;
        if ("true".equalsIgnoreCase(s)) return Boolean.TRUE;
        issues.add(new FieldIssue(f, "Use verdadeiro ou falso."));
        return null;
    }

    private static Object inteiro(Object raw, Campo c, String f, List<FieldIssue> issues) {
        BigDecimal v = numero(raw, f, issues);
        if (v == null) return null;
        if (v.stripTrailingZeros().scale() > 0) {
            issues.add(new FieldIssue(f, "Informe um número inteiro."));
            return null;
        }
        if (!limites(v, c, f, issues)) return null;
        return v.longValueExact();
    }

    private static Object decimal(Object raw, Campo c, String f, List<FieldIssue> issues) {
        BigDecimal v = numero(raw, f, issues);
        if (v == null) return null;
        if (v.stripTrailingZeros().scale() > c.casas()) {
            issues.add(new FieldIssue(f, "Máximo de " + c.casas() + " casas decimais."));
            return null;
        }
        if (!limites(v, c, f, issues)) return null;
        return v.setScale(c.casas(), RoundingMode.UNNECESSARY).toPlainString();
    }

    private static Object centavos(Object raw, Campo c, String f, List<FieldIssue> issues) {
        BigDecimal v = numero(raw, f, issues);
        if (v == null) return null;
        if (v.stripTrailingZeros().scale() > 0) {
            issues.add(new FieldIssue(f, "Valor em centavos inteiros."));
            return null;
        }
        if (!limites(v, c, f, issues)) return null;
        return v.longValueExact();
    }

    private static BigDecimal numero(Object raw, String f, List<FieldIssue> issues) {
        if (raw instanceof Number n) return new BigDecimal(n.toString());
        String s = strip(raw);
        if (s == null) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(f, "Número inválido (use ponto como separador decimal)."));
            return null;
        }
    }

    private static boolean limites(BigDecimal v, Campo c, String f, List<FieldIssue> issues) {
        if (c.minimo() != null && v.compareTo(c.minimo()) < 0 || c.maximo() != null && v.compareTo(c.maximo()) > 0) {
            issues.add(new FieldIssue(f, "Valor fora do intervalo de " + c.minimo().toPlainString() + " a " + c.maximo().toPlainString() + "."));
            return false;
        }
        return true;
    }

    private static Object data(Object raw, String f, List<FieldIssue> issues) {
        String s = strip(raw);
        if (s == null) return null;
        try {
            return LocalDate.parse(s).toString();
        } catch (DateTimeParseException e) {
            issues.add(new FieldIssue(f, "Data inválida (AAAA-MM-DD)."));
            return null;
        }
    }

    private static Object opcao(Object raw, Campo c, String f, List<FieldIssue> issues) {
        String s = strip(raw);
        if (s == null) return null;
        if (!c.opcoes().contains(s)) {
            issues.add(new FieldIssue(f, "Opção inválida."));
            return null;
        }
        return s;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Ficha other && Objects.equals(campos, other.campos);
    }

    @Override
    public int hashCode() {
        return campos.hashCode();
    }
}
