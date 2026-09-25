package br.com.fourtech.rendamais.cadastros;

import br.com.fourtech.rendamais.acesso.api.Profile;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** S3-03 e S3-04 contra PostgreSQL real: unidades, categorias, materiais e serviços. */
class ItemApiTest extends CadastrosApiTest {

    private String material(String categoria) {
        return """
                {"description":"Perfil L 40x40 — barra 6 m","nature":"MATERIAL","uom":"m","categoryId":"%s","stockControlled":true,
                 "referenceCost":"16.033333","conversions":[{"fromUom":"BR","factor":"6"}]}
                """.formatted(categoria);
    }

    @Test
    void listaInicialDeUnidadesESoOAdministradorIncluiEInativa() throws Exception {
        assertThat(get("/api/v1/units-of-measure").body()).contains("\"code\":\"UN\"", "\"code\":\"KG\"", "\"code\":\"M2\"", "\"code\":\"H\"");
        HttpResponse<String> nova = post("/api/v1/units-of-measure", null, "{\"code\":\" br \",\"name\":\"Barra\"}");
        assertThat(nova.statusCode()).as(nova.body()).isEqualTo(201);
        assertThat(nova.body()).contains("\"code\":\"BR\"", "\"status\":\"ATIVO\"");
        assertThat(post("/api/v1/units-of-measure", null, "{\"code\":\"BR\",\"name\":\"De novo\"}").body()).contains("UNIT_DUPLICATE");
        assertThat(post("/api/v1/units-of-measure", null, "{\"code\":\"a b\",\"name\":\"\"}").body())
                .contains("UNIT_INVALID", "\"field\":\"code\"", "\"field\":\"name\"");
        HttpResponse<String> inativa = withVersion("PUT", "/api/v1/units-of-measure/BR", "1", "{\"name\":\"Barra de 6 m\",\"status\":\"INATIVO\"}");
        assertThat(inativa.statusCode()).isEqualTo(200);
        assertThat(inativa.body()).contains("\"status\":\"INATIVO\"", "\"version\":\"2\"");
        assertThat(withVersion("PUT", "/api/v1/units-of-measure/BR", "1", "{\"name\":\"X\",\"status\":\"ATIVO\"}").statusCode()).isEqualTo(412);

        assertThat(post("/api/v1/item-categories", null, "{\"name\":\"Chapas\"}").statusCode()).isEqualTo(201);
        assertThat(post("/api/v1/item-categories", null, "{\"name\":\"CHAPAS\"}").body()).contains("CATEGORY_DUPLICATE");

        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/item-categories", consulta, null, Map.of()).body()).contains("Chapas");
        assertThat(call("POST", "/api/v1/item-categories", consulta, "{\"name\":\"Tintas\"}", Map.of()).statusCode()).isEqualTo(403);
        assertThat(conta("select count(*) from audit_event where action in ('UNIT_CREATED', 'UNIT_UPDATED', 'CATEGORY_CREATED')")).isEqualTo(3);
    }

    @Test
    void cadastraMaterialComCodigoMConversaoECustoComSeisCasas() throws Exception {
        String chapas = categoria("Perfis");
        post("/api/v1/units-of-measure", null, "{\"code\":\"BR\",\"name\":\"Barra\"}");
        HttpResponse<String> r = post("/api/v1/items", "item-cad-00001", material(chapas));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        assertThat(campo(r.body(), "code")).matches("M\\d{5}");
        assertThat(r.body()).contains("\"uom\":\"M\"", "\"referenceCost\":\"16.033333\"", "\"fromUom\":\"BR\"", "\"factor\":\"6.000000\"",
                "\"name\":\"Perfis\"", "\"stockControlled\":true");
        assertThat(jdbc.sql("select changes::text from audit_event where action = 'ITEM_REGISTERED'").query(String.class).single())
                .contains("1 BR = 6,00 M", "16,033333", "Perfis");
        assertThat(jdbc.sql("select payload::text from outbox_event where event_type = 'ItemRegistered'").query(String.class).single())
                .contains("\"uom\": \"M\"");
        assertThat(post("/api/v1/items", "item-cad-00001", material(chapas)).body()).contains(campo(r.body(), "id"));
        assertThat(conta("select count(*) from item")).isEqualTo(1);

        HttpResponse<String> servico = post("/api/v1/items", "item-cad-00002",
                "{\"description\":\"Corte e dobra\",\"nature\":\"SERVICO\",\"uom\":\"H\",\"categoryId\":\"" + chapas + "\",\"stockControlled\":false}");
        assertThat(campo(servico.body(), "code")).matches("S\\d{5}");
        assertThat(get("/api/v1/items?nature=SERVICO").body()).contains("Corte e dobra").doesNotContain("Perfil L");
        assertThat(get("/api/v1/items?search=perfil").body()).contains("\"category\":\"Perfis\"");
    }

