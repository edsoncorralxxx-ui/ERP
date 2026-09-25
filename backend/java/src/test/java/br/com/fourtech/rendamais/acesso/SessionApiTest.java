package br.com.fourtech.rendamais.acesso;

import br.com.fourtech.rendamais.IntegrationTest;
import br.com.fourtech.rendamais.acesso.api.Profile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** S2-02 contra PostgreSQL real: login, bloqueio, expiração, revogação, permissões e administração de usuários. */
class SessionApiTest extends IntegrationTest {

    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void limpa() {
        adminToken();
        jdbc.sql("delete from user_session").update();
        jdbc.sql("delete from audit_event").update();
        jdbc.sql("delete from app_user where username not in (:a, :c)").param("a", ADMIN).param("c", CONSULTA).update();
        login(CONSULTA, Profile.CONSULTA);
        jdbc.sql("delete from user_session").update();
    }

    private HttpResponse<String> call(String method, String path, String token, String body, String ifMatch) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (ifMatch != null) b.header("If-Match", ifMatch);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> entrar(String user, String senha) throws Exception {
        return call("POST", "/api/v1/session", null, "{\"username\":\"" + user + "\",\"password\":\"" + senha + "\"}", null);
    }

    private static String token(HttpResponse<String> r) {
        Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(r.body());
        assertThat(m.find()).as("token na resposta: " + r.body()).isTrue();
        return m.group(1);
    }

    private long auditoria(String acao) {
        return jdbc.sql("select count(*) from audit_event where action = :a").param("a", acao).query(Long.class).single();
    }

    @Test
    void semSessaoTodaApiDevolve401ExcetoStatus() throws Exception {
        assertThat(call("GET", "/api/v1/company-profile", null, null, null).statusCode()).isEqualTo(401);
        assertThat(call("GET", "/api/v1/company-profile", "token-inventado", null, null).body()).contains("UNAUTHENTICATED");
        assertThat(call("GET", "/api/v1/status", null, null, null).statusCode()).isEqualTo(200);
    }

