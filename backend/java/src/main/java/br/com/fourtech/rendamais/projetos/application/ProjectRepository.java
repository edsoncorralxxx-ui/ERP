package br.com.fourtech.rendamais.projetos.application;

import br.com.fourtech.rendamais.projetos.domain.Equipment;
import br.com.fourtech.rendamais.projetos.domain.Project;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência de projetos e equipamentos. */
public interface ProjectRepository {

    /** Projeto com o nome do cliente e a contagem de equipamentos ativos, para a carteira. */
    record ProjectSummary(Project project, String customerCode, String customerName, int equipmentCount) { }

    /** Equipamento com os códigos do projeto e do cliente, para a lista e a ficha. */
    record EquipmentSummary(Equipment equipment, String projectCode, String orderCode, String customerCode, String customerName) { }

    String nextProjectCode();

    String nextEquipmentCode();

    void insert(Project project);

    void update(Project project);

    void insert(Equipment equipment);

    boolean update(Equipment equipment, long expectedVersion);

    Optional<Project> findByOrderForUpdate(UUID orderId);

    Optional<ProjectSummary> findProject(UUID id);

    Optional<UUID> projectIdForOrder(UUID orderId);

    List<ProjectSummary> listProjects(String search, Project.Stage stage, boolean includeClosed, int limit);

    List<Equipment> equipmentOf(UUID projectId);

    Optional<EquipmentSummary> findEquipment(UUID id);

    Optional<Equipment> findEquipmentForUpdate(UUID id);

    /** Outro equipamento do mesmo modelo (sem diferenciar maiúsculas) com a mesma série. */
    Optional<String> codeWithSerial(String model, String serialNumber, UUID exceptId);

    List<EquipmentSummary> listEquipment(String search, UUID projectId, boolean includeCancelled, int limit);
}
