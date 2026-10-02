package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemProvisioningApi;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.Quantity;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import br.com.fourtech.rendamais.projetos.api.EquipmentModelApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * BOM do modelo e das submontagens (Sprint 10). Cada BOM tem um conteúdo só, editável a qualquer momento (decisão do PO
 * em 02/10/2026: sem revisões nem aprovação); o histórico fica na auditoria. A submontagem é outra BOM: mudar a
 * submontagem muda o custo de quem a usa. O custo é o digitado em cada linha. Os equipamentos guardam a cópia do
 * momento em que a BOM foi aplicada.
 */
@Service
public class BomService {

    static final String ENTITY = "bom";
    static final int MAX_LINES = 1000;
    static final String SUBASSEMBLY_UOM = "CJ";

    private final BomRepository repository;
    private final BomTrees trees;
    private final ItemQueryApi items;
    private final ItemProvisioningApi itemCatalog;
    private final EquipmentModelApi models;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public BomService(BomRepository repository, BomTrees trees, ItemQueryApi items, ItemProvisioningApi itemCatalog,
                      EquipmentModelApi models, AuditTrail audit, AuditQuery auditQuery, Outbox outbox, CommandReceipts receipts,
                      Clock clock) {
        this.repository = repository;
        this.trees = trees;
        this.items = items;
        this.itemCatalog = itemCatalog;
        this.models = models;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    // ───────────── Entradas ─────────────

    /** Linha informada; números como texto com ponto decimal ("2.5"), sem ponto flutuante (ADR-006). */
    public record LineData(String kind, String itemId, String childBomId, String referenceCode, String description,
                           String quantity, String uom, String unitCost, String category, String supplier, String material,
                           String notes) { }

    /** BOM inteira: total informado da origem (centavos, opcional), observações e linhas na ordem. */
    public record BomData(String informedTotalCents, String notes, List<LineData> lines) { }

    public record CreateRequest(String name, String modelId) { }

    // ───────────── Saídas ─────────────

    /** BLOCKING impede aplicar a BOM ao equipamento; WARNING e INFO só avisam. */
    public record Problem(String severity, Integer position, String message) { }

    public record LineView(BomLine line, String itemCode, boolean itemActive, UUID childBomId, String childBomCode, String childBomName,
                           Long lineCents, int pending, BigDecimal itemReferenceCost) { }

    public record CategoryTotal(String category, long cents, int lines) { }

    public record ParentRef(UUID bomId, String bomCode, String bomName) { }

    /** Nó da árvore de submontagens, para a árvore e o diagrama: quantidade no pai, total, pendências e linhas de item. */
    public record TreeNode(UUID bomId, String code, String name, BigDecimal quantity, long totalCents, int pending, int itemLines,
                           List<TreeNode> children) { }

    public record BomView(Bom bom, String modelCode, String modelName, BomRevision content, List<LineView> lines, long totalCents,
                          int pending, List<CategoryTotal> categories, List<Problem> problems, List<ParentRef> usedBy, TreeNode tree) { }

    public record BomSummary(Bom bom, String modelCode, String modelName, long totalCents, int pending, int lineCount,
                             Instant updatedAt, String updatedBy) { }

    // ───────────── Consultas ─────────────

    @Transactional(readOnly = true)
    public List<BomSummary> list(String search) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        List<BomSummary> out = new ArrayList<>();
        for (Bom b : repository.listBoms(search == null || search.isBlank() ? null : search.strip(), 500)) out.add(summary(b));
        return out;
    }

    @Transactional(readOnly = true)
    public BomView get(UUID bomId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        return view(bom(bomId));
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID bomId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        bom(bomId);
        return auditQuery.history(ENTITY, bomId.toString());
    }

    // ───────────── Comandos ─────────────

