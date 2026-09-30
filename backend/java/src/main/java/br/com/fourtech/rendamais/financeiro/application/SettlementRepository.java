package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das liquidações, alocações e estornos. */
public interface SettlementRepository {

    /** Liquidação com os nomes para a tela: conta, parceiro (cliente ou beneficiário) e o código de cada título alocado. */
    record Summary(Settlement settlement, String accountCode, String accountName, String counterpartyCode, String counterpartyName,
                   List<TitleRef> titles) { }

    record TitleRef(UUID titleId, String code, String label, long amountCents) { }

    /** Próximo código de recebimento (RC00001) ou de pagamento (PG00001). */
    String nextCode(FinancialTitle.Direction direction);

    void insert(Settlement settlement);

    /** Marca como estornada e grava o estorno (INV-ST-6: um por liquidação, também no banco). */
    void reverse(Settlement reversed, long expectedVersion);

    Optional<Settlement> findForUpdate(UUID id);

    Optional<Summary> find(UUID id);

    /** Liquidações de um título, de uma conta ou todas, as mais recentes primeiro. */
    List<Summary> list(UUID titleId, UUID accountId, int limit);
}
