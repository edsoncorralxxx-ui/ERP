package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Dados da oportunidade que o mock acrescenta (Sprint 13): o contato, os itens de interesse (com preço e quantidade, que
 * passam a dar o valor potencial) e a necessidade do cliente (tipo de indústria, moagem, moegas, local de instalação,
 * energia, implantação desejada e concorrente principal); e os documentos gerados dela (propostas e pedidos).
 */
@Service
public class OpportunityDetailsService {

    static final String ENTITY = "opportunity";
    /** Chaves da necessidade do cliente e o tamanho máximo do texto de cada uma. */
    static final Map<String, Integer> NEED = Map.of("industry", 60, "dailyCapacityTons", 6, "receivingPits", 3, "installationSite", 60,
            "power", 40, "desiredStart", 10, "mainCompetitor", 120);
    static final Set<String> NUMERIC = Set.of("dailyCapacityTons", "receivingPits");

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final AuditTrail audit;
    private final Clock clock;

    public OpportunityDetailsService(JdbcClient jdbc, JsonMapper json, AuditTrail audit, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.audit = audit;
        this.clock = clock;
    }

    public record Item(UUID itemId, String itemCode, String description, String uom, String quantity, String unitPrice, long totalCents) { }

    public record ItemData(String itemId, String description, String uom, String quantity, String unitPrice) { }

    public record Document(String kind, UUID id, String code, String date, Integer revision, long totalCents, String status) { }

    /**
     * {@code historicalWinPercent}: das oportunidades já fechadas que passaram pela etapa atual desta, quantas % foram ganhas
     * (nulo com menos de 5 fechadas). É o histórico real do funil, no lugar da "estimativa de IA" do mock.
     */
    public record Details(UUID opportunityId, String contactName, Map<String, Object> need, List<Item> items, long itemsTotalCents,
                          List<Document> documents, Integer historicalWinPercent, int historicalSample, long version) { }

    public record Data(String contactName, Map<String, Object> need, List<ItemData> items) { }

    @Transactional(readOnly = true)
    public Details get(UUID id) {
        CurrentUserHolder.require(Permissions.OPPORTUNITY_READ);
        return load(id);
    }

