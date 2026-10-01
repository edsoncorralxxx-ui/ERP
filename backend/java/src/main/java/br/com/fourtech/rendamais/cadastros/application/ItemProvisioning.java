package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemProvisioningApi;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.ItemData;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.UnitOfMeasure;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Cadastro de itens pela carga da BOM (Sprint 10). A permissão é a do caso de uso que chama (bom.update); cada item,
 * unidade e categoria criados aqui ficam na auditoria como se fossem cadastrados na tela. O item entra sem controle de
 * estoque e sem custo de referência: o custo da BOM é o digitado na linha (decisão do PO em 01/10/2026).
 */
@Component
class ItemProvisioning implements ItemProvisioningApi {

    private final ItemRepository items;
    private final CatalogRepository catalog;
    private final ItemQueryApi queries;
    private final AuditTrail audit;
    private final Outbox outbox;
    private final Clock clock;

    ItemProvisioning(ItemRepository items, CatalogRepository catalog, ItemQueryApi queries, AuditTrail audit, Outbox outbox,
                     Clock clock) {
        this.items = items;
        this.catalog = catalog;
        this.queries = queries;
        this.audit = audit;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ItemQueryApi.ItemRef> itemByReferenceCode(String referenceCode) {
        return items.itemByReferenceCode(referenceCode).flatMap(queries::item);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ItemQueryApi.ItemRef> itemByDescription(String description, String nature) {
        return items.itemByDescription(description, Item.Nature.valueOf(nature)).flatMap(queries::item);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> referenceCodeOf(UUID itemId) {
        return items.referenceCodeOf(itemId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean unitExists(String code) {
        return catalog.unit(code, false).isPresent();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean categoryExists(String name) {
        return catalog.categoryByName(name, UUID.randomUUID()).isPresent();
    }

    @Override
    @Transactional(readOnly = true)
    public int lastGeneratedNumber(String prefix) {
        return items.lastGeneratedNumber(prefix);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public ProvisionedItem provision(ItemRequest r) {
        String ref = r.referenceCode() == null || r.referenceCode().isBlank() ? null : r.referenceCode().strip();
        Item.Nature nature = Item.Nature.valueOf(r.nature());
        Optional<UUID> existing = ref != null ? items.itemByReferenceCode(ref) : items.itemByDescription(r.description(), nature);
        if (existing.isPresent()) {
            Item item = items.findById(existing.get()).orElseThrow();
            return new ProvisionedItem(item.id(), item.code(), ref, false);
        }
        String actor = CurrentUserHolder.actorName();
        Instant now = clock.instant();
        String uom = UnitOfMeasure.of(r.uom()).code();
        if (catalog.unit(uom, false).isEmpty()) {
            String name = r.uomName() == null || r.uomName().isBlank() ? uom : r.uomName().strip();
            catalog.insertUnit(uom, name, now, actor);
            audit.record(new AuditEntry(actor, "UNIT_CREATED", "unit_of_measure", uom, 1, "Carga da BOM",
                    Map.of("code", new AuditEntry.Change(null, uom), "name", new AuditEntry.Change(null, name)), CorrelationId.current()));
        }
        String categoryName = r.categoryName().strip();
        UUID categoryId = catalog.categoryByName(categoryName, UUID.randomUUID()).map(CatalogRepository.CategoryEntry::id).orElse(null);
        if (categoryId == null) {
            categoryId = UUID.randomUUID();
            catalog.insertCategory(categoryId, categoryName, now, actor);
            audit.record(new AuditEntry(actor, "CATEGORY_CREATED", "item_category", categoryId.toString(), 1, "Carga da BOM",
                    Map.of("name", new AuditEntry.Change(null, categoryName)), CorrelationId.current()));
        }
        UUID category = categoryId;
        ItemData data = new ItemData(r.description(), nature.name(), uom, category.toString(), false, null, null, null, List.of());
        Item item = Item.register(items.nextCode(nature), data, new Item.Lookups(code -> catalog.unit(code, false).isPresent(),
                raw -> catalog.category(category, false).map(c -> new Partner.Category(c.id(), c.name()))), now, actor);
        items.insert(item);
        if (ref != null) items.insertReferenceCode(ref, item.id(), now, actor);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, item.code()));
        if (ref != null) changes.put("referenceCode", new AuditEntry.Change(null, ref));
        item.emptyLike().diff(item).forEach((f, v) -> changes.put(f, new AuditEntry.Change(null, v[1])));
        audit.record(new AuditEntry(actor, "ITEM_REGISTERED", ItemService.ENTITY, item.id().toString(), item.version(), "Carga da BOM",
                changes, CorrelationId.current()));
        outbox.append("ItemRegistered", ItemService.ENTITY, item.id().toString(), Map.of("itemId", item.id().toString(),
                "uom", item.uom(), "category", category.toString()), actor);
        return new ProvisionedItem(item.id(), item.code(), ref, true);
    }
}
