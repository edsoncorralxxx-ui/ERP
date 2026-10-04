package br.com.fourtech.rendamais.consultas;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.kernel.Cnpj;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Listas de cadastro do mock (Sprint 13, "Lista de cadastro"): uma rota por cadastro, com as colunas do mock já calculadas
 * — saldo em aberto do cliente e a pagar do fornecedor (financeiro), em estoque e custo médio (estoque), preço de venda
 * (ficha do item). {@code status} ATIVO, INATIVO ou TODOS; {@code search} busca em código, nome, documento e cidade.
 * Cada linha traz {@code id} (o registro que a seta abre), {@code status} e as colunas pelo nome.
 */
@RestController
class CadastroListsController {

    private final JdbcClient jdbc;

    CadastroListsController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static final String CITY = """
            left join lateral (select city, state from partner_unit u where u.partner_id = p.id
                                order by u.is_default desc, (u.kind = 'COBRANCA') desc, u.position limit 1) u on true
            """;

    @GetMapping("/api/v1/cadastros/{cadastro}")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(@PathVariable String cadastro, @RequestParam(value = "search", required = false) String search,
                                          @RequestParam(value = "status", defaultValue = "TODOS") String status) {
        String term = search == null || search.isBlank() ? null : search.strip();
        String st = "TODOS".equalsIgnoreCase(status) ? null : status.toUpperCase(java.util.Locale.ROOT);
        return switch (cadastro) {
            case "clientes" -> partners("CLIENTE", term, st);
            case "fornecedores" -> partners("FORNECEDOR", term, st);
            case "transportadoras" -> partners("TRANSPORTADORA", term, st);
            case "contatos" -> contacts(term, st);
            case "colaboradores" -> employees(term, st);
            case "produtos" -> items("PRODUTO", term, st);
            case "servicos" -> items("SERVICO", term, st);
            case "materiais" -> items("MATERIAL", term, st);
            case "depositos" -> warehouses(term, st);
            default -> throw new NotFoundException("Cadastro não encontrado.");
        };
    }

