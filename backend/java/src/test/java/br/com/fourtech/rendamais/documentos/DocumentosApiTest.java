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
 * Sprint 6 contra PostgreSQL real: registrar a nota, vincular às parcelas (PD-023), desfazer vínculo, cancelar,
 * classificar, pedido faturado e vínculos simultâneos na mesma parcela.
 */
class DocumentosApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    private static final String COMPETENCIA = HOJE.toString().substring(0, 7);

    private String cliente;
    private String matriz;
    private String caixa;

    @BeforeEach
    void cadastros() throws Exception {
        cliente = cliente("s6-cli-00001", "Fecularia Vale do Paranapanema Ltda.");
        matriz = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
    }

    private String cliente(String chave, String nome) throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", chave, """
                {"legalName":"%s","units":[{"name":"Matriz","city":"Cândido Mota","state":"SP"}]}
                """.formatted(nome));
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        return campo(c.body(), "id");
    }

    /** Pedido confirmado com as parcelas informadas (centavos); devolve o id do pedido (versão 2 depois de confirmado). */
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

    private List<String> titulos(String pedido) {
        return jdbc.sql("select id::text from financial_title where origin_id like :o order by origin_id")
                .param("o", pedido + ":%").query(String.class).list();
    }

    private HttpResponse<String> registra(String chave, String numero, long total, String... vinculos) throws Exception {
        return post("/api/v1/documents", chave, """
                {"direction":"SAIDA","customerId":"%s","series":"1","number":"%s","issueDate":"%s","competence":"%s",
                 "lines":[{"description":"Balança de fluxo BF-200","kind":"PRODUTO","amountCents":"%d"}],"links":[%s],
                 "notes":"NF-e emitida no portal da SEFAZ"}
                """.formatted(cliente, numero, HOJE, COMPETENCIA, total, String.join(",", vinculos)));
    }

    private static String vinculo(String titulo, long centavos) {
        return "{\"titleId\":\"%s\",\"amountCents\":\"%d\"}".formatted(titulo, centavos);
    }

    private HttpResponse<String> vincula(String doc, String versao, String chave, String... vinculos) throws Exception {
        return call("POST", "/api/v1/documents/" + doc + "/links", admin, "{\"links\":[" + String.join(",", vinculos) + "]}",
                Map.of("If-Match", "\"" + versao + "\"", "Idempotency-Key", chave));
    }

    private String faturado(String... titulos) throws Exception {
        StringBuilder q = new StringBuilder();
        for (String t : titulos) q.append(q.isEmpty() ? "?" : "&").append("titleId=").append(t);
        return get("/api/v1/invoicing" + q).body();
    }

    /** Faturado gravado de cada parcela = Σ vínculos ativos de documentos ativos (conferência do PD-023). */
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
    void notaVinculadaAsParcelasMostraFaturadoSemMudarOSaldo() throws Exception {
        String pedido = pedidoConfirmado("s6-ped-0001", 5_550_000, 10_000_000);
        List<String> t = titulos(pedido);
        String t1 = t.get(0);
        String t2 = t.get(1);
        // Recebimento parcial da parcela 1 antes da nota: faturamento e recebimento são independentes.
        HttpResponse<String> rec = post("/api/v1/settlements", "s6-rec-0001", """
                {"accountId":"%s","effectiveDate":"%s","amountCents":"2000000","allocations":[{"titleId":"%s","amountCents":"2000000"}]}
                """.formatted(caixa, HOJE, t1));
        assertThat(rec.statusCode()).as(rec.body()).isEqualTo(201);

        // Nota 1234 de R$ 92.500,00: parcela 1 inteira (já parcialmente recebida) e R$ 37.000,00 da parcela 2 (doc 14).
        HttpResponse<String> nf = registra("s6-doc-0001", "1234", 9_250_000, vinculo(t1, 5_550_000), vinculo(t2, 3_700_000));
        assertThat(nf.statusCode()).as(nf.body()).isEqualTo(201);
        String d1 = campo(nf.body(), "id");
        assertThat(campo(nf.body(), "code")).matches("DF\\d{5}");
        assertThat(nf.body()).contains("\"status\":\"ATIVO\"", "\"totalCents\":\"9250000\"", "\"linkedCents\":\"9250000\"",
                "\"unlinkedCents\":\"0\"", "\"competence\":\"" + COMPETENCIA + "\"", "\"version\":\"2\"", "\"kind\":\"PRODUTO\"");
        // Mesma chave: o mesmo documento; mesma chave com outro corpo: recusa.
        assertThat(campo(registra("s6-doc-0001", "1234", 9_250_000, vinculo(t1, 5_550_000), vinculo(t2, 3_700_000)).body(), "id"))
                .isEqualTo(d1);
        assertThat(registra("s6-doc-0001", "1234", 100).body()).contains("IDEMPOTENCY_KEY_REUSED");
        assertThat(conta("select count(*) from business_document")).isEqualTo(1);

        String fat = faturado(t1, t2);
        assertThat(fat).contains("\"invoicedCents\":\"5550000\",\"toInvoiceCents\":\"0\"",
                "\"invoicedCents\":\"3700000\",\"toInvoiceCents\":\"6300000\"", "\"number\":\"1234\"");
        // O saldo a receber não muda com a nota.
        assertThat(get("/api/v1/receivables/" + t1).body()).contains("\"balanceCents\":\"3550000\"");
        assertThat(get("/api/v1/receivables/" + t2).body()).contains("\"balanceCents\":\"10000000\"", "\"version\":\"1\"");

        // Mesmo número, mesma série, mesmo cliente: recusado apontando o documento existente.
        HttpResponse<String> repetida = registra("s6-doc-0002", "01234", 100);
        assertThat(repetida.statusCode()).isEqualTo(422);
        assertThat(repetida.body()).contains("DOCUMENT_DUPLICATE", "\"field\":\"number\"", campo(nf.body(), "code"));

        // Nota 1235 de R$ 70.000,00: R$ 63.000,01 na parcela 2 passa do a faturar; R$ 63.000,00 fecha.
        HttpResponse<String> nf2 = registra("s6-doc-0003", "1235", 7_000_000);
        assertThat(nf2.statusCode()).as(nf2.body()).isEqualTo(201);
        String d2 = campo(nf2.body(), "id");
        HttpResponse<String> acima = vincula(d2, "1", "s6-vin-0001", vinculo(t2, 6_300_001));
        assertThat(acima.statusCode()).isEqualTo(422);
        assertThat(acima.body()).contains("LINK_EXCEEDS_TITLE", "\"field\":\"links[0].amountCents\"", "A faturar da parcela: R$ 63.000,00.");
        assertThat(vincula(d2, "1", "s6-vin-0002", vinculo(t2, 7_000_001)).body()).contains("LINK_EXCEEDS_DOCUMENT",
                "Resta no documento: R$ 70.000,00.");
        assertThat(vincula(d2, "9", "s6-vin-0003", vinculo(t2, 100)).statusCode()).isEqualTo(412);
        HttpResponse<String> ok = vincula(d2, "1", "s6-vin-0004", vinculo(t2, 6_300_000));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(ok.body()).contains("\"linkedCents\":\"6300000\"", "\"unlinkedCents\":\"700000\"", "\"version\":\"2\"");
        // Mesma chave: devolve o documento sem vincular de novo.
        assertThat(vincula(d2, "1", "s6-vin-0004", vinculo(t2, 6_300_000)).statusCode()).isEqualTo(200);
        assertThat(faturado(t2)).contains("\"invoicedCents\":\"10000000\",\"toInvoiceCents\":\"0\"");
        // A mesma parcela duas vezes no mesmo documento é recusada.
        assertThat(vincula(d2, "2", "s6-vin-0005", vinculo(t2, 1)).body()).contains("Parcela já vinculada");

        // Lista por competência com o total faturado; o histórico mostra registro e vínculos, também na parcela.
        String lista = get("/api/v1/documents?competence=" + COMPETENCIA).body();
        assertThat(lista).contains(d1, d2);
        assertThat(get("/api/v1/documents?search=1235").body()).contains(d2).doesNotContain(d1);
        assertThat(get("/api/v1/documents/" + d2 + "/history").body()).contains("DOCUMENT_REGISTERED", "DOCUMENT_LINKED_TO_TITLES");
        assertThat(get("/api/v1/receivables/" + t2 + "/history").body()).contains("FINANCIAL_TITLE_DOCUMENT_LINKED", "nº 1235");

        // Cancelar a 1235: libera o vínculo; cancelar de novo devolve o mesmo; cancelada não recebe vínculo.
        assertThat(withVersion("POST", "/api/v1/documents/" + d2 + "/cancellations", "2", "{}").body()).contains("\"field\":\"reason\"");
        HttpResponse<String> canc = withVersion("POST", "/api/v1/documents/" + d2 + "/cancellations", "2",
                "{\"reason\":\"Valor digitado errado\"}");
        assertThat(canc.statusCode()).as(canc.body()).isEqualTo(200);
        assertThat(canc.body()).contains("\"status\":\"CANCELADO\"", "\"linkedCents\":\"0\"", "\"status\":\"DESFEITO\"",
                "\"removedReason\":\"Valor digitado errado\"");
        assertThat(withVersion("POST", "/api/v1/documents/" + d2 + "/cancellations", "2", "{\"reason\":\"de novo\"}").body())
                .contains("Valor digitado errado");
        assertThat(vincula(d2, "3", "s6-vin-0006", vinculo(t2, 100)).statusCode()).isEqualTo(409);
        assertThat(faturado(t2)).contains("\"invoicedCents\":\"3700000\",\"toInvoiceCents\":\"6300000\"");
        assertThat(get("/api/v1/documents?competence=" + COMPETENCIA).body()).contains(d1).doesNotContain(d2);
        assertThat(get("/api/v1/documents?status=CANCELADOS").body()).contains(d2).doesNotContain(d1);
        // O número da nota cancelada fica livre para o registro correto.
        assertThat(registra("s6-doc-0004", "1235", 6_300_000).statusCode()).isEqualTo(201);

        // Desfazer um vínculo da 1234: motivo obrigatório; a parcela 2 volta a ter R$ 100.000,00 a faturar.
        String vinculoT2 = jdbc.sql("select id::text from document_title_link where document_id = cast(:d as uuid) and title_id = cast(:t as uuid)")
                .param("d", d1).param("t", t2).query(String.class).single();
        assertThat(withVersion("POST", "/api/v1/documents/" + d1 + "/links/" + vinculoT2 + "/removals", "2", "{}").body())
                .contains("\"field\":\"reason\"");
        HttpResponse<String> desfeito = withVersion("POST", "/api/v1/documents/" + d1 + "/links/" + vinculoT2 + "/removals", "2",
                "{\"reason\":\"Parcela errada\"}");
        assertThat(desfeito.statusCode()).as(desfeito.body()).isEqualTo(200);
        assertThat(desfeito.body()).contains("\"linkedCents\":\"5550000\"", "\"unlinkedCents\":\"3700000\"", "\"version\":\"3\"");
        assertThat(faturado(t2)).contains("\"invoicedCents\":\"0\",\"toInvoiceCents\":\"10000000\"");

        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentRegistered'")).isEqualTo(3);
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentLinkedToTitles'")).isEqualTo(2);
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentCancelled'")).isEqualTo(1);
        assertThat(conta("select count(*) from outbox_event where event_type = 'DocumentLinkRemoved'")).isEqualTo(1);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'DocumentRegistered' and aggregate_id = :id")
                .param("id", d1).query(String.class).single()).contains("\"totalCents\": \"9250000\"", "\"competence\": \"" + COMPETENCIA + "\"",
                "\"direction\": \"SAIDA\"");
        faturadoConfereComVinculos();
    }

    @Test
    void pedidoFaturadoSoCancelaDepoisDeCancelarANota() throws Exception {
        String pedido = pedidoConfirmado("s6-canc-0001", 50_000, 50_000);
        String t1 = titulos(pedido).get(0);
        String d = campo(registra("s6-canc-doc-01", "900", 50_000, vinculo(t1, 50_000)).body(), "id");
        HttpResponse<String> bloqueado = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(bloqueado.statusCode()).isEqualTo(422);
        assertThat(bloqueado.body()).contains("CANCELLATION_BLOCKED_BY_EFFECTS", "vinculada à nota nº 900", "cancele a nota");
        assertThat(conta("select count(*) from financial_title where lifecycle = 'CANCELLED'")).isZero();

        assertThat(withVersion("POST", "/api/v1/documents/" + d + "/cancellations", "2", "{\"reason\":\"Pedido desfeito\"}")
                .statusCode()).isEqualTo(200);
        HttpResponse<String> ok = withVersion("POST", "/api/v1/sales-orders/" + pedido + "/cancellations", "2",
                "{\"reason\":\"Cliente desistiu\"}");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        // Parcela cancelada não recebe vínculo; o faturado das parcelas canceladas não tem nada a faturar.
        String d2 = campo(registra("s6-canc-doc-02", "901", 50_000).body(), "id");
        HttpResponse<String> cancelada = vincula(d2, "1", "s6-canc-vin-01", vinculo(t1, 50_000));
        assertThat(cancelada.statusCode()).isEqualTo(409);
        assertThat(cancelada.body()).contains("cancelada");
        assertThat(faturado(t1)).contains("\"titleStatus\":\"CANCELLED\"", "\"toInvoiceCents\":\"0\"");
        faturadoConfereComVinculos();
    }

    @Test
    void vinculosSimultaneosNaMesmaParcelaNaoPassamDoValor() throws Exception {
        String t = titulos(pedidoConfirmado("s6-conc-0001", 10_000)).get(0);
        List<String> docs = List.of(campo(registra("s6-conc-doc-1", "501", 7_000).body(), "id"),
                campo(registra("s6-conc-doc-2", "502", 7_000).body(), "id"));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> results = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String doc = docs.get(i);
            String key = "s6-conc-chave-" + i;
            results.add(pool.submit(() -> {
                start.await();
                return vincula(doc, "1", key, vinculo(t, 7_000));
            }));
        }
        start.countDown();
        List<HttpResponse<String>> respostas = new ArrayList<>();
        for (Future<HttpResponse<String>> f : results) respostas.add(f.get());
        pool.shutdown();
        assertThat(respostas).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 422);
        assertThat(respostas.stream().filter(r -> r.statusCode() == 422).findFirst().orElseThrow().body())
                .contains("LINK_EXCEEDS_TITLE", "A faturar da parcela: R$ 30,00.");
        assertThat(faturado(t)).contains("\"invoicedCents\":\"7000\",\"toInvoiceCents\":\"3000\"");
        assertThat(conta("select count(*) from document_title_link")).isEqualTo(1);
        faturadoConfereComVinculos();
    }

    @Test
    void registroConfereCamposClienteDaParcelaEClassificacao() throws Exception {
        String pedido = pedidoConfirmado("s6-val-0001", 30_000);
        String t = titulos(pedido).get(0);
        String amanha = HOJE.plusDays(1).toString();
        HttpResponse<String> invalido = post("/api/v1/documents", "s6-val-doc-01", """
                {"customerId":"%s","series":"","number":"12a","issueDate":"%s","competence":"2026-13","lines":
                 [{"description":"","kind":"OUTRO","amountCents":"0"}]}
                """.formatted(cliente, amanha));
        assertThat(invalido.statusCode()).isEqualTo(422);
        assertThat(invalido.body()).contains("DOCUMENT_INVALID", "\"field\":\"series\"", "\"field\":\"number\"", "\"field\":\"issueDate\"",
                "futura", "\"field\":\"competence\"", "\"field\":\"lines[0].description\"", "\"field\":\"lines[0].kind\"",
                "\"field\":\"lines[0].amountCents\"");
        assertThat(post("/api/v1/documents", "s6-val-doc-02", """
                {"customerId":"%s","series":"1","number":"1","issueDate":"%s","competence":"%s","lines":[]}
                """.formatted(cliente, HOJE, COMPETENCIA)).body()).contains("\"field\":\"lines\"");
        // Duas linhas somam o total; tipo Serviço aceito.
        HttpResponse<String> duas = post("/api/v1/documents", "s6-val-doc-03", """
                {"customerId":"%s","series":"a1","number":"77","issueDate":"%s","competence":"%s","lines":
                 [{"description":"Balança","kind":"PRODUTO","amountCents":"20000"},{"description":"Instalação","kind":"SERVICO","amountCents":"10000"}]}
                """.formatted(cliente, HOJE, COMPETENCIA));
        assertThat(duas.statusCode()).as(duas.body()).isEqualTo(201);
        assertThat(duas.body()).contains("\"totalCents\":\"30000\"", "\"series\":\"A1\"", "\"kind\":\"SERVICO\"");
        String d = campo(duas.body(), "id");

        // Parcela de outro cliente não se vincula.
        String outro = cliente("s6-cli-00002", "Cerealista Oeste Ltda.");
        String d2 = campo(post("/api/v1/documents", "s6-val-doc-04", """
                {"customerId":"%s","series":"1","number":"78","issueDate":"%s","competence":"%s","lines":
                 [{"description":"Peças","kind":"PRODUTO","amountCents":"1000"}]}
                """.formatted(outro, HOJE, COMPETENCIA)).body(), "id");
        assertThat(vincula(d2, "1", "s6-val-vin-01", vinculo(t, 1_000)).body()).contains("DOCUMENT_INVALID", "outro cliente");

        // Classificar: natureza obrigatória; projeto só o de uma parcela vinculada.
        assertThat(withVersion("PUT", "/api/v1/documents/" + d + "/classification", "1", "{}").body())
                .contains("\"field\":\"operationNature\"");
        String projeto = jdbc.sql("select project_id::text from financial_title where id = cast(:t as uuid)").param("t", t)
                .query(String.class).single();
        assertThat(withVersion("PUT", "/api/v1/documents/" + d + "/classification", "1",
                "{\"operationNature\":\"VENDA_PRODUCAO\",\"projectId\":\"" + projeto + "\"}").body()).contains("\"field\":\"projectId\"");
        assertThat(vincula(d, "1", "s6-val-vin-02", vinculo(t, 30_000)).statusCode()).isEqualTo(200);
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
    void perfilConsultaVeNotasMasNaoRegistraVinculaNemCancela() throws Exception {
        String t = titulos(pedidoConfirmado("s6-cons-0001", 20_000)).get(0);
        String d = campo(registra("s6-cons-doc-01", "300", 20_000, vinculo(t, 5_000)).body(), "id");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/documents", consulta, null, Map.of()).body()).contains(d);
        assertThat(call("GET", "/api/v1/invoicing?titleId=" + t, consulta, null, Map.of()).body()).contains("\"invoicedCents\":\"5000\"");
        HttpResponse<String> reg = call("POST", "/api/v1/documents", consulta, "{}", Map.of("Idempotency-Key", "s6-cons-doc-02"));
        assertThat(reg.statusCode()).isEqualTo(403);
        assertThat(reg.body()).contains("document.register");
        assertThat(call("POST", "/api/v1/documents/" + d + "/links", consulta, "{\"links\":[]}",
                Map.of("If-Match", "\"2\"", "Idempotency-Key", "s6-cons-vin-01")).body()).contains("document.link");
        assertThat(call("POST", "/api/v1/documents/" + d + "/cancellations", consulta, "{\"reason\":\"x\"}", Map.of("If-Match", "\"2\""))
                .body()).contains("document.cancel");
        assertThat(call("PUT", "/api/v1/documents/" + d + "/classification", consulta, "{\"operationNature\":\"REMESSA\"}",
                Map.of("If-Match", "\"2\"")).body()).contains("document.classify");
        assertThat(conta("select count(*) from business_document")).isEqualTo(1);
    }
}
