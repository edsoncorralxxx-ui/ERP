package br.com.fourtech.rendamais.projetos.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Consulta pública do projeto gerado por um pedido. */
public interface ProjectQueryApi {

    record EquipmentView(UUID id, String code, String model, String serialNumber, String status) { }

    record ProjectView(UUID id, String code, String stage, List<EquipmentView> equipment) { }

    Optional<ProjectView> forOrder(UUID orderId);

    /** Projeto pelo id (ex.: projeto de um título a pagar); sem os equipamentos. */
    Optional<ProjectView> projectById(UUID id);

    /** Equipamento com o projeto e o modelo, para a BOM do equipamento. */
    record EquipmentRef(UUID id, String code, UUID projectId, String projectCode, UUID modelId, String modelCode, String modelName,
                        String serialNumber, boolean active) { }

    Optional<EquipmentRef> equipmentById(UUID id);

    /** Base do custo planejado: o valor contratado do projeto e os equipamentos dele. */
    record CostBasis(UUID projectId, String code, String name, String stage, long contractCents, List<EquipmentRef> equipment) { }

    Optional<CostBasis> costBasis(UUID projectId);
}
