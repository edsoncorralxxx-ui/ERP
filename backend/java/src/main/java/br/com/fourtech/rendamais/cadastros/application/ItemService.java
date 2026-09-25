package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.ItemData;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Casos de uso de materiais e serviços (formulário "materiais" do B01): cadastrar (idempotente, código M/S do sistema),
 * editar com versão e inativar com motivo. Unidade e categoria precisam existir e estar ativas — as que o item já usa
 * continuam aceitas depois de inativadas.
 */
@Service
public class ItemService {

    static final String ENTITY = "item";

    private final ItemRepository repository;
    private final CatalogRepository catalog;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public ItemService(ItemRepository repository, CatalogRepository catalog, AuditTrail audit, AuditQuery auditQuery,
                       Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ItemRepository.Summary> list(String search, Item.Nature nature, UUID categoryId, Partner.Status status) {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        return repository.list(search == null ? null : search.strip(), nature, categoryId, status, 500);
    }

    @Transactional(readOnly = true)
    public Item get(UUID id) {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** RegisterItem: repetir com a mesma chave devolve o mesmo item (US-205). */
    @Transactional
    public Item register(String idempotencyKey, ItemData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.ITEM_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterItem", data);
        if (done.isPresent()) {
            return find(UUID.fromString(done.get()));
        }
        Item.Nature nature = Item.natureOf(data);
        Instant now = clock.instant();
        Item item = Item.register(repository.nextCode(nature), data, lookups(null), now, user.username());
        repository.insert(item);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        changes.put("code", new AuditEntry.Change(null, item.code()));
        item.emptyLike().diff(item).forEach((f, v) -> changes.put(f, new AuditEntry.Change(null, v[1])));
        record(user, "ITEM_REGISTERED", item, null, changes);
        outbox.append("ItemRegistered", ENTITY, item.id().toString(), Map.of("itemId", item.id().toString(), "uom", item.uom(),
                "category", item.category().id().toString()), user.username());
        receipts.complete(user.username(), key, item.id().toString());
        return item;
    }

    /** UpdateItem com a versão lida (If-Match); edição desatualizada é rejeitada sem gravar nada. */
    @Transactional
    public Item update(UUID id, long expectedVersion, ItemData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.ITEM_UPDATE);
        Item current = repository.findByIdForUpdate(id).orElseThrow(ItemService::notFound);
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        Item updated = current.update(data, lookups(current), clock.instant(), user.username());
        if (!repository.update(updated, expectedVersion)) {
            throw new VersionConflictException(ENTITY, expectedVersion, find(id).version());
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, "ITEM_UPDATED", updated, null, changes);
        outbox.append("ItemUpdated", ENTITY, id.toString(),
                Map.of("itemId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return updated;
    }

    /** DeactivateItem: idempotente — inativar um item já inativo não grava nada de novo. */
    @Transactional
    public Item deactivate(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.ITEM_DEACTIVATE);
        Item current = repository.findByIdForUpdate(id).orElseThrow(ItemService::notFound);
        if (current.status() == Partner.Status.INATIVO) {
            return current;
        }
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("ITEM_INVALID", "Informe o motivo da inativação.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Item inactive = current.deactivate(clock.instant(), user.username());
        repository.update(inactive, expectedVersion);
        record(user, "ITEM_DEACTIVATED", inactive, why,
                Map.of("status", new AuditEntry.Change(Partner.Status.ATIVO.name(), Partner.Status.INATIVO.name())));
        outbox.append("ItemDeactivated", ENTITY, id.toString(), Map.of("itemId", id.toString(), "reason", why), user.username());
        return inactive;
    }

    /** Unidade e categoria usáveis: ativas, ou as que o item já usa (para a edição não obrigar a trocá-las). */
    private Item.Lookups lookups(Item current) {
        return new Item.Lookups(
                code -> catalog.unit(code, false).map(u -> u.status() == Partner.Status.ATIVO
                        || (current != null && (current.uom().equals(code)
                        || current.conversions().stream().anyMatch(c -> c.fromUom().equals(code))))).orElse(false),
                raw -> {
                    UUID id;
                    try {
                        id = UUID.fromString(raw);
                    } catch (IllegalArgumentException e) {
                        return Optional.empty();
                    }
                    return catalog.category(id, false)
                            .filter(c -> c.status() == Partner.Status.ATIVO || (current != null && current.category().id().equals(id)))
                            .map(c -> new Partner.Category(c.id(), c.name()));
                });
    }

    private Item find(UUID id) {
        return repository.findById(id).orElseThrow(ItemService::notFound);
    }

    private void record(CurrentUser user, String action, Item i, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, i.id().toString(), i.version(), reason, changes,
                CorrelationId.current()));
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Material ou serviço não encontrado.");
    }
}
