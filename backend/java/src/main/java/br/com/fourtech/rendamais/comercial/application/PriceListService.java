package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Tabelas de preço (Sprint 13; aba Vendas do item e aba Pagamento do parceiro): cada tabela tem código, nome e vigência;
 * cada item tem o seu preço em cada tabela. Todos leem ({@code price_list.read}); só o Administrador altera.
 */
@Service
public class PriceListService {

    private final JdbcClient jdbc;
    private final ItemQueryApi items;
    private final AuditTrail audit;
    private final Clock clock;

    public PriceListService(JdbcClient jdbc, ItemQueryApi items, AuditTrail audit, Clock clock) {
        this.jdbc = jdbc;
        this.items = items;
        this.audit = audit;
        this.clock = clock;
    }

    public record PriceList(UUID id, String code, String name, String validFrom, String validTo, boolean active) { }

    public record ItemPrice(UUID priceListId, String code, String name, String validFrom, String validTo, long priceCents,
                            String updatedAt, String updatedBy) { }

    public record PriceListData(String code, String name, String validFrom, String validTo) { }

    public record ItemPriceData(String priceListId, Long priceCents) { }

    @Transactional(readOnly = true)
    public List<PriceList> lists() {
        CurrentUserHolder.require(Permissions.PRICE_LIST_READ);
        return jdbc.sql("select * from price_list order by valid_from desc, code").query((rs, n) -> new PriceList(rs.getObject("id", UUID.class),
                rs.getString("code"), rs.getString("name"), rs.getDate("valid_from").toLocalDate().toString(),
                rs.getDate("valid_to") == null ? null : rs.getDate("valid_to").toLocalDate().toString(), rs.getBoolean("active"))).list();
    }

    @Transactional
    public PriceList register(PriceListData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PRICE_LIST_ADMIN);
        List<FieldIssue> issues = new ArrayList<>();
        String code = d.code() == null ? "" : d.code().strip().toUpperCase(java.util.Locale.ROOT);
        if (!code.matches("[A-Z0-9-]{1,20}")) issues.add(new FieldIssue("code", "Código com letras, números e hífen, até 20 caracteres."));
        String name = d.name() == null ? "" : d.name().strip();
        if (name.isEmpty() || name.length() > 100) issues.add(new FieldIssue("name", name.isEmpty() ? "Informe o nome." : "Máximo de 100 caracteres."));
        LocalDate from = date(d.validFrom(), "validFrom", true, issues), to = date(d.validTo(), "validTo", false, issues);
        if (from != null && to != null && to.isBefore(from)) issues.add(new FieldIssue("validTo", "Fim da vigência antes do início."));
        if (issues.isEmpty() && jdbc.sql("select count(*) from price_list where code = :c").param("c", code).query(Long.class).single() > 0) {
            issues.add(new FieldIssue("code", "Código já usado."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("PRICE_LIST_INVALID", "Corrija os campos indicados.", issues);
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into price_list (id, code, name, valid_from, valid_to, created_at, created_by) values (:id, :c, :n, :f, :t, :at, :by)")
                .param("id", id).param("c", code).param("n", name).param("f", Date.valueOf(from)).param("t", to == null ? null : Date.valueOf(to))
                .param("at", Timestamp.from(clock.instant())).param("by", user.username()).update();
        audit.record(new AuditEntry(user.username(), "PRICE_LIST_REGISTERED", "price_list", id.toString(), 1, null,
                Map.of("code", new AuditEntry.Change(null, code), "name", new AuditEntry.Change(null, name)), CorrelationId.current()));
        return lists().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<ItemPrice> itemPrices(UUID itemId) {
        CurrentUserHolder.require(Permissions.PRICE_LIST_READ);
        return jdbc.sql("""
                select p.id, p.code, p.name, p.valid_from, p.valid_to, e.price_cents, e.updated_at, e.updated_by
                  from price_list_entry e join price_list p on p.id = e.price_list_id
                 where e.item_id = :item order by p.code
                """).param("item", itemId).query((rs, n) -> new ItemPrice(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("name"), rs.getDate("valid_from").toLocalDate().toString(),
                rs.getDate("valid_to") == null ? null : rs.getDate("valid_to").toLocalDate().toString(), rs.getLong("price_cents"),
                rs.getTimestamp("updated_at").toInstant().toString(), rs.getString("updated_by"))).list();
    }

    /** Substitui os preços do item nas tabelas. */
    @Transactional
    public List<ItemPrice> replaceItemPrices(UUID itemId, List<ItemPriceData> rows) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PRICE_LIST_ADMIN);
        items.item(itemId).orElseThrow(() -> new NotFoundException("Item não encontrado."));
        List<FieldIssue> issues = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        Set<UUID> known = new HashSet<>();
        lists().forEach(p -> known.add(p.id()));
        for (int i = 0; i < (rows == null ? 0 : rows.size()); i++) {
            ItemPriceData r = rows.get(i);
            UUID id = null;
            try {
                id = UUID.fromString(r.priceListId());
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("rows[" + i + "].priceListId", "Informe a tabela."));
            }
            if (id != null && !known.contains(id)) issues.add(new FieldIssue("rows[" + i + "].priceListId", "Tabela inexistente."));
            else if (id != null && !seen.add(id)) issues.add(new FieldIssue("rows[" + i + "].priceListId", "Tabela repetida."));
            if (r.priceCents() == null || r.priceCents() < 0) issues.add(new FieldIssue("rows[" + i + "].priceCents", "Preço inválido."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("PRICE_LIST_INVALID", "Corrija as linhas indicadas.", issues);
        jdbc.sql("delete from price_list_entry where item_id = :item").param("item", itemId).update();
        Timestamp at = Timestamp.from(clock.instant());
        for (ItemPriceData r : rows) {
            jdbc.sql("insert into price_list_entry (price_list_id, item_id, price_cents, updated_at, updated_by) values (:p, :i, :c, :at, :by)")
                    .param("p", UUID.fromString(r.priceListId())).param("i", itemId).param("c", r.priceCents()).param("at", at)
                    .param("by", user.username()).update();
        }
        audit.record(new AuditEntry(user.username(), "ITEM_PRICES_UPDATED", "item", itemId.toString(), 1, null,
                Map.of("prices", new AuditEntry.Change(null, Integer.toString(rows.size()))), CorrelationId.current()));
        return itemPrices(itemId);
    }

    private static LocalDate date(String raw, String field, boolean required, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            if (required) issues.add(new FieldIssue(field, "Informe a data."));
            return null;
        }
        try {
            return LocalDate.parse(raw.strip());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue(field, "Data inválida."));
            return null;
        }
    }
}
