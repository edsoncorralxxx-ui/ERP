package br.com.fourtech.rendamais.consultas;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Indicadores do cabeçalho das fichas do mock (Sprint 13): no parceiro, saldo em aberto, pedidos em aberto, equipamentos
 * instalados e oportunidades (cliente), saldo a pagar (fornecedor), frete a pagar (transportadora) e o crédito utilizado;
 * no item, quantidades (em estoque, reservado, disponível, em pedido), custo médio, preço, contratos e execuções no ano,
 * margem estimada e os componentes do primeiro nível da BOM. Número que depende de módulo que ainda não existe vem nulo.
 */
@RestController
class FichaSummaryController {

    private final JdbcClient jdbc;
    private final Clock clock;

    FichaSummaryController(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/api/v1/cadastros/partners/{id}/summary")
    @Transactional(readOnly = true)
    public Map<String, Object> partner(@PathVariable UUID id, @RequestParam(value = "role", defaultValue = "CLIENTE") String role) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        if (jdbc.sql("select count(*) from partner where id = :id").param("id", id).query(Long.class).single() == 0) {
            throw new NotFoundException("Parceiro não encontrado.");
        }
        Map<String, Object> m = new LinkedHashMap<>();
        long receivable = open(id, "RECEIVABLE"), payable = open(id, "PAYABLE");
        m.put("openReceivableCents", receivable);
        m.put("openPayableCents", payable);
        m.put("openOrdersCents", jdbc.sql("""
                select coalesce(sum(o.total_cents - coalesce((select sum(t.received_cents) from financial_title t
                         where t.origin_type = 'SALES_ORDER_INSTALLMENT' and t.origin_id like o.id::text || '%' and t.lifecycle = 'ACTIVE'), 0)), 0)
                  from sales_order o where o.customer_id = :id and o.status in ('DRAFT', 'CONFIRMED', 'IN_EXECUTION')
                """).param("id", id).query(Long.class).single());
        m.put("equipmentCount", jdbc.sql("select count(*) from equipment where customer_id = :id and status = 'ATIVO'").param("id", id)
                .query(Long.class).single());
        m.put("openOpportunities", jdbc.sql("select count(*) from opportunity where customer_id = :id and status = 'ABERTA'").param("id", id)
                .query(Long.class).single());
        m.put("creditUsedCents", receivable);
        m.put("purchaseOrdersCents", null);
        m.put("pendingReceiptsCents", null);
        m.put("openQuotations", null);
        m.put("freightsYear", null);
        m.put("inTransit", null);
        m.put("occurrences", null);
        return m;
    }

    private long open(UUID partner, String direction) {
        return jdbc.sql("""
                select coalesce(sum(original_cents - received_cents), 0) from financial_title
                 where counterparty_id = :id and direction = :d and lifecycle = 'ACTIVE'
                """).param("id", partner).param("d", direction).query(Long.class).single();
    }

