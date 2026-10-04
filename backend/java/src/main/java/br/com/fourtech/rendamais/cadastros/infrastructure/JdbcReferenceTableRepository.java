package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.ReferenceTableRepository;
import br.com.fourtech.rendamais.cadastros.domain.TabelaAuxiliar;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Repository
class JdbcReferenceTableRepository implements ReferenceTableRepository {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() { };
    private static final Map<String, String> KIND = Map.of("QUANTIDADE", "Quantidade", "MASSA", "Massa", "COMPRIMENTO", "Comprimento",
            "AREA", "Área", "VOLUME", "Volume", "TEMPO", "Tempo");
    private static final Map<String, String> APPLIES = Map.of("PRODUTO", "Produto", "MATERIAL", "Material", "SERVICO", "Serviço");

    private final JdbcClient jdbc;
    private final JsonMapper json;

    JdbcReferenceTableRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public long version(TabelaAuxiliar table, boolean forUpdate) {
        return jdbc.sql("select version from reference_table where code = :code" + (forUpdate ? " for update" : ""))
                .param("code", table.name()).query(Long.class).single();
    }

    @Override
    public List<Entry> rows(TabelaAuxiliar table) {
        return switch (table) {
            case UNIDADE -> jdbc.sql("""
                    select u.code, u.name, u.quantity_kind, u.decimals, u.status,
                           (select count(*) from item i where i.uom_code = u.code)
                         + (select count(*) from item_conversion c where c.from_uom = u.code)
                         + (select count(*) from bom_line b where b.uom = u.code) as usage
                      from unit_of_measure u order by u.created_at, u.code
                    """).query((rs, n) -> {
                Map<String, Object> attrs = new LinkedHashMap<>();
                if (rs.getString("quantity_kind") != null) attrs.put("quantityKind", KIND.get(rs.getString("quantity_kind")));
                attrs.put("decimals", rs.getLong("decimals"));
                return new Entry(rs.getString("code"), rs.getString("code"), rs.getString("name"), attrs,
                        "ATIVO".equals(rs.getString("status")), rs.getLong("usage"));
            }).list();
            case CATEGORIA -> jdbc.sql("""
                    select c.id, c.code, c.name, c.parent_name, c.applies_to, c.status,
                           (select count(*) from item i where i.category_id = c.id)
                         + (select count(*) from partner_supplied_category s where s.category_id = c.id) as usage
                      from item_category c order by c.code nulls last, c.name
                    """).query((rs, n) -> {
                Map<String, Object> attrs = new LinkedHashMap<>();
                if (rs.getString("parent_name") != null) attrs.put("parent", rs.getString("parent_name"));
                if (rs.getString("applies_to") != null) attrs.put("appliesTo", APPLIES.get(rs.getString("applies_to")));
                return new Entry(rs.getObject("id", UUID.class).toString(), rs.getString("code"), rs.getString("name"), attrs,
                        "ATIVO".equals(rs.getString("status")), rs.getLong("usage"));
            }).list();
            default -> jdbc.sql("""
                    select id, code, description, attrs::text as attrs, active from reference_entry
                     where table_code = :table order by position
                    """).param("table", table.name()).query((rs, n) -> new Entry(rs.getObject("id", UUID.class).toString(),
                    rs.getString("code"), rs.getString("description"), json.readValue(rs.getString("attrs"), MAP), rs.getBoolean("active"), 0))
                    .list();
        };
    }

    @Override
    public long replace(TabelaAuxiliar table, List<TabelaAuxiliar.Valid> rows, Instant now, String actor) {
        Timestamp at = Timestamp.from(now);
        switch (table) {
            case UNIDADE -> replaceUnits(rows, at, actor);
            case CATEGORIA -> replaceCategories(rows, at, actor);
            default -> {
                jdbc.sql("delete from reference_entry where table_code = :table").param("table", table.name()).update();
                int pos = 0;
                for (TabelaAuxiliar.Valid r : rows) {
                    UUID id = parse(r.id());
                    jdbc.sql("""
                            insert into reference_entry (id, table_code, position, code, description, attrs, active, created_at,
                                                         created_by, updated_at, updated_by)
                            values (:id, :table, :pos, :code, :description, cast(:attrs as jsonb), :active, :at, :by, :at, :by)
                            """).param("id", id == null ? UUID.randomUUID() : id).param("table", table.name()).param("pos", pos++)
                            .param("code", r.code()).param("description", r.description()).param("attrs", json.writeValueAsString(r.attrs()))
                            .param("active", r.active()).param("at", at).param("by", actor).update();
                }
            }
        }
        jdbc.sql("update reference_table set version = version + 1, updated_at = :at, updated_by = :by where code = :code")
                .param("at", at).param("by", actor).param("code", table.name()).update();
        return version(table, false);
    }

