package br.com.fourtech.rendamais.engenharia.domain;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Linha da revisão: um item do cadastro, com o custo unitário digitado, ou uma submontagem (a revisão escolhida de outra
 * BOM). A descrição e o código de referência ficam na linha, congelados com a revisão.
 */
public record BomLine(UUID id, UUID revisionId, int position, BomCost.Kind kind, UUID itemId, UUID childRevisionId,
                      String referenceCode, String description, BigDecimal quantity, String uom, BigDecimal unitCost,
                      String category, String supplier, String material, String notes) { }
