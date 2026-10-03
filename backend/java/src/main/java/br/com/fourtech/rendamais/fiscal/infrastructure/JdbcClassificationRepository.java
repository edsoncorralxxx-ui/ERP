package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.ClassificationRepository;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.fiscal.infrastructure.JdbcTaxSetupRepository.instant;
import static br.com.fourtech.rendamais.fiscal.infrastructure.JdbcTaxSetupRepository.ts;

@Repository
class JdbcClassificationRepository implements ClassificationRepository {

    private final JdbcClient jdbc;

    JdbcClassificationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<UUID, Profile> all() {
        Map<UUID, Profile> out = new HashMap<>();
        jdbc.sql("select * from item_fiscal_profile").query(JdbcClassificationRepository::profile).list().forEach(p -> out.put(p.itemId(), p));
        return out;
    }

    @Override
    public Optional<Profile> find(UUID itemId) {
        return jdbc.sql("select * from item_fiscal_profile where item_id = :id").param("id", itemId)
                .query(JdbcClassificationRepository::profile).optional();
    }

    @Override
    public Optional<Profile> findForUpdate(UUID itemId) {
        return jdbc.sql("select * from item_fiscal_profile where item_id = :id for update").param("id", itemId)
                .query(JdbcClassificationRepository::profile).optional();
    }

    @Override
    public void insert(Profile p) {
        jdbc.sql("""
                insert into item_fiscal_profile (item_id, cfop_internal, cfop_interstate, csosn, origin, annex, activity_id, nbs,
                       iss_retention, review, review_note, version, created_at, created_by)
                values (:id, :ci, :ce, :csosn, :origin, :annex, :activity, :nbs, :iss, :review, :note, :version, :at, :by)
                """)
                .param("id", p.itemId()).param("ci", p.cfopInternal()).param("ce", p.cfopInterstate()).param("csosn", p.csosn())
                .param("origin", p.origin()).param("annex", p.annex()).param("activity", p.activityId()).param("nbs", p.nbs())
                .param("iss", p.issRetention()).param("review", p.review()).param("note", p.reviewNote()).param("version", p.version())
                .param("at", ts(p.createdAt())).param("by", p.createdBy()).update();
    }

    @Override
    public void update(Profile p, long expectedVersion) {
        int n = jdbc.sql("""
                update item_fiscal_profile set cfop_internal = :ci, cfop_interstate = :ce, csosn = :csosn, origin = :origin,
                       annex = :annex, activity_id = :activity, nbs = :nbs, iss_retention = :iss, review = :review, review_note = :note,
                       version = :version, updated_at = :at, updated_by = :by
                 where item_id = :id and version = :expected
                """)
                .param("id", p.itemId()).param("ci", p.cfopInternal()).param("ce", p.cfopInterstate()).param("csosn", p.csosn())
                .param("origin", p.origin()).param("annex", p.annex()).param("activity", p.activityId()).param("nbs", p.nbs())
                .param("iss", p.issRetention()).param("review", p.review()).param("note", p.reviewNote()).param("version", p.version())
                .param("at", ts(p.updatedAt())).param("by", p.updatedBy()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("item_fiscal_profile", expectedVersion, p.version() - 1);
    }

    private static Profile profile(ResultSet rs, int n) throws SQLException {
        return new Profile(rs.getObject("item_id", UUID.class), rs.getString("cfop_internal"), rs.getString("cfop_interstate"),
                rs.getString("csosn"), rs.getString("origin"), rs.getString("annex"), rs.getObject("activity_id", UUID.class),
                rs.getString("nbs"), rs.getString("iss_retention"), rs.getBoolean("review"), rs.getString("review_note"),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                rs.getString("updated_by"));
    }
}
