package br.com.fourtech.rendamais.cadastros.domain;

import java.util.List;

/**
 * Dados informados pelo usuário para o material ou serviço (antes da validação). Números vêm como texto com ponto
 * decimal ("184.50"), para não passar por ponto flutuante (ADR-006).
 */
public record ItemData(String description, String nature, String uom, String categoryId, Boolean stockControlled,
                       String referenceCost, List<ConversionData> conversions) {

    /** 1 {@code fromUom} = {@code factor} unidades do item. {@code id} vazio numa conversão nova. */
    public record ConversionData(String id, String fromUom, String factor) { }
}
