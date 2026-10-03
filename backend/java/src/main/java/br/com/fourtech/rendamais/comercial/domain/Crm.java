package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Regras comuns do CRM (Sprint 11): textos, datas, enumerações, próxima ação e valor ponderado. */
public final class Crm {

    /** Origem da prospecção ou da oportunidade (campo "origem" do SAP B1). */
    public enum Source { INDICACAO, FEIRA, SITE, LISTA, PROSPECCAO_ATIVA, CLIENTE_ATUAL, OUTRO }

    /** Próxima ação: data e o que fazer. As duas juntas ou nenhuma. */
    public record NextAction(LocalDate date, String note) {
        public static final NextAction NONE = new NextAction(null, null);

        public boolean isSet() {
            return date != null;
        }
    }

    static final Set<String> UFS = Set.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
            "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO");

    private Crm() { }

    static String text(String raw, String field, int max, String required, List<FieldIssue> issues) {
        String t = SalesLine.text(raw);
        if (t == null) {
            if (required != null) issues.add(new FieldIssue(field, required));
            return null;
        }
        if (t.length() > max) {
            issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
            return null;
        }
        return t;
    }

    static LocalDate date(String raw, String field, String required, List<FieldIssue> issues) {
        return Proposal.date(raw, field, required, issues);
    }

    static <E extends Enum<E>> E choice(Class<E> type, String raw, String field, E fallback, String required,
                                        List<FieldIssue> issues) {
        String t = SalesLine.text(raw);
        if (t == null) {
            if (fallback == null && required != null) issues.add(new FieldIssue(field, required));
            return fallback;
        }
        try {
            return Enum.valueOf(type, t.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Opção inválida."));
            return fallback;
        }
    }

    static String state(String raw, List<FieldIssue> issues) {
        String t = SalesLine.text(raw);
        if (t == null) return null;
        String uf = t.toUpperCase(Locale.ROOT);
        if (!UFS.contains(uf)) {
            issues.add(new FieldIssue("state", "UF inválida."));
            return null;
        }
        return uf;
    }

    /**
     * Próxima ação informada: data e descrição juntas. {@code required} exige as duas (oportunidade aberta, decisão do PO
     * em 03/10/2026); {@code today} recusa data já vencida em quem acabou de ser registrado.
     */
    static NextAction nextAction(String rawDate, String rawNote, boolean required, LocalDate today, List<FieldIssue> issues) {
        LocalDate d = date(rawDate, "nextActionDate", required ? "Informe a data da próxima ação." : null, issues);
        String note = text(rawNote, "nextActionNote", 300, required || d != null ? "Descreva a próxima ação." : null, issues);
        if (d == null && note != null && !required) {
            issues.add(new FieldIssue("nextActionDate", "Informe a data da próxima ação."));
            return NextAction.NONE;
        }
        if (d != null && today != null && d.isBefore(today)) {
            issues.add(new FieldIssue("nextActionDate", "A próxima ação não pode ser antes de hoje."));
            return NextAction.NONE;
        }
        return d == null || note == null ? NextAction.NONE : new NextAction(d, note);
    }

    /** Valor ponderado do SAP B1: potencial × percentual de fechamento, arredondado nos centavos uma vez (meio para cima). */
    public static long weighted(long potentialCents, BigDecimal closePercent) {
        return BigDecimal.valueOf(potentialCents).multiply(closePercent)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
    }

    /** Nome para comparar duplicidades: sem acentos, maiúsculas, pontuação, espaços repetidos e sufixos societários. */
    public static String comparableName(String name) {
        if (name == null) return "";
        String n = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9 ]", " ");
        n = " " + n.replaceAll("\\s+", " ").strip() + " ";
        String before;
        do {
            before = n;
            n = n.replaceAll(" (LTDA|ME|EPP|EIRELI|S A|SA|CIA|INDUSTRIA|IND|COMERCIO|COM|E|DE|DA|DO) ", " ");
        } while (!n.equals(before));
        return n.strip();
    }
}
