package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das listas de apoio dos cadastros: unidades de medida e categorias de item. */
public interface CatalogRepository {

    record UnitOfMeasureEntry(String code, String name, Partner.Status status, long version, Instant updatedAt,
                              String updatedBy, long items) { }

    record CategoryEntry(UUID id, String name, Partner.Status status, long version, Instant updatedAt, String updatedBy,
                         long items, long suppliers) { }

    List<UnitOfMeasureEntry> units();

    Optional<UnitOfMeasureEntry> unit(String code, boolean forUpdate);

    void insertUnit(String code, String name, Instant now, String actor);

    /** Grava se a versão armazenada ainda for {@code expectedVersion}. */
    boolean updateUnit(String code, long expectedVersion, String name, Partner.Status status, Instant now, String actor);

    List<CategoryEntry> categories();

    Optional<CategoryEntry> category(UUID id, boolean forUpdate);

    /** Outra categoria com o mesmo nome, sem diferenciar maiúsculas. */
    Optional<CategoryEntry> categoryByName(String name, UUID exceptId);

    void insertCategory(UUID id, String name, Instant now, String actor);

    boolean updateCategory(UUID id, long expectedVersion, String name, Partner.Status status, Instant now, String actor);
}
