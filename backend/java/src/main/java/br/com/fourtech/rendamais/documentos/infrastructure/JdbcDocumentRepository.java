package br.com.fourtech.rendamais.documentos.infrastructure;

import br.com.fourtech.rendamais.documentos.application.DocumentRepository;
import br.com.fourtech.rendamais.documentos.domain.BusinessDocument;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

@Repository
class JdbcDocumentRepository implements DocumentRepository {

    private static final String SELECT = """
            select d.*, p.code as partner_code, p.legal_name as partner_name, j.code as project_code, o.code as order_code
              from business_document d
              join partner p on p.id = d.partner_id
              left join project j on j.id = d.project_id
              left join sales_order o on o.id = d.order_id
            """;

    private final JdbcClient jdbc;

    JdbcDocumentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("DF%05d", jdbc.sql("select nextval('business_document_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(BusinessDocument d) {
        jdbc.sql("""
                insert into business_document (id, code, direction, partner_id, order_id, series, number, issue_date, competence, total_cents,
                       linked_cents, notes, operation_nature, project_id, classification_rev, status, cancel_reason, version,
                       created_at, created_by, updated_at, updated_by)
                values (:id, :code, :direction, :partner, :order, :series, :number, :issue, :competence, :total, :linked, :notes, :nature,
                        :project, :rev, :status, :reason, :version, :createdAt, :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", d.id()).param("code", d.code()).param("direction", d.direction().name())
                .param("partner", d.partnerId()).param("order", d.orderId()).param("series", d.series()).param("number", d.number())
                .param("issue", Date.valueOf(d.issueDate())).param("competence", d.competence().toString())
                .param("total", d.total().cents()).param("linked", d.linked().cents()).param("notes", d.notes())
                .param("nature", d.operationNature() == null ? null : d.operationNature().name()).param("project", d.projectId())
                .param("rev", d.classificationRev()).param("status", d.status().name()).param("reason", d.cancelReason())
                .param("version", d.version()).param("createdAt", ts(d.createdAt())).param("createdBy", d.createdBy())
                .param("updatedAt", ts(d.updatedAt())).param("updatedBy", d.updatedBy())
                .update();
        for (BusinessDocument.Line l : d.lines()) {
            jdbc.sql("""
                    insert into document_line (document_id, seq, description, kind, amount_cents)
                    values (:d, :seq, :description, :kind, :cents)
                    """)
                    .param("d", d.id()).param("seq", l.seq()).param("description", l.description()).param("kind", l.kind().name())
                    .param("cents", l.amount().cents()).update();
        }
        d.links().forEach(l -> insertLink(d.id(), l));
    }

    @Override
    public void update(BusinessDocument d, long expectedVersion) {
        int n = jdbc.sql("""
                update business_document set linked_cents = :linked, operation_nature = :nature, project_id = :project,
                       classification_rev = :rev, status = :status, cancel_reason = :reason, version = :version,
                       updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """)
                .param("linked", d.linked().cents()).param("nature", d.operationNature() == null ? null : d.operationNature().name())
                .param("project", d.projectId()).param("rev", d.classificationRev()).param("status", d.status().name())
                .param("reason", d.cancelReason()).param("version", d.version()).param("at", ts(d.updatedAt()))
                .param("by", d.updatedBy()).param("id", d.id()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("business_document", expectedVersion, d.version() - 1);
        Map<UUID, BusinessDocument.LinkStatus> stored = new HashMap<>();
        jdbc.sql("select id, status from document_title_link where document_id = :d").param("d", d.id())
                .query(rs -> {
                    stored.put(rs.getObject("id", UUID.class), BusinessDocument.LinkStatus.valueOf(rs.getString("status")));
                });
        for (BusinessDocument.Link l : d.links()) {
            BusinessDocument.LinkStatus before = stored.get(l.id());
            if (before == null) {
                insertLink(d.id(), l);
            } else if (before != l.status()) {
                jdbc.sql("""
                        update document_title_link set status = :status, removed_reason = :reason, removed_at = :at, removed_by = :by
                         where id = :id
                        """)
                        .param("status", l.status().name()).param("reason", l.removedReason()).param("at", ts(l.removedAt()))
                        .param("by", l.removedBy()).param("id", l.id()).update();
            }
        }
    }

    private void insertLink(UUID documentId, BusinessDocument.Link l) {
        jdbc.sql("""
                insert into document_title_link (id, document_id, title_id, amount_cents, status, removed_reason, removed_at, removed_by,
                       created_at, created_by)
                values (:id, :d, :t, :cents, :status, :reason, :removedAt, :removedBy, :at, :by)
                """)
                .param("id", l.id()).param("d", documentId).param("t", l.titleId()).param("cents", l.amount().cents())
                .param("status", l.status().name()).param("reason", l.removedReason()).param("removedAt", ts(l.removedAt()))
                .param("removedBy", l.removedBy()).param("at", ts(l.createdAt())).param("by", l.createdBy()).update();
    }

    @Override
    public Optional<BusinessDocument> findForUpdate(UUID id) {
        Optional<UUID> locked = jdbc.sql("select id from business_document where id = :id for update").param("id", id)
                .query(UUID.class).optional();
        return locked.flatMap(this::find).map(Summary::document);
    }

    @Override
    public Optional<Summary> find(UUID id) {
        return jdbc.sql(SELECT + " where d.id = :id").param("id", id).query(JdbcDocumentRepository::row).optional()
                .map(r -> complete(List.of(r), true).getFirst());
    }

    @Override
    public List<Summary> list(String search, Filter filter, YearMonth competence, UUID partnerId, int limit) {
        List<Row> rows = jdbc.sql(SELECT + """
                 where case :filter when 'ACTIVE' then d.status = 'ATIVO' when 'CANCELLED' then d.status = 'CANCELADO' else true end
                   and (cast(:competence as varchar) is null or d.competence = cast(:competence as varchar))
                   and (cast(:partner as uuid) is null or d.partner_id = cast(:partner as uuid))
                   and (cast(:term as varchar) is null
                        or d.code ilike '%' || cast(:term as varchar) || '%'
                        or d.number ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.code ilike '%' || cast(:term as varchar) || '%')
                 order by d.issue_date desc, d.created_at desc limit :limit
                """)
                .param("filter", filter.name()).param("competence", competence == null ? null : competence.toString())
                .param("partner", partnerId).param("term", search).param("limit", limit)
                .query(JdbcDocumentRepository::row).list();
        return complete(rows, false);
    }

    @Override
    public Optional<String> findActiveNumber(BusinessDocument.Direction direction, UUID partnerId, String series, String number) {
        return jdbc.sql("""
                select code from business_document
                 where direction = :direction and partner_id = :partner and series = :series and number = :number and status = 'ATIVO'
                """)
                .param("direction", direction.name()).param("partner", partnerId).param("series", series).param("number", number)
                .query(String.class).optional();
    }

    @Override
    public Map<UUID, Long> lockInvoicing(Map<UUID, Long> limitsByTitle) {
        Map<UUID, Long> out = new LinkedHashMap<>();
        if (limitsByTitle.isEmpty()) return out;
        // Em ordem de id, para que duas operações sobre as mesmas parcelas nunca se bloqueiem em ordem cruzada.
        for (Map.Entry<UUID, Long> e : new TreeMap<>(limitsByTitle).entrySet()) {
            jdbc.sql("insert into document_title_invoicing (title_id, limit_cents) values (:t, :limit) on conflict do nothing")
                    .param("t", e.getKey()).param("limit", e.getValue()).update();
        }
        jdbc.sql("select title_id, invoiced_cents from document_title_invoicing where title_id in (:ids) order by title_id for update")
                .param("ids", limitsByTitle.keySet())
                .query(rs -> {
                    out.put(rs.getObject("title_id", UUID.class), rs.getLong("invoiced_cents"));
                });
        return out;
    }

    @Override
    public void setInvoiced(UUID titleId, long invoicedCents) {
        jdbc.sql("update document_title_invoicing set invoiced_cents = :cents where title_id = :t")
                .param("cents", invoicedCents).param("t", titleId).update();
    }

    @Override
    public Map<UUID, Long> invoiced(List<UUID> titleIds) {
        Map<UUID, Long> out = new HashMap<>();
        titleIds.forEach(t -> out.put(t, 0L));
        if (titleIds.isEmpty()) return out;
        jdbc.sql("select title_id, invoiced_cents from document_title_invoicing where title_id in (:ids)").param("ids", titleIds)
                .query(rs -> {
                    out.put(rs.getObject("title_id", UUID.class), rs.getLong("invoiced_cents"));
                });
        return out;
    }

    @Override
    public Map<UUID, Map<BusinessDocument.LineKind, Long>> invoicedByKind(List<UUID> orderIds) {
        Map<UUID, Map<BusinessDocument.LineKind, Long>> out = new HashMap<>();
        if (orderIds.isEmpty()) return out;
        jdbc.sql("""
                select d.order_id, l.kind, sum(l.amount_cents) as cents
                  from business_document d join document_line l on l.document_id = d.id
                 where d.order_id in (:ids) and d.status = 'ATIVO'
                 group by d.order_id, l.kind
                """)
                .param("ids", orderIds)
                .query(rs -> {
                    out.computeIfAbsent(rs.getObject("order_id", UUID.class), k -> new HashMap<>())
                            .put(BusinessDocument.LineKind.valueOf(rs.getString("kind")), rs.getLong("cents"));
                });
        return out;
    }

    @Override
    public List<TitleLink> activeLinks(List<UUID> titleIds) {
        if (titleIds.isEmpty()) return List.of();
        return jdbc.sql("""
                select l.title_id, d.id, d.code, d.series, d.number, d.issue_date, l.amount_cents
                  from document_title_link l join business_document d on d.id = l.document_id
                 where l.title_id in (:ids) and l.status = 'ATIVO' and d.status = 'ATIVO'
                 order by d.issue_date, d.code
                """)
                .param("ids", titleIds)
                .query((rs, n) -> new TitleLink(rs.getObject("title_id", UUID.class), rs.getObject("id", UUID.class),
                        rs.getString("code"), rs.getString("series"), rs.getString("number"), rs.getDate("issue_date").toLocalDate(),
                        rs.getLong("amount_cents")))
                .list();
    }

    /** Acrescenta linhas, vínculos e parcelas; na lista, só os vínculos (para o valor vinculado). */
    private List<Summary> complete(List<Row> rows, boolean withLines) {
        if (rows.isEmpty()) return List.of();
        List<UUID> ids = rows.stream().map(Row::id).toList();
        Map<UUID, List<BusinessDocument.Line>> lines = new HashMap<>();
        if (withLines) {
            jdbc.sql("select * from document_line where document_id in (:ids) order by document_id, seq").param("ids", ids)
                    .query(rs -> {
                        lines.computeIfAbsent(rs.getObject("document_id", UUID.class), k -> new ArrayList<>())
                                .add(new BusinessDocument.Line(rs.getInt("seq"), rs.getString("description"),
                                        BusinessDocument.LineKind.valueOf(rs.getString("kind")),
                                        Money.ofCents(rs.getLong("amount_cents"), Currency.BRL)));
                    });
        }
        Map<UUID, List<BusinessDocument.Link>> links = new HashMap<>();
        Map<UUID, TitleRef> titles = new HashMap<>();
        jdbc.sql("""
                select l.*, t.code as title_code, t.origin_label
                  from document_title_link l join financial_title t on t.id = l.title_id
                 where l.document_id in (:ids) order by l.created_at, t.due_date, t.code
                """)
                .param("ids", ids)
                .query(rs -> {
                    UUID title = rs.getObject("title_id", UUID.class);
                    links.computeIfAbsent(rs.getObject("document_id", UUID.class), k -> new ArrayList<>())
                            .add(new BusinessDocument.Link(rs.getObject("id", UUID.class), title,
                                    Money.ofCents(rs.getLong("amount_cents"), Currency.BRL),
                                    BusinessDocument.LinkStatus.valueOf(rs.getString("status")), rs.getString("removed_reason"),
                                    instant(rs, "removed_at"), rs.getString("removed_by"), instant(rs, "created_at"),
                                    rs.getString("created_by")));
                    titles.put(title, new TitleRef(title, rs.getString("title_code"), rs.getString("origin_label")));
                });
        List<Summary> out = new ArrayList<>();
        for (Row r : rows) {
            Header h = r.header();
            BusinessDocument d = new BusinessDocument(h.id(), h.code(), h.direction(), h.partnerId(), h.orderId(), h.series(), h.number(),
                    h.issueDate(), h.competence(), lines.getOrDefault(r.id(), List.of()), h.total(), links.getOrDefault(r.id(), List.of()),
                    h.notes(), h.nature(), h.projectId(), h.rev(), h.status(), h.cancelReason(), h.version(), h.createdAt(),
                    h.createdBy(), h.updatedAt(), h.updatedBy());
            Map<UUID, TitleRef> mine = new LinkedHashMap<>();
            d.links().forEach(l -> mine.put(l.titleId(), titles.get(l.titleId())));
            out.add(new Summary(d, r.partnerCode(), r.partnerName(), r.projectCode(), r.orderCode(), mine));
        }
        return out;
    }

    /** Cabeçalho lido do banco, antes de juntar linhas e vínculos. */
    private record Header(UUID id, String code, BusinessDocument.Direction direction, UUID partnerId, UUID orderId, String series, String number,
                          java.time.LocalDate issueDate, YearMonth competence, Money total, String notes,
                          BusinessDocument.OperationNature nature, UUID projectId, int rev, BusinessDocument.Status status,
                          String cancelReason, long version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) { }

    private record Row(Header header, String partnerCode, String partnerName, String projectCode, String orderCode) {
        UUID id() {
            return header.id();
        }
    }

    private static Row row(ResultSet rs, int n) throws SQLException {
        String nature = rs.getString("operation_nature");
        Header h = new Header(rs.getObject("id", UUID.class), rs.getString("code"),
                BusinessDocument.Direction.valueOf(rs.getString("direction")), rs.getObject("partner_id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("series"), rs.getString("number"), rs.getDate("issue_date").toLocalDate(),
                YearMonth.parse(rs.getString("competence")), Money.ofCents(rs.getLong("total_cents"), Currency.BRL),
                rs.getString("notes"), nature == null ? null : BusinessDocument.OperationNature.valueOf(nature),
                rs.getObject("project_id", UUID.class), rs.getInt("classification_rev"),
                BusinessDocument.Status.valueOf(rs.getString("status")), rs.getString("cancel_reason"), rs.getLong("version"),
                instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
        return new Row(h, rs.getString("partner_code"), rs.getString("partner_name"), rs.getString("project_code"), rs.getString("order_code"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
