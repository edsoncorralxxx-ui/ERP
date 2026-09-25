package br.com.fourtech.rendamais.cadastros;

import br.com.fourtech.rendamais.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Base dos testes de API dos cadastros da Sprint 3: banco limpo, chamada HTTP autenticada e leitura de campos. */
abstract class CadastrosApiTest extends IntegrationTest {

    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newHttpClient();
    protected String admin;

    @BeforeEach
    void limpaCadastros() {
        admin = adminToken();
        jdbc.sql("delete from operational_fact").update();
        jdbc.sql("delete from event_consumption").update();
        jdbc.sql("delete from outbox_event").update();
        jdbc.sql("delete from command_receipt").update();
        jdbc.sql("delete from item").update();
        jdbc.sql("delete from partner").update();
        jdbc.sql("delete from item_category").update();
        jdbc.sql("delete from unit_of_measure where created_by <> 'sistema'").update();
        jdbc.sql("update unit_of_measure set status = 'ATIVO'").update();
        jdbc.sql("delete from audit_event").update();
    }

    protected HttpResponse<String> call(String method, String path, String token, String body, Map<String, String> headers) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").header("Authorization", "Bearer " + token)
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        headers.forEach(b::header);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    protected HttpResponse<String> get(String path) throws Exception {
        return call("GET", path, admin, null, Map.of());
    }

    protected HttpResponse<String> post(String path, String key, String body) throws Exception {
        return call("POST", path, admin, body, key == null ? Map.of() : Map.of("Idempotency-Key", key));
    }

    protected HttpResponse<String> withVersion(String method, String path, String version, String body) throws Exception {
        return call(method, path, admin, body, Map.of("If-Match", "\"" + version + "\""));
    }

    protected static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]*)\"").matcher(json);
        assertThat(m.find()).as(nome + " em " + json).isTrue();
        return m.group(1);
    }

    protected long conta(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    /** Cria uma categoria pelo endpoint do Administrador e devolve o id. */
    protected String categoria(String nome) throws Exception {
        HttpResponse<String> r = post("/api/v1/item-categories", null, "{\"name\":\"" + nome + "\"}");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return campo(r.body(), "id");
    }
}
