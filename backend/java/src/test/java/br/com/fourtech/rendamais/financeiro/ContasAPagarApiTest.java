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
 * Sprint 8 contra PostgreSQL real: categorias financeiras, título a pagar manual com parcelas, pagamento parcial com
 * saída na conta, excedente recusado, estorno, cancelamento, concorrência no pagamento e o DAS da conferência do contador.
 */
class ContasAPagarApiTest extends CadastrosApiTest {

    private static final String HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    private static final String RECEITA_FEDERAL = "00000000-0000-0000-0000-0000000000da";

    private String fornecedor;
    private String caixa;

    @BeforeEach
    void cadastros() throws Exception {
        HttpResponse<String> f = post("/api/v1/suppliers", "s8-for-00001", """
                {"legalName":"ACME Serviços Industriais Ltda.","tradeName":"ACME"}
                """);
        assertThat(f.statusCode()).as(f.body()).isEqualTo(201);
        fornecedor = campo(f.body(), "id");
        caixa = jdbc.sql("select id::text from bank_account where created_by = 'sistema'").query(String.class).single();
    }

    /** Vencimento da parcela {@code i} (a partir de 0): dia 10 dos meses seguintes, sempre a vencer. */
    private static String vencimento(int i) {
        return LocalDate.parse(HOJE).plusMonths(i + 1L).withDayOfMonth(10).toString();
    }

    /** Título manual em parcelas (centavos), vencendo no dia 10 dos meses seguintes; devolve a resposta. */
    private HttpResponse<String> registra(String chave, String categoria, long total, long... parcelas) throws Exception {
        StringBuilder p = new StringBuilder("[");
        for (int i = 0; i < parcelas.length; i++) {
            if (i > 0) p.append(',');
            p.append("{\"dueDate\":\"%s\",\"amountCents\":\"%d\"}".formatted(vencimento(i), parcelas[i]));
        }
        p.append(']');
        return post("/api/v1/payables", chave, """
                {"supplierId":"%s","category":"%s","competence":"2026-09","documentNumber":"NFS-e 4521","description":"Manutenção da linha",
                 "totalCents":"%d","installments":%s,"notes":"Contrato de manutenção"}
                """.formatted(fornecedor, categoria, total, p));
    }

    private static List<String> ids(String json) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\{\"id\":\"([^\"]+)\"").matcher(json);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    private HttpResponse<String> paga(String chave, String conta, long total, String... alocacoes) throws Exception {
        return post("/api/v1/settlements", chave, """
                {"direction":"PAYABLE","accountId":"%s","effectiveDate":"%s","amountCents":"%d","currency":"BRL",
                 "allocations":[%s],"notes":"Pago pelo internet banking"}
                """.formatted(conta, HOJE, total, String.join(",", alocacoes)));
    }

    private static String aloca(String titulo, long centavos) {
        return "{\"titleId\":\"%s\",\"amountCents\":\"%d\"}".formatted(titulo, centavos);
    }

    private String titulo(String id) throws Exception {
        return get("/api/v1/payables/" + id).body();
    }

    private long saldo(String conta) throws Exception {
        return Long.parseLong(campo(get("/api/v1/bank-accounts/" + conta).body(), "balanceCents"));
    }

    private String banco() throws Exception {
        HttpResponse<String> b = post("/api/v1/bank-accounts", null, """
                {"name":"Banco do Brasil — pagamentos","kind":"BANCO","bank":"Banco do Brasil","openingCents":"1000000","openingOn":"2026-01-01"}
                """);
        assertThat(b.statusCode()).as(b.body()).isEqualTo(201);
        return campo(b.body(), "id");
    }

