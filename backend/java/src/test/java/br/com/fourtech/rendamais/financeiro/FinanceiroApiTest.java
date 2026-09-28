package br.com.fourtech.rendamais.financeiro;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/** Sprint 5 contra PostgreSQL real: recebimento parcial e total, estorno, contas financeiras e concorrência na baixa. */
class FinanceiroApiTest extends CadastrosApiTest {

    private static final String HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();

    private String cliente;
    private String matriz;
    private String caixa;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", "s5-cli-00001", """
                {"legalName":"Fecularia Vale do Paranapanema Ltda.","units":[{"name":"Matriz","city":"Cândido Mota","state":"SP"}]}
                """);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        cliente = campo(c.body(), "id");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
    }

    /** Pedido confirmado com as parcelas informadas (valores em centavos); devolve o id do pedido. */
    private String pedidoConfirmado(String chave, long... parcelas) throws Exception {
        long total = 0;
        StringBuilder p = new StringBuilder("[");
        for (int i = 0; i < parcelas.length; i++) {
            total += parcelas[i];
            if (i > 0) p.append(',');
            p.append("{\"dueDate\":\"2026-12-%02d\",\"amountCents\":\"%d\"}".formatted(10 + i, parcelas[i]));
        }
        p.append(']');
        String preco = total / 100 + "." + String.format("%02d", total % 100);
        HttpResponse<String> r = post("/api/v1/sales-orders", chave, """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-01-10","lines":
                 [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"%s"}],"installments":%s}
                """.formatted(cliente, matriz, preco, p));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        return id;
    }

    /** Títulos do pedido, na ordem das parcelas. */
    private List<String> titulos(String pedido) {
        return jdbc.sql("select id::text from financial_title where origin_id like :o order by origin_id")
                .param("o", pedido + ":%").query(String.class).list();
    }

    private HttpResponse<String> recebe(String chave, String conta, String data, long total, String... alocacoes) throws Exception {
        return post("/api/v1/settlements", chave, """
                {"direction":"RECEIVABLE","accountId":"%s","effectiveDate":"%s","amountCents":"%d","currency":"BRL",
                 "allocations":[%s],"creditCents":"0","notes":"Recebimento conferido no extrato"}
                """.formatted(conta, data, total, String.join(",", alocacoes)));
    }

    private static String aloca(String titulo, long centavos) {
        return "{\"titleId\":\"%s\",\"amountCents\":\"%d\"}".formatted(titulo, centavos);
    }

    private static String aloca(String titulo, long centavos, String versao) {
        return "{\"titleId\":\"%s\",\"amountCents\":\"%d\",\"expectedTitleVersion\":\"%s\"}".formatted(titulo, centavos, versao);
    }

    private HttpResponse<String> estorna(String id, String motivo) throws Exception {
        return post("/api/v1/settlements/" + id + "/reversals", null, motivo == null ? "{}" : "{\"reason\":\"" + motivo + "\"}");
    }

    private String titulo(String id) throws Exception {
        return get("/api/v1/receivables/" + id).body();
    }

    /**
     * Conferência (dívida da Sprint 5): o recebido gravado em cada título é a soma das alocações de recebimentos não
     * estornados, e cada conta tem um movimento por recebimento e um por estorno.
     */
    private void recebidoConfereComAlocacoes() {
        assertThat(conta("""
                select count(*) from financial_title t
                 where t.received_cents <> coalesce((select sum(a.amount_cents) from settlement_allocation a
                          join settlement s on s.id = a.settlement_id
                         where a.title_id = t.id and s.status = 'POSTED'), 0)
                """)).isZero();
        assertThat(conta("""
                select count(*) from settlement s
                 where (select coalesce(sum(m.amount_cents), 0) from cash_movement m where m.settlement_id = s.id)
                       <> case s.status when 'POSTED' then s.total_cents else 0 end
                """)).isZero();
    }

    @Test
    void recebimentoParcialTotalEEstornoDevolvemSaldoETrilha() throws Exception {
        HttpResponse<String> banco = post("/api/v1/bank-accounts", null, """
                {"name":"Banco do Brasil — movimento","kind":"BANCO","bank":"Banco do Brasil","agency":"1234-5","accountNumber":"98765-0",
                 "openingCents":"100000","openingOn":"2026-01-01"}
                """);
        assertThat(banco.statusCode()).as(banco.body()).isEqualTo(201);
        assertThat(campo(banco.body(), "code")).matches("CT\\d{3}");
        String conta = campo(banco.body(), "id");

        String pedido = pedidoConfirmado("s5-ped-0001", 5_550_000, 10_000_000);
        List<String> t = titulos(pedido);
        String t1 = t.get(0);
        String t2 = t.get(1);
        assertThat(titulo(t1)).contains("\"status\":\"OPEN\"", "\"balanceCents\":\"5550000\"", "\"version\":\"1\"");

        // Baixa parcial de R$ 20.000,00 com a versão lida do título.
        HttpResponse<String> parcial = recebe("s5-rec-0001", conta, HOJE, 2_000_000, aloca(t1, 2_000_000, "1"));
        assertThat(parcial.statusCode()).as(parcial.body()).isEqualTo(201);
        String r1 = campo(parcial.body(), "id");
        assertThat(campo(parcial.body(), "code")).matches("RC\\d{5}");
        assertThat(parcial.body()).contains("\"status\":\"POSTED\"", "\"accountCode\":\"" + campo(banco.body(), "code") + "\"",
                "\"amountCents\":\"2000000\"");
        assertThat(titulo(t1)).contains("\"status\":\"PARTIAL\"", "\"receivedCents\":\"2000000\"", "\"balanceCents\":\"3550000\"",
                "\"version\":\"2\"");
        // Mesma chave: o mesmo recebimento, sem outro efeito; mesma chave com outro corpo: recusa.
        assertThat(campo(recebe("s5-rec-0001", conta, HOJE, 2_000_000, aloca(t1, 2_000_000, "1")).body(), "id")).isEqualTo(r1);
        assertThat(recebe("s5-rec-0001", conta, HOJE, 1_000, aloca(t1, 1_000)).body()).contains("IDEMPOTENCY_KEY_REUSED");
        assertThat(conta("select count(*) from settlement")).isEqualTo(1);
        // Versão antiga do título: 412, nada baixado.
        assertThat(recebe("s5-rec-0002", conta, HOJE, 1_000, aloca(t1, 1_000, "1")).statusCode()).isEqualTo(412);

        // Um recebimento para as duas parcelas: o resto da 1 e R$ 10.000,00 da 2.
        HttpResponse<String> duas = recebe("s5-rec-0003", conta, HOJE, 4_550_000, aloca(t1, 3_550_000), aloca(t2, 1_000_000));
        assertThat(duas.statusCode()).as(duas.body()).isEqualTo(201);
        String r2 = campo(duas.body(), "id");
        assertThat(titulo(t1)).contains("\"status\":\"SETTLED\"", "\"balanceCents\":\"0\"");
        assertThat(titulo(t2)).contains("\"status\":\"PARTIAL\"", "\"balanceCents\":\"9000000\"");
        assertThat(get("/api/v1/receivables?status=LIQUIDADOS").body()).contains(t1).doesNotContain(t2);
        assertThat(get("/api/v1/receivables?status=ABERTOS").body()).contains(t2).doesNotContain(t1);
        assertThat(get("/api/v1/settlements?titleId=" + t1).body()).contains(r1, r2);
        assertThat(get("/api/v1/bank-accounts/" + conta).body()).contains("\"balanceCents\":\"6650000\"", "\"movements\":2");

        // Recusas sem efeito: acima do saldo, soma diferente do total, data futura, título repetido, crédito.
        HttpResponse<String> acima = recebe("s5-rec-0004", conta, HOJE, 9_000_001, aloca(t2, 9_000_001));
        assertThat(acima.statusCode()).isEqualTo(422);
        assertThat(acima.body()).contains("INSUFFICIENT_TITLE_BALANCE", "Saldo atual: R$ 90.000,00");
        HttpResponse<String> diferente = recebe("s5-rec-0005", conta, HOJE, 1_000, aloca(t2, 999));
        assertThat(diferente.statusCode()).isEqualTo(422);
        assertThat(diferente.body()).contains("SETTLEMENT_UNBALANCED", "diferença de R$ 0,01");
        String amanha = LocalDate.parse(HOJE).plusDays(1).toString();
        assertThat(recebe("s5-rec-0006", conta, amanha, 1_000, aloca(t2, 1_000)).body()).contains("\"field\":\"effectiveDate\"", "futura");
        assertThat(recebe("s5-rec-0007", conta, HOJE, 2_000, aloca(t2, 1_000), aloca(t2, 1_000)).body())
                .contains("SETTLEMENT_DIRECTION_MISMATCH", "Título repetido");
        assertThat(post("/api/v1/settlements", "s5-rec-0008", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"2000","allocations":[%s],"creditCents":"1000"}
                """.formatted(conta, HOJE, aloca(t2, 1_000))).body()).contains("\"field\":\"creditCents\"", "PD-004");
        assertThat(conta("select count(*) from settlement")).isEqualTo(2);
        assertThat(titulo(t2)).contains("\"balanceCents\":\"9000000\"");

        // Estorno total: motivo obrigatório; devolve o saldo aos mesmos títulos e o caixa ao anterior.
        assertThat(estorna(r2, null).body()).contains("\"field\":\"reason\"");
        HttpResponse<String> est = estorna(r2, "Cheque devolvido");
        assertThat(est.statusCode()).as(est.body()).isEqualTo(200);
        assertThat(est.body()).contains("\"status\":\"REVERSED\"", "\"reversalReason\":\"Cheque devolvido\"", "\"reversalDate\":\"" + HOJE + "\"");
        assertThat(titulo(t1)).contains("\"status\":\"PARTIAL\"", "\"balanceCents\":\"3550000\"");
        assertThat(titulo(t2)).contains("\"status\":\"OPEN\"", "\"balanceCents\":\"10000000\"");
        assertThat(estorna(r1, "Lançado na conta errada").statusCode()).isEqualTo(200);
        assertThat(titulo(t1)).contains("\"status\":\"OPEN\"", "\"receivedCents\":\"0\"", "\"balanceCents\":\"5550000\"");
        // Estornar de novo devolve o estorno existente, sem outro movimento (INV-ST-6).
        assertThat(estorna(r1, "de novo").body()).contains("Lançado na conta errada");
        assertThat(conta("select count(*) from settlement_reversal")).isEqualTo(2);
        String extrato = get("/api/v1/bank-accounts/" + conta + "/movements").body();
        assertThat(extrato).contains("\"amountCents\":\"-4550000\"", "\"kind\":\"SETTLEMENT_REVERSAL\"");
        assertThat(extrato.substring(extrato.lastIndexOf("balanceCents"))).contains("\"100000\"");
        assertThat(get("/api/v1/bank-accounts/" + conta).body()).contains("\"balanceCents\":\"100000\"", "\"movements\":4");
        // A liquidação continua consultável; a trilha mostra quem, quando e por quê.
        assertThat(get("/api/v1/settlements/" + r1).body()).contains("\"status\":\"REVERSED\"", "\"reversedBy\":\"" + ADMIN + "\"");
        assertThat(get("/api/v1/settlements/" + r1 + "/history").body()).contains("SETTLEMENT_POSTED", "SETTLEMENT_REVERSED",
                "Lançado na conta errada");
        assertThat(get("/api/v1/receivables/" + t1 + "/history").body()).contains("FINANCIAL_TITLE_SETTLED",
                "FINANCIAL_TITLE_SETTLEMENT_REVERSED", "FINANCIAL_TITLE_CREATED", "\"before\":\"OPEN\",\"after\":\"PARTIAL\"");
        assertThat(conta("select count(*) from outbox_event where event_type = 'SettlementPosted'")).isEqualTo(2);
        assertThat(conta("select count(*) from outbox_event where event_type = 'SettlementReversed'")).isEqualTo(2);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'SettlementPosted' and aggregate_id = :id")
                .param("id", r2).query(String.class).single()).contains("allocations", t1, t2, "\"totalCents\": \"4550000\"");
        recebidoConfereComAlocacoes();
    }

    @Test
    void baixasConcorrentesNuncaDeixamSaldoNegativo() throws Exception {
        String t = titulos(pedidoConfirmado("s5-conc-0001", 10_000)).get(0);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> results = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String key = "s5-conc-chave-" + i;
            results.add(pool.submit(() -> {
                start.await();
                return recebe(key, caixa, HOJE, 7_000, aloca(t, 7_000));
            }));
        }
        start.countDown();
        List<HttpResponse<String>> respostas = new ArrayList<>();
        for (Future<HttpResponse<String>> f : results) respostas.add(f.get());
        pool.shutdown();
        assertThat(respostas).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(201, 422);
        assertThat(respostas.stream().filter(r -> r.statusCode() == 422).findFirst().orElseThrow().body())
                .contains("INSUFFICIENT_TITLE_BALANCE", "Saldo atual: R$ 30,00");
        assertThat(titulo(t)).contains("\"receivedCents\":\"7000\"", "\"balanceCents\":\"3000\"");
        assertThat(conta("select count(*) from settlement")).isEqualTo(1);
        assertThat(conta("select count(*) from cash_movement")).isEqualTo(1);
        recebidoConfereComAlocacoes();
    }

    @Test
    void pedidoComRecebimentoSoCancelaDepoisDoEstorno() throws Exception {
        String pedido = pedidoConfirmado("s5-canc-0001", 50_000, 50_000);
        String t1 = titulos(pedido).get(0);
        String r = campo(recebe("s5-canc-rec-01", caixa, HOJE, 10_000, aloca(t1, 10_000)).body(), "id");
        HttpResponse<String> bloqueado = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(bloqueado.statusCode()).isEqualTo(422);
        assertThat(bloqueado.body()).contains("CANCELLATION_BLOCKED_BY_EFFECTS", "estorne o recebimento");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'CANCELLED'")).isZero();

        assertThat(estorna(r, "Devolvido ao cliente").statusCode()).isEqualTo(200);
        HttpResponse<String> ok = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        // Título cancelado não recebe baixa.
        HttpResponse<String> cancelado = recebe("s5-canc-rec-02", caixa, HOJE, 1_000, aloca(t1, 1_000));
        assertThat(cancelado.statusCode()).isEqualTo(409);
        assertThat(cancelado.body()).contains("cancelado");
        assertThat(get("/api/v1/receivables?status=CANCELADOS").body()).contains(t1);
    }

    @Test
    void contasFinanceirasTemNomeUnicoSaldoInicialFixoEInativaNaoRecebe() throws Exception {
        assertThat(get("/api/v1/bank-accounts").body()).contains("\"name\":\"Caixa\"", "\"kind\":\"CAIXA\"", "\"code\":\"CT001\"");
        HttpResponse<String> semBanco = post("/api/v1/bank-accounts", null, "{\"name\":\"Conta nova\",\"kind\":\"BANCO\"}");
        assertThat(semBanco.statusCode()).isEqualTo(422);
        assertThat(semBanco.body()).contains("ACCOUNT_INVALID", "\"field\":\"bank\"");
        assertThat(post("/api/v1/bank-accounts", null, "{\"name\":\"caixa\",\"kind\":\"CAIXA\"}").body()).contains("ACCOUNT_DUPLICATE");

        String conta = campo(post("/api/v1/bank-accounts", null, """
                {"name":"Sicredi","kind":"BANCO","bank":"Sicredi","openingCents":"50000","openingOn":"2026-01-01"}
                """).body(), "id");
        String t = titulos(pedidoConfirmado("s5-conta-0001", 20_000)).get(0);
        assertThat(recebe("s5-conta-rec-01", conta, HOJE, 5_000, aloca(t, 5_000)).statusCode()).isEqualTo(201);
        HttpResponse<String> saldo = withVersion("PUT", "/api/v1/bank-accounts/" + conta, "1", """
                {"name":"Sicredi","kind":"BANCO","bank":"Sicredi","openingCents":"0","openingOn":"2026-01-01"}
                """);
        assertThat(saldo.statusCode()).isEqualTo(422);
        assertThat(saldo.body()).contains("\"field\":\"openingCents\"", "já tem movimentos");
        HttpResponse<String> inativa = withVersion("PUT", "/api/v1/bank-accounts/" + conta, "1", """
                {"name":"Sicredi — encerrada","kind":"BANCO","bank":"Sicredi","openingCents":"50000","openingOn":"2026-01-01","status":"INATIVO"}
                """);
        assertThat(inativa.statusCode()).as(inativa.body()).isEqualTo(200);
        assertThat(inativa.body()).contains("\"status\":\"INATIVO\"", "\"version\":\"2\"", "\"balanceCents\":\"55000\"");
        assertThat(withVersion("PUT", "/api/v1/bank-accounts/" + conta, "1", "{\"name\":\"X\",\"kind\":\"CAIXA\"}").statusCode())
                .isEqualTo(412);
        assertThat(recebe("s5-conta-rec-02", conta, HOJE, 5_000, aloca(t, 5_000)).body()).contains("ACCOUNT_INACTIVE");
        assertThat(get("/api/v1/bank-accounts").body()).doesNotContain(conta);
        assertThat(get("/api/v1/bank-accounts?includeInactive=true").body()).contains(conta);
        assertThat(get("/api/v1/bank-accounts/" + conta + "/history").body()).contains("BANK_ACCOUNT_CREATED", "BANK_ACCOUNT_UPDATED",
                "\"after\":\"INATIVO\"");
    }

    @Test
    void perfilConsultaVeRecebimentosMasNaoBaixaNemEstorna() throws Exception {
        String t = titulos(pedidoConfirmado("s5-cons-0001", 20_000)).get(0);
        String r = campo(recebe("s5-cons-rec-01", caixa, HOJE, 5_000, aloca(t, 5_000)).body(), "id");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/settlements?titleId=" + t, consulta, null, Map.of()).body()).contains(r);
        assertThat(call("GET", "/api/v1/bank-accounts", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        HttpResponse<String> baixa = call("POST", "/api/v1/settlements", consulta, """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"1000","allocations":[%s]}
                """.formatted(caixa, HOJE, aloca(t, 1_000)), Map.of("Idempotency-Key", "s5-cons-rec-02"));
        assertThat(baixa.statusCode()).isEqualTo(403);
        assertThat(baixa.body()).contains("financial_title.settle");
        assertThat(call("POST", "/api/v1/settlements/" + r + "/reversals", consulta, "{\"reason\":\"x\"}", Map.of()).body())
                .contains("settlement.reverse");
        assertThat(call("POST", "/api/v1/bank-accounts", consulta, "{\"name\":\"X\",\"kind\":\"CAIXA\"}", Map.of()).body())
                .contains("bank_account.admin");
        assertThat(conta("select count(*) from settlement")).isEqualTo(1);
    }
}
