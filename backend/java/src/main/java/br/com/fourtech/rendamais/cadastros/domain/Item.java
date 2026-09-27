package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Quantity;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Material ou serviço (formulário "materiais" do B01): item comprável, estocável ou executável com unidade de medida.
 * O código é do sistema e começa pela natureza (M ou S), por isso a natureza não muda depois do cadastro. Imutável:
 * cada operação valida e devolve uma nova versão.
 */
public final class Item {

    public enum Nature { MATERIAL, SERVICO }

    /** 1 {@code fromUom} = {@code factor} unidades do item. */
    public record Conversion(UUID id, String fromUom, BigDecimal factor) {
        String summary(String uom) {
            return "1 " + fromUom + " = " + brazilian(factor) + " " + uom;
        }
    }

    /** Casas decimais do custo de referência e do fator de conversão (premissa PD-007). */
    public static final int SCALE = Quantity.MAX_SCALE;
    static final int MAX_CONVERSIONS = 20;

    private final UUID id;
    private final String code;
    private final String description;
    private final Nature nature;
    private final String uom;
    private final Partner.Category category;
    private final boolean stockControlled;
    private final BigDecimal referenceCost;
    private final Partner.Status status;
    private final List<Conversion> conversions;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Item(UUID id, String code, String description, Nature nature, String uom, Partner.Category category,
                boolean stockControlled, BigDecimal referenceCost, Partner.Status status, List<Conversion> conversions,
                long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.description = Objects.requireNonNull(description);
        this.nature = Objects.requireNonNull(nature);
        this.uom = Objects.requireNonNull(uom);
        this.category = Objects.requireNonNull(category);
        this.stockControlled = stockControlled;
        this.referenceCost = referenceCost;
        this.status = Objects.requireNonNull(status);
        this.conversions = List.copyOf(conversions);
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /**
     * Consultas que a validação precisa: se a unidade existe e pode ser usada, e a categoria pelo id (existente e
     * ativa, ou já usada pelo item). Ficam fora do domínio porque dependem do banco.
     */
    public record Lookups(Predicate<String> usableUom, Function<String, Optional<Partner.Category>> category) { }

    /** Natureza pedida no cadastro, antes de gerar o código (o código depende dela). */
    public static Nature natureOf(ItemData data) {
        List<FieldIssue> issues = new ArrayList<>();
        Nature n = nature(data.nature(), issues);
        invalid(issues);
        return n;
    }

    public static Item register(String code, ItemData data, Lookups lookups, Instant now, String actor) {
        Valid v = validate(data, null, List.of(), lookups);
        return new Item(UUID.randomUUID(), code, v.description, v.nature, v.uom, v.category, v.stockControlled, v.referenceCost,
                Partner.Status.ATIVO, v.conversions, 1, now, actor, now, actor);
    }

    public Item update(ItemData data, Lookups lookups, Instant now, String actor) {
        Valid v = validate(data, nature, conversions, lookups);
        return new Item(id, code, v.description, nature, v.uom, v.category, v.stockControlled, v.referenceCost, status,
                v.conversions, version + 1, createdAt, createdBy, now, actor);
    }

    /** Inativa preservando o histórico; item referenciado nunca é apagado. */
    public Item deactivate(Instant now, String actor) {
        return new Item(id, code, description, nature, uom, category, stockControlled, referenceCost, Partner.Status.INATIVO,
                conversions, version + 1, createdAt, createdBy, now, actor);
    }

    /** Diferenças campo a campo, para a auditoria e o evento ItemUpdated. */
    public Map<String, String[]> diff(Item other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        Map<String, String> a = flat();
        Map<String, String> b = other.flat();
        a.forEach((k, v) -> {
            if (!Objects.equals(v, b.get(k))) d.put(k, new String[]{v, b.get(k)});
        });
        return d;
    }

    Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("description", description.isEmpty() ? null : description);
        m.put("nature", description.isEmpty() ? null : nature.name());
        m.put("uom", uom.isEmpty() ? null : uom);
        m.put("category", category.name().isEmpty() ? null : category.name());
        m.put("stockControlled", description.isEmpty() ? null : stockControlled ? "Sim" : "Não");
        m.put("referenceCost", referenceCost == null ? null : brazilian(referenceCost));
        m.put("status", description.isEmpty() ? null : status.name());
        m.put("conversions", conversions.isEmpty() ? null
                : conversions.stream().map(c -> c.summary(uom)).collect(Collectors.joining("; ")));
        return m;
    }

    /** Item vazio, para listar no cadastro os campos preenchidos como mudanças a partir do nada. */
    public Item emptyLike() {
        return new Item(id, code, "", nature, "", new Partner.Category(category.id(), ""), false, null, status, List.of(), 0,
                null, null, null, null);
    }

    private record Valid(String description, Nature nature, String uom, Partner.Category category, boolean stockControlled,
                         BigDecimal referenceCost, List<Conversion> conversions) { }

