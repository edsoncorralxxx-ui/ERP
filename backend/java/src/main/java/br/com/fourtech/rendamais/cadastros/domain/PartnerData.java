package br.com.fourtech.rendamais.cadastros.domain;

import java.util.List;
import java.util.Map;

/**
 * Dados informados pelo usuário para o parceiro (antes da validação). Lista nula ou {@code supplier} nulo mantém o que
 * o parceiro já tem: a ficha do cliente não mexe nos dados de fornecedor, e a do fornecedor não mexe nas unidades.
 * {@code profile} nulo mantém os campos da ficha (Ficha {@link Partner#PROFILE}); um mapa substitui todos.
 */
public record PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                          List<ContactData> contacts, SupplierData supplier, Map<String, Object> profile) {

    /** Dados só de cliente e contatos (ficha do cliente). */
    public PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                       List<ContactData> contacts) {
        this(legalName, tradeName, cnpj, group, units, contacts, null, null);
    }

    public PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                       List<ContactData> contacts, SupplierData supplier) {
        this(legalName, tradeName, cnpj, group, units, contacts, supplier, null);
    }

    /**
     * {@code id} vazio numa unidade ou contato novo; preenchido para manter a identidade dos existentes. {@code kind}
     * (COBRANCA, ENTREGA, UNIDADE, FATURAMENTO) e {@code isDefault} nulos valem UNIDADE e não padrão; o nome vazio vira
     * "Tipo — cidade" (a aba Endereços do mock não tem nome).
     */
    public record UnitData(String id, String name, String street, String number, String district, String city,
                           String state, String postalCode, String cnpj, String kind, Boolean isDefault) {
        public UnitData(String id, String name, String street, String number, String district, String city, String state,
                        String postalCode, String cnpj) {
            this(id, name, street, number, district, city, state, postalCode, cnpj, null, null);
        }
    }

    public record ContactData(String id, String name, String role, String phone, String email, Boolean primary,
                              Boolean receivesInvoices) {
        public ContactData(String id, String name, String role, String phone, String email) {
            this(id, name, role, phone, email, null, null);
        }
    }

    /** Categorias já conferidas pelo caso de uso (existem e estão ativas). */
    public record SupplierData(Integer leadTimeDays, String paymentTerms, List<Partner.Category> categories) { }
}