    /** Conferência: o pago de cada título é a soma dos pagamentos não estornados, e cada pagamento saiu da conta uma vez. */
    private void pagoConfereComAlocacoes() {
        assertThat(conta("""
                select count(*) from financial_title t
                 where t.received_cents <> coalesce((select sum(a.amount_cents) from settlement_allocation a
                          join settlement s on s.id = a.settlement_id
                         where a.title_id = t.id and s.status = 'POSTED'), 0)
                """)).isZero();
        assertThat(conta("""
                select count(*) from settlement s
                 where s.direction = 'PAYABLE'
                   and (select coalesce(sum(m.amount_cents), 0) from cash_movement m where m.settlement_id = s.id)
                       <> case s.status when 'POSTED' then -s.total_cents else 0 end
                """)).isZero();
    }

    @Test
    void categoriasSemeadasECadastroPeloAdministrador() throws Exception {
        String lista = get("/api/v1/financial-categories?direction=DESPESA").body();
        assertThat(lista).contains("\"code\":\"SERVICOS_TERCEIROS\",\"name\":\"Serviços de terceiros\"",
                "\"code\":\"IMPOSTOS_SIMPLES\",\"name\":\"Impostos — Simples Nacional\"", "\"code\":\"OUTRAS_DESPESAS\"");
        assertThat(lista).doesNotContain("RECEITA_VENDA");
        assertThat(get("/api/v1/financial-categories?direction=RECEITA").body()).contains("\"code\":\"RECEITA_VENDA\"");

        HttpResponse<String> nova = post("/api/v1/financial-categories", null, "{\"name\":\"Manutenção de máquinas\",\"direction\":\"DESPESA\"}");
        assertThat(nova.statusCode()).as(nova.body()).isEqualTo(201);
        assertThat(nova.body()).contains("\"code\":\"MANUTENCAO_DE_MAQUINAS\"", "\"system\":false", "\"version\":\"1\"");
        assertThat(post("/api/v1/financial-categories", null, "{\"name\":\"manutenção de máquinas\"}").body())
                .contains("CATEGORY_DUPLICATE");
        assertThat(post("/api/v1/financial-categories", null, "{\"name\":\" \"}").body()).contains("\"field\":\"name\"");

        String id = campo(nova.body(), "id");
        HttpResponse<String> inativa = withVersion("PUT", "/api/v1/financial-categories/" + id, "1", "{\"status\":\"INATIVO\"}");
        assertThat(inativa.statusCode()).as(inativa.body()).isEqualTo(200);
        assertThat(inativa.body()).contains("\"status\":\"INATIVO\"", "\"code\":\"MANUTENCAO_DE_MAQUINAS\"");
        assertThat(withVersion("PUT", "/api/v1/financial-categories/" + id, "1", "{\"name\":\"x\"}").statusCode()).isEqualTo(412);
        assertThat(get("/api/v1/financial-categories").body()).doesNotContain("MANUTENCAO_DE_MAQUINAS");
        assertThat(get("/api/v1/financial-categories?includeInactive=true").body()).contains("MANUTENCAO_DE_MAQUINAS");
        // Categoria inativa não aceita título novo.
        assertThat(registra("s8-cp-inativa", "MANUTENCAO_DE_MAQUINAS", 100_000, 100_000).body())
                .contains("PAYABLE_INVALID", "\"field\":\"category\"", "inativa");

        // A categoria do DAS é do sistema: não é inativada.
        String das = jdbc.sql("select id::text from financial_category where code = 'IMPOSTOS_SIMPLES'").query(String.class).single();
        assertThat(withVersion("PUT", "/api/v1/financial-categories/" + das, "1", "{\"status\":\"INATIVO\"}").body())
                .contains("CATEGORY_INVALID", "usada pelo sistema");
        assertThat(get("/api/v1/financial-categories/" + id + "/history").body()).contains("FINANCIAL_CATEGORY_CREATED",
                "FINANCIAL_CATEGORY_UPDATED");
    }

