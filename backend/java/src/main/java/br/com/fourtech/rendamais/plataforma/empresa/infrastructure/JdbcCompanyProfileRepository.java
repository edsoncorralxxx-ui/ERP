package br.com.fourtech.rendamais.plataforma.empresa.infrastructure;

import br.com.fourtech.rendamais.kernel.Cnpj;
import br.com.fourtech.rendamais.plataforma.empresa.application.CompanyProfileRepository;
import br.com.fourtech.rendamais.plataforma.empresa.domain.Address;
import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfile;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.UUID;

@Repository
class JdbcCompanyProfileRepository implements CompanyProfileRepository {

    private static final String SELECT = """
            select id, legal_name, trade_name, cnpj, street, number, complement, district, city, state, postal_code,
                   phone, email, configured, version, updated_at, updated_by
            from company_profile
            """;

    private static final RowMapper<CompanyProfile> MAPPER = (rs, n) -> {
        String cnpj = rs.getString("cnpj");
        Timestamp updated = rs.getTimestamp("updated_at");
        return new CompanyProfile(rs.getObject("id", UUID.class), rs.getString("legal_name"), rs.getString("trade_name"),
                cnpj == null ? null : Cnpj.of(cnpj),
                new Address(rs.getString("street"), rs.getString("number"), rs.getString("complement"),
                        rs.getString("district"), rs.getString("city"), rs.getString("state"), rs.getString("postal_code")),
                rs.getString("phone"), rs.getString("email"), rs.getBoolean("configured"), rs.getLong("version"),
                updated == null ? null : updated.toInstant(), rs.getString("updated_by"));
    };

    private final JdbcClient jdbc;

    JdbcCompanyProfileRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public CompanyProfile get() {
        return jdbc.sql(SELECT).query(MAPPER).single();
    }

    @Override
    public CompanyProfile getForUpdate() {
        return jdbc.sql(SELECT + " for update").query(MAPPER).single();
    }

    @Override
    public boolean save(CompanyProfile p, long expectedVersion) {
        int rows = jdbc.sql("""
                update company_profile set legal_name = :legalName, trade_name = :tradeName, cnpj = :cnpj,
                       street = :street, number = :number, complement = :complement, district = :district, city = :city,
                       state = :state, postal_code = :postalCode, phone = :phone, email = :email, configured = :configured,
                       version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expectedVersion
                """)
                .param("legalName", p.legalName())
                .param("tradeName", p.tradeName())
                .param("cnpj", p.cnpj() == null ? null : p.cnpj().value())
                .param("street", p.address().street())
                .param("number", p.address().number())
                .param("complement", p.address().complement())
                .param("district", p.address().district())
                .param("city", p.address().city())
                .param("state", p.address().state())
                .param("postalCode", p.address().postalCode())
                .param("phone", p.phone())
                .param("email", p.email())
                .param("configured", p.configured())
                .param("version", p.version())
                .param("updatedAt", p.updatedAt() == null ? null : Timestamp.from(p.updatedAt()))
                .param("updatedBy", p.updatedBy())
                .param("id", p.id())
                .param("expectedVersion", expectedVersion)
                .update();
        return rows == 1;
    }
}
