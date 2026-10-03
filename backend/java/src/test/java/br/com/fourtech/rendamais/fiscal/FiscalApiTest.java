package br.com.fourtech.rendamais.fiscal;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

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
 * Sprint 12 contra PostgreSQL real, com os números do mock (exemplo do planning): o início da receita no Renda+ é o mês
 * anterior ao corrente (C), os 12 meses antes dele vêm do histórico carregado do arquivo (RBT12 de R$ 3.340.000,00) e a
 * receita de C vem das notas, por anexo pela classificação dos itens: I R$ 11.840,00, II R$ 265.500,00 e III
 * R$ 109.060,00. Cálculo R$ 52.415,79; transmissão do PGDAS-D, guia DAS e pagamento; etapas; encerramento que trava as
 * notas; obrigações, classificação, parâmetros e painel.
 */
class FiscalApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    private static final YearMonth ATUAL = YearMonth.from(HOJE);
    /** Competência do exemplo: o mês anterior ao corrente (já terminou), início da receita no Renda+. */
    private static final YearMonth C = ATUAL.minusMonths(1);
    /** Receita de 09/2025 a 08/2026 do mock, por anexo (I, II, III), em reais. */
    private static final long[][] HISTORICO = {
            {9800, 197400, 72800}, {8400, 169200, 62400}, {9100, 183300, 67600}, {11550, 232650, 85800}, {5250, 105750, 39000},
            {4900, 98700, 36400}, {6650, 133950, 49400}, {8750, 176250, 65000}, {11550, 232650, 85800}, {13650, 274950, 101400},
            {14700, 296100, 109200}, {12600, 262200, 85200}};

    @DynamicPropertySource
    static void inicio(DynamicPropertyRegistry registry) {
        registry.add("renda.fiscal.revenue-start", C::toString);
    }

    private String cliente;
    private String matriz;
    private String caixa;
    private String peca;
    private String servico;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", "s12-cli-0001", """
                {"legalName":"Farinheira Santa Helena Ltda.","units":[{"name":"Matriz","city":"Ivinhema","state":"MS"}]}
                """);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        cliente = campo(c.body(), "id");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
        HttpResponse<String> p = post("/api/v1/items", "s12-item-0001", """
                {"description":"Célula de carga 50 kg (reposição)","nature":"MATERIAL","uom":"UN","categoryId":"%s","stockControlled":false}
                """.formatted(categoria("Peças de reposição")));
        assertThat(p.statusCode()).as(p.body()).isEqualTo(201);
        peca = campo(p.body(), "id");
        HttpResponse<String> s = post("/api/v1/items", "s12-item-0002", """
                {"description":"Instalação e treinamento","nature":"SERVICO","uom":"H","categoryId":"%s","stockControlled":false}
                """.formatted(categoria("Serviços de campo")));
        assertThat(s.statusCode()).as(s.body()).isEqualTo(201);
        servico = campo(s.body(), "id");
    }

    /** Arquivo de histórico com os 12 meses anteriores a C (os números de 09/2025 a 08/2026 do mock). */
    private static String arquivoDoHistorico() {
        List<String> linhas = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            long[] a = HISTORICO[i];
            linhas.add("{\"competencia\":\"%s\",\"anexoI\":\"%d.00\",\"anexoII\":\"%d.00\",\"anexoIII\":\"%d.00\",\"total\":\"%d.00\"}"
                    .formatted(C.minusMonths(12 - i), a[0], a[1], a[2], a[0] + a[1] + a[2]));
        }
        return "{\"historicoReceita\":[" + String.join(",", linhas) + "]}";
    }

    private HttpResponse<String> carga(String chave, String conteudo, boolean confirma) throws Exception {
        return post("/api/v1/tax-revenue-history/imports", chave, "{\"fileName\":\"fiscal-exemplo.json\",\"content\":%s,\"confirm\":%s}"
                .formatted(jsonString(conteudo), confirma));
    }

    private static String jsonString(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    private HttpResponse<String> classifica(String item, String versao, String corpo) throws Exception {
        return withVersion("PUT", "/api/v1/fiscal-classification/" + item, versao, corpo);
    }

    /** Pedido confirmado e recebido por inteiro: equipamento (II), peça de revenda (I) e serviço (III). */
    private String pedidoRecebido() throws Exception {
        HttpResponse<String> r = post("/api/v1/sales-orders", "s12-ped-0001", """
                {"customerId":"%s","unitId":"%s","contractDate":"%s","lines":[
                  {"kind":"EQUIPAMENTO","description":"Balança Renda+ R50","quantity":"1","unitPrice":"265500"},
                  {"kind":"MATERIAL","itemId":"%s","quantity":"1","unitPrice":"11840"},
                  {"kind":"SERVICO","itemId":"%s","quantity":"1","unitPrice":"109060"}],
                 "installments":[{"dueDate":"%s","amountCents":"38640000"}]}
                """.formatted(cliente, matriz, HOJE, peca, servico, HOJE));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", "s12-ped-0001-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        String titulo = jdbc.sql("select id::text from financial_title where origin_id like :o").param("o", id + ":%")
                .query(String.class).single();
        HttpResponse<String> rec = post("/api/v1/settlements", "s12-rec-0001", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"38640000","allocations":[{"titleId":"%s","amountCents":"38640000"}]}
                """.formatted(caixa, HOJE, titulo));
        assertThat(rec.statusCode()).as(rec.body()).isEqualTo(201);
        return id;
    }

    private HttpResponse<String> nota(String chave, String pedido, String tipo, String numero) throws Exception {
        return post("/api/v1/documents", chave, """
                {"orderId":"%s","kind":"%s","series":"1","number":"%s","issueDate":"%s","competence":"%s"}
                """.formatted(pedido, tipo, numero, HOJE, C));
    }

    private String versao(String competencia) throws Exception {
        return get("/api/v1/tax-periods/" + competencia).headers().firstValue("ETag").orElseThrow().replace("\"", "");
    }

    private static List<String> valores(String json, String campo) {
        Matcher m = Pattern.compile("\"" + campo + "\":\"?([^\",}]*)\"?").matcher(json);
        List<String> out = new ArrayList<>();
        while (m.find()) out.add(m.group(1));
        return out;
    }

    @Test
    void apuracaoDoExemploDoMockDoCalculoAoEncerramento() throws Exception {
        // Histórico: prévia e confirmação; o mesmo arquivo não carrega duas vezes.
        HttpResponse<String> previa = carga("s12-hist-0001", arquivoDoHistorico(), false);
        assertThat(previa.statusCode()).as(previa.body()).isEqualTo(200);
        assertThat(previa.body()).contains("\"confirmed\":false", "\"months\":12");
        assertThat(conta("select count(*) from tax_revenue_history")).isZero();
        HttpResponse<String> carregada = carga("s12-hist-0002", arquivoDoHistorico(), true);
        assertThat(carregada.statusCode()).as(carregada.body()).isEqualTo(201);
        assertThat(conta("select count(*) from tax_revenue_history")).isEqualTo(12);
        assertThat(carga("s12-hist-0003", arquivoDoHistorico(), true).body()).contains("\"alreadyLoaded\":true");

        // Classificação: a peça é revenda (Anexo I); o serviço fica sem classificação (anexo padrão III).
        HttpResponse<String> cls = classifica(peca, "0", """
                {"ncm":"9031.80.99","cfopInternal":"5.102","cfopInterstate":"6.102","csosn":"102","origin":"0","annex":"I"}
                """);
        assertThat(cls.statusCode()).as(cls.body()).isEqualTo(200);
        assertThat(cls.body()).contains("\"ncm\":\"90318099\"", "\"cfopInternal\":\"5102\"", "\"status\":\"CLASSIFICADO\"", "\"version\":\"1\"");

        // Notas de C: produto (equipamento + peça) e serviço.
        String pedido = pedidoRecebido();
        HttpResponse<String> nfe = nota("s12-doc-0001", pedido, "PRODUTO", "4880");
        assertThat(nfe.statusCode()).as(nfe.body()).isEqualTo(201);
        assertThat(nfe.body()).contains("\"annex\":\"II\",\"annexSource\":\"EQUIPAMENTO\"", "\"annex\":\"I\",\"annexSource\":\"CLASSIFICACAO\"");
        HttpResponse<String> nfse = nota("s12-doc-0002", pedido, "SERVICO", "518");
        assertThat(nfse.statusCode()).as(nfse.body()).isEqualTo(201);
        assertThat(nfse.body()).contains("\"annex\":\"III\",\"annexSource\":\"PADRAO\"", "\"authorization\":\"AUTORIZADA\"");
        // A NFS-e ainda aguarda autorização.
        HttpResponse<String> pend = withVersion("PUT", "/api/v1/documents/" + campo(nfse.body(), "id") + "/authorization",
                campo(nfse.body(), "version"),
                "{\"status\":\"PENDENTE\"}");
        assertThat(pend.statusCode()).as(pend.body()).isEqualTo(200);
        assertThat(pend.body()).contains("\"authorization\":\"PENDENTE\"");

        // Ficha: receita por anexo, RBT12 do histórico, prévia do cálculo, etapas pendentes e alertas.
        HttpResponse<String> ficha = get("/api/v1/tax-periods/" + C);
        assertThat(ficha.statusCode()).as(ficha.body()).isEqualTo(200);
        assertThat(ficha.body()).contains("\"revenueCents\":\"38640000\"", "\"revenueByAnnex\":{\"I\":\"1184000\",\"II\":\"26550000\",\"III\":\"10906000\"}",
                "\"usedCents\":\"334000000\",\"usedOrigin\":\"CALCULADO\"", "\"source\":\"PREVIA\"", "\"totalTaxCents\":\"5241579\"",
                "\"code\":\"NOTAS_AUTORIZADAS\"", "Pendentes de autorização", "ainda aguarda autorização",
                "linha de nota com item sem classificação fiscal", "\"dasDueDate\":\"" + C.plusMonths(1).atDay(20) + "\"");

        // Calcular: R$ 52.415,79 por anexo e por tributo, com o ISS limitado; a mesma chave não repete.
        HttpResponse<String> calc = post("/api/v1/tax-periods/" + C + "/simulations", "s12-calc-0001", null);
        assertThat(calc.statusCode()).as(calc.body()).isEqualTo(201);
        assertThat(calc.body()).contains("\"source\":\"GRAVADO\",\"seq\":1,\"result\":\"CALCULADA\",\"parameterRevision\":2",
                "\"totalTaxCents\":\"5241579\"", "\"annex\":\"I\",\"label\":\"Anexo I — Comércio\"", "\"bracket\":5",
                "\"taxCents\":\"138365\"", "\"taxCents\":\"3223202\"", "\"taxCents\":\"1880012\"", "\"issExcessCents\":\"84504\"",
                "\"ISS\":\"545300\"", "\"CPP\":\"2137889\"", "ISS limitado a 5%");
        assertThat(post("/api/v1/tax-periods/" + C + "/simulations", "s12-calc-0001", null).statusCode()).isEqualTo(201);
        assertThat(conta("select count(*) from tax_simulation")).isEqualTo(1);
        assertThat(jdbc.sql("select product_tax_cents + service_tax_cents from tax_simulation").query(Long.class).single()).isEqualTo(5_241_579L);

        // RBT12 mês a mês: a linha de C com o RBT12 de R$ 3.340.000,00 na 5ª faixa.
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("{\"competence\":\"" + C + "\",\"revenueCents\":\"38640000\",\"rbt12Cents\":\"334000000\",\"bracket\":5");

        // Painel da competência.
        HttpResponse<String> painel = get("/api/v1/fiscal/dashboard?competence=" + C);
        assertThat(painel.statusCode()).as(painel.body()).isEqualTo(200);
        assertThat(painel.body()).contains("\"dasCents\":\"5241579\"", "\"rbt12Cents\":\"334000000\"", "\"bracket\":5", "\"stepsTotal\":7",
                "\"ISS\":\"545300\"");

        // Transmitir o PGDAS-D: data futura recusada; registrada, a etapa conclui e a obrigação PGDAS-D fica Entregue.
        String v = versao(C.toString());
        assertThat(withVersion("POST", "/api/v1/tax-periods/" + C + "/declarations", v,
                "{\"transmittedOn\":\"" + HOJE.plusDays(1) + "\"}").body()).contains("\"field\":\"transmittedOn\"", "\"field\":\"receiptNumber\"");
        HttpResponse<String> pgdas = withVersion("POST", "/api/v1/tax-periods/" + C + "/declarations", v,
                "{\"transmittedOn\":\"" + HOJE + "\",\"receiptNumber\":\"07.18.26.0941-3\"}");
        assertThat(pgdas.statusCode()).as(pgdas.body()).isEqualTo(201);
        assertThat(pgdas.body()).contains("\"receiptNumber\":\"07.18.26.0941-3\",\"declaredRevenueCents\":\"38640000\"",
                "{\"code\":\"PGDAS_TRANSMITIDO\",\"name\":\"Transmitir o PGDAS-D\",\"responsible\":\"Fiscal\",\"automatic\":true,\"done\":true");
        String obrig = get("/api/v1/tax-obligations").body();
        assertThat(obrig).containsPattern("\"templateCode\":\"PGDAS_D\",\"name\":\"PGDAS-D\",\"competence\":\"" + C
                + "\"[^}]*\"status\":\"ENTREGUE\"[^}]*\"receiptNumber\":\"07.18.26.0941-3\"");

        // Gerar DAS: título a pagar do total; diferença guia − cálculo; o DAS da competência fica Aberto.
        v = versao(C.toString());
        HttpResponse<String> guia = withVersion("POST", "/api/v1/tax-periods/" + C + "/das-guides", v,
                "{\"documentNumber\":\"07.18.26.0941-3\",\"dueDate\":\"" + C.plusMonths(1).atDay(20) + "\",\"principalCents\":\"5241580\"}");
        assertThat(guia.statusCode()).as(guia.body()).isEqualTo(201);
        assertThat(guia.body()).contains("\"totalCents\":\"5241580\"", "\"status\":\"ABERTO\"", "\"differenceCents\":\"1\"");
        String das = campo(guia.body(), "titleId");
        assertThat(get("/api/v1/tax-obligations").body()).containsPattern("\"templateCode\":\"DAS\"[^}]*\"competence\":\"" + C
                + "\"[^}]*\"status\":\"ABERTO\"");

        // Pagar pela conta: a guia e a obrigação DAS ficam Pagas.
        HttpResponse<String> pago = post("/api/v1/settlements", "s12-pg-0001", """
                {"direction":"PAYABLE","accountId":"%s","effectiveDate":"%s","amountCents":"5241580","currency":"BRL",
                 "allocations":[{"titleId":"%s","amountCents":"5241580"}]}
                """.formatted(caixa, HOJE, das));
        assertThat(pago.statusCode()).as(pago.body()).isEqualTo(201);
        String depois = get("/api/v1/tax-periods/" + C).body();
        assertThat(depois).contains("\"status\":\"PAGO\",\"paidOn\":\"" + HOJE + "\"", "{\"code\":\"DAS_PAGO\"");
        assertThat(get("/api/v1/tax-obligations").body()).containsPattern("\"templateCode\":\"DAS\"[^}]*\"competence\":\"" + C
                + "\"[^}]*\"status\":\"PAGO\"");

        // Encerrar exige as 7 etapas: faltam a autorização, a classificação e as manuais.
        v = versao(C.toString());
        HttpResponse<String> cedo = withVersion("POST", "/api/v1/tax-periods/" + C + "/closures", v, null);
        assertThat(cedo.statusCode()).isEqualTo(422);
        assertThat(cedo.body()).contains("TAX_PERIOD_INVALID", "Autorizar as notas pendentes", "Segregar a receita por anexo",
                "Conferir notas de saída da competência");
        // Etapa automática não se marca à mão.
        assertThat(withVersion("PUT", "/api/v1/tax-periods/" + C + "/closing-steps/PGDAS_TRANSMITIDO", v, "{\"done\":true}").body())
                .contains("se conclui sozinha");
        for (String etapa : List.of("NOTAS_CONFERIDAS", "CANCELAMENTOS_CONFERIDOS", "RBT12_CONFERIDO")) {
            HttpResponse<String> e = withVersion("PUT", "/api/v1/tax-periods/" + C + "/closing-steps/" + etapa, versao(C.toString()),
                    "{\"done\":true}");
            assertThat(e.statusCode()).as(e.body()).isEqualTo(200);
        }
        // Autoriza a NFS-e (com protocolo) e classifica o serviço: a linha da nota com o anexo padrão passa à classificação.
        assertThat(withVersion("PUT", "/api/v1/documents/" + campo(nfse.body(), "id") + "/authorization", campo(pend.body(), "version"),
                "{\"status\":\"AUTORIZADA\",\"protocol\":\"NFSE-000518\"}").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("{\"code\":\"NOTAS_AUTORIZADAS\",\"name\":\"Autorizar as notas pendentes\",\"responsible\":\"Faturamento\",\"automatic\":true,\"done\":true");
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("1 linha de nota com item sem classificação fiscal (anexo padrão).");
        HttpResponse<String> clsServico = classifica(servico, "0", """
                {"serviceCode":"14.06","issRetention":"NAO","annex":"III","nbs":"1.2001.10.00"}
                """);
        assertThat(clsServico.statusCode()).as(clsServico.body()).isEqualTo(200);
        assertThat(get("/api/v1/documents/" + campo(nfse.body(), "id")).body()).contains("\"annex\":\"III\",\"annexSource\":\"CLASSIFICACAO\"");
        assertThat(get("/api/v1/fiscal-classification/" + servico + "/history").body()).contains("1 linha de nota no Anexo III");
        HttpResponse<String> fecha = withVersion("POST", "/api/v1/tax-periods/" + C + "/closures", versao(C.toString()), null);
        assertThat(fecha.statusCode()).as(fecha.body()).isEqualTo(200);
        assertThat(fecha.body()).contains("\"status\":\"ENCERRADA\"", "\"action\":\"FECHAMENTO\",\"reason\":null,\"revenueCents\":\"38640000\"");

        // Encerrada: a nota da competência é recusada; reabrir exige motivo.
        assertThat(withVersion("POST", "/api/v1/documents/" + campo(nfe.body(), "id") + "/cancellations", campo(nfe.body(), "version"),
                "{\"reason\":\"Nota errada\"}").body()).contains("TAX_PERIOD_CLOSED", "encerrada");
        assertThat(post("/api/v1/tax-periods/" + C + "/simulations", "s12-calc-0002", null).body()).contains("TAX_PERIOD_CLOSED");
        HttpResponse<String> reabre = withVersion("POST", "/api/v1/tax-periods/" + C + "/reopenings", versao(C.toString()),
                "{\"reason\":\"Retificação do PGDAS-D\"}");
        assertThat(reabre.statusCode()).as(reabre.body()).isEqualTo(200);
        assertThat(reabre.body()).contains("\"status\":\"EM_APURACAO\"", "\"action\":\"REABERTURA\"");

        // Histórico de competências: C com o cálculo gravado e a guia paga; trilha e eventos.
        String lista = get("/api/v1/tax-periods?year=" + C.getYear()).body();
        assertThat(lista).contains("{\"competence\":\"" + C + "\",\"status\":\"EM_APURACAO\"", "\"calculatedCents\":\"5241579\",\"calculationStored\":true");
        assertThat(get("/api/v1/tax-periods/" + C + "/history").body()).contains("TAX_SIMULATION_RECORDED", "TAX_DECLARATION_RECORDED",
                "TAX_DAS_GUIDE_ISSUED", "TAX_CLOSING_STEP_COMPLETED", "TAX_PERIOD_CLOSED", "TAX_PERIOD_REOPENED");
        for (String ev : List.of("TaxSimulationRecorded", "TaxDeclarationRecorded", "TaxDasGuideIssued", "TaxPeriodClosed", "TaxPeriodReopened",
                "TaxRevenueHistoryRecorded", "ItemFiscalProfileUpdated", "DocumentAuthorizationRecorded")) {
            assertThat(conta("select count(*) from outbox_event where event_type = '" + ev + "'")).as(ev).isPositive();
        }
    }

    @Test
    void historicoDeReceitaComPreviaProblemasEDigitado() throws Exception {
        String ruim = """
                {"historicoReceita":[
                  {"competencia":"%s","anexoI":"100.00","anexoII":"200.00","anexoIII":"0","total":"300.00"},
                  {"competencia":"%s","anexoI":"100.00","total":"300.00"},
                  {"competencia":"2025-13","anexoI":"1"},
                  {"competencia":"%s","anexoI":"1"},
                  {"competencia":"%s","anexoI":"5"},
                  {"competencia":"%s","anexoI":"-1"}]}
                """.formatted(C.minusMonths(1), C.minusMonths(2), C, C.minusMonths(1), C.minusMonths(4));
        HttpResponse<String> p = carga("s12-hist-0010", ruim, false);
        assertThat(p.statusCode()).as(p.body()).isEqualTo(200);
        assertThat(p.body()).contains("\"months\":1", "não bate com a soma", "Competência inválida", "a receita vem das notas",
                "Competência repetida", "Receita negativa");
        assertThat(carga("s12-hist-0011", "isto não é json", false).body()).contains("não é um JSON válido");
        // Confirmar carrega só as linhas sem problema.
        assertThat(carga("s12-hist-0012", ruim, true).body()).contains("\"confirmed\":true", "\"months\":1");
        assertThat(conta("select count(*) from tax_revenue_history")).isEqualTo(1);

        // Digitado: If-Match 0 para mês novo; mês a partir do início da receita recusado.
        String m = C.minusMonths(3).toString();
        assertThat(withVersion("PUT", "/api/v1/tax-revenue-history/" + C, "0", "{\"annexIICents\":\"100\",\"informedBy\":\"Contador\"}")
                .body()).contains("\"field\":\"competence\"");
        HttpResponse<String> h = withVersion("PUT", "/api/v1/tax-revenue-history/" + m, "0",
                "{\"annexICents\":\"1000000\",\"annexIIICents\":\"500000\",\"informedBy\":\"Escritório contábil\"}");
        assertThat(h.statusCode()).as(h.body()).isEqualTo(200);
        assertThat(h.body()).contains("\"totalCents\":\"1500000\"", "\"source\":\"DIGITADO\"", "\"version\":\"1\"");
        assertThat(withVersion("PUT", "/api/v1/tax-revenue-history/" + m, "0",
                "{\"annexICents\":\"1\",\"informedBy\":\"x\"}").statusCode()).isEqualTo(412);
        assertThat(get("/api/v1/tax-revenue-history").body()).contains("\"competence\":\"" + m + "\"");
        // Sem os 12 meses, o cálculo é "não calculável" com os meses que faltam.
        HttpResponse<String> calc = post("/api/v1/tax-periods/" + C + "/simulations", "s12-calc-0010", null);
        assertThat(calc.body()).contains("\"result\":\"NAO_CALCULAVEL\"", "RBT12 desconhecido");
    }

    @Test
    void classificacaoFiscalComValidacaoESituacao() throws Exception {
        String lista = get("/api/v1/fiscal-classification").body();
        assertThat(lista).contains("\"code\":\"" + campo(get("/api/v1/items/" + peca).body(), "code") + "\"", "\"status\":\"SEM_CLASSIFICACAO\"",
                "NCM ausente.", "Item da LC 116 ausente.");
        HttpResponse<String> erros = classifica(peca, "0", """
                {"cfopInternal":"9999","csosn":"999","origin":"9","annex":"VI","nbs":"1.2001.10.00","issRetention":"SIM"}
                """);
        assertThat(erros.statusCode()).isEqualTo(422);
        assertThat(erros.body()).contains("\"field\":\"cfopInternal\"", "\"field\":\"csosn\"", "\"field\":\"origin\"", "\"field\":\"annex\"",
                "\"field\":\"nbs\"", "\"field\":\"issRetention\"");
        // Serviço sem NBS: Revisar; com NBS: Classificado. A atividade dá o anexo.
        String atividade = valores(get("/api/v1/tax-setup").body(), "id").stream().filter(x -> x.length() == 36).findFirst().orElseThrow();
        HttpResponse<String> s1 = classifica(servico, "0", """
                {"serviceCode":"14.06","issRetention":"CONFORME_MUNICIPIO","annex":"III"}
                """);
        assertThat(s1.statusCode()).as(s1.body()).isEqualTo(200);
        assertThat(s1.body()).contains("\"serviceCode\":\"14.06\"", "\"status\":\"REVISAR\"", "NBS ausente");
        HttpResponse<String> s2 = classifica(servico, "1", """
                {"serviceCode":"14.06","issRetention":"NAO","annex":"III","nbs":"1.2001.10.00"}
                """);
        assertThat(s2.body()).contains("\"status\":\"CLASSIFICADO\"", "\"version\":\"2\"");
        assertThat(classifica(servico, "1", "{}").statusCode()).isEqualTo(412);
        HttpResponse<String> marcado = classifica(peca, "0", """
                {"ncm":"84239000","cfopInternal":"5102","cfopInterstate":"6102","csosn":"102","origin":"0","activityId":"%s",
                 "review":true,"reviewNote":"Avaliar a posição 8423.90 com a contabilidade."}
                """.formatted(atividade));
        assertThat(marcado.statusCode()).as(marcado.body()).isEqualTo(200);
        assertThat(marcado.body()).contains("\"status\":\"REVISAR\"", "\"annex\":\"II\"", "Avaliar a posição 8423.90");
        assertThat(get("/api/v1/tax-setup").body()).contains("\"items\":1");
        assertThat(get("/api/v1/fiscal-classification/" + peca + "/history").body()).contains("ITEM_FISCAL_PROFILE_UPDATED");
        assertThat(get("/api/v1/items/" + peca + "/history").body()).contains("ITEM_UPDATED");
    }

    @Test
    void obrigacoesRecorrentesEntregaAvulsaEAgenda() throws Exception {
        String lista = get("/api/v1/tax-obligations").body();
        // Uma de cada modelo mensal para a competência C (início da receita) e o mês corrente, a DEFIS do ano, e a opção IBS/CBS.
        assertThat(conta("select count(*) from tax_obligation where competence = '" + C + "'")).isEqualTo(7);
        assertThat(conta("select count(*) from tax_obligation where competence = '" + ATUAL + "'")).isEqualTo(7);
        assertThat(lista).contains("\"name\":\"DeSTDA\"", "\"name\":\"DEFIS\"", "Opção por IBS e CBS");
        get("/api/v1/tax-obligations");
        assertThat(conta("select count(*) from tax_obligation where competence = '" + C + "'")).isEqualTo(7);

        String destda = jdbc.sql("""
                select o.id::text from tax_obligation o join tax_obligation_template t on t.id = o.template_id
                 where t.code = 'DESTDA' and o.competence = :c
                """).param("c", C.toString()).query(String.class).single();
        assertThat(withVersion("POST", "/api/v1/tax-obligations/" + destda + "/deliveries", "1",
                "{\"deliveredOn\":\"" + HOJE.plusDays(1) + "\"}").body()).contains("\"field\":\"deliveredOn\"");
        HttpResponse<String> entregue = withVersion("POST", "/api/v1/tax-obligations/" + destda + "/deliveries", "1",
                "{\"receiptNumber\":\"DESTDA-123\"}");
        assertThat(entregue.statusCode()).as(entregue.body()).isEqualTo(200);
        assertThat(entregue.body()).contains("\"status\":\"ENTREGUE\"", "\"receiptNumber\":\"DESTDA-123\"", "\"deliveredOn\":\"" + HOJE + "\"");

        String pgdas = jdbc.sql("""
                select o.id::text from tax_obligation o join tax_obligation_template t on t.id = o.template_id
                 where t.code = 'PGDAS_D' and o.competence = :c
                """).param("c", C.toString()).query(String.class).single();
        assertThat(withVersion("POST", "/api/v1/tax-obligations/" + pgdas + "/deliveries", "1", "{}").body())
                .contains("TAX_OBLIGATION_LINKED", "Apuração do Simples");

        HttpResponse<String> nova = post("/api/v1/tax-obligations", "s12-ob-0001", """
                {"name":"Licença ambiental — renovação","competence":"%s","dueDate":"%s","sphere":"MUNICIPAL","responsible":"Diretoria"}
                """.formatted(ATUAL.getYear(), HOJE.plusDays(3)));
        assertThat(nova.statusCode()).as(nova.body()).isEqualTo(201);
        assertThat(nova.body()).contains("\"status\":\"A_ENTREGAR\"", "\"dueThisWeek\":true", "\"daysToDue\":3", "\"code\":\"OB");
        assertThat(post("/api/v1/tax-obligations", "s12-ob-0002", "{}").body()).contains("\"field\":\"name\"", "\"field\":\"dueDate\"",
                "\"field\":\"sphere\"");
        HttpResponse<String> muda = withVersion("PUT", "/api/v1/tax-obligations/" + campo(nova.body(), "id"), "1",
                "{\"status\":\"EM_PREPARACAO\",\"responsible\":\"Contabilidade\"}");
        assertThat(muda.body()).contains("\"status\":\"EM_PREPARACAO\"", "\"responsible\":\"Contabilidade\"");

        HttpResponse<String> ics = get("/api/v1/tax-obligations/calendar.ics");
        assertThat(ics.statusCode()).isEqualTo(200);
        assertThat(ics.headers().firstValue("Content-Type").orElseThrow()).startsWith("text/calendar");
        assertThat(ics.body()).contains("BEGIN:VCALENDAR", "SUMMARY:Licença ambiental — renovação", "END:VCALENDAR")
                .doesNotContain("DESTDA-123");

        // Opção IBS/CBS: registrada, a obrigação do prazo fica Entregue.
        HttpResponse<String> opcao = post("/api/v1/tax-ibs-cbs-options", "s12-ibs-0001", "{\"choice\":\"FORA_DAS\"}");
        assertThat(opcao.statusCode()).as(opcao.body()).isEqualTo(201);
        assertThat(opcao.body()).contains("\"choice\":\"FORA_DAS\"", "\"deadline\":\"2026-09-30\"", "\"withdrawalUntil\":\"2026-11-30\"");
        assertThat(get("/api/v1/tax-obligations").body()).containsPattern("Opção por IBS e CBS[^}]*\"status\":\"ENTREGUE\"");
    }

    @Test
    void parametrosPorAnexoDadosDaEmpresaEAtividades() throws Exception {
        String params = get("/api/v1/tax-parameters").body();
        assertThat(params).contains("\"revision\":2", "\"annex\":\"V\"", "\"taxes\":[\"IRPJ\",\"CSLL\",\"COFINS\",\"PIS/Pasep\",\"CPP\",\"ISS\"]",
                "\"revision\":1");
        // Revisão 2 semeada: 30 faixas (5 anexos) e 18 linhas de repartição (anexos I, II e III), cada uma somando 100%.
        assertThat(conta("""
                select count(*) from tax_parameter_revision r, jsonb_each(r.annexes) a, jsonb_array_elements(a.value -> 'brackets') b
                 where r.revision = 2""")).isEqualTo(30);
        assertThat(conta("""
                select count(*) from tax_parameter_revision r, jsonb_each(r.annexes) a, jsonb_array_elements(a.value -> 'brackets') b
                 where r.revision = 2 and jsonb_array_length(b -> 'shares') > 0
                   and (select sum(x::text::numeric) from jsonb_array_elements_text(b -> 'shares') x) = 1""")).isEqualTo(18);

        HttpResponse<String> invalida = post("/api/v1/tax-parameters", "s12-par-0001", """
                {"validFrom":"2027-13","source":"","annexes":{"II":{"taxes":["IRPJ","CPP"],"brackets":[
                  {"upToCents":"100","rate":"0.05","deductionCents":"0","shares":["0.5","0.4"]},
                  {"upToCents":"50","rate":"1.5","deductionCents":"-1","shares":["0.5","0.5"]}]},"VI":{"taxes":[],"brackets":[]}}}
                """);
        assertThat(invalida.statusCode()).isEqualTo(422);
        assertThat(invalida.body()).contains("TAX_PARAMETER_INVALID", "\"field\":\"validFrom\"", "\"field\":\"source\"",
                "\"field\":\"annexes.VI\"", "\"field\":\"annexes.II.brackets[0].shares\"", "\"field\":\"annexes.II.brackets[1].upToCents\"",
                "\"field\":\"annexes.II.brackets[1].rate\"", "\"field\":\"annexes.II.brackets[1].deductionCents\"");
        String revisao3 = """
                {"validFrom":"%s","source":"Contador","annexes":{"II":{"taxes":["IRPJ","CPP"],"brackets":[
                  {"upToCents":"480000000","rate":"0.08","deductionCents":"0","shares":["0.4","0.6"]}]}}}
                """.formatted(ATUAL.plusMonths(1));
        HttpResponse<String> ok = post("/api/v1/tax-parameters", "s12-par-0002", revisao3);
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(201);
        assertThat(campo(post("/api/v1/tax-parameters", "s12-par-0002", revisao3).body(), "id")).isEqualTo(campo(ok.body(), "id"));
        assertThat(get("/api/v1/tax-periods/" + C).body()).contains("\"revision\":2");
        assertThat(get("/api/v1/tax-periods/" + ATUAL.plusMonths(1)).body()).contains("\"revision\":3");

        // Dados da empresa e limites.
        HttpResponse<String> setup = get("/api/v1/tax-setup");
        assertThat(setup.body()).contains("\"cnaeMain\":\"2829-1/99", "\"annualLimitCents\":\"480000000\"", "\"sublimitCents\":\"360000000\"",
                "\"tolerance\":\"0.2\"", "\"alertThreshold\":\"0.9\"", "\"name\":\"Revenda de peças de reposição e acessórios\"",
                "\"revenueStart\":\"" + C + "\"");
        assertThat(withVersion("PUT", "/api/v1/tax-setup/profile", "1", """
                {"annualLimitCents":"480000000","sublimitCents":"500000000","tolerance":"2","alertThreshold":"0"}
                """).body()).contains("\"field\":\"sublimitCents\"", "\"field\":\"tolerance\"", "\"field\":\"alertThreshold\"");
        HttpResponse<String> perfil = withVersion("PUT", "/api/v1/tax-setup/profile", "1", """
                {"optedSince":"2019-01-01","cnaeMain":"2829-1/99 — Outras máquinas","annualLimitCents":"480000000",
                 "sublimitCents":"360000000","tolerance":"0.2","alertThreshold":"0.8"}
                """);
        assertThat(perfil.statusCode()).as(perfil.body()).isEqualTo(200);
        assertThat(perfil.body()).contains("\"optedSince\":\"2019-01-01\"", "\"alertThreshold\":\"0.8\"", "\"version\":\"2\"");
        HttpResponse<String> atv = post("/api/v1/tax-activities", "s12-atv-0001",
                "{\"name\":\"Locação de balanças\",\"framing\":\"LC 116, item 3.04\",\"annex\":\"III\",\"taxes\":\"IRPJ, CSLL, COFINS, PIS, CPP, ISS\"}");
        assertThat(atv.statusCode()).as(atv.body()).isEqualTo(201);
        assertThat(atv.body()).contains("\"name\":\"Locação de balanças\",\"framing\":\"LC 116, item 3.04\",\"annex\":\"III\"");
        assertThat(get("/api/v1/tax-setup/history").body()).contains("TAX_PROFILE_UPDATED");
    }

    @Test
    void perfilConsultaVeMasNaoAltera() throws Exception {
        String consulta = login(CONSULTA, Profile.CONSULTA);
        for (String path : List.of("/api/v1/tax-periods", "/api/v1/tax-periods/" + C, "/api/v1/tax-parameters", "/api/v1/fiscal/dashboard",
                "/api/v1/tax-obligations", "/api/v1/fiscal-classification", "/api/v1/tax-setup", "/api/v1/tax-revenue-history")) {
            assertThat(call("GET", path, consulta, null, Map.of()).statusCode()).as(path).isEqualTo(200);
        }
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/simulations", consulta, null, Map.of("Idempotency-Key", "s12-cons-1")).body())
                .contains("tax_period.simulate");
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/declarations", consulta, "{}", Map.of("If-Match", "\"0\"")).body())
                .contains("tax_period.declare");
        assertThat(call("POST", "/api/v1/tax-periods/" + C + "/das-guides", consulta, "{}", Map.of("If-Match", "\"0\"")).body())
                .contains("tax_das.issue");
        assertThat(call("PUT", "/api/v1/tax-periods/" + C + "/closing-steps/NOTAS_CONFERIDAS", consulta, "{}", Map.of("If-Match", "\"0\"")).body())
                .contains("tax_period.close_step");
        assertThat(call("PUT", "/api/v1/fiscal-classification/" + peca, consulta, "{}", Map.of("If-Match", "\"0\"")).body())
                .contains("tax_classification.update");
        assertThat(call("POST", "/api/v1/tax-obligations", consulta, "{}", Map.of("Idempotency-Key", "s12-cons-2")).body())
                .contains("tax_obligation.update");
        assertThat(call("PUT", "/api/v1/tax-setup/profile", consulta, "{}", Map.of("If-Match", "\"1\"")).body())
                .contains("tax_profile.admin");
        assertThat(call("POST", "/api/v1/tax-parameters", consulta, "{}", Map.of("Idempotency-Key", "s12-cons-3")).body())
                .contains("tax_parameter.admin");
        assertThat(conta("select count(*) from tax_period")).isZero();
    }
}