    @Test
    void tituloManualEmParcelasPagamentoParcialExcedenteEEstorno() throws Exception {
        String conta = banco();

        // Campos obrigatórios e soma das parcelas.
        HttpResponse<String> vazio = post("/api/v1/payables", "s8-cp-vazio", "{}");
        assertThat(vazio.statusCode()).isEqualTo(422);
        assertThat(vazio.body()).contains("\"field\":\"supplierId\"", "\"field\":\"category\"", "\"field\":\"competence\"",
                "\"field\":\"totalCents\"", "\"field\":\"installments\"");
        assertThat(registra("s8-cp-soma", "SERVICOS_TERCEIROS", 300_000, 100_000, 100_000).body())
                .contains("A soma das parcelas (R$ 2.000,00) difere do total (R$ 3.000,00).");
        assertThat(registra("s8-cp-receita", "RECEITA_VENDA", 100_000, 100_000).body()).contains("Use uma categoria de despesa.");

        // R$ 3.000,00 em 3 parcelas de R$ 1.000,00: CP00001 a CP00003.
        HttpResponse<String> r = registra("s8-cp-00001", "SERVICOS_TERCEIROS", 300_000, 100_000, 100_000, 100_000);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        List<String> t = ids(r.body());
        assertThat(t).hasSize(3);
        assertThat(r.body()).contains("\"supplierName\":\"ACME Serviços Industriais Ltda.\"", "\"category\":\"SERVICOS_TERCEIROS\"",
                "\"competence\":\"2026-09\"", "\"documentNumber\":\"NFS-e 4521\"", "\"origin\":\"Manutenção da linha — parcela 1/3\"",
                "\"dueDate\":\"" + vencimento(0) + "\"", "\"originalCents\":\"100000\"", "\"paidCents\":\"0\"", "\"status\":\"OPEN\"");
        assertThat(campo(r.body(), "code")).matches("CP\\d{5}");
        // Mesma chave: os mesmos títulos, sem criar outros.
        assertThat(ids(registra("s8-cp-00001", "SERVICOS_TERCEIROS", 300_000, 100_000, 100_000, 100_000).body())).isEqualTo(t);
        assertThat(conta("select count(*) from financial_title where direction = 'PAYABLE'")).isEqualTo(3);
        assertThat(conta("select count(*) from outbox_event where event_type = 'FinancialTitleCreated' and payload->>'direction' = 'PAYABLE'"))
                .isEqualTo(3);

        // Pagar R$ 400,00: parcial; a conta perde R$ 400,00 (saída no extrato).
        HttpResponse<String> p1 = paga("s8-pg-00001", conta, 40_000, aloca(t.get(0), 40_000));
        assertThat(p1.statusCode()).as(p1.body()).isEqualTo(201);
        assertThat(campo(p1.body(), "code")).matches("PG\\d{5}");
        assertThat(p1.body()).contains("\"direction\":\"PAYABLE\"", "\"status\":\"POSTED\"");
        assertThat(titulo(t.get(0))).contains("\"status\":\"PARTIAL\"", "\"paidCents\":\"40000\"", "\"balanceCents\":\"60000\"");
        assertThat(saldo(conta)).isEqualTo(960_000);
        assertThat(get("/api/v1/bank-accounts/" + conta + "/movements").body()).contains("\"amountCents\":\"-40000\"",
                "\"description\":\"Pagamento " + campo(p1.body(), "code") + "\"", "\"balanceCents\":\"960000\"");
        // Mesma chave: o mesmo pagamento.
        assertThat(campo(paga("s8-pg-00001", conta, 40_000, aloca(t.get(0), 40_000)).body(), "id")).isEqualTo(campo(p1.body(), "id"));

        // R$ 600,01 passa do saldo: recusado, sem efeito.
        HttpResponse<String> excede = paga("s8-pg-00002", conta, 60_001, aloca(t.get(0), 60_001));
        assertThat(excede.statusCode()).isEqualTo(422);
        assertThat(excede.body()).contains("INSUFFICIENT_TITLE_BALANCE", "Saldo atual: R$ 600,00.");
        assertThat(saldo(conta)).isEqualTo(960_000);

        // Título a pagar em recebimento: direção errada.
        assertThat(post("/api/v1/settlements", "s8-rec-errado", """
                {"direction":"RECEIVABLE","accountId":"%s","effectiveDate":"%s","amountCents":"100","allocations":[%s]}
                """.formatted(conta, HOJE, aloca(t.get(1), 100))).body()).contains("SETTLEMENT_DIRECTION_MISMATCH", "não é uma conta a receber");

        // Estornar: o título volta a R$ 1.000,00 e a conta a R$ 10.000,00 (entrada do estorno).
        HttpResponse<String> est = post("/api/v1/settlements/" + campo(p1.body(), "id") + "/reversals", null,
                "{\"reason\":\"Pago na conta errada\"}");
        assertThat(est.statusCode()).as(est.body()).isEqualTo(200);
        assertThat(est.body()).contains("\"status\":\"REVERSED\"", "Pago na conta errada");
        assertThat(titulo(t.get(0))).contains("\"status\":\"OPEN\"", "\"paidCents\":\"0\"", "\"balanceCents\":\"100000\"");
        assertThat(saldo(conta)).isEqualTo(1_000_000);
        assertThat(get("/api/v1/bank-accounts/" + conta + "/movements").body()).contains("\"amountCents\":\"40000\"",
                "Estorno do pagamento " + campo(p1.body(), "code"));

        // Pagar tudo liquida; a lista separa pagos e em aberto.
        assertThat(paga("s8-pg-00003", conta, 100_000, aloca(t.get(0), 100_000)).statusCode()).isEqualTo(201);
        assertThat(titulo(t.get(0))).contains("\"status\":\"SETTLED\"", "\"balanceCents\":\"0\"");
        assertThat(ids(get("/api/v1/payables?status=PAGOS").body())).containsExactly(t.get(0));
        assertThat(ids(get("/api/v1/payables?status=ABERTOS").body())).containsExactly(t.get(1), t.get(2));
        assertThat(ids(get("/api/v1/payables?status=A_VENCER").body())).containsExactly(t.get(1), t.get(2));
        assertThat(ids(get("/api/v1/payables?search=4521").body())).containsExactly(t.get(0), t.get(1), t.get(2));
        assertThat(get("/api/v1/receivables").body()).doesNotContain(t.get(0));

        // Trilha e eventos.
        assertThat(get("/api/v1/payables/" + t.get(0) + "/history").body()).contains("FINANCIAL_TITLE_CREATED",
                "FINANCIAL_TITLE_SETTLED", "FINANCIAL_TITLE_SETTLEMENT_REVERSED", "Pago na conta errada");
        assertThat(conta("select count(*) from outbox_event where event_type = 'SettlementPosted' and payload->>'direction' = 'PAYABLE'"))
                .isEqualTo(2);
        pagoConfereComAlocacoes();
    }

