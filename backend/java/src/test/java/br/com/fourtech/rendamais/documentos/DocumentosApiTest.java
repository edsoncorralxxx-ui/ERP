package br.com.fourtech.rendamais.documentos;

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

/**
 * Sprint 6 contra PostgreSQL real, com a decisão da Review (regime de caixa, PD-023): a nota é registrada a partir do
 * pedido e fatura só o recebido que ainda não tem nota; o sistema monta as linhas (proporcionais ao pedido) e os
 * vínculos (pela ordem de vencimento). Também: cancelar, desfazer vínculo, classificar, pedido faturado e notas
 * simultâneas do mesmo pedido.
 */
class DocumentosApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    private static final String COMPETENCIA = HOJE.toString().substring(0, 7);

    private String cliente;
    private String matriz;
    private String caixa;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", "s6-cli-00001", """
                {"legalName":"Fecularia Vale do Paranapanema Ltda.","units":[{"name":"Matriz","city":"Cândido Mota","state":"SP"}]}
                """);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        cliente = campo(c.body(), "id");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
    }

    /**
     * Pedido confirmado com as linhas (JSON) e as parcelas informadas (centavos); devolve o id do pedido (versão 2
     * depois de confirmado).
     */
    private String pedido(String chave, String linhas, long... parcelas) throws Exception {
        StringBuilder p = new StringBuilder("[");
        for (int i = 0; i < parcelas.length; i++) {
            if (i > 0) p.append(',');
            p.append("{\"dueDate\":\"2026-12-%02d\",\"amountCents\":\"%d\"}".formatted(10 + i, parcelas[i]));
        }
        p.append(']');
        HttpResponse<String> r = post("/api/v1/sales-orders", chave, """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-01-10","lines":%s,"installments":%s}
                """.formatted(cliente, matriz, linhas, p));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        String id = campo(r.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + id + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        return id;
    }

    /** Pedido de uma linha de equipamento com o total das parcelas. */
    private String pedidoSimples(String chave, long... parcelas) throws Exception {
        long total = 0;
        for (long v : parcelas) total += v;
        return pedido(chave, """
                [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"%d.%02d"}]
                """.formatted(total / 100, total % 100), parcelas);
    }

    private List<String> titulos(String pedido) {
        return jdbc.sql("select id::text from financial_title where origin_id like :o order by origin_id")
                .param("o", pedido + ":%").query(String.class).list();
    }

    private String recebe(String chave, String titulo, long centavos) throws Exception {
        HttpResponse<String> r = post("/api/v1/settlements", chave, """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"%d","allocations":[{"titleId":"%s","amountCents":"%d"}]}
                """.formatted(caixa, HOJE, centavos, titulo, centavos));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return campo(r.body(), "id");
    }

    /** Registra a nota do pedido; {@code valor} nulo = todo o recebido sem nota. */
    private HttpResponse<String> registra(String chave, String pedido, String numero, Long valor) throws Exception {
        return post("/api/v1/documents", chave, """
                {"direction":"SAIDA","orderId":"%s","series":"1","number":"%s","issueDate":"%s","competence":"%s",%s
                 "notes":"NF-e emitida no portal da SEFAZ"}
                """.formatted(pedido, numero, HOJE, COMPETENCIA, valor == null ? "" : "\"amountCents\":\"" + valor + "\","));
    }

    private String faturado(String... titulos) throws Exception {
        StringBuilder q = new StringBuilder();
        for (String t : titulos) q.append(q.isEmpty() ? "?" : "&").append("titleId=").append(t);
        return get("/api/v1/invoicing" + q).body();
    }

    /** Faturado gravado de cada parcela = Σ vínculos ativos de documentos ativos; vinculado da nota = Σ vínculos ativos. */
    private void faturadoConfereComVinculos() {
        assertThat(conta("""
                select count(*) from document_title_invoicing i
                 where i.invoiced_cents <> coalesce((select sum(l.amount_cents) from document_title_link l
                          join business_document d on d.id = l.document_id
                         where l.title_id = i.title_id and l.status = 'ATIVO' and d.status = 'ATIVO'), 0)
                """)).isZero();
        assertThat(conta("""
                select count(*) from business_document d
                 where d.linked_cents <> coalesce((select sum(l.amount_cents) from document_title_link l
                         where l.document_id = d.id and l.status = 'ATIVO'), 0)
                """)).isZero();
    }

    @Test
    void notaDoPedidoFaturaSoORecebidoComLinhasProporcionaisEVinculosPorVencimento() throws Exception {
        // Pedido de R$ 155.500,00: equipamento R$ 100.000,00 e instalação R$ 55.500,00; parcelas de R$ 55.500,00 e R$ 100.000,00.
        HttpResponse<String> servico = post("/api/v1/items", "s6-item-0001", """
                {"description":"Instalação e comissionamento","nature":"SERVICO","uom":"H","categoryId":"%s","stockControlled":false}
                """.formatted(categoria("Serviços de campo")));
        assertThat(servico.statusCode()).as(servico.body()).isEqualTo(201);
        String pedido = pedido("s6-ped-0001", """
                [{"kind":"EQUIPAMENTO","description":"Balança de fluxo BF-200","quantity":"1","unitPrice":"100000"},
                 {"kind":"SERVICO","itemId":"%s","quantity":"1","unitPrice":"55500"}]
                """.formatted(campo(servico.body(), "id")), 5_550_000, 10_000_000);
        List<String> t = titulos(pedido);
        String t1 = t.get(0);
        String t2 = t.get(1);

        // Sem recebimento não há nota a emitir.
        assertThat(get("/api/v1/invoicing/orders").body()).doesNotContain(pedido);
        HttpResponse<String> nada = registra("s6-doc-0000", pedido, "1233", null);
        assertThat(nada.statusCode()).isEqualTo(422);
        assertThat(nada.body()).contains("DOCUMENT_EXCEEDS_RECEIVED", "não tem recebimento sem nota");

        // Recebidos R$ 20.000,00 da parcela 1: o pedido aparece com R$ 20.000,00 a emitir, repartidos entre produto e serviço.
        String r1 = recebe("s6-rec-0001", t1, 2_000_000);
        String aEmitir = get("/api/v1/invoicing/orders").body();
        assertThat(aEmitir).contains(pedido, "\"receivedCents\":\"2000000\"", "\"invoicedCents\":\"0\"", "\"toIssueCents\":\"2000000\"",
                "\"productCents\":\"1286174\"", "\"serviceCents\":\"713826\"");
        String proposta = get("/api/v1/invoicing/orders/" + pedido + "?amountCents=1000000").body();
        assertThat(proposta).contains("\"proposedCents\":\"1000000\"", "\"proposedCents\":\"0\"",
                "\"description\":\"Balança de fluxo BF-200\",\"kind\":\"PRODUTO\",\"amountCents\":\"643087\"",
                "\"description\":\"Instalação e comissionamento\",\"kind\":\"SERVICO\",\"amountCents\":\"356913\"");

        // Acima do recebido sem nota: recusado com o a emitir do pedido.
        HttpResponse<String> acima = registra("s6-doc-0001", pedido, "1234", 2_000_001L);
        assertThat(acima.statusCode()).isEqualTo(422);
        assertThat(acima.body()).contains("DOCUMENT_EXCEEDS_RECEIVED", "\"field\":\"amountCents\"", "A emitir do pedido: R$ 20.000,00.");

        // A nota do recebido: linhas e vínculo montados pelo sistema; o saldo a receber não muda.
        HttpResponse<String> nf = registra("s6-doc-0002", pedido, "1234", null);
        assertThat(nf.statusCode()).as(nf.body()).isEqualTo(201);
        String d1 = campo(nf.body(), "id");
        assertThat(campo(nf.body(), "code")).matches("DF\\d{5}");
        assertThat(nf.body()).contains("\"orderId\":\"" + pedido + "\"", "\"orderCode\":\"PV", "\"totalCents\":\"2000000\"",
                "\"linkedCents\":\"2000000\"", "\"unlinkedCents\":\"0\"", "\"competence\":\"" + COMPETENCIA + "\"",
                "\"kind\":\"PRODUTO\",\"amountCents\":\"1286174\"", "\"kind\":\"SERVICO\",\"amountCents\":\"713826\"",
                "\"titleId\":\"" + t1 + "\"");
        assertThat(campo(registra("s6-doc-0002", pedido, "1234", null).body(), "id")).isEqualTo(d1);
        assertThat(registra("s6-doc-0002", pedido, "1234", 1L).body()).contains("IDEMPOTENCY_KEY_REUSED");
        assertThat(get("/api/v1/receivables/" + t1).body()).contains("\"balanceCents\":\"3550000\"");
        assertThat(get("/api/v1/invoicing/orders").body()).doesNotContain(pedido);
        assertThat(registra("s6-doc-0003", pedido, "1235", null).body()).contains("não tem recebimento sem nota");

        // Mesmo número, série e cliente: recusado apontando o documento existente (zeros à esquerda não contam).
        recebe("s6-rec-0002", t1, 3_550_000);
        HttpResponse<String> repetida = registra("s6-doc-0004", pedido, "01234", null);
        assertThat(repetida.statusCode()).isEqualTo(422);
        assertThat(repetida.body()).contains("DOCUMENT_DUPLICATE", "\"field\":\"number\"", campo(nf.body(), "code"));

        // Recebidos o resto da parcela 1 e R$ 10.000,00 da parcela 2: uma nota parcial de R$ 30.000,00 vai à parcela mais antiga.
        String r3 = recebe("s6-rec-0003", t2, 1_000_000);
        assertThat(get("/api/v1/invoicing/orders").body()).contains("\"toIssueCents\":\"4550000\"");
        HttpResponse<String> parcial = registra("s6-doc-0005", pedido, "1235", 3_000_000L);
        assertThat(parcial.statusCode()).as(parcial.body()).isEqualTo(201);
        assertThat(parcial.body()).contains("\"titleId\":\"" + t1 + "\"").doesNotContain("\"titleId\":\"" + t2 + "\"");
        HttpResponse<String> resto = registra("s6-doc-0006", pedido, "1236", null);
        assertThat(resto.statusCode()).as(resto.body()).isEqualTo(201);
        String d3 = campo(resto.body(), "id");
        assertThat(resto.body()).contains("\"totalCents\":\"1550000\"", "\"titleId\":\"" + t1 + "\",\"titleCode\"", "\"titleId\":\"" + t2 + "\"");
        String fat = faturado(t1, t2);
        assertThat(fat).contains("\"invoicedCents\":\"5550000\",\"toInvoiceCents\":\"0\",\"toIssueCents\":\"0\"",
                "\"invoicedCents\":\"1000000\",\"toInvoiceCents\":\"9000000\",\"toIssueCents\":\"0\"", "\"number\":\"1236\"");

        // Vínculo manual também respeita o caixa: desfeito o da parcela 2, a parcela de outro pedido sem recebimento é recusada.
        String vinculoT2 = jdbc.sql("select id::text from document_title_link where document_id = cast(:d as uuid) and title_id = cast(:t as uuid)")
                .param("d", d3).param("t", t2).query(String.class).single();
        assertThat(withVersion("POST", "/api/v1/documents/" + d3 + "/links/" + vinculoT2 + "/removals", "2", "{}").body())
                .contains("\"field\":\"reason\"");
        HttpResponse<String> desfeito = withVersion("POST", "/api/v1/documents/" + d3 + "/links/" + vinculoT2 + "/removals", "2",
                "{\"reason\":\"Parcela errada\"}");
        assertThat(desfeito.statusCode()).as(desfeito.body()).isEqualTo(200);
        assertThat(desfeito.body()).contains("\"unlinkedCents\":\"1000000\"", "\"status\":\"DESFEITO\"");
        HttpResponse<String> semCaixa = call("POST", "/api/v1/documents/" + d3 + "/links", admin,
                "{\"links\":[{\"titleId\":\"" + titulos(pedidoSimples("s6-ped-0002", 10_000)).get(0) + "\",\"amountCents\":\"1\"}]}",
                Map.of("If-Match", "\"3\"", "Idempotency-Key", "s6-vin-0001"));
        assertThat(semCaixa.statusCode()).isEqualTo(422);
        assertThat(semCaixa.body()).contains("LINK_EXCEEDS_TITLE", "A emitir da parcela: R$ 0,00.");
        HttpResponse<String> religa = call("POST", "/api/v1/documents/" + d3 + "/links", admin,
                "{\"links\":[{\"titleId\":\"" + t2 + "\",\"amountCents\":\"1000000\"}]}", Map.of("If-Match", "\"3\"", "Idempotency-Key", "s6-vin-0002"));
        assertThat(religa.statusCode()).as(religa.body()).isEqualTo(200);
        assertThat(withVersion("POST", "/api/v1/documents/" + d3 + "/links", "4", "{\"links\":[]}").statusCode()).isEqualTo(422);

        // Cancelar a nota 1236: o recebido volta a ficar sem nota e o pedido volta à lista a emitir.
        HttpResponse<String> canc = withVersion("POST", "/api/v1/documents/" + d3 + "/cancellations", "4",
                "{\"reason\":\"Valor digitado errado\"}");
        assertThat(canc.statusCode()).as(canc.body()).isEqualTo(200);
        assertThat(canc.body()).contains("\"status\":\"CANCELADO\"", "\"linkedCents\":\"0\"");
        assertThat(withVersion("POST", "/api/v1/documents/" + d3 + "/cancellations", "4", "{\"reason\":\"de novo\"}").body())
                .contains("Valor digitado errado");
        assertThat(get("/api/v1/invoicing/orders").body()).contains(pedido, "\"toIssueCents\":\"1550000\"");
        assertThat(get("/api/v1/documents?status=CANCELADOS").body()).contains(d3).doesNotContain(d1);
        assertThat(get("/api/v1/documents?competence=" + COMPETENCIA).body()).contains(d1).doesNotContain(d3);
        // O número da nota cancelada fica livre para o registro correto.
        assertThat(registra("s6-doc-0007", pedido, "1236", null).statusCode()).isEqualTo(201);

        // Estorno de recebimento já faturado é permitido; o pedido mostra o faturado além do recebido.
        assertThat(post("/api/v1/settlements/" + r1 + "/reversals", null, "{\"reason\":\"Cheque devolvido\"}").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/invoicing/orders/" + pedido).body()).contains("\"beyondReceivedCents\":\"2000000\"", "\"toIssueCents\":\"0\"");
        assertThat(r3).isNotBlank();

        // Histórico na nota e na parcela; eventos com o pedido.
        assertThat(get("/api/v1/documents/" + d1 + "/history").body()).contains("DOCUMENT_REGISTERED", "DOCUMENT_LINKED_TO_TITLES");
        assertThat(get("/api/v1/receivables/" + t1 + "/history").body()).contains("FINANCIAL_TITLE_DOCUMENT_LINKED", "nº 1234");
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentRegistered'")).isEqualTo(4);
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentCancelled'")).isEqualTo(1);
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentLinkRemoved'")).isEqualTo(1);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'DocumentRegistered' and aggregate_id = :id")
                .param("id", d1).query(String.class).single()).contains("\"totalCents\": \"2000000\"", "\"orderId\": \"" + pedido + "\"",
                "\"direction\": \"SAIDA\"");
        faturadoConfereComVinculos();
    }

    @Test
    void pedidoFaturadoSoCancelaDepoisDeCancelarANotaEEstornar() throws Exception {
        String pedido = pedidoSimples("s6-canc-0001", 50_000, 50_000);
        String t1 = titulos(pedido).get(0);
        String r = recebe("s6-canc-rec-01", t1, 50_000);
        String d = campo(registra("s6-canc-doc-01", pedido, "900", null).body(), "id");
        HttpResponse<String> bloqueado = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(bloqueado.statusCode()).isEqualTo(422);
        assertThat(bloqueado.body()).contains("CANCELLATION_BLOCKED_BY_EFFECTS", "estorne o recebimento", "vinculada à nota nº 900",
                "cancele a nota");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'CANCELLED'")).isZero();

        assertThat(withVersion("POST", "/api/v1/documents/" + d + "/cancellations", "2", "{\"reason\":\"Pedido desfeito\"}")
                .statusCode()).isEqualTo(200);
        assertThat(post("/api/v1/settlements/" + r + "/reversals", null, "{\"reason\":\"Devolvido\"}").statusCode()).isEqualTo(200);
        HttpResponse<String> ok = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        // Pedido cancelado não recebe nota.
        assertThat(registra("s6-canc-doc-02", pedido, "901", null).body()).contains("DOCUMENT_INVALID", "não confirmado");
        assertThat(faturado(t1)).contains("\"titleStatus\":\"CANCELLED\"", "\"toIssueCents\":\"0\"");
        faturadoConfereComVinculos();
    }

    @Test
    void notasSimultaneasDoMesmoPedidoNaoPassamDoRecebido() throws Exception {
        String pedido = pedidoSimples("s6-conc-0001", 10_000);
        recebe("s6-conc-rec-1", titulos(pedido).get(0), 10_000);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> results = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String key = "s6-conc-chave-" + i;
            String numero = "50" + i;
            results.add(pool.submit(() -> {
                start.await();
                return registra(key, pedido, numero, 7_000L);
            }));
        }
        start.countDown();
        List<HttpResponse<String>> respostas = new ArrayList<>();
        for (Future<HttpResponse<String>> f : results) respostas.add(f.get());
        pool.shutdown();
        assertThat(respostas).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(201, 422);
        assertThat(respostas.stream().filter(r -> r.statusCode() == 422).findFirst().orElseThrow().body())
                .contains("DOCUMENT_EXCEEDS_RECEIVED", "A emitir do pedido: R$ 30,00.");
        assertThat(conta("select count(*) from business_document")).isEqualTo(1);
        assertThat(conta("select count(*) from document_title_link")).isEqualTo(1);
        faturadoConfereComVinculos();
    }

    @Test
    void registroConfereCamposEClassificaComOProjetoDoPedido() throws Exception {
        String pedido = pedidoSimples("s6-val-0001", 30_000);
        recebe("s6-val-rec-01", titulos(pedido).get(0), 30_000);
        String amanha = HOJE.plusDays(1).toString();
        HttpResponse<String> invalido = post("/api/v1/documents", "s6-val-doc-01", """
                {"series":"","number":"12a","issueDate":"%s","competence":"2026-13"}
                """.formatted(amanha));
        assertThat(invalido.statusCode()).isEqualTo(422);
        assertThat(invalido.body()).contains("DOCUMENT_INVALID", "\"field\":\"orderId\"", "\"field\":\"series\"", "\"field\":\"number\"",
                "\"field\":\"issueDate\"", "futura", "\"field\":\"competence\"");
        assertThat(registra("s6-val-doc-02", pedido, "77", 0L).body()).contains("\"field\":\"amountCents\"", "maior que zero");
        HttpResponse<String> nf = post("/api/v1/documents", "s6-val-doc-03", """
                {"orderId":"%s","series":"a1","number":"77","issueDate":"%s","competence":"%s"}
                """.formatted(pedido, HOJE, COMPETENCIA));
        assertThat(nf.statusCode()).as(nf.body()).isEqualTo(201);
        assertThat(nf.body()).contains("\"totalCents\":\"30000\"", "\"series\":\"A1\"", "\"kind\":\"PRODUTO\"");
        String d = campo(nf.body(), "id");

        // Classificar: natureza obrigatória; projeto só o das parcelas vinculadas (o do pedido).
        assertThat(withVersion("PUT", "/api/v1/documents/" + d + "/classification", "2", "{}").body())
                .contains("\"field\":\"operationNature\"");
        String outro = pedidoSimples("s6-val-0002", 10_000);
        String projetoOutro = jdbc.sql("select project_id::text from financial_title where origin_id like :o").param("o", outro + ":%")
                .query(String.class).single();
        assertThat(withVersion("PUT", "/api/v1/documents/" + d + "/classification", "2",
                "{\"operationNature\":\"VENDA_PRODUCAO\",\"projectId\":\"" + projetoOutro + "\"}").body()).contains("\"field\":\"projectId\"");
        String projeto = jdbc.sql("select project_id::text from financial_title where origin_id like :o").param("o", pedido + ":%")
                .query(String.class).single();
        HttpResponse<String> cl = withVersion("PUT", "/api/v1/documents/" + d + "/classification", "2",
                "{\"operationNature\":\"VENDA_PRODUCAO\",\"projectId\":\"" + projeto + "\"}");
        assertThat(cl.statusCode()).as(cl.body()).isEqualTo(200);
        assertThat(cl.body()).contains("\"operationNature\":\"VENDA_PRODUCAO\"", "\"classificationRevision\":1", "\"projectCode\":\"PJ");
        HttpResponse<String> re = withVersion("PUT", "/api/v1/documents/" + d + "/classification", "3",
                "{\"operationNature\":\"PRESTACAO_SERVICO\"}");
        assertThat(re.body()).contains("\"classificationRevision\":2", "\"projectId\":null");
        assertThat(get("/api/v1/documents/" + d + "/history").body()).contains("DOCUMENT_CLASSIFIED", "\"after\":\"PRESTACAO_SERVICO\"");
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentClassified'")).isEqualTo(2);
    }

    @Test
    void perfilConsultaVeNotasEAEmitirMasNaoRegistraNemCancela() throws Exception {
        String pedido = pedidoSimples("s6-cons-0001", 20_000);
        String t = titulos(pedido).get(0);
        recebe("s6-cons-rec-01", t, 20_000);
        String d = campo(registra("s6-cons-doc-01", pedido, "300", 5_000L).body(), "id");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/documents", consulta, null, Map.of()).body()).contains(d);
        assertThat(call("GET", "/api/v1/invoicing/orders", consulta, null, Map.of()).body()).contains("\"toIssueCents\":\"15000\"");
        assertThat(call("GET", "/api/v1/invoicing?titleId=" + t, consulta, null, Map.of()).body()).contains("\"invoicedCents\":\"5000\"");
        HttpResponse<String> reg = call("POST", "/api/v1/documents", consulta, "{}", Map.of("Idempotency-Key", "s6-cons-doc-02"));
        assertThat(reg.statusCode()).isEqualTo(403);
        assertThat(reg.body()).contains("document.register");
        assertThat(call("POST", "/api/v1/documents/" + d + "/cancellations", consulta, "{\"reason\":\"x\"}", Map.of("If-Match", "\"2\""))
                .body()).contains("document.cancel");
        assertThat(call("PUT", "/api/v1/documents/" + d + "/classification", consulta, "{\"operationNature\":\"REMESSA\"}",
                Map.of("If-Match", "\"2\"")).body()).contains("document.classify");
        assertThat(conta("select count(*) from business_document")).isEqualTo(1);
    }
}
