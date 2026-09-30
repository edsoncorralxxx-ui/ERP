package br.com.fourtech.rendamais.financeiro;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 9 contra PostgreSQL real: transferência entre contas (total inalterado, estorno), saldo realizado numa data e o
 * fluxo de caixa com os números do planning — meses encadeados, realizado e previsto separados, parte recebida que não
 * reaparece, filtros de conta e categoria, em atraso e a composição de cada valor conferindo com a grade.
 */
class FluxoDeCaixaApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    private static final YearMonth M = YearMonth.from(HOJE);
    private static final YearMonth N = M.plusMonths(1);

    private String caixa;
    private String banco;
    private String cliente;
    private String matriz;
    private String fornecedor;

    @BeforeEach
    void cadastros() throws Exception {
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
        HttpResponse<String> b = post("/api/v1/bank-accounts", null, """
                {"name":"Banco do Brasil — fluxo","kind":"BANCO","bank":"Banco do Brasil","openingCents":"1000000","openingOn":"2026-01-01"}
                """);
        assertThat(b.statusCode()).as(b.body()).isEqualTo(201);
        banco = campo(b.body(), "id");
        HttpResponse<String> c = post("/api/v1/customers", "s9-cli-00001", """
                {"legalName":"Fecularia Fluxo Ltda.","units":[{"name":"Matriz","city":"Assis","state":"SP"}]}
                """);
        cliente = campo(c.body(), "id");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente).query(String.class).single();
        fornecedor = campo(post("/api/v1/suppliers", "s9-for-00001", "{\"legalName\":\"ACME Fluxo Ltda.\"}").body(), "id");
    }

    private HttpResponse<String> transfere(String chave, String de, String para, long centavos, String data) throws Exception {
        return post("/api/v1/transfers", chave, """
                {"fromAccountId":"%s","toAccountId":"%s","effectiveDate":"%s","amountCents":"%d","notes":"Reforço do banco"}
                """.formatted(de, para, data, centavos));
    }

    private long saldo(String conta) throws Exception {
        return Long.parseLong(campo(get("/api/v1/bank-accounts/" + conta).body(), "balanceCents"));
    }

    /** Pedido confirmado com uma parcela (centavos) vencendo em {@code vencimento}; devolve o id do título. */
    private String aReceber(String chave, long centavos, LocalDate vencimento) throws Exception {
        String preco = centavos / 100 + "." + String.format("%02d", centavos % 100);
        HttpResponse<String> r = post("/api/v1/sales-orders", chave, """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-01-10",
                 "lines":[{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"%s"}],
                 "installments":[{"dueDate":"%s","amountCents":"%d"}]}
                """.formatted(cliente, matriz, preco, vencimento, centavos));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        return jdbc.sql("select id::text from financial_title where origin_id like :o").param("o", id + ":%").query(String.class).single();
    }

    private String aPagar(String chave, String categoria, long centavos, LocalDate vencimento) throws Exception {
        HttpResponse<String> r = post("/api/v1/payables", chave, """
                {"supplierId":"%s","category":"%s","competence":"%s","totalCents":"%d","installments":[{"dueDate":"%s","amountCents":"%d"}]}
                """.formatted(fornecedor, categoria, M, centavos, vencimento, centavos));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return campo(r.body(), "id");
    }

    private void recebe(String chave, String conta, String titulo, long centavos) throws Exception {
        HttpResponse<String> r = post("/api/v1/settlements", chave, """
                {"direction":"RECEIVABLE","accountId":"%s","effectiveDate":"%s","amountCents":"%d","allocations":[{"titleId":"%s","amountCents":"%d"}]}
                """.formatted(conta, HOJE, centavos, titulo, centavos));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
    }

    /** Os meses do fluxo como mapas de campo → valor (texto). */
    private static List<Map<String, String>> meses(String json) {
        List<Map<String, String>> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\{\"month\":\"([^\"]+)\",\"period\":\"([^\"]+)\",\"openingCents\":\"(-?\\d+)\",\"realizedInCents\":\"(\\d+)\","
                + "\"realizedOutCents\":\"(\\d+)\",\"overdueInCents\":\"(\\d+)\",\"overdueOutCents\":\"(\\d+)\",\"forecastInCents\":\"(\\d+)\","
                + "\"forecastOutCents\":\"(\\d+)\",\"closingCents\":\"(-?\\d+)\"\\}").matcher(json);
        String[] k = {"month", "period", "opening", "realizedIn", "realizedOut", "overdueIn", "overdueOut", "forecastIn", "forecastOut", "closing"};
        while (m.find()) {
            Map<String, String> x = new java.util.LinkedHashMap<>();
            for (int i = 0; i < k.length; i++) x.put(k[i], m.group(i + 1));
            out.add(x);
        }
        return out;
    }

    private String composicao(YearMonth mes, String coluna, String filtros) throws Exception {
        HttpResponse<String> r = get("/api/v1/cash-flow/composition?month=" + mes + "&column=" + coluna + filtros);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return r.body();
    }

    /** A composição de cada valor de cada mês soma exatamente o valor da grade. */
    private void composicaoConfere(List<Map<String, String>> ms, String filtros) throws Exception {
        String[][] colunas = {{"OPENING", "opening"}, {"REALIZED_IN", "realizedIn"}, {"REALIZED_OUT", "realizedOut"}, {"OVERDUE_IN", "overdueIn"},
                {"OVERDUE_OUT", "overdueOut"}, {"FORECAST_IN", "forecastIn"}, {"FORECAST_OUT", "forecastOut"}};
        for (int i = 0; i < ms.size(); i++) {
            Map<String, String> m = ms.get(i);
            for (String[] c : colunas) {
                // O saldo inicial dos meses seguintes é o saldo final do anterior; a composição vale para o primeiro e para o corrente.
                if (c[0].equals("OPENING") && i > 0 && !m.get("period").equals("CORRENTE")) continue;
                assertThat(campo(composicao(YearMonth.parse(m.get("month")), c[0], filtros), "totalCents")).as(m.get("month") + " " + c[0])
                        .isEqualTo(m.get(c[1]));
            }
        }
    }

    @Test
    void transferenciaMudaAsContasMasNaoOTotalEEstornaInteira() throws Exception {
        long total = Long.parseLong(campo(get("/api/v1/bank-accounts/balances").body(), "totalCents"));
        // Validações.
        HttpResponse<String> vazio = post("/api/v1/transfers", "s9-tr-vazio", "{}");
        assertThat(vazio.statusCode()).isEqualTo(422);
        assertThat(vazio.body()).contains("\"field\":\"fromAccountId\"", "\"field\":\"toAccountId\"", "\"field\":\"effectiveDate\"",
                "\"field\":\"amountCents\"");
        assertThat(transfere("s9-tr-igual", banco, banco, 100, HOJE.toString()).body()).contains("diferente da origem");
        assertThat(transfere("s9-tr-futura", banco, caixa, 100, HOJE.plusDays(1).toString()).body()).contains("não pode ser futura");

        HttpResponse<String> t = transfere("s9-tr-00001", banco, caixa, 500_000, HOJE.toString());
        assertThat(t.statusCode()).as(t.body()).isEqualTo(201);
        assertThat(campo(t.body(), "code")).matches("TR\\d{5}");
        assertThat(t.body()).contains("\"status\":\"POSTED\"", "\"amountCents\":\"500000\"");
        String id = campo(t.body(), "id");
        // Mesma chave: a mesma transferência.
        assertThat(campo(transfere("s9-tr-00001", banco, caixa, 500_000, HOJE.toString()).body(), "id")).isEqualTo(id);
        assertThat(saldo(banco)).isEqualTo(500_000);
        assertThat(saldo(caixa)).isEqualTo(500_000);
        String saldos = get("/api/v1/bank-accounts/balances?date=" + HOJE).body();
        assertThat(Long.parseLong(campo(saldos, "totalCents"))).isEqualTo(total);
        assertThat(get("/api/v1/bank-accounts/" + banco + "/movements").body()).contains("\"amountCents\":\"-500000\"", "\"kind\":\"TRANSFER\"",
                "\"transferId\":\"" + id + "\"", "Transferência " + campo(t.body(), "code") + " para CT001 — Caixa");
        assertThat(get("/api/v1/bank-accounts/" + caixa + "/movements").body()).contains("\"amountCents\":\"500000\"");
        // No saldo de ontem a transferência ainda não existe.
        assertThat(get("/api/v1/bank-accounts/balances?date=" + HOJE.minusDays(1)).body()).contains("\"balanceCents\":\"1000000\"");

        // Conta inativa não transfere.
        String outra = campo(post("/api/v1/bank-accounts", null, "{\"name\":\"Conta parada\",\"kind\":\"CAIXA\"}").body(), "id");
        assertThat(withVersion("PUT", "/api/v1/bank-accounts/" + outra, "1", "{\"name\":\"Conta parada\",\"kind\":\"CAIXA\",\"status\":\"INATIVO\"}")
                .statusCode()).isEqualTo(200);
        assertThat(transfere("s9-tr-inativa", banco, outra, 100, HOJE.toString()).body()).contains("ACCOUNT_INACTIVE");

        // Estorno: motivo obrigatório; as duas contas voltam; estornar de novo devolve o mesmo.
        assertThat(post("/api/v1/transfers/" + id + "/reversals", null, "{}").body()).contains("\"field\":\"reason\"");
        HttpResponse<String> e = post("/api/v1/transfers/" + id + "/reversals", null, "{\"reason\":\"Conta errada\"}");
        assertThat(e.statusCode()).as(e.body()).isEqualTo(200);
        assertThat(e.body()).contains("\"status\":\"REVERSED\"", "\"reversalReason\":\"Conta errada\"");
        assertThat(saldo(banco)).isEqualTo(1_000_000);
        assertThat(saldo(caixa)).isZero();
        assertThat(post("/api/v1/transfers/" + id + "/reversals", null, "{\"reason\":\"x\"}").body()).contains("\"version\":\"2\"");
        assertThat(conta("select count(*) from cash_movement where transfer_id is not null")).isEqualTo(4);
        assertThat(get("/api/v1/transfers?accountId=" + banco).body()).contains(id);
        assertThat(get("/api/v1/transfers/" + id + "/history").body()).contains("TRANSFER_POSTED", "TRANSFER_REVERSED", "Conta errada");
        assertThat(conta("select count(*) from outbox_event where event_type in ('TransferPosted', 'TransferReversed')")).isEqualTo(2);

        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/cash-flow", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("POST", "/api/v1/transfers", consulta, "{}", Map.of("Idempotency-Key", "s9-cons-0001")).statusCode()).isEqualTo(403);
    }

    @Test
    void fluxoComOsNumerosDoPlanningRealizadoEPrevistoSeparados() throws Exception {
        // Hoje: R$ 20.000,00 recebidos no Caixa de uma parcela de R$ 55.500,00 que vence no mês seguinte; R$ 5.000,00 do Caixa
        // para o Banco. Banco R$ 15.000,00 e Caixa R$ 15.000,00: total R$ 30.000,00.
        String parcela = aReceber("s9-ped-0001", 5_550_000, N.atDay(10));
        recebe("s9-rec-0001", caixa, parcela, 2_000_000);
        assertThat(transfere("s9-tr-0002", caixa, banco, 500_000, HOJE.toString()).statusCode()).isEqualTo(201);
        aPagar("s9-cp-0001", "SERVICOS_TERCEIROS", 100_000, N.atDay(10));
        aPagar("s9-cp-0002", "IMPOSTOS_SIMPLES", 133_500, N.atDay(20));
        aPagar("s9-cp-0003", "SERVICOS_TERCEIROS", 100_000, N.plusMonths(1).atDay(10));
        assertThat(campo(get("/api/v1/bank-accounts/balances").body(), "totalCents")).isEqualTo("3000000");

        String json = get("/api/v1/cash-flow?from=" + M.minusMonths(1) + "&to=" + N.plusMonths(1)).body();
        List<Map<String, String>> ms = meses(json);
        assertThat(ms).extracting(m -> m.get("period")).containsExactly("REALIZADO", "CORRENTE", "PREVISTO", "PREVISTO");
        // Mês passado: o saldo do Banco; mês corrente: R$ 20.000,00 recebidos (a transferência se anula no consolidado).
        assertThat(ms.get(0)).containsEntry("opening", "1000000").containsEntry("closing", "1000000");
        assertThat(ms.get(1)).containsEntry("realizedIn", "2000000").containsEntry("realizedOut", "0").containsEntry("closing", "3000000");
        // Mês seguinte: R$ 35.500,00 a receber (os R$ 20.000,00 recebidos não reaparecem) e R$ 2.335,00 a pagar.
        assertThat(ms.get(2)).containsEntry("opening", "3000000").containsEntry("forecastIn", "3550000").containsEntry("forecastOut", "233500")
                .containsEntry("closing", "6316500").containsEntry("realizedIn", "0");
        assertThat(ms.get(3)).containsEntry("opening", "6316500").containsEntry("forecastOut", "100000").containsEntry("closing", "6216500");
        for (int i = 1; i < ms.size(); i++) assertThat(ms.get(i).get("opening")).isEqualTo(ms.get(i - 1).get("closing"));
        composicaoConfere(ms, "");
        String saidas = composicao(N, "FORECAST_OUT", "");
        assertThat(saidas).contains("\"targetKind\":\"payable\"", "\"amountCents\":\"100000\"", "\"amountCents\":\"133500\"",
                "\"totalCents\":\"233500\"");
        assertThat(composicao(N, "FORECAST_IN", "")).contains("\"targetKind\":\"receivable\",\"targetId\":\"" + parcela + "\"",
                "\"amountCents\":\"3550000\"");

        // Filtro por conta: o saldo inicial e o realizado são os do Banco (com a transferência); o previsto continua o da empresa.
        List<Map<String, String>> doBanco = meses(get("/api/v1/cash-flow?from=" + M + "&to=" + N + "&accountId=" + banco).body());
        assertThat(doBanco.get(0)).containsEntry("opening", "1000000").containsEntry("realizedIn", "500000").containsEntry("closing", "1500000");
        assertThat(doBanco.get(1)).containsEntry("forecastIn", "3550000").containsEntry("closing", "4816500");
        composicaoConfere(doBanco, "&accountId=" + banco);

        // Filtro por categoria: só o fluxo da categoria (saldo inicial zero).
        List<Map<String, String>> servicos = meses(get("/api/v1/cash-flow?from=" + M + "&to=" + N.plusMonths(1) + "&category=SERVICOS_TERCEIROS").body());
        assertThat(servicos.get(0)).containsEntry("opening", "0").containsEntry("realizedIn", "0");
        assertThat(servicos.get(1)).containsEntry("forecastOut", "100000").containsEntry("forecastIn", "0");
        assertThat(servicos.get(2)).containsEntry("closing", "-200000");
        composicaoConfere(servicos, "&category=SERVICOS_TERCEIROS");
        List<Map<String, String>> vendas = meses(get("/api/v1/cash-flow?from=" + M + "&to=" + M + "&category=RECEITA_VENDA").body());
        assertThat(vendas.get(0)).containsEntry("realizedIn", "2000000");

        // Horizonte padrão: 3 meses antes a 6 depois; mais de 24 meses é recusado.
        assertThat(meses(get("/api/v1/cash-flow").body())).hasSize(10);
        assertThat(get("/api/v1/cash-flow?from=2026-01&to=2028-01").body()).contains("CASH_FLOW_INVALID");
        assertThat(json).contains("\"pendings\":[");
    }

    @Test
    void titulosVencidosEntramNaColunaEmAtrasoDoMesCorrente() throws Exception {
        String vencido = aPagar("s9-cp-venc", "ALUGUEL", 50_000, HOJE.minusDays(1));
        List<Map<String, String>> ms = meses(get("/api/v1/cash-flow?from=" + M + "&to=" + N).body());
        assertThat(ms.get(0)).containsEntry("period", "CORRENTE").containsEntry("overdueOut", "50000").containsEntry("forecastOut", "0")
                .containsEntry("closing", "950000");
        assertThat(ms.get(1)).containsEntry("opening", "950000");
        assertThat(composicao(M, "OVERDUE_OUT", "")).contains("\"targetId\":\"" + vencido + "\"", "\"totalCents\":\"50000\"");
        composicaoConfere(ms, "");
        // Horizonte só futuro: o saldo inicial já desconta o que está em atraso.
        assertThat(meses(get("/api/v1/cash-flow?from=" + N + "&to=" + N).body()).get(0)).containsEntry("opening", "950000");
        assertThat(composicao(N, "OPENING", "")).contains("\"totalCents\":\"950000\"");
    }
}
