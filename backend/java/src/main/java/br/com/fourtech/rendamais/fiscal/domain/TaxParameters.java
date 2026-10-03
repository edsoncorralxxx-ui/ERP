package br.com.fourtech.rendamais.fiscal.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Revisão dos parâmetros do Simples Nacional (PD-013): por anexo, as faixas (RBT12 até, alíquota nominal, parcela a
 * deduzir) e a repartição dos tributos de cada faixa, com vigência a partir de uma competência. Revisão gravada não
 * muda: a mudança é uma nova revisão, e os cálculos antigos guardam a que usaram.
 */
public record TaxParameters(UUID id, int revision, String regime, YearMonth validFrom, Map<Annex, AnnexTable> annexes, String source,
                            String notes, Instant createdAt, String createdBy) {

    public static final String SIMPLES_NACIONAL = "SIMPLES_NACIONAL";

    /** Faixa: RBT12 até {@code upToCents}, alíquota nominal (fração), parcela a deduzir e a repartição (frações, na ordem dos tributos). */
    public record Bracket(long upToCents, BigDecimal rate, long deductionCents, List<BigDecimal> shares) {
        public Bracket {
            shares = List.copyOf(shares);
        }
    }

    /** Tabela de um anexo: tributos do DAS (vazio quando a repartição não foi cadastrada) e as faixas em ordem crescente. */
    public record AnnexTable(List<String> taxes, List<Bracket> brackets) {
        public AnnexTable {
            taxes = List.copyOf(taxes);
            brackets = List.copyOf(brackets);
        }

        public boolean hasShares() {
            return !taxes.isEmpty();
        }
    }

    public TaxParameters {
        Map<Annex, AnnexTable> copy = new EnumMap<>(Annex.class);
        copy.putAll(annexes);
        annexes = copy;
    }

    public AnnexTable table(Annex annex) {
        return annexes.get(annex);
    }

    /** Maior RBT12 coberto pelas faixas (o limite do regime), o menor entre os anexos. */
    public long limitCents() {
        return annexes.values().stream().mapToLong(t -> t.brackets().getLast().upToCents()).min().orElse(0);
    }

    /**
     * Confere uma nova revisão: ao menos um anexo; em cada um, faixas com limite crescente e positivo, alíquota entre 0 e
     * 1 (exclusive) com até 6 casas (PD-007), parcela a deduzir não negativa; com tributos, cada faixa reparte entre eles
     * (frações de 0 a 1) e a repartição soma 100%.
     */
    public static void validate(Map<Annex, AnnexTable> annexes, String source, List<FieldIssue> issues) {
        if (source == null || source.isBlank() || source.strip().length() > 300) {
            issues.add(new FieldIssue("source", "Informe a fonte das tabelas (até 300 caracteres)."));
        }
        if (annexes.isEmpty()) issues.add(new FieldIssue("annexes", "Informe as faixas de ao menos um anexo."));
        annexes.forEach((annex, table) -> {
            String f = "annexes." + annex.name();
            if (table.brackets().isEmpty()) {
                issues.add(new FieldIssue(f, "Informe as faixas do " + annex.label() + "."));
                return;
            }
            if (new HashSet<>(table.taxes()).size() != table.taxes().size() || table.taxes().stream().anyMatch(t -> t == null || t.isBlank())) {
                issues.add(new FieldIssue(f + ".taxes", "Tributos sem nome ou repetidos."));
            }
            long previous = 0;
            for (int i = 0; i < table.brackets().size(); i++) {
                Bracket b = table.brackets().get(i);
                String fi = f + ".brackets[" + i + "]";
                if (b.upToCents() <= previous) {
                    issues.add(new FieldIssue(fi + ".upToCents", "O limite da " + (i + 1) + "ª faixa deve ser maior que o da anterior."));
                }
                if (b.rate().signum() <= 0 || b.rate().compareTo(BigDecimal.ONE) >= 0 || b.rate().stripTrailingZeros().scale() > 6) {
                    issues.add(new FieldIssue(fi + ".rate", "Alíquota entre 0% e 100%, com até 4 casas no percentual."));
                }
                if (b.deductionCents() < 0) {
                    issues.add(new FieldIssue(fi + ".deductionCents", "A parcela a deduzir não pode ser negativa."));
                }
                if (table.hasShares()) {
                    if (b.shares().size() != table.taxes().size()) {
                        issues.add(new FieldIssue(fi + ".shares", "Informe a repartição de cada tributo da faixa."));
                    } else if (b.shares().stream().anyMatch(s -> s.signum() < 0 || s.compareTo(BigDecimal.ONE) > 0)
                            || b.shares().stream().reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(BigDecimal.ONE) != 0) {
                        issues.add(new FieldIssue(fi + ".shares", "A repartição da " + (i + 1) + "ª faixa deve somar 100%."));
                    }
                } else if (!b.shares().isEmpty()) {
                    issues.add(new FieldIssue(fi + ".shares", "Informe os tributos antes da repartição."));
                }
                previous = Math.max(previous, b.upToCents());
            }
        });
    }

    /** Recusa com os campos indicados, se houver. */
    public static void requireValid(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("TAX_PARAMETER_INVALID", "Corrija os parâmetros indicados.", issues);
    }

    public static Map<Annex, AnnexTable> copy(Map<Annex, AnnexTable> annexes) {
        Map<Annex, AnnexTable> out = new EnumMap<>(Annex.class);
        annexes.forEach((k, v) -> out.put(k, new AnnexTable(new ArrayList<>(v.taxes()), new ArrayList<>(v.brackets()))));
        return out;
    }
}
