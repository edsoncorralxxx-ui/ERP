package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.cadastros.api.ItemProvisioningApi;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.projetos.api.EquipmentModelApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Carga da BOM a partir do arquivo JSON da engenharia (Sprint 10, formato do exemplo
 * {@code docs/scrum/sprints/exemplos/bom-balanca-hidrostatica-rev00.json}). Primeiro a prévia: linhas, totais e
 * problemas da origem, sem gravar nada além do arquivo. Depois a confirmação, numa transação: o modelo, a BOM do
 * modelo, as submontagens (cada bloco "bom_*" e as categorias de painel) com a revisão em rascunho, e os itens que ainda
 * não existem, com o código de referência da origem ou um gerado (MEC-0001, ELE-0001). Nada é corrigido sozinho; o mesmo
 * arquivo (pelo hash) não carrega duas vezes.
 */
@Service
public class BomImportService {

    static final int MAX_CONTENT = 2_000_000;
    private static final String DEFAULT_UOM = "UN";
    private static final Map<String, String> UOM_ALIASES = Map.of("UND", "UN", "UNID", "UN", "PC", "PC");
    private static final Map<String, String> UOM_NAMES = Map.of("SRV", "Serviço", "CT", "Cento");
    private static final Map<String, String> GROUP_NAMES = Map.of("mecanica", "Mecânica", "eletrica", "Elétrica");

    private final BomRepository repository;
    private final BomService boms;
    private final ItemProvisioningApi itemCatalog;
    private final EquipmentModelApi models;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final JsonMapper json;
    private final Clock clock;

    public BomImportService(BomRepository repository, BomService boms, ItemProvisioningApi itemCatalog, EquipmentModelApi models,
                            Outbox outbox, CommandReceipts receipts, JsonMapper json, Clock clock) {
        this.repository = repository;
        this.boms = boms;
        this.itemCatalog = itemCatalog;
        this.models = models;
        this.outbox = outbox;
        this.receipts = receipts;
        this.json = json;
        this.clock = clock;
    }

    public record ImportRequest(String fileName, String content) { }

    public record PreviewLine(String group, String category, int sourceNo, String referenceCode, boolean generatedCode,
                              String description, BigDecimal quantity, String uom, BigDecimal unitCost, Long lineCents,
                              String itemCode, boolean newItem, String supplier, String material) { }

    /** Submontagem que a carga cria: o nome, onde entra ({@code parent}), linhas, soma e o total informado no arquivo. */
    public record PreviewGroup(String name, String parent, int lines, long totalCents, int pending, Long informedCents) { }

    public record Preview(BomRepository.BomImport bomImport, String product, String revisionLabel, String revisionDate, int lineCount,
                          long totalCents, int pending, Long informedTotalCents, List<PreviewGroup> groups,
                          List<BomService.Problem> problems, int newItems, int existingItems, List<String> newUnits,
                          List<String> newCategories, List<String> fileNotes, List<PreviewLine> lines, UUID revisionId, UUID bomId) { }

    // ───────────── Comandos ─────────────

    /** Envia o arquivo e devolve a prévia. O mesmo arquivo devolve a mesma carga (confirmada ou não). */
    @Transactional
    public Preview upload(ImportRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String content = r == null || r.content() == null ? "" : r.content();
        if (content.isBlank()) throw BomService.invalid("BOM_IMPORT_INVALID", "content", "Escolha o arquivo da BOM.");
        if (content.length() > MAX_CONTENT) throw BomService.invalid("BOM_IMPORT_INVALID", "content", "Arquivo grande demais (máximo de 2 MB).");
        String fileName = BomService.text(r.fileName()) == null ? "bom.json" : r.fileName().strip();
        if (fileName.length() > 200) fileName = fileName.substring(fileName.length() - 200);
        Parsed parsed = parse(content);
        String hash = sha256(content);
        Optional<BomRepository.BomImport> existing = repository.findImportByHash(hash);
        if (existing.isEmpty()) {
            repository.insert(new BomRepository.BomImport(UUID.randomUUID(), fileName, hash, content, parsed.product, "PREVIEW", null,
                    clock.instant(), user.username(), null, null));
        }
        return preview(repository.findImportByHash(hash).orElseThrow(), parsed);
    }

