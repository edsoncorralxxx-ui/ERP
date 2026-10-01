package br.com.fourtech.rendamais.engenharia.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * BOM: a do modelo de equipamento ({@code modelId} preenchido, uma por modelo) ou uma submontagem reaproveitável em
 * outras BOMs (Mecânica, Elétrica, Painel elétrico). O conteúdo fica nas revisões.
 */
public record Bom(UUID id, String code, String name, UUID modelId, long version, Instant createdAt, String createdBy,
                  Instant updatedAt, String updatedBy) {

    public Bom {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(name);
    }

    public static Bom create(String code, String name, UUID modelId, Instant now, String actor) {
        return new Bom(UUID.randomUUID(), code, validName(name), modelId, 1, now, actor, now, actor);
    }

    public boolean isModelBom() {
        return modelId != null;
    }

    public static String validName(String raw) {
        String n = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (n.isEmpty() || n.length() > 200) {
            throw new RuleViolationException("BOM_INVALID", "Corrija os campos indicados.",
                    List.of(new FieldIssue("name", n.isEmpty() ? "Informe o nome da BOM." : "Máximo de 200 caracteres.")));
        }
        return n;
    }
}
