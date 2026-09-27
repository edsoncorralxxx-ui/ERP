package br.com.fourtech.rendamais.plataforma.empresa.application;

import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfile;

/** Porta de persistência dos dados da empresa. */
public interface CompanyProfileRepository {

    CompanyProfile get();

    /** Lê com bloqueio para atualização dentro da transação corrente. */
    CompanyProfile getForUpdate();

    /** Grava se a versão armazenada ainda for {@code expectedVersion}; devolve false caso contrário. */
    boolean save(CompanyProfile profile, long expectedVersion);
}