    @Transactional(readOnly = true)
    public Preview get(UUID id) {
        CurrentUserHolder.require(Permissions.BOM_READ);
        BomRepository.BomImport i = repository.findImport(id).orElseThrow(BomImportService::notFound);
        return preview(i, parse(i.content()));
    }

    /**
     * ImportBom: grava a carga numa transação. Confirmar de novo devolve a mesma carga. Recusa quando uma das BOMs já
     * tem revisão em rascunho (uma por BOM).
     */
    @Transactional
    public Preview confirm(String idempotencyKey, UUID id) {
        CurrentUser user = CurrentUserHolder.require(Permissions.BOM_UPDATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        receipts.claim(user.username(), key, "ImportBom", id.toString());
        BomRepository.BomImport imp = repository.findImportForUpdate(id).orElseThrow(BomImportService::notFound);
        Parsed parsed = parse(imp.content());
        if ("CONFIRMED".equals(imp.status())) {
            receipts.complete(user.username(), key, imp.id().toString());
            return preview(imp, parsed);
        }
        Instant now = clock.instant();
        EquipmentModelApi.ModelRef model = models.provisionModel(parsed.product);
        Bom modelBom = repository.findBomByModel(model.id()).orElseGet(() -> createBom(parsed.product, model.id(), now, user.username()));

        // Submontagens: cada bloco do arquivo; dentro dele, as categorias de painel viram submontagem própria.
        Map<String, Integer> generated = new HashMap<>();
        List<BomLine> modelLines = new ArrayList<>();
        int position = 1;
        for (Group g : parsed.groups) {
            Bom groupBom = findOrCreate(g.name + " — " + parsed.product, now, user.username());
            BomRevision groupRev = newDraft(groupBom, parsed.revision, g.informed, imp.id(), now, user.username());
            List<BomLine> lines = new ArrayList<>();
            int p = 1;
            for (Category c : g.categories) {
                if (c.subassembly) {
                    Bom subBom = findOrCreate(sentence(c.name) + " — " + parsed.product, now, user.username());
                    BomRevision subRev = newDraft(subBom, parsed.revision, c.subtotal, imp.id(), now, user.username());
                    List<BomLine> subLines = new ArrayList<>();
                    int sp = 1;
                    for (Line l : c.lines) subLines.add(itemLine(subRev.id(), sp++, g, c, l, generated));
                    repository.replaceLines(subRev.id(), subLines);
                    lines.add(new BomLine(UUID.randomUUID(), groupRev.id(), p++, BomCost.Kind.SUBASSEMBLY, null, subRev.id(), subBom.code(),
                            subBom.name(), BigDecimal.ONE, BomService.SUBASSEMBLY_UOM, null, sentence(c.name), null, null, null));
                } else {
                    for (Line l : c.lines) lines.add(itemLine(groupRev.id(), p++, g, c, l, generated));
                }
            }
            repository.replaceLines(groupRev.id(), lines);
            modelLines.add(new BomLine(UUID.randomUUID(), null, position++, BomCost.Kind.SUBASSEMBLY, null, groupRev.id(), groupBom.code(),
                    groupBom.name(), BigDecimal.ONE, BomService.SUBASSEMBLY_UOM, null, g.name, null, null, null));
        }
        BomRevision modelRev = newDraft(modelBom, parsed.revision, parsed.informedTotal, imp.id(), now, user.username());
        repository.replaceLines(modelRev.id(), modelLines.stream().map(l -> new BomLine(l.id(), modelRev.id(), l.position(), l.kind(),
                l.itemId(), l.childRevisionId(), l.referenceCode(), l.description(), l.quantity(), l.uom(), l.unitCost(), l.category(),
                l.supplier(), l.material(), l.notes())).toList());
        repository.confirm(imp.id(), modelRev.id(), now, user.username());

        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("file", BomService.change(null, imp.fileName()));
        changes.put("revision", BomService.change(null, modelRev.label()));
        changes.put("lines", BomService.change(null, Integer.toString(parsed.lineCount())));
        boms.record(user.username(), "BOM_IMPORTED", modelBom, null, changes);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("importId", imp.id().toString());
        payload.put("bomId", modelBom.id().toString());
        payload.put("revisionId", modelRev.id().toString());
        payload.put("modelId", model.id().toString());
        payload.put("lines", parsed.lineCount());
        outbox.append("BomImported", BomService.ENTITY, modelBom.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, imp.id().toString());
        return preview(repository.findImport(imp.id()).orElseThrow(), parsed);
    }

    // ───────────── Gravação ─────────────

    private Bom createBom(String name, UUID modelId, Instant now, String actor) {
        repository.findBomByName(name).ifPresent(b -> {
            throw new RuleViolationException("BOM_DUPLICATE", "Já existe a BOM " + b.code() + " — " + b.name()
                    + " sem ser a do modelo; renomeie-a antes de carregar o arquivo.", List.of());
        });
        Bom bom = Bom.create(repository.nextBomCode(), name, modelId, now, actor);
        repository.insert(bom);
        boms.record(actor, "BOM_CREATED", bom, "Carga da BOM", Map.of("code", BomService.change(null, bom.code()),
                "name", BomService.change(null, bom.name())));
        return bom;
    }

    private Bom findOrCreate(String name, Instant now, String actor) {
        Optional<Bom> found = repository.findBomByName(name);
        if (found.isPresent()) {
            if (found.get().isModelBom()) {
                throw new RuleViolationException("BOM_DUPLICATE", "O nome " + name + " já é de uma BOM de modelo.", List.of());
            }
            return found.get();
        }
        return createBom(name, null, now, actor);
    }

    private BomRevision newDraft(Bom bom, Integer preferred, BigDecimal informed, UUID importId, Instant now, String actor) {
        repository.draftOf(bom.id()).ifPresent(d -> {
            throw new RuleViolationException("BOM_DRAFT_EXISTS", "A BOM " + bom.name() + " já tem a revisão " + d.label()
                    + " em rascunho; aprove-a antes de carregar outro arquivo.", List.of());
        });
        int next = repository.nextRevisionNumber(bom.id());
        int number = preferred != null && preferred >= next ? preferred : next;
        UUID basedOn = repository.approvedOf(bom.id()).map(BomRevision::id).orElse(null);
        BomRevision rev = BomRevision.draft(bom.id(), number, basedOn, informed == null ? null : cents(informed), null, importId, now, actor);
        repository.insert(rev);
        boms.record(actor, "BOM_REVISION_CREATED", bom, "Carga da BOM", Map.of("revision", BomService.change(null, rev.label())));
        return rev;
    }

    private BomLine itemLine(UUID revisionId, int position, Group g, Category c, Line l, Map<String, Integer> generated) {
        String ref = l.code;
        if (ref == null) {
            Optional<ItemQueryApi.ItemRef> byDescription = itemCatalog.itemByDescription(l.description, l.nature());
            if (byDescription.isPresent()) {
                ref = itemCatalog.referenceCodeOf(byDescription.get().id()).orElse(null);
                return line(revisionId, position, byDescription.get().id(), ref, g, c, l);
            }
            int n = generated.computeIfAbsent(g.prefix, itemCatalog::lastGeneratedNumber) + 1;
            generated.put(g.prefix, n);
            ref = String.format("%s-%04d", g.prefix, n);
        }
        ItemProvisioningApi.ProvisionedItem item = itemCatalog.provision(new ItemProvisioningApi.ItemRequest(ref, l.description,
                l.nature(), l.uom, UOM_NAMES.get(l.uom), sentence(c.name)));
        return line(revisionId, position, item.id(), ref, g, c, l);
    }

    private static BomLine line(UUID revisionId, int position, UUID itemId, String ref, Group g, Category c, Line l) {
        return new BomLine(UUID.randomUUID(), revisionId, position, BomCost.Kind.ITEM, itemId, null, ref, l.description, l.quantity, l.uom,
                l.unitCost, sentence(c.name), l.supplier, l.material, null);
    }

    // ───────────── Prévia ─────────────

    private Preview preview(BomRepository.BomImport imp, Parsed parsed) {
        List<BomService.Problem> problems = new ArrayList<>(parsed.problems);
        List<PreviewLine> lines = new ArrayList<>();
        List<PreviewGroup> groups = new ArrayList<>();
        Set<String> newUnits = new LinkedHashSet<>();
        Set<String> newCategories = new LinkedHashSet<>();
        Map<String, Integer> generated = new HashMap<>();
        Map<String, String> generatedByDescription = new HashMap<>();
        Set<String> refsInFile = new java.util.HashSet<>();
        int newItems = 0;
        int existing = 0;
        long total = 0;
        int pending = 0;
        boolean confirmed = "CONFIRMED".equals(imp.status());
        for (Group g : parsed.groups) {
            long groupCents = 0;
            int groupLines = 0;
            int groupPending = 0;
            for (Category c : g.categories) {
                long catCents = 0;
                int catPending = 0;
                for (Line l : c.lines) {
                    Long cents = l.quantity == null || l.unitCost == null ? null : BomCost.itemCents(l.quantity, l.unitCost);
                    if (cents == null) catPending++;
                    else catCents += cents;
                    String ref = l.code;
                    boolean gen = false;
                    String itemCode = null;
                    boolean isNew;
                    if (ref != null) {
                        Optional<ItemQueryApi.ItemRef> item = itemCatalog.itemByReferenceCode(ref);
                        itemCode = item.map(ItemQueryApi.ItemRef::code).orElse(null);
                        isNew = item.isEmpty() && refsInFile.add(ref.toLowerCase(Locale.ROOT));
                    } else {
                        Optional<ItemQueryApi.ItemRef> item = itemCatalog.itemByDescription(l.description, l.nature());
                        if (item.isPresent()) {
                            itemCode = item.get().code();
                            ref = itemCatalog.referenceCodeOf(item.get().id()).orElse(null);
                            isNew = false;
                        } else {
                            String key = l.nature() + "|" + l.description.toLowerCase(Locale.ROOT);
                            ref = generatedByDescription.get(key);
                            isNew = ref == null;
                            if (ref == null) {
                                int n = generated.computeIfAbsent(g.prefix, itemCatalog::lastGeneratedNumber) + 1;
                                generated.put(g.prefix, n);
                                ref = String.format("%s-%04d", g.prefix, n);
                                generatedByDescription.put(key, ref);
                            }
                            gen = true;
                        }
                    }
                    if (isNew) {
                        newItems++;
                        if (!itemCatalog.unitExists(l.uom)) newUnits.add(l.uom + (UOM_NAMES.containsKey(l.uom) ? " (" + UOM_NAMES.get(l.uom) + ")" : ""));
                        if (!itemCatalog.categoryExists(sentence(c.name))) newCategories.add(sentence(c.name));
                    } else if (itemCode != null) {
                        existing++;
                    }
                    lines.add(new PreviewLine(c.subassembly ? sentence(c.name) : g.name, sentence(c.name), l.sourceNo, ref, gen,
                            l.description, l.quantity, l.uom, l.unitCost, cents, confirmed ? null : itemCode, !confirmed && isNew,
                            l.supplier, l.material));
                }
                if (c.subassembly) groups.add(new PreviewGroup(sentence(c.name), g.name, c.lines.size(), catCents, catPending,
                        c.subtotal == null ? null : cents(c.subtotal)));
                groupCents += catCents;
                groupLines += c.lines.size();
                groupPending += catPending;
            }
            groups.add(groups.size() - (int) g.categories.stream().filter(c -> c.subassembly).count(),
                    new PreviewGroup(g.name, parsed.product, groupLines, groupCents, groupPending, g.informed == null ? null : cents(g.informed)));
            total += groupCents;
            pending += groupPending;
        }
        if (!newUnits.isEmpty() && !confirmed) {
            problems.add(new BomService.Problem("INFO", null, "Unidades que serão cadastradas: " + String.join(", ", newUnits) + "."));
        }
        long generatedCount = lines.stream().filter(PreviewLine::generatedCode).filter(PreviewLine::newItem).count();
        if (generatedCount > 0) {
            problems.add(new BomService.Problem("INFO", null, generatedCount + " itens sem código no arquivo recebem código gerado ("
                    + String.join(", ", generated.keySet().stream().sorted().map(p -> p + "-0001…").toList()) + ")."));
        }
        if (confirmed) {
            problems.add(0, new BomService.Problem("INFO", null, "Este arquivo já foi carregado em " + imp.confirmedAt() + " por "
                    + imp.confirmedBy() + "."));
        }
        UUID bomId = imp.revisionId() == null ? null : repository.findRevision(imp.revisionId()).map(BomRevision::bomId).orElse(null);
        return new Preview(imp, parsed.product, parsed.revision == null ? null : BomRevision.label(parsed.revision), parsed.revisionDate,
                parsed.lineCount(), total, pending, parsed.informedTotal == null ? null : cents(parsed.informedTotal), groups, problems,
                confirmed ? 0 : newItems, confirmed ? 0 : existing, confirmed ? List.of() : List.copyOf(newUnits),
                confirmed ? List.of() : List.copyOf(newCategories), parsed.notes, lines, imp.revisionId(), bomId);
    }

    // ───────────── Leitura do arquivo ─────────────

    private record Line(int sourceNo, String code, String description, BigDecimal quantity, String uom, boolean uomMissing,
                        BigDecimal unitCost, BigDecimal fileTotal, String supplier, String material) {
        String nature() {
            return "SRV".equals(uom) ? "SERVICO" : "MATERIAL";
        }
    }

    private record Category(String code, String name, BigDecimal subtotal, Integer declaredCount, boolean subassembly, List<Line> lines) { }

    private record Group(String key, String name, String prefix, BigDecimal informed, Integer declaredCount, List<Category> categories) { }

    private record Parsed(String product, Integer revision, String revisionDate, BigDecimal informedTotal, List<Group> groups,
                          List<BomService.Problem> problems, List<String> notes) {
        int lineCount() {
            return groups.stream().mapToInt(g -> g.categories.stream().mapToInt(c -> c.lines.size()).sum()).sum();
        }
    }

    private Parsed parse(String content) {
        JsonNode root;
        try {
            root = json.readTree(content);
        } catch (RuntimeException e) {
            throw BomService.invalid("BOM_IMPORT_INVALID", "content", "O arquivo não é um JSON válido.");
        }
        if (root == null || !root.isObject()) throw BomService.invalid("BOM_IMPORT_INVALID", "content", "O arquivo não é uma BOM.");
        String product = str(root.get("produto"));
        if (product == null) throw BomService.invalid("BOM_IMPORT_INVALID", "produto", "O arquivo não informa o produto (\"produto\").");
        if (product.length() > 150) throw BomService.invalid("BOM_IMPORT_INVALID", "produto", "Nome do produto com mais de 150 caracteres.");
        String moeda = str(root.get("moeda"));
        if (moeda != null && !moeda.equalsIgnoreCase("BRL")) {
            throw BomService.invalid("BOM_IMPORT_INVALID", "moeda", "Só BOM em reais (BRL); o arquivo está em " + moeda + ".");
        }
        Integer revision = null;
        String rawRev = str(root.get("revisao"));
        if (rawRev != null) {
            try {
                revision = Integer.parseInt(rawRev.replaceAll("\\D", ""));
            } catch (NumberFormatException ignored) {
                // revisão sem número: usa a próxima livre
            }
        }
        JsonNode resumo = root.path("resumo");
        List<BomService.Problem> problems = new ArrayList<>();
        List<Group> groups = new ArrayList<>();
        Map<String, List<String>> codes = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> e : root.properties()) {
            if (!e.getKey().startsWith("bom_") || !e.getValue().isObject()) continue;
            String key = e.getKey().substring(4);
            String name = GROUP_NAMES.getOrDefault(key, sentence(key.replace('_', ' ')));
            String prefix = prefix(key);
            List<Category> categories = new ArrayList<>();
            for (JsonNode c : e.getValue().path("categorias")) {
                String catName = str(c.get("categoria"));
                if (catName == null) catName = str(c.get("codigo"));
                if (catName == null) catName = "Sem categoria";
                List<Line> lines = new ArrayList<>();
                for (JsonNode it : c.path("itens")) {
                    lines.add(line(name, it, problems, codes));
                }
                BigDecimal subtotal = dec(c.get("subtotal"));
                Integer declared = c.hasNonNull("quantidade_itens") ? c.get("quantidade_itens").asInt() : null;
                boolean sub = catName.toUpperCase(Locale.ROOT).startsWith("PAINEL");
                Category cat = new Category(str(c.get("codigo")), catName, subtotal, declared, sub, lines);
                categories.add(cat);
                if (declared != null && declared != lines.size()) {
                    problems.add(new BomService.Problem("WARNING", null, name + ", " + sentence(catName) + ": o arquivo diz " + declared
                            + " itens e traz " + lines.size() + "."));
                }
                BigDecimal sum = lines.stream().filter(l -> l.fileTotal != null).map(l -> l.fileTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
                if (subtotal != null && sum.compareTo(subtotal) != 0) {
                    problems.add(new BomService.Problem("WARNING", null, name + ", " + sentence(catName) + ": subtotal informado "
                            + brl(subtotal) + " × soma das linhas " + brl(sum) + "."));
                }
            }
            if (categories.isEmpty()) continue;
            JsonNode r = resumo.path(key);
            BigDecimal informed = dec(r.get("custo_total"));
            Integer declared = r.hasNonNull("quantidade_itens") ? r.get("quantidade_itens").asInt() : null;
            Group g = new Group(key, name, prefix, informed, declared, categories);
            groups.add(g);
            BigDecimal sum = categories.stream().flatMap(c -> c.lines.stream()).filter(l -> l.fileTotal != null).map(l -> l.fileTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (informed != null && sum.compareTo(informed) != 0) {
                problems.add(new BomService.Problem("WARNING", null, name + ": total informado " + brl(informed) + " × soma das linhas "
                        + brl(sum) + "."));
            }
        }
        if (groups.isEmpty()) {
            throw BomService.invalid("BOM_IMPORT_INVALID", "content", "O arquivo não tem blocos de BOM (\"bom_mecanica\", \"bom_eletrica\"…) com itens.");
        }
        codes.forEach((code, descriptions) -> {
            if (new LinkedHashSet<>(descriptions).size() > 1) {
                problems.add(new BomService.Problem("WARNING", null, "O código " + code + " aparece " + descriptions.size()
                        + " vezes com descrições diferentes (" + String.join("; ", descriptions)
                        + "): as linhas usam o mesmo item do cadastro. Confira se é o mesmo item."));
            }
        });
        BigDecimal informedTotal = dec(resumo.get("custo_total_geral"));
        BigDecimal all = groups.stream().flatMap(g -> g.categories.stream()).flatMap(c -> c.lines.stream()).filter(l -> l.fileTotal != null)
                .map(l -> l.fileTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (informedTotal != null && all.compareTo(informedTotal) != 0) {
            problems.add(new BomService.Problem("WARNING", null, "Total geral informado " + brl(informedTotal) + " × soma das linhas "
                    + brl(all) + ": diferença de " + brl(all.subtract(informedTotal)) + " (não corrigida)."));
        }
        long missingUom = groups.stream().flatMap(g -> g.categories.stream()).flatMap(c -> c.lines.stream()).filter(l -> l.uomMissing).count();
        if (missingUom > 0) {
            problems.add(new BomService.Problem("INFO", null, missingUom + " linhas sem unidade no arquivo entram como UN (unidade)."));
        }
        List<String> notes = new ArrayList<>();
        root.path("observacoes").forEach(n -> {
            String t = str(n);
            if (t != null) notes.add(t);
        });
        return new Parsed(product.strip().replaceAll("\\s+", " "), revision, str(root.get("data_revisao")), informedTotal, groups,
                problems, notes);
    }

    private Line line(String group, JsonNode it, List<BomService.Problem> problems, Map<String, List<String>> codes) {
        int no = it.hasNonNull("item") ? it.get("item").asInt() : 0;
        String where = group + " " + no;
        String description = str(it.get("descricao"));
        if (description == null) {
            throw BomService.invalid("BOM_IMPORT_INVALID", "content", where + ": linha sem descrição.");
        }
        if (description.length() > 200) description = description.substring(0, 200);
        String code = str(it.get("codigo"));
        if (code != null && code.length() > 60) throw BomService.invalid("BOM_IMPORT_INVALID", "content", where + ": código com mais de 60 caracteres.");
        BigDecimal qty = dec(it.get("quantidade"));
        BigDecimal unitCost = dec(it.get("preco_unitario"));
        BigDecimal fileTotal = dec(it.get("preco_total"));
        if (qty != null && qty.signum() <= 0) {
            problems.add(new BomService.Problem("BLOCKING", no, where + " — " + description + ": quantidade " + qty.toPlainString()
                    + " não é maior que zero; a linha entra sem quantidade."));
            qty = null;
        } else if (qty == null) {
            problems.add(new BomService.Problem("BLOCKING", no, where + " — " + description
                    + ": sem quantidade no arquivo. Informe antes de aprovar a revisão."));
        }
        if (unitCost == null || unitCost.signum() < 0) {
            problems.add(new BomService.Problem("BLOCKING", no, where + " — " + description + ": sem preço unitário. Informe antes de aprovar."));
            unitCost = null;
        }
        if (qty != null && unitCost != null && fileTotal != null
                && qty.multiply(unitCost).setScale(2, RoundingMode.HALF_UP).compareTo(fileTotal.setScale(2, RoundingMode.HALF_UP)) != 0) {
            problems.add(new BomService.Problem("WARNING", no, where + " — " + description + ": total do arquivo " + brl(fileTotal) + " × "
                    + qty.stripTrailingZeros().toPlainString() + " × " + brl(unitCost) + "."));
        }
        if (qty != null && qty.stripTrailingZeros().scale() > 6) qty = qty.setScale(6, RoundingMode.HALF_UP);
        if (unitCost != null && unitCost.stripTrailingZeros().scale() > 6) unitCost = unitCost.setScale(6, RoundingMode.HALF_UP);
        String material = str(it.get("material"));
        if (material != null && material.length() > 120) material = material.substring(0, 120);
        if (material != null && description.toLowerCase(Locale.ROOT).contains("inox") && !material.toLowerCase(Locale.ROOT).contains("inox")) {
            problems.add(new BomService.Problem("WARNING", no, where + " — " + description + ": a descrição diz inox e o material é "
                    + material + ". Confira."));
        }
        String supplier = str(it.get("fornecedor"));
        if (supplier == null) supplier = str(it.get("marca"));
        if (supplier != null && supplier.length() > 120) supplier = supplier.substring(0, 120);
        // Unidade: a do arquivo; na elétrica a coluna "Unid. Ref." só vale quando é uma unidade (M, SRV), não um texto
        // como "3 unidades" (decisão do PO em 01/10/2026: retirar a Unid. Ref.).
        String rawUom = str(it.get("unidade"));
        if (rawUom == null) {
            String ref = str(it.get("unid_ref"));
            if (ref != null && ref.matches("[A-Za-z]{1,5}")) rawUom = ref;
        }
        boolean missing = rawUom == null;
        String uom = missing ? DEFAULT_UOM : rawUom.strip().toUpperCase(Locale.ROOT);
        uom = UOM_ALIASES.getOrDefault(uom, uom);
        if (!uom.matches("[A-Z0-9]{1,10}")) uom = DEFAULT_UOM;
        if (code != null) codes.computeIfAbsent(code.toUpperCase(Locale.ROOT), k -> new ArrayList<>()).add(description);
        return new Line(no, code, description, qty == null ? null : strip(qty), uom, missing, unitCost == null ? null : strip(unitCost),
                fileTotal, supplier, material);
    }

    // ───────────── Apoio ─────────────

    private static String str(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return null;
        String t = n.asString().strip();
        return t.isEmpty() ? null : t;
    }

    private static BigDecimal dec(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return null;
        if (n.isNumber()) return n.decimalValue();
        String t = n.asString().strip().replace(',', '.');
        if (t.isEmpty()) return null;
        try {
            return new BigDecimal(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static BigDecimal strip(BigDecimal v) {
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    private static long cents(BigDecimal reais) {
        return reais.setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }

    private static String brl(BigDecimal reais) {
        return Money.ofCents(cents(reais), Currency.BRL).toBrl();
    }

    /** "CHAPAS E PEÇAS" → "Chapas e peças". */
    static String sentence(String s) {
        String t = s.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    private static String prefix(String key) {
        String ascii = Normalizer.normalize(key, Normalizer.Form.NFD).replaceAll("[^A-Za-z]", "").toUpperCase(Locale.ROOT);
        return ascii.length() >= 3 ? ascii.substring(0, 3) : (ascii + "XXX").substring(0, 3);
    }

    private static String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Carga da BOM não encontrada.");
    }
}
