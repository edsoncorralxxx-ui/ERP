package br.com.fourtech.rendamais.projetos.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Consulta pública do projeto gerado por um pedido. */
public interface ProjectQueryApi {

    record EquipmentView(UUID id, String code, String model, String serialNumber, String status) { }

    record ProjectView(UUID id, String code, String stage, List<EquipmentView> equipment) { }

    Optional<ProjectView> forOrder(UUID orderId);
}
