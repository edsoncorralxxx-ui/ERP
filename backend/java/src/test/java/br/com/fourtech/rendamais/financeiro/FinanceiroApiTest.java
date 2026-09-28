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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 5 contra PostgreSQL real: recebimento com baixa parcial, estorno total, caixa, concorrência no mesmo título e
 * o cancelamento do pedido bloqueado por recebimento (PD-003).
 */
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
        matriz = campo(c.body().substring(c.body().indexOf("\"units\"")), "id");
        HttpResponse<String> contas = get("/api/v1/bank-accounts");
        assertThat(contas.body()).contains("\"name\":\"Caixa\"", "\"code\":\"CT001\"");
        caixa = campo(contas.body(), "id");
    }

    /** Pedido confirmado de 1 equipamento com as parcelas dadas; devolve os ids dos títulos por vencimento. */
    private List<String> titulosDeUmPedido(String chave, String cliente, String unidade, long totalCents, long... parcelas) throws Exception {
        StringBuilder ps = new StringBuilder();
        for (int i = 0; i < parcelas.length; i++) {
            if (i > 0) ps.append(',');
            ps.append("{\"dueDate\":\"2027-0%d-10\",\"amountCents\":\"%d\"}".formatted(i + 1, parcelas[i]));
        }
        HttpResponse<String> r = post("/api/v1/sales-orders", chave, """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-10-01",
                 "lines":[{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"%s"}],
                 "installments":[%s]}
                """.formatted(cliente, unidade, java.math.BigDecimal.valueOf(totalCents, 2).toPlainString(), ps));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String pedido = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + pedido + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        return ids(get("/api/v1/receivables?includeCancelled=true&projectId=" + campo(ok.body(), "projectId")).body());
    }

    private String receber(String titulo, String centavos, String versao) {
        return """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"%s","allocations":[{"titleId":"%s","amountCents":"%s"%s}]}
                """.formatted(caixa, HOJE, centavos, titulo, centavos, versao == null ? "" : ",\"expectedTitleVersion\":\"" + versao + "\"");
    }

    private String titulo(String id) throws Exception {
        return get("/api/v1/receivables/" + id).body();
    }

    private long saldoDoCaixa() throws Exception {
        return Long.parseLong(campo(get("/api/v1/bank-accounts/" + caixa).body(), "balanceCents"));
    }

    @Test
    void recebimentoParcialEEstornoRestauramSaldoECaixa() throws Exception {
        // Título de R$ 55.500,00 (exemplo do B01, docs/backend/13 §5) e outro de R$ 44.500,00.
        List<String> titulos = titulosDeUmPedido("s5-ped-0001", cliente, matriz, 10_000_000, 5_550_000, 4_450_000);
        String t1 = titulos.get(0);
        assertThat(saldoDoCaixa()).isZero();

        HttpResponse<String> r1 = post("/api/v1/settlements", "s5-rec-0001", receber(t1, "2000000", "1"));
        assertThat(r1.statusCode()).as(r1.body()).isEqualTo(201);
        String rec1 = campo(r1.body(), "id");
        assertThat(campo(r1.body(), "code")).matches("RC\\d{5}");
        assertThat(r1.body()).contains("\"status\":\"POSTED\"", "\"accountName\":\"Caixa\"", "\"totalCents\":\"2000000\"",
                "\"titleLabel\":\"Pedido ");
        assertThat(titulo(t1)).contains("\"receivedCents\":\"2000000\"", "\"balanceCents\":\"3550000\"", "\"status\":\"PARTIAL\"",
                "\"version\":\"2\"");
        assertThat(saldoDoCaixa()).isEqualTo(2_000_000);

        // Mesma chave (resposta perdida): o mesmo recebimento, nada novo.
        assertThat(campo(post("/api/v1/settlements", "s5-rec-0001", receber(t1, "2000000", "1")).body(), "id")).isEqualTo(rec1);
        assertThat(conta("select count(*) from settlement")).isEqualTo(1);

        // Acima do saldo: recusado inteiro, com o saldo atual; nada gravado.
        HttpResponse<String> acima = post("/api/v1/settlements", "s5-rec-0002", receber(t1, "3550001", null));
        assertThat(acima.statusCode()).isEqualTo(422);
        assertThat(acima.body()).contains("INSUFFICIENT_TITLE_BALANCE", "R$ 35.500,00", "\"field\":\"allocations[0].amountCents\"");
        // Versão lida antes do primeiro recebimento: 412, sem efeito.
        assertThat(post("/api/v1/settlements", "s5-rec-0003", receber(t1, "100", "1")).statusCode()).isEqualTo(412);
        // Soma das alocações diferente do valor recebido.
        HttpResponse<String> desbalanceado = post("/api/v1/settlements", "s5-rec-0004", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"1000","allocations":[{"titleId":"%s","amountCents":"900"}]}
                """.formatted(caixa, HOJE, t1));
        assertThat(desbalanceado.statusCode()).isEqualTo(422);
        assertThat(desbalanceado.body()).contains("SETTLEMENT_UNBALANCED", "R$ 9,00", "R$ 10,00");
        // Data futura, conta inexistente e valor zero: apontados no campo.
        HttpResponse<String> campos = post("/api/v1/settlements", "s5-rec-0005", """
                {"accountId":"x","effectiveDate":"%s","amountCents":"0","allocations":[{"titleId":"%s","amountCents":"0"}]}
                """.formatted(LocalDate.parse(HOJE).plusDays(2), t1));
        assertThat(campos.body()).contains("\"field\":\"accountId\"", "data futura", "\"field\":\"amountCents\"",
                "\"field\":\"allocations[0].amountCents\"");
        assertThat(conta("select count(*) from settlement") + conta("select count(*) from cash_movement")).isEqualTo(2);

        // Quita o restante: saldo zero, situação liquidada.
        String rec2 = campo(post("/api/v1/settlements", "s5-rec-0006", receber(t1, "3550000", "2")).body(), "id");
        assertThat(titulo(t1)).contains("\"receivedCents\":\"5550000\"", "\"balanceCents\":\"0\"", "\"status\":\"SETTLED\"",
                "\"overdue\":false");
        assertThat(saldoDoCaixa()).isEqualTo(5_550_000);

        // Estorno total do primeiro, com motivo obrigatório: o título volta a parcial e o caixa, ao saldo anterior.
        assertThat(call("POST", "/api/v1/settlements/" + rec1 + "/reversals", admin, "{}", Map.of()).body()).contains("\"field\":\"reason\"");
        HttpResponse<String> estorno = call("POST", "/api/v1/settlements/" + rec1 + "/reversals", admin,
                "{\"reason\":\"Cheque devolvido\"}", Map.of());
        assertThat(estorno.statusCode()).as(estorno.body()).isEqualTo(200);
        assertThat(estorno.body()).contains("\"status\":\"REVERSED\"", "\"reversalReason\":\"Cheque devolvido\"", "\"reversedBy\":\"" + ADMIN + "\"");
        assertThat(titulo(t1)).contains("\"receivedCents\":\"3550000\"", "\"balanceCents\":\"2000000\"", "\"status\":\"PARTIAL\"");
        assertThat(saldoDoCaixa()).isEqualTo(3_550_000);
        // Estornar de novo devolve o estorno existente, sem outro movimento.
        assertThat(call("POST", "/api/v1/settlements/" + rec1 + "/reversals", admin, "{\"reason\":\"de novo\"}", Map.of()).body())
                .contains("Cheque devolvido");
        assertThat(conta("select count(*) from cash_movement where reverses_id is not null")).isEqualTo(1);
        assertThat(saldoDoCaixa()).isEqualTo(3_550_000);

        // O estornado continua consultável; sem os estornados, só o segundo.
        assertThat(get("/api/v1/settlements?titleId=" + t1).body()).contains(rec1, rec2);
        assertThat(get("/api/v1/settlements?includeReversed=false&titleId=" + t1).body()).contains(rec2).doesNotContain(rec1);
        assertThat(get("/api/v1/receivables/" + t1 + "/history").body())
                .contains("FINANCIAL_TITLE_CREATED", "FINANCIAL_TITLE_SETTLED", "FINANCIAL_TITLE_SETTLEMENT_REVERSED", "Cheque devolvido");
        assertThat(get("/api/v1/settlements/" + rec1 + "/history").body()).contains("SETTLEMENT_POSTED", "SETTLEMENT_REVERSED");
        assertThat(conta("select count(*) from outbox_event where event_type = 'SettlementPosted'")).isEqualTo(2);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'SettlementReversed'").query(String.class).single())
                .contains("reversalId", rec1, "Cheque devolvido");
    }

    @Test
    void recebimentosSimultaneosNoMesmoTituloNuncaDeixamSaldoNegativo() throws Exception {
        // Cenário obrigatório do B01 (docs/backend/13 §4): saldo de R$ 100,00 e recebimentos simultâneos de R$ 70,00.
        String t = titulosDeUmPedido("s5-conc-0001", cliente, matriz, 10_000, 10_000).get(0);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> results = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            String key = "s5-conc-chave-" + i;
            results.add(pool.submit(() -> {
                start.await();
                return post("/api/v1/settlements", key, receber(t, "7000", null));
            }));
        }
        start.countDown();
        List<Integer> status = new ArrayList<>();
        for (Future<HttpResponse<String>> f : results) {
            HttpResponse<String> r = f.get();
            status.add(r.statusCode());
            if (r.statusCode() == 422) assertThat(r.body()).contains("INSUFFICIENT_TITLE_BALANCE", "R$ 30,00");
        }
        pool.shutdown();
        assertThat(status).containsOnly(201, 422);
        assertThat(status.stream().filter(s -> s == 201).count()).isEqualTo(1);
        assertThat(titulo(t)).contains("\"balanceCents\":\"3000\"", "\"status\":\"PARTIAL\"");
        assertThat(saldoDoCaixa()).isEqualTo(7_000);
    }

    @Test
    void umRecebimentoQuitaVariosTitulosDoMesmoCliente() throws Exception {
        List<String> titulos = titulosDeUmPedido("s5-var-0001", cliente, matriz, 30_000, 10_000, 20_000);
        HttpResponse<String> r = post("/api/v1/settlements", "s5-var-rec-01", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"25000","notes":"TED 123",
                 "allocations":[{"titleId":"%s","amountCents":"10000"},{"titleId":"%s","amountCents":"15000"}]}
                """.formatted(caixa, HOJE, titulos.get(0), titulos.get(1)));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        assertThat(titulo(titulos.get(0))).contains("\"status\":\"SETTLED\"");
        assertThat(titulo(titulos.get(1))).contains("\"balanceCents\":\"5000\"", "\"status\":\"PARTIAL\"");

        // Título repetido e título de outro cliente são recusados, sem efeito.
        HttpResponse<String> repetido = post("/api/v1/settlements", "s5-var-rec-02", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"200",
                 "allocations":[{"titleId":"%s","amountCents":"100"},{"titleId":"%s","amountCents":"100"}]}
                """.formatted(caixa, HOJE, titulos.get(1), titulos.get(1)));
        assertThat(repetido.body()).contains("Título repetido");
        HttpResponse<String> o = post("/api/v1/customers", "s5-cli-00002", "{\"legalName\":\"Amido Sul S.A.\",\"units\":[{\"name\":\"Fábrica\"}]}");
        String outro = campo(o.body(), "id");
        String unidadeDoOutro = campo(o.body().substring(o.body().indexOf("\"units\"")), "id");
        String doOutro = titulosDeUmPedido("s5-var-0002", outro, unidadeDoOutro, 10_000, 10_000).get(0);
        HttpResponse<String> misturado = post("/api/v1/settlements", "s5-var-rec-03", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"200",
                 "allocations":[{"titleId":"%s","amountCents":"100"},{"titleId":"%s","amountCents":"100"}]}
                """.formatted(caixa, HOJE, titulos.get(1), doOutro));
        assertThat(misturado.statusCode()).isEqualTo(422);
        assertThat(misturado.body()).contains("outro cliente", "\"field\":\"allocations[1].titleId\"");
        assertThat(conta("select count(*) from settlement")).isEqualTo(1);
    }

    @Test
    void pedidoComRecebimentoNaoCancelaAteEstornar() throws Exception {
        HttpResponse<String> r = post("/api/v1/sales-orders", "s5-canc-0001", """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-10-01",
                 "lines":[{"kind":"EQUIPAMENTO","description":"Balança","quantity":"1","unitPrice":"1000"}],
                 "installments":[{"dueDate":"2026-11-10","amountCents":"100000"}]}
                """.formatted(cliente, matriz));
        String pedido = campo(r.body(), "id");
        call("POST", "/api/v1/sales-orders/" + pedido + "/confirmations", admin, null, Map.of("If-Match", "\"1\"", "Idempotency-Key", "s5-canc-conf"));
        String t = ids(get("/api/v1/receivables?customerId=" + cliente).body()).get(0);
        String rec = campo(post("/api/v1/settlements", "s5-canc-rec-01", receber(t, "30000", null)).body(), "id");

        // PD-003: com recebimento, o cancelamento é recusado inteiro.
        HttpResponse<String> bloqueado = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2", "{\"reason\":\"Desistência\"}");
        assertThat(bloqueado.statusCode()).isEqualTo(422);
        assertThat(bloqueado.body()).contains("CANCELLATION_BLOCKED_BY_EFFECTS", "estorne o recebimento");
        assertThat(get("/api/v1/sales-orders/" + pedido).body()).contains("\"status\":\"CONFIRMED\"", "\"projectStage\":\"PLANEJADO\"");
        assertThat(titulo(t)).contains("\"status\":\"PARTIAL\"");

        // Estornado o recebimento, o pedido cancela.
        call("POST", "/api/v1/settlements/" + rec + "/reversals", admin, "{\"reason\":\"Devolução ao cliente\"}", Map.of());
        HttpResponse<String> cancelado = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2", "{\"reason\":\"Desistência\"}");
        assertThat(cancelado.statusCode()).as(cancelado.body()).isEqualTo(200);
        assertThat(titulo(t)).contains("\"status\":\"CANCELLED\"");
        // Título cancelado não recebe.
        assertThat(post("/api/v1/settlements", "s5-canc-rec-02", receber(t, "100", null)).statusCode()).isEqualTo(409);
    }

    @Test
    void contasPorAdministradorEConsultaSoLe() throws Exception {
        HttpResponse<String> conta = post("/api/v1/bank-accounts", "s5-conta-0001", """
                {"name":"Banco do Brasil — c/c 12345-6","bank":"Banco do Brasil","openingCents":"1500000","openingOn":"2026-09-01"}
                """);
        assertThat(conta.statusCode()).as(conta.body()).isEqualTo(201);
        assertThat(campo(conta.body(), "code")).matches("CT\\d{3}");
        assertThat(conta.body()).contains("\"balanceCents\":\"1500000\"");
        assertThat(post("/api/v1/bank-accounts", "s5-conta-0001", "{\"name\":\"Banco do Brasil — c/c 12345-6\",\"bank\":\"Banco do Brasil\","
                + "\"openingCents\":\"1500000\",\"openingOn\":\"2026-09-01\"}").statusCode()).isEqualTo(201);
        HttpResponse<String> repetida = post("/api/v1/bank-accounts", "s5-conta-0002", "{\"name\":\"caixa\",\"openingOn\":\"2026-09-01\"}");
        assertThat(repetida.statusCode()).isEqualTo(422);
        assertThat(repetida.body()).contains("\"field\":\"name\"");

        String t = titulosDeUmPedido("s5-con-0001", cliente, matriz, 10_000, 10_000).get(0);
        String rec = campo(post("/api/v1/settlements", "s5-con-rec-01", receber(t, "5000", null)).body(), "id");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/settlements?titleId=" + t, consulta, null, Map.of()).body()).contains(rec);
        assertThat(call("GET", "/api/v1/bank-accounts", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        HttpResponse<String> negado = call("POST", "/api/v1/settlements", consulta, receber(t, "100", null), Map.of("Idempotency-Key", "s5-con-rec-02"));
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(negado.body()).contains("financial_title.settle");
        assertThat(call("POST", "/api/v1/settlements/" + rec + "/reversals", consulta, "{\"reason\":\"x\"}", Map.of()).body())
                .contains("settlement.reverse");
        assertThat(call("POST", "/api/v1/bank-accounts", consulta, "{\"name\":\"X\",\"openingOn\":\"2026-09-01\"}",
                Map.of("Idempotency-Key", "s5-con-conta-1")).statusCode()).isEqualTo(403);
        assertThat(titulo(t)).contains("\"balanceCents\":\"5000\"");
    }

    /** Ids dos objetos de uma lista JSON, na ordem. */
    private static List<String> ids(String json) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\{\"id\":\"([^\"]+)\"").matcher(json);
        while (m.find()) out.add(m.group(1));
        return out;
    }
}