    private List<Map<String, Object>> partners(String role, String term, String st) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        String direction = role.equals("CLIENTE") ? "RECEIVABLE" : "PAYABLE";
        return jdbc.sql("""
                select p.id, p.code, p.legal_name, p.trade_name, p.cnpj, p.group_name, r.status, u.city, u.state,
                       p.profile ->> 'supplierCategory' as supplier_category, p.profile ->> 'modal' as modal,
                       p.supplier_lead_time_days,
                       (select string_agg(c.name, ', ' order by s.position) from partner_supplied_category s
                          join item_category c on c.id = s.category_id where s.partner_id = p.id) as categories,
                       coalesce((select sum(t.original_cents - t.received_cents) from financial_title t
                                  where t.counterparty_id = p.id and t.direction = :direction and t.lifecycle = 'ACTIVE'), 0) as balance
                  from partner p join partner_role r on r.partner_id = p.id and r.role = :role
                """ + CITY + """
                 where (cast(:st as varchar) is null or r.status = cast(:st as varchar))
                   and (cast(:term as varchar) is null or p.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%' or p.trade_name ilike '%' || cast(:term as varchar) || '%'
                        or p.cnpj like '%' || regexp_replace(cast(:term as varchar), '[^0-9A-Za-z]', '', 'g') || '%'
                        or u.city ilike '%' || cast(:term as varchar) || '%')
                 order by p.code
                """).param("role", role).param("direction", direction).param("st", st).param("term", term)
                .query((rs, n) -> {
                    Map<String, Object> m = row(rs);
                    m.put("code", rs.getString("code"));
                    m.put("legalName", rs.getString("legal_name"));
                    m.put("tradeName", rs.getString("trade_name"));
                    m.put("cnpj", rs.getString("cnpj") == null ? null : Cnpj.of(rs.getString("cnpj")).formatted());
                    m.put("cityUf", cityUf(rs));
                    m.put("group", rs.getString("group_name"));
                    String cat = rs.getString("supplier_category");
                    m.put("category", cat != null ? cat : rs.getString("categories"));
                    m.put("leadTimeDays", rs.getObject("supplier_lead_time_days"));
                    m.put("modal", rs.getString("modal"));
                    m.put("balanceCents", rs.getLong("balance"));
                    m.put("freightsYear", null);
                    return m;
                }).list();
    }

    private List<Map<String, Object>> contacts(String term, String st) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        return jdbc.sql("""
                select c.id as contact_id, p.id, c.name, coalesce(p.trade_name, p.legal_name) as company, c.role, c.phone, c.email,
                       c.is_primary, p.status,
                       (select r.role from partner_role r where r.partner_id = p.id order by case r.role when 'CLIENTE' then 0
                          when 'FORNECEDOR' then 1 else 2 end limit 1) as partner_role
                  from partner_contact c join partner p on p.id = c.partner_id
                 where (cast(:st as varchar) is null or p.status = cast(:st as varchar))
                   and (cast(:term as varchar) is null or c.name ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%' or p.trade_name ilike '%' || cast(:term as varchar) || '%'
                        or c.email ilike '%' || cast(:term as varchar) || '%')
                 order by c.name
                """).param("st", st).param("term", term).query((rs, n) -> {
            Map<String, Object> m = row(rs);
            m.put("contactId", rs.getString("contact_id"));
            m.put("name", rs.getString("name"));
            m.put("company", rs.getString("company"));
            m.put("role", rs.getString("role"));
            m.put("phone", rs.getString("phone"));
            m.put("email", rs.getString("email"));
            m.put("primary", rs.getBoolean("is_primary"));
            m.put("partnerRole", rs.getString("partner_role"));
            return m;
        }).list();
    }

    private List<Map<String, Object>> employees(String term, String st) {
        CurrentUserHolder.require(Permissions.EMPLOYEE_READ);
        return jdbc.sql("""
                select id, code, name, department, job_title, cost_center, admission_date, status from employee
                 where (cast(:st as varchar) is null or status = cast(:st as varchar))
                   and (cast(:term as varchar) is null or code ilike '%' || cast(:term as varchar) || '%' or name ilike '%' || cast(:term as varchar) || '%'
                        or department ilike '%' || cast(:term as varchar) || '%' or job_title ilike '%' || cast(:term as varchar) || '%')
                 order by code
                """).param("st", st).param("term", term).query((rs, n) -> {
            Map<String, Object> m = row(rs);
            m.put("code", rs.getString("code"));
            m.put("name", rs.getString("name"));
            m.put("department", rs.getString("department"));
            m.put("jobTitle", rs.getString("job_title"));
            m.put("costCenter", rs.getString("cost_center"));
            m.put("admissionDate", rs.getDate("admission_date") == null ? null : rs.getDate("admission_date").toLocalDate().toString());
            return m;
        }).list();
    }

    private List<Map<String, Object>> items(String type, String term, String st) {
        CurrentUserHolder.require(Permissions.ITEM_READ);
        return jdbc.sql("""
                select i.id, i.code, i.description, c.name as category, i.uom_code, i.service_code, i.status, i.reference_cost,
                       i.profile ->> 'brand' as brand_code,
                       (select e.description from reference_entry e where e.table_code = 'MARCA' and e.code = i.profile ->> 'brand') as brand,
                       (i.profile ->> 'salePriceCents')::bigint as sale_price, i.profile ->> 'minStock' as min_stock,
                       b.on_hand, b.average_cost
                  from item i join item_category c on c.id = i.category_id
                  left join lateral (select sum(on_hand) as on_hand,
                                            sum(on_hand * average_cost) / nullif(sum(case when average_cost is not null then on_hand end), 0) as average_cost
                                       from item_stock_balance s where s.item_id = i.id) b on true
                 where i.item_type = :type
                   and (cast(:st as varchar) is null or i.status = cast(:st as varchar))
                   and (cast(:term as varchar) is null or i.code ilike '%' || cast(:term as varchar) || '%'
                        or i.description ilike '%' || cast(:term as varchar) || '%' or c.name ilike '%' || cast(:term as varchar) || '%')
                 order by i.code
                """).param("type", type).param("st", st).param("term", term).query((rs, n) -> {
            Map<String, Object> m = row(rs);
            m.put("code", rs.getString("code"));
            m.put("description", rs.getString("description"));
            m.put("category", rs.getString("category"));
            m.put("brand", rs.getString("brand") != null ? rs.getString("brand") : rs.getString("brand_code"));
            m.put("uom", rs.getString("uom_code"));
            m.put("serviceCode", rs.getString("service_code"));
            m.put("salePriceCents", rs.getObject("sale_price"));
            m.put("onHand", plain(rs.getBigDecimal("on_hand")));
            m.put("minStock", rs.getString("min_stock"));
            java.math.BigDecimal avg = rs.getBigDecimal("average_cost");
            m.put("averageCost", plain(avg != null ? avg : rs.getBigDecimal("reference_cost")));
            return m;
        }).list();
    }

    private List<Map<String, Object>> warehouses(String term, String st) {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return jdbc.sql("""
                select w.id, w.code, w.name, w.kind, w.address, w.responsible, w.status,
                       (select count(*) from stock_location l where l.warehouse_id = w.id and l.level = 'POSICAO') as positions
                  from warehouse w
                 where (cast(:st as varchar) is null or w.status = cast(:st as varchar))
                   and (cast(:term as varchar) is null or w.code ilike '%' || cast(:term as varchar) || '%' or w.name ilike '%' || cast(:term as varchar) || '%')
                 order by w.code
                """).param("st", st).param("term", term).query((rs, n) -> {
            Map<String, Object> m = row(rs);
            m.put("code", rs.getString("code"));
            m.put("name", rs.getString("name"));
            m.put("kind", rs.getString("kind"));
            m.put("address", rs.getString("address"));
            m.put("responsible", rs.getString("responsible"));
            m.put("positions", rs.getLong("positions"));
            return m;
        }).list();
    }

    private static Map<String, Object> row(ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("status", rs.getString("status"));
        return m;
    }

    private static String cityUf(ResultSet rs) throws SQLException {
        String city = rs.getString("city"), state = rs.getString("state");
        if (city == null && state == null) return null;
        return (city == null ? "" : city) + (state == null ? "" : " / " + state);
    }

    private static String plain(java.math.BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }
}
