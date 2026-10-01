package br.com.fourtech.rendamais.engenharia.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Custo da BOM (Sprint 10). Linha de item = quantidade × custo unitário, arredondado nos centavos uma vez (meio para
 * cima). Linha de submontagem = total da submontagem × quantidade, arredondado nos centavos. Total = soma das linhas.
 * Linha sem quantidade ou sem custo não entra na soma e é contada como pendente: o total fica parcial, nunca zero
 * silencioso.
 */
public final class BomCost {

    public enum Kind { ITEM, SUBASSEMBLY }

    /** Nó da árvore: linha de item ou de submontagem (com as linhas da submontagem em {@code children}). */
    public record Node(Kind kind, BigDecimal quantity, BigDecimal unitCost, boolean active, List<Node> children) { }

    /** Total em centavos e quantas linhas (em qualquer nível) ficaram fora por falta de quantidade ou custo. */
    public record Total(long cents, int pending) {
        public boolean complete() {
            return pending == 0;
        }
    }

    private BomCost() { }

    public static long itemCents(BigDecimal quantity, BigDecimal unitCost) {
        return quantity.multiply(unitCost).setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }

    public static long subassemblyCents(long subtotalCents, BigDecimal quantity) {
        return BigDecimal.valueOf(subtotalCents).multiply(quantity).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    public static Total total(List<Node> lines) {
        long cents = 0;
        int pending = 0;
        for (Node n : lines) {
            if (!n.active()) continue;
            Total line = line(n);
            cents += line.cents();
            pending += line.pending();
        }
        return new Total(cents, pending);
    }

    /** Valor de uma linha; a pendência inclui as linhas pendentes de dentro da submontagem. */
    public static Total line(Node n) {
        if (n.kind() == Kind.ITEM) {
            if (n.quantity() == null || n.unitCost() == null) return new Total(0, 1);
            return new Total(itemCents(n.quantity(), n.unitCost()), 0);
        }
        Total sub = total(n.children());
        if (n.quantity() == null) return new Total(0, sub.pending() + 1);
        return new Total(subassemblyCents(sub.cents(), n.quantity()), sub.pending());
    }
}
