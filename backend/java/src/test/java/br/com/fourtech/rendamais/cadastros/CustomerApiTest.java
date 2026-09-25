package br.com.fourtech.rendamais.cadastros;

import br.com.fourtech.rendamais.IntegrationTest;
import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.plataforma.eventos.DomainEvent;
import br.com.fourtech.rendamais.plataforma.eventos.OutboxDispatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** S2-05, S2-06, S2-07 e S2-09 contra PostgreSQL real. */
class CustomerApiTest extends IntegrationTest {

    @LocalServerPort
    int port;

    @Autowired
    OutboxDispatcher dispatcher;

    @Autowired
    TransactionTemplate tx;

    private final HttpClient http = HttpClient.newHttpClient();
    private String admin;

    private static final String CLIENTE = """
            {"legalName":"Fecularia Vale do Paranapanema Ltda.","tradeName":"Vale do Paranapanema","cnpj":"11.222.333/0001-81",
             "group":"Fecularias",
             "units":[{"name":"Matriz","street":"Rodovia SP-333","number":"km 12","city":"Cândido Mota","state":"sp","postalCode":"19880-000"},
                      {"name":"Filial Assis","city":"Assis","state":"SP"}],
             "contacts":[{"name":"João Pereira","role":"Gerente industrial","phone":"(18) 3341-0000","email":"joao@exemplo.com.br"}]}
            """;

    @BeforeEach
    void limpa() {
        admin = adminToken();
        jdbc.sql("delete from operational_fact").update();
        jdbc.sql("delete from event_consumption").update();
        jdbc.sql("delete from outbox_event").update();
        jdbc.sql("delete from command_receipt").update();
        jdbc.sql("delete from partner").update();
        jdbc.sql("delete from audit_event").update();
    }

