package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.CashMovement;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das liquidações, das suas alocações e dos movimentos de caixa. */
public interface SettlementRepository {

    /** Título alocado, com código e descrição para a tela. */
    record TitleRef(UUID id, String code, String label, long amountCents) { }

    /** Liquidação com a conta, o cliente e os títulos pelo nome. */
    record Summary(Settlement settlement, String accountCode, String accountName, String counterpartyCode, String counterpartyName,
                   List<TitleRef> titles) { }

    /** Próximo código de recebimento: RC00001. */
    String nextReceiptCode();

    /** Grava a liquidação com as alocações. */
    void insert(Settlement settlement);

    /** Grava o estorno (situação, motivo, instante, ator e versão). */
    void markReversed(Settlement settlement);

    Optional<Settlement> findByIdForUpdate(UUID id);

    Optional<Summary> findById(UUID id);

    /** Liquidações de um título, de um cliente ou pela busca (código, cliente, título); filtros nulos não filtram. */
    List<Summary> list(UUID titleId, UUID counterpartyId, String search, boolean includeReversed, int limit);

    void insertCashMovement(CashMovement movement);

    /** Entrada original da liquidação (o movimento que não estorna outro). */
    Optional<CashMovement> inflowOf(UUID settlementId);
}
