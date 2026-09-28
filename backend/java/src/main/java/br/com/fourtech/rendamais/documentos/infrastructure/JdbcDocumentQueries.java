package br.com.fourtech.rendamais.documentos.infrastructure;

import br.com.fourtech.rendamais.documentos.api.DocumentQueryApi;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/** Receita por competência e notas da competência, somadas das linhas das notas ativas. */
@Component
class JdbcDocumentQueries implements DocumentQueryApi {

    private final JdbcClient jdbc;

    JdbcDocumentQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<YearMonth, Revenue> revenue(YearMonth from, YearMonth to) {
        Map<YearMonth, Revenue> out = new TreeMap<>();
        jdbc.sql("""
                select d.competence,
                       coalesce(sum(l.amount_cents) filter (where l.kind = 'PRODUTO'), 0) as product,
                       coalesce(sum(l.amount_cents) filter (where l.kind = 'SERVICO'), 0) as service,
                       count(distinct d.id) as documents
                  from business_document d join document_line l on l.document_id = d.id
                 where d.status = 'ATIVO' and d.direction = 'SAIDA' and d.competence between :from and :to
                 group by d.competence
                """)
                .param("from", from.toString()).param("to", to.toString())
                .query(rs -> {
                    out.put(YearMonth.parse(rs.getString("competence")),
                            new Revenue(rs.getLong("product"), rs.getLong("service"), rs.getInt("documents")));
                });
        return out;
    }

    @Override
    public List<DocumentRef> documents(YearMonth competence) {
        return jdbc.sql("""
                select d.id, d.code, d.series, d.number, d.issue_date, p.code as customer_code, p.legal_name, o.code as order_code,
                       coalesce(sum(l.amount_cents) filter (where l.kind = 'PRODUTO'), 0) as product,
                       coalesce(sum(l.amount_cents) filter (where l.kind = 'SERVICO'), 0) as service
                  from business_document d
                  join partner p on p.id = d.partner_id
                  left join sales_order o on o.id = d.order_id
                  join document_line l on l.document_id = d.id
                 where d.status = 'ATIVO' and d.direction = 'SAIDA' and d.competence = :c
                 group by d.id, p.code, p.legal_name, o.code
                 order by d.issue_date, d.code
                """)
                .param("c", competence.toString())
                .query((rs, n) -> {
                    long product = rs.getLong("product");
                    long service = rs.getLong("service");
                    String kind = product > 0 && service > 0 ? "MISTO" : service > 0 ? "SERVICO" : "PRODUTO";
                    return new DocumentRef(rs.getObject("id", UUID.class), rs.getString("code"), kind, rs.getString("series"),
                            rs.getString("number"), rs.getDate("issue_date").toLocalDate(), rs.getString("customer_code"),
                            rs.getString("legal_name"), rs.getString("order_code"), product, service, product + service);
                })
                .list();
    }
}
