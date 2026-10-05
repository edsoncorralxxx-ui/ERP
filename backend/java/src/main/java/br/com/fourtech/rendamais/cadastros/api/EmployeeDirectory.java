package br.com.fourtech.rendamais.cadastros.api;

import java.util.List;

/** Colaboradores ativos, para os outros módulos escolherem responsáveis (vendedor, comprador, técnico). */
public interface EmployeeDirectory {

    /** Colaborador ativo com esse nome (o responsável do CRM é gravado pelo nome). */
    boolean isActive(String name);

    /** Nomes dos colaboradores ativos, em ordem alfabética. */
    List<String> activeNames();
}
