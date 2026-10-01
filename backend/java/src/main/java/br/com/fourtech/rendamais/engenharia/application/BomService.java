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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * BOM do modelo e das submontagens (Sprint 10): cadastrar, editar o rascunho, aprovar (com as submontagens em rascunho
 * abaixo dela), criar revisão nova e comparar revisões. A revisão aprovada não muda; o custo é o digitado em cada linha.
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

    /** Linha informada no rascunho; números como texto com ponto decimal ("2.5"), sem ponto flutuante (ADR-006). */
    public record LineData(String kind, String itemId, String childRevisionId, String referenceCode, String description,
                           String quantity, String uom, String unitCost, String category, String supplier, String material,
                           String notes) { }

    /** Rascunho inteiro: total informado da origem (centavos, opcional), observações e linhas na ordem. */
    public record DraftData(String informedTotalCents, String notes, List<LineData> lines) { }

    public record CreateRequest(String name, String modelId) { }

    // ───────────── Saídas ─────────────

    public record Problem(String severity, Integer position, String message) { }

    public record LineView(BomLine line, String itemCode, boolean itemActive, UUID childBomId, String childBomCode, String childBomName,
                           String childRevisionLabel, String childRevisionStatus, Long lineCents, int pending) { }

    public record CategoryTotal(String category, long cents, int lines) { }

    public record ParentRef(UUID bomId, String bomName, UUID revisionId, String revisionLabel, String status) { }

    public record RevisionView(Bom bom, String modelCode, String modelName, BomRevision revision, List<LineView> lines,
                               long totalCents, int pending, List<CategoryTotal> categories, List<Problem> problems,
                               List<ParentRef> usedBy, List<RevisionRef> revisions) { }

    public record RevisionRef(UUID id, String label, String status, long totalCents, int pending, Instant approvedAt, String approvedBy) { }

    public record BomSummary(Bom bom, String modelCode, String modelName, RevisionRef approved, RevisionRef draft, int revisionCount) { }

    public record ComparisonRow(String status, String kind, String referenceCode, String description, String before, String after,
                                BigDecimal quantityBefore, BigDecimal quantityAfter, BigDecimal unitCostBefore, BigDecimal unitCostAfter,
                                Long centsBefore, Long centsAfter, UUID childRevisionBefore, UUID childRevisionAfter) { }

    public record Comparison(RevisionRef from, RevisionRef to, Bom bom, long totalBefore, long totalAfter, List<ComparisonRow> rows) { }

    // ───────────── Consultas ─────────────

    @Transactional(readOnly = true)
    public List<BomSummary> list(String search) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        List<BomSummary> out = new ArrayList<>();
        for (Bom b : repository.listBoms(search == null || search.isBlank() ? null : search.strip(), 500)) out.add(summary(b));
        return out;
    }

    @Transactional(readOnly = true)
    public BomSummary get(UUID id) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        return summary(bom(id));
    }

    @Transactional(readOnly = true)
    public RevisionView revision(UUID revisionId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        return view(revision0(revisionId));
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID bomId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        bom(bomId);
        return auditQuery.history(ENTITY, bomId.toString());
    }

    // ───────────── Comandos ─────────────

    /** CreateBom: BOM do modelo (um por modelo) ou submontagem; nasce com a revisão 00 em rascunho, sem linhas. */
    @Transactional
    public BomSummary create(String idempotencyKey, CreateRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "CreateBom", r);
        if (done.isPresent()) return summary(bom(UUID.fromString(done.get())));
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
        repository.findBomByName(name).ifPresent(b -> {
            throw invalid("BOM_DUPLICATE", "name", "Já existe a BOM " + b.code() + " com este nome.");
        });
        Instant now = clock.instant();
        Bom bom = Bom.create(repository.nextBomCode(), name, modelId, now, user.username());
        repository.insert(bom);
        BomRevision draft = BomRevision.draft(bom.id(), 0, null, null, null, null, now, user.username());
        repository.insert(draft);
        record(user.username(), "BOM_CREATED", bom, null, Map.of("code", change(null, bom.code()), "name", change(null, bom.name()),
                "revision", change(null, draft.label())));
        receipts.complete(user.username(), key, bom.id().toString());
        return summary(bom);
    }

    /** UpdateBomDraft com a versão lida (If-Match): troca as linhas e o total informado do rascunho. */
    @Transactional
    public RevisionView saveDraft(UUID revisionId, long expectedVersion, DraftData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        BomRevision current = repository.findRevisionForUpdate(revisionId).orElseThrow(BomService::revisionNotFound);
        current.requireDraft();
        if (current.version() != expectedVersion) throw new VersionConflictException("bom_revision", expectedVersion, current.version());
        Bom bom = bom(current.bomId());
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
        List<BomLine> lines = validateLines(revisionId, bom, data == null || data.lines() == null ? List.of() : data.lines(), issues);
        if (!issues.isEmpty()) throw new RuleViolationException("BOM_INVALID", "Corrija os campos indicados.", issues);

        long before = trees.total(revisionId).cents();
        int linesBefore = repository.linesOf(revisionId).size();
        repository.replaceLines(revisionId, lines);
        BomRevision edited = current.edit(informed, notes, clock.instant(), user.username());
        repository.update(edited, expectedVersion);
        long after = trees.total(revisionId).cents();
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("revision", change(edited.label(), edited.label()));
        if (linesBefore != lines.size()) changes.put("lines", change(Integer.toString(linesBefore), Integer.toString(lines.size())));
        if (before != after) changes.put("totalCents", change(Long.toString(before), Long.toString(after)));
        if (!java.util.Objects.equals(current.informedTotalCents(), informed)) {
            changes.put("informedTotalCents", change(str(current.informedTotalCents()), str(informed)));
        }
        record(user.username(), "BOM_DRAFT_UPDATED", bom, null, changes);
        return view(edited);
    }

    /**
     * ApproveBomRevision: aprova o rascunho e as submontagens em rascunho abaixo dele, numa transação. Recusa enquanto
     * houver pendência (linha sem quantidade ou sem custo). A revisão aprovada antes, da mesma BOM, fica substituída.
     * Aprovar de novo devolve a mesma revisão.
     */
    @Transactional
    public RevisionView approve(UUID revisionId) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_APPROVE);
        BomRevision target = repository.findRevisionForUpdate(revisionId).orElseThrow(BomService::revisionNotFound);
        if (target.status() != BomRevision.Status.DRAFT) return view(target);
        List<BomRevision> drafts = new ArrayList<>();
        drafts.add(target);
        for (UUID d : trees.descendants(revisionId)) {
            BomRevision r = repository.findRevisionForUpdate(d).orElseThrow();
            if (r.status() == BomRevision.Status.DRAFT) drafts.add(r);
        }
        List<FieldIssue> blocking = new ArrayList<>();
        for (BomRevision r : drafts) {
            Bom b = bom(r.bomId());
            for (Problem p : problems(r, linesOf(r), trees.total(r.id()))) {
                if ("BLOCKING".equals(p.severity())) blocking.add(new FieldIssue(b.name() + " rev. " + r.label(), p.message()));
            }
        }
        if (!blocking.isEmpty()) {
            throw new RuleViolationException("BOM_INCOMPLETE", "A revisão tem pendências; resolva antes de aprovar.", blocking);
        }
        Instant now = clock.instant();
        // As submontagens primeiro, para o evento da BOM de cima sair com tudo aprovado.
        List<BomRevision> ordered = new ArrayList<>(drafts.subList(1, drafts.size()));
        ordered.add(target);
        for (BomRevision r : ordered) {
            Optional<BomRevision> previous = repository.approvedOf(r.bomId());
            previous.ifPresent(p -> repository.update(p.supersede(now, user.username()), p.version()));
            BomRevision approved = r.approve(now, user.username());
            repository.update(approved, r.version());
            Bom b = bom(r.bomId());
            long total = trees.total(r.id()).cents();
            Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
            changes.put("revision", change(null, approved.label()));
            changes.put("status", change(r.status().name(), approved.status().name()));
            changes.put("totalCents", change(null, Long.toString(total)));
            previous.ifPresent(p -> changes.put("superseded", change(p.label(), BomRevision.Status.SUPERSEDED.name())));
            record(user.username(), "BOM_REVISION_APPROVED", b, r == target ? null : "Aprovada com a revisão que a usa", changes);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("bomId", b.id().toString());
            payload.put("revisionId", approved.id().toString());
            payload.put("revision", approved.revision());
            payload.put("totalReferenceCents", Long.toString(total));
            outbox.append("BomRevisionApproved", ENTITY, b.id().toString(), payload, user.username());
        }
        return view(repository.findRevision(revisionId).orElseThrow());
    }

    /** CreateBomRevision: rascunho novo a partir da última revisão (cópia das linhas); só um rascunho por BOM. */
    @Transactional
    public RevisionView newRevision(String idempotencyKey, UUID bomId) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "CreateBomRevision", bomId.toString());
        if (done.isPresent()) return view(revision0(UUID.fromString(done.get())));
        Bom bom = bom(bomId);
        repository.draftOf(bomId).ifPresent(d -> {
            throw new RuleViolationException("BOM_DRAFT_EXISTS", "A BOM já tem a revisão " + d.label()
                    + " em rascunho; aprove ou continue editando essa revisão.", List.of());
        });
        BomRevision base = repository.approvedOf(bomId).or(() -> repository.revisionsOf(bomId).stream().findFirst())
                .orElse(null);
        Instant now = clock.instant();
        BomRevision draft = BomRevision.draft(bomId, repository.nextRevisionNumber(bomId), base == null ? null : base.id(),
                base == null ? null : base.informedTotalCents(), null, null, now, user.username());
        repository.insert(draft);
        if (base != null) {
            List<BomLine> copy = new ArrayList<>();
            for (BomLine l : repository.linesOf(base.id())) {
                copy.add(new BomLine(UUID.randomUUID(), draft.id(), l.position(), l.kind(), l.itemId(), l.childRevisionId(),
                        l.referenceCode(), l.description(), l.quantity(), l.uom(), l.unitCost(), l.category(), l.supplier(),
                        l.material(), l.notes()));
            }
            repository.replaceLines(draft.id(), copy);
        }
        record(user.username(), "BOM_REVISION_CREATED", bom, null, Map.of("revision", change(null, draft.label()),
                "basedOn", change(null, base == null ? null : base.label())));
        receipts.complete(user.username(), key, draft.id().toString());
        return view(draft);
    }

    /** Comparação das linhas de primeiro nível; a submontagem conta como alterada quando muda a revisão ou a quantidade. */
    @Transactional(readOnly = true)
    public Comparison compare(UUID fromId, UUID toId) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        BomRevision from = revision0(fromId);
        BomRevision to = revision0(toId);
        List<LineView> a = lineViews(from);
        List<LineView> b = lineViews(to);
        Map<String, LineView> left = keyed(a);
        Map<String, LineView> right = keyed(b);
        List<ComparisonRow> rows = new ArrayList<>();
        for (Map.Entry<String, LineView> e : left.entrySet()) {
            LineView before = e.getValue();
            LineView after = right.get(e.getKey());
            if (after == null) rows.add(row("REMOVED", before, null));
            else if (differs(before, after)) rows.add(row("CHANGED", before, after));
        }
        for (Map.Entry<String, LineView> e : right.entrySet()) {
            if (!left.containsKey(e.getKey())) rows.add(row("ADDED", null, e.getValue()));
        }
        return new Comparison(ref(from), ref(to), bom(to.bomId()), trees.total(fromId).cents(), trees.total(toId).cents(), rows);
    }

    // ───────────── Validação das linhas ─────────────

    private List<BomLine> validateLines(UUID revisionId, Bom bom, List<LineData> data, List<FieldIssue> issues) {
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
            String kindRaw = d == null || d.kind() == null ? "ITEM" : d.kind().strip().toUpperCase(java.util.Locale.ROOT);
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
                String uom = text(d.uom()) == null ? item.uom() : d.uom().strip().toUpperCase(java.util.Locale.ROOT);
                if (!itemCatalog.unitExists(uom)) issues.add(new FieldIssue(f + "uom", "Unidade " + uom + " não cadastrada."));
                if (issues.size() > before) continue;
                out.add(new BomLine(UUID.randomUUID(), revisionId, i + 1, kind, item.id(), null, ref,
                        description == null ? item.description() : description, quantity, uom, cost, category, supplier, material, notes));
            } else {
                UUID childId = parseUuid(d.childRevisionId(), null).orElse(null);
                BomRevision child = childId == null ? null : repository.findRevision(childId).orElse(null);
                if (child == null) {
                    issues.add(new FieldIssue(f + "childRevisionId", "Escolha a revisão da submontagem."));
                    continue;
                }
                Bom childBom = bom(child.bomId());
                if (childBom.id().equals(bom.id())) {
                    issues.add(new FieldIssue(f + "childRevisionId", "A BOM não pode ser submontagem dela mesma."));
                    continue;
                }
                if (childBom.isModelBom()) {
                    issues.add(new FieldIssue(f + "childRevisionId", "A BOM de um modelo não entra como submontagem."));
                    continue;
                }
                if (below.computeIfAbsent(childId, trees::bomsBelow).contains(bom.id())) {
                    throw new RuleViolationException("BOM_CYCLE", "A submontagem " + childBom.name() + " já usa a BOM " + bom.name()
                            + "; uma não pode conter a outra.", List.of(new FieldIssue(f + "childRevisionId", "Ciclo de submontagens.")));
                }
                if (issues.size() > before) continue;
                out.add(new BomLine(UUID.randomUUID(), revisionId, i + 1, kind, null, childId, ref == null ? childBom.code() : ref,
                        childBom.name(), quantity, SUBASSEMBLY_UOM, null, category, supplier, material, notes));
            }
        }
        return out;
    }

    // ───────────── Montagem das respostas ─────────────

    private BomSummary summary(Bom b) {
        List<BomRevision> revisions = repository.revisionsOf(b.id());
        RevisionRef approved = revisions.stream().filter(r -> r.status() == BomRevision.Status.APPROVED).findFirst().map(this::ref)
                .orElse(null);
        RevisionRef draft = revisions.stream().filter(r -> r.status() == BomRevision.Status.DRAFT).findFirst().map(this::ref)
                .orElse(null);
        Optional<EquipmentModelApi.ModelRef> model = b.modelId() == null ? Optional.empty() : models.model(b.modelId());
        return new BomSummary(b, model.map(EquipmentModelApi.ModelRef::code).orElse(null),
                model.map(EquipmentModelApi.ModelRef::name).orElse(null), approved, draft, revisions.size());
    }

    RevisionRef ref(BomRevision r) {
        BomCost.Total t = trees.total(r.id());
        return new RevisionRef(r.id(), r.label(), r.status().name(), t.cents(), t.pending(), r.approvedAt(), r.approvedBy());
    }

    private RevisionView view(BomRevision r) {
        Bom b = bom(r.bomId());
        List<LineView> lines = lineViews(r);
        BomCost.Total total = trees.total(r.id());
        Map<String, long[]> categories = new LinkedHashMap<>();
        for (LineView l : lines) {
            String c = l.line().category() == null ? "Sem categoria" : l.line().category();
            long[] acc = categories.computeIfAbsent(c, k -> new long[2]);
            acc[0] += l.lineCents() == null ? 0 : l.lineCents();
            acc[1]++;
        }
        List<CategoryTotal> cats = categories.entrySet().stream()
                .map(e -> new CategoryTotal(e.getKey(), e.getValue()[0], (int) e.getValue()[1])).toList();
        List<ParentRef> usedBy = new ArrayList<>();
        for (UUID parentId : repository.parentsOf(r.id())) {
            repository.findRevision(parentId).ifPresent(p -> {
                Bom pb = bom(p.bomId());
                usedBy.add(new ParentRef(pb.id(), pb.name(), p.id(), p.label(), p.status().name()));
            });
        }
        usedBy.sort(Comparator.comparing(ParentRef::bomName).thenComparing(ParentRef::revisionLabel));
        Optional<EquipmentModelApi.ModelRef> model = b.modelId() == null ? Optional.empty() : models.model(b.modelId());
        List<RevisionRef> revisions = repository.revisionsOf(b.id()).stream().map(this::ref).toList();
        return new RevisionView(b, model.map(EquipmentModelApi.ModelRef::code).orElse(null),
                model.map(EquipmentModelApi.ModelRef::name).orElse(null), r, lines, total.cents(), total.pending(), cats,
                problems(r, lines, total), usedBy, revisions);
    }

    private List<LineView> linesOf(BomRevision r) {
        return lineViews(r);
    }

    List<LineView> lineViews(BomRevision r) {
        List<BomLine> lines = repository.linesOf(r.id());
        List<BomCost.Total> totals = trees.lineTotals(r.id());
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
                        .orElse(false), null, null, null, null, null, cents, t.pending()));
            } else {
                BomRevision child = repository.findRevision(l.childRevisionId()).orElseThrow();
                Bom childBom = bom(child.bomId());
                out.add(new LineView(l, null, true, childBom.id(), childBom.code(), childBom.name(), child.label(),
                        child.status().name(), cents, t.pending()));
            }
        }
        return out;
    }

    private List<Problem> problems(BomRevision r, List<LineView> lines, BomCost.Total total) {
        List<Problem> out = new ArrayList<>();
        if (lines.isEmpty()) out.add(new Problem("BLOCKING", null, "A revisão não tem linhas."));
        for (LineView v : lines) {
            BomLine l = v.line();
            String where = "Linha " + l.position() + " — " + l.description();
            if (l.quantity() == null) out.add(new Problem("BLOCKING", l.position(), where + ": sem quantidade."));
            if (l.kind() == BomCost.Kind.ITEM) {
                if (l.unitCost() == null) out.add(new Problem("BLOCKING", l.position(), where + ": sem custo unitário."));
                if (!v.itemActive()) out.add(new Problem("WARNING", l.position(), where + ": o item " + v.itemCode() + " está inativo."));
            } else {
                int inside = v.pending() - (l.quantity() == null ? 1 : 0);
                if (inside > 0) {
                    out.add(new Problem("BLOCKING", l.position(), "Submontagem " + v.childBomName() + " rev. " + v.childRevisionLabel()
                            + ": " + inside + (inside == 1 ? " linha pendente." : " linhas pendentes.")));
                }
                if ("DRAFT".equals(v.childRevisionStatus()) && r.status() == BomRevision.Status.DRAFT) {
                    out.add(new Problem("INFO", l.position(), "Submontagem " + v.childBomName() + " rev. " + v.childRevisionLabel()
                            + " em rascunho: é aprovada junto com esta revisão."));
                }
            }
        }
        if (r.informedTotalCents() != null && total.complete() && r.informedTotalCents() != total.cents()) {
            Money informed = Money.ofCents(r.informedTotalCents(), Currency.BRL);
            Money computed = Money.ofCents(total.cents(), Currency.BRL);
            out.add(new Problem("WARNING", null, "Total informado " + informed.toBrl() + " × soma das linhas " + computed.toBrl()
                    + ": diferença de " + computed.minus(informed).toBrl() + " (não corrigida)."));
        }
        return out;
    }

    private static Map<String, LineView> keyed(List<LineView> lines) {
        Map<String, LineView> out = new LinkedHashMap<>();
        Map<String, Integer> seen = new HashMap<>();
        for (LineView v : lines) {
            String base = v.line().kind() == BomCost.Kind.ITEM
                    ? "I:" + v.line().itemId() + ":" + v.line().description().toLowerCase(java.util.Locale.ROOT)
                    : "S:" + v.childBomId();
            int n = seen.merge(base, 1, Integer::sum);
            out.put(base + "#" + n, v);
        }
        return out;
    }

    private static boolean differs(LineView a, LineView b) {
        return !eq(a.line().quantity(), b.line().quantity()) || !eq(a.line().unitCost(), b.line().unitCost())
                || !java.util.Objects.equals(a.line().childRevisionId(), b.line().childRevisionId())
                || !java.util.Objects.equals(a.lineCents(), b.lineCents());
    }

    private static ComparisonRow row(String status, LineView before, LineView after) {
        LineView any = after == null ? before : after;
        return new ComparisonRow(status, any.line().kind().name(), any.line().referenceCode(), any.line().description(),
                before == null ? null : before.childRevisionLabel(), after == null ? null : after.childRevisionLabel(),
                before == null ? null : before.line().quantity(), after == null ? null : after.line().quantity(),
                before == null ? null : before.line().unitCost(), after == null ? null : after.line().unitCost(),
                before == null ? null : before.lineCents(), after == null ? null : after.lineCents(),
                before == null ? null : before.line().childRevisionId(), after == null ? null : after.line().childRevisionId());
    }

    // ───────────── Apoio ─────────────

    Bom bom(UUID id) {
        return repository.findBom(id).orElseThrow(() -> new NotFoundException("BOM não encontrada."));
    }

    BomRevision revision0(UUID id) {
        return repository.findRevision(id).orElseThrow(BomService::revisionNotFound);
    }

    void record(String actor, String action, Bom b, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(actor, action, ENTITY, b.id().toString(), b.version(), reason, new LinkedHashMap<>(changes),
                CorrelationId.current()));
    }

    static AuditEntry.Change change(String before, String after) {
        return new AuditEntry.Change(before, after);
    }

    static NotFoundException revisionNotFound() {
        return new NotFoundException("Revisão da BOM não encontrada.");
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

    private static String str(Long v) {
        return v == null ? null : v.toString();
    }

    private static boolean eq(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }
}
