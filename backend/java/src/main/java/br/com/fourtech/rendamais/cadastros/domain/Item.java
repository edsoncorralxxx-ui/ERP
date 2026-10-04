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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Produto ou serviço (formulário "materiais" do B01): item comprável, estocável ou executável com unidade de medida.
 * O código é do sistema e começa pela natureza (P ou S), por isso a natureza não muda depois do cadastro. Imutável:
 * cada operação valida e devolve uma nova versão.
 */
public final class Item {

    public enum Nature { MATERIAL, SERVICO }

    /** Tipo do item no mock: produto (vendável) e material (componente) são a natureza MATERIAL; serviço é SERVICO. */
    public enum Type {
        PRODUTO(Nature.MATERIAL), MATERIAL(Nature.MATERIAL), SERVICO(Nature.SERVICO);

        private final Nature nature;

        Type(Nature nature) {
            this.nature = nature;
        }

        public Nature nature() {
            return nature;
        }
    }

    /**
     * Campos da ficha do mock sem regra própria (cabeçalho e abas Geral, Vendas, Compras, Estoque, Engenharia e Fiscal),
     * guardados em {@code item.profile}. Marca, depósito e tabelas: códigos das tabelas auxiliares.
     */
    public static final Ficha PROFILE = new Ficha(
            Ficha.Campo.texto("complement", 200),
            Ficha.Campo.texto("brand", 20),
            Ficha.Campo.texto("gtin", 14),
            Ficha.Campo.booleano("stockItem"),
            Ficha.Campo.booleano("salesItem"),
            Ficha.Campo.booleano("purchaseItem"),
            Ficha.Campo.booleano("manufactured"),
            Ficha.Campo.texto("manufacturer", 120),
            Ficha.Campo.texto("manufacturerPartNumber", 60),
            Ficha.Campo.inteiro("warrantyMonths", 0, 600),
            Ficha.Campo.opcao("traceability", "Nenhuma", "Lote", "Número de série"),
            Ficha.Campo.booleano("blockedForPurchase"),
            Ficha.Campo.decimal("grossWeightKg", 3, "0", "999999"),
            Ficha.Campo.decimal("netWeightKg", 3, "0", "999999"),
            Ficha.Campo.texto("dimensions", 60),
            Ficha.Campo.texto("notes", 2000),
            Ficha.Campo.texto("salesUom", 10),
            Ficha.Campo.inteiro("unitsPerPackage", 1, 100000),
            Ficha.Campo.decimal("commissionPercent", 2, "0", "100"),
            Ficha.Campo.decimal("maxDiscountPercent", 2, "0", "100"),
            Ficha.Campo.centavos("salePriceCents"),
            Ficha.Campo.texto("preferredSupplier", 200),
            Ficha.Campo.texto("supplierItemCode", 60),
            Ficha.Campo.texto("purchaseUom", 10),
            Ficha.Campo.decimal("conversionFactor", 6, "0", "999999"),
            Ficha.Campo.inteiro("leadTimeDays", 0, 999),
            Ficha.Campo.decimal("minLot", 3, "0", "9999999"),
            Ficha.Campo.opcao("valuationMethod", "Custo médio ponderado", "PEPS", "Custo padrão"),
            Ficha.Campo.texto("defaultWarehouse", 10),
            Ficha.Campo.decimal("minStock", 3, "0", "9999999"),
            Ficha.Campo.decimal("maxStock", 3, "0", "9999999"),
            Ficha.Campo.texto("engineeringProduct", 30),
            Ficha.Campo.texto("bomReference", 30),
            Ficha.Campo.texto("bomRevision", 10),
            Ficha.Campo.texto("drawing", 60),
            Ficha.Campo.texto("routing", 120),
            Ficha.Campo.decimal("standardHours", 1, "0", "99999"),
            Ficha.Campo.formato("cest", 9, "\\d{2}\\.?\\d{3}\\.?\\d{2}", "CEST no formato 00.000.00."),
            Ficha.Campo.opcao("spedType", "00 — Mercadoria para revenda", "01 — Matéria-prima", "02 — Embalagem",
                    "03 — Produto em processo", "04 — Produto acabado", "05 — Subproduto", "06 — Produto intermediário",
                    "07 — Material de uso e consumo", "08 — Ativo imobilizado", "09 — Serviços", "10 — Outros insumos", "99 — Outras"),
            Ficha.Campo.decimal("ipiRate", 2, "0", "100"),
            Ficha.Campo.texto("taxBenefitCode", 10),
            Ficha.Campo.opcao("issExigibility", "Exigível", "Não incidência", "Isenção", "Exportação", "Imunidade",
                    "Suspensa por decisão judicial", "Suspensa por processo administrativo"),
            Ficha.Campo.opcao("issIncidence", "Município do prestador", "Município do tomador"),
            Ficha.Campo.decimal("issRate", 2, "0", "5"));

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
    private final Type type;
    private final Map<String, Object> profile;
    private final String uom;
    private final Partner.Category category;
    private final boolean stockControlled;
    private final BigDecimal referenceCost;
    private final String ncm;
    private final String serviceCode;
    private final Partner.Status status;
    private final List<Conversion> conversions;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Item(UUID id, String code, String description, Nature nature, String uom, Partner.Category category,
                boolean stockControlled, BigDecimal referenceCost, String ncm, String serviceCode, Partner.Status status,
                List<Conversion> conversions,
                long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this(id, code, description, nature, null, Map.of(), uom, category, stockControlled, referenceCost, ncm, serviceCode, status,
                conversions, version, createdAt, createdBy, updatedAt, updatedBy);
    }

