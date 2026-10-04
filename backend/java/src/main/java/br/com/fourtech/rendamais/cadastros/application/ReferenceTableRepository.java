package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.TabelaAuxiliar;

import java.time.Instant;
import java.util.List;

/** Porta de persistência das tabelas editáveis (unidades e categorias nas tabelas próprias; as demais em reference_entry). */
public interface ReferenceTableRepository {

    record Entry(String id, String code, String description, java.util.Map<String, Object> attrs, boolean active, long usage) { }

    /** Versão da tabela, travando a linha quando {@code forUpdate}. */
    long version(TabelaAuxiliar table, boolean forUpdate);

    List<Entry> rows(TabelaAuxiliar table);

    /** Substitui a tabela pelas linhas dadas, na ordem; devolve a nova versão. Linhas removidas que estão em uso: erro. */
    long replace(TabelaAuxiliar table, List<TabelaAuxiliar.Valid> rows, Instant now, String actor);
}
