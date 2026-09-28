package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.SettlementRepository;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.financeiro.domain.Settlement;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcSettlementRepository implements SettlementRepository {

    private static final String SELECT = """
            select s.*, a.code as account_code, a.name as account_name, p.code as partner_code, p.legal_name as partner_name,
                   r.id as reversal_id, r.reason as reversal_reason, r.effective_date as reversal_date,
                   r.cash_movement_id as reversal_movement, r.created_at as reversal_at, r.created_by as reversal_by
              from settlement s
              join bank_account a on a.id = s.account_id
              join partner p on p.id = s.counterparty_id
              left join settlement_reversal r on r.settlement_id = s.id
            """;

    private final JdbcClient jdbc;

    JdbcSettlementRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode(FinancialTitle.Direction direction) {
        if (direction == FinancialTitle.Direction.PAYABLE) {
            return String.format("PG%05d", jdbc.sql("select nextval('payment_code_seq')").query(Long.class).single());
        }
        return String.format("RC%05d", jdbc.sql("select nextval('settlement_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(Settlement s) {
        jdbc.sql("""
                insert into settlement (id, code, direction, account_id, counterparty_id, effective_date, total_cents, credit_cents,
                       notes, status, version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :direction, :account, :partner, :date, :total, 0, :notes, :status, :version, :createdAt,
                        :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", s.id()).param("code", s.code()).param("direction", s.direction().name())
                .param("account", s.accountId()).param("partner", s.counterpartyId()).param("date", Date.valueOf(s.effectiveDate()))
                .param("total", s.total().cents()).param("notes", s.notes()).param("status", s.status().name())
                .param("version", s.version()).param("createdAt", ts(s.createdAt())).param("createdBy", s.createdBy())
                .param("updatedAt", ts(s.updatedAt())).param("updatedBy", s.updatedBy())
                .update();
        for (Settlement.Allocation a : s.allocations()) {
            jdbc.sql("insert into settlement_allocation (settlement_id, title_id, amount_cents) values (:s, :t, :cents)")
                    .param("s", s.id()).param("t", a.titleId()).param("cents", a.amount().cents()).update();
        }
    }

    @Override
    public void reverse(Settlement s, long expectedVersion) {
        int n = jdbc.sql("""
                update settlement set status = :status, version = :version, updated_at = :at, updated_by = :by
                 where id = :id and version = :expected
                """)
                .param("status", s.status().name()).param("version", s.version()).param("at", ts(s.updatedAt()))
                .param("by", s.updatedBy()).param("id", s.id()).param("expected", expectedVersion).update();
        if (n != 1) throw new VersionConflictException("settlement", expectedVersion, s.version() - 1);
        Settlement.Reversal r = s.reversal();
        jdbc.sql("""
                insert into settlement_reversal (id, settlement_id, reason, effective_date, cash_movement_id, created_at, created_by)
                values (:id, :s, :reason, :date, :movement, :at, :by)
                """)
                .param("id", r.id()).param("s", s.id()).param("reason", r.reason()).param("date", Date.valueOf(r.effectiveDate()))
                .param("movement", r.cashMovementId()).param("at", ts(r.at())).param("by", r.by()).update();
    }

    @Override
    public Optional<Settlement> findForUpdate(UUID id) {
        // Bloqueia só a liquidação; o estorno vem numa consulta à parte (FOR UPDATE não combina com o left join).
        Optional<UUID> locked = jdbc.sql("select id from settlement where id = :id for update").param("id", id).query(UUID.class).optional();
        return locked.flatMap(x -> find(x)).map(Summary::settlement);
    }

    @Override
    public Optional<Summary> find(UUID id) {
        return jdbc.sql(SELECT + " where s.id = :id").param("id", id).query(JdbcSettlementRepository::row).optional()
                .map(r -> r.withTitles(titles(List.of(r.settlement().id())))).map(Row::summary);
    }

    @Override
    public List<Summary> list(UUID titleId, UUID accountId, int limit) {
        List<Row> rows = jdbc.sql(SELECT + """
                 where (cast(:title as uuid) is null
                        or exists (select 1 from settlement_allocation x where x.settlement_id = s.id and x.title_id = cast(:title as uuid)))
                   and (cast(:account as uuid) is null or s.account_id = cast(:account as uuid))
                 order by s.effective_date desc, s.created_at desc limit :limit
                """)
                .param("title", titleId).param("account", accountId).param("limit", limit)
                .query(JdbcSettlementRepository::row).list();
        Map<UUID, List<TitleRef>> titles = titles(rows.stream().map(r -> r.settlement().id()).toList());
        return rows.stream().map(r -> r.withTitles(titles).summary()).toList();
    }

    /** Alocações de cada liquidação, com o código e a descrição do título. */
    private Map<UUID, List<TitleRef>> titles(List<UUID> settlementIds) {
        Map<UUID, List<TitleRef>> out = new LinkedHashMap<>();
        if (settlementIds.isEmpty()) return out;
        jdbc.sql("""
                select x.settlement_id, x.title_id, x.amount_cents, t.code, t.origin_label
                  from settlement_allocation x join financial_title t on t.id = x.title_id
                 where x.settlement_id in (:ids) order by t.due_date, t.code
                """)
                .param("ids", settlementIds)
                .query(rs -> {
                    out.computeIfAbsent(rs.getObject("settlement_id", UUID.class), k -> new ArrayList<>())
                            .add(new TitleRef(rs.getObject("title_id", UUID.class), rs.getString("code"), rs.getString("origin_label"),
                                    rs.getLong("amount_cents")));
                });
        return out;
    }

    private record Row(Settlement settlement, String accountCode, String accountName, String partnerCode, String partnerName,
                       List<TitleRef> titles) {
        Row withTitles(Map<UUID, List<TitleRef>> all) {
            List<TitleRef> refs = all.getOrDefault(settlement.id(), List.of());
            Settlement s = settlement;
            Settlement full = new Settlement(s.id(), s.code(), s.direction(), s.accountId(), s.counterpartyId(), s.effectiveDate(),
                    s.total(), refs.stream().map(t -> new Settlement.Allocation(t.titleId(), Money.ofCents(t.amountCents(), Currency.BRL)))
                    .toList(), s.notes(), s.status(), s.reversal(), s.version(), s.createdAt(), s.createdBy(), s.updatedAt(), s.updatedBy());
            return new Row(full, accountCode, accountName, partnerCode, partnerName, refs);
        }

        Summary summary() {
            return new Summary(settlement, accountCode, accountName, partnerCode, partnerName, titles);
        }
    }

    private static Row row(ResultSet rs, int n) throws SQLException {
        UUID reversalId = rs.getObject("reversal_id", UUID.class);
        Settlement.Reversal reversal = reversalId == null ? null : new Settlement.Reversal(reversalId, rs.getString("reversal_reason"),
                rs.getDate("reversal_date").toLocalDate(), rs.getObject("reversal_movement", UUID.class), instant(rs, "reversal_at"),
                rs.getString("reversal_by"));
        Settlement s = new Settlement(rs.getObject("id", UUID.class), rs.getString("code"),
                FinancialTitle.Direction.valueOf(rs.getString("direction")), rs.getObject("account_id", UUID.class),
                rs.getObject("counterparty_id", UUID.class), rs.getDate("effective_date").toLocalDate(),
                Money.ofCents(rs.getLong("total_cents"), Currency.BRL), List.of(), rs.getString("notes"),
                Settlement.Status.valueOf(rs.getString("status")), reversal, rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
        return new Row(s, rs.getString("account_code"), rs.getString("account_name"), rs.getString("partner_code"),
                rs.getString("partner_name"), List.of());
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
