package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.BomRepository;
import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomCost;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.engenharia.domain.EquipmentBom;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcBomRepository implements BomRepository {

    private final JdbcClient jdbc;

    JdbcBomRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ───────────── BOM e revisões ─────────────

    @Override
    public String nextBomCode() {
        return String.format("BOM%05d", jdbc.sql("select nextval('bom_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Bom b) {
        jdbc.sql("""
                insert into bom (id, code, name, model_id, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :model, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", b.id()).param("code", b.code()).param("name", b.name()).param("model", b.modelId())
                .param("version", b.version()).param("createdAt", ts(b.createdAt())).param("createdBy", b.createdBy())
                .param("updatedAt", ts(b.updatedAt())).param("updatedBy", b.updatedBy())
                .update();
    }

    @Override
    public Optional<Bom> findBom(UUID id) {
        return jdbc.sql("select * from bom where id = :id").param("id", id).query(JdbcBomRepository::bom).optional();
    }

    @Override
    public Optional<Bom> findBomByName(String name) {
        return jdbc.sql("select * from bom where lower(name) = lower(:name)").param("name", name).query(JdbcBomRepository::bom).optional();
    }

    @Override
    public Optional<Bom> findBomByModel(UUID modelId) {
        return jdbc.sql("select * from bom where model_id = :model").param("model", modelId).query(JdbcBomRepository::bom).optional();
    }

    @Override
    public List<Bom> listBoms(String search, int limit) {
        return jdbc.sql("""
                select b.* from bom b left join equipment_model m on m.id = b.model_id
                 where cast(:term as varchar) is null
                    or b.code ilike '%' || cast(:term as varchar) || '%'
                    or b.name ilike '%' || cast(:term as varchar) || '%'
                    or m.name ilike '%' || cast(:term as varchar) || '%'
                 order by (b.model_id is null), b.name limit :limit
                """).param("term", search).param("limit", limit).query(JdbcBomRepository::bom).list();
    }

    @Override
    public void insert(BomRevision r) {
        jdbc.sql("""
                insert into bom_revision (id, bom_id, revision, status, based_on_id, informed_total_cents, notes, import_id,
                       approved_at, approved_by, version, created_at, created_by, updated_at, updated_by)
                values (:id, :bom, :revision, :status, :basedOn, :informed, :notes, :import, :approvedAt, :approvedBy, :version,
                        :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", r.id()).param("bom", r.bomId()).param("revision", r.revision()).param("status", r.status().name())
                .param("basedOn", r.basedOnId()).param("informed", r.informedTotalCents()).param("notes", r.notes())
                .param("import", r.importId()).param("approvedAt", ts(r.approvedAt())).param("approvedBy", r.approvedBy())
                .param("version", r.version()).param("createdAt", ts(r.createdAt())).param("createdBy", r.createdBy())
                .param("updatedAt", ts(r.updatedAt())).param("updatedBy", r.updatedBy())
                .update();
    }

    @Override
    public boolean update(BomRevision r, long expectedVersion) {
        return jdbc.sql("""
                update bom_revision set status = :status, informed_total_cents = :informed, notes = :notes, approved_at = :approvedAt,
                       approved_by = :approvedBy, version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("status", r.status().name()).param("informed", r.informedTotalCents()).param("notes", r.notes())
                .param("approvedAt", ts(r.approvedAt())).param("approvedBy", r.approvedBy()).param("version", r.version())
                .param("updatedAt", ts(r.updatedAt())).param("updatedBy", r.updatedBy()).param("id", r.id())
                .param("expected", expectedVersion)
                .update() == 1;
    }

    @Override
    public Optional<BomRevision> findRevision(UUID id) {
        return jdbc.sql("select * from bom_revision where id = :id").param("id", id).query(JdbcBomRepository::revision).optional();
    }

    @Override
    public Optional<BomRevision> findRevisionForUpdate(UUID id) {
        return jdbc.sql("select * from bom_revision where id = :id for update").param("id", id)
                .query(JdbcBomRepository::revision).optional();
    }

    @Override
    public Optional<BomRevision> currentOf(UUID bomId) {
        return jdbc.sql("select * from bom_revision where bom_id = :bom").param("bom", bomId).query(JdbcBomRepository::revision).optional();
    }

    @Override
    public List<BomLine> linesOf(UUID revisionId) {
        return jdbc.sql("select * from bom_line where revision_id = :rev order by position").param("rev", revisionId)
                .query(JdbcBomRepository::line).list();
    }

    @Override
    public void replaceLines(UUID revisionId, List<BomLine> lines) {
        jdbc.sql("delete from bom_line where revision_id = :rev").param("rev", revisionId).update();
        for (BomLine l : lines) {
            jdbc.sql("""
                    insert into bom_line (id, revision_id, position, kind, item_id, child_revision_id, reference_code, description,
                           quantity, uom, unit_cost, category, supplier, material, notes)
                    values (:id, :rev, :position, :kind, :item, :child, :ref, :description, :quantity, :uom, :cost, :category,
                            :supplier, :material, :notes)
                    """)
                    .param("id", l.id()).param("rev", revisionId).param("position", l.position()).param("kind", l.kind().name())
                    .param("item", l.itemId()).param("child", l.childRevisionId()).param("ref", l.referenceCode())
                    .param("description", l.description()).param("quantity", l.quantity()).param("uom", l.uom())
                    .param("cost", l.unitCost()).param("category", l.category()).param("supplier", l.supplier())
                    .param("material", l.material()).param("notes", l.notes())
                    .update();
        }
    }

    @Override
    public List<UUID> parentsOf(UUID revisionId) {
        return jdbc.sql("select distinct revision_id from bom_line where child_revision_id = :rev").param("rev", revisionId)
                .query(UUID.class).list();
    }

    // ───────────── Carga do arquivo ─────────────

    @Override
    public Optional<BomImport> findImportByHash(String hash) {
        return jdbc.sql("select * from bom_import where file_hash = :hash").param("hash", hash).query(JdbcBomRepository::bomImport).optional();
    }

    @Override
    public Optional<BomImport> findImport(UUID id) {
        return jdbc.sql("select * from bom_import where id = :id").param("id", id).query(JdbcBomRepository::bomImport).optional();
    }

    @Override
    public Optional<BomImport> findImportForUpdate(UUID id) {
        return jdbc.sql("select * from bom_import where id = :id for update").param("id", id).query(JdbcBomRepository::bomImport).optional();
    }

    @Override
    public void insert(BomImport i) {
        jdbc.sql("""
                insert into bom_import (id, file_name, file_hash, content, product, status, revision_id, created_at, created_by)
                values (:id, :name, :hash, :content, :product, :status, :revision, :createdAt, :createdBy)
                on conflict (file_hash) do nothing
                """)
                .param("id", i.id()).param("name", i.fileName()).param("hash", i.fileHash()).param("content", i.content())
                .param("product", i.product()).param("status", i.status()).param("revision", i.revisionId())
                .param("createdAt", ts(i.createdAt())).param("createdBy", i.createdBy())
                .update();
    }

    @Override
    public void confirm(UUID importId, UUID revisionId, Instant now, String actor) {
        jdbc.sql("""
                update bom_import set status = 'CONFIRMED', revision_id = :rev, confirmed_at = :now, confirmed_by = :actor where id = :id
                """).param("rev", revisionId).param("now", ts(now)).param("actor", actor).param("id", importId).update();
    }

    // ───────────── BOM do equipamento ─────────────

    @Override
    public Optional<EquipmentBom> equipmentBomOf(UUID equipmentId) {
        return jdbc.sql("select * from equipment_bom where equipment_id = :e").param("e", equipmentId)
                .query(JdbcBomRepository::equipmentBom).optional();
    }

    @Override
    public Optional<EquipmentBom> equipmentBomForUpdate(UUID equipmentId) {
        return jdbc.sql("select * from equipment_bom where equipment_id = :e for update").param("e", equipmentId)
                .query(JdbcBomRepository::equipmentBom).optional();
    }

    @Override
    public void insert(EquipmentBom b) {
        jdbc.sql("""
                insert into equipment_bom (id, equipment_id, revision_id, version, applied_at, applied_by, updated_at, updated_by)
                values (:id, :equipment, :revision, :version, :appliedAt, :appliedBy, :updatedAt, :updatedBy)
                """)
                .param("id", b.id()).param("equipment", b.equipmentId()).param("revision", b.revisionId()).param("version", b.version())
                .param("appliedAt", ts(b.appliedAt())).param("appliedBy", b.appliedBy()).param("updatedAt", ts(b.updatedAt()))
                .param("updatedBy", b.updatedBy())
                .update();
    }

    @Override
    public void update(EquipmentBom b) {
        jdbc.sql("""
                update equipment_bom set revision_id = :revision, version = :version, applied_at = :appliedAt, applied_by = :appliedBy,
                       updated_at = :updatedAt, updated_by = :updatedBy where id = :id
                """)
                .param("revision", b.revisionId()).param("version", b.version()).param("appliedAt", ts(b.appliedAt()))
                .param("appliedBy", b.appliedBy()).param("updatedAt", ts(b.updatedAt())).param("updatedBy", b.updatedBy())
                .param("id", b.id())
                .update();
    }

    @Override
    public List<EquipmentBom.Line> equipmentLines(UUID equipmentBomId) {
        return jdbc.sql("select * from equipment_bom_line where equipment_bom_id = :b order by position").param("b", equipmentBomId)
                .query(JdbcBomRepository::equipmentLine).list();
    }

    @Override
    public void deleteEquipmentLines(UUID equipmentBomId) {
        jdbc.sql("delete from equipment_bom_line where equipment_bom_id = :b").param("b", equipmentBomId).update();
    }

    @Override
    public void insertEquipmentLines(List<EquipmentBom.Line> lines) {
        for (EquipmentBom.Line l : lines) {
            jdbc.sql("""
                    insert into equipment_bom_line (id, equipment_bom_id, parent_id, position, kind, item_id, child_revision_id,
                           reference_code, description, quantity, uom, unit_cost, category, supplier, material, notes, origin,
                           model_quantity, model_unit_cost, status, adjustment_reason)
                    values (:id, :bom, :parent, :position, :kind, :item, :child, :ref, :description, :quantity, :uom, :cost, :category,
                            :supplier, :material, :notes, :origin, :modelQuantity, :modelCost, :status, :reason)
                    """)
                    .param("id", l.id()).param("bom", l.equipmentBomId()).param("parent", l.parentId()).param("position", l.position())
                    .param("kind", l.kind().name()).param("item", l.itemId()).param("child", l.childRevisionId())
                    .param("ref", l.referenceCode()).param("description", l.description()).param("quantity", l.quantity())
                    .param("uom", l.uom()).param("cost", l.unitCost()).param("category", l.category()).param("supplier", l.supplier())
                    .param("material", l.material()).param("notes", l.notes()).param("origin", l.origin().name())
                    .param("modelQuantity", l.modelQuantity()).param("modelCost", l.modelUnitCost())
                    .param("status", l.status().name()).param("reason", l.adjustmentReason())
                    .update();
        }
    }

    @Override
    public void updateEquipmentLine(EquipmentBom.Line l) {
        jdbc.sql("""
                update equipment_bom_line set quantity = :quantity, unit_cost = :cost, notes = :notes, status = :status,
                       adjustment_reason = :reason where id = :id
                """)
                .param("quantity", l.quantity()).param("cost", l.unitCost()).param("notes", l.notes())
                .param("status", l.status().name()).param("reason", l.adjustmentReason()).param("id", l.id())
                .update();
    }

    @Override
    public List<EquipmentBom> equipmentBoms(Collection<UUID> equipmentIds) {
        if (equipmentIds.isEmpty()) return List.of();
        return jdbc.sql("select * from equipment_bom where equipment_id in (:ids)").param("ids", equipmentIds)
                .query(JdbcBomRepository::equipmentBom).list();
    }

    // ───────────── Mapeamento ─────────────

    private static Bom bom(ResultSet rs, int n) throws SQLException {
        return new Bom(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"), rs.getObject("model_id", UUID.class),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                rs.getString("updated_by"));
    }

    private static BomRevision revision(ResultSet rs, int n) throws SQLException {
        long informed = rs.getLong("informed_total_cents");
        Long informedTotal = rs.wasNull() ? null : informed;
        return new BomRevision(rs.getObject("id", UUID.class), rs.getObject("bom_id", UUID.class), rs.getInt("revision"),
                BomRevision.Status.valueOf(rs.getString("status")), rs.getObject("based_on_id", UUID.class), informedTotal,
                rs.getString("notes"), rs.getObject("import_id", UUID.class), instant(rs, "approved_at"), rs.getString("approved_by"),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                rs.getString("updated_by"));
    }

    private static BomLine line(ResultSet rs, int n) throws SQLException {
        return new BomLine(rs.getObject("id", UUID.class), rs.getObject("revision_id", UUID.class), rs.getInt("position"),
                BomCost.Kind.valueOf(rs.getString("kind")), rs.getObject("item_id", UUID.class),
                rs.getObject("child_revision_id", UUID.class), rs.getString("reference_code"), rs.getString("description"),
                rs.getBigDecimal("quantity"), rs.getString("uom"), rs.getBigDecimal("unit_cost"), rs.getString("category"),
                rs.getString("supplier"), rs.getString("material"), rs.getString("notes"));
    }

    private static BomImport bomImport(ResultSet rs, int n) throws SQLException {
        return new BomImport(rs.getObject("id", UUID.class), rs.getString("file_name"), rs.getString("file_hash"), rs.getString("content"),
                rs.getString("product"), rs.getString("status"), rs.getObject("revision_id", UUID.class), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "confirmed_at"), rs.getString("confirmed_by"));
    }

    private static EquipmentBom equipmentBom(ResultSet rs, int n) throws SQLException {
        return new EquipmentBom(rs.getObject("id", UUID.class), rs.getObject("equipment_id", UUID.class),
                rs.getObject("revision_id", UUID.class), rs.getLong("version"), instant(rs, "applied_at"), rs.getString("applied_by"),
                instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static EquipmentBom.Line equipmentLine(ResultSet rs, int n) throws SQLException {
        return new EquipmentBom.Line(rs.getObject("id", UUID.class), rs.getObject("equipment_bom_id", UUID.class),
                rs.getObject("parent_id", UUID.class), rs.getInt("position"), BomCost.Kind.valueOf(rs.getString("kind")),
                rs.getObject("item_id", UUID.class), rs.getObject("child_revision_id", UUID.class), rs.getString("reference_code"),
                rs.getString("description"), rs.getBigDecimal("quantity"), rs.getString("uom"), rs.getBigDecimal("unit_cost"),
                rs.getString("category"), rs.getString("supplier"), rs.getString("material"), rs.getString("notes"),
                EquipmentBom.Origin.valueOf(rs.getString("origin")), rs.getBigDecimal("model_quantity"),
                rs.getBigDecimal("model_unit_cost"), EquipmentBom.LineStatus.valueOf(rs.getString("status")),
                rs.getString("adjustment_reason"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
