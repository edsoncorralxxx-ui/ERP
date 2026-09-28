package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.FinancialCategory;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das categorias financeiras. */
public interface FinancialCategoryRepository {

    void insert(FinancialCategory category);

    void update(FinancialCategory category, long expectedVersion);

    Optional<FinancialCategory> find(UUID id);

    Optional<FinancialCategory> findByCode(String code);

    Optional<FinancialCategory> findByName(String name);

    boolean codeExists(String code);

    /** Em ordem de direção e nome; {@code direction} nulo traz as duas. */
    List<FinancialCategory> list(FinancialCategory.Direction direction, boolean includeInactive);

    /** Títulos não cancelados que usam a categoria. */
    long titlesUsing(String code);
}
