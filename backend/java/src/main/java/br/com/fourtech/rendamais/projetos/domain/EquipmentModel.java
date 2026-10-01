package br.com.fourtech.rendamais.projetos.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Modelo de equipamento (Sprint 10): o que a empresa fabrica e vende, com uma BOM por modelo. O equipamento vendido
 * aponta para o modelo; o texto do modelo que veio do pedido continua guardado no equipamento.
 */
public record EquipmentModel(UUID id, String code, String name, Status status, long version, Instant createdAt, String createdBy,
                             Instant updatedAt, String updatedBy) {

    public enum Status { ATIVO, INATIVO }

    public EquipmentModel {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(name);
        Objects.requireNonNull(status);
    }

    public static EquipmentModel register(String code, String name, Instant now, String actor) {
        return new EquipmentModel(UUID.randomUUID(), code, validName(name), Status.ATIVO, 1, now, actor, now, actor);
    }

    public EquipmentModel rename(String newName, Instant now, String actor) {
        return new EquipmentModel(id, code, validName(newName), status, version + 1, createdAt, createdBy, now, actor);
    }

    public EquipmentModel deactivate(Instant now, String actor) {
        if (status == Status.INATIVO) return this;
        return new EquipmentModel(id, code, name, Status.INATIVO, version + 1, createdAt, createdBy, now, actor);
    }

    /** Nome sem espaços repetidos; é por ele que o pedido encontra o modelo (sem diferenciar maiúsculas). */
    public static String normalize(String name) {
        return name == null ? "" : name.strip().replaceAll("\\s+", " ");
    }

    private static String validName(String raw) {
        String n = normalize(raw);
        if (n.isEmpty() || n.length() > 200) {
            throw new RuleViolationException("EQUIPMENT_MODEL_INVALID", "Corrija os campos indicados.",
                    List.of(new FieldIssue("name", n.isEmpty() ? "Informe o nome do modelo." : "Máximo de 200 caracteres.")));
        }
        return n;
    }
}
