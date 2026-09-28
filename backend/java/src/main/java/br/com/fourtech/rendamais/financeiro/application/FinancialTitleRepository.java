package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos títulos financeiros. O valor recebido vem das alocações não estornadas. */
public interface FinancialTitleRepository {

    /** Linha da lista de contas a receber, com o nome do cliente. */
    record Summary(FinancialTitle title, String counterpartyCode, String counterpartyName) { }

    /** Próximo código de título a receber: CR00001. */
    String nextReceivableCode();

    void insert(FinancialTitle title);

    /** Grava situação, motivo e versão (o recebido é derivado das alocações, gravadas pela liquidação). */
    void update(FinancialTitle title);

    Optional<Summary> findById(UUID id);

    /**
     * Bloqueia os títulos em ordem crescente de id (INV-ST-3) e só depois os lê, já com o recebido de quem acabou de
     * gravar: a leitura é outro comando, que enxerga o que a transação concorrente confirmou enquanto esperávamos.
     */
    List<FinancialTitle> findByIdsForUpdate(List<UUID> ids);

    /** Títulos das origens, bloqueados como em {@link #findByIdsForUpdate}. */
    List<FinancialTitle> findByOriginForUpdate(String originType, List<String> originIds);

    List<FinancialTitle> findByOrigin(String originType, List<String> originIds);

    /** Contas a receber: busca por código, cliente ou descrição da origem; filtros nulos não filtram. */
    List<Summary> listReceivables(String search, UUID projectId, UUID counterpartyId, boolean includeCancelled, int limit);
}
