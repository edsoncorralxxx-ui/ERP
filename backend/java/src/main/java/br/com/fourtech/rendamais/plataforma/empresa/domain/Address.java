package br.com.fourtech.rendamais.plataforma.empresa.domain;

/** Endereço da empresa. Campos opcionais; validação em {@link CompanyProfile}. */
public record Address(String street, String number, String complement, String district, String city,
                      String state, String postalCode) {

    public static Address empty() {
        return new Address(null, null, null, null, null, null, null);
    }
}
