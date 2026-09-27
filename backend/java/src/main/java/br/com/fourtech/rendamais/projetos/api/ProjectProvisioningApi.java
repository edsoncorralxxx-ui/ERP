package br.com.fourtech.rendamais.projetos.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Criação e encerramento de projetos a partir do pedido (porta {@code ProjectProvisioningApi} do B01), na transação do
 * chamador. Premissa B01 (PD-001): um projeto por pedido confirmado e um equipamento por unidade de cada linha de
 * equipamento.
 */
public interface ProjectProvisioningApi {

    /** Linha de equipamento do pedido: {@code quantity} equipamentos com o modelo da linha. */
    record EquipmentLine(UUID orderLineId, String model, UUID itemId, int quantity) { }

    record ProvisionRequest(UUID orderId, String orderCode, String name, UUID customerId, UUID unitId, String unitName,
                            LocalDate contractDelivery, long contractCents, List<EquipmentLine> lines) { }

    record Provisioned(UUID projectId, String projectCode, List<UUID> equipmentIds) { }

    /** Cria o projeto e os equipamentos do pedido; se já existem, devolve os existentes sem criar outros. */
    Provisioned provisionFor(ProvisionRequest request);

    /**
     * Encerra o projeto do pedido cancelado (com motivo) e cancela os seus equipamentos. Recusa se a execução já começou
     * (projeto fora de PLANEJADO), como pede a premissa B01 de cancelamento (PD-003). Devolve o id do projeto encerrado.
     */
    List<UUID> closeForCancelledOrder(UUID orderId, String reason);
}