    @Test
    void pagamentoPodeDeixarAContaNegativa() throws Exception {
        String t = ids(registra("s8-cp-neg", "FRETE", 50_000, 50_000).body()).getFirst();
        // O Caixa começa em zero; pagar R$ 500,00 deixa −R$ 500,00 (decisão do PO: aceita, a tela avisa).
        HttpResponse<String> p = paga("s8-pg-neg", caixa, 50_000, aloca(t, 50_000));
        assertThat(p.statusCode()).as(p.body()).isEqualTo(201);
        assertThat(saldo(caixa)).isEqualTo(-50_000);
    }

    @Test
    void cancelarTituloManualSoSemPagamento() throws Exception {
        List<String> t = ids(registra("s8-cp-canc", "ALUGUEL", 200_000, 100_000, 100_000).body());
        assertThat(withVersion("POST", "/api/v1/payables/" + t.get(0) + "/cancellation", "1", "{}").body()).contains("\"field\":\"reason\"");
        HttpResponse<String> c = withVersion("POST", "/api/v1/payables/" + t.get(0) + "/cancellation", "1",
                "{\"reason\":\"Lançado em duplicidade\"}");
        assertThat(c.statusCode()).as(c.body()).isEqualTo(200);
        assertThat(c.body()).contains("\"status\":\"CANCELLED\"", "\"cancelReason\":\"Lançado em duplicidade\"", "\"balanceCents\":\"0\"");
        // Cancelar de novo não muda nada; cancelado não é pago.
        assertThat(withVersion("POST", "/api/v1/payables/" + t.get(0) + "/cancellation", "2", "{\"reason\":\"x\"}").body())
                .contains("\"version\":\"2\"");
        assertThat(paga("s8-pg-canc", caixa, 100, aloca(t.get(0), 100)).body()).contains("cancelado");

        // Com pagamento: recusado até estornar.
        HttpResponse<String> p = paga("s8-pg-canc2", caixa, 10_000, aloca(t.get(1), 10_000));
        HttpResponse<String> recusa = withVersion("POST", "/api/v1/payables/" + t.get(1) + "/cancellation", "2", "{\"reason\":\"Erro\"}");
        assertThat(recusa.statusCode()).isEqualTo(409);
        assertThat(recusa.body()).contains("estorne o pagamento antes de cancelar");
        // Versão desatualizada: 412.
        assertThat(withVersion("POST", "/api/v1/payables/" + t.get(1) + "/cancellation", "1", "{\"reason\":\"Erro\"}").statusCode())
                .isEqualTo(412);
        assertThat(conta("select count(*) from outbox_event where event_type = 'FinancialTitleCancelled'")).isEqualTo(1);
        assertThat(p.statusCode()).isEqualTo(201);
    }

