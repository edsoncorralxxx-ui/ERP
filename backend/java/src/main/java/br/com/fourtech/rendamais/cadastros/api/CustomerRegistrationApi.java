package br.com.fourtech.rendamais.cadastros.api;

import java.util.UUID;

/**
 * Cadastro de cliente pedido por outro módulo (Sprint 11: "Converter em cliente" na prospecção do CRM), na transação do
 * chamador. Confere a permissão partner.create e grava auditoria e evento como o cadastro feito na ficha do cliente.
 */
public interface CustomerRegistrationApi {

    /** Cliente com uma unidade (cidade e UF da prospecção) e, se houver, o contato. */
    record NewCustomer(String legalName, String tradeName, String unitName, String city, String state, String contactName,
                       String contactPhone, String contactEmail) { }

    /** Cadastra o cliente; a mesma chave devolve o mesmo cliente. */
    UUID register(String idempotencyKey, NewCustomer customer);
}