    @Test
    void servicoNaoControlaEstoqueEConversaoExigeFatorPositivoSemRepetir() throws Exception {
        String cat = categoria("Serviços");
        HttpResponse<String> r = post("/api/v1/items", "item-val-00001", """
                {"description":"Instalação","nature":"SERVICO","uom":"XX","categoryId":"%s","stockControlled":true,
                 "referenceCost":"-1","conversions":[{"fromUom":"KG","factor":"0"},{"fromUom":"KG","factor":"1.1234567"}]}
                """.formatted(cat));
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("ITEM_INVALID", "Serviço não controla estoque", "\"field\":\"uom\"", "\"field\":\"referenceCost\"",
                "\"field\":\"conversions[0].factor\"", "\"field\":\"conversions[1].fromUom\"", "\"field\":\"conversions[1].factor\"");
        assertThat(conta("select count(*) from item") + conta("select count(*) from outbox_event")).isZero();
    }

    @Test
    void edicaoComVersaoNaoTrocaNaturezaEInativacaoPreservaOHistorico() throws Exception {
        String cat = categoria("Perfis");
        post("/api/v1/units-of-measure", null, "{\"code\":\"BR\",\"name\":\"Barra\"}");
        String id = campo(post("/api/v1/items", "item-edi-00001", material(cat)).body(), "id");

        HttpResponse<String> natureza = withVersion("PUT", "/api/v1/items/" + id, "1", material(cat).replace("MATERIAL", "SERVICO"));
        assertThat(natureza.body()).contains("A natureza não muda");

        // Unidade inativada depois do cadastro continua aceita no próprio item.
        withVersion("PUT", "/api/v1/units-of-measure/BR", "1", "{\"name\":\"Barra\",\"status\":\"INATIVO\"}");
        HttpResponse<String> ok = withVersion("PUT", "/api/v1/items/" + id, "1", material(cat).replace("16.033333", "17.5"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(ok.body()).contains("\"referenceCost\":\"17.500000\"", "\"version\":\"2\"");
        assertThat(withVersion("PUT", "/api/v1/items/" + id, "1", material(cat)).statusCode()).isEqualTo(412);
        assertThat(post("/api/v1/items", "item-edi-00002", material(cat)).body()).contains("Unidade BR não existe ou está inativa");

        assertThat(withVersion("POST", "/api/v1/items/" + id + "/deactivate", "2", "{\"reason\":\"Fora de linha\"}").body())
                .contains("\"status\":\"INATIVO\"");
        assertThat(get("/api/v1/items").body()).isEqualTo("[]");
        HttpResponse<String> hist = get("/api/v1/items/" + id + "/history");
        assertThat(hist.body()).contains("ITEM_DEACTIVATED", "Fora de linha", "ITEM_UPDATED",
                "\"referenceCost\":{\"before\":\"16,033333\",\"after\":\"17,50\"}", "ITEM_REGISTERED");
        assertThat(jdbc.sql("select event_type from outbox_event order by occurred_at").query(String.class).list())
                .containsExactly("ItemRegistered", "ItemUpdated", "ItemDeactivated");
    }

    @Test
    void perfilConsultaLeItensMasNaoCadastra() throws Exception {
        String cat = categoria("Perfis");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        HttpResponse<String> negado = call("POST", "/api/v1/items", consulta,
                "{\"description\":\"X\",\"nature\":\"MATERIAL\",\"uom\":\"UN\",\"categoryId\":\"" + cat + "\",\"stockControlled\":true}",
                Map.of("Idempotency-Key", "item-con-00001"));
        assertThat(negado.statusCode()).isEqualTo(403);
        assertThat(negado.body()).contains("item.create");
        assertThat(call("GET", "/api/v1/items", consulta, null, Map.of()).statusCode()).isEqualTo(200);
    }
}
