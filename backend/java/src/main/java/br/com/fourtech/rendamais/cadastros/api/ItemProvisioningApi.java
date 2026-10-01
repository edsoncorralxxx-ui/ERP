package br.com.fourtech.rendamais.cadastros.api;

import java.util.Optional;
import java.util.UUID;

/**
 * Itens criados por outro módulo numa carga conferida (carga da BOM, Sprint 10), na transação do chamador. O item é
 * reconhecido pelo código de referência (do desenho, do fabricante ou gerado na carga) e, sem ele, pela descrição;
 * unidade e categoria que ainda não existem são cadastradas junto.
 */
public interface ItemProvisioningApi {

    /** {@code nature} é MATERIAL ou SERVICO. */
    record ItemRequest(String referenceCode, String description, String nature, String uom, String uomName, String categoryName) { }

    record ProvisionedItem(UUID id, String code, String referenceCode, boolean created) { }

    /** Item já cadastrado com o código de referência (sem diferenciar maiúsculas). */
    Optional<ItemQueryApi.ItemRef> itemByReferenceCode(String referenceCode);

    /** Item já cadastrado com a mesma descrição e natureza, sem código de referência informado na carga. */
    Optional<ItemQueryApi.ItemRef> itemByDescription(String description, String nature);

    /** Código de referência já guardado para o item, se houver. */
    Optional<String> referenceCodeOf(UUID itemId);

    boolean unitExists(String code);

    boolean categoryExists(String name);

    /** Maior número já usado nos códigos gerados com o prefixo (ex.: 12 para MEC-0012), ou 0. */
    int lastGeneratedNumber(String prefix);

    /** Encontra o item (pela referência ou, sem ela, pela descrição) ou o cadastra com a referência. */
    ProvisionedItem provision(ItemRequest request);
}
