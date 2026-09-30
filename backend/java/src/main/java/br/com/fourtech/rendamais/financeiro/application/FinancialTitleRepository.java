package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos títulos financeiros. */
public interface FinancialTitleRepository {

    /** Linha da lista de contas a receber ou a pagar, com o nome do cliente ou do beneficiário. */
    record Summary(FinancialTitle title, String counterpartyCode, String counterpartyName) { }

    /** Próximo código de título a receber: CR00001. */
    String nextReceivableCode();

    /** Próximo código de título a pagar: CP00001. */
    String nextPayableCode();

    void insert(FinancialTitle title);

    void update(FinancialTitle title);

    Optional<Summary> findById(UUID id);

    /** Títulos das origens, bloqueados para alteração em ordem crescente de id (INV-ST-3). */
    List<FinancialTitle> findByOriginForUpdate(String originType, List<String> originIds);

    List<FinancialTitle> findByOrigin(String originType, List<String> originIds);

    /** Títulos cuja origem começa por {@code prefix} (ex.: as parcelas de um título manual), na ordem do código. */
    List<FinancialTitle> findByOriginPrefix(String originType, String prefix);

    /** Títulos pelos ids, na ordem de vencimento, sem bloqueio. */
    List<FinancialTitle> findByIds(List<UUID> ids);

    /** Títulos a receber não cancelados do parceiro, na ordem de vencimento. */
    List<FinancialTitle> activeReceivablesOf(UUID counterpartyId);

    /**
     * Filtro de situação da lista: ACTIVE (não cancelados), OPEN (com saldo), OVERDUE (com saldo e vencidos), DUE (com
     * saldo e a vencer), SETTLED (liquidados), CANCELLED ou ALL.
     */
    enum Filter { ACTIVE, OPEN, OVERDUE, DUE, SETTLED, CANCELLED, ALL }

    /** Títulos pelos ids, bloqueados em ordem crescente de id (INV-ST-3). */
    List<FinancialTitle> findByIdsForUpdate(List<UUID> ids);

    /**
     * Contas a receber ou a pagar: busca por código, parceiro, descrição da origem ou número do documento; filtros nulos não
     * filtram.
     */
    List<Summary> list(FinancialTitle.Direction direction, String search, UUID projectId, UUID counterpartyId, Filter filter,
                       LocalDate today, int limit);
}
