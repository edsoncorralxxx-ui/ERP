package br.com.fourtech.rendamais.plataforma.empresa;

import br.com.fourtech.rendamais.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/** Fatia de ponta a ponta S1-07 contra PostgreSQL real: HTTP → serviço → banco → auditoria. */
class CompanyProfileApiTest extends IntegrationTest {

    @LocalServerPort
    int port;

    String token;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void reset() {
        token = adminToken();
        jdbc.sql("delete from audit_event").update();
        jdbc.sql("""
                update company_profile set legal_name = null, trade_name = null, cnpj = null, street = null, number = null,
                  complement = null, district = null, city = null, state = null, postal_code = null, phone = null,
                  email = null, configured = false, version = 0, updated_at = null, updated_by = null
                """).update();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                        .header("Authorization", "Bearer " + token).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> put(String ifMatch, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/company-profile"))
                .header("Content-Type", "application/json")
                .header("X-Correlation-Id", "teste-empresa-0001")
                .header("Authorization", "Bearer " + token)
                .PUT(HttpRequest.BodyPublishers.ofString(body));
        if (ifMatch != null) {
            b.header("If-Match", ifMatch);
        }
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static final String VALIDO = """
            {"legalName":"Fourtech Demonstração Ltda","tradeName":"Renda+","cnpj":"11.222.333/0001-81",
             "address":{"street":"Rua Exemplo","number":"100","city":"Maringá","state":"pr","postalCode":"87000-000"},
             "phone":"(44) 3000-0000","email":"contato@exemplo.com.br"}
            """;

    @Test
    void statusInformaServidorEBanco() throws Exception {
        HttpResponse<String> r = get("/api/v1/status");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"status\":\"UP\"", "\"database\":\"UP\"", "\"apiVersion\":\"v1\"");
        assertThat(r.headers().firstValue("X-Correlation-Id")).isPresent();
    }

    @Test
    void consultaInicialNaoConfiguradaComVersaoZero() throws Exception {
        HttpResponse<String> r = get("/api/v1/company-profile");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("ETag")).hasValue("\"0\"");
        assertThat(r.body()).contains("\"configured\":false", "\"version\":\"0\"");
    }

    @Test
    void salvaNormalizaPersisteEAudita() throws Exception {
        HttpResponse<String> r = put("\"0\"", VALIDO);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(r.body()).contains("\"cnpj\":\"11222333000181\"", "\"cnpjFormatted\":\"11.222.333/0001-81\"",
                "\"state\":\"PR\"", "\"postalCode\":\"87000000\"", "\"configured\":true", "\"updatedBy\":\"admin.teste\"");

        HttpResponse<String> again = get("/api/v1/company-profile");
        assertThat(again.body()).contains("Fourtech Demonstração Ltda", "\"version\":\"1\"");

        String changes = jdbc.sql("select changes::text from audit_event where action = 'COMPANY_PROFILE_UPDATED'")
                .query(String.class).single();
        assertThat(changes).contains("legalName", "Fourtech Demonstração Ltda");
        String correlation = jdbc.sql("select correlation_id from audit_event").query(String.class).single();
        assertThat(correlation).isEqualTo("teste-empresa-0001");
    }

    @Test
    void versaoDesatualizadaNaoSobrescreve() throws Exception {
        assertThat(put("\"0\"", VALIDO).statusCode()).isEqualTo(200);
        HttpResponse<String> stale = put("\"0\"", VALIDO.replace("Renda+", "Outro nome"));
        assertThat(stale.statusCode()).isEqualTo(412);
        assertThat(stale.body()).contains("\"code\":\"VERSION_MISMATCH\"", "atual=1");
        assertThat(get("/api/v1/company-profile").body()).contains("\"tradeName\":\"Renda+\"");
    }

    @Test
    void semIfMatchExigePrecondicao() throws Exception {
        HttpResponse<String> r = put(null, VALIDO);
        assertThat(r.statusCode()).isEqualTo(428);
        assertThat(r.body()).contains("PRECONDITION_REQUIRED");
    }

    @Test
    void camposInvalidosVoltamTodosComMensagensEmPortugues() throws Exception {
        HttpResponse<String> r = put("\"0\"", """
                {"legalName":"  ","cnpj":"11.222.333/0001-82","address":{"state":"XX","postalCode":"123"},"email":"sem-arroba"}
                """);
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("COMPANY_PROFILE_INVALID", "\"field\":\"legalName\"", "\"field\":\"cnpj\"",
                "\"field\":\"address.state\"", "\"field\":\"address.postalCode\"", "\"field\":\"email\"", "correlationId");
        assertThat(jdbc.sql("select count(*) from audit_event").query(Long.class).single()).isZero();
    }

    @Test
    void jsonMalformadoRetornaErroPadronizadoSemDetalhesInternos() throws Exception {
        HttpResponse<String> r = put("\"0\"", "{nao-e-json");
        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(r.body()).contains("VALIDATION_FAILED").doesNotContain("Exception", "at br.com");
    }

    /** Duas gravações simultâneas com a mesma versão: exatamente uma vence, a outra recebe conflito. */
    @Test
    void gravacoesConcorrentesNaoSeSobrescrevem() throws Exception {
        int n = 8;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String body = VALIDO.replace("Renda+", "Renda+ " + i);
            results.add(pool.submit(() -> {
                start.await();
                return put("\"0\"", body).statusCode();
            }));
        }
        start.countDown();
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : results) {
            codes.add(f.get());
        }
        pool.shutdown();
        assertThat(codes).filteredOn(c -> c == 200).hasSize(1);
        assertThat(codes).filteredOn(c -> c == 412).hasSize(n - 1);
        assertThat(jdbc.sql("select version from company_profile").query(Long.class).single()).isEqualTo(1L);
        assertThat(jdbc.sql("select count(*) from audit_event").query(Long.class).single()).isEqualTo(1L);
    }
}
