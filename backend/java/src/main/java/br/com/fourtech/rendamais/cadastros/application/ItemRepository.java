package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos materiais e serviços. */
public interface ItemRepository {

    record Summary(UUID id, String code, String description, Item.Nature nature, String uom, String category,
                   boolean stockControlled, BigDecimal referenceCost, Partner.Status status, long version) { }

    /** Próximo código pela natureza: M00001 (material) ou S00001 (serviço). */
    String nextCode(Item.Nature nature);

    void insert(Item item);

    boolean update(Item item, long expectedVersion);

    Optional<Item> findById(UUID id);

    Optional<Item> findByIdForUpdate(UUID id);

    /** Busca por código ou descrição; {@code nature}, {@code categoryId} e {@code status} nulos não filtram. */
    List<Summary> list(String search, Item.Nature nature, UUID categoryId, Partner.Status status, int limit);
}
