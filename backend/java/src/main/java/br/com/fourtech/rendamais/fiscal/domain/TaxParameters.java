package br.com.fourtech.rendamais.fiscal.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Revisão dos parâmetros do Simples Nacional (PD-013): regime, anexo e faixas por tipo, com vigência a partir de uma
 * competência. Revisão gravada não muda: a mudança é uma nova revisão, e as simulações antigas guardam a que usaram.
 */
public record TaxParameters(UUID id, int revision, String regime, YearMonth validFrom, String productAnnex, String serviceAnnex,
                            Map<RevenueKind, List<Bracket>> brackets, String source, String notes, Instant createdAt, String createdBy) {

    public static final String SIMPLES_NACIONAL = "SIMPLES_NACIONAL";

    /** Faixa: RBT12 até {@code upToCents}, alíquota nominal (fração, ex.: 0.078) e parcela a deduzir. */
    public record Bracket(long upToCents, BigDecimal rate, long deductionCents) { }

    public TaxParameters {
        brackets = new EnumMap<>(brackets);
    }

    public String annex(RevenueKind kind) {
        return kind == RevenueKind.SERVICO ? serviceAnnex : productAnnex;
    }

    /** Maior RBT12 coberto pelas faixas (o limite do regime), o menor entre os tipos. */
    public long limitCents() {
        return brackets.values().stream().mapToLong(b -> b.getLast().upToCents()).min().orElse(0);
    }

    /**
     * Confere as faixas de uma nova revisão: ao menos uma por tipo, limites crescentes e positivos, alíquota entre 0 e
     * 1 (exclusive) com até 6 casas (PD-007), parcela a deduzir não negativa.
     */
    public static void validate(String productAnnex, String serviceAnnex, Map<RevenueKind, List<Bracket>> brackets, String source,
                                List<FieldIssue> issues) {
        if (productAnnex == null || !productAnnex.strip().matches("[A-Za-z0-9 ]{1,10}")) {
            issues.add(new FieldIssue("productAnnex", "Informe o anexo do produto (ex.: II)."));
        }
        if (serviceAnnex == null || !serviceAnnex.strip().matches("[A-Za-z0-9 ]{1,10}")) {
            issues.add(new FieldIssue("serviceAnnex", "Informe o anexo do serviço (ex.: III)."));
        }
        if (source == null || source.isBlank() || source.strip().length() > 300) {
            issues.add(new FieldIssue("source", "Informe a fonte das tabelas (até 300 caracteres)."));
        }
        for (RevenueKind kind : RevenueKind.values()) {
            List<Bracket> list = brackets.get(kind);
            String f = "brackets." + kind.name();
            if (list == null || list.isEmpty()) {
                issues.add(new FieldIssue(f, "Informe as faixas de " + kind.label() + "."));
                continue;
            }
            long previous = 0;
            for (int i = 0; i < list.size(); i++) {
                Bracket b = list.get(i);
                String fi = f + "[" + i + "]";
                if (b.upToCents() <= previous) {
                    issues.add(new FieldIssue(fi + ".upToCents", "O limite da " + (i + 1) + "ª faixa deve ser maior que o da anterior."));
                }
                if (b.rate().signum() <= 0 || b.rate().compareTo(BigDecimal.ONE) >= 0 || b.rate().stripTrailingZeros().scale() > 6) {
                    issues.add(new FieldIssue(fi + ".rate", "Alíquota entre 0% e 100%, com até 4 casas no percentual."));
                }
                if (b.deductionCents() < 0) {
                    issues.add(new FieldIssue(fi + ".deductionCents", "A parcela a deduzir não pode ser negativa."));
                }
                previous = Math.max(previous, b.upToCents());
            }
        }
    }

    /** Recusa com os campos indicados, se houver. */
    public static void requireValid(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("TAX_PARAMETER_INVALID", "Corrija os parâmetros indicados.", issues);
    }

    public static Map<RevenueKind, List<Bracket>> copy(Map<RevenueKind, List<Bracket>> b) {
        Map<RevenueKind, List<Bracket>> out = new EnumMap<>(RevenueKind.class);
        b.forEach((k, v) -> out.put(k, List.copyOf(new ArrayList<>(v))));
        return out;
    }
}
