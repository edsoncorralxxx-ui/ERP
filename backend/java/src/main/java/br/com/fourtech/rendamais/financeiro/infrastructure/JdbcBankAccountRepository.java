package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.BankAccountRepository;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
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
class JdbcBankAccountRepository implements BankAccountRepository {

    private static final String SUMMARY = """
            select a.*, a.opening_cents + coalesce(m.total, 0) as balance_cents, coalesce(m.n, 0) as movements
              from bank_account a
              left join (select account_id, sum(amount_cents) as total, count(*) as n from cash_movement group by account_id) m
                     on m.account_id = a.id
            """;

    private final JdbcClient jdbc;

    JdbcBankAccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String nextCode() {
        return String.format("CT%03d", jdbc.sql("select nextval('bank_account_code_seq')").query(Long.class).single());
    }

    @Override
    public void insert(BankAccount a) {
        jdbc.sql("""
                insert into bank_account (id, code, name, kind, bank, agency, account_number, opening_cents, opening_on, status,
                       version, created_at, created_by, updated_at, updated_by)
                values (:id, :code, :name, :kind, :bank, :agency, :number, :opening, :openingOn, :status, :version, :createdAt,
                        :createdBy, :updatedAt, :updatedBy)
                """)
                .param("id", a.id()).param("code", a.code()).param("name", a.name()).param("kind", a.kind().name())
                .param("bank", a.bank()).param("agency", a.agency()).param("number", a.accountNumber())
                .param("opening", a.openingCents()).param("openingOn", Date.valueOf(a.openingOn())).param("status", a.status().name())
                .param("version", a.version()).param("createdAt", ts(a.createdAt())).param("createdBy", a.createdBy())
                .param("updatedAt", ts(a.updatedAt())).param("updatedBy", a.updatedBy())
                .update();
    }

    @Override
    public void update(BankAccount a, long expectedVersion) {
        int n = jdbc.sql("""
                update bank_account set name = :name, kind = :kind, bank = :bank, agency = :agency, account_number = :number,
                       opening_cents = :opening, opening_on = :openingOn, status = :status, version = :version,
                       updated_at = :updatedAt, updated_by = :updatedBy
                 where id = :id and version = :expected
                """)
                .param("name", a.name()).param("kind", a.kind().name()).param("bank", a.bank()).param("agency", a.agency())
                .param("number", a.accountNumber()).param("opening", a.openingCents()).param("openingOn", Date.valueOf(a.openingOn()))
                .param("status", a.status().name()).param("version", a.version()).param("updatedAt", ts(a.updatedAt()))
                .param("updatedBy", a.updatedBy()).param("id", a.id()).param("expected", expectedVersion)
                .update();
        if (n != 1) throw new VersionConflictException("bank_account", expectedVersion, a.version() - 1);
    }

    @Override
    public Optional<Summary> find(UUID id) {
        return jdbc.sql(SUMMARY + " where a.id = :id").param("id", id).query(JdbcBankAccountRepository::summary).optional();
    }

    @Override
    public Optional<BankAccount> findForShare(UUID id) {
        return jdbc.sql("select * from bank_account where id = :id for share").param("id", id)
                .query(JdbcBankAccountRepository::account).optional();
    }

    @Override
    public Optional<UUID> settlementMovement(UUID settlementId) {
        return jdbc.sql("select id from cash_movement where settlement_id = :s and kind = 'SETTLEMENT'").param("s", settlementId)
                .query(UUID.class).optional();
    }

    @Override
    public Optional<BankAccount> findByName(String name) {
        return jdbc.sql("select * from bank_account where lower(name) = lower(:name)").param("name", name)
                .query(JdbcBankAccountRepository::account).optional();
    }

    @Override
    public List<Summary> list(boolean includeInactive) {
        return jdbc.sql(SUMMARY + " where (:all or a.status = 'ATIVO') order by a.code").param("all", includeInactive)
                .query(JdbcBankAccountRepository::summary).list();
    }

