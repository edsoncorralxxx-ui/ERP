package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.ObligationRepository;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.fiscal.infrastructure.JdbcTaxSetupRepository.date;
import static br.com.fourtech.rendamais.fiscal.infrastructure.JdbcTaxSetupRepository.instant;
import static br.com.fourtech.rendamais.fiscal.infrastructure.JdbcTaxSetupRepository.ts;

@Repository
class JdbcObligationRepository implements ObligationRepository {

    private static final String SELECT = """
            select o.*, t.code as template_code from tax_obligation o left join tax_obligation_template t on t.id = o.template_id
            """;

    private final JdbcClient jdbc;

    JdbcObligationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Template> templates() {
        return jdbc.sql("select * from tax_obligation_template order by code")
                .query((rs, n) -> new Template(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                        rs.getString("sphere"), rs.getString("kind"), rs.getString("periodicity"), rs.getInt("due_day"),
                        rs.getInt("due_month"), rs.getString("responsible"), rs.getString("detail"), rs.getString("initial_status"),
                        rs.getBoolean("active")))
                .list();
    }

    @Override
    public String nextCode() {
        return "OB" + String.format("%05d", jdbc.sql("select nextval('tax_obligation_code_seq')").query(Long.class).single());
    }

    @Override
    public void ensure(Obligation o) {
        boolean exists = jdbc.sql("select exists(select 1 from tax_obligation where template_id = :t and competence = :c)")
                .param("t", o.templateId()).param("c", o.competence()).query(Boolean.class).single();
        if (exists) return;
        jdbc.sql("""
                insert into tax_obligation (id, code, template_id, name, competence, due_date, sphere, kind, responsible, detail, status,
                       version, created_at, created_by)
                select :id, 'OB' || lpad(nextval('tax_obligation_code_seq')::text, 5, '0'), :t, :name, :c, :due, :sphere, :kind, :resp,
                       :detail, :status, 1, :at, :by
                on conflict (template_id, competence) where template_id is not null do nothing
                """)
                .param("id", o.id()).param("t", o.templateId()).param("name", o.name()).param("c", o.competence())
                .param("due", Date.valueOf(o.dueDate())).param("sphere", o.sphere()).param("kind", o.kind())
                .param("resp", o.responsible()).param("detail", o.detail()).param("status", o.status())
                .param("at", ts(o.createdAt())).param("by", o.createdBy()).update();
    }

    @Override
    public List<Obligation> list(LocalDate from, LocalDate to) {
        return jdbc.sql(SELECT + """
                 where (cast(:f as date) is null or o.due_date >= :f) and (cast(:t as date) is null or o.due_date <= :t)
                 order by o.due_date, o.name, o.code
                """)
                .param("f", from == null ? null : Date.valueOf(from)).param("t", to == null ? null : Date.valueOf(to))
                .query(JdbcObligationRepository::obligation).list();
    }

    @Override
    public Optional<Obligation> find(UUID id) {
        return jdbc.sql(SELECT + " where o.id = :id").param("id", id).query(JdbcObligationRepository::obligation).optional();
    }

    @Override
    public Optional<Obligation> findForUpdate(UUID id) {
        jdbc.sql("select id from tax_obligation where id = :id for update").param("id", id).query(UUID.class).optional();
        return find(id);
    }

    @Override
    public Optional<Obligation> byTemplate(String templateCode, String competence) {
        return jdbc.sql(SELECT + " where t.code = :code and o.competence = :c").param("code", templateCode).param("c", competence)
                .query(JdbcObligationRepository::obligation).optional();
    }

    @Override
    public void insert(Obligation o) {
        jdbc.sql("""
                insert into tax_obligation (id, code, template_id, name, competence, due_date, sphere, kind, responsible, detail, status,
                       delivered_on, receipt_number, notes, version, created_at, created_by)
                values (:id, :code, :t, :name, :c, :due, :sphere, :kind, :resp, :detail, :status, :on, :receipt, :notes, :version,
                        :at, :by)
                """)
                .param("id", o.id()).param("code", o.code()).param("t", o.templateId()).param("name", o.name())
                .param("c", o.competence()).param("due", Date.valueOf(o.dueDate())).param("sphere", o.sphere()).param("kind", o.kind())
                .param("resp", o.responsible()).param("detail", o.detail()).param("status", o.status())
                .param("on", o.deliveredOn() == null ? null : Date.valueOf(o.deliveredOn())).param("receipt", o.receiptNumber())
                .param("notes", o.notes()).param("version", o.version()).param("at", ts(o.createdAt())).param("by", o.createdBy())
                .update();
    }

    @Override
    public void update(Obligation o, long expectedVersion) {
        int n = jdbc.sql("""
                update tax_obligation set name = :name, due_date = :due, sphere = :sphere, responsible = :resp, detail = :detail,
                       status = :status, delivered_on = :on, receipt_number = :receipt, notes = :notes, version = :version,
                       updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """)
                .param("name", o.name()).param("due", Date.valueOf(o.dueDate())).param("sphere", o.sphere())
                .param("resp", o.responsible()).param("detail", o.detail()).param("status", o.status())
                .param("on", o.deliveredOn() == null ? null : Date.valueOf(o.deliveredOn())).param("receipt", o.receiptNumber())
                .param("notes", o.notes()).param("version", o.version()).param("at", ts(o.updatedAt())).param("by", o.updatedBy())
                .param("id", o.id()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("tax_obligation", expectedVersion, o.version() - 1);
    }

    private static Obligation obligation(ResultSet rs, int n) throws SQLException {
        return new Obligation(rs.getObject("id", UUID.class), rs.getString("code"), rs.getObject("template_id", UUID.class),
                rs.getString("template_code"), rs.getString("name"), rs.getString("competence"), rs.getDate("due_date").toLocalDate(),
                rs.getString("sphere"), rs.getString("kind"), rs.getString("responsible"), rs.getString("detail"), rs.getString("status"),
                date(rs, "delivered_on"), rs.getString("receipt_number"), rs.getString("notes"), rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }
}
