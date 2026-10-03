package br.com.fourtech.rendamais.documentos.api;

import java.time.YearMonth;
import java.util.Collection;
import java.util.UUID;

/**
 * Anexo das linhas das notas depois da classificação fiscal do item (Sprint 12): as linhas que ficaram com o anexo
 * padrão (item sem classificação) passam ao anexo da classificação, fora das competências encerradas. Escreve na
 * transação do chamador e não confere permissão — quem chama confere a sua.
 */
public interface DocumentAnnexApi {

    /** Linhas das notas ativas com o item e o anexo padrão passam a {@code annex} (I a V); devolve quantas mudaram. */
    int applyItemAnnex(UUID itemId, String annex, Collection<YearMonth> closedCompetences);
}
