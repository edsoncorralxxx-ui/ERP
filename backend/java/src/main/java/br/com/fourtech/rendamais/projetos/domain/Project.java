package br.com.fourtech.rendamais.projetos.domain;

import br.com.fourtech.rendamais.kernel.InvalidStateException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Projeto: vínculo central entre pedido, cliente, unidade, equipamentos, planejamento e financeiro. Nasce PLANEJADO na
 * confirmação do pedido; os estágios seguintes entram com engenharia, suprimentos, produção e instalação.
 */
public record Project(UUID id, String code, String name, UUID orderId, String orderCode, UUID customerId, UUID unitId,
                      String unitName, Stage stage, LocalDate contractDelivery, long contractCents, String closedReason,
                      long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {

    public enum Stage { PLANEJADO, ENGENHARIA, SUPRIMENTOS, PRODUCAO, INSTALACAO, ACEITO, ENCERRADO }

    public Project {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(stage);
    }

    public static Project plan(String code, String name, UUID orderId, String orderCode, UUID customerId, UUID unitId,
                               String unitName, LocalDate contractDelivery, long contractCents, Instant now, String actor) {
        return new Project(UUID.randomUUID(), code, name, orderId, orderCode, customerId, unitId, unitName, Stage.PLANEJADO,
                contractDelivery, contractCents, null, 1, now, actor, now, actor);
    }

    /** Encerra o projeto de um pedido cancelado; só enquanto nada foi executado (PLANEJADO). */
    public Project closeForCancellation(String reason, Instant now, String actor) {
        if (stage == Stage.ENCERRADO) return this;
        if (stage != Stage.PLANEJADO) {
            throw new InvalidStateException("O projeto " + code + " já está em " + stage.name().toLowerCase()
                    + "; o pedido não pode ser cancelado sem tratar a execução (PD-003).");
        }
        return new Project(id, code, name, orderId, orderCode, customerId, unitId, unitName, Stage.ENCERRADO, contractDelivery,
                contractCents, reason, version + 1, createdAt, createdBy, now, actor);
    }
}
