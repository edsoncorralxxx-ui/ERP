package br.com.fourtech.rendamais.cadastros.domain;

import java.util.List;
import java.util.Map;

/**
 * Dados informados pelo usuário para o produto ou serviço (antes da validação). Números vêm como texto com ponto
 * decimal ("184.50"), para não passar por ponto flutuante (ADR-006). {@code type} (PRODUTO, MATERIAL, SERVICO) nulo vem da
 * natureza; {@code profile} nulo mantém os campos da ficha ({@link Item#PROFILE}).
 */
public record ItemData(String description, String nature, String uom, String categoryId, Boolean stockControlled,
                       String referenceCost, String ncm, String serviceCode, List<ConversionData> conversions, String type,
                       Map<String, Object> profile) {

    public ItemData(String description, String nature, String uom, String categoryId, Boolean stockControlled, String referenceCost,
                    String ncm, String serviceCode, List<ConversionData> conversions) {
        this(description, nature, uom, categoryId, stockControlled, referenceCost, ncm, serviceCode, conversions, null, null);
    }

    /** 1 {@code fromUom} = {@code factor} unidades do item. {@code id} vazio numa conversão nova. */
    public record ConversionData(String id, String fromUom, String factor) { }
}