    private static Valid validate(ItemData data, Nature fixed, List<Conversion> known, Lookups lookups) {
        List<FieldIssue> issues = new ArrayList<>();
        String description = text(data.description());
        if (description == null) issues.add(new FieldIssue("description", "Informe a descrição."));
        else if (description.length() > 200) issues.add(new FieldIssue("description", "Máximo de 200 caracteres."));

        Nature nature = nature(data.nature(), issues);
        if (fixed != null && nature != null && nature != fixed) {
            issues.add(new FieldIssue("nature", "A natureza não muda depois do cadastro: o código " +
                    (fixed == Nature.MATERIAL ? "M" : "S") + " depende dela. Inative e cadastre de novo."));
            nature = fixed;
        }

        String uom = uom(data.uom());
        if (uom == null) issues.add(new FieldIssue("uom", "Informe a unidade de medida."));
        else if (!lookups.usableUom().test(uom)) issues.add(new FieldIssue("uom", "Unidade " + uom + " não existe ou está inativa."));

        Partner.Category category = null;
        String categoryId = text(data.categoryId());
        if (categoryId == null) issues.add(new FieldIssue("categoryId", "Informe a categoria."));
        else {
            category = lookups.category().apply(categoryId).orElse(null);
            if (category == null) issues.add(new FieldIssue("categoryId", "Categoria não existe ou está inativa."));
        }

        boolean stock = Boolean.TRUE.equals(data.stockControlled());
        if (data.stockControlled() == null) issues.add(new FieldIssue("stockControlled", "Informe se o item controla estoque."));
        if (stock && nature == Nature.SERVICO) {
            issues.add(new FieldIssue("stockControlled", "Serviço não controla estoque físico."));
        }

        BigDecimal cost = decimal(data.referenceCost(), "referenceCost", "Custo de referência", issues);
        if (cost != null && cost.signum() < 0) issues.add(new FieldIssue("referenceCost", "Custo de referência não pode ser negativo."));

        List<ItemData.ConversionData> convData = data.conversions() == null ? List.of() : data.conversions();
        if (convData.size() > MAX_CONVERSIONS) {
            issues.add(new FieldIssue("conversions", "Máximo de " + MAX_CONVERSIONS + " conversões."));
        }
        Set<UUID> knownIds = known.stream().map(Conversion::id).collect(Collectors.toSet());
        Set<String> seen = new HashSet<>();
        List<Conversion> conversions = new ArrayList<>();
        for (int i = 0; i < convData.size(); i++) {
            ItemData.ConversionData c = convData.get(i);
            String f = "conversions[" + i + "].";
            String from = uom(c.fromUom());
            if (from == null) issues.add(new FieldIssue(f + "fromUom", "Informe a unidade de compra."));
            else if (from.equals(uom)) issues.add(new FieldIssue(f + "fromUom", "A conversão é para outra unidade que não a do item."));
            else if (!seen.add(from)) issues.add(new FieldIssue(f + "fromUom", "Unidade " + from + " repetida nas conversões."));
            else if (!lookups.usableUom().test(from)) issues.add(new FieldIssue(f + "fromUom", "Unidade " + from + " não existe ou está inativa."));
            BigDecimal factor = decimal(c.factor(), f + "factor", "Fator", issues);
            if (factor == null) {
                if (text(c.factor()) == null) issues.add(new FieldIssue(f + "factor", "Informe o fator."));
            } else if (factor.signum() <= 0) {
                issues.add(new FieldIssue(f + "factor", "Fator deve ser maior que zero."));
            }
            conversions.add(new Conversion(keep(c.id(), knownIds), from == null ? "" : from, factor == null ? BigDecimal.ONE : factor));
        }
        invalid(issues);
        return new Valid(description, nature, uom, category, stock, cost, conversions);
    }

    private static Nature nature(String raw, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) {
            issues.add(new FieldIssue("nature", "Informe se é material ou serviço."));
            return null;
        }
        try {
            return Nature.valueOf(t.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("nature", "Natureza deve ser MATERIAL ou SERVICO."));
            return null;
        }
    }

    private static BigDecimal decimal(String raw, String field, String label, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) return null;
        try {
            BigDecimal v = new BigDecimal(t);
            if (v.stripTrailingZeros().scale() > SCALE) {
                issues.add(new FieldIssue(field, label + " com no máximo " + SCALE + " casas decimais."));
                return null;
            }
            if (v.abs().compareTo(new BigDecimal("1e13")) >= 0) {
                issues.add(new FieldIssue(field, label + " grande demais."));
                return null;
            }
            return v.setScale(SCALE);
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, label + " inválido."));
            return null;
        }
    }

    /** Número com vírgula decimal, sem zeros à direita além de duas casas ("184,50", "0,333333"), para o histórico. */
    static String brazilian(BigDecimal v) {
        BigDecimal x = v.stripTrailingZeros();
        if (x.scale() < 2) x = x.setScale(2);
        return x.toPlainString().replace('.', ',');
    }

    private static String uom(String raw) {
        String t = text(raw);
        return t == null ? null : t.toUpperCase(Locale.ROOT);
    }

    private static UUID keep(String raw, Set<UUID> known) {
        if (raw != null) {
            try {
                UUID id = UUID.fromString(raw);
                if (known.contains(id)) return id;
            } catch (IllegalArgumentException ignored) {
                // id desconhecido: conversão nova
            }
        }
        return UUID.randomUUID();
    }

    private static void invalid(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("ITEM_INVALID", "Corrija os campos indicados.", issues);
    }

    private static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    public UUID id() { return id; }
    public String code() { return code; }
    public String description() { return description; }
    public Nature nature() { return nature; }
    public String uom() { return uom; }
    public Partner.Category category() { return category; }
    public boolean stockControlled() { return stockControlled; }
    public BigDecimal referenceCost() { return referenceCost; }
    public Partner.Status status() { return status; }
    public List<Conversion> conversions() { return conversions; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
