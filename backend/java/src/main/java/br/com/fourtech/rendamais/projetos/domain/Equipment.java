package br.com.fourtech.rendamais.projetos.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Equipamento com identidade própria (formulário "equipamentos" do B01): nasce da confirmação do pedido, um por unidade
 * da linha de equipamento. Número de série e observações são do usuário; aceite e início da garantia vêm do aceite
 * registrado (PD-015), nunca da previsão, e ficam vazios até a instalação.
 */
public record Equipment(UUID id, String code, UUID projectId, UUID orderLineId, int lineSeq, String model, UUID modelId, UUID itemId,
                        UUID customerId, UUID unitId, String unitName, String serialNumber, String notes, Status status,
                        LocalDate acceptedOn, LocalDate warrantyStart, long version, Instant createdAt, String createdBy,
                        Instant updatedAt, String updatedBy) {

    public enum Status { ATIVO, CANCELADO }

    public Equipment {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(model);
        Objects.requireNonNull(modelId);
        Objects.requireNonNull(status);
    }

    public static Equipment create(String code, Project project, UUID orderLineId, int lineSeq, String model, UUID modelId,
                                   UUID itemId, Instant now, String actor) {
        return new Equipment(UUID.randomUUID(), code, project.id(), orderLineId, lineSeq, model, modelId, itemId, project.customerId(),
                project.unitId(), project.unitName(), null, null, Status.ATIVO, null, null, 1, now, actor, now, actor);
    }

    /** UpdateEquipment: número de série (único por modelo, conferido pelo caso de uso) e observações. */
    public Equipment update(String serialNumber, String notes, Instant now, String actor) {
        if (status == Status.CANCELADO) {
            throw new InvalidStateException("O equipamento " + code + " foi cancelado com o pedido e não é mais alterado.");
        }
        List<FieldIssue> issues = new ArrayList<>();
        String serial = text(serialNumber);
        if (serial != null && serial.length() > 60) issues.add(new FieldIssue("serialNumber", "Máximo de 60 caracteres."));
        String n = text(notes);
        if (n != null && n.length() > 1000) issues.add(new FieldIssue("notes", "Máximo de 1000 caracteres."));
        if (!issues.isEmpty()) throw new RuleViolationException("EQUIPMENT_INVALID", "Corrija os campos indicados.", issues);
        return new Equipment(id, code, projectId, orderLineId, lineSeq, model, modelId, itemId, customerId, unitId, unitName, serial, n,
                status, acceptedOn, warrantyStart, version + 1, createdAt, createdBy, now, actor);
    }

    public Equipment cancel(Instant now, String actor) {
        if (status == Status.CANCELADO) return this;
        return new Equipment(id, code, projectId, orderLineId, lineSeq, model, modelId, itemId, customerId, unitId, unitName, serialNumber,
                notes, Status.CANCELADO, acceptedOn, warrantyStart, version + 1, createdAt, createdBy, now, actor);
    }

    public Map<String, String[]> diff(Equipment other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        if (!Objects.equals(serialNumber, other.serialNumber)) d.put("serialNumber", new String[]{serialNumber, other.serialNumber});
        if (!Objects.equals(notes, other.notes)) d.put("notes", new String[]{notes, other.notes});
        if (status != other.status) d.put("status", new String[]{status.name(), other.status.name()});
        return d;
    }

    private static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }
}
