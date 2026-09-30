package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.Transfer;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das transferências entre contas. */
public interface TransferRepository {

    /** Transferência com o código e o nome das duas contas, para a tela. */
    record Summary(Transfer transfer, String fromCode, String fromName, String toCode, String toName) { }

    /** Próximo código: TR00001. */
    String nextCode();

    void insert(Transfer transfer);

    void reverse(Transfer transfer, long expectedVersion);

    Optional<Summary> find(UUID id);

    Optional<Transfer> findForUpdate(UUID id);

    /** As mais recentes primeiro; {@code accountId} nulo traz todas. */
    List<Summary> list(UUID accountId, int limit);
}
