package br.com.fourtech.rendamais.engenharia.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * BOM do equipamento: cópia congelada da revisão aplicada, com as linhas em árvore (as submontagens com as suas linhas).
 * Os ajustes do equipamento (incluir, retirar, alterar) não mudam o modelo e guardam o valor que veio do modelo.
 */
public record EquipmentBom(UUID id, UUID equipmentId, UUID revisionId, long version, Instant appliedAt, String appliedBy,
                           Instant updatedAt, String updatedBy) {

    public enum Origin { MODEL, ADJUSTMENT }

    public enum LineStatus { ACTIVE, REMOVED }

    public record Line(UUID id, UUID equipmentBomId, UUID parentId, int position, BomCost.Kind kind, UUID itemId, UUID childRevisionId,
                       String referenceCode, String description, BigDecimal quantity, String uom, BigDecimal unitCost, String category,
                       String supplier, String material, String notes, Origin origin, BigDecimal modelQuantity,
                       BigDecimal modelUnitCost, LineStatus status, String adjustmentReason) {

        public boolean active() {
            return status == LineStatus.ACTIVE;
        }

        /** Linha do modelo com quantidade ou custo diferente do que veio da revisão. */
        public boolean changed() {
            return origin == Origin.MODEL && (!same(quantity, modelQuantity) || !same(unitCost, modelUnitCost));
        }

        private static boolean same(BigDecimal a, BigDecimal b) {
            return a == null ? b == null : b != null && a.compareTo(b) == 0;
        }
    }
}