    @Override
    public List<Movement> movements(UUID accountId, LocalDate from, LocalDate to) {
        // Saldo acumulado sobre todos os movimentos da conta; o período só recorta a exibição.
        return jdbc.sql("""
                select * from (
                    select m.*, coalesce(s.code, t.code) as source_code,
                           a.opening_cents + sum(m.amount_cents) over (order by m.effective_date, m.created_at, m.id) as running_cents
                      from cash_movement m
                      join bank_account a on a.id = m.account_id
                      left join settlement s on s.id = m.settlement_id
                      left join transfer t on t.id = m.transfer_id
                     where m.account_id = :account) x
                 where (cast(:from as date) is null or x.effective_date >= cast(:from as date))
                   and (cast(:to as date) is null or x.effective_date <= cast(:to as date))
                 order by x.effective_date, x.created_at, x.id
                """)
                .param("account", accountId).param("from", from == null ? null : Date.valueOf(from))
                .param("to", to == null ? null : Date.valueOf(to))
                .query((rs, n) -> new Movement(rs.getObject("id", UUID.class), rs.getDate("effective_date").toLocalDate(),
                        rs.getLong("amount_cents"), rs.getString("kind"), rs.getObject("settlement_id", UUID.class),
                        rs.getObject("transfer_id", UUID.class), rs.getString("source_code"), rs.getString("description"),
                        rs.getLong("running_cents"),
                        instant(rs, "created_at"), rs.getString("created_by")))
                .list();
    }

    @Override
    public void insertMovement(UUID id, UUID accountId, LocalDate effectiveDate, long amountCents, String kind, UUID settlementId,
                               UUID reversesId, String description, Instant now, String actor) {
        jdbc.sql("""
                insert into cash_movement (id, account_id, effective_date, amount_cents, kind, settlement_id, reverses_id, description,
                       created_at, created_by)
                values (:id, :account, :date, :cents, :kind, :settlement, :reverses, :description, :at, :by)
                """)
                .param("id", id).param("account", accountId).param("date", Date.valueOf(effectiveDate)).param("cents", amountCents)
                .param("kind", kind).param("settlement", settlementId).param("reverses", reversesId).param("description", description)
                .param("at", ts(now)).param("by", actor)
                .update();
    }

    @Override
    public void insertTransferMovement(UUID id, UUID accountId, LocalDate effectiveDate, long amountCents, String kind, UUID transferId,
                                       UUID reversesId, String description, Instant now, String actor) {
        jdbc.sql("""
                insert into cash_movement (id, account_id, effective_date, amount_cents, kind, transfer_id, reverses_id, description,
                       created_at, created_by)
                values (:id, :account, :date, :cents, :kind, :transfer, :reverses, :description, :at, :by)
                """)
                .param("id", id).param("account", accountId).param("date", Date.valueOf(effectiveDate)).param("cents", amountCents)
                .param("kind", kind).param("transfer", transferId).param("reverses", reversesId).param("description", description)
                .param("at", ts(now)).param("by", actor)
                .update();
    }

    @Override
    public List<BankAccount> findForShare(List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select * from bank_account where id in (:ids) order by id for share").param("ids", ids)
                .query(JdbcBankAccountRepository::account).list();
    }

    @Override
    public List<BalanceAt> balancesAt(LocalDate date) {
        return jdbc.sql("""
                select a.*, (case when a.opening_on <= :date then a.opening_cents else 0 end)
                            + coalesce((select sum(m.amount_cents) from cash_movement m
                                         where m.account_id = a.id and m.effective_date <= :date), 0) as balance_at
                  from bank_account a order by a.code
                """)
                .param("date", Date.valueOf(date))
                .query((rs, n) -> new BalanceAt(account(rs, n), rs.getLong("balance_at"))).list();
    }

    private static Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(account(rs, n), rs.getLong("balance_cents"), rs.getLong("movements"));
    }

    private static BankAccount account(ResultSet rs, int n) throws SQLException {
        return new BankAccount(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                BankAccount.Kind.valueOf(rs.getString("kind")), rs.getString("bank"), rs.getString("agency"),
                rs.getString("account_number"), rs.getLong("opening_cents"), rs.getDate("opening_on").toLocalDate(),
                BankAccount.Status.valueOf(rs.getString("status")), rs.getLong("version"), instant(rs, "created_at"),
                rs.getString("created_by"), instant(rs, "updated_at"), rs.getString("updated_by"));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
