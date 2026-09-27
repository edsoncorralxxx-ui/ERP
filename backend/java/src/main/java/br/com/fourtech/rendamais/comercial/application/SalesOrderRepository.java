package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.domain.SalesOrder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos pedidos de venda com linhas e parcelas. */
public interface SalesOrderRepository {

    record Summary(SalesOrder order, String customerCode, String customerName, String proposalCode) { }

    /** Próximo número de pedido: PV00001. */
    String nextCode();

    void insert(SalesOrder order);

    boolean update(SalesOrder order, long expectedVersion);

    Optional<Summary> findById(UUID id);

    Optional<SalesOrder> findByIdForUpdate(UUID id);

    /** Pedido não cancelado gerado pela proposta. */
    Optional<UUID> activeForProposal(UUID proposalId);

    List<Summary> list(String search, SalesOrder.Status status, int limit);
}
