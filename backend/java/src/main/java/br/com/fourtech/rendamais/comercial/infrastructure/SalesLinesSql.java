package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.domain.SalesLine;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Gravação e leitura das linhas comerciais, iguais em proposal_line e sales_order_line. */
final class SalesLinesSql {

    private SalesLinesSql() { }

    /** {@code table} e {@code parent} são constantes deste pacote, nunca vindas do usuário. */
    static void insert(JdbcClient jdbc, String table, String parent, UUID parentId, List<SalesLine> lines) {
        int pos = 0;
        for (SalesLine l : lines) {
            jdbc.sql("insert into " + table + " (id, " + parent + ", position, kind, item_id, description, quantity, uom, unit_price,"
                            + " discount_cents, line_total_cents) values (:id, :parent, :pos, :kind, :item, :description, :qty, :uom,"
                            + " :price, :discount, :total)")
                    .param("id", l.id()).param("parent", parentId).param("pos", pos++).param("kind", l.kind().name())
                    .param("item", l.itemId()).param("description", l.description()).param("qty", l.quantity())
                    .param("uom", l.uom()).param("price", l.unitPrice()).param("discount", l.discountCents())
                    .param("total", l.totalCents())
                    .update();
        }
    }

    static List<SalesLine> load(JdbcClient jdbc, String table, String parent, UUID parentId) {
        return jdbc.sql("select l.*, i.code as item_code from " + table + " l left join item i on i.id = l.item_id where l." + parent
                        + " = :id order by l.position")
                .param("id", parentId).query((rs, n) -> {
                    var qty = rs.getBigDecimal("quantity");
                    var price = rs.getBigDecimal("unit_price");
                    long discount = rs.getLong("discount_cents");
                    return new SalesLine(rs.getObject("id", UUID.class), SalesLine.Kind.valueOf(rs.getString("kind")),
                            rs.getObject("item_id", UUID.class), rs.getString("item_code"), rs.getString("description"), qty,
                            rs.getString("uom"), price, discount, SalesLine.gross(qty, price), rs.getLong("line_total_cents"));
                }).list();
    }

    static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    static LocalDate localDate(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    static Date date(LocalDate d) {
        return d == null ? null : Date.valueOf(d);
    }
}
