package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerRepository;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.Cnpj;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcPartnerRepository implements PartnerRepository {

    private static final String SELECT = """
            select id, code, legal_name, trade_name, cnpj, group_name, supplier_lead_time_days, supplier_payment_terms, version,
                   created_at, created_by, updated_at, updated_by
              from partner
            """;

    private final JdbcClient jdbc;

    JdbcPartnerRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode(Partner.Role role) {
        boolean customer = role == Partner.Role.CLIENTE;
        long n = jdbc.sql(customer ? "select nextval('customer_code_seq')" : "select nextval('supplier_code_seq')")
                .query(Long.class).single();
        return String.format(customer ? "C%05d" : "F%05d", n);
    }

    @Override
    public void insert(Partner p) {
        jdbc.sql("""
                insert into partner (id, code, legal_name, trade_name, cnpj, group_name, supplier_lead_time_days,
                                     supplier_payment_terms, status, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :legalName, :tradeName, :cnpj, :group, :leadTime, :paymentTerms, :status, :version,
                        :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", p.id()).param("code", p.code()).param("legalName", p.legalName()).param("tradeName", p.tradeName())
                .param("cnpj", p.cnpj() == null ? null : p.cnpj().value()).param("group", p.group())
                .param("leadTime", p.supplier().leadTimeDays()).param("paymentTerms", p.supplier().paymentTerms())
                .param("status", p.status().name()).param("version", p.version())
                .param("createdAt", ts(p.createdAt())).param("createdBy", p.createdBy())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy())
                .update();
        writeChildren(p);
    }

    @Override
    public boolean update(Partner p, long expectedVersion) {
        int rows = jdbc.sql("""
                update partner set legal_name = :legalName, trade_name = :tradeName, cnpj = :cnpj, group_name = :group,
                       supplier_lead_time_days = :leadTime, supplier_payment_terms = :paymentTerms,
                       status = :status, version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("legalName", p.legalName()).param("tradeName", p.tradeName())
                .param("cnpj", p.cnpj() == null ? null : p.cnpj().value()).param("group", p.group())
                .param("leadTime", p.supplier().leadTimeDays()).param("paymentTerms", p.supplier().paymentTerms())
                .param("status", p.status().name()).param("version", p.version())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy())
                .param("id", p.id()).param("expected", expectedVersion)
                .update();
        if (rows != 1) {
            return false;
        }
        jdbc.sql("delete from partner_unit where partner_id = :id").param("id", p.id()).update();
        jdbc.sql("delete from partner_contact where partner_id = :id").param("id", p.id()).update();
        jdbc.sql("delete from partner_supplied_category where partner_id = :id").param("id", p.id()).update();
        writeChildren(p);
        return true;
    }

    private void writeChildren(Partner p) {
        // Papéis: a data de início de um papel existente é preservada.
        jdbc.sql("delete from partner_role where partner_id = :id and role <> all(cast(:roles as varchar[]))")
                .param("id", p.id()).param("roles", p.roles().keySet().stream().map(Enum::name).toArray(String[]::new)).update();
        p.roles().forEach((role, status) -> jdbc.sql("""
                insert into partner_role (partner_id, role, status, since) values (:id, :role, :status, :since)
                on conflict (partner_id, role) do update set status = excluded.status
                """).param("id", p.id()).param("role", role.name()).param("status", status.name())
                .param("since", ts(p.updatedAt() == null ? p.createdAt() : p.updatedAt())).update());
        int i = 0;
        for (Partner.Unit u : p.units()) {
            jdbc.sql("""
                    insert into partner_unit (id, partner_id, position, name, street, number, district, city, state, postal_code)
                    values (:id, :partner, :pos, :name, :street, :number, :district, :city, :state, :cep)
                    """)
                    .param("id", u.id()).param("partner", p.id()).param("pos", i++).param("name", u.name())
                    .param("street", u.street()).param("number", u.number()).param("district", u.district())
                    .param("city", u.city()).param("state", u.state()).param("cep", u.postalCode())
                    .update();
        }
        i = 0;
        for (Partner.Contact c : p.contacts()) {
            jdbc.sql("""
                    insert into partner_contact (id, partner_id, position, name, role, phone, email)
                    values (:id, :partner, :pos, :name, :role, :phone, :email)
                    """)
                    .param("id", c.id()).param("partner", p.id()).param("pos", i++).param("name", c.name())
                    .param("role", c.role()).param("phone", c.phone()).param("email", c.email())
                    .update();
        }
        i = 0;
        for (Partner.Category c : p.supplier().categories()) {
            jdbc.sql("insert into partner_supplied_category (partner_id, category_id, position) values (:partner, :category, :pos)")
                    .param("partner", p.id()).param("category", c.id()).param("pos", i++).update();
        }
    }

    @Override
    public Optional<Partner> findById(UUID id) {
        return load(SELECT + " where id = :id", id);
    }

    @Override
    public Optional<Partner> findByIdForUpdate(UUID id) {
        return load(SELECT + " where id = :id for update", id);
    }

    private Optional<Partner> load(String sql, UUID id) {
        record Head(UUID id, String code, String legalName, String tradeName, String cnpj, String group, Integer leadTime,
                    String paymentTerms, long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) { }
        Optional<Head> head = jdbc.sql(sql).param("id", id).query((rs, n) -> new Head(rs.getObject("id", UUID.class),
                rs.getString("code"), rs.getString("legal_name"), rs.getString("trade_name"), rs.getString("cnpj"),
                rs.getString("group_name"), rs.getObject("supplier_lead_time_days", Integer.class),
                rs.getString("supplier_payment_terms"), rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"))).optional();
        return head.map(h -> {
            List<Partner.Unit> units = jdbc.sql("""
                    select id, name, street, number, district, city, state, postal_code from partner_unit
                     where partner_id = :id order by position
                    """).param("id", id).query((rs, n) -> new Partner.Unit(rs.getObject("id", UUID.class), rs.getString("name"),
                    rs.getString("street"), rs.getString("number"), rs.getString("district"), rs.getString("city"),
                    rs.getString("state"), rs.getString("postal_code"))).list();
            List<Partner.Contact> contacts = jdbc.sql("""
                    select id, name, role, phone, email from partner_contact where partner_id = :id order by position
                    """).param("id", id).query((rs, n) -> new Partner.Contact(rs.getObject("id", UUID.class),
                    rs.getString("name"), rs.getString("role"), rs.getString("phone"), rs.getString("email"))).list();
            Map<Partner.Role, Partner.Status> roles = new EnumMap<>(Partner.Role.class);
            jdbc.sql("select role, status from partner_role where partner_id = :id").param("id", id)
                    .query((rs, n) -> Map.entry(Partner.Role.valueOf(rs.getString("role")), Partner.Status.valueOf(rs.getString("status"))))
                    .list().forEach(e -> roles.put(e.getKey(), e.getValue()));
            List<Partner.Category> categories = jdbc.sql("""
                    select c.id, c.name from partner_supplied_category s join item_category c on c.id = s.category_id
                     where s.partner_id = :id order by s.position
                    """).param("id", id).query((rs, n) -> new Partner.Category(rs.getObject("id", UUID.class), rs.getString("name")))
                    .list();
            return new Partner(h.id(), h.code(), h.legalName(), h.tradeName(), h.cnpj() == null ? null : Cnpj.of(h.cnpj()),
                    h.group(), roles, new Partner.SupplierTerms(h.leadTime(), h.paymentTerms(), categories), units, contacts,
                    h.version(), h.createdAt(), h.createdBy(), h.updatedAt(), h.updatedBy());
        });
    }

    @Override
    public Optional<UUID> findIdByCnpj(String cnpj, UUID exceptId) {
        return jdbc.sql("select id from partner where cnpj = :cnpj and id <> :id").param("cnpj", cnpj).param("id", exceptId)
                .query(UUID.class).optional();
    }

    @Override
    public List<Summary> list(String search, Partner.Role role, Partner.Status status, int limit) {
        String term = search == null || search.isEmpty() ? null : search;
        String digits = term == null ? null : Cnpj.normalize(term);
        return jdbc.sql("""
                select p.id, p.code, p.legal_name, p.trade_name, p.cnpj, r.status, p.version, p.supplier_lead_time_days,
                       u.city, u.state, (select count(*) from partner_unit x where x.partner_id = p.id) as units,
                       (select string_agg(c.name, ', ' order by s.position) from partner_supplied_category s
                          join item_category c on c.id = s.category_id where s.partner_id = p.id) as categories
                  from partner p
                  join partner_role r on r.partner_id = p.id and r.role = :role
                  left join lateral (select city, state from partner_unit where partner_id = p.id order by position limit 1) u on true
                 where (cast(:status as varchar) is null or r.status = cast(:status as varchar))
                   and (cast(:term as varchar) is null
                        or p.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.trade_name ilike '%' || cast(:term as varchar) || '%'
                        or (length(cast(:digits as varchar)) >= 3 and p.cnpj like '%' || cast(:digits as varchar) || '%'))
                 order by p.code limit :limit
                """)
                .param("role", role.name()).param("status", status == null ? null : status.name()).param("term", term)
                .param("digits", digits).param("limit", limit)
                .query(JdbcPartnerRepository::summary).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        String cnpj = rs.getString("cnpj");
        return new Summary(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("legal_name"),
                rs.getString("trade_name"), cnpj == null ? null : Cnpj.of(cnpj).formatted(), rs.getString("city"),
                rs.getString("state"), rs.getInt("units"), Partner.Status.valueOf(rs.getString("status")), rs.getLong("version"),
                rs.getString("categories"), rs.getObject("supplier_lead_time_days", Integer.class));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
