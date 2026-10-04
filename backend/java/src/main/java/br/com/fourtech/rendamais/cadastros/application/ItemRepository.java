package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos produtos e serviços. */
public interface ItemRepository {

    record Summary(UUID id, String code, String description, Item.Nature nature, String uom, String category,
                   boolean stockControlled, BigDecimal referenceCost, String ncm, String serviceCode, Partner.Status status,
                   long version, Item.Type type) { }

    /** Próximo código pela natureza: P00001 (produto) ou S00001 (serviço). */
    String nextCode(Item.Nature nature);

    /** Código já usado (código manual do cadastro). */
    boolean codeExists(String code);

    void insert(Item item);

    boolean update(Item item, long expectedVersion);

    Optional<Item> findById(UUID id);

    Optional<Item> findByIdForUpdate(UUID id);

    /** Busca por código, descrição, NCM ou código de serviço; {@code nature}, {@code categoryId} e {@code status} nulos não filtram. */
    List<Summary> list(String search, Item.Nature nature, UUID categoryId, Partner.Status status, int limit);

    /** Como a anterior, filtrando também pelo tipo (produto, material, serviço) quando informado. */
    List<Summary> list(String search, Item.Nature nature, Item.Type type, UUID categoryId, Partner.Status status, int limit);

    // ───────────── Códigos de referência (carga da BOM, Sprint 10) ─────────────

    Optional<UUID> itemByReferenceCode(String referenceCode);

    /** Item com a mesma descrição (sem diferenciar maiúsculas) e natureza. */
    Optional<UUID> itemByDescription(String description, Item.Nature nature);

    Optional<String> referenceCodeOf(UUID itemId);

    void insertReferenceCode(String referenceCode, UUID itemId, java.time.Instant now, String actor);

    /** Maior número dos códigos de referência "PREFIXO-NNNN". */
    int lastGeneratedNumber(String prefix);
}
