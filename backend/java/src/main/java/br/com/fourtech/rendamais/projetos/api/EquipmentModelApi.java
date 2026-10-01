package br.com.fourtech.rendamais.projetos.api;

import java.util.Optional;
import java.util.UUID;

/** Modelos de equipamento para a engenharia (BOM do modelo e carga da BOM do arquivo). */
public interface EquipmentModelApi {

    record ModelRef(UUID id, String code, String name, boolean active) { }

    Optional<ModelRef> model(UUID id);

    /** Modelo pelo nome, sem diferenciar maiúsculas nem espaços repetidos. */
    Optional<ModelRef> modelByName(String name);

    /** Encontra o modelo pelo nome ou o cadastra, na transação do chamador (carga da BOM). */
    ModelRef provisionModel(String name);
}
