package br.com.fourtech.rendamais.comercial.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Consulta pública dos pedidos confirmados para outros módulos (documentos: nota a emitir pelo caixa). Lê na transação
 * do chamador e não confere permissão; quem chama confere a sua.
 */
public interface SalesOrderQueryApi {

    /** Linha do pedido: EQUIPAMENTO, MATERIAL ou SERVICO, o item do cadastro (vazio no equipamento) e o total em centavos. */
    record LineRef(String kind, UUID itemId, String description, long totalCents) { }

    /**
     * Pedido confirmado (CONFIRMED, IN_EXECUTION ou COMPLETED) com as linhas e os ids dos títulos das parcelas, na ordem
     * das parcelas.
     */
    record OrderRef(UUID id, String code, UUID customerId, String customerCode, String customerName, String status,
                    long totalCents, UUID projectId, List<LineRef> lines, List<UUID> titleIds) { }

    /** Pedido confirmado; vazio se não existe, está em rascunho ou foi cancelado. */
    Optional<OrderRef> confirmed(UUID orderId);

    /** Pedidos confirmados, os mais recentes primeiro; busca por número ou cliente. */
    List<OrderRef> confirmedOrders(String search);
}
