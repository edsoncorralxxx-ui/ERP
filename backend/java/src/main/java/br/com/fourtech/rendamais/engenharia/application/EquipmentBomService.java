package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.engenharia.domain.EquipmentBom;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * BOM do equipamento (Sprint 10): aplicar uma revisão aprovada (cópia congelada, uma vez só), trocar a revisão com
 * motivo e ajustar linhas só daquele equipamento, também com motivo. Também o custo planejado e a margem prevista do
 * projeto: soma das BOMs dos equipamentos contra o valor contratado; equipamento sem BOM fica "sem custo planejado".
 */
@Service
public class EquipmentBomService {

    static final String ENTITY = "equipment_bom";

    private final BomRepository repository;
    private final BomTrees trees;
    private final BomService boms;
    private final ProjectQueryApi projects;
    private final ItemQueryApi items;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public EquipmentBomService(BomRepository repository, BomTrees trees, BomService boms, ProjectQueryApi projects, ItemQueryApi items,
                               AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.trees = trees;
        this.boms = boms;
        this.projects = projects;
        this.items = items;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    public record ApplyRequest(String revisionId, String reason) { }

    /** Ajuste: ADD (incluir), UPDATE (alterar quantidade ou custo), REMOVE (retirar) ou RESTORE (devolver), sempre com motivo. */
    public record AdjustRequest(String action, String lineId, String parentLineId, String itemId, String description, String quantity,
                                String uom, String unitCost, String category, String notes, String reason) { }

    /** Linha na ordem da árvore, com o nível e o estado em relação ao modelo (MODEL, CHANGED, ADDED, REMOVED). */
    public record LineView(EquipmentBom.Line line, int depth, String itemCode, Long lineCents, String state) { }

    public record EquipmentBomView(ProjectQueryApi.EquipmentRef equipment, EquipmentBom bom, Bom modelBom, BomRevision revision,
                                   List<LineView> lines, long totalCents, int pending, long modelTotalCents, int added, int removed,
                                   int changed) { }

    public record EquipmentCost(ProjectQueryApi.EquipmentRef equipment, boolean applied, UUID bomId, String bomName,
                                UUID revisionId, String revisionLabel, Long costCents, int pending, boolean adjusted) { }

    /** Custo planejado do projeto: margem só quando todos os equipamentos ativos têm BOM sem pendência. */
    public record PlannedCost(ProjectQueryApi.CostBasis project, long contractCents, long plannedCostCents, boolean complete,
                              int withoutBom, Long marginCents, BigDecimal marginRate, List<EquipmentCost> equipment) { }

    // ───────────── Consultas ─────────────

    @Transactional(readOnly = true)
    public EquipmentBomView view(UUID equipmentId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        ProjectQueryApi.EquipmentRef eq = equipment(equipmentId);
        return view(eq, repository.equipmentBomOf(equipmentId).orElse(null));
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID equipmentId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        equipment(equipmentId);
        return repository.equipmentBomOf(equipmentId).map(b -> auditQuery.history(ENTITY, b.id().toString())).orElse(List.of());
    }

    @Transactional(readOnly = true)
    public PlannedCost plannedCost(UUID projectId) {
        CurrentUserHolder.require(Permissions.PROJECT_READ);
        CurrentUserHolder.require(Permissions.BOM_READ);
        ProjectQueryApi.CostBasis basis = projects.costBasis(projectId).orElseThrow(() -> new NotFoundException("Projeto não encontrado."));
        List<ProjectQueryApi.EquipmentRef> active = basis.equipment().stream().filter(ProjectQueryApi.EquipmentRef::active).toList();
        Map<UUID, EquipmentBom> applied = new HashMap<>();
        repository.equipmentBoms(active.stream().map(ProjectQueryApi.EquipmentRef::id).toList()).forEach(b -> applied.put(b.equipmentId(), b));
        List<EquipmentCost> rows = new ArrayList<>();
        long total = 0;
        int without = 0;
        int pending = 0;
        for (ProjectQueryApi.EquipmentRef e : active) {
            EquipmentBom b = applied.get(e.id());
            if (b == null) {
                without++;
                rows.add(new EquipmentCost(e, false, null, null, null, null, null, 0, false));
                continue;
            }
            BomRevision rev = boms.revision0(b.revisionId());
            Bom bom = boms.bom(rev.bomId());
            List<EquipmentBom.Line> lines = repository.equipmentLines(b.id());
            BomCost.Total t = BomCost.total(BomTrees.equipmentNodes(BomTrees.byParent(lines), null));
            boolean adjusted = lines.stream().anyMatch(l -> l.origin() == EquipmentBom.Origin.ADJUSTMENT || !l.active() || l.changed());
            total += t.cents();
            pending += t.pending();
            rows.add(new EquipmentCost(e, true, bom.id(), bom.name(), rev.id(), rev.label(), t.cents(), t.pending(), adjusted));
        }
        boolean complete = !active.isEmpty() && without == 0 && pending == 0;
        Long margin = complete ? basis.contractCents() - total : null;
        BigDecimal rate = complete && basis.contractCents() > 0
                ? BigDecimal.valueOf(margin).divide(BigDecimal.valueOf(basis.contractCents()), 6, RoundingMode.HALF_UP) : null;
        return new PlannedCost(basis, basis.contractCents(), total, complete, without, margin, rate, rows);
    }

    // ───────────── Comandos ─────────────

    /**
     * ApplyBomToProject: cópia congelada da revisão aprovada no equipamento. Aplicar de novo a mesma revisão não muda
     * nada; trocar de revisão exige motivo e descarta os ajustes do equipamento (ficam na auditoria).
     */
    @Transactional
    public EquipmentBomView apply(String idempotencyKey, UUID equipmentId, ApplyRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROJECT_BOM_APPLY);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "ApplyBomToProject", Map.of("equipmentId", equipmentId.toString(),
                "request", r == null ? Map.of() : r));
        ProjectQueryApi.EquipmentRef eq = equipment(equipmentId);
        if (done.isPresent()) return view(eq, repository.equipmentBomOf(equipmentId).orElse(null));
        if (!eq.active()) throw new InvalidStateException("O equipamento " + eq.code() + " foi cancelado e não recebe BOM.");
        UUID revisionId = BomService.parseUuid(r == null ? null : r.revisionId(), "revisionId")
                .orElseThrow(() -> BomService.invalid("BOM_INVALID", "revisionId", "Escolha a revisão aprovada."));
        BomRevision rev = boms.revision0(revisionId);
        Bom bom = boms.bom(rev.bomId());
        if (rev.status() == BomRevision.Status.DRAFT) {
            throw BomService.invalid("BOM_NOT_APPROVED", "revisionId", "A revisão " + rev.label() + " ainda está em rascunho; aprove antes de aplicar.");
        }
        if (!bom.isModelBom()) {
            throw BomService.invalid("BOM_INVALID", "revisionId", "Aplique a BOM de um modelo; " + bom.name() + " é uma submontagem.");
        }
        Instant now = clock.instant();
        Optional<EquipmentBom> existing = repository.equipmentBomForUpdate(equipmentId);
        String reason = BomService.text(r.reason());
        EquipmentBom saved;
        String action;
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        if (existing.isPresent()) {
            EquipmentBom current = existing.get();
            if (current.revisionId().equals(revisionId)) {
                receipts.complete(user.username(), key, current.id().toString());
                return view(eq, current);
            }
            if (reason == null || reason.length() > 500) {
                throw new RuleViolationException("EQUIPMENT_BOM_INVALID", "Informe o motivo da troca de revisão.",
                        List.of(new FieldIssue("reason", reason == null ? "Obrigatório." : "Máximo de 500 caracteres.")));
            }
            BomRevision old = boms.revision0(current.revisionId());
            long oldTotal = trees.equipmentTotal(current.id()).cents();
            repository.deleteEquipmentLines(current.id());
            saved = new EquipmentBom(current.id(), equipmentId, revisionId, current.version() + 1, now, user.username(), now, user.username());
            repository.update(saved);
            copy(saved.id(), revisionId, null);
            action = "EQUIPMENT_BOM_REVISION_CHANGED";
            changes.put("bom", BomService.change(boms.bom(old.bomId()).name(), bom.name()));
            changes.put("revision", BomService.change(old.label(), rev.label()));
            changes.put("totalCents", BomService.change(Long.toString(oldTotal), Long.toString(trees.equipmentTotal(saved.id()).cents())));
        } else {
            saved = new EquipmentBom(UUID.randomUUID(), equipmentId, revisionId, 1, now, user.username(), now, user.username());
            repository.insert(saved);
            copy(saved.id(), revisionId, null);
            action = "EQUIPMENT_BOM_APPLIED";
            changes.put("bom", BomService.change(null, bom.name()));
            changes.put("revision", BomService.change(null, rev.label()));
            changes.put("totalCents", BomService.change(null, Long.toString(trees.equipmentTotal(saved.id()).cents())));
        }
        changes.put("equipment", BomService.change(null, eq.code()));
        audit.record(new AuditEntry(user.username(), action, ENTITY, saved.id().toString(), saved.version(), reason, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("projectId", eq.projectId().toString());
        payload.put("equipmentId", equipmentId.toString());
        payload.put("bomId", bom.id().toString());
        payload.put("revisionId", rev.id().toString());
        payload.put("revision", rev.revision());
        outbox.append("ProjectBomApplied", ENTITY, saved.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, saved.id().toString());
        return view(eq, saved);
    }

    /** AdjustEquipmentBom com a versão lida (If-Match): muda só a BOM deste equipamento; o modelo não muda. */
    @Transactional
    public EquipmentBomView adjust(UUID equipmentId, long expectedVersion, AdjustRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PROJECT_BOM_APPLY);
        ProjectQueryApi.EquipmentRef eq = equipment(equipmentId);
        if (!eq.active()) throw new InvalidStateException("O equipamento " + eq.code() + " foi cancelado e não muda mais.");
        EquipmentBom current = repository.equipmentBomForUpdate(equipmentId)
                .orElseThrow(() -> new InvalidStateException("O equipamento " + eq.code() + " ainda não tem BOM; aplique uma revisão antes."));
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        List<FieldIssue> issues = new ArrayList<>();
        String reason = BomService.text(r == null ? null : r.reason());
        if (reason == null) issues.add(new FieldIssue("reason", "Informe o motivo do ajuste."));
        else if (reason.length() > 500) issues.add(new FieldIssue("reason", "Máximo de 500 caracteres."));
        String action = r == null || r.action() == null ? "" : r.action().strip().toUpperCase(Locale.ROOT);
        List<EquipmentBom.Line> lines = repository.equipmentLines(current.id());
        Map<UUID, EquipmentBom.Line> byId = new HashMap<>();
        lines.forEach(l -> byId.put(l.id(), l));
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        long before = trees.equipmentTotal(current.id()).cents();

        switch (action) {
            case "ADD" -> {
                UUID parentId = BomService.parseUuid(r.parentLineId(), "parentLineId").orElse(null);
                if (parentId != null) {
                    EquipmentBom.Line parent = byId.get(parentId);
                    if (parent == null || parent.kind() != BomCost.Kind.SUBASSEMBLY || !parent.active()) {
                        issues.add(new FieldIssue("parentLineId", "Escolha uma submontagem ativa deste equipamento."));
                    }
                }
                ItemQueryApi.ItemRef item = BomService.parseUuid(r.itemId(), null).flatMap(items::item).orElse(null);
                if (item == null) issues.add(new FieldIssue("itemId", "Escolha o produto ou serviço."));
                BigDecimal qty = BomService.decimal(r.quantity(), "quantity", false, issues);
                if (qty == null && BomService.text(r.quantity()) == null) issues.add(new FieldIssue("quantity", "Informe a quantidade."));
                BigDecimal cost = BomService.decimal(r.unitCost(), "unitCost", true, issues);
                if (cost == null && BomService.text(r.unitCost()) == null) issues.add(new FieldIssue("unitCost", "Informe o custo unitário."));
                String description = BomService.limited(r.description(), 200, "description", issues);
                String category = BomService.limited(r.category(), 100, "category", issues);
                String notes = BomService.limited(r.notes(), 500, "notes", issues);
                fail(issues);
                int position = lines.stream().filter(l -> java.util.Objects.equals(l.parentId(), parentId))
                        .mapToInt(EquipmentBom.Line::position).max().orElse(0) + 1;
                String uom = BomService.text(r.uom()) == null ? item.uom() : r.uom().strip().toUpperCase(Locale.ROOT);
                EquipmentBom.Line added = new EquipmentBom.Line(UUID.randomUUID(), current.id(), parentId, position, BomCost.Kind.ITEM,
                        item.id(), null, null, description == null ? item.description() : description, qty, uom, cost, category, null, null,
                        notes, EquipmentBom.Origin.ADJUSTMENT, null, null, EquipmentBom.LineStatus.ACTIVE, reason);
                repository.insertEquipmentLines(List.of(added));
                changes.put("added", BomService.change(null, added.description() + " — " + plain(qty) + " " + uom + " × " + plain(cost)));
            }
            case "UPDATE", "REMOVE", "RESTORE" -> {
                UUID lineId = BomService.parseUuid(r.lineId(), "lineId").orElse(null);
                EquipmentBom.Line line = lineId == null ? null : byId.get(lineId);
                if (line == null) {
                    issues.add(new FieldIssue("lineId", "Escolha a linha da BOM do equipamento."));
                    fail(issues);
                }
                fail(issues);
                if (action.equals("REMOVE")) {
                    if (!line.active()) throw new InvalidStateException("A linha " + line.description() + " já foi retirada.");
                    repository.updateEquipmentLine(with(line, line.quantity(), line.unitCost(), EquipmentBom.LineStatus.REMOVED, reason));
                    changes.put("removed", BomService.change(line.description(), null));
                } else if (action.equals("RESTORE")) {
                    if (line.active()) throw new InvalidStateException("A linha " + line.description() + " não está retirada.");
                    repository.updateEquipmentLine(with(line, line.quantity(), line.unitCost(), EquipmentBom.LineStatus.ACTIVE, reason));
                    changes.put("restored", BomService.change(null, line.description()));
                } else {
                    if (!line.active()) throw new InvalidStateException("A linha " + line.description() + " foi retirada; devolva antes de alterar.");
                    BigDecimal qty = BomService.text(r.quantity()) == null ? line.quantity()
                            : BomService.decimal(r.quantity(), "quantity", false, issues);
                    BigDecimal cost = line.unitCost();
                    if (BomService.text(r.unitCost()) != null) {
                        if (line.kind() == BomCost.Kind.SUBASSEMBLY) {
                            issues.add(new FieldIssue("unitCost", "O custo da submontagem é a soma das linhas dela."));
                        } else {
                            cost = BomService.decimal(r.unitCost(), "unitCost", true, issues);
                        }
                    }
                    fail(issues);
                    changes.put("line", BomService.change(null, line.description()));
                    if (!same(qty, line.quantity())) changes.put("quantity", BomService.change(plain(line.quantity()), plain(qty)));
                    if (!same(cost, line.unitCost())) changes.put("unitCost", BomService.change(plain(line.unitCost()), plain(cost)));
                    if (changes.size() == 1) throw new RuleViolationException("EQUIPMENT_BOM_INVALID", "Nada mudou na linha.", List.of());
                    repository.updateEquipmentLine(with(line, qty, cost, EquipmentBom.LineStatus.ACTIVE, reason));
                }
            }
            default -> {
                issues.add(new FieldIssue("action", "Use ADD, UPDATE, REMOVE ou RESTORE."));
                fail(issues);
            }
        }
        Instant now = clock.instant();
        EquipmentBom saved = new EquipmentBom(current.id(), equipmentId, current.revisionId(), current.version() + 1, current.appliedAt(),
                current.appliedBy(), now, user.username());
        repository.update(saved);
        long after = trees.equipmentTotal(current.id()).cents();
        if (before != after) changes.put("totalCents", BomService.change(Long.toString(before), Long.toString(after)));
        audit.record(new AuditEntry(user.username(), "EQUIPMENT_BOM_ADJUSTED", ENTITY, saved.id().toString(), saved.version(), reason,
                changes, CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("equipmentId", equipmentId.toString());
        payload.put("projectId", eq.projectId().toString());
        payload.put("action", action);
        payload.put("totalCents", Long.toString(after));
        outbox.append("EquipmentBomAdjusted", ENTITY, saved.id().toString(), payload, user.username());
        return view(eq, saved);
    }

    // ───────────── Apoio ─────────────

    /** Copia as linhas da revisão (e, nas submontagens, as da revisão escolhida) como linhas do modelo. */
    private void copy(UUID equipmentBomId, UUID revisionId, UUID parentId) {
        List<EquipmentBom.Line> out = new ArrayList<>();
        List<UUID[]> nested = new ArrayList<>();
        for (BomLine l : repository.linesOf(revisionId)) {
            EquipmentBom.Line c = new EquipmentBom.Line(UUID.randomUUID(), equipmentBomId, parentId, l.position(), l.kind(), l.itemId(),
                    l.childRevisionId(), l.referenceCode(), l.description(), l.quantity(), l.uom(), l.unitCost(), l.category(),
                    l.supplier(), l.material(), l.notes(), EquipmentBom.Origin.MODEL, l.quantity(), l.unitCost(),
                    EquipmentBom.LineStatus.ACTIVE, null);
            out.add(c);
            if (l.kind() == BomCost.Kind.SUBASSEMBLY) nested.add(new UUID[]{l.childRevisionId(), c.id()});
        }
        repository.insertEquipmentLines(out);
        for (UUID[] n : nested) copy(equipmentBomId, n[0], n[1]);
    }

    private EquipmentBomView view(ProjectQueryApi.EquipmentRef eq, EquipmentBom b) {
        if (b == null) return new EquipmentBomView(eq, null, null, null, List.of(), 0, 0, 0, 0, 0, 0);
        BomRevision rev = boms.revision0(b.revisionId());
        Bom modelBom = boms.bom(rev.bomId());
        List<EquipmentBom.Line> lines = repository.equipmentLines(b.id());
        Map<UUID, List<EquipmentBom.Line>> byParent = BomTrees.byParent(lines);
        Map<UUID, Optional<ItemQueryApi.ItemRef>> cache = new HashMap<>();
        List<LineView> out = new ArrayList<>();
        int[] counts = new int[3];
        walk(byParent, null, 0, true, out, cache, counts);
        BomCost.Total total = BomCost.total(BomTrees.equipmentNodes(byParent, null));
        return new EquipmentBomView(eq, b, modelBom, rev, out, total.cents(), total.pending(), trees.total(rev.id()).cents(),
                counts[0], counts[1], counts[2]);
    }

    private void walk(Map<UUID, List<EquipmentBom.Line>> byParent, UUID parentId, int depth, boolean parentActive, List<LineView> out,
                      Map<UUID, Optional<ItemQueryApi.ItemRef>> cache, int[] counts) {
        for (EquipmentBom.Line l : byParent.getOrDefault(parentId, List.of())) {
            BomCost.Total t = BomCost.line(BomTrees.equipmentNode(byParent, l));
            String state = !l.active() ? "REMOVED" : l.origin() == EquipmentBom.Origin.ADJUSTMENT ? "ADDED" : l.changed() ? "CHANGED" : "MODEL";
            if (state.equals("ADDED")) counts[0]++;
            else if (state.equals("REMOVED")) counts[1]++;
            else if (state.equals("CHANGED")) counts[2]++;
            String itemCode = l.itemId() == null ? null
                    : cache.computeIfAbsent(l.itemId(), items::item).map(ItemQueryApi.ItemRef::code).orElse(null);
            boolean missing = l.quantity() == null || (l.kind() == BomCost.Kind.ITEM && l.unitCost() == null);
            Long cents = !l.active() || !parentActive || missing ? null : t.cents();
            out.add(new LineView(l, depth, itemCode, cents, state));
            if (l.kind() == BomCost.Kind.SUBASSEMBLY) walk(byParent, l.id(), depth + 1, parentActive && l.active(), out, cache, counts);
        }
    }

    private ProjectQueryApi.EquipmentRef equipment(UUID id) {
        return projects.equipmentById(id).orElseThrow(() -> new NotFoundException("Equipamento não encontrado."));
    }

    private static EquipmentBom.Line with(EquipmentBom.Line l, BigDecimal qty, BigDecimal cost, EquipmentBom.LineStatus status, String reason) {
        return new EquipmentBom.Line(l.id(), l.equipmentBomId(), l.parentId(), l.position(), l.kind(), l.itemId(), l.childRevisionId(),
                l.referenceCode(), l.description(), qty, l.uom(), cost, l.category(), l.supplier(), l.material(), l.notes(), l.origin(),
                l.modelQuantity(), l.modelUnitCost(), status, reason);
    }

    private static void fail(List<FieldIssue> issues) {
        if (!issues.isEmpty()) throw new RuleViolationException("EQUIPMENT_BOM_INVALID", "Corrija os campos indicados.", issues);
    }

    private static boolean same(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    private static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }
}