    private void replaceUnits(List<TabelaAuxiliar.Valid> rows, Timestamp at, String actor) {
        Map<String, Entry> existing = new LinkedHashMap<>();
        rows(TabelaAuxiliar.UNIDADE).forEach(e -> existing.put(e.code(), e));
        Set<String> kept = new HashSet<>();
        for (TabelaAuxiliar.Valid r : rows) {
            kept.add(r.code());
            String kind = KIND.entrySet().stream().filter(e -> e.getValue().equals(r.attrs().get("quantityKind"))).map(Map.Entry::getKey)
                    .findFirst().orElse(null);
            Object dec = r.attrs().get("decimals");
            jdbc.sql("""
                    insert into unit_of_measure (code, name, quantity_kind, decimals, status, created_at, created_by, updated_at, updated_by)
                    values (:code, :name, :kind, :dec, :status, :at, :by, :at, :by)
                    on conflict (code) do update set name = excluded.name, quantity_kind = excluded.quantity_kind,
                        decimals = excluded.decimals, status = excluded.status, updated_at = excluded.updated_at,
                        updated_by = excluded.updated_by,
                        version = unit_of_measure.version + case when (unit_of_measure.name, unit_of_measure.status) is distinct from
                                  (excluded.name, excluded.status) then 1 else 0 end
                    """).param("code", r.code()).param("name", r.description()).param("kind", kind)
                    .param("dec", dec == null ? 0 : ((Number) dec).intValue()).param("status", r.active() ? "ATIVO" : "INATIVO")
                    .param("at", at).param("by", actor).update();
        }
        List<FieldIssue> issues = new ArrayList<>();
        for (Entry e : existing.values()) {
            if (kept.contains(e.code())) continue;
            if (e.usage() > 0) issues.add(new FieldIssue("rows", "A unidade " + e.code() + " está em uso: inative em vez de remover."));
            else jdbc.sql("delete from unit_of_measure where code = :code").param("code", e.code()).update();
        }
        if (!issues.isEmpty()) throw new RuleViolationException("REFERENCE_IN_USE", "Há linhas removidas em uso.", issues);
    }

    private void replaceCategories(List<TabelaAuxiliar.Valid> rows, Timestamp at, String actor) {
        Map<String, Entry> existing = new LinkedHashMap<>();
        rows(TabelaAuxiliar.CATEGORIA).forEach(e -> existing.put(e.id(), e));
        Set<String> kept = new HashSet<>();
        Set<String> names = new HashSet<>();
        List<FieldIssue> issues = new ArrayList<>();
        for (TabelaAuxiliar.Valid r : rows) {
            if (!names.add(r.description().toLowerCase(java.util.Locale.ROOT))) {
                issues.add(new FieldIssue("rows", "Categoria repetida: " + r.description() + "."));
            }
        }
        if (!issues.isEmpty()) throw new RuleViolationException("REFERENCE_TABLE_INVALID", "Corrija as linhas indicadas.", issues);
        // Primeiro solta os nomes e códigos das que ficam, para a troca entre linhas não bater no índice único.
        for (TabelaAuxiliar.Valid r : rows) {
            UUID id = parse(r.id());
            if (id != null && existing.containsKey(id.toString())) {
                jdbc.sql("update item_category set code = null, name = '~' || id::text where id = :id").param("id", id).update();
            }
        }
        for (TabelaAuxiliar.Valid r : rows) {
            UUID id = parse(r.id());
            String applies = APPLIES.entrySet().stream().filter(e -> e.getValue().equals(r.attrs().get("appliesTo"))).map(Map.Entry::getKey)
                    .findFirst().orElse(null);
            Object parent = r.attrs().get("parent");
            if (id != null && existing.containsKey(id.toString())) {
                kept.add(id.toString());
                jdbc.sql("""
                        update item_category set code = :code, name = :name, parent_name = :parent, applies_to = :applies,
                               status = :status, version = version + 1, updated_at = :at, updated_by = :by where id = :id
                        """).param("id", id).param("code", r.code()).param("name", r.description())
                        .param("parent", parent == null ? null : parent.toString()).param("applies", applies)
                        .param("status", r.active() ? "ATIVO" : "INATIVO").param("at", at).param("by", actor).update();
            } else {
                jdbc.sql("""
                        insert into item_category (id, code, name, parent_name, applies_to, status, created_at, created_by, updated_at, updated_by)
                        values (:id, :code, :name, :parent, :applies, :status, :at, :by, :at, :by)
                        """).param("id", UUID.randomUUID()).param("code", r.code()).param("name", r.description())
                        .param("parent", parent == null ? null : parent.toString()).param("applies", applies)
                        .param("status", r.active() ? "ATIVO" : "INATIVO").param("at", at).param("by", actor).update();
            }
        }
        for (Entry e : existing.values()) {
            if (kept.contains(e.id())) continue;
            if (e.usage() > 0) issues.add(new FieldIssue("rows", "A categoria " + e.description() + " está em uso: inative em vez de remover."));
            else jdbc.sql("delete from item_category where id = :id").param("id", UUID.fromString(e.id())).update();
        }
        if (!issues.isEmpty()) throw new RuleViolationException("REFERENCE_IN_USE", "Há linhas removidas em uso.", issues);
    }

    private static UUID parse(String raw) {
        if (raw == null) return null;
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
