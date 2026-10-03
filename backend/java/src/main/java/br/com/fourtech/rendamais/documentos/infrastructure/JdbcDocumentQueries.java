package br.com.fourtech.rendamais.documentos.infrastructure;

import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/** Receita por competência e por anexo e as notas da competência, somadas das linhas das notas ativas. */
@Component
class JdbcDocumentQueries implements DocumentQueryApi {

    private final JdbcClient jdbc;

    JdbcDocumentQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<YearMonth, Revenue> revenue(YearMonth from, YearMonth to) {
        Map<YearMonth, Map<String, Long>> byAnnex = new TreeMap<>();
        Map<YearMonth, Integer> documents = new HashMap<>();
        jdbc.sql("""
                select d.competence, l.annex, sum(l.amount_cents) as cents
                  from business_document d join document_line l on l.document_id = d.id
                 where d.status = 'ATIVO' and d.direction = 'SAIDA' and d.competence between :from and :to
                 group by d.competence, l.annex
                """)
                .param("from", from.toString()).param("to", to.toString())
                .query(rs -> {
                    byAnnex.computeIfAbsent(YearMonth.parse(rs.getString("competence")), k -> new HashMap<>())
                            .put(rs.getString("annex"), rs.getLong("cents"));
                });
        jdbc.sql("""
                select d.competence, count(*) as documents from business_document d
                 where d.status = 'ATIVO' and d.direction = 'SAIDA' and d.competence between :from and :to
                 group by d.competence
                """)
                .param("from", from.toString()).param("to", to.toString())
                .query(rs -> {
                    documents.put(YearMonth.parse(rs.getString("competence")), rs.getInt("documents"));
                });
        Map<YearMonth, Revenue> out = new TreeMap<>();
        byAnnex.forEach((c, m) -> out.put(c, new Revenue(m, documents.getOrDefault(c, 0))));
        return out;
    }

    @Override
    public List<AnnexPart> parts(YearMonth competence) {
        return jdbc.sql("""
                select d.id, d.code, d.series, d.number, d.issue_date, d.version, d.authorization_status, p.code as customer_code,
                       p.legal_name, o.code as order_code, l.annex, sum(l.amount_cents) as cents,
                       count(*) filter (where l.annex_source = 'PADRAO') as default_lines,
                       min(l.description) as description,
                       (select case when bool_and(x.kind = 'SERVICO') then 'SERVICO' when bool_or(x.kind = 'SERVICO') then 'MISTO'
                                    else 'PRODUTO' end from document_line x where x.document_id = d.id) as kind
                  from business_document d
                  join partner p on p.id = d.partner_id
                  left join sales_order o on o.id = d.order_id
                  join document_line l on l.document_id = d.id
                 where d.status = 'ATIVO' and d.direction = 'SAIDA' and d.competence = :c
                 group by d.id, p.code, p.legal_name, o.code, l.annex
                 order by l.annex, d.issue_date, d.code
                """)
                .param("c", competence.toString())
                .query((rs, n) -> new AnnexPart(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("kind"),
                        rs.getString("series"), rs.getString("number"), rs.getDate("issue_date").toLocalDate(), rs.getString("customer_code"),
                        rs.getString("legal_name"), rs.getString("order_code"), rs.getString("description"), rs.getString("annex"),
                        rs.getLong("cents"), rs.getInt("default_lines"), rs.getString("authorization_status"), rs.getLong("version")))
                .list();
    }
}
