package br.com.fourtech.rendamais.projetos.infrastructure;

import br.com.fourtech.rendamais.projetos.application.ProjectRepository;
import br.com.fourtech.rendamais.projetos.domain.Equipment;
import br.com.fourtech.rendamais.projetos.domain.EquipmentModel;
import br.com.fourtech.rendamais.projetos.domain.Project;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcProjectRepository implements ProjectRepository {

    private static final String PROJECTS = """
            select pr.*, p.code as partner_code, p.legal_name as partner_name,
                   (select count(*) from equipment e where e.project_id = pr.id and e.status = 'ATIVO') as equipment_count
              from project pr join partner p on p.id = pr.customer_id
            """;
    private static final String EQUIPMENT = """
            select e.*, pr.code as project_code, pr.order_code, p.code as partner_code, p.legal_name as partner_name,
                   m.code as model_code, m.name as model_name
              from equipment e join project pr on pr.id = e.project_id join partner p on p.id = e.customer_id
                   join equipment_model m on m.id = e.model_id
            """;

    private final JdbcClient jdbc;

    JdbcProjectRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextProjectCode() {
        return String.format("PJ%05d", jdbc.sql("select nextval('project_code_seq')").query(Long.class).single());
    }

    @Override
    public String nextEquipmentCode() {
        return String.format("EQ%05d", jdbc.sql("select nextval('equipment_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Project p) {
        jdbc.sql("""
                insert into project (id, code, name, order_id, order_code, customer_id, unit_id, unit_name, stage, contract_delivery,
                       contract_cents, closed_reason, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :order, :orderCode, :customer, :unit, :unitName, :stage, :delivery, :cents, :reason,
                        :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", p.id()).param("code", p.code()).param("name", p.name()).param("order", p.orderId())
                .param("orderCode", p.orderCode()).param("customer", p.customerId()).param("unit", p.unitId())
                .param("unitName", p.unitName()).param("stage", p.stage().name()).param("delivery", date(p.contractDelivery()))
                .param("cents", p.contractCents()).param("reason", p.closedReason()).param("version", p.version())
                .param("createdAt", ts(p.createdAt())).param("createdBy", p.createdBy())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy())
                .update();
    }

    @Override
    public void update(Project p) {
        jdbc.sql("""
                update project set stage = :stage, closed_reason = :reason, version = :version, updated_at = :updatedAt,
                       updated_by = :updatedBy where id = :id
                """)
                .param("stage", p.stage().name()).param("reason", p.closedReason()).param("version", p.version())
                .param("updatedAt", ts(p.updatedAt())).param("updatedBy", p.updatedBy()).param("id", p.id())
                .update();
    }

    @Override
    public void insert(Equipment e) {
        jdbc.sql("""
                insert into equipment (id, code, project_id, order_line_id, line_seq, model, model_id, item_id, customer_id, unit_id, unit_name,
                       serial_number, notes, status, accepted_on, warranty_start, version, created_at, created_by, updated_at,
                       updated_by)
                values (:id, :code, :project, :line, :seq, :model, :modelId, :item, :customer, :unit, :unitName, :serial, :notes, :status,
                        :accepted, :warranty, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", e.id()).param("code", e.code()).param("project", e.projectId()).param("line", e.orderLineId())
                .param("seq", e.lineSeq()).param("model", e.model()).param("modelId", e.modelId()).param("item", e.itemId()).param("customer", e.customerId())
                .param("unit", e.unitId()).param("unitName", e.unitName()).param("serial", e.serialNumber())
                .param("notes", e.notes()).param("status", e.status().name()).param("accepted", date(e.acceptedOn()))
                .param("warranty", date(e.warrantyStart())).param("version", e.version())
                .param("createdAt", ts(e.createdAt())).param("createdBy", e.createdBy())
                .param("updatedAt", ts(e.updatedAt())).param("updatedBy", e.updatedBy())
                .update();
    }

    @Override
    public boolean update(Equipment e, long expectedVersion) {
        return jdbc.sql("""
                update equipment set serial_number = :serial, notes = :notes, status = :status, version = :version,
                       updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("serial", e.serialNumber()).param("notes", e.notes()).param("status", e.status().name())
                .param("version", e.version()).param("updatedAt", ts(e.updatedAt())).param("updatedBy", e.updatedBy())
                .param("id", e.id()).param("expected", expectedVersion)
                .update() == 1;
    }

    @Override
    public Optional<Project> findByOrderForUpdate(UUID orderId) {
        return jdbc.sql("select * from project where order_id = :order for update").param("order", orderId)
                .query(JdbcProjectRepository::project).optional();
    }

    @Override
    public Optional<ProjectSummary> findProject(UUID id) {
        return jdbc.sql(PROJECTS + " where pr.id = :id").param("id", id).query(JdbcProjectRepository::projectSummary).optional();
    }

    @Override
    public Optional<UUID> projectIdForOrder(UUID orderId) {
        return jdbc.sql("select id from project where order_id = :order").param("order", orderId).query(UUID.class).optional();
    }

    @Override
    public List<ProjectSummary> listProjects(String search, Project.Stage stage, boolean includeClosed, int limit) {
        return jdbc.sql(PROJECTS + """
                 where (:all or pr.stage <> 'ENCERRADO')
                   and (cast(:stage as varchar) is null or pr.stage = cast(:stage as varchar))
                   and (cast(:term as varchar) is null
                        or pr.code ilike '%' || cast(:term as varchar) || '%'
                        or pr.name ilike '%' || cast(:term as varchar) || '%'
                        or pr.order_code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%')
                 order by pr.code desc limit :limit
                """)
                .param("all", includeClosed).param("stage", stage == null ? null : stage.name()).param("term", search)
                .param("limit", limit).query(JdbcProjectRepository::projectSummary).list();
    }

    @Override
    public List<Equipment> equipmentOf(UUID projectId) {
        return jdbc.sql("select * from equipment where project_id = :id order by code").param("id", projectId)
                .query(JdbcProjectRepository::equipment).list();
    }

    @Override
    public Optional<EquipmentSummary> findEquipment(UUID id) {
        return jdbc.sql(EQUIPMENT + " where e.id = :id").param("id", id).query(JdbcProjectRepository::equipmentSummary).optional();
    }

    @Override
    public Optional<Equipment> findEquipmentForUpdate(UUID id) {
        return jdbc.sql("select * from equipment where id = :id for update").param("id", id)
                .query(JdbcProjectRepository::equipment).optional();
    }

    @Override
    public Optional<String> codeWithSerial(String model, String serialNumber, UUID exceptId) {
        return jdbc.sql("""
                select code from equipment where lower(model) = lower(:model) and serial_number = :serial and id <> :id limit 1
                """).param("model", model).param("serial", serialNumber).param("id", exceptId).query(String.class).optional();
    }

    @Override
    public List<EquipmentSummary> listEquipment(String search, UUID projectId, boolean includeCancelled, int limit) {
        return jdbc.sql(EQUIPMENT + """
                 where (:all or e.status = 'ATIVO')
                   and (cast(:project as uuid) is null or e.project_id = cast(:project as uuid))
                   and (cast(:term as varchar) is null
                        or e.code ilike '%' || cast(:term as varchar) || '%'
                        or e.model ilike '%' || cast(:term as varchar) || '%'
                        or e.serial_number ilike '%' || cast(:term as varchar) || '%'
                        or pr.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%')
                 order by e.code desc limit :limit
                """)
                .param("all", includeCancelled).param("project", projectId).param("term", search).param("limit", limit)
                .query(JdbcProjectRepository::equipmentSummary).list();
    }

    // ───────────── Modelos de equipamento ─────────────

    private static final String MODELS = """
            select m.*, (select count(*) from equipment e where e.model_id = m.id) as equipment_count from equipment_model m
            """;

    @Override
    public String nextModelCode() {
        return String.format("MD%05d", jdbc.sql("select nextval('equipment_model_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(EquipmentModel m) {
        jdbc.sql("""
                insert into equipment_model (id, code, name, status, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :status, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", m.id()).param("code", m.code()).param("name", m.name()).param("status", m.status().name())
                .param("version", m.version()).param("createdAt", ts(m.createdAt())).param("createdBy", m.createdBy())
                .param("updatedAt", ts(m.updatedAt())).param("updatedBy", m.updatedBy())
                .update();
    }

    @Override
    public boolean update(EquipmentModel m, long expectedVersion) {
        return jdbc.sql("""
                update equipment_model set name = :name, status = :status, version = :version, updated_at = :updatedAt,
                       updated_by = :updatedBy where id = :id and version = :expected
                """)
                .param("name", m.name()).param("status", m.status().name()).param("version", m.version())
                .param("updatedAt", ts(m.updatedAt())).param("updatedBy", m.updatedBy()).param("id", m.id())
                .param("expected", expectedVersion)
                .update() == 1;
    }

    @Override
    public Optional<EquipmentModel> findModelForUpdate(UUID id) {
        return jdbc.sql("select * from equipment_model where id = :id for update").param("id", id)
                .query(JdbcProjectRepository::model).optional();
    }

    @Override
    public Optional<ModelSummary> findModel(UUID id) {
        return jdbc.sql(MODELS + " where m.id = :id").param("id", id).query(JdbcProjectRepository::modelSummary).optional();
    }

    @Override
    public Optional<EquipmentModel> findModelByName(String name) {
        return jdbc.sql("select * from equipment_model where lower(name) = lower(:name)").param("name", name)
                .query(JdbcProjectRepository::model).optional();
    }

    @Override
    public List<ModelSummary> listModels(String search, boolean includeInactive, int limit) {
        return jdbc.sql(MODELS + """
                 where (:all or m.status = 'ATIVO')
                   and (cast(:term as varchar) is null
                        or m.code ilike '%' || cast(:term as varchar) || '%'
                        or m.name ilike '%' || cast(:term as varchar) || '%')
                 order by m.name limit :limit
                """)
                .param("all", includeInactive).param("term", search).param("limit", limit)
                .query(JdbcProjectRepository::modelSummary).list();
    }

    private static ModelSummary modelSummary(ResultSet rs, int n) throws SQLException {
        return new ModelSummary(model(rs, n), rs.getInt("equipment_count"));
    }

    private static EquipmentModel model(ResultSet rs, int n) throws SQLException {
        return new EquipmentModel(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                EquipmentModel.Status.valueOf(rs.getString("status")), rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static ProjectSummary projectSummary(ResultSet rs, int n) throws SQLException {
        return new ProjectSummary(project(rs, n), rs.getString("partner_code"), rs.getString("partner_name"),
                rs.getInt("equipment_count"));
    }

    private static EquipmentSummary equipmentSummary(ResultSet rs, int n) throws SQLException {
        return new EquipmentSummary(equipment(rs, n), rs.getString("project_code"), rs.getString("order_code"),
                rs.getString("partner_code"), rs.getString("partner_name"), rs.getString("model_code"), rs.getString("model_name"));
    }

    private static Project project(ResultSet rs, int n) throws SQLException {
        return new Project(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getObject("order_id", UUID.class), rs.getString("order_code"), rs.getObject("customer_id", UUID.class),
                rs.getObject("unit_id", UUID.class), rs.getString("unit_name"), Project.Stage.valueOf(rs.getString("stage")),
                localDate(rs, "contract_delivery"), rs.getLong("contract_cents"), rs.getString("closed_reason"),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                rs.getString("updated_by"));
    }

    private static Equipment equipment(ResultSet rs, int n) throws SQLException {
        return new Equipment(rs.getObject("id", UUID.class), rs.getString("code"), rs.getObject("project_id", UUID.class),
                rs.getObject("order_line_id", UUID.class), rs.getInt("line_seq"), rs.getString("model"),
                rs.getObject("model_id", UUID.class), rs.getObject("item_id", UUID.class), rs.getObject("customer_id", UUID.class), rs.getObject("unit_id", UUID.class),
                rs.getString("unit_name"), rs.getString("serial_number"), rs.getString("notes"),
                Equipment.Status.valueOf(rs.getString("status")), localDate(rs, "accepted_on"), localDate(rs, "warranty_start"),
                rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                rs.getString("updated_by"));
    }

    private static LocalDate localDate(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    private static Date date(LocalDate d) {
        return d == null ? null : Date.valueOf(d);
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
