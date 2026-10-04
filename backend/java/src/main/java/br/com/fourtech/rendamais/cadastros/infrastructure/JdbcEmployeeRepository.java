package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.EmployeeRepository;
import br.com.fourtech.rendamais.cadastros.domain.Employee;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcEmployeeRepository implements EmployeeRepository {

    private static final String SELECT = """
            select id, code, name, department, job_title, cost_center, admission_date, email, phone, status, version,
                   created_at, created_by, updated_at, updated_by from employee
            """;

    private final JdbcClient jdbc;

    JdbcEmployeeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(Employee e) {
        jdbc.sql("""
                insert into employee (id, code, name, department, job_title, cost_center, admission_date, email, phone, status,
                                      version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :department, :job, :cc, :admission, :email, :phone, :status, :version, :createdAt,
                        :createdBy, :updatedAt, :updatedBy)
                """).param("id", e.id()).param("code", e.code()).params(common(e))
                .param("createdAt", ts(e.createdAt())).param("createdBy", e.createdBy()).update();
    }

    @Override
    public boolean update(Employee e, long expectedVersion) {
        return jdbc.sql("""
                update employee set name = :name, department = :department, job_title = :job, cost_center = :cc,
                       admission_date = :admission, email = :email, phone = :phone, status = :status, version = :version,
                       updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """).param("id", e.id()).param("expected", expectedVersion).params(common(e)).update() == 1;
    }

    private static java.util.Map<String, Object> common(Employee e) {
        java.util.Map<String, Object> m = new java.util.HashMap<>();
        m.put("name", e.name());
        m.put("department", e.department());
        m.put("job", e.jobTitle());
        m.put("cc", e.costCenter());
        m.put("admission", e.admissionDate() == null ? null : Date.valueOf(e.admissionDate()));
        m.put("email", e.email());
        m.put("phone", e.phone());
        m.put("status", e.status().name());
        m.put("version", e.version());
        m.put("updatedAt", ts(e.updatedAt()));
        m.put("updatedBy", e.updatedBy());
        return m;
    }

    @Override
    public Optional<Employee> findById(UUID id) {
        return jdbc.sql(SELECT + " where id = :id").param("id", id).query(JdbcEmployeeRepository::map).optional();
    }

    @Override
    public boolean codeExists(String code) {
        return jdbc.sql("select count(*) from employee where code = :code").param("code", code).query(Long.class).single() > 0;
    }

    @Override
    public List<Employee> list(String search, Partner.Status status) {
        String term = search == null || search.isEmpty() ? null : search;
        return jdbc.sql(SELECT + """
                 where (cast(:status as varchar) is null or status = cast(:status as varchar))
                   and (cast(:term as varchar) is null or code ilike '%' || cast(:term as varchar) || '%'
                        or name ilike '%' || cast(:term as varchar) || '%' or department ilike '%' || cast(:term as varchar) || '%'
                        or job_title ilike '%' || cast(:term as varchar) || '%')
                 order by code
                """).param("status", status == null ? null : status.name()).param("term", term)
                .query(JdbcEmployeeRepository::map).list();
    }

    private static Employee map(ResultSet rs, int n) throws SQLException {
        Date adm = rs.getDate("admission_date");
        return new Employee(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"), rs.getString("department"),
                rs.getString("job_title"), rs.getString("cost_center"), adm == null ? null : adm.toLocalDate(), rs.getString("email"),
                rs.getString("phone"), Partner.Status.valueOf(rs.getString("status")), rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
