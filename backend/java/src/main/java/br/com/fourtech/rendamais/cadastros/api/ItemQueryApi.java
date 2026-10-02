package br.com.fourtech.rendamais.cadastros.api;

import java.util.Optional;
import java.util.UUID;

/** Consulta pública de produtos e serviços para os outros módulos (linhas de proposta e de pedido). */
public interface ItemQueryApi {

    /** {@code nature} é MATERIAL ou SERVICO; {@code active} é falso quando o item foi inativado. */
    /** {@code referenceCost} é o custo de referência do cadastro (pode ser vazio). */
    record ItemRef(UUID id, String code, String description, String nature, String uom, boolean active,
                   java.math.BigDecimal referenceCost) { }

    Optional<ItemRef> item(UUID id);
}
