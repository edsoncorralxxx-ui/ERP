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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcPartnerRepository implements PartnerRepository {

    private static final String SELECT = """
            select id, code, legal_name, trade_name, cnpj, group_name, status, version, created_at, created_by, updated_at, updated_by
              from partner
            """;

    private final JdbcClient jdbc;

    JdbcPartnerRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCustomerCode() {
        long n = jdbc.sql("select nextval('customer_code_seq')").query(Long.class).single();
        return String.format("C%05d", n);
    }

    @Override
    public void insert(Partner p) {
        jdbc.sql("""
                insert into partner (id, code, legal_name, trade_name, cnpj, group_name, is_customer, status, version,
                                     created_at, created_by, updated_at, updated_by)
                values (:id, :code, :legalName, :tradeName, :cnpj, :group, true, :status, :version, :createdAt, :createdBy,
                        :updatedAt, :updatedBy)
                """)
                .param("id", p.id()).param("code", p.code()).param("legalName", p.legalName()).param("tradeName", p.tradeName())
                .param("cnpj", p.cnpj() == null ? null : p.cnpj().value()).param("group", p.group())
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
                       status = :status, version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("legalName", p.legalName()).param("tradeName", p.tradeName())
                .param("cnpj", p.cnpj() == null ? null : p.cnpj().value()).param("group", p.group())
                .param("status", p.status().name()).param("version", p.version())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy())
                .param("id", p.id()).param("expected", expectedVersion)
                .update();
        if (rows != 1) {
            return false;
        }
        jdbc.sql("delete from partner_unit where partner_id = :id").param("id", p.id()).update();
        jdbc.sql("delete from partner_contact where partner_id = :id").param("id", p.id()).update();
        writeChildren(p);
        return true;
    }

    private void writeChildren(Partner p) {
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
        record Head(UUID id, String code, String legalName, String tradeName, String cnpj, String group, String status,
                    long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) { }
        Optional<Head> head = jdbc.sql(sql).param("id", id).query((rs, n) -> new Head(rs.getObject("id", UUID.class),
                rs.getString("code"), rs.getString("legal_name"), rs.getString("trade_name"), rs.getString("cnpj"),
                rs.getString("group_name"), rs.getString("status"), rs.getLong("version"), instant(rs, "created_at"),
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
            return new Partner(h.id(), h.code(), h.legalName(), h.tradeName(), h.cnpj() == null ? null : Cnpj.of(h.cnpj()),
                    h.group(), Partner.Status.valueOf(h.status()), units, contacts, h.version(), h.createdAt(), h.createdBy(),
                    h.updatedAt(), h.updatedBy());
        });
    }

    private static final String SUMMARY = """
            select p.id, p.code, p.legal_name, p.trade_name, p.cnpj, p.status, p.version,
                   u.city, u.state, (select count(*) from partner_unit x where x.partner_id = p.id) as units
              from partner p
              left join lateral (select city, state from partner_unit where partner_id = p.id order by position limit 1) u on true
            """;

    @Override
    public Optional<Summary> findByCnpj(String cnpj, UUID exceptId) {
        return jdbc.sql(SUMMARY + " where p.cnpj = :cnpj and p.id <> :id").param("cnpj", cnpj).param("id", exceptId)
                .query(JdbcPartnerRepository::summary).optional();
    }

    @Override
    public List<Summary> list(String search, Partner.Status status, int limit) {
        String term = search == null || search.isEmpty() ? null : search;
        String digits = term == null ? null : Cnpj.normalize(term);
        return jdbc.sql(SUMMARY + """
                 where p.is_customer
                   and (cast(:status as varchar) is null or p.status = cast(:status as varchar))
                   and (cast(:term as varchar) is null
                        or p.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.trade_name ilike '%' || cast(:term as varchar) || '%'
                        or (length(cast(:digits as varchar)) >= 3 and p.cnpj like '%' || cast(:digits as varchar) || '%'))
                 order by p.code limit :limit
                """)
                .param("status", status == null ? null : status.name()).param("term", term).param("digits", digits)
                .param("limit", limit)
                .query(JdbcPartnerRepository::summary).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        String cnpj = rs.getString("cnpj");
        return new Summary(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("legal_name"),
                rs.getString("trade_name"), cnpj == null ? null : Cnpj.of(cnpj).formatted(), rs.getString("city"),
                rs.getString("state"), rs.getInt("units"), Partner.Status.valueOf(rs.getString("status")), rs.getLong("version"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