    @GetMapping("/api/v1/cadastros/items/{id}/summary")
    @Transactional(readOnly = true)
    public Map<String, Object> item(@PathVariable UUID id) {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        record Head(String code, BigDecimal referenceCost, Long salePrice, String bomRef) { }
        Head h = jdbc.sql("""
                select code, reference_cost, (profile ->> 'salePriceCents')::bigint as sale_price, profile ->> 'bomReference' as bom_ref
                  from item where id = :id
                """).param("id", id).query((rs, n) -> new Head(rs.getString("code"), rs.getBigDecimal("reference_cost"),
                (Long) rs.getObject("sale_price"), rs.getString("bom_ref"))).optional()
                .orElseThrow(() -> new NotFoundException("Item não encontrado."));
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Object> stock = jdbc.sql("""
                select coalesce(sum(on_hand), 0) as on_hand, coalesce(sum(reserved), 0) as reserved, coalesce(sum(on_order), 0) as on_order,
                       sum(on_hand * average_cost) / nullif(sum(case when average_cost is not null then on_hand end), 0) as average_cost
                  from item_stock_balance where item_id = :id
                """).param("id", id).query((rs, n) -> {
            Map<String, Object> s = new LinkedHashMap<>();
            BigDecimal oh = rs.getBigDecimal("on_hand"), r = rs.getBigDecimal("reserved");
            s.put("onHand", plain(oh));
            s.put("reserved", plain(r));
            s.put("available", plain(oh.subtract(r)));
            s.put("onOrder", plain(rs.getBigDecimal("on_order")));
            s.put("averageCost", plain(rs.getBigDecimal("average_cost")));
            return s;
        }).single();
        m.putAll(stock);
        if (m.get("averageCost") == null && h.referenceCost() != null) m.put("averageCost", plain(h.referenceCost()));
        m.put("salePriceCents", h.salePrice());
        m.put("standardCost", plain(h.referenceCost()));
        int year = LocalDate.now(clock.withZone(ZoneId.of("America/Sao_Paulo"))).getYear();
        m.put("activeContracts", jdbc.sql("""
                select count(distinct o.id) from sales_order o join sales_order_line l on l.order_id = o.id
                 where l.item_id = :id and o.status in ('CONFIRMED', 'IN_EXECUTION')
                """).param("id", id).query(Long.class).single());
        m.put("executionsYear", jdbc.sql("""
                select coalesce(sum(l.quantity), 0) from sales_order o join sales_order_line l on l.order_id = o.id
                 where l.item_id = :id and o.status <> 'CANCELLED' and o.status <> 'DRAFT' and extract(year from o.contract_date) = :y
                """).param("id", id).param("y", year).query(BigDecimal.class).single().stripTrailingZeros().toPlainString());
        if (h.salePrice() != null && h.salePrice() > 0 && h.referenceCost() != null) {
            BigDecimal price = BigDecimal.valueOf(h.salePrice(), 2);
            m.put("marginPercent", price.subtract(h.referenceCost()).multiply(BigDecimal.valueOf(100))
                    .divide(price, 2, java.math.RoundingMode.HALF_EVEN).toPlainString());
        } else {
            m.put("marginPercent", null);
        }
        List<Map<String, Object>> components = h.bomRef() == null ? List.of() : jdbc.sql("""
                select l.position, l.kind, coalesce(i.code, cb.code, l.reference_code) as code, l.description, l.quantity, l.uom,
                       l.unit_cost, i.id as item_id, r.revision
                  from bom b join bom_revision r on r.bom_id = b.id join bom_line l on l.revision_id = r.id
                  left join item i on i.id = l.item_id
                  left join bom_revision cr on cr.id = l.child_revision_id left join bom cb on cb.id = cr.bom_id
                 where b.code = :ref order by l.position
                """).param("ref", h.bomRef()).query((rs, n) -> {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("code", rs.getString("code"));
            c.put("itemId", rs.getString("item_id"));
            c.put("kind", rs.getString("kind"));
            c.put("description", rs.getString("description"));
            c.put("quantity", plain(rs.getBigDecimal("quantity")));
            c.put("uom", rs.getString("uom"));
            BigDecimal q = rs.getBigDecimal("quantity"), u = rs.getBigDecimal("unit_cost");
            c.put("totalCost", q == null || u == null ? null : plain(q.multiply(u).setScale(2, java.math.RoundingMode.HALF_EVEN)));
            c.put("revision", rs.getInt("revision"));
            return c;
        }).list();
        m.put("bomComponents", components);
        m.put("whereUsed", jdbc.sql("""
                select distinct b.code, b.name from bom_line l join bom_revision r on r.id = l.revision_id join bom b on b.id = r.bom_id
                 where l.item_id = :id order by b.code
                """).param("id", id).query((rs, n) -> Map.of("code", rs.getString(1), "name", rs.getString(2))).list());
        return m;
    }

    private static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }
}
