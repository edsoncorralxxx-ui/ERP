package br.com.fourtech.rendamais.cadastros.domain;

import java.util.List;

/**
 * Dados informados pelo usuário para o parceiro (antes da validação). Lista nula ou {@code supplier} nulo mantém o que
 * o parceiro já tem: a ficha do cliente não mexe nos dados de fornecedor, e a do fornecedor não mexe nas unidades.
 */
public record PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                          List<ContactData> contacts, SupplierData supplier) {

    /** Dados só de cliente e contatos (ficha do cliente). */
    public PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                       List<ContactData> contacts) {
        this(legalName, tradeName, cnpj, group, units, contacts, null);
    }

    /** {@code id} vazio numa unidade ou contato novo; preenchido para manter a identidade dos existentes. */
    public record UnitData(String id, String name, String street, String number, String district, String city,
                           String state, String postalCode) { }

    public record ContactData(String id, String name, String role, String phone, String email) { }

    /** Categorias já conferidas pelo caso de uso (existem e estão ativas). */
    public record SupplierData(Integer leadTimeDays, String paymentTerms, List<Partner.Category> categories) { }
}