    /** Grava contato, necessidade e itens; com itens, o valor potencial passa a ser a soma deles. Versão da oportunidade. */
    @Transactional
    public Details update(UUID id, long expectedVersion, Data data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.OPPORTUNITY_UPDATE);
        var head = jdbc.sql("select status, version, potential_cents from opportunity where id = :id for update").param("id", id)
                .query((rs, n) -> new Object[] {rs.getString(1), rs.getLong(2), rs.getLong(3)}).optional()
                .orElseThrow(() -> new NotFoundException("Oportunidade não encontrada."));
        long version = (Long) head[1];
        if (version != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, version);
        if (!"ABERTA".equals(head[0])) throw new InvalidStateException("A oportunidade está fechada e não muda mais.");
        Details before = load(id);
        List<FieldIssue> issues = new ArrayList<>();
        String contact = data.contactName() == null || data.contactName().isBlank() ? null : data.contactName().strip();
        if (contact != null && contact.length() > 120) issues.add(new FieldIssue("contactName", "Máximo de 120 caracteres."));
        Map<String, Object> need = new LinkedHashMap<>();
        if (data.need() != null) {
            data.need().forEach((k, v) -> {
                if (!NEED.containsKey(k)) {
                    issues.add(new FieldIssue("need." + k, "Campo desconhecido."));
                    return;
                }
                String t = v == null ? "" : v.toString().strip();
                if (t.isEmpty()) return;
                if (t.length() > NEED.get(k)) issues.add(new FieldIssue("need." + k, "Máximo de " + NEED.get(k) + " caracteres."));
                else if (NUMERIC.contains(k) && !t.matches("\\d+")) issues.add(new FieldIssue("need." + k, "Informe um número inteiro."));
                else if (k.equals("desiredStart")) {
                    try {
                        need.put(k, LocalDate.parse(t).toString());
                    } catch (DateTimeParseException e) {
                        issues.add(new FieldIssue("need." + k, "Data inválida."));
                    }
                } else need.put(k, NUMERIC.contains(k) ? Long.parseLong(t) : t);
            });
        }
        List<Item> items = new ArrayList<>();
        List<ItemData> raw = data.items() == null ? List.of() : data.items();
        if (raw.size() > 100) issues.add(new FieldIssue("items", "Máximo de 100 itens."));
        for (int i = 0; i < raw.size(); i++) {
            ItemData d = raw.get(i);
            String f = "items[" + i + "].";
            UUID itemId = null;
            String code = null, desc = d.description() == null ? null : d.description().strip(), uom = d.uom() == null ? null : d.uom().strip();
            if (d.itemId() != null && !d.itemId().isBlank()) {
                try {
                    itemId = UUID.fromString(d.itemId().strip());
                    UUID fid = itemId;
                    var it = jdbc.sql("select code, description, uom_code from item where id = :id").param("id", fid)
                            .query((rs, n) -> new String[] {rs.getString(1), rs.getString(2), rs.getString(3)}).optional();
                    if (it.isEmpty()) issues.add(new FieldIssue(f + "itemId", "Item não encontrado."));
                    else {
                        code = it.get()[0];
                        if (desc == null || desc.isEmpty()) desc = it.get()[1];
                        if (uom == null || uom.isEmpty()) uom = it.get()[2];
                    }
                } catch (IllegalArgumentException e) {
                    issues.add(new FieldIssue(f + "itemId", "Identificador inválido."));
                }
            }
            if (desc == null || desc.isEmpty()) issues.add(new FieldIssue(f + "description", "Informe o item ou a descrição."));
            else if (desc.length() > 200) issues.add(new FieldIssue(f + "description", "Máximo de 200 caracteres."));
            if (uom == null || uom.isEmpty()) uom = "UN";
            BigDecimal q = decimal(d.quantity(), f + "quantity", issues), p = decimal(d.unitPrice(), f + "unitPrice", issues);
            if (q != null && q.signum() <= 0) issues.add(new FieldIssue(f + "quantity", "A quantidade deve ser maior que zero."));
            if (p != null && p.signum() < 0) issues.add(new FieldIssue(f + "unitPrice", "O preço não pode ser negativo."));
            if (q != null && p != null && desc != null) {
                items.add(new Item(itemId, code, desc, uom.length() > 10 ? uom.substring(0, 10) : uom, q.toPlainString(), p.toPlainString(),
                        q.multiply(p).movePointRight(2).setScale(0, RoundingMode.HALF_EVEN).longValueExact()));
            }
        }
        if (!issues.isEmpty()) throw new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.", issues);
        long total = items.stream().mapToLong(Item::totalCents).sum();
        long potential = items.isEmpty() ? (Long) head[2] : total;
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.sql("""
                update opportunity set contact_name = :contact, need = cast(:need as jsonb), potential_cents = :potential,
                       version = version + 1, updated_at = :now, updated_by = :by where id = :id
                """).param("id", id).param("contact", contact).param("need", json.writeValueAsString(need)).param("potential", potential)
                .param("now", now).param("by", user.username()).update();
        jdbc.sql("delete from opportunity_item where opportunity_id = :id").param("id", id).update();
        for (int i = 0; i < items.size(); i++) {
            Item it = items.get(i);
            jdbc.sql("""
                    insert into opportunity_item (opportunity_id, position, item_id, item_code, description, uom, quantity, unit_price)
                    values (:o, :p, :item, :code, :desc, :uom, :q, :price)
                    """).param("o", id).param("p", i).param("item", it.itemId()).param("code", it.itemCode()).param("desc", it.description())
                    .param("uom", it.uom()).param("q", new BigDecimal(it.quantity())).param("price", new BigDecimal(it.unitPrice())).update();
        }
        Details after = load(id);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        put(changes, "contactName", before.contactName(), after.contactName());
        NEED.keySet().stream().sorted().forEach(k -> put(changes, "need." + k, str(before.need().get(k)), str(after.need().get(k))));
        put(changes, "items", resumo(before.items()), resumo(after.items()));
        if ((Long) head[2] != potential) put(changes, "potentialCents", Long.toString((Long) head[2]), Long.toString(potential));
        audit.record(new AuditEntry(user.username(), "OPPORTUNITY_UPDATED", ENTITY, id.toString(), after.version(), null, changes,
                CorrelationId.current()));
        return after;
    }

    private static void put(Map<String, AuditEntry.Change> m, String k, String a, String b) {
        if (!Objects.equals(a, b)) m.put(k, new AuditEntry.Change(a, b));
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String resumo(List<Item> items) {
        return items.isEmpty() ? null : items.stream().map(i -> (i.itemCode() == null ? i.description() : i.itemCode()) + " × "
                + new BigDecimal(i.quantity()).stripTrailingZeros().toPlainString()).collect(Collectors.joining("; "));
    }

    private static BigDecimal decimal(String raw, String field, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            issues.add(new FieldIssue(field, "Informe o valor."));
            return null;
        }
        try {
            BigDecimal v = new BigDecimal(raw.strip());
            if (v.stripTrailingZeros().scale() > 6) {
                issues.add(new FieldIssue(field, "Máximo de 6 casas decimais."));
                return null;
            }
            return v;
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, "Número inválido (use ponto como separador decimal)."));
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Details load(UUID id) {
        var head = jdbc.sql("select contact_name, need::text, version, stage from opportunity where id = :id").param("id", id)
                .query((rs, n) -> new Object[] {rs.getString(1), rs.getString(2), rs.getLong(3), rs.getString(4)}).optional()
                .orElseThrow(() -> new NotFoundException("Oportunidade não encontrada."));
        Map<String, Object> need = json.readValue((String) head[1], LinkedHashMap.class);
        List<Item> items = jdbc.sql("""
                select item_id, item_code, description, uom, quantity, unit_price from opportunity_item where opportunity_id = :id order by position
                """).param("id", id).query((rs, n) -> {
            BigDecimal q = rs.getBigDecimal("quantity"), p = rs.getBigDecimal("unit_price");
            return new Item(rs.getObject("item_id", UUID.class), rs.getString("item_code"), rs.getString("description"), rs.getString("uom"),
                    q.stripTrailingZeros().toPlainString(), p.stripTrailingZeros().toPlainString(),
                    q.multiply(p).movePointRight(2).setScale(0, RoundingMode.HALF_EVEN).longValueExact());
        }).list();
        List<Document> docs = new ArrayList<>(jdbc.sql("""
                select pp.id, pp.code, r.revision, coalesce(r.issued_at, pp.created_at) as at, r.total_cents, r.status as rev_status,
                       pp.status, pp.current_revision
                  from proposal pp join proposal_revision r on r.proposal_id = pp.id
                 where pp.opportunity_id = :id order by pp.code, r.revision
                """).param("id", id).query((rs, n) -> {
            int rev = rs.getInt("revision");
            boolean atual = rev == rs.getInt("current_revision");
            String st = !atual ? "SUBSTITUIDA" : "GANHA".equals(rs.getString("status")) ? "GANHA" : "PERDIDA".equals(rs.getString("status"))
                    ? "PERDIDA" : "EMITIDA".equals(rs.getString("rev_status")) ? "ENVIADA" : "RASCUNHO";
            return new Document("PROPOSTA", rs.getObject("id", UUID.class), rs.getString("code") + (rev > 1 ? "-R" + rev : ""),
                    rs.getTimestamp("at").toInstant().atZone(SalesOrderService.BUSINESS_ZONE).toLocalDate().toString(), rev,
                    rs.getLong("total_cents"), st);
        }).list());
        docs.addAll(jdbc.sql("""
                select so.id, so.code, so.contract_date, so.total_cents, so.status from sales_order so
                  join proposal pp on pp.id = so.proposal_id where pp.opportunity_id = :id order by so.code
                """).param("id", id).query((rs, n) -> new Document("PEDIDO", rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getDate("contract_date") == null ? null : rs.getDate("contract_date").toLocalDate().toString(), null,
                rs.getLong("total_cents"), rs.getString("status"))).list());
        long[] hist = jdbc.sql("""
                select count(*) filter (where o.status = 'GANHA'), count(*) from opportunity o
                 where o.status in ('GANHA', 'PERDIDA')
                   and exists (select 1 from opportunity_stage_change c where c.opportunity_id = o.id and c.to_stage = :stage)
                """).param("stage", head[3]).query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
        Integer win = hist[1] < 5 ? null : (int) Math.round(hist[0] * 100.0 / hist[1]);
        return new Details(id, (String) head[0], need, items, items.stream().mapToLong(Item::totalCents).sum(), docs, win, (int) hist[1],
                (Long) head[2]);
    }
}
