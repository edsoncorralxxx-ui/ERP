package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.SettlementRepository;
import br.com.fourtech.rendamais.financeiro.domain.CashMovement;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.financeiro.infrastructure.JdbcFinancialTitleRepository.instant;
import static br.com.fourtech.rendamais.financeiro.infrastructure.JdbcFinancialTitleRepository.ts;

@Repository
class JdbcSettlementRepository implements SettlementRepository {

    private static final String SELECT = """
            select s.*, b.code as account_code, b.name as account_name, p.code as partner_code, p.legal_name as partner_name
              from settlement s join bank_account b on b.id = s.account_id join partner p on p.id = s.counterparty_id
            """;

    private final JdbcClient jdbc;

    JdbcSettlementRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextReceiptCode() {
        return String.format("RC%05d", jdbc.sql("select nextval('settlement_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Settlement s) {
        jdbc.sql("""
                insert into settlement (id, code, direction, account_id, counterparty_id, effective_date, total_cents, notes, status,
                       version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :direction, :account, :partner, :date, :total, :notes, :status, :version, :createdAt, :createdBy,
                        :updatedAt, :updatedBy)
                """)
                .param("id", s.id()).param("code", s.code()).param("direction", s.direction().name()).param("account", s.accountId())
                .param("partner", s.counterpartyId()).param("date", Date.valueOf(s.effectiveDate())).param("total", s.total().cents())
                .param("notes", s.notes()).param("status", s.status().name()).param("version", s.version())
                .param("createdAt", ts(s.createdAt())).param("createdBy", s.createdBy())
                .param("updatedAt", ts(s.updatedAt())).param("updatedBy", s.updatedBy())
                .update();
        for (Settlement.Allocation a : s.allocations()) {
            jdbc.sql("insert into settlement_allocation (settlement_id, title_id, amount_cents) values (:s, :t, :amount)")
                    .param("s", s.id()).param("t", a.titleId()).param("amount", a.amount().cents()).update();
        }
    }

    @Override
    public void markReversed(Settlement s) {
        jdbc.sql("""
                update settlement set status = :status, reversal_reason = :reason, reversed_at = :at, reversed_by = :by,
                       version = :version, updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id
                """)
                .param("status", s.status().name()).param("reason", s.reversal().reason()).param("at", ts(s.reversal().at()))
                .param("by", s.reversal().by()).param("version", s.version()).param("updatedAt", ts(s.updatedAt()))
                .param("updatedBy", s.updatedBy()).param("id", s.id())
                .update();
    }

    @Override
    public Optional<Settlement> findByIdForUpdate(UUID id) {
        Optional<UUID> locked = jdbc.sql("select id from settlement where id = :id for update").param("id", id).query(UUID.class).optional();
        return locked.flatMap(l -> findById(l).map(Summary::settlement));
    }

    @Override
    public Optional<Summary> findById(UUID id) {
        return jdbc.sql(SELECT + " where s.id = :id").param("id", id).query(Row::of).optional()
                .map(r -> withAllocations(List.of(r)).get(0));
    }

    @Override
    public List<Summary> list(UUID titleId, UUID counterpartyId, String search, boolean includeReversed, int limit) {
        List<Row> rows = jdbc.sql(SELECT + """
                 where (:all or s.status = 'POSTED')
                   and (cast(:title as uuid) is null
                        or exists (select 1 from settlement_allocation a where a.settlement_id = s.id and a.title_id = cast(:title as uuid)))
                   and (cast(:partner as uuid) is null or s.counterparty_id = cast(:partner as uuid))
                   and (cast(:term as varchar) is null
                        or s.code ilike '%' || cast(:term as varchar) || '%'
                        or p.legal_name ilike '%' || cast(:term as varchar) || '%'
                        or p.code ilike '%' || cast(:term as varchar) || '%'
                        or exists (select 1 from settlement_allocation a join financial_title t on t.id = a.title_id
                                    where a.settlement_id = s.id and t.code ilike '%' || cast(:term as varchar) || '%'))
                 order by s.effective_date desc, s.code desc limit :limit
                """)
                .param("all", includeReversed).param("title", titleId).param("partner", counterpartyId).param("term", search)
                .param("limit", limit)
                .query(Row::of).list();
        return withAllocations(rows);
    }

    @Override
    public void insertCashMovement(CashMovement m) {
        jdbc.sql("""
                insert into cash_movement (id, account_id, effective_date, amount_cents, description, settlement_id, reverses_id,
                       created_at, created_by)
                values (:id, :account, :date, :amount, :description, :settlement, :reverses, :at, :by)
                """)
                .param("id", m.id()).param("account", m.accountId()).param("date", Date.valueOf(m.effectiveDate()))
                .param("amount", m.amount().cents()).param("description", m.description()).param("settlement", m.settlementId())
                .param("reverses", m.reversesId()).param("at", ts(m.createdAt())).param("by", m.createdBy())
                .update();
    }

    @Override
    public Optional<CashMovement> inflowOf(UUID settlementId) {
        return jdbc.sql("select * from cash_movement where settlement_id = :s and reverses_id is null").param("s", settlementId)
                .query((rs, n) -> new CashMovement(rs.getObject("id", UUID.class), rs.getObject("account_id", UUID.class),
                        rs.getDate("effective_date").toLocalDate(), Money.ofCents(rs.getLong("amount_cents"), Currency.BRL),
                        rs.getString("description"), rs.getObject("settlement_id", UUID.class), null, instant(rs, "created_at"),
                        rs.getString("created_by")))
                .optional();
    }

    /** Linha da liquidação antes de ler as alocações. */
    private record Row(UUID id, String code, FinancialTitle.Direction direction, UUID accountId, UUID counterpartyId,
                       java.time.LocalDate effectiveDate, long totalCents, String notes, Settlement.Reversal reversal, long version,
                       java.time.Instant createdAt, String createdBy, java.time.Instant updatedAt, String updatedBy,
                       String accountCode, String accountName, String partnerCode, String partnerName) {
        static Row of(ResultSet rs, int n) throws SQLException {
            Settlement.Reversal reversal = "REVERSED".equals(rs.getString("status"))
                    ? new Settlement.Reversal(rs.getString("reversal_reason"), instant(rs, "reversed_at"), rs.getString("reversed_by"))
                    : null;
            return new Row(rs.getObject("id", UUID.class), rs.getString("code"), FinancialTitle.Direction.valueOf(rs.getString("direction")),
                    rs.getObject("account_id", UUID.class), rs.getObject("counterparty_id", UUID.class),
                    rs.getDate("effective_date").toLocalDate(), rs.getLong("total_cents"), rs.getString("notes"), reversal,
                    rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"), instant(rs, "updated_at"),
                    rs.getString("updated_by"), rs.getString("account_code"), rs.getString("account_name"), rs.getString("partner_code"),
                    rs.getString("partner_name"));
        }
    }

    /** Lê as alocações de todas as liquidações numa consulta só, na ordem dos títulos por vencimento. */
    private List<Summary> withAllocations(List<Row> rows) {
        if (rows.isEmpty()) return List.of();
        Map<UUID, List<TitleRef>> byId = new LinkedHashMap<>();
        rows.forEach(r -> byId.put(r.id(), new ArrayList<>()));
        record Allocated(UUID settlementId, TitleRef title) { }
        jdbc.sql("""
                select a.settlement_id, a.title_id, a.amount_cents, t.code, t.origin_label
                  from settlement_allocation a join financial_title t on t.id = a.title_id
                 where a.settlement_id in (:ids) order by t.due_date, t.code
                """)
                .param("ids", List.copyOf(byId.keySet()))
                .query((rs, n) -> new Allocated(rs.getObject("settlement_id", UUID.class), new TitleRef(rs.getObject("title_id", UUID.class),
                        rs.getString("code"), rs.getString("origin_label"), rs.getLong("amount_cents"))))
                .list()
                .forEach(a -> byId.get(a.settlementId()).add(a.title()));
        List<Summary> out = new ArrayList<>();
        for (Row r : rows) {
            List<TitleRef> titles = byId.get(r.id());
            List<Settlement.Allocation> allocations = titles.stream()
                    .map(t -> new Settlement.Allocation(t.id(), Money.ofCents(t.amountCents(), Currency.BRL))).toList();
            Settlement s = new Settlement(r.id(), r.code(), r.direction(), r.accountId(), r.counterpartyId(), r.effectiveDate(),
                    Money.ofCents(r.totalCents(), Currency.BRL), allocations, r.notes(), r.reversal(), r.version(), r.createdAt(),
                    r.createdBy(), r.updatedAt(), r.updatedBy());
            out.add(new Summary(s, r.accountCode(), r.accountName(), r.partnerCode(), r.partnerName(), List.copyOf(titles)));
        }
        return out;
    }
}
