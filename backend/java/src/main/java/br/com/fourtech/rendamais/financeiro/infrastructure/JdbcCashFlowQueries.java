package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.CashFlowQueries;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
class JdbcCashFlowQueries implements CashFlowQueries {

    private final JdbcClient jdbc;

    JdbcCashFlowQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long realizedBalance(LocalDate date, UUID accountId) {
        return jdbc.sql("""
                select coalesce((select sum(opening_cents) from bank_account
                                  where opening_on <= :date and (cast(:account as uuid) is null or id = cast(:account as uuid))), 0)
                     + coalesce((select sum(amount_cents) from cash_movement
                                  where effective_date <= :date and (cast(:account as uuid) is null or account_id = cast(:account as uuid))), 0)
                """)
                .param("date", Date.valueOf(date)).param("account", accountId).query(Long.class).single();
    }

    @Override
    public List<Line> realizedLines(LocalDate from, LocalDate to, UUID accountId, String category, boolean incoming) {
        List<Line> out = new ArrayList<>();
        if (category != null) {
            // Com categoria: cada alocação da liquidação no título da categoria, com o sinal do movimento.
            out.addAll(jdbc.sql("""
                    select m.effective_date, a.amount_cents, tt.id as title_id, tt.code as title_code, tt.direction, s.code as source_code,
                           tt.origin_label, p.legal_name
                      from cash_movement m
                      join settlement s on s.id = m.settlement_id
                      join settlement_allocation a on a.settlement_id = s.id
                      join financial_title tt on tt.id = a.title_id
                      join partner p on p.id = tt.counterparty_id
                     where m.effective_date between :from and :to and tt.category = :category
                       and (cast(:account as uuid) is null or m.account_id = cast(:account as uuid))
                       and ((:incoming and m.amount_cents > 0) or (not :incoming and m.amount_cents < 0))
                     order by m.effective_date, m.created_at, tt.code
                    """)
                    .param("from", Date.valueOf(from)).param("to", Date.valueOf(to)).param("category", category)
                    .param("account", accountId).param("incoming", incoming)
                    .query((rs, n) -> new Line(kind(rs.getString("direction")), rs.getObject("title_id", UUID.class),
                            rs.getString("source_code") + " / " + rs.getString("title_code"), rs.getDate("effective_date").toLocalDate(),
                            rs.getString("origin_label"), rs.getString("legal_name"), rs.getLong("amount_cents")))
                    .list());
            return out;
        }
        // Sem categoria: os movimentos; no consolidado as transferências ficam de fora (se anulam).
        out.addAll(jdbc.sql("""
                select m.effective_date, abs(m.amount_cents) as cents, m.description, m.account_id, a.code as account_code, a.name as account_name,
                       coalesce(s.code, t.code) as source_code, s.direction, p.legal_name,
                       (select tt.id from settlement_allocation al join financial_title tt on tt.id = al.title_id
                         where al.settlement_id = m.settlement_id order by tt.code limit 1) as title_id
                  from cash_movement m
                  join bank_account a on a.id = m.account_id
                  left join settlement s on s.id = m.settlement_id
                  left join partner p on p.id = s.counterparty_id
                  left join transfer t on t.id = m.transfer_id
                 where m.effective_date between :from and :to
                   and (cast(:account as uuid) is null or m.account_id = cast(:account as uuid))
                   and (cast(:account as uuid) is not null or m.transfer_id is null)
                   and ((:incoming and m.amount_cents > 0) or (not :incoming and m.amount_cents < 0))
                 order by m.effective_date, m.created_at, m.id
                """)
                .param("from", Date.valueOf(from)).param("to", Date.valueOf(to)).param("account", accountId).param("incoming", incoming)
                .query((rs, n) -> {
                    UUID title = rs.getObject("title_id", UUID.class);
                    return title != null
                            ? new Line(kind(rs.getString("direction")), title, rs.getString("source_code"), rs.getDate("effective_date").toLocalDate(),
                                    rs.getString("description"), rs.getString("legal_name"), rs.getLong("cents"))
                            : new Line("bank-account", rs.getObject("account_id", UUID.class), rs.getString("source_code"),
                                    rs.getDate("effective_date").toLocalDate(), rs.getString("description"),
                                    rs.getString("account_code") + " — " + rs.getString("account_name"), rs.getLong("cents"));
                })
                .list());
        // Saldo inicial de conta que começa no período entra como realizado, para os saldos continuarem encadeados.
        out.addAll(jdbc.sql("""
                select id, code, name, opening_on, abs(opening_cents) as cents from bank_account
                 where opening_on between :from and :to and opening_cents <> 0
                   and ((:incoming and opening_cents > 0) or (not :incoming and opening_cents < 0))
                   and (cast(:account as uuid) is null or id = cast(:account as uuid))
                 order by opening_on, code
                """)
                .param("from", Date.valueOf(from)).param("to", Date.valueOf(to)).param("account", accountId).param("incoming", incoming)
                .query((rs, n) -> new Line("bank-account", rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getDate("opening_on").toLocalDate(), "Saldo inicial da conta", rs.getString("code") + " — " + rs.getString("name"),
                        rs.getLong("cents")))
                .list());
        return out;
    }

    @Override
    public List<Line> titleLines(LocalDate from, LocalDate to, String category, boolean incoming) {
        return jdbc.sql("""
                select t.id, t.code, t.due_date, t.origin_label, t.direction, p.legal_name, t.original_cents - t.received_cents as balance
                  from financial_title t join partner p on p.id = t.counterparty_id
                 where t.lifecycle = 'ACTIVE' and t.received_cents < t.original_cents
                   and t.due_date between :from and :to and t.direction = :direction
                   and (cast(:category as varchar) is null or t.category = cast(:category as varchar))
                 order by t.due_date, t.code
                """)
                .param("from", Date.valueOf(from)).param("to", Date.valueOf(to)).param("direction", incoming ? "RECEIVABLE" : "PAYABLE")
                .param("category", category)
                .query((rs, n) -> new Line(kind(rs.getString("direction")), rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getDate("due_date").toLocalDate(), rs.getString("origin_label"), rs.getString("legal_name"), rs.getLong("balance")))
                .list();
    }

    @Override
    public List<Line> accountBalances(LocalDate date, UUID accountId) {
        return jdbc.sql("""
                select a.id, a.code, a.name,
                       (case when a.opening_on <= :date then a.opening_cents else 0 end)
                       + coalesce((select sum(m.amount_cents) from cash_movement m where m.account_id = a.id and m.effective_date <= :date), 0)
                         as balance
                  from bank_account a
                 where cast(:account as uuid) is null or a.id = cast(:account as uuid)
                 order by a.code
                """)
                .param("date", Date.valueOf(date)).param("account", accountId)
                .query((rs, n) -> new Line("bank-account", rs.getObject("id", UUID.class), rs.getString("code"), date,
                        "Saldo realizado da conta", rs.getString("name"), rs.getLong("balance")))
                .list();
    }

    private static String kind(String direction) {
        return "PAYABLE".equals(direction) ? "payable" : "receivable";
    }
}
