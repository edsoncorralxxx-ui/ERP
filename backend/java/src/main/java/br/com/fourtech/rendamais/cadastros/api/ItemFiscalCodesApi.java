package br.com.fourtech.rendamais.cadastros.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Itens vistos pela classificação fiscal (Sprint 12): o fiscal guarda o perfil fiscal do item, mas o NCM (produto) e o
 * item da LC 116 (serviço) continuam no cadastro e são gravados por aqui, com as regras, a trilha e o evento do cadastro.
 */
public interface ItemFiscalCodesApi {

    /** {@code nature} é MATERIAL ou SERVICO; NCM com 8 dígitos e item da LC 116 como 14.01. */
    record FiscalItem(UUID id, String code, String description, String nature, String category, boolean active, String ncm,
                      String serviceCode, long version) { }

    /** Todos os itens (ativos e inativos), pelo código. */
    List<FiscalItem> fiscalItems();

    Optional<FiscalItem> fiscalItem(UUID id);

    /**
     * Grava o NCM (produto) ou o item da LC 116 (serviço) pela alteração do cadastro (exige {@code item.update}); recusa
     * com os campos {@code ncm} ou {@code serviceCode} se o código for inválido. Sem mudança, não grava nada.
     */
    FiscalItem updateCodes(UUID id, String ncm, String serviceCode);
}
