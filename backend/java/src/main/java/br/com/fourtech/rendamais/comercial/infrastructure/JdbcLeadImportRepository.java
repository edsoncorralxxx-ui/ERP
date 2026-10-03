package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.LeadImportRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.comercial.infrastructure.SalesLinesSql.*;

@Repository
class JdbcLeadImportRepository implements LeadImportRepository {

    private final JdbcClient jdbc;

    JdbcLeadImportRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(LeadImport i) {
        jdbc.sql("""
                insert into lead_import (id, file_hash, file_name, status, content, created_at, created_by)
                values (:id, :hash, :name, :status, :content, :at, :by)
                """)
                .param("id", i.id()).param("hash", i.hash()).param("name", i.fileName()).param("status", i.status())
                .param("content", i.content()).param("at", ts(i.createdAt())).param("by", i.createdBy())
                .update();
    }

    @Override
    public Optional<LeadImport> findByHash(String hash) {
        return jdbc.sql("select * from lead_import where file_hash = :h").param("h", hash).query(JdbcLeadImportRepository::map).optional();
    }

    @Override
    public Optional<LeadImport> find(UUID id) {
        return jdbc.sql("select * from lead_import where id = :id").param("id", id).query(JdbcLeadImportRepository::map).optional();
    }

    @Override
    public Optional<LeadImport> findForUpdate(UUID id) {
        return jdbc.sql("select * from lead_import where id = :id for update").param("id", id).query(JdbcLeadImportRepository::map)
                .optional();
    }

    @Override
    public void confirm(UUID id, Instant at, String by) {
        jdbc.sql("update lead_import set status = 'CONFIRMADA', confirmed_at = :at, confirmed_by = :by where id = :id")
                .param("at", ts(at)).param("by", by).param("id", id).update();
    }

    @Override
    public List<String> createdCodes(UUID id) {
        return jdbc.sql("select code from lead where import_id = :id order by code").param("id", id).query(String.class).list();
    }

    private static LeadImport map(ResultSet rs, int n) throws SQLException {
        return new LeadImport(rs.getObject("id", UUID.class), rs.getString("file_name"), rs.getString("file_hash"),
                rs.getString("content"), rs.getString("status"), instant(rs, "created_at"), rs.getString("created_by"),
                instant(rs, "confirmed_at"), rs.getString("confirmed_by"));
    }
}