    public Item(UUID id, String code, String description, Nature nature, Type type, Map<String, Object> profile, String uom,
                Partner.Category category, boolean stockControlled, BigDecimal referenceCost, String ncm, String serviceCode,
                Partner.Status status, List<Conversion> conversions, long version, Instant createdAt, String createdBy,
                Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.description = Objects.requireNonNull(description);
        this.nature = Objects.requireNonNull(nature);
        this.type = type == null ? (nature == Nature.SERVICO ? Type.SERVICO : Type.MATERIAL) : type;
        this.profile = profile == null ? Map.of() : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(profile));
        this.uom = Objects.requireNonNull(uom);
        this.category = Objects.requireNonNull(category);
        this.stockControlled = stockControlled;
        this.referenceCost = referenceCost;
        this.ncm = ncm;
        this.serviceCode = serviceCode;
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
        Nature n = nature(withNature(data).nature(), issues);
        invalid(issues);
        return n;
    }

    /** Sem natureza informada, ela vem do tipo (produto e material: MATERIAL; serviço: SERVICO). */
    private static ItemData withNature(ItemData d) {
        if (text(d.nature()) != null || text(d.type()) == null) return d;
        Type t;
        try {
            t = Type.valueOf(d.type().strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return d;
        }
        return new ItemData(d.description(), t.nature().name(), d.uom(), d.categoryId(), d.stockControlled(), d.referenceCost(), d.ncm(),
                d.serviceCode(), d.conversions(), d.type(), d.profile());
    }

    public static Item register(String code, ItemData data, Lookups lookups, Instant now, String actor) {
        Valid v = validate(withNature(data), null, null, List.of(), Map.of(), lookups);
        return new Item(UUID.randomUUID(), code, v.description, v.nature, v.type, v.profile, v.uom, v.category, v.stockControlled,
                v.referenceCost, v.ncm, v.serviceCode, Partner.Status.ATIVO, v.conversions, 1, now, actor, now, actor);
    }

    public Item update(ItemData data, Lookups lookups, Instant now, String actor) {
        Valid v = validate(withNature(data), nature, type, conversions, profile, lookups);
        return new Item(id, code, v.description, nature, v.type, v.profile, v.uom, v.category, v.stockControlled, v.referenceCost,
                v.ncm, v.serviceCode, status, v.conversions, version + 1, createdAt, createdBy, now, actor);
    }

    /** Inativa preservando o histórico; item referenciado nunca é apagado. */
    public Item deactivate(Instant now, String actor) {
        return withStatus(Partner.Status.INATIVO, now, actor);
    }

    public Item withStatus(Partner.Status s, Instant now, String actor) {
        return new Item(id, code, description, nature, type, profile, uom, category, stockControlled, referenceCost, ncm, serviceCode,
                s, conversions, version + 1, createdAt, createdBy, now, actor);
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
        m.put("type", description.isEmpty() ? null : type.name());
        m.put("uom", uom.isEmpty() ? null : uom);
        m.put("category", category.name().isEmpty() ? null : category.name());
        m.put("stockControlled", description.isEmpty() ? null : stockControlled ? "Sim" : "Não");
        m.put("referenceCost", referenceCost == null ? null : brazilian(referenceCost));
        m.put("ncm", ncm == null ? null : formattedNcm(ncm));
        m.put("serviceCode", serviceCode);
        m.put("status", description.isEmpty() ? null : status.name());
        m.put("conversions", conversions.isEmpty() ? null
                : conversions.stream().map(c -> c.summary(uom)).collect(Collectors.joining("; ")));
        m.putAll(PROFILE.plano(profile));
        return m;
    }

    /** Item vazio, para listar no cadastro os campos preenchidos como mudanças a partir do nada. */
    public Item emptyLike() {
        return new Item(id, code, "", nature, type, Map.of(), "", new Partner.Category(category.id(), ""), false, null, null, null, status,
                List.of(), 0, null, null, null, null);
    }

    private record Valid(String description, Nature nature, Type type, Map<String, Object> profile, String uom,
                         Partner.Category category, boolean stockControlled, BigDecimal referenceCost, String ncm, String serviceCode,
                         List<Conversion> conversions) { }

    private static Valid validate(ItemData data, Nature fixed, Type knownType, List<Conversion> known, Map<String, Object> knownProfile,
                                  Lookups lookups) {
        List<FieldIssue> issues = new ArrayList<>();
        Map<String, Object> profile = data.profile() == null ? knownProfile : PROFILE.validar(data.profile(), "profile.", issues);
        String description = text(data.description());
        if (description == null) issues.add(new FieldIssue("description", "Informe a descrição."));
        else if (description.length() > 200) issues.add(new FieldIssue("description", "Máximo de 200 caracteres."));

        Nature nature = nature(data.nature(), issues);
        if (fixed != null && nature != null && nature != fixed) {
            issues.add(new FieldIssue("nature", "A natureza não muda depois do cadastro: o código " +
                    (fixed == Nature.MATERIAL ? "P" : "S") + " depende dela. Inative e cadastre de novo."));
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

        // NCM (8 dígitos) é de produto; o código do serviço (item da lista da LC 116, o COD_LST do SPED) é de serviço.
        String ncm = text(data.ncm());
        if (ncm != null) {
            ncm = ncm.replaceAll("[.\\s-]", "");
            if (nature == Nature.SERVICO) issues.add(new FieldIssue("ncm", "NCM é só de produto; serviço usa o código da LC 116."));
            else if (!ncm.matches("\\d{8}")) issues.add(new FieldIssue("ncm", "NCM deve ter 8 dígitos (0000.00.00)."));
        }
        String serviceCode = text(data.serviceCode());
        if (serviceCode != null) {
            Matcher m = Pattern.compile("(\\d{1,2})\\.?(\\d{2})").matcher(serviceCode);
            if (nature == Nature.MATERIAL) {
                issues.add(new FieldIssue("serviceCode", "Código de serviço é só de serviço; produto usa o NCM."));
            } else if (!m.matches()) {
                issues.add(new FieldIssue("serviceCode", "Código do serviço no formato da lista da LC 116, como 14.01."));
            } else {
                serviceCode = String.format("%02d.%s", Integer.parseInt(m.group(1)), m.group(2));
            }
        }

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
        Type type = knownType;
        if (text(data.type()) != null) {
            try {
                type = Type.valueOf(data.type().strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("type", "Tipo deve ser PRODUTO, MATERIAL ou SERVICO."));
            }
        }
        if (type == null && nature != null) type = nature == Nature.SERVICO ? Type.SERVICO : Type.MATERIAL;
        if (type != null && nature != null && type.nature() != nature) {
            issues.add(new FieldIssue("type", nature == Nature.SERVICO ? "Serviço não vira produto ou material." : "Produto ou material não vira serviço."));
        }
        invalid(issues);
        return new Valid(description, nature, type, profile, uom, category, stock, cost, ncm, serviceCode, conversions);
    }

    private static Nature nature(String raw, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) {
            issues.add(new FieldIssue("nature", "Informe se é produto ou serviço."));
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

    /** 84798999 → 8479.89.99 */
    static String formattedNcm(String ncm) {
        return ncm.substring(0, 4) + "." + ncm.substring(4, 6) + "." + ncm.substring(6);
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
    public Type type() { return type; }
    public Map<String, Object> profile() { return profile; }
    public String uom() { return uom; }
    public Partner.Category category() { return category; }
    public boolean stockControlled() { return stockControlled; }
    public BigDecimal referenceCost() { return referenceCost; }
    public String ncm() { return ncm; }
    public String serviceCode() { return serviceCode; }
    public Partner.Status status() { return status; }
    public List<Conversion> conversions() { return conversions; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
