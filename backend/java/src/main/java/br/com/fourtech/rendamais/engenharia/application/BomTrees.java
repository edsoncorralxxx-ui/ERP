package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.engenharia.domain.EquipmentBom;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Árvore de custo de uma revisão (com as revisões das submontagens) e da BOM do equipamento. Uma revisão aprovada não
 * muda, então o total dela sempre dá o mesmo; o rascunho é calculado com o que está gravado agora.
 */
@Component
class BomTrees {

    /** Profundidade máxima de submontagens; a gravação já recusa ciclos, isto só protege a leitura. */
    static final int MAX_DEPTH = 20;

    private final BomRepository repository;

    BomTrees(BomRepository repository) {
        this.repository = repository;
    }

    /** Linhas da revisão como nós de custo; as submontagens trazem as linhas da revisão escolhida. */
    List<BomCost.Node> nodes(UUID revisionId) {
        return nodes(revisionId, 0, new HashMap<>());
    }

    private List<BomCost.Node> nodes(UUID revisionId, int depth, Map<UUID, List<BomCost.Node>> memo) {
        List<BomCost.Node> cached = memo.get(revisionId);
        if (cached != null) return cached;
        if (depth > MAX_DEPTH) throw new IllegalStateException("BOM com submontagens demais: " + revisionId);
        List<BomCost.Node> out = new ArrayList<>();
        for (BomLine l : repository.linesOf(revisionId)) out.add(node(l, depth, memo));
        memo.put(revisionId, out);
        return out;
    }

    private BomCost.Node node(BomLine l, int depth, Map<UUID, List<BomCost.Node>> memo) {
        List<BomCost.Node> children = l.kind() == BomCost.Kind.SUBASSEMBLY ? nodes(l.childRevisionId(), depth + 1, memo) : List.of();
        return new BomCost.Node(l.kind(), l.quantity(), l.unitCost(), true, children);
    }

    BomCost.Total total(UUID revisionId) {
        return BomCost.total(nodes(revisionId));
    }

    /** Valor de cada linha da revisão (na ordem das linhas). */
    List<BomCost.Total> lineTotals(UUID revisionId) {
        return nodes(revisionId).stream().map(BomCost::line).toList();
    }

    /** Revisões de submontagem em qualquer nível abaixo da revisão (sem a própria). */
    Set<UUID> descendants(UUID revisionId) {
        Set<UUID> seen = new HashSet<>();
        collect(revisionId, seen, 0);
        seen.remove(revisionId);
        return seen;
    }

    private void collect(UUID revisionId, Set<UUID> seen, int depth) {
        if (depth > MAX_DEPTH || !seen.add(revisionId)) return;
        for (BomLine l : repository.linesOf(revisionId)) {
            if (l.kind() == BomCost.Kind.SUBASSEMBLY) collect(l.childRevisionId(), seen, depth + 1);
        }
    }

    /** BOMs usadas em qualquer nível abaixo da revisão, incluindo a BOM da própria revisão. */
    Set<UUID> bomsBelow(UUID revisionId) {
        Set<UUID> boms = new HashSet<>();
        for (UUID rev : descendants(revisionId)) repository.findRevision(rev).map(BomRevision::bomId).ifPresent(boms::add);
        repository.findRevision(revisionId).map(BomRevision::bomId).ifPresent(boms::add);
        return boms;
    }

    // ───────────── BOM do equipamento ─────────────

    /** Linhas do equipamento organizadas pelo pai (null = primeiro nível), já na ordem das posições. */
    static Map<UUID, List<EquipmentBom.Line>> byParent(List<EquipmentBom.Line> lines) {
        Map<UUID, List<EquipmentBom.Line>> m = new HashMap<>();
        for (EquipmentBom.Line l : lines) m.computeIfAbsent(l.parentId(), k -> new ArrayList<>()).add(l);
        m.values().forEach(list -> list.sort(java.util.Comparator.comparingInt(EquipmentBom.Line::position)));
        return m;
    }

    static List<BomCost.Node> equipmentNodes(Map<UUID, List<EquipmentBom.Line>> byParent, UUID parentId) {
        List<BomCost.Node> out = new ArrayList<>();
        for (EquipmentBom.Line l : byParent.getOrDefault(parentId, List.of())) out.add(equipmentNode(byParent, l));
        return out;
    }

    static BomCost.Node equipmentNode(Map<UUID, List<EquipmentBom.Line>> byParent, EquipmentBom.Line l) {
        List<BomCost.Node> children = l.kind() == BomCost.Kind.SUBASSEMBLY ? equipmentNodes(byParent, l.id()) : List.of();
        return new BomCost.Node(l.kind(), l.quantity(), l.unitCost(), l.active(), children);
    }

    BomCost.Total equipmentTotal(UUID equipmentBomId) {
        return BomCost.total(equipmentNodes(byParent(repository.equipmentLines(equipmentBomId)), null));
    }
}
