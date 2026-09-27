package br.com.fourtech.rendamais.plataforma.empresa.domain;

/** Dados informados pelo usuário para os dados cadastrais da empresa (antes da validação). */
public record CompanyProfileData(String legalName, String tradeName, String cnpj, Address address,
                                 String phone, String email) { }