    @Test
    void loginDevolveTokenEUsuarioSemSenhaEGravaSoOHash() throws Exception {
        HttpResponse<String> r = entrar(" Admin.Teste ", SENHA);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"username\":\"admin.teste\"", "\"profile\":\"ADMINISTRADOR\"", "user.admin")
                .doesNotContain(SENHA, "password");
        String t = token(r);
        String hash = jdbc.sql("select token_hash from user_session").query(String.class).single();
        assertThat(hash).hasSize(64).isNotEqualTo(t);
        assertThat(call("GET", "/api/v1/session", t, null, null).body()).contains("\"displayName\"");
        assertThat(auditoria("LOGIN_SUCCEEDED")).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from audit_event where changes::text like :s").param("s", "%" + SENHA + "%")
                .query(Long.class).single()).isZero();
    }

    @Test
    void senhaErradaEUsuarioInexistenteRecebemAMesmaMensagem() throws Exception {
        HttpResponse<String> errada = entrar(ADMIN, "senha-errada-000");
        HttpResponse<String> inexistente = entrar("ninguem", "senha-errada-000");
        assertThat(errada.statusCode()).isEqualTo(401);
        assertThat(inexistente.statusCode()).isEqualTo(401);
        assertThat(errada.body()).contains("INVALID_CREDENTIALS", "Usuário ou senha incorretos.");
        assertThat(inexistente.body()).contains("INVALID_CREDENTIALS", "Usuário ou senha incorretos.");
        assertThat(auditoria("LOGIN_FAILED")).isEqualTo(2);
    }

    @Test
    void cincoSenhasErradasBloqueiamAteOAdministradorRedefinir() throws Exception {
        for (int i = 0; i < 4; i++) {
            assertThat(entrar(CONSULTA, "senha-errada-000").body()).contains("INVALID_CREDENTIALS");
        }
        assertThat(entrar(CONSULTA, "senha-errada-000").body()).contains("ACCOUNT_LOCKED");
        HttpResponse<String> certa = entrar(CONSULTA, SENHA);
        assertThat(certa.statusCode()).isEqualTo(401);
        assertThat(certa.body()).contains("ACCOUNT_LOCKED", "Tente de novo após");

        String admin = token(entrar(ADMIN, SENHA));
        String id = jdbc.sql("select id::text from app_user where username = :u").param("u", CONSULTA).query(String.class).single();
        HttpResponse<String> reset = call("POST", "/api/v1/users/" + id + "/password", admin, "{\"password\":\"nova-senha-4567\"}", null);
        assertThat(reset.statusCode()).isEqualTo(200);
        assertThat(entrar(CONSULTA, "nova-senha-4567").statusCode()).isEqualTo(200);
        jdbc.sql("update app_user set password_hash = (select password_hash from app_user where username = :a) where username = :c")
                .param("a", ADMIN).param("c", CONSULTA).update();
    }

    @Test
    void sairRevogaNaHora() throws Exception {
        String t = token(entrar(ADMIN, SENHA));
        assertThat(call("DELETE", "/api/v1/session", t, null, null).statusCode()).isEqualTo(204);
        assertThat(call("GET", "/api/v1/session", t, null, null).statusCode()).isEqualTo(401);
        assertThat(auditoria("LOGOUT")).isEqualTo(1);
    }

    @Test
    void sessaoParadaPor8HorasOuCom12HorasExpira() throws Exception {
        String parada = token(entrar(ADMIN, SENHA));
        jdbc.sql("update user_session set last_seen_at = now() - interval '8 hours 1 minute'").update();
        assertThat(call("GET", "/api/v1/session", parada, null, null).statusCode()).isEqualTo(401);

        String velha = token(entrar(ADMIN, SENHA));
        jdbc.sql("update user_session set expires_at = now() - interval '1 second' where revoked_at is null").update();
        assertThat(call("GET", "/api/v1/session", velha, null, null).statusCode()).isEqualTo(401);
        assertThat(jdbc.sql("select count(*) from user_session where revoked_at is null").query(Long.class).single()).isZero();
    }

    @Test
    void perfilConsultaLeMasNaoAlteraEANegativaFicaNaAuditoria() throws Exception {
        String t = token(entrar(CONSULTA, SENHA));
        assertThat(call("GET", "/api/v1/company-profile", t, null, null).statusCode()).isEqualTo(200);
        HttpResponse<String> negado = call("PUT", "/api/v1/company-profile", t, "{\"legalName\":\"X\"}", "\"0\"");
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(negado.body()).contains("FORBIDDEN", "company.update");
        assertThat(call("GET", "/api/v1/users", t, null, null).statusCode()).isEqualTo(403);
        assertThat(auditoria("ACCESS_DENIED")).isEqualTo(2);
    }

    @Test
    void administradorCriaUsuarioSemExporSenhaEDesativarEncerraSessoes() throws Exception {
        String admin = token(entrar(ADMIN, SENHA));
        HttpResponse<String> curta = call("POST", "/api/v1/users", admin,
                "{\"username\":\"maria\",\"displayName\":\"Maria\",\"profile\":\"CONSULTA\",\"password\":\"curta\"}", null);
        assertThat(curta.statusCode()).isEqualTo(422);
        assertThat(curta.body()).contains("\"field\":\"password\"");

        HttpResponse<String> criado = call("POST", "/api/v1/users", admin,
                "{\"username\":\"Maria.Silva\",\"displayName\":\"Maria Silva\",\"profile\":\"CONSULTA\",\"password\":\"senha-da-maria-1\"}", null);
        assertThat(criado.statusCode()).isEqualTo(201);
        assertThat(criado.body()).contains("\"username\":\"maria.silva\"", "\"version\":\"1\"").doesNotContain("senha-da-maria-1", "hash");
        assertThat(call("POST", "/api/v1/users", admin,
                "{\"username\":\"maria.silva\",\"displayName\":\"Outra\",\"profile\":\"CONSULTA\",\"password\":\"senha-da-maria-2\"}", null)
                .body()).contains("USERNAME_TAKEN");

        String maria = token(entrar("maria.silva", "senha-da-maria-1"));
        String id = jdbc.sql("select id::text from app_user where username = 'maria.silva'").query(String.class).single();
        HttpResponse<String> desativa = call("PUT", "/api/v1/users/" + id, admin,
                "{\"displayName\":\"Maria Silva\",\"profile\":\"CONSULTA\",\"active\":false}", "\"1\"");
        assertThat(desativa.statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/session", maria, null, null).statusCode()).isEqualTo(401);
        assertThat(entrar("maria.silva", "senha-da-maria-1").statusCode()).isEqualTo(401);
        assertThat(jdbc.sql("select changes::text from audit_event where action = 'USER_UPDATED'").query(String.class).single())
                .contains("active");
    }

    @Test
    void naoRetiraOProprioAcessoDeAdministrador() throws Exception {
        String admin = token(entrar(ADMIN, SENHA));
        String id = jdbc.sql("select id::text from app_user where username = :u").param("u", ADMIN).query(String.class).single();
        String versao = jdbc.sql("select version::text from app_user where id = cast(:id as uuid)").param("id", id).query(String.class).single();
        HttpResponse<String> r = call("PUT", "/api/v1/users/" + id, admin,
                "{\"displayName\":\"Admin\",\"profile\":\"CONSULTA\",\"active\":true}", "\"" + versao + "\"");
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("USER_SELF_LOCKOUT");
    }

    @Test
    void trocaDaPropriaSenhaConfereAAtualEEncerraAsSessoes() throws Exception {
        String t = token(entrar(CONSULTA, SENHA));
        assertThat(call("POST", "/api/v1/session/password", t, "{\"currentPassword\":\"errada-errada\",\"newPassword\":\"outra-senha-999\"}", null)
                .statusCode()).isEqualTo(422);
        assertThat(call("POST", "/api/v1/session/password", t, "{\"currentPassword\":\"" + SENHA + "\",\"newPassword\":\"outra-senha-999\"}", null)
                .statusCode()).isEqualTo(204);
        assertThat(call("GET", "/api/v1/session", t, null, null).statusCode()).isEqualTo(401);
        assertThat(entrar(CONSULTA, "outra-senha-999").statusCode()).isEqualTo(200);
        jdbc.sql("update app_user set password_hash = (select password_hash from app_user where username = :a) where username = :c")
                .param("a", ADMIN).param("c", CONSULTA).update();
    }
}
