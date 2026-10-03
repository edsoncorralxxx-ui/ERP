package br.com.fourtech.rendamais.documentos.infrastructure;

import br.com.fourtech.rendamais.documentos.api.DocumentAnnexApi;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.YearMonth;
import java.util.Collection;
import java.util.UUID;

/** Reclassifica as linhas com o anexo padrão quando o item ganha a classificação fiscal. */
@Component
class JdbcDocumentAnnexes implements DocumentAnnexApi {

    private final JdbcClient jdbc;

    JdbcDocumentAnnexes(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int applyItemAnnex(UUID itemId, String annex, Collection<YearMonth> closedCompetences) {
        String[] closed = closedCompetences.stream().map(YearMonth::toString).toArray(String[]::new);
        return jdbc.sql("""
                update document_line l set annex = :annex, annex_source = 'CLASSIFICACAO'
                  from business_document d
                 where d.id = l.document_id and d.status = 'ATIVO' and l.item_id = :item and l.annex_source = 'PADRAO'
                   and not (d.competence = any (:closed))
                """)
                .param("annex", annex).param("item", itemId).param("closed", closed).update();
    }
}
