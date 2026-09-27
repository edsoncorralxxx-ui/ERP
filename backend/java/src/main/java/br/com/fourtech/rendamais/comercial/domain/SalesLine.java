package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Quantity;
import br.com.fourtech.rendamais.kernel.RoundingPolicy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Linha comercial de proposta ou pedido: equipamento (modelo descrito na linha, sem item de cadastro), produto ou
 * serviço (item do cadastro com a mesma natureza). Total da linha = round(quantidade × preço) − desconto, arredondado
 * por linha pela política vigente (INV-SO-2, premissa PD-002: HALF_EVEN).
 */
public record SalesLine(UUID id, Kind kind, UUID itemId, String itemCode, String description, BigDecimal quantity, String uom,
                        BigDecimal unitPrice, long discountCents, long grossCents, long totalCents) {

    public enum Kind { EQUIPAMENTO, MATERIAL, SERVICO }

    /** Item do cadastro como a validação precisa dele. */
    public record ItemInfo(UUID id, String code, String description, String nature, String uom, boolean active) { }

    /** Dados informados (antes da validação); números como texto com ponto decimal, valores em centavos. */
    public record Data(String id, String kind, String itemId, String description, String quantity, String unitPrice,
                       String discountCents) { }

    public static final int SCALE = Quantity.MAX_SCALE;
    public static final int MAX_LINES = 200;
    /** Equipamentos por linha: cada unidade vira um equipamento com identidade própria na confirmação. */
    public static final int MAX_EQUIPMENT_PER_LINE = 100;

    /**
     * Valida as linhas. {@code items} busca o item do cadastro; {@code knownItems} são os itens que o documento já usa
     * (aceitos mesmo se inativados depois); {@code knownIds} preserva a identidade das linhas existentes.
     */
    public static List<SalesLine> validate(List<Data> data, Function<UUID, Optional<ItemInfo>> items, Set<UUID> knownItems,
                                           Set<UUID> knownIds, List<FieldIssue> issues) {
        List<Data> rows = data == null ? List.of() : data;
        if (rows.isEmpty()) issues.add(new FieldIssue("lines", "Inclua ao menos uma linha."));
        if (rows.size() > MAX_LINES) issues.add(new FieldIssue("lines", "Máximo de " + MAX_LINES + " linhas."));
        List<SalesLine> lines = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Data d = rows.get(i);
            String f = "lines[" + i + "].";
            int before = issues.size();
            Kind kind = kind(d.kind(), f, issues);
            ItemInfo item = null;
            String itemId = text(d.itemId());
            if (kind == Kind.EQUIPAMENTO) {
                if (itemId != null) issues.add(new FieldIssue(f + "itemId", "Equipamento é descrito pelo modelo, sem item do cadastro."));
            } else if (kind != null) {
                if (itemId == null) {
                    issues.add(new FieldIssue(f + "itemId", "Escolha o " + (kind == Kind.MATERIAL ? "produto" : "serviço") + "."));
                } else {
                    item = uuid(itemId).flatMap(items).orElse(null);
                    if (item == null) {
                        issues.add(new FieldIssue(f + "itemId", "Item não encontrado."));
                    } else if (!item.nature().equals(kind.name())) {
                        issues.add(new FieldIssue(f + "itemId", "O item " + item.code() + " não é " + (kind == Kind.MATERIAL ? "produto" : "serviço") + "."));
                        item = null;
                    } else if (!item.active() && !knownItems.contains(item.id())) {
                        issues.add(new FieldIssue(f + "itemId", "O item " + item.code() + " está inativo."));
                        item = null;
                    }
                }
            }
            String description = text(d.description());
            if (description == null && item != null) description = item.description();
            if (description == null) {
                issues.add(new FieldIssue(f + "description", kind == Kind.EQUIPAMENTO ? "Informe o modelo do equipamento." : "Informe a descrição."));
            } else if (description.length() > 200) {
                issues.add(new FieldIssue(f + "description", "Máximo de 200 caracteres."));
            }
            BigDecimal qty = decimal(d.quantity(), f + "quantity", "Quantidade", new BigDecimal("1e9"), issues);
            if (qty == null && text(d.quantity()) == null) issues.add(new FieldIssue(f + "quantity", "Informe a quantidade."));
            if (qty != null && qty.signum() <= 0) {
                issues.add(new FieldIssue(f + "quantity", "Quantidade deve ser maior que zero."));
                qty = null;
            }
            if (qty != null && kind == Kind.EQUIPAMENTO) {
                if (qty.stripTrailingZeros().scale() > 0) {
                    issues.add(new FieldIssue(f + "quantity", "Equipamento é contado em unidades inteiras."));
                    qty = null;
                } else if (qty.compareTo(BigDecimal.valueOf(MAX_EQUIPMENT_PER_LINE)) > 0) {
                    issues.add(new FieldIssue(f + "quantity", "Máximo de " + MAX_EQUIPMENT_PER_LINE + " equipamentos por linha."));
                    qty = null;
                }
            }
            BigDecimal price = decimal(d.unitPrice(), f + "unitPrice", "Preço unitário", new BigDecimal("1e13"), issues);
            if (price == null && text(d.unitPrice()) == null) issues.add(new FieldIssue(f + "unitPrice", "Informe o preço unitário."));
            if (price != null && price.signum() < 0) {
                issues.add(new FieldIssue(f + "unitPrice", "Preço não pode ser negativo."));
                price = null;
            }
            long discount = 0;
            String rawDiscount = text(d.discountCents());
            if (rawDiscount != null) {
                if (!rawDiscount.matches("\\d{1,15}")) issues.add(new FieldIssue(f + "discountCents", "Desconto inválido."));
                else discount = Long.parseLong(rawDiscount);
            }
            if (issues.size() > before || qty == null || price == null) continue;
            long gross = gross(qty, price);
            if (discount > gross) {
                issues.add(new FieldIssue(f + "discountCents", "O desconto não pode passar do valor bruto da linha."));
                continue;
            }
            String uom = kind == Kind.EQUIPAMENTO ? "UN" : item.uom();
            lines.add(new SalesLine(keep(d.id(), knownIds), kind, item == null ? null : item.id(), item == null ? null : item.code(),
                    description, qty.setScale(SCALE), uom, price.setScale(SCALE), discount, gross, gross - discount));
        }
        return lines;
    }

    /** Valor bruto em centavos: quantidade × preço, arredondado uma vez por linha. */
    public static long gross(BigDecimal quantity, BigDecimal unitPrice) {
        return quantity.multiply(unitPrice).movePointRight(2).setScale(0, RoundingPolicy.PREMISSA_VIGENTE.mode()).longValueExact();
    }

    public static long total(List<SalesLine> lines) {
        long t = 0;
        for (SalesLine l : lines) t = Math.addExact(t, l.totalCents());
        return t;
    }

    /** Cópia com novo id, para a nova revisão da proposta ou o pedido convertido. */
    public SalesLine copy() {
        return new SalesLine(UUID.randomUUID(), kind, itemId, itemCode, description, quantity, uom, unitPrice, discountCents,
                grossCents, totalCents);
    }

    /** Texto estável da linha, para o histórico e o retrato da confirmação. */
    public String summary() {
        return kind.name() + " " + (itemCode == null ? "" : itemCode + " ") + description + " | " + quantity.stripTrailingZeros().toPlainString()
                + " " + uom + " × " + unitPrice.stripTrailingZeros().toPlainString() + " − " + discountCents + " = " + totalCents;
    }

    public static String summary(List<SalesLine> lines) {
        return lines.isEmpty() ? null : lines.stream().map(SalesLine::summary).collect(Collectors.joining("; "));
    }

    private static Kind kind(String raw, String f, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) {
            issues.add(new FieldIssue(f + "kind", "Informe o tipo da linha."));
            return null;
        }
        try {
            return Kind.valueOf(t.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(f + "kind", "Tipo deve ser EQUIPAMENTO, MATERIAL ou SERVICO."));
            return null;
        }
    }

    static BigDecimal decimal(String raw, String field, String label, BigDecimal limit, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) return null;
        try {
            BigDecimal v = new BigDecimal(t);
            if (v.stripTrailingZeros().scale() > SCALE) {
                issues.add(new FieldIssue(field, label + " com no máximo " + SCALE + " casas decimais."));
                return null;
            }
            if (v.abs().compareTo(limit) >= 0) {
                issues.add(new FieldIssue(field, label + " grande demais."));
                return null;
            }
            return v;
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, label + " inválido."));
            return null;
        }
    }

    static Optional<UUID> uuid(String raw) {
        try {
            return Optional.of(UUID.fromString(raw));
        } catch (IllegalArgumentException | NullPointerException e) {
            return Optional.empty();
        }
    }

    static UUID keep(String raw, Set<UUID> known) {
        return uuid(raw).filter(known::contains).orElseGet(UUID::randomUUID);
    }

    static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }
}
