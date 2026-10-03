package br.com.fourtech.rendamais.documentos.api;

import java.util.UUID;

/**
 * Porta implementada pelo módulo fiscal (Sprint 12): o anexo do Simples Nacional de uma linha da nota, pela linha do
 * pedido. Chamada no registro da nota; o anexo fica gravado na linha (cópia do momento), para a receita de um mês não
 * mudar quando a classificação do item mudar.
 */
public interface AnnexResolver {

    /** Anexo (I a V) e a origem: CLASSIFICACAO (do item), EQUIPAMENTO (fabricação própria) ou PADRAO (item sem classificação). */
    record Resolved(String annex, String source) { }

    /** @param orderLineKind EQUIPAMENTO, MATERIAL ou SERVICO; {@code itemId} é vazio no equipamento */
    Resolved resolve(String orderLineKind, UUID itemId);
}
