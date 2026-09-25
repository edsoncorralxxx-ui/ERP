package br.com.fourtech.rendamais.cadastros.domain;

import java.util.List;

/** Dados informados pelo usuário para o cliente (antes da validação). */
public record PartnerData(String legalName, String tradeName, String cnpj, String group, List<UnitData> units,
                          List<ContactData> contacts) {

    /** {@code id} vazio numa unidade ou contato novo; preenchido para manter a identidade dos existentes. */
    public record UnitData(String id, String name, String street, String number, String district, String city,
                           String state, String postalCode) { }

    public record ContactData(String id, String name, String role, String phone, String email) { }
}