    private HttpResponse<String> call(String method, String path, String token, String body, Map<String, String> headers) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").header("Authorization", "Bearer " + token)
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        headers.forEach(b::header);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> cadastra(String key, String body) throws Exception {
        return call("POST", "/api/v1/customers", admin, body, key == null ? Map.of() : Map.of("Idempotency-Key", key));
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]*)\"").matcher(json);
        assertThat(m.find()).as(nome + " em " + json).isTrue();
        return m.group(1);
    }

    private long conta(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    @Test
    void cadastraComUnidadesEContatosCodigoDoSistemaEAuditoria() throws Exception {
        HttpResponse<String> r = cadastra("cad-cliente-0001", CLIENTE);
        assertThat(r.statusCode()).isEqualTo(201);
        assertThat(r.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(r.body()).contains("\"cnpjFormatted\":\"11.222.333/0001-81\"", "\"state\":\"SP\"", "\"postalCode\":\"19880000\"",
                "\"status\":\"ATIVO\"", "\"createdBy\":\"admin.teste\"", "João Pereira");
        assertThat(campo(r.body(), "code")).matches("C\\d{5}");
        String changes = jdbc.sql("select changes::text from audit_event where action = 'PARTNER_REGISTERED'").query(String.class).single();
        assertThat(changes).contains("Fecularia Vale do Paranapanema Ltda.", "Matriz — Rodovia SP-333, km 12, Cândido Mota/SP, CEP 19880-000");

        HttpResponse<String> lista = call("GET", "/api/v1/customers?search=paranapanema", admin, null, Map.of());
        assertThat(lista.body()).contains("\"city\":\"Cândido Mota\"", "\"units\":2");
        assertThat(call("GET", "/api/v1/customers?search=22233", admin, null, Map.of()).body()).contains("Vale do Paranapanema");
        assertThat(call("GET", "/api/v1/customers?search=inexistente", admin, null, Map.of()).body()).isEqualTo("[]");
    }

    @Test
    void semChaveDeIdempotenciaORegistroNaoECriado() throws Exception {
        HttpResponse<String> r = cadastra(null, CLIENTE);
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("IDEMPOTENCY_KEY_REQUIRED");
        assertThat(conta("select count(*) from partner")).isZero();
    }

    @Test
    void repetirComAMesmaChaveDevolveOMesmoClienteSemDuplicar() throws Exception {
        String primeiro = campo(cadastra("resposta-perdida-01", CLIENTE).body(), "id");
        HttpResponse<String> repetido = cadastra("resposta-perdida-01", CLIENTE);
        assertThat(repetido.statusCode()).isEqualTo(201);
        assertThat(campo(repetido.body(), "id")).isEqualTo(primeiro);
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
        assertThat(conta("select count(*) from outbox_event")).isEqualTo(1);

        HttpResponse<String> outro = cadastra("resposta-perdida-01", CLIENTE.replace("Matriz", "Sede"));
        assertThat(outro.statusCode()).isEqualTo(422);
        assertThat(outro.body()).contains("IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    void reenviosSimultaneosComAMesmaChaveCriamUmSo() throws Exception {
        int n = 6;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpResponse<String>>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return cadastra("reenvio-simultaneo-1", CLIENTE);
            }));
        }
        start.countDown();
        List<String> ids = new ArrayList<>();
        for (Future<HttpResponse<String>> f : results) {
            HttpResponse<String> r = f.get();
            assertThat(r.statusCode()).isEqualTo(201);
            ids.add(campo(r.body(), "id"));
        }
        pool.shutdown();
        assertThat(ids).allMatch(ids.getFirst()::equals);
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
    }

    @Test
    void validaCamposUnidadesEContatosDeUmaVez() throws Exception {
        HttpResponse<String> r = cadastra("cad-invalido-0001", """
                {"legalName":" ","cnpj":"11.222.333/0001-82","units":[{"name":"","state":"XX","postalCode":"123"}],
                 "contacts":[{"name":"Ana","email":"sem-arroba"}]}
                """);
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("PARTNER_INVALID", "\"field\":\"legalName\"", "\"field\":\"cnpj\"", "\"field\":\"units[0].name\"",
                "\"field\":\"units[0].state\"", "\"field\":\"units[0].postalCode\"", "\"field\":\"contacts[0].email\"");
        assertThat(conta("select count(*) from partner") + conta("select count(*) from outbox_event")).isZero();
    }

    @Test
    void cnpjRepetidoApontaOClienteExistenteECnpjAusenteNaoEInventado() throws Exception {
        String codigo = campo(cadastra("cad-cnpj-000001", CLIENTE).body(), "code");
        HttpResponse<String> dup = cadastra("cad-cnpj-000002", CLIENTE.replace("Fecularia Vale", "Outra Fecularia"));
        assertThat(dup.statusCode()).isEqualTo(422);
        assertThat(dup.body()).contains("PARTNER_CNPJ_DUPLICATE", codigo);
        HttpResponse<String> semCnpj = cadastra("cad-cnpj-000003", "{\"legalName\":\"Cliente sem CNPJ\"}");
        assertThat(semCnpj.statusCode()).isEqualTo(201);
        assertThat(semCnpj.body()).contains("\"cnpj\":null");
    }

    @Test
    void edicaoComVersaoMantemIdsDasUnidadesEDesatualizadaNaoGrava() throws Exception {
        HttpResponse<String> criado = cadastra("cad-edicao-00001", CLIENTE);
        String id = campo(criado.body(), "id");
        String matriz = jdbc.sql("select id::text from partner_unit where name = 'Matriz'").query(String.class).single();
        String edicao = """
                {"legalName":"Fecularia Vale do Paranapanema Ltda.","tradeName":"Vale","cnpj":"11222333000181","group":"Fecularias",
                 "units":[{"id":"%s","name":"Matriz","city":"Cândido Mota","state":"SP"}],"contacts":[]}
                """.formatted(matriz);
        HttpResponse<String> ok = call("PUT", "/api/v1/customers/" + id, admin, edicao, Map.of("If-Match", "\"1\""));
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(ok.headers().firstValue("ETag")).hasValue("\"2\"");
        assertThat(ok.body()).contains("\"id\":\"" + matriz + "\"", "\"tradeName\":\"Vale\"", "\"contacts\":[]");

        HttpResponse<String> velho = call("PUT", "/api/v1/customers/" + id, admin, edicao.replace("\"Vale\"", "\"X\""), Map.of("If-Match", "\"1\""));
        assertThat(velho.statusCode()).isEqualTo(412);
        assertThat(velho.body()).contains("VERSION_MISMATCH", "atual=2");
        assertThat(call("PUT", "/api/v1/customers/" + id, admin, edicao, Map.of()).statusCode()).isEqualTo(428);

        HttpResponse<String> hist = call("GET", "/api/v1/customers/" + id + "/history", admin, null, Map.of());
        assertThat(hist.body()).contains("PARTNER_UPDATED", "PARTNER_REGISTERED", "\"tradeName\":{\"before\":\"Vale do Paranapanema\",\"after\":\"Vale\"}",
                "\"actor\":\"admin.teste\"", "contacts");
        assertThat(hist.body().indexOf("PARTNER_UPDATED")).isLessThan(hist.body().indexOf("PARTNER_REGISTERED"));
    }

    @Test
    void inativarExigeMotivoPreservaORegistroEEIdempotente() throws Exception {
        String id = campo(cadastra("cad-inativa-0001", CLIENTE).body(), "id");
        assertThat(call("POST", "/api/v1/customers/" + id + "/deactivate", admin, "{}", Map.of("If-Match", "\"1\"")).statusCode())
                .isEqualTo(422);
        HttpResponse<String> r = call("POST", "/api/v1/customers/" + id + "/deactivate", admin, "{\"reason\":\"Encerrou as atividades\"}",
                Map.of("If-Match", "\"1\""));
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"status\":\"INATIVO\"", "\"version\":\"2\"");
        HttpResponse<String> de_novo = call("POST", "/api/v1/customers/" + id + "/deactivate", admin, "{\"reason\":\"de novo\"}",
                Map.of("If-Match", "\"1\""));
        assertThat(de_novo.statusCode()).isEqualTo(200);
        assertThat(conta("select count(*) from audit_event where action = 'PARTNER_DEACTIVATED'")).isEqualTo(1);
        assertThat(call("GET", "/api/v1/customers", admin, null, Map.of()).body()).isEqualTo("[]");
        assertThat(call("GET", "/api/v1/customers?status=INATIVO", admin, null, Map.of()).body()).contains(id);
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'PartnerDeactivated'").query(String.class).single())
                .contains("Encerrou as atividades");
    }

    @Test
    void perfilConsultaLeMasNaoCadastra() throws Exception {
        cadastra("cad-consulta-0001", CLIENTE);
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/customers", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        HttpResponse<String> negado = call("POST", "/api/v1/customers", consulta, CLIENTE, Map.of("Idempotency-Key", "cad-consulta-0002"));
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(negado.body()).contains("partner.create");
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
    }

    @Test
    void eventosViramFatosUmaVezSoMesmoEntreguesDeNovo() throws Exception {
        String id = campo(cadastra("cad-eventos-0001", CLIENTE).body(), "id");
        call("PUT", "/api/v1/customers/" + id, admin, CLIENTE.replace("Vale do Paranapanema\",\"cnpj", "Vale\",\"cnpj"), Map.of("If-Match", "\"1\""));
        assertThat(jdbc.sql("select event_type from outbox_event order by occurred_at").query(String.class).list())
                .containsExactly("PartnerRegistered", "PartnerUpdated");
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'PartnerUpdated'").query(String.class).single())
                .contains("changedFields", "tradeName");

        dispatcher.dispatchPending();
        assertThat(conta("select count(*) from outbox_event where published_at is null")).isZero();
        assertThat(conta("select count(*) from operational_fact")).isEqualTo(2);

        UUID eventId = jdbc.sql("select id from outbox_event where event_type = 'PartnerRegistered'").query(UUID.class).single();
        DomainEvent repetido = new DomainEvent(eventId, "PartnerRegistered", "partner", id, Map.of("partnerId", id), Instant.now(), "admin.teste", null);
        tx.executeWithoutResult(t -> dispatcher.deliver(repetido));
        assertThat(conta("select count(*) from operational_fact")).isEqualTo(2);
    }
}
