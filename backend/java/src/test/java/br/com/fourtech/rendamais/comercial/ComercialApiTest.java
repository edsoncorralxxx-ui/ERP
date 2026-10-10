package br.com.fourtech.rendamais.comercial;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Sprint 4 contra PostgreSQL real: proposta → pedido → confirmação (projeto, equipamentos, títulos) → cancelamento. */
class ComercialApiTest extends CadastrosApiTest {

    private String cliente;
    private String matriz;
    private String outroCliente;
    private String unidadeDoOutro;
    private String material;
    private String servico;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", "s4-cli-00001", """
                {"legalName":"Fecularia Vale do Paranapanema Ltda.","units":[{"name":"Matriz","city":"Cândido Mota","state":"SP"},
                 {"name":"Filial Assis","city":"Assis","state":"SP"}]}
                """);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        cliente = campo(c.body(), "id");
        matriz = ids(c.body(), "units").get(0);
        HttpResponse<String> o = post("/api/v1/customers", "s4-cli-00002", "{\"legalName\":\"Amido Sul S.A.\",\"units\":[{\"name\":\"Fábrica\"}]}");
        outroCliente = campo(o.body(), "id");
        unidadeDoOutro = ids(o.body(), "units").get(0);
        String cat = categoria("Perfis");
        material = campo(post("/api/v1/items", "s4-item-0001", """
                {"description":"Perfil L 40x40","nature":"MATERIAL","uom":"M","categoryId":"%s","stockControlled":true}
                """.formatted(cat)).body(), "id");
        servico = campo(post("/api/v1/items", "s4-item-0002", """
                {"description":"Instalação em campo","nature":"SERVICO","uom":"H","categoryId":"%s","stockControlled":false}
                """.formatted(cat)).body(), "id");
    }

    /** Linhas: 2 balanças (R$ 150.000,00 cada), 10,5 m de perfil a R$ 16,33 e 8 h de instalação a R$ 250,00 com R$ 100,00 de desconto. */
    private String linhas() {
        return """
                [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"2","unitPrice":"150000","discountCents":"0"},
                 {"kind":"MATERIAL","itemId":"%s","quantity":"10.5","unitPrice":"16.33","discountCents":"0"},
                 {"kind":"SERVICO","itemId":"%s","description":"Instalação e partida","quantity":"8","unitPrice":"250","discountCents":"10000"}]
                """.formatted(material, servico);
    }

    // 2 × 150.000,00 + round(10,5 × 16,33 = 171,465 → 171,46 meio-par) + 8 × 250,00 − 100,00 = 302.071,46
    private static final String TOTAL = "30207146";

    private String pedido(String parcelas) {
        return """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-10-01","promisedDate":"2027-01-30","lines":%s,"installments":%s}
                """.formatted(cliente, matriz, linhas(), parcelas);
    }

    /** 30% no pedido, 40% no embarque, 30% no aceite: 9.062.144 + 12.082.858 + 9.062.144 = 30.207.146. */
    private static final String PARCELAS = """
            [{"dueDate":"2026-10-10","amountCents":"9062144","milestone":"Sinal"},
             {"dueDate":"2026-12-10","amountCents":"12082858","milestone":"Embarque"},
             {"dueDate":"2027-01-30","amountCents":"9062144","milestone":"Aceite"}]
            """;

    @Test
    void propostaComRevisoesPreservadasViraPedidoUmaVez() throws Exception {
        HttpResponse<String> r = post("/api/v1/proposals", "s4-prop-0001", """
                {"customerId":"%s","unitId":"%s","title":"Linha de dosagem","validUntil":"2026-11-30","paymentTerms":"30/40/30",
                 "lines":%s}
                """.formatted(cliente, matriz, linhas()));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        assertThat(campo(r.body(), "code")).matches("PRO-\\d{6}");
        assertThat(r.body()).contains("\"status\":\"RASCUNHO\"", "\"totalCents\":\"" + TOTAL + "\"", "\"grossCents\":\"17146\"",
                "\"uom\":\"M\"", "\"description\":\"Perfil L 40x40\"");
        assertThat(post("/api/v1/proposals", "s4-prop-0001", "{}").statusCode()).isEqualTo(422);

        HttpResponse<String> alterada = withVersion("PUT", "/api/v1/proposals/" + id, "1", """
                {"customerId":"%s","unitId":"%s","title":"Linha de dosagem — ampliada","validUntil":"2026-12-15","lines":%s}
                """.formatted(cliente, matriz, linhas()));
        assertThat(alterada.statusCode()).as(alterada.body()).isEqualTo(200);
        assertThat(withVersion("POST", "/api/v1/proposals/" + id + "/issue", "2", null).body()).contains("\"status\":\"EMITIDA\"");
        HttpResponse<String> emitida = withVersion("PUT", "/api/v1/proposals/" + id, "3", """
                {"customerId":"%s","title":"X","validUntil":"2026-12-15","lines":%s}
                """.formatted(cliente, linhas()));
        assertThat(emitida.statusCode()).isEqualTo(409);
        assertThat(emitida.body()).contains("INVALID_STATE_TRANSITION", "Crie uma nova revisão");

        HttpResponse<String> rev2 = withVersion("POST", "/api/v1/proposals/" + id + "/revisions", "3", null);
        assertThat(rev2.body()).contains("\"currentRevision\":2", "\"revision\":1,\"status\":\"EMITIDA\"", "\"revision\":2,\"status\":\"RASCUNHO\"");
        withVersion("PUT", "/api/v1/proposals/" + id, "4", """
                {"customerId":"%s","unitId":"%s","title":"Linha de dosagem — ampliada","validUntil":"2026-12-20","lines":
                 [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"150000"}]}
                """.formatted(cliente, matriz));
        HttpResponse<String> emitida2 = withVersion("POST", "/api/v1/proposals/" + id + "/issue", "5", null);
        // A revisão 1 continua como foi emitida.
        assertThat(emitida2.body()).contains("\"totalCents\":\"" + TOTAL + "\"", "\"totalCents\":\"15000000\"");

        HttpResponse<String> convertido = post("/api/v1/proposals/" + id + "/orders", "s4-conv-0001", "{\"contractDate\":\"2026-10-05\"}");
        assertThat(convertido.statusCode()).as(convertido.body()).isEqualTo(201);
        String pedido = campo(convertido.body(), "id");
        assertThat(campo(convertido.body(), "code")).matches("PV-\\d{6}");
        assertThat(convertido.body()).contains("\"status\":\"DRAFT\"", "\"proposalRevision\":2", "\"totalCents\":\"15000000\"",
                "\"unitName\":\"Matriz\"");
        assertThat(get("/api/v1/proposals/" + id).body()).contains("\"status\":\"GANHA\"");
        assertThat(post("/api/v1/proposals/" + id + "/orders", "s4-conv-0001", "{\"contractDate\":\"2026-10-05\"}").body()).contains(pedido);
        assertThat(post("/api/v1/proposals/" + id + "/orders", "s4-conv-0002", "{}").body()).contains(pedido);
        assertThat(conta("select count(*) from sales_order")).isEqualTo(1);
        assertThat(get("/api/v1/proposals/" + id + "/history").body())
                .contains("PROPOSAL_DRAFTED", "PROPOSAL_UPDATED", "PROPOSAL_REVISION_ISSUED", "PROPOSAL_REVISION_CREATED", "PROPOSAL_WON");
        assertThat(jdbc.sql("select event_type from outbox_event where aggregate_type = 'proposal' order by occurred_at")
                .query(String.class).list()).contains("ProposalRevisionIssued", "ProposalOutcomeRecorded");
    }

    @Test
    void propostaPerdidaComMotivoNaoMudaMais() throws Exception {
        String id = campo(post("/api/v1/proposals", "s4-perd-0001", """
                {"customerId":"%s","title":"Retrofit","validUntil":"2026-11-30","lines":%s}
                """.formatted(cliente, linhas())).body(), "id");
        assertThat(withVersion("POST", "/api/v1/proposals/" + id + "/outcome", "1", "{\"outcome\":\"PERDIDA\"}").body())
                .contains("\"field\":\"reason\"");
        assertThat(withVersion("POST", "/api/v1/proposals/" + id + "/outcome", "1", "{\"outcome\":\"PERDIDA\",\"reason\":\"Preço\"}").body())
                .contains("\"status\":\"PERDIDA\"", "\"outcomeReason\":\"Preço\"");
        assertThat(post("/api/v1/proposals/" + id + "/orders", "s4-perd-0002", "{\"unitId\":\"" + matriz + "\"}").statusCode()).isEqualTo(409);
        assertThat(get("/api/v1/proposals?status=PERDIDA").body()).contains(id);
    }

    @Test
    void confirmacaoCriaProjetoEquipamentosETitulosUmaUnicaVez() throws Exception {
        HttpResponse<String> r = post("/api/v1/sales-orders", "s4-ped-0001", pedido(PARCELAS));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        assertThat(r.body()).contains("\"totalCents\":\"" + TOTAL + "\"", "\"scheduledCents\":\"" + TOTAL + "\"", "\"status\":\"DRAFT\"");

        HttpResponse<String> ok = confirma(id, "1", "s4-conf-0001");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(ok.body()).contains("\"status\":\"CONFIRMED\"", "\"projectStage\":\"PLANEJADO\"", "\"version\":\"2\"",
                "\"label\":\"Pedido " + campo(r.body(), "code") + " — parcela 1/3 — Sinal\"", "\"competence\":\"2026-12\"");
        assertThat(campo(ok.body(), "projectCode")).matches("PJ\\d{5}");
        assertThat(conta("select count(*) from project")).isEqualTo(1);
        assertThat(conta("select count(*) from equipment")).isEqualTo(2);
        assertThat(conta("select count(*) from financial_title")).isEqualTo(3);
        assertThat(conta("select sum(original_cents) from financial_title")).isEqualTo(Long.parseLong(TOTAL));
        assertThat(jdbc.sql("select code from equipment order by code").query(String.class).list()).allMatch(c -> c.matches("EQ\\d{5}"));

        // Mesma chave: a resposta original. Chave nova (a tela reenviou depois de perder a resposta): a mesma confirmação.
        assertThat(confirma(id, "1", "s4-conf-0001").body()).contains("\"status\":\"CONFIRMED\"");
        HttpResponse<String> nova = confirma(id, "1", "s4-conf-0002");
        assertThat(nova.statusCode()).isEqualTo(200);
        assertThat(campo(nova.body(), "projectCode")).isEqualTo(campo(ok.body(), "projectCode"));
        assertThat(conta("select count(*) from project") + conta("select count(*) from equipment") + conta("select count(*) from financial_title"))
                .isEqualTo(6);
        assertThat(jdbc.sql("select event_type from outbox_event order by occurred_at").query(String.class).list())
                .containsSubsequence("SalesOrderDrafted", "ProjectCreated", "EquipmentCreated", "EquipmentCreated",
                        "FinancialTitleCreated", "FinancialTitleCreated", "FinancialTitleCreated", "SalesOrderConfirmed");
        assertThat(conta("select count(*) from outbox_event where event_type = 'SalesOrderConfirmed'")).isEqualTo(1);
        assertThat(get("/api/v1/sales-orders/" + id + "/history").body()).contains("SALES_ORDER_CONFIRMED", "SALES_ORDER_DRAFTED");

        // Confirmado não muda: só aditivo (fora desta sprint).
        HttpResponse<String> alterar = withVersion("PUT", "/api/v1/sales-orders/" + id, "2", pedido(PARCELAS));
        assertThat(alterar.statusCode()).isEqualTo(409);
        assertThat(alterar.body()).contains("aditivo");

        String receber = get("/api/v1/receivables?customerId=" + cliente).body();
        assertThat(receber).contains("\"originalCents\":\"9062144\"", "\"balanceCents\":\"12082858\"", "\"status\":\"OPEN\"",
                "\"category\":\"RECEITA_VENDA\"");
        String projeto = campo(ok.body(), "projectId");
        assertThat(get("/api/v1/projects/" + projeto + "/equipment").body()).contains("Balança de fluxo BF-200", "\"status\":\"ATIVO\"");
        assertThat(get("/api/v1/projects").body()).contains("\"equipmentCount\":2", "\"contractCents\":\"" + TOTAL + "\"");
    }

    @Test
    void confirmacoesConcorrentesComChavesDiferentesGeramUmSoConjunto() throws Exception {
        String id = campo(post("/api/v1/sales-orders", "s4-conc-0001", pedido(PARCELAS)).body(), "id");
        ExecutorService pool = Executors.newFixedThreadPool(6);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String key = "s4-conc-chave-" + i;
            results.add(pool.submit(() -> {
                start.await();
                return confirma(id, "1", key).statusCode();
            }));
        }
        start.countDown();
        Set<Integer> status = new HashSet<>();
        for (Future<Integer> f : results) status.add(f.get());
        pool.shutdown();
        assertThat(status).containsOnly(200);
        assertThat(conta("select count(*) from project")).isEqualTo(1);
        assertThat(conta("select count(*) from equipment")).isEqualTo(2);
        assertThat(conta("select count(*) from financial_title")).isEqualTo(3);
        assertThat(conta("select count(*) from outbox_event where event_type = 'SalesOrderConfirmed'")).isEqualTo(1);
    }

    @Test
    void confirmacaoRecusadaNaoDeixaEfeito() throws Exception {
        // Σ parcelas ≠ total: 422 ORDER_INVALID com a diferença, nada criado.
        String id = campo(post("/api/v1/sales-orders", "s4-reg-0001", pedido("""
                [{"dueDate":"2026-10-10","amountCents":"10000000"}]
                """)).body(), "id");
        HttpResponse<String> soma = confirma(id, "1", "s4-reg-conf-01");
        assertThat(soma.statusCode()).isEqualTo(422);
        assertThat(soma.body()).contains("ORDER_INVALID", "A soma das parcelas (R$ 100.000,00) difere do total do pedido (R$ 302.071,46)");
        assertThat(conta("select count(*) from project") + conta("select count(*) from financial_title")).isZero();
        assertThat(conta("select count(*) from outbox_event where event_type = 'SalesOrderConfirmed'")).isZero();

        // Unidade de outro cliente é recusada já no rascunho.
        HttpResponse<String> unidade = post("/api/v1/sales-orders", "s4-reg-0002", pedido(PARCELAS).replace(matriz, unidadeDoOutro));
        assertThat(unidade.statusCode()).isEqualTo(422);
        assertThat(unidade.body()).contains("\"field\":\"unitId\"", "não pertence ao cliente");

        // Cliente inativado depois do rascunho: a confirmação confere de novo, na transação (INV-SO-6).
        String ok = campo(post("/api/v1/sales-orders", "s4-reg-0003", pedido(PARCELAS)).body(), "id");
        call("POST", "/api/v1/customers/" + cliente + "/deactivate", admin, "{\"reason\":\"Teste\"}", Map.of("If-Match", "\"1\""));
        HttpResponse<String> inativo = confirma(ok, "1", "s4-reg-conf-02");
        assertThat(inativo.statusCode()).isEqualTo(422);
        assertThat(inativo.body()).contains("PARTNER_INACTIVE_OR_UNIT_MISMATCH");

        // Regras das linhas.
        HttpResponse<String> linhas = post("/api/v1/sales-orders", "s4-reg-0004", """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-10-01","lines":[
                 {"kind":"EQUIPAMENTO","description":"Balança","quantity":"1.5","unitPrice":"10"},
                 {"kind":"MATERIAL","itemId":"%s","quantity":"1","unitPrice":"10"},
                 {"kind":"SERVICO","itemId":"%s","quantity":"1","unitPrice":"10","discountCents":"1001"},
                 {"kind":"MATERIAL","itemId":"%s","quantity":"0","unitPrice":"-1"}],
                 "installments":[{"dueDate":"2026-09-01","amountCents":"0"}]}
                """.formatted(outroCliente, unidadeDoOutro, servico, servico, material));
        assertThat(linhas.statusCode()).isEqualTo(422);
        assertThat(linhas.body()).contains("unidades inteiras", "não é produto", "desconto não pode passar",
                "\"field\":\"lines[3].quantity\"", "\"field\":\"lines[3].unitPrice\"", "Vencimento anterior", "\"field\":\"installments[0].amountCents\"");
    }

    @Test
    void parcelasDoPedidoConfirmadoMudamComOsTitulos() throws Exception {
        String rascunho = campo(post("/api/v1/sales-orders", "s4-parc-0001", pedido(PARCELAS)).body(), "id");
        HttpResponse<String> emRascunho = withVersion("PUT", "/api/v1/sales-orders/" + rascunho + "/installments", "1",
                "{\"installments\":" + PARCELAS + "}");
        assertThat(emRascunho.statusCode()).isEqualTo(409);
        assertThat(emRascunho.body()).contains("altere as parcelas no próprio pedido");

        String id = campo(post("/api/v1/sales-orders", "s4-parc-0002", pedido(PARCELAS)).body(), "id");
        confirma(id, "1", "s4-parc-conf-01");

        // Soma diferente do total: nada muda.
        HttpResponse<String> soma = withVersion("PUT", "/api/v1/sales-orders/" + id + "/installments", "2", """
                {"installments":[{"dueDate":"2026-11-10","amountCents":"100"}]}
                """);
        assertThat(soma.statusCode()).isEqualTo(422);
        assertThat(soma.body()).contains("A soma das parcelas (R$ 1,00) difere do total do pedido (R$ 302.071,46)");

        // Duas parcelas: a 1ª e a 2ª mudam vencimento e valor; o título da 3ª é cancelado.
        HttpResponse<String> duas = withVersion("PUT", "/api/v1/sales-orders/" + id + "/installments", "2", """
                {"installments":[{"dueDate":"2026-11-10","amountCents":"15000000","milestone":"Entrada"},
                                 {"dueDate":"2027-02-10","amountCents":"15207146"}],"reason":"Cliente pediu duas parcelas"}
                """);
        assertThat(duas.statusCode()).as(duas.body()).isEqualTo(200);
        assertThat(duas.body()).contains("\"status\":\"CONFIRMED\"", "\"version\":\"3\"", "\"dueDate\":\"2027-02-10\"",
                "\"label\":\"Pedido " + campo(duas.body(), "code") + " — parcela 1/2 — Entrada\"", "\"competence\":\"2027-02\"");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'ACTIVE'")).isEqualTo(2);
        assertThat(conta("select sum(original_cents) from financial_title where lifecycle = 'ACTIVE'")).isEqualTo(Long.parseLong(TOTAL));
        assertThat(conta("select count(*) from financial_title where lifecycle = 'CANCELLED'")).isEqualTo(1);
        assertThat(get("/api/v1/sales-orders/" + id + "/history").body()).contains("SALES_ORDER_RESCHEDULED", "Cliente pediu duas parcelas");

        // De volta a três: o título da 3ª parcela volta a valer (a origem é a mesma), sem título novo.
        HttpResponse<String> tres = withVersion("PUT", "/api/v1/sales-orders/" + id + "/installments", "3", "{\"installments\":" + PARCELAS + "}");
        assertThat(tres.statusCode()).as(tres.body()).isEqualTo(200);
        assertThat(conta("select count(*) from financial_title")).isEqualTo(3);
        assertThat(conta("select count(*) from financial_title where lifecycle = 'ACTIVE'")).isEqualTo(3);
        assertThat(conta("select count(*) from outbox_event where event_type = 'FinancialTitleRescheduled'")).isGreaterThanOrEqualTo(3);

        // Parcela com recebimento não fica com valor abaixo do recebido; a recusa não muda nada.
        jdbc.sql("update financial_title set received_cents = 9062144 where origin_id = :o").param("o", id + ":1").update();
        HttpResponse<String> abaixo = withVersion("PUT", "/api/v1/sales-orders/" + id + "/installments", "4", """
                {"installments":[{"dueDate":"2026-10-10","amountCents":"100"},{"dueDate":"2026-12-10","amountCents":"30207046"}]}
                """);
        assertThat(abaixo.statusCode()).isEqualTo(422);
        assertThat(abaixo.body()).contains("INSTALLMENTS_BLOCKED_BY_EFFECTS", "recebido");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'ACTIVE'")).isEqualTo(3);
        assertThat(get("/api/v1/sales-orders/" + id).body()).contains("\"version\":\"4\"");
    }

    @Test
    void cancelamentoDoPedidoConfirmadoCancelaTitulosEncerraProjetoEEquipamentos() throws Exception {
        String rascunho = campo(post("/api/v1/sales-orders", "s4-canc-0001", pedido(PARCELAS)).body(), "id");
        assertThat(withVersion("POST", "/api/v1/sales-orders/" + rascunho + "/cancellations", "1", "{}").body()).contains("\"field\":\"reason\"");
        assertThat(withVersion("POST", "/api/v1/sales-orders/" + rascunho + "/cancellations", "1", "{\"reason\":\"Duplicado\"}").body())
                .contains("\"status\":\"CANCELLED\"", "\"cancelReason\":\"Duplicado\"");

        String id = campo(post("/api/v1/sales-orders", "s4-canc-0002", pedido(PARCELAS)).body(), "id");
        confirma(id, "1", "s4-canc-conf-01");
        HttpResponse<String> c = withVersion("POST", "/api/v1/sales-orders/" + id + "/cancellations", "2", "{\"reason\":\"Cliente desistiu\"}");
        assertThat(c.statusCode()).as(c.body()).isEqualTo(200);
        assertThat(c.body()).contains("\"status\":\"CANCELLED\"", "\"projectStage\":\"ENCERRADO\"", "\"status\":\"CANCELADO\"");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'CANCELLED'")).isEqualTo(3);
        assertThat(conta("select count(*) from equipment where status = 'CANCELADO'")).isEqualTo(2);
        assertThat(get("/api/v1/receivables").body()).isEqualTo("[]");
        assertThat(get("/api/v1/receivables?includeCancelled=true").body()).contains("Cliente desistiu");
        // Cancelar de novo devolve o cancelamento existente; confirmar um cancelado não é permitido.
        assertThat(withVersion("POST", "/api/v1/sales-orders/" + id + "/cancellations", "2", "{\"reason\":\"de novo\"}").body())
                .contains("Cliente desistiu");
        assertThat(confirma(id, "3", "s4-canc-conf-02").statusCode()).isEqualTo(409);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'SalesOrderCancelled' and aggregate_id = :id")
                .param("id", id).query(String.class).single()).contains("cancelledTitleIds", "cancelledProjectIds");
    }

    @Test
    void equipamentoTemSerieUnicaPorModeloEHistorico() throws Exception {
        String id = campo(post("/api/v1/sales-orders", "s4-eq-0001", pedido(PARCELAS)).body(), "id");
        String projeto = campo(confirma(id, "1", "s4-eq-conf-01").body(), "projectId");
        List<String> equipamentos = ids(get("/api/v1/projects/" + projeto + "/equipment").body(), null);
        String a = equipamentos.get(0);
        String b = equipamentos.get(1);
        HttpResponse<String> serie = withVersion("PUT", "/api/v1/equipment/" + a, "1", "{\"serialNumber\":\" BF-0001 \",\"notes\":\"Painel inox\"}");
        assertThat(serie.statusCode()).as(serie.body()).isEqualTo(200);
        assertThat(serie.body()).contains("\"serialNumber\":\"BF-0001\"", "\"version\":\"2\"", "\"acceptedOn\":null", "\"warrantyStart\":null");
        HttpResponse<String> repetida = withVersion("PUT", "/api/v1/equipment/" + b, "1", "{\"serialNumber\":\"BF-0001\"}");
        assertThat(repetida.statusCode()).isEqualTo(422);
        assertThat(repetida.body()).contains("EQUIPMENT_SERIAL_DUPLICATE");
        assertThat(withVersion("PUT", "/api/v1/equipment/" + a, "1", "{\"serialNumber\":\"X\"}").statusCode()).isEqualTo(412);
        assertThat(get("/api/v1/equipment/" + a + "/history").body()).contains("EQUIPMENT_UPDATED", "\"after\":\"BF-0001\"", "EQUIPMENT_CREATED");
        assertThat(get("/api/v1/equipment?search=bf-0001").body()).contains(a).doesNotContain(b);
    }

    @Test
    void perfilConsultaLeMasNaoVendeNemConfirma() throws Exception {
        String id = campo(post("/api/v1/sales-orders", "s4-con-0001", pedido(PARCELAS)).body(), "id");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/sales-orders/" + id, consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/proposals", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        HttpResponse<String> negado = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", consulta, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", "s4-con-conf-01"));
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(negado.body()).contains("sales_order.confirm");
        assertThat(call("POST", "/api/v1/sales-orders", consulta, pedido(PARCELAS), Map.of("Idempotency-Key", "s4-con-0002")).statusCode())
                .isEqualTo(403);
        assertThat(conta("select count(*) from project")).isZero();
    }

    private HttpResponse<String> confirma(String id, String version, String key) throws Exception {
        return call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"" + version + "\"", "Idempotency-Key", key));
    }

    /** Ids dos objetos de uma lista JSON (a lista inteira quando {@code chave} é nula, ou a lista sob a chave). */
    private static List<String> ids(String json, String chave) {
        String trecho = json;
        if (chave != null) {
            int i = json.indexOf("\"" + chave + "\":[");
            trecho = json.substring(i, json.indexOf("]", i));
        }
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\{\"id\":\"([^\"]+)\"").matcher(trecho);
        while (m.find()) out.add(m.group(1));
        return out;
    }
}
