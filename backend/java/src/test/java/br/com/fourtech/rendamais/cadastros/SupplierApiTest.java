package br.com.fourtech.rendamais.cadastros;

import br.com.fourtech.rendamais.acesso.api.Profile;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** S3-01 e S3-02 contra PostgreSQL real: fornecedor como papel do parceiro. */
class SupplierApiTest extends CadastrosApiTest {

    private static final String CNPJ = "11.222.333/0001-81";

    private String fornecedor(String categoriaId) {
        return """
                {"legalName":"Aços Paraná Ltda.","tradeName":"Aços PR","cnpj":"%s","leadTimeDays":15,
                 "paymentTerms":"28/56 dias","suppliedCategoryIds":["%s"],
                 "contacts":[{"name":"Marta Lima","role":"Vendas","email":"marta@acospr.com.br"}]}
                """.formatted(CNPJ, categoriaId);
    }

    @Test
    void cadastraFornecedorComCodigoFCategoriasPrazoEAuditoria() throws Exception {
        String chapas = categoria("Chapas");
        HttpResponse<String> r = post("/api/v1/suppliers", "forn-cad-00001", fornecedor(chapas));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        assertThat(campo(r.body(), "code")).matches("F\\d{5}");
        assertThat(r.body()).contains("\"leadTimeDays\":15", "\"paymentTerms\":\"28/56 dias\"", "\"name\":\"Chapas\"",
                "\"status\":\"ATIVO\"", "\"customer\":false", "Marta Lima");
        assertThat(get("/api/v1/suppliers?search=a%C3%A7os").body()).contains("\"suppliedCategories\":\"Chapas\"", "\"leadTimeDays\":15");
        assertThat(get("/api/v1/customers").body()).isEqualTo("[]");
        assertThat(jdbc.sql("select changes::text from audit_event where action = 'PARTNER_REGISTERED'").query(String.class).single())
                .contains("Chapas", "28/56 dias", "supplierStatus");
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'PartnerRegistered'").query(String.class).single())
                .contains("FORNECEDOR");
        assertThat(post("/api/v1/suppliers", "forn-cad-00001", fornecedor(chapas)).body()).contains(campo(r.body(), "id"));
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
    }

    @Test
    void cnpjDeClienteNaoDuplicaOParceiroEOClienteViraFornecedor() throws Exception {
        String chapas = categoria("Chapas");
        HttpResponse<String> cliente = post("/api/v1/customers", "forn-cli-00001",
                "{\"legalName\":\"Aços Paraná Ltda.\",\"cnpj\":\"" + CNPJ + "\",\"units\":[{\"name\":\"Matriz\",\"city\":\"Curitiba\",\"state\":\"PR\"}]}");
        String id = campo(cliente.body(), "id");
        String codigo = campo(cliente.body(), "code");

        HttpResponse<String> dup = post("/api/v1/suppliers", "forn-cli-00002", fornecedor(chapas));
        assertThat(dup.statusCode()).isEqualTo(422);
        assertThat(dup.body()).contains("PARTNER_OTHER_ROLE", codigo, "\"field\":\"partnerId\",\"message\":\"" + id + "\"",
                "\"field\":\"version\",\"message\":\"1\"");
        assertThat(conta("select count(*) from partner")).isEqualTo(1);

        HttpResponse<String> vira = withVersion("POST", "/api/v1/suppliers/" + id + "/enable", "1", null);
        assertThat(vira.statusCode()).as(vira.body()).isEqualTo(200);
        assertThat(vira.body()).contains("\"code\":\"" + codigo + "\"", "\"customer\":true", "\"status\":\"ATIVO\"");
        assertThat(withVersion("POST", "/api/v1/suppliers/" + id + "/enable", "1", null).statusCode()).as("idempotente").isEqualTo(200);
        assertThat(conta("select count(*) from audit_event where action = 'PARTNER_ROLE_ENABLED'")).isEqualTo(1);

        // A ficha do fornecedor não mexe nas unidades do cliente.
        HttpResponse<String> edita = withVersion("PUT", "/api/v1/suppliers/" + id, "2", fornecedor(chapas));
        assertThat(edita.statusCode()).as(edita.body()).isEqualTo(200);
        assertThat(get("/api/v1/customers/" + id).body()).contains("\"name\":\"Matriz\"", "\"supplier\":true");
    }

