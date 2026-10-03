package br.com.fourtech.rendamais.acesso.api;

import java.util.List;

/** Usuários ativos para os outros módulos escolherem um responsável (Sprint 11: responsável no CRM). */
public interface UserDirectory {

    record UserRef(String username, String displayName) { }

    List<UserRef> activeUsers();
}