    @Test
    void pagamentosSimultaneosNaoPassamDoSaldo() throws Exception {
        String t = ids(registra("s8-cp-conc", "MATERIAIS", 100_000, 100_000).body()).getFirst();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch largada = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> rs = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String chave = "s8-pg-conc-" + i;
            rs.add(pool.submit(() -> {
                largada.await();
                return paga(chave, caixa, 70_000, aloca(t, 70_000));
            }));
        }
        largada.countDown();
        List<Integer> status = new ArrayList<>();
        for (Future<HttpResponse<String>> f : rs) status.add(f.get().statusCode());
        pool.shutdown();
        assertThat(status).containsExactlyInAnyOrder(201, 422);
        assertThat(titulo(t)).contains("\"paidCents\":\"70000\"", "\"balanceCents\":\"30000\"");
        assertThat(saldo(caixa)).isEqualTo(-70_000);
        pagoConfereComAlocacoes();
    }

    @Test
    void dasNasceDaConferenciaEReconferirNaoDuplica() throws Exception {
        String c = "2026-09";
        HttpResponse<String> conf = withVersion("POST", "/api/v1/tax-periods/" + c + "/confirmations", "0",
                "{\"amountCents\":\"133000\",\"dueDate\":\"2026-10-20\"}");
        assertThat(conf.statusCode()).as(conf.body()).isEqualTo(201);
        String das = campo(conf.body(), "titleId");
        assertThat(conf.body()).contains("\"titleStatus\":\"OPEN\"", "\"titleBalanceCents\":\"133000\"");
        String t = titulo(das);
        assertThat(t).contains("\"supplierId\":\"" + RECEITA_FEDERAL + "\"", "\"supplierName\":\"Receita Federal — DAS\"",
                "\"originType\":\"TAX_PERIOD\"", "\"origin\":\"DAS 09/2026\"", "\"category\":\"IMPOSTOS_SIMPLES\"", "\"competence\":\"2026-09\"",
                "\"dueDate\":\"2026-10-20\"", "\"originalCents\":\"133000\"");
        assertThat(campo(conf.body(), "titleCode")).isEqualTo(campo(t, "code"));
        assertThat(jdbc.sql("select payload->>'titleId' from outbox_event where event_type = 'TaxPeriodConfirmed'").query(String.class).single())
                .isEqualTo(das);
        // O DAS só é cancelado pela reconferência.
        assertThat(withVersion("POST", "/api/v1/payables/" + das + "/cancellation", "1", "{\"reason\":\"x\"}").body())
                .contains("nova conferência do contador");

        // Reconferir sem pagamento: o anterior é cancelado e nasce outro; um só DAS ativo.
        HttpResponse<String> reconf = withVersion("POST", "/api/v1/tax-periods/" + c + "/confirmations", "1",
                "{\"amountCents\":\"133500\",\"dueDate\":\"2026-10-20\",\"notes\":\"Retificação do PGDAS-D\"}");
        assertThat(reconf.statusCode()).as(reconf.body()).isEqualTo(201);
        String das2 = campo(reconf.body(), "titleId");
        assertThat(das2).isNotEqualTo(das);
        assertThat(titulo(das)).contains("\"status\":\"CANCELLED\"", "Substituído pela conferência 2 do contador.");
        assertThat(conta("select count(*) from financial_title where origin_type = 'TAX_PERIOD' and lifecycle = 'ACTIVE'")).isEqualTo(1);
        assertThat(get("/api/v1/tax-periods/" + c).body()).contains("\"titleStatus\":\"CANCELLED\"", "\"titleStatus\":\"OPEN\"");

        // Com pagamento: reconferir é recusado até estornar o pagamento.
        HttpResponse<String> p = paga("s8-pg-das", caixa, 133_500, aloca(das2, 133_500));
        assertThat(p.statusCode()).as(p.body()).isEqualTo(201);
        HttpResponse<String> recusa = withVersion("POST", "/api/v1/tax-periods/" + c + "/confirmations", "2",
                "{\"amountCents\":\"134000\",\"dueDate\":\"2026-10-20\"}");
        assertThat(recusa.statusCode()).isEqualTo(422);
        assertThat(recusa.body()).contains("TAX_DAS_PAID", "estorne o pagamento do DAS");
        assertThat(conta("select count(*) from accountant_confirmation")).isEqualTo(2);
        assertThat(post("/api/v1/settlements/" + campo(p.body(), "id") + "/reversals", null, "{\"reason\":\"Valor retificado\"}")
                .statusCode()).isEqualTo(200);

        // Conferência de R$ 0,00: cancela o DAS aberto e não cria outro.
        HttpResponse<String> zero = withVersion("POST", "/api/v1/tax-periods/" + c + "/confirmations", "2",
                "{\"amountCents\":\"0\",\"dueDate\":\"2026-10-20\"}");
        assertThat(zero.statusCode()).as(zero.body()).isEqualTo(201);
        assertThat(conta("select count(*) from financial_title where origin_type = 'TAX_PERIOD' and lifecycle = 'ACTIVE'")).isZero();
        assertThat(conta("select count(*) from accountant_confirmation where title_id is null")).isEqualTo(1);
        assertThat(get("/api/v1/tax-periods/" + c + "/history").body()).contains("\"dasTitle\"");
    }

    @Test
    void perfilConsultaVeMasNaoRegistraNemPagaNemCancela() throws Exception {
        String t = ids(registra("s8-cp-cons", "FRETE", 10_000, 10_000).body()).getFirst();
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/payables", consulta, null, Map.of()).body()).contains(t);
        assertThat(call("GET", "/api/v1/financial-categories", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("POST", "/api/v1/payables", consulta, "{}", Map.of("Idempotency-Key", "s8-cons-0001")).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/settlements", consulta, """
                {"direction":"PAYABLE","accountId":"%s","effectiveDate":"%s","amountCents":"100","allocations":[%s]}
                """.formatted(caixa, HOJE, aloca(t, 100)), Map.of("Idempotency-Key", "s8-cons-0002")).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/payables/" + t + "/cancellation", consulta, "{\"reason\":\"x\"}", Map.of("If-Match", "\"1\""))
                .statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/financial-categories", consulta, "{\"name\":\"Viagens\"}", Map.of()).statusCode()).isEqualTo(403);
    }
}