    @Test
    void inativarOFornecedorNaoInativaOCliente() throws Exception {
        String id = campo(post("/api/v1/customers", "forn-ina-00001", "{\"legalName\":\"Parceiro Duplo Ltda.\"}").body(), "id");
        withVersion("POST", "/api/v1/suppliers/" + id + "/enable", "1", null);
        assertThat(withVersion("POST", "/api/v1/suppliers/" + id + "/deactivate", "2", "{}").statusCode()).isEqualTo(422);
        HttpResponse<String> r = withVersion("POST", "/api/v1/suppliers/" + id + "/deactivate", "2", "{\"reason\":\"Deixou de fornecer\"}");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"status\":\"INATIVO\"", "\"customer\":true");
        assertThat(get("/api/v1/customers/" + id).body()).contains("\"status\":\"ATIVO\"", "\"supplier\":false");
        assertThat(get("/api/v1/suppliers").body()).isEqualTo("[]");
        assertThat(get("/api/v1/suppliers?status=INATIVO").body()).contains(id);
        assertThat(get("/api/v1/customers").body()).contains(id);
        assertThat(jdbc.sql("select status from partner where id = cast(:id as uuid)").param("id", id).query(String.class).single())
                .isEqualTo("ATIVO");
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'PartnerDeactivated'").query(String.class).single())
                .contains("FORNECEDOR", "Deixou de fornecer");
    }

    @Test
    void clienteNaoAbreComoFornecedorEValidaPrazoECategoria() throws Exception {
        String id = campo(post("/api/v1/customers", "forn-val-00001", "{\"legalName\":\"Só Cliente Ltda.\"}").body(), "id");
        assertThat(get("/api/v1/suppliers/" + id).statusCode()).isEqualTo(404);
        HttpResponse<String> r = post("/api/v1/suppliers", "forn-val-00002",
                "{\"legalName\":\"X\",\"leadTimeDays\":400,\"suppliedCategoryIds\":[\"" + java.util.UUID.randomUUID() + "\"]}");
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("suppliedCategories", "Categoria não encontrada");
        String inativa = categoria("Tintas");
        String versao = campo(get("/api/v1/item-categories").body(), "version");
        withVersion("PUT", "/api/v1/item-categories/" + inativa, versao, "{\"name\":\"Tintas\",\"status\":\"INATIVO\"}");
        HttpResponse<String> prazo = post("/api/v1/suppliers", "forn-val-00003",
                "{\"legalName\":\"X\",\"leadTimeDays\":400,\"suppliedCategoryIds\":[\"" + inativa + "\"]}");
        assertThat(prazo.body()).contains("está inativa");
        HttpResponse<String> soPrazo = post("/api/v1/suppliers", "forn-val-00004", "{\"legalName\":\"X\",\"leadTimeDays\":400}");
        assertThat(soPrazo.body()).contains("\"field\":\"leadTimeDays\"");
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
    }

    @Test
    void perfilConsultaLeFornecedoresMasNaoCadastra() throws Exception {
        post("/api/v1/suppliers", "forn-con-00001", "{\"legalName\":\"Fornecedor Qualquer\"}");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/suppliers", consulta, null, Map.of()).body()).contains("Fornecedor Qualquer");
        HttpResponse<String> negado = call("POST", "/api/v1/suppliers", consulta, "{\"legalName\":\"Outro\"}",
                Map.of("Idempotency-Key", "forn-con-00002"));
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(conta("select count(*) from partner")).isEqualTo(1);
    }
}
