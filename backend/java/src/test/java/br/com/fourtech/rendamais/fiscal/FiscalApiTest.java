package br.com.fourtech.rendamais.fiscal;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 7 contra PostgreSQL real: receita por competência a partir das notas (que bate com a lista de documentos), RBT12
 * informado e calculado, simulação com os números do planning, conferência do contador, fechamento que trava as notas da
 * competência, reabertura e revisões dos parâmetros. O início da receita no Renda+ fica em 2020-01 aqui, para que os 12
 * meses anteriores ao mês corrente sejam conhecidos; o mês seguinte ao corrente continua sem RBT12 calculado (o mês
 * corrente ainda não terminou).
 */
@TestPropertySource(properties = "renda.fiscal.revenue-start=2020-01")
class FiscalApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    private static final YearMonth ATUAL = YearMonth.from(HOJE);
    /** Competência do exemplo do planning: sem RBT12 calculável (o mês corrente ainda está aberto). */
    private static final YearMonth C = ATUAL.plusMonths(1);

    private String cliente;
    private String matriz;
    private String caixa;
    private String servico;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", "s7-cli-00001", """
                {"legalName":"Fecularia Vale do Paranapanema Ltda.","units":[{"name":"Matriz","city":"Cândido Mota","state":"SP"}]}
                """);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        cliente = campo(c.body(), "id");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
        HttpResponse<String> s = post("/api/v1/items", "s7-item-0001", """
                {"description":"Instalação e comissionamento","nature":"SERVICO","uom":"H","categoryId":"%s","stockControlled":false}
                """.formatted(categoria("Serviços de campo")));
        assertThat(s.statusCode()).as(s.body()).isEqualTo(201);
        servico = campo(s.body(), "id");
    }

    /** Pedido confirmado de uma parcela com as linhas dadas; devolve o id do título. */
    private String[] pedido(String chave, String linhas, long total) throws Exception {
        HttpResponse<String> r = post("/api/v1/sales-orders", chave, """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-01-10","lines":%s,
                 "installments":[{"dueDate":"2026-12-10","amountCents":"%d"}]}
                """.formatted(cliente, matriz, linhas, total));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        String titulo = jdbc.sql("select id::text from financial_title where origin_id like :o").param("o", id + ":%")
                .query(String.class).single();
        return new String[]{id, titulo};
    }

    private void recebe(String chave, String titulo, long centavos) throws Exception {
        HttpResponse<String> r = post("/api/v1/settlements", chave, """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"%d","allocations":[{"titleId":"%s","amountCents":"%d"}]}
                """.formatted(caixa, HOJE, centavos, titulo, centavos));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
    }

    private HttpResponse<String> nota(String chave, String pedido, String tipo, String numero, YearMonth competencia) throws Exception {
        return post("/api/v1/documents", chave, """
                {"orderId":"%s","kind":"%s","series":"1","number":"%s","issueDate":"%s","competence":"%s"}
                """.formatted(pedido, tipo, numero, HOJE, competencia));
    }

    private HttpResponse<String> simula(YearMonth c, String chave) throws Exception {
        return post("/api/v1/tax-periods/" + c + "/simulations", chave, null);
    }

    /** Soma de totalCents das notas ativas da competência, pela lista de documentos (o "Faturado da lista" da tela). */
    private long faturadoDaLista(YearMonth c) throws Exception {
        Matcher m = Pattern.compile("\"totalCents\":\"(\\d+)\"").matcher(get("/api/v1/documents?competence=" + c).body());
        long sum = 0;
        while (m.find()) sum += Long.parseLong(m.group(1));
        return sum;
    }

    @Test
    void simulacaoComRbt12InformadoConfereComOContadorEFechaACompetencia() throws Exception {
        // Pedido de R$ 155.500,00 (equipamento R$ 100.000,00 + instalação R$ 55.500,00) com R$ 20.000,00 recebidos;
        // nota de produto e nota de serviço do mesmo recebimento, na competência C.
        String[] p = pedido("s7-ped-0001", """
                [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"100000"},
                 {"kind":"SERVICO","itemId":"%s","quantity":"1","unitPrice":"55500"}]
                """.formatted(servico), 15_550_000);
        recebe("s7-rec-0001", p[1], 2_000_000);
        HttpResponse<String> nfe = nota("s7-doc-0001", p[0], "PRODUTO", "1234", C);
        assertThat(nfe.statusCode()).as(nfe.body()).isEqualTo(201);
        HttpResponse<String> nfse = nota("s7-doc-0002", p[0], "SERVICO", "5001", C);
        assertThat(nfse.statusCode()).as(nfse.body()).isEqualTo(201);

        // Receita da competência = a lista de documentos filtrada pela mesma competência (retrospectiva da Sprint 6).
        String lista = get("/api/v1/tax-periods?year=" + C.getYear()).body();
        assertThat(lista).contains("{\"competence\":\"" + C + "\",\"status\":\"ABERTA\",\"version\":\"0\",\"revenueKnown\":true,"
                + "\"productRevenueCents\":\"1286174\",\"serviceRevenueCents\":\"713826\",\"revenueCents\":\"2000000\",\"documentCount\":2");
        assertThat(faturadoDaLista(C)).isEqualTo(2_000_000);

        // Ficha: versão 0, revisão 1 vigente, RBT12 desconhecido (falta o mês corrente).
        HttpResponse<String> ficha = get("/api/v1/tax-periods/" + C);
        assertThat(ficha.headers().firstValue("ETag")).contains("\"0\"");
        assertThat(ficha.body()).contains("\"revision\":1", "\"productAnnex\":\"II\"", "\"serviceAnnex\":\"III\"", "\"number\":\"1234\"",
                "\"kind\":\"SERVICO\"", "\"calculatedCents\":null", "\"missing\":[\"" + ATUAL + "\"]");

        // Simular sem RBT12: não calculável, com o motivo; a mesma chave não repete.
        HttpResponse<String> s1 = simula(C, "s7-sim-0001");
        assertThat(s1.statusCode()).as(s1.body()).isEqualTo(201);
        assertThat(s1.body()).contains("\"result\":\"NAO_CALCULAVEL\"", "RBT12 desconhecido", "\"totalTaxCents\":null");
        assertThat(simula(C, "s7-sim-0001").statusCode()).isEqualTo(201);
        assertThat(conta("select count(*) from tax_simulation")).isEqualTo(1);

        // Informar o RBT12: campos obrigatórios; versão lida conferida (412).
        assertThat(withVersion("PUT", "/api/v1/tax-periods/" + C + "/rbt12", "1", "{}").body())
                .contains("TAX_INVALID", "\"field\":\"amountCents\"", "\"field\":\"informedBy\"");
        assertThat(withVersion("PUT", "/api/v1/tax-periods/" + C + "/rbt12", "0",
                "{\"amountCents\":\"30000000\",\"informedBy\":\"Contador\"}").statusCode()).isEqualTo(412);
        HttpResponse<String> inf = withVersion("PUT", "/api/v1/tax-periods/" + C + "/rbt12", "1",
                "{\"amountCents\":\"30000000\",\"informedBy\":\"Escritório contábil\",\"notes\":\"PGDAS-D do mês\"}");
        assertThat(inf.statusCode()).as(inf.body()).isEqualTo(200);
        assertThat(inf.body()).contains("\"informedCents\":\"30000000\"", "\"usedOrigin\":\"INFORMADO\"", "\"version\":\"2\"");

        // Simulação do planning: 5,82% e 8,08%, R$ 748,55 + R$ 576,77 = R$ 1.325,32, com a memória.
        HttpResponse<String> s2 = simula(C, "s7-sim-0002");
        assertThat(s2.body()).contains("\"seq\":2,\"result\":\"CALCULADA\",\"parameterRevision\":1,\"rbt12Cents\":\"30000000\",\"rbt12Origin\":\"INFORMADO\"",
                "\"productTaxCents\":\"74855\",\"serviceTaxCents\":\"57677\",\"totalTaxCents\":\"132532\"",
                "\"effectiveRate\":\"0.05820000\"", "\"effectiveRate\":\"0.08080000\"", "\"annex\":\"III\",\"bracket\":2");

        // Fechar exige a conferência do contador.
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/closures", "3", null).body()).contains("TAX_PERIOD_INVALID");
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/confirmations", "3", "{\"amountCents\":\"-1\"}").body())
                .contains("\"field\":\"amountCents\"", "\"field\":\"dueDate\"");
        HttpResponse<String> conf = withVersion("POST", "/api/v1/tax-periods/" + C + "/confirmations", "3",
                "{\"amountCents\":\"133000\",\"dueDate\":\"" + C.plusMonths(1).atDay(20) + "\",\"notes\":\"DAS do PGDAS-D\"}");
        assertThat(conf.statusCode()).as(conf.body()).isEqualTo(201);
        assertThat(conf.body()).contains("\"differenceCents\":\"468\"", "\"amountCents\":\"133000\"", "\"simulationSeq\":2");
        assertThat(get("/api/v1/tax-periods?year=" + C.getYear()).body()).contains("\"simulationCents\":\"132532\",\"confirmedCents\":\"133000\"",
                "\"differenceCents\":\"468\"");

        // Fechar: a competência trava as notas (registrar e cancelar) e as alterações do fiscal.
        HttpResponse<String> fecha = withVersion("POST", "/api/v1/tax-periods/" + C + "/closures", "4", null);
        assertThat(fecha.statusCode()).as(fecha.body()).isEqualTo(200);
        assertThat(fecha.body()).contains("\"status\":\"FECHADA\"", "\"action\":\"FECHAMENTO\",\"reason\":null,\"revenueCents\":\"2000000\"");
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/closures", "4", null).body()).contains("\"version\":\"5\"");
        recebe("s7-rec-0002", p[1], 1_000_000);
        HttpResponse<String> travada = nota("s7-doc-0003", p[0], "PRODUTO", "1235", C);
        assertThat(travada.statusCode()).isEqualTo(422);
        assertThat(travada.body()).contains("TAX_PERIOD_CLOSED", "\"field\":\"competence\"", "fechada");
        assertThat(withVersion("POST", "/api/v1/documents/" + campo(nfse.body(), "id") + "/cancellations", "2",
                "{\"reason\":\"Nota errada\"}").body()).contains("TAX_PERIOD_CLOSED", "cancelar a nota");
        assertThat(simula(C, "s7-sim-0003").body()).contains("TAX_PERIOD_CLOSED");
        assertThat(nota("s7-doc-0004", p[0], "PRODUTO", "1235", C.plusMonths(1)).statusCode()).isEqualTo(201);

        // Reabrir: motivo obrigatório; depois a nota volta a poder ser cancelada e a receita muda.
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/reopenings", "5", "{}").body()).contains("\"field\":\"reason\"");
        HttpResponse<String> reabre = withVersion("POST", "/api/v1/tax-periods/" + C + "/reopenings", "5",
                "{\"reason\":\"Nota de serviço com valor errado\"}");
        assertThat(reabre.statusCode()).as(reabre.body()).isEqualTo(200);
        assertThat(reabre.body()).contains("\"status\":\"ABERTA\"", "\"action\":\"REABERTURA\"");
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/reopenings", "6", "{\"reason\":\"x\"}").statusCode()).isEqualTo(409);
        assertThat(withVersion("POST", "/api/v1/documents/" + campo(nfse.body(), "id") + "/cancellations", "2",
                "{\"reason\":\"Nota errada\"}").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("\"revenueCents\":\"1286174\"");
        assertThat(faturadoDaLista(C)).isEqualTo(1_286_174);

        // Trilha e eventos.
        assertThat(get("/api/v1/tax-periods/" + C + "/history").body()).contains("TAX_SIMULATION_RECORDED", "TAX_RBT12_INFORMED",
                "TAX_PERIOD_CONFIRMED", "TAX_PERIOD_CLOSED", "TAX_PERIOD_REOPENED", "Nota de serviço com valor errado");
        assertThat(conta("select count(*) from outbox_event where event_type = 'TaxSimulationRecorded'")).isEqualTo(2);
        assertThat(conta("select count(*) from outbox_event where event_type = 'TaxPeriodConfirmed'")).isEqualTo(1);
        assertThat(conta("select count(*) from outbox_event where event_type = 'TaxPeriodClosed'")).isEqualTo(1);
        assertThat(conta("select count(*) from outbox_event where event_type = 'TaxPeriodReopened'")).isEqualTo(1);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'TaxPeriodConfirmed'").query(String.class).single())
                .contains("\"confirmedAmountCents\": \"133000\"", "\"titleId\": null");
    }

    @Test
    void rbt12CalculadoDasNotasQuandoORendaTemOs12Meses() throws Exception {
        // R$ 300.000,00 de produto faturados três meses antes do mês corrente; R$ 10.000,00 no mês corrente.
        String[] p = pedido("s7-ped-0002", """
                [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"310000"}]
                """, 31_000_000);
        recebe("s7-rec-0003", p[1], 31_000_000);
        assertThat(post("/api/v1/documents", "s7-doc-0011", """
                {"orderId":"%s","series":"1","number":"7001","issueDate":"%s","competence":"%s","amountCents":"30000000"}
                """.formatted(p[0], HOJE, ATUAL.minusMonths(3))).statusCode()).isEqualTo(201);
        assertThat(nota("s7-doc-0012", p[0], "PRODUTO", "7002", ATUAL).statusCode()).isEqualTo(201);
        HttpResponse<String> s = simula(ATUAL, "s7-sim-0011");
        assertThat(s.statusCode()).as(s.body()).isEqualTo(201);
        // (300.000,00 × 7,8% − 5.940,00) ÷ 300.000,00 = 5,82% sobre R$ 10.000,00 = R$ 582,00.
        assertThat(s.body()).contains("\"calculatedCents\":\"30000000\"", "\"rbt12Origin\":\"CALCULADO\"", "\"productTaxCents\":\"58200\"",
                "\"serviceTaxCents\":\"0\"", "\"totalTaxCents\":\"58200\"", "\"missing\":[]",
                "{\"cents\":\"30000000\",\"competence\":\"" + ATUAL.minusMonths(3) + "\"}");
    }

    @Test
    void novaRevisaoDosParametrosTemVigenciaEPreservaAAnterior() throws Exception {
        HttpResponse<String> invalida = post("/api/v1/tax-parameters", "s7-par-0001", """
                {"validFrom":"2026-13","productAnnex":"","serviceAnnex":"III","source":"",
                 "brackets":{"PRODUTO":[{"upToCents":"100","rate":"0.05","deductionCents":"0"},{"upToCents":"50","rate":"1.5","deductionCents":"-1"}]}}
                """);
        assertThat(invalida.statusCode()).isEqualTo(422);
        assertThat(invalida.body()).contains("TAX_PARAMETER_INVALID", "\"field\":\"validFrom\"", "\"field\":\"productAnnex\"", "\"field\":\"source\"",
                "\"field\":\"brackets.PRODUTO[1].upToCents\"", "\"field\":\"brackets.PRODUTO[1].rate\"",
                "\"field\":\"brackets.PRODUTO[1].deductionCents\"", "\"field\":\"brackets.SERVICO\"");
        String revisao2 = """
                {"validFrom":"%s","productAnnex":"II","serviceAnnex":"III","source":"Contador, e-mail de revisão",
                 "brackets":{"PRODUTO":[{"upToCents":"18000000","rate":"0.05","deductionCents":"0"},{"upToCents":"480000000","rate":"0.08","deductionCents":"600000"}],
                             "SERVICO":[{"upToCents":"480000000","rate":"0.06","deductionCents":"0"}]}}
                """.formatted(C.plusMonths(1));
        HttpResponse<String> ok = post("/api/v1/tax-parameters", "s7-par-0002", revisao2);
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(201);
        assertThat(ok.body()).contains("\"revision\":2", "\"rate\":\"0.08\"");
        // A mesma chave devolve a mesma revisão.
        assertThat(campo(post("/api/v1/tax-parameters", "s7-par-0002", revisao2).body(), "id")).isEqualTo(campo(ok.body(), "id"));
        // A revisão 1 continua valendo até a vigência da 2.
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("\"revision\":1");
        assertThat(get("/api/v1/tax-periods/" + C.plusMonths(1)).body()).contains("\"revision\":2");
        assertThat(get("/api/v1/tax-parameters").body()).contains("\"revision\":2", "\"revision\":1", "Planilha FOURTECH");
        assertThat(conta("select count(*) from outbox_event where event_type = 'TaxParameterRevised'")).isEqualTo(1);
    }

    @Test
    void perfilConsultaVeMasNaoSimulaNemConfereNemAlteraParametros() throws Exception {
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/tax-periods", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/tax-periods/" + C, consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/tax-parameters", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/simulations", consulta, null, Map.of("Idempotency-Key", "s7-cons-0001")).body())
                .contains("tax_period.simulate");
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/confirmations", consulta, "{}", Map.of("If-Match", "\"0\"")).body())
                .contains("tax_period.confirm");
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/closures", consulta, null, Map.of("If-Match", "\"0\"")).body())
                .contains("tax_period.close");
        assertThat(call("POST", "/api/v1/tax-parameters", consulta, "{}", Map.of("Idempotency-Key", "s7-cons-0002")).body())
                .contains("tax_parameter.admin");
        assertThat(conta("select count(*) from tax_period")).isZero();
    }
}