    /** CreateBom: BOM do modelo (uma por modelo) ou submontagem; nasce sem linhas. */
    @Transactional
    public BomView create(String idempotencyKey, CreateRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "CreateBom", r);
        if (done.isPresent()) return view(bom(UUID.fromString(done.get())));
        String name = Bom.validName(r == null ? null : r.name());
        UUID modelId = null;
        if (r != null && r.modelId() != null && !r.modelId().isBlank()) {
            EquipmentModelApi.ModelRef model = parseUuid(r.modelId(), "modelId").flatMap(models::model)
                    .orElseThrow(() -> invalid("BOM_INVALID", "modelId", "Modelo não encontrado."));
            if (!model.active()) throw invalid("BOM_INVALID", "modelId", "O modelo " + model.code() + " está inativo.");
            repository.findBomByModel(model.id()).ifPresent(b -> {
                throw invalid("BOM_DUPLICATE", "modelId", "O modelo já tem a BOM " + b.code() + " — " + b.name() + ".");
            });
            modelId = model.id();
        }
        Bom bom = createBom(name, modelId, clock.instant(), user.username(), null);
        receipts.complete(user.username(), key, bom.id().toString());
        return view(bom);
    }

    /** BOM nova com o conteúdo vazio (usada também pela carga do arquivo). */
    Bom createBom(String name, UUID modelId, Instant now, String actor, String reason) {
        repository.findBomByName(name).ifPresent(b -> {
            throw invalid("BOM_DUPLICATE", "name", "Já existe a BOM " + b.code() + " com este nome.");
        });
        Bom bom = Bom.create(repository.nextBomCode(), name, modelId, now, actor);
        repository.insert(bom);
        repository.insert(BomRevision.current(bom.id(), now, actor));
        record(actor, "BOM_CREATED", bom, reason, Map.of("code", change(null, bom.code()), "name", change(null, bom.name())));
        return bom;
    }

    /** UpdateBom com a versão lida (If-Match): troca as linhas, o total informado e as observações. */
    @Transactional
    public BomView save(UUID bomId, long expectedVersion, BomData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        Bom bom = bom(bomId);
        BomRevision current = repository.findRevisionForUpdate(contentId(bomId)).orElseThrow();
        if (current.version() != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        List<FieldIssue> issues = new ArrayList<>();
        Long informed = null;
        if (data != null && data.informedTotalCents() != null && !data.informedTotalCents().isBlank()) {
            try {
                informed = Money.parseCents(data.informedTotalCents().strip(), Currency.BRL).cents();
                if (informed < 0) issues.add(new FieldIssue("informedTotalCents", "Não pode ser negativo."));
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("informedTotalCents", "Valor em centavos inválido."));
            }
        }
        String notes = text(data == null ? null : data.notes());
        if (notes != null && notes.length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        List<BomLine> lines = validateLines(current.id(), bom, data == null || data.lines() == null ? List.of() : data.lines(), issues);
        if (!issues.isEmpty()) throw new RuleViolationException("BOM_INVALID", "Corrija os campos indicados.", issues);
        replaceContent(bom, current, lines, informed, notes, clock.instant(), user.username(), null);
        return view(bom);
    }

    /** Grava o conteúdo com auditoria e o evento BomUpdated (também usado pela carga do arquivo). */
    void replaceContent(Bom bom, BomRevision current, List<BomLine> lines, Long informed, String notes, Instant now, String actor,
                        String reason) {
        long before = trees.total(current.id()).cents();
        int linesBefore = repository.linesOf(current.id()).size();
        repository.replaceLines(current.id(), lines);
        BomRevision edited = current.edit(informed, notes, now, actor);
        repository.update(edited, current.version());
        long after = trees.total(current.id()).cents();
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        if (linesBefore != lines.size()) changes.put("lines", change(Integer.toString(linesBefore), Integer.toString(lines.size())));
        if (before != after) changes.put("totalCents", change(Long.toString(before), Long.toString(after)));
        if (!java.util.Objects.equals(current.informedTotalCents(), informed)) {
            changes.put("informedTotalCents", change(str(current.informedTotalCents()), str(informed)));
        }
        if (!java.util.Objects.equals(current.notes(), notes)) changes.put("notes", change(current.notes(), notes));
        if (changes.isEmpty()) changes.put("lines", change(Integer.toString(linesBefore), Integer.toString(lines.size())));
        record(actor, "BOM_UPDATED", bom, reason, changes);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bomId", bom.id().toString());
        payload.put("totalReferenceCents", Long.toString(after));
        outbox.append("BomUpdated", ENTITY, bom.id().toString(), payload, actor);
    }

    // ───────────── Validação das linhas ─────────────

    private List<BomLine> validateLines(UUID contentId, Bom bom, List<LineData> data, List<FieldIssue> issues) {
        if (data.size() > MAX_LINES) {
            issues.add(new FieldIssue("lines", "Máximo de " + MAX_LINES + " linhas."));
            return List.of();
        }
        List<BomLine> out = new ArrayList<>();
        Map<UUID, Set<UUID>> below = new HashMap<>();
        for (int i = 0; i < data.size(); i++) {
            LineData d = data.get(i);
            String f = "lines[" + i + "].";
            int before = issues.size();
            String kindRaw = d == null || d.kind() == null ? "ITEM" : d.kind().strip().toUpperCase(Locale.ROOT);
            BomCost.Kind kind;
            try {
                kind = BomCost.Kind.valueOf(kindRaw);
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue(f + "kind", "Tipo de linha inválido."));
                continue;
            }
            BigDecimal quantity = decimal(d.quantity(), f + "quantity", false, issues);
            String category = limited(d.category(), 100, f + "category", issues);
            String supplier = limited(d.supplier(), 120, f + "supplier", issues);
            String material = limited(d.material(), 120, f + "material", issues);
            String notes = limited(d.notes(), 500, f + "notes", issues);
            String ref = limited(d.referenceCode(), 60, f + "referenceCode", issues);
            if (kind == BomCost.Kind.ITEM) {
                UUID itemId = parseUuid(d.itemId(), null).orElse(null);
                ItemQueryApi.ItemRef item = itemId == null ? null : items.item(itemId).orElse(null);
                if (item == null) {
                    issues.add(new FieldIssue(f + "itemId", "Escolha o produto ou serviço."));
                    continue;
                }
                BigDecimal cost = decimal(d.unitCost(), f + "unitCost", true, issues);
                String description = limited(d.description(), 200, f + "description", issues);
                String uom = text(d.uom()) == null ? item.uom() : d.uom().strip().toUpperCase(Locale.ROOT);
                if (!itemCatalog.unitExists(uom)) issues.add(new FieldIssue(f + "uom", "Unidade " + uom + " não cadastrada."));
                if (issues.size() > before) continue;
                out.add(new BomLine(UUID.randomUUID(), contentId, i + 1, kind, item.id(), null, ref,
                        description == null ? item.description() : description, quantity, uom, cost, category, supplier, material, notes));
            } else {
                Bom child = parseUuid(d.childBomId(), null).flatMap(repository::findBom).orElse(null);
                if (child == null) {
                    issues.add(new FieldIssue(f + "childBomId", "Escolha a submontagem."));
                    continue;
                }
                if (child.id().equals(bom.id())) {
                    issues.add(new FieldIssue(f + "childBomId", "A BOM não pode ser submontagem dela mesma."));
                    continue;
                }
                if (child.isModelBom()) {
                    issues.add(new FieldIssue(f + "childBomId", "A BOM de um modelo não entra como submontagem."));
                    continue;
                }
                UUID childContent = contentId(child.id());
                if (below.computeIfAbsent(childContent, trees::bomsBelow).contains(bom.id())) {
                    throw new RuleViolationException("BOM_CYCLE", "A submontagem " + child.name() + " já usa a BOM " + bom.name()
                            + "; uma não pode conter a outra.", List.of(new FieldIssue(f + "childBomId", "Ciclo de submontagens.")));
                }
                if (issues.size() > before) continue;
                out.add(new BomLine(UUID.randomUUID(), contentId, i + 1, kind, null, childContent, ref == null ? child.code() : ref,
                        child.name(), quantity, SUBASSEMBLY_UOM, null, category, supplier, material, notes));
            }
        }
        return out;
    }

    // ───────────── Montagem das respostas ─────────────

    private BomSummary summary(Bom b) {
        BomRevision c = content(b.id());
        BomCost.Total t = trees.total(c.id());
        Optional<EquipmentModelApi.ModelRef> model = b.modelId() == null ? Optional.empty() : models.model(b.modelId());
        return new BomSummary(b, model.map(EquipmentModelApi.ModelRef::code).orElse(null), model.map(EquipmentModelApi.ModelRef::name)
                .orElse(null), t.cents(), t.pending(), repository.linesOf(c.id()).size(), c.updatedAt(), c.updatedBy());
    }

    BomView view(Bom b) {
        BomRevision c = content(b.id());
        List<LineView> lines = lineViews(c);
        BomCost.Total total = trees.total(c.id());
        Map<String, long[]> categories = new LinkedHashMap<>();
        for (LineView l : lines) {
            String cat = l.line().category() == null ? "Sem categoria" : l.line().category();
            long[] acc = categories.computeIfAbsent(cat, k -> new long[2]);
            acc[0] += l.lineCents() == null ? 0 : l.lineCents();
            acc[1]++;
        }
        List<CategoryTotal> cats = categories.entrySet().stream()
                .map(e -> new CategoryTotal(e.getKey(), e.getValue()[0], (int) e.getValue()[1])).toList();
        List<ParentRef> usedBy = new ArrayList<>();
        for (UUID parentId : repository.parentsOf(c.id())) {
            repository.findRevision(parentId).flatMap(p -> repository.findBom(p.bomId()))
                    .ifPresent(pb -> usedBy.add(new ParentRef(pb.id(), pb.code(), pb.name())));
        }
        usedBy.sort(Comparator.comparing(ParentRef::bomName));
        Optional<EquipmentModelApi.ModelRef> model = b.modelId() == null ? Optional.empty() : models.model(b.modelId());
        return new BomView(b, model.map(EquipmentModelApi.ModelRef::code).orElse(null),
                model.map(EquipmentModelApi.ModelRef::name).orElse(null), c, lines, total.cents(), total.pending(), cats,
                problems(lines, c, total), usedBy, tree(b, null, 0));
    }

    /** Árvore de submontagens a partir da BOM, com o total e as pendências de cada nó. */
    private TreeNode tree(Bom b, BigDecimal quantity, int depth) {
        BomRevision c = content(b.id());
        BomCost.Total t = trees.total(c.id());
        List<TreeNode> children = new ArrayList<>();
        int itemLines = 0;
        for (BomLine l : repository.linesOf(c.id())) {
            if (l.kind() == BomCost.Kind.ITEM) {
                itemLines++;
            } else if (depth < BomTrees.MAX_DEPTH) {
                repository.findRevision(l.childRevisionId()).flatMap(r -> repository.findBom(r.bomId()))
                        .ifPresent(child -> children.add(tree(child, l.quantity(), depth + 1)));
            }
        }
        return new TreeNode(b.id(), b.code(), b.name(), quantity, t.cents(), t.pending(), itemLines, children);
    }

    List<LineView> lineViews(BomRevision c) {
        List<BomLine> lines = repository.linesOf(c.id());
        List<BomCost.Total> totals = trees.lineTotals(c.id());
        Map<UUID, Optional<ItemQueryApi.ItemRef>> itemCache = new HashMap<>();
        List<LineView> out = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            BomLine l = lines.get(i);
            BomCost.Total t = totals.get(i);
            Long cents = t.pending() > 0 && (l.quantity() == null || (l.kind() == BomCost.Kind.ITEM && l.unitCost() == null))
                    ? null : t.cents();
            if (l.kind() == BomCost.Kind.ITEM) {
                Optional<ItemQueryApi.ItemRef> item = itemCache.computeIfAbsent(l.itemId(), items::item);
                out.add(new LineView(l, item.map(ItemQueryApi.ItemRef::code).orElse(null), item.map(ItemQueryApi.ItemRef::active)
                        .orElse(false), null, null, null, cents, t.pending(), item.map(ItemQueryApi.ItemRef::referenceCost).orElse(null)));
            } else {
                Bom child = repository.findRevision(l.childRevisionId()).flatMap(r -> repository.findBom(r.bomId())).orElseThrow();
                out.add(new LineView(l, null, true, child.id(), child.code(), child.name(), cents, t.pending(), null));
            }
        }
        return out;
    }

    private List<Problem> problems(List<LineView> lines, BomRevision c, BomCost.Total total) {
        List<Problem> out = new ArrayList<>();
        if (lines.isEmpty()) out.add(new Problem("BLOCKING", null, "A BOM não tem linhas."));
        for (LineView v : lines) {
            BomLine l = v.line();
            String where = "Linha " + l.position() + " — " + l.description();
            if (l.quantity() == null) out.add(new Problem("BLOCKING", l.position(), where + ": sem quantidade."));
            if (l.kind() == BomCost.Kind.ITEM) {
                if (l.unitCost() == null) out.add(new Problem("BLOCKING", l.position(), where + ": sem custo unitário."));
                if (!v.itemActive()) out.add(new Problem("WARNING", l.position(), where + ": o item " + v.itemCode() + " está inativo."));
                if (l.unitCost() != null && v.itemReferenceCost() != null && l.unitCost().compareTo(v.itemReferenceCost()) != 0) {
                    out.add(new Problem("WARNING", l.position(), where + ": custo da BOM " + brl(l.unitCost()) + " × cadastro "
                            + brl(v.itemReferenceCost()) + "."));
                }
            } else {
                int inside = v.pending() - (l.quantity() == null ? 1 : 0);
                if (inside > 0) {
                    out.add(new Problem("BLOCKING", l.position(), "Submontagem " + v.childBomName() + ": " + inside
                            + (inside == 1 ? " linha pendente." : " linhas pendentes.")));
                }
            }
        }
        if (c.informedTotalCents() != null && total.complete() && c.informedTotalCents() != total.cents()) {
            Money informed = Money.ofCents(c.informedTotalCents(), Currency.BRL);
            Money computed = Money.ofCents(total.cents(), Currency.BRL);
            out.add(new Problem("WARNING", null, "Total informado " + informed.toBrl() + " × soma das linhas " + computed.toBrl()
                    + ": diferença de " + computed.minus(informed).toBrl() + " (não corrigida)."));
        }
        return out;
    }

    // ───────────── Apoio ─────────────

    Bom bom(UUID id) {
        return repository.findBom(id).orElseThrow(() -> new NotFoundException("BOM não encontrada."));
    }

    /** O conteúdo (único) da BOM. */
    BomRevision content(UUID bomId) {
        return repository.currentOf(bomId).orElseThrow(() -> new NotFoundException("BOM sem conteúdo."));
    }

    UUID contentId(UUID bomId) {
        return content(bomId).id();
    }

    /** Última alteração no conteúdo ou em qualquer submontagem abaixo dele. */
    java.time.Instant lastChange(UUID contentId) {
        BomRevision c = repository.findRevision(contentId).orElseThrow();
        java.time.Instant last = c.updatedAt();
        for (BomLine l : repository.linesOf(contentId)) {
            if (l.childRevisionId() == null) continue;
            java.time.Instant child = lastChange(l.childRevisionId());
            if (child != null && (last == null || child.isAfter(last))) last = child;
        }
        return last;
    }

    void record(String actor, String action, Bom b, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(actor, action, ENTITY, b.id().toString(), b.version(), reason, new LinkedHashMap<>(changes),
                CorrelationId.current()));
    }

    static AuditEntry.Change change(String before, String after) {
        return new AuditEntry.Change(before, after);
    }

    static RuleViolationException invalid(String code, String field, String message) {
        return new RuleViolationException(code, message, List.of(new FieldIssue(field, message)));
    }

    static Optional<UUID> parseUuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return Optional.empty();
        try {
            return Optional.of(UUID.fromString(raw.strip()));
        } catch (IllegalArgumentException e) {
            if (field != null) throw invalid("BOM_INVALID", field, "Identificador inválido.");
            return Optional.empty();
        }
    }

    /** Número decimal com até 6 casas; vazio é aceito (pendência), negativo nunca; a quantidade precisa ser maior que zero. */
    static BigDecimal decimal(String raw, String field, boolean zeroAllowed, List<FieldIssue> issues) {
        String t = text(raw);
        if (t == null) return null;
        try {
            BigDecimal v = new BigDecimal(t.replace(',', '.')).stripTrailingZeros();
            if (v.scale() > Quantity.MAX_SCALE) {
                issues.add(new FieldIssue(field, "Máximo de " + Quantity.MAX_SCALE + " casas decimais."));
                return null;
            }
            if (v.signum() < 0 || (!zeroAllowed && v.signum() == 0)) {
                issues.add(new FieldIssue(field, zeroAllowed ? "Não pode ser negativo." : "Deve ser maior que zero."));
                return null;
            }
            if (v.precision() - v.scale() > 13) {
                issues.add(new FieldIssue(field, "Valor grande demais."));
                return null;
            }
            return v.scale() < 0 ? v.setScale(0) : v;
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, "Número inválido."));
            return null;
        }
    }

    static String limited(String raw, int max, String field, List<FieldIssue> issues) {
        String t = text(raw);
        if (t != null && t.length() > max) issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        return t;
    }

    static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    /** Custo unitário em reais, com 2 a 6 casas: R$ 145,00, R$ 0,333333. */
    static String brl(BigDecimal v) {
        BigDecimal s = v.stripTrailingZeros();
        if (s.scale() < 2) s = s.setScale(2);
        String[] p = s.toPlainString().split("\\.");
        StringBuilder inteiro = new StringBuilder(p[0]);
        for (int i = inteiro.length() - 3; i > 0; i -= 3) inteiro.insert(i, '.');
        return "R$ " + inteiro + "," + p[1];
    }

    private static String str(Long v) {
        return v == null ? null : v.toString();
    }
}
