package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.BankAccountRepository;
import br.com.fourtech.rendamais.financeiro.domain.BankAccount;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.com.fourtech.rendamais.financeiro.infrastructure.JdbcFinancialTitleRepository.instant;
import static br.com.fourtech.rendamais.financeiro.infrastructure.JdbcFinancialTitleRepository.ts;

@Repository
class JdbcBankAccountRepository implements BankAccountRepository {

    private static final String WITH_BALANCE = """
            select b.*, b.opening_cents + coalesce((select sum(m.amount_cents) from cash_movement m where m.account_id = b.id), 0)
                   as balance_cents
              from bank_account b
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
                insert into bank_account (id, code, name, bank, opening_cents, opening_on, status, version, created_at, created_by)
                values (:id, :code, :name, :bank, :opening, :on, :status, :version, :at, :by)
                """)
                .param("id", a.id()).param("code", a.code()).param("name", a.name()).param("bank", a.bank())
                .param("opening", a.opening().cents()).param("on", Date.valueOf(a.openingOn()))
                .param("status", a.active() ? "ATIVO" : "INATIVO").param("version", a.version())
                .param("at", ts(a.createdAt())).param("by", a.createdBy())
                .update();
    }

    @Override
    public boolean nameExists(String name) {
        return jdbc.sql("select exists(select 1 from bank_account where lower(name) = lower(:n))").param("n", name)
                .query(Boolean.class).single();
    }

    @Override
    public Optional<BankAccount> findById(UUID id) {
        return findWithBalance(id).map(WithBalance::account);
    }

    @Override
    public Optional<WithBalance> findWithBalance(UUID id) {
        return jdbc.sql(WITH_BALANCE + " where b.id = :id").param("id", id).query(JdbcBankAccountRepository::row).optional();
    }

    @Override
    public List<WithBalance> list(boolean includeInactive) {
        return jdbc.sql(WITH_BALANCE + " where (:all or b.status = 'ATIVO') order by b.code").param("all", includeInactive)
                .query(JdbcBankAccountRepository::row).list();
    }

    private static WithBalance row(ResultSet rs, int n) throws SQLException {
        BankAccount a = new BankAccount(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getString("bank"), Money.ofCents(rs.getLong("opening_cents"), Currency.BRL), rs.getDate("opening_on").toLocalDate(),
                "ATIVO".equals(rs.getString("status")), rs.getLong("version"), instant(rs, "created_at"), rs.getString("created_by"));
        return new WithBalance(a, rs.getLong("balance_cents"));
    }
}
