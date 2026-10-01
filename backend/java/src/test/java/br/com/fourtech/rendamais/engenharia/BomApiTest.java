package br.com.fourtech.rendamais.engenharia;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 10 contra PostgreSQL real, com a BOM real da Balança Hidrostática (rev. 00): carga do arquivo com a prévia e os
 * problemas da origem, submontagens (Mecânica, Elétrica e Painel elétrico), aprovação recusada pela linha sem quantidade,
 * aprovação junto com as submontagens, aplicação ao equipamento do pedido, ajustes, custo planejado e margem, revisão
 * nova que não muda o equipamento, comparação, ciclo recusado e permissões.
 */
class BomApiTest extends CadastrosApiTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String PRODUTO = "Balança Hidrostática Renda+ Automática";

    private String arquivo;

    @BeforeEach
    void arquivo() throws Exception {
        arquivo = Files.readString(Path.of("../../docs/scrum/sprints/exemplos/bom-balanca-hidrostatica-rev00.json"));
    }

    private static JsonNode json(HttpResponse<String> r) {
        return JSON.readTree(r.body());
    }

    private HttpResponse<String> envia(String conteudo) throws Exception {
        ObjectNode body = JSON.createObjectNode();
        body.put("fileName", "BOM_Renda_Mecanica_Eletrica.json");
        body.put("content", conteudo);
        return post("/api/v1/bom-imports", null, JSON.writeValueAsString(body));
    }

    private JsonNode revisao(String id) throws Exception {
        HttpResponse<String> r = get("/api/v1/bom-revisions/" + id);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return json(r);
    }

    /** Linhas da revisão no formato do PUT, para regravar o rascunho com uma mudança. */
    private static ArrayNode linhas(JsonNode rev) {
        ArrayNode out = JSON.createArrayNode();
        for (JsonNode l : rev.get("lines")) {
            ObjectNode o = JSON.createObjectNode();
            for (String f : List.of("kind", "itemId", "childRevisionId", "referenceCode", "description", "quantity", "uom", "unitCost",
                    "category", "supplier", "material", "notes")) {
                if (l.hasNonNull(f)) o.put(f, l.get(f).asString());
            }
            out.add(o);
        }
        return out;
    }

    private HttpResponse<String> grava(JsonNode rev, ArrayNode lines, String informed) throws Exception {
        ObjectNode body = JSON.createObjectNode();
        if (informed == null && rev.hasNonNull("informedTotalCents")) informed = rev.get("informedTotalCents").asString();
        if (informed != null) body.put("informedTotalCents", informed);
        body.set("lines", lines);
        return withVersion("PUT", "/api/v1/bom-revisions/" + rev.get("id").asString(), rev.get("version").asString(),
                JSON.writeValueAsString(body));
    }

    private static JsonNode linha(JsonNode rev, String descricao) {
        for (JsonNode l : rev.get("lines")) if (l.get("description").asString().equals(descricao)) return l;
        throw new AssertionError("linha " + descricao + " não encontrada");
    }

    private static int posicao(JsonNode rev, String descricao) {
        int i = 0;
        for (JsonNode l : rev.get("lines")) {
            if (l.get("description").asString().equals(descricao)) return i;
            i++;
        }
        throw new AssertionError("linha " + descricao + " não encontrada");
    }

    /** Carga confirmada da BOM real; devolve a revisão do modelo. */
    private JsonNode carrega() throws Exception {
        String id = json(envia(arquivo)).get("id").asString();
        HttpResponse<String> c = post("/api/v1/bom-imports/" + id + "/confirmation", "bom-imp-" + id.substring(0, 8), null);
        assertThat(c.statusCode()).as(c.body()).isEqualTo(200);
        return revisao(json(c).get("revisionId").asString());
    }

    /** Informa a quantidade do Suporte 45° (linha sem quantidade no arquivo) e aprova a BOM do modelo com as submontagens. */
    private JsonNode aprova(JsonNode modelo) throws Exception {
        JsonNode eletrica = revisao(linha(modelo, "Elétrica — " + PRODUTO).get("childRevisionId").asString());
        JsonNode painel = revisao(linha(eletrica, "Painel elétrico — " + PRODUTO).get("childRevisionId").asString());
        ArrayNode ls = linhas(painel);
        ((ObjectNode) ls.get(posicao(painel, "Suporte 45° para Trilho DIN"))).put("quantity", "1");
        HttpResponse<String> g = grava(painel, ls, painel.get("informedTotalCents").asString());
        assertThat(g.statusCode()).as(g.body()).isEqualTo(200);
        HttpResponse<String> a = post("/api/v1/bom-revisions/" + modelo.get("id").asString() + "/approval", null, null);
        assertThat(a.statusCode()).as(a.body()).isEqualTo(200);
        return json(a);
    }

    /** Pedido confirmado com um equipamento do modelo, vendido por R$ 120.000,00; devolve o id do equipamento. */
    private String equipamentoVendido(String chave, String modelo) throws Exception {
        HttpResponse<String> c = post("/api/v1/customers", chave + "-cli", """
                {"legalName":"Fecularia BOM %s Ltda.","units":[{"name":"Matriz","city":"Assis","state":"SP"}]}
                """.formatted(chave));
        assertThat(c.statusCode()).as(c.body()).isEqualTo(201);
        String cliente = campo(c.body(), "id");
        String unidade = jdbc.sql("select id::text from partner_unit where partner_id = cast(:p as uuid)").param("p", cliente)
                .query(String.class).single();
        HttpResponse<String> p = post("/api/v1/sales-orders", chave + "-ped", """
                {"customerId":"%s","unitId":"%s","contractDate":"2026-09-10",
                 "lines":[{"kind":"EQUIPAMENTO","description":"%s","quantity":"1","unitPrice":"120000.00"}],
                 "installments":[{"dueDate":"2026-12-10","amountCents":"12000000"}]}
                """.formatted(cliente, unidade, modelo));
        assertThat(p.statusCode()).as(p.body()).isEqualTo(201);
        String pedido = campo(p.body(), "id");
        HttpResponse<String> ok = call("POST", "/api/v1/sales-orders/" + pedido + "/confirmations", admin, null,
                Map.of("If-Match", "\"1\"", "Idempotency-Key", chave + "-conf"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        return jdbc.sql("""
                select e.id::text from equipment e join project p on p.id = e.project_id where p.order_id = cast(:o as uuid)
                """).param("o", pedido).query(String.class).single();
    }

    @Test
    void previaDaBomRealMostraTotaisSubmontagensEProblemasSemGravarNada() throws Exception {
        HttpResponse<String> r = envia(arquivo);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        JsonNode p = json(r);
        assertThat(p.get("status").asString()).isEqualTo("PREVIEW");
        assertThat(p.get("product").asString()).isEqualTo(PRODUTO);
        assertThat(p.get("revisionLabel").asString()).isEqualTo("00");
        assertThat(p.get("lineCount").asInt()).isEqualTo(203);
        assertThat(p.get("totalCents").asString()).isEqualTo("6939851");
        assertThat(p.get("informedTotalCents").asString()).isEqualTo("6939851");
        assertThat(p.get("pending").asInt()).isEqualTo(1);
        List<String> grupos = new ArrayList<>();
        p.get("groups").forEach(g -> grupos.add(g.get("name").asString() + "|" + g.get("lines").asInt() + "|" + g.get("totalCents").asString()));
        assertThat(grupos).containsExactly("Mecânica|127|2847740", "Elétrica|76|4092111", "Painel elétrico|50|2912967");
        assertThat(p.get("newItems").asInt()).isEqualTo(201);
        assertThat(p.get("newUnits").toString()).contains("SRV (Serviço)", "CT (Cento)");
        assertThat(p.get("newCategories").size()).as(p.get("newCategories").toString()).isEqualTo(12);
        assertThat(p.get("fileNotes").size()).isEqualTo(6);
        String problemas = p.get("problems").toString();
        assertThat(problemas).contains("Elétrica 38 — Suporte 45° para Trilho DIN: sem quantidade",
                "O código ADR-01-269-P aparece 2 vezes", "O código ADR-01-129-P aparece 2 vezes",
                "Mecânica 46 — Chapa 1063x1568mm #16 Laser Inox: a descrição diz inox e o material é Aço SAE 1020",
                "124 itens sem código no arquivo recebem código gerado", "linhas sem unidade no arquivo entram como UN");
        assertThat(problemas).doesNotContain("Total geral informado");
        // A linha sem código ganha o código gerado; as unidades do arquivo valem (CT, M, SRV) e a coluna Unid. Ref. não.
        JsonNode parafuso = null;
        JsonNode clp = null;
        JsonNode cabo = null;
        for (JsonNode l : p.get("lines")) {
            if (l.get("description").asString().equals("Parafuso Sext UNC 1/2\" x 1.1/2\" ZB")) parafuso = l;
            if (l.get("description").asString().startsWith("CLP Allen Bradley")) clp = l;
            if (l.get("description").asString().equals("Cabo PP 7x1,00mm")) cabo = l;
        }
        assertThat(parafuso.get("referenceCode").asString()).isEqualTo("MEC-0003");
        assertThat(parafuso.get("generatedCode").asBoolean()).isTrue();
        assertThat(clp.get("uom").asString()).isEqualTo("UN");
        assertThat(clp.get("referenceCode").asString()).startsWith("ELE-");
        assertThat(cabo.get("uom").asString()).isEqualTo("M");
        // Prévia não cria itens nem BOM; o mesmo arquivo devolve a mesma carga.
        assertThat(conta("select count(*) from item")).isZero();
        assertThat(conta("select count(*) from bom")).isZero();
        assertThat(json(envia(arquivo)).get("id").asString()).isEqualTo(p.get("id").asString());
        assertThat(conta("select count(*) from bom_import")).isEqualTo(1);
        // Arquivo que não é BOM.
        HttpResponse<String> ruim = envia("{\"produto\":\"X\"}");
        assertThat(ruim.statusCode()).isEqualTo(422);
        assertThat(ruim.body()).contains("BOM_IMPORT_INVALID");
    }

    @Test
    void cargaCriaModeloSubmontagensEItensUmaVezSoEAprovacaoEsperaAQuantidadeQueFalta() throws Exception {
        JsonNode modelo = carrega();
        assertThat(modelo.get("status").asString()).isEqualTo("DRAFT");
        assertThat(modelo.get("label").asString()).isEqualTo("00");
        assertThat(modelo.get("bomName").asString()).isEqualTo(PRODUTO);
        assertThat(modelo.get("modelName").asString()).isEqualTo(PRODUTO);
        assertThat(modelo.get("totalCents").asString()).isEqualTo("6939851");
        assertThat(modelo.get("pending").asInt()).isEqualTo(1);
        assertThat(modelo.get("lines").size()).isEqualTo(2);
        JsonNode mecanica = revisao(linha(modelo, "Mecânica — " + PRODUTO).get("childRevisionId").asString());
        JsonNode eletrica = revisao(linha(modelo, "Elétrica — " + PRODUTO).get("childRevisionId").asString());
        assertThat(mecanica.get("totalCents").asString()).isEqualTo("2847740");
        assertThat(mecanica.get("lines").size()).isEqualTo(127);
        assertThat(eletrica.get("totalCents").asString()).isEqualTo("4092111");
        assertThat(eletrica.get("lines").size()).isEqualTo(27);
        JsonNode painel = revisao(linha(eletrica, "Painel elétrico — " + PRODUTO).get("childRevisionId").asString());
        assertThat(painel.get("totalCents").asString()).isEqualTo("2912967");
        assertThat(painel.get("usedBy").toString()).contains("Elétrica — " + PRODUTO);
        // Subtotais por categoria e a pintura de R$ 1.400,00 (PO, 01/10/2026).
        assertThat(mecanica.get("categories").toString()).contains("{\"category\":\"Serviços\",\"cents\":\"1010979\",\"lines\":3}");
        assertThat(linha(mecanica, "Pintura").get("lineCents").asString()).isEqualTo("140000");
        assertThat(conta("select count(*) from item")).isEqualTo(201);
        assertThat(conta("select count(*) from item where nature = 'SERVICO'")).isEqualTo(5);
        assertThat(conta("select count(*) from equipment_model")).isEqualTo(1);
        assertThat(conta("select count(*) from bom")).isEqualTo(4);

        // Confirmar de novo (outra chave) ou reenviar o arquivo não cria nada.
        String importId = modelo.get("importId").asString();
        HttpResponse<String> de_novo = post("/api/v1/bom-imports/" + importId + "/confirmation", "bom-imp-outra-chave", null);
        assertThat(json(de_novo).get("revisionId").asString()).isEqualTo(modelo.get("id").asString());
        assertThat(json(envia(arquivo)).get("status").asString()).isEqualTo("CONFIRMED");
        assertThat(conta("select count(*) from item")).isEqualTo(201);
        assertThat(conta("select count(*) from bom_revision")).isEqualTo(4);

        // Aprovar com a linha sem quantidade é recusado, apontando a submontagem.
        HttpResponse<String> recusa = post("/api/v1/bom-revisions/" + modelo.get("id").asString() + "/approval", null, null);
        assertThat(recusa.statusCode()).isEqualTo(422);
        assertThat(recusa.body()).contains("BOM_INCOMPLETE", "Painel elétrico — " + PRODUTO + " rev. 00",
                "Suporte 45° para Trilho DIN: sem quantidade");
        assertThat(conta("select count(*) from bom_revision where status = 'APPROVED'")).isZero();

        // Com a quantidade informada, aprova a BOM do modelo e as três submontagens juntas.
        JsonNode aprovado = aprova(modelo);
        assertThat(aprovado.get("status").asString()).isEqualTo("APPROVED");
        assertThat(aprovado.get("totalCents").asString()).isEqualTo("6940795");
        assertThat(conta("select count(*) from bom_revision where status = 'APPROVED'")).isEqualTo(4);
        assertThat(conta("select count(*) from outbox_event where event_type = 'BomRevisionApproved'")).isEqualTo(4);
        // Aprovada não muda.
        JsonNode mec = revisao(mecanica.get("id").asString());
        HttpResponse<String> muda = grava(mec, linhas(mec), null);
        assertThat(muda.statusCode()).isEqualTo(409);
        // Aprovar de novo devolve a mesma.
        assertThat(post("/api/v1/bom-revisions/" + modelo.get("id").asString() + "/approval", null, null).statusCode()).isEqualTo(200);
        assertThat(conta("select count(*) from outbox_event where event_type = 'BomRevisionApproved'")).isEqualTo(4);
    }

    @Test
    void equipamentoRecebeABomCongeladaComAjustesECustoEMargemDoProjeto() throws Exception {
        JsonNode modelo = aprova(carrega());
        String equipamento = equipamentoVendido("bom-eq1", PRODUTO);
        // O pedido encontrou o modelo pelo nome.
        assertThat(conta("select count(*) from equipment_model")).isEqualTo(1);
        HttpResponse<String> sem = get("/api/v1/equipment/" + equipamento + "/bom");
        assertThat(json(sem).get("applied").asBoolean()).isFalse();
        String projeto = jdbc.sql("select project_id::text from equipment where id = cast(:e as uuid)").param("e", equipamento)
                .query(String.class).single();
        JsonNode custo0 = json(get("/api/v1/projects/" + projeto + "/planned-cost"));
        assertThat(custo0.get("complete").asBoolean()).isFalse();
        assertThat(custo0.get("withoutBom").asInt()).isEqualTo(1);
        assertThat(custo0.get("marginCents").isNull()).isTrue();
        assertThat(custo0.get("equipment").get(0).get("costCents").isNull()).isTrue();

        // Rascunho não se aplica; a revisão aprovada sim, uma vez só.
        HttpResponse<String> aplica = post("/api/v1/equipment/" + equipamento + "/bom", "bom-apl-00001",
                "{\"revisionId\":\"" + modelo.get("id").asString() + "\"}");
        assertThat(aplica.statusCode()).as(aplica.body()).isEqualTo(200);
        JsonNode eb = json(aplica);
        assertThat(eb.get("applied").asBoolean()).isTrue();
        assertThat(eb.get("totalCents").asString()).isEqualTo("6940795");
        assertThat(eb.get("modelTotalCents").asString()).isEqualTo("6940795");
        assertThat(eb.get("lines").size()).isEqualTo(2 + 127 + 27 + 50);
        assertThat(eb.get("version").asString()).isEqualTo("1");
        HttpResponse<String> repete = post("/api/v1/equipment/" + equipamento + "/bom", "bom-apl-00002",
                "{\"revisionId\":\"" + modelo.get("id").asString() + "\"}");
        assertThat(json(repete).get("version").asString()).isEqualTo("1");
        assertThat(conta("select count(*) from equipment_bom_line")).isEqualTo(206);
        assertThat(conta("select count(*) from outbox_event where event_type = 'ProjectBomApplied'")).isEqualTo(1);

        // Custo planejado e margem: R$ 120.000,00 − R$ 69.407,95 = R$ 50.592,05 (42,16%).
        JsonNode custo = json(get("/api/v1/projects/" + projeto + "/planned-cost"));
        assertThat(custo.get("complete").asBoolean()).isTrue();
        assertThat(custo.get("contractCents").asString()).isEqualTo("12000000");
        assertThat(custo.get("plannedCostCents").asString()).isEqualTo("6940795");
        assertThat(custo.get("marginCents").asString()).isEqualTo("5059205");
        assertThat(custo.get("marginRate").asString()).isEqualTo("0.4216");

        // Ajuste: retirar a pintura (com motivo) só deste equipamento.
        String pintura = null;
        for (JsonNode l : eb.get("lines")) if (l.get("description").asString().equals("Pintura")) pintura = l.get("id").asString();
        HttpResponse<String> semMotivo = withVersion("POST", "/api/v1/equipment/" + equipamento + "/bom/adjustments", "1",
                "{\"action\":\"REMOVE\",\"lineId\":\"" + pintura + "\"}");
        assertThat(semMotivo.statusCode()).isEqualTo(422);
        HttpResponse<String> retira = withVersion("POST", "/api/v1/equipment/" + equipamento + "/bom/adjustments", "1",
                "{\"action\":\"REMOVE\",\"lineId\":\"" + pintura + "\",\"reason\":\"Cliente pinta na própria fábrica\"}");
        assertThat(retira.statusCode()).as(retira.body()).isEqualTo(200);
        JsonNode ajustada = json(retira);
        assertThat(ajustada.get("totalCents").asString()).isEqualTo("6800795");
        assertThat(ajustada.get("modelTotalCents").asString()).isEqualTo("6940795");
        assertThat(ajustada.get("removed").asInt()).isEqualTo(1);
        // Versão antiga é recusada.
        assertThat(withVersion("POST", "/api/v1/equipment/" + equipamento + "/bom/adjustments", "1",
                "{\"action\":\"RESTORE\",\"lineId\":\"" + pintura + "\",\"reason\":\"x\"}").statusCode()).isEqualTo(412);
        // Alterar a quantidade dos parafusos e incluir um item.
        String parafuso = null;
        String mecanica = null;
        for (JsonNode l : ajustada.get("lines")) {
            if (l.get("description").asString().equals("Parafuso Sext UNC 1/2\" x 1.1/2\" ZB")) parafuso = l.get("id").asString();
            if (l.get("description").asString().equals("Mecânica — " + PRODUTO)) mecanica = l.get("id").asString();
        }
        HttpResponse<String> altera = withVersion("POST", "/api/v1/equipment/" + equipamento + "/bom/adjustments", "2",
                "{\"action\":\"UPDATE\",\"lineId\":\"" + parafuso + "\",\"quantity\":\"8\",\"reason\":\"Base reforçada\"}");
        assertThat(altera.statusCode()).as(altera.body()).isEqualTo(200);
        assertThat(json(altera).get("totalCents").asString()).isEqualTo("6801375");
        assertThat(json(altera).get("changed").asInt()).isEqualTo(1);
        String item = jdbc.sql("select id::text from item where description = 'Óleo Pneumático Frasco 500ml'").query(String.class).single();
        HttpResponse<String> inclui = withVersion("POST", "/api/v1/equipment/" + equipamento + "/bom/adjustments", "3", """
                {"action":"ADD","parentLineId":"%s","itemId":"%s","quantity":"2","unitCost":"40","reason":"Reserva para a partida"}
                """.formatted(mecanica, item));
        assertThat(inclui.statusCode()).as(inclui.body()).isEqualTo(200);
        assertThat(json(inclui).get("totalCents").asString()).isEqualTo("6809375");
        assertThat(json(inclui).get("added").asInt()).isEqualTo(1);
        assertThat(json(get("/api/v1/projects/" + projeto + "/planned-cost")).get("plannedCostCents").asString()).isEqualTo("6809375");
        assertThat(get("/api/v1/equipment/" + equipamento + "/bom/history").body()).contains("EQUIPMENT_BOM_ADJUSTED",
                "Cliente pinta na própria fábrica");
        // O modelo não mudou.
        assertThat(revisao(modelo.get("id").asString()).get("totalCents").asString()).isEqualTo("6940795");
    }

    @Test
    void revisaoNovaNaoMudaOEquipamentoEAComparacaoMostraADiferenca() throws Exception {
        JsonNode modelo = aprova(carrega());
        String equipamento = equipamentoVendido("bom-eq2", PRODUTO);
        assertThat(post("/api/v1/equipment/" + equipamento + "/bom", "bom-apl-00003",
                "{\"revisionId\":\"" + modelo.get("id").asString() + "\"}").statusCode()).isEqualTo(200);

        // Mecânica rev. 01 com a pintura a R$ 1.500,00.
        String mecanicaBom = linha(modelo, "Mecânica — " + PRODUTO).get("childBomId").asString();
        HttpResponse<String> nova = post("/api/v1/boms/" + mecanicaBom + "/revisions", "bom-rev-00001", null);
        assertThat(nova.statusCode()).as(nova.body()).isEqualTo(201);
        JsonNode mec1 = json(nova);
        assertThat(mec1.get("label").asString()).isEqualTo("01");
        assertThat(mec1.get("status").asString()).isEqualTo("DRAFT");
        assertThat(post("/api/v1/boms/" + mecanicaBom + "/revisions", "bom-rev-00002", null).statusCode()).isEqualTo(422);
        ArrayNode ls = linhas(mec1);
        ((ObjectNode) ls.get(posicao(mec1, "Pintura"))).put("unitCost", "1500");
        assertThat(grava(mec1, ls, null).statusCode()).isEqualTo(200);
        assertThat(post("/api/v1/bom-revisions/" + mec1.get("id").asString() + "/approval", null, null).statusCode()).isEqualTo(200);
        assertThat(revisao(linha(modelo, "Mecânica — " + PRODUTO).get("childRevisionId").asString()).get("status").asString())
                .isEqualTo("SUPERSEDED");

        // Modelo rev. 01 usando a Mecânica rev. 01.
        HttpResponse<String> novaModelo = post("/api/v1/boms/" + modelo.get("bomId").asString() + "/revisions", "bom-rev-00003", null);
        JsonNode mod1 = json(novaModelo);
        ArrayNode ml = linhas(mod1);
        ((ObjectNode) ml.get(posicao(mod1, "Mecânica — " + PRODUTO))).put("childRevisionId", mec1.get("id").asString());
        HttpResponse<String> g = grava(mod1, ml, null);
        assertThat(g.statusCode()).as(g.body()).isEqualTo(200);
        assertThat(json(g).get("problems").toString()).contains("Total informado R$ 69.398,51 × soma das linhas R$ 69.507,95");
        JsonNode mod1Aprovada = json(post("/api/v1/bom-revisions/" + mod1.get("id").asString() + "/approval", null, null));
        assertThat(mod1Aprovada.get("totalCents").asString()).isEqualTo("6950795");

        // O equipamento continua com a rev. 00.
        JsonNode eb = json(get("/api/v1/equipment/" + equipamento + "/bom"));
        assertThat(eb.get("revisionLabel").asString()).isEqualTo("00");
        assertThat(eb.get("revisionStatus").asString()).isEqualTo("SUPERSEDED");
        assertThat(eb.get("totalCents").asString()).isEqualTo("6940795");

        // Comparar rev. 01 com a rev. 00: a Mecânica mudou de revisão, + R$ 100,00.
        JsonNode cmp = json(get("/api/v1/bom-revisions/" + mod1.get("id").asString() + "/comparison?with=" + modelo.get("id").asString()));
        assertThat(cmp.get("difference").asString()).isEqualTo("10000");
        assertThat(cmp.get("rows").size()).isEqualTo(1);
        assertThat(cmp.get("rows").get(0).get("status").asString()).isEqualTo("CHANGED");
        assertThat(cmp.get("rows").get(0).get("revisionBefore").asString()).isEqualTo("00");
        assertThat(cmp.get("rows").get(0).get("revisionAfter").asString()).isEqualTo("01");
        JsonNode cmpMec = json(get("/api/v1/bom-revisions/" + mec1.get("id").asString() + "/comparison?with="
                + linha(modelo, "Mecânica — " + PRODUTO).get("childRevisionId").asString()));
        assertThat(cmpMec.get("rows").size()).isEqualTo(1);
        assertThat(cmpMec.get("rows").get(0).get("description").asString()).isEqualTo("Pintura");
        assertThat(cmpMec.get("rows").get(0).get("unitCostBefore").asString()).isEqualTo("1400");
        assertThat(cmpMec.get("rows").get(0).get("unitCostAfter").asString()).isEqualTo("1500");

        // Trocar o equipamento para a rev. 01 exige motivo.
        HttpResponse<String> troca = post("/api/v1/equipment/" + equipamento + "/bom", "bom-apl-00004",
                "{\"revisionId\":\"" + mod1.get("id").asString() + "\"}");
        assertThat(troca.statusCode()).isEqualTo(422);
        HttpResponse<String> trocaOk = post("/api/v1/equipment/" + equipamento + "/bom", "bom-apl-00005",
                "{\"revisionId\":\"" + mod1.get("id").asString() + "\",\"reason\":\"Pintura reajustada pelo fornecedor\"}");
        assertThat(trocaOk.statusCode()).as(trocaOk.body()).isEqualTo(200);
        assertThat(json(trocaOk).get("totalCents").asString()).isEqualTo("6950795");
        assertThat(json(trocaOk).get("version").asString()).isEqualTo("2");
    }

    @Test
    void cicloDeSubmontagensERascunhoManualComTotalInformadoDiferente() throws Exception {
        JsonNode modelo = carrega();
        JsonNode eletrica = revisao(linha(modelo, "Elétrica — " + PRODUTO).get("childRevisionId").asString());
        JsonNode painel = revisao(linha(eletrica, "Painel elétrico — " + PRODUTO).get("childRevisionId").asString());
        // O painel não pode conter a Elétrica, que já o contém.
        ArrayNode ls = linhas(painel);
        ObjectNode ciclo = JSON.createObjectNode();
        ciclo.put("kind", "SUBASSEMBLY");
        ciclo.put("childRevisionId", eletrica.get("id").asString());
        ciclo.put("quantity", "1");
        ls.add(ciclo);
        HttpResponse<String> r = grava(painel, ls, null);
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("BOM_CYCLE");

        // BOM criada na tela, com um item digitado e o total informado diferente da soma: aviso, sem corrigir.
        HttpResponse<String> nova = post("/api/v1/boms", "bom-nova-0001", "{\"name\":\"Kit de calibração\"}");
        assertThat(nova.statusCode()).as(nova.body()).isEqualTo(201);
        String rascunho = json(nova).get("draft").get("id").asString();
        JsonNode rev = revisao(rascunho);
        String item = jdbc.sql("select id::text from item where description = 'Óleo Pneumático Frasco 500ml'").query(String.class).single();
        ArrayNode linhas = JSON.createArrayNode();
        ObjectNode l = JSON.createObjectNode();
        l.put("kind", "ITEM");
        l.put("itemId", item);
        l.put("quantity", "3");
        l.put("unitCost", "40.50");
        linhas.add(l);
        HttpResponse<String> g = grava(rev, linhas, "15000");
        assertThat(g.statusCode()).as(g.body()).isEqualTo(200);
        JsonNode salvo = json(g);
        assertThat(salvo.get("totalCents").asString()).isEqualTo("12150");
        assertThat(salvo.get("problems").toString())
                .contains("Total informado R$ 150,00 × soma das linhas R$ 121,50: diferença de -R$ 28,50 (não corrigida).");
        assertThat(salvo.get("lines").get(0).get("description").asString()).isEqualTo("Óleo Pneumático Frasco 500ml");
        // Quantidade zero e custo negativo recusados.
        l.put("quantity", "0");
        l.put("unitCost", "-1");
        HttpResponse<String> invalida = grava(salvo, linhas, null);
        assertThat(invalida.statusCode()).isEqualTo(422);
        assertThat(invalida.body()).contains("lines[0].quantity", "lines[0].unitCost");
        // Submontagem de BOM de modelo é recusada.
        ObjectNode sub = JSON.createObjectNode();
        sub.put("kind", "SUBASSEMBLY");
        sub.put("childRevisionId", modelo.get("id").asString());
        sub.put("quantity", "1");
        ArrayNode comModelo = JSON.createArrayNode();
        comModelo.add(sub);
        assertThat(grava(salvo, comModelo, null).body()).contains("A BOM de um modelo não entra como submontagem");
    }

    @Test
    void modelosDeEquipamentoEConsultaSoVe() throws Exception {
        JsonNode modelo = aprova(carrega());
        String equipamento = equipamentoVendido("bom-eq3", "  balança hidrostática   RENDA+ automática ");
        assertThat(conta("select count(*) from equipment_model")).isEqualTo(1);
        HttpResponse<String> lista = get("/api/v1/equipment-models");
        assertThat(lista.body()).contains("\"name\":\"" + PRODUTO + "\"", "\"equipmentCount\":1");
        String modelId = json(lista).get(0).get("id").asString();
        HttpResponse<String> dup = post("/api/v1/equipment-models", "mod-dup-00001", "{\"name\":\"BALANÇA HIDROSTÁTICA RENDA+ AUTOMÁTICA\"}");
        assertThat(dup.statusCode()).isEqualTo(422);
        assertThat(dup.body()).contains("EQUIPMENT_MODEL_DUPLICATE");
        HttpResponse<String> novo = post("/api/v1/equipment-models", "mod-new-00001", "{\"name\":\"Balança Hidrostática Compacta\"}");
        assertThat(novo.statusCode()).as(novo.body()).isEqualTo(201);
        assertThat(campo(novo.body(), "code")).matches("MD\\d{5}");
        HttpResponse<String> renomeia = withVersion("PUT", "/api/v1/equipment-models/" + campo(novo.body(), "id"), "1",
                "{\"name\":\"Balança Hidrostática Compacta BHC-100\"}");
        assertThat(renomeia.statusCode()).as(renomeia.body()).isEqualTo(200);
        assertThat(get("/api/v1/equipment/" + equipamento).body()).contains("\"modelId\":\"" + modelId + "\"");

        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/boms", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/bom-revisions/" + modelo.get("id").asString(), consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/equipment/" + equipamento + "/bom", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("POST", "/api/v1/bom-imports", consulta, "{\"content\":\"{}\"}", Map.of()).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/bom-revisions/" + modelo.get("id").asString() + "/approval", consulta, null, Map.of())
                .statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/equipment/" + equipamento + "/bom", consulta,
                "{\"revisionId\":\"" + modelo.get("id").asString() + "\"}", Map.of("Idempotency-Key", "bom-cons-0001")).statusCode())
                .isEqualTo(403);
        assertThat(call("POST", "/api/v1/equipment-models", consulta, "{\"name\":\"X\"}", Map.of("Idempotency-Key", "mod-cons-0001"))
                .statusCode()).isEqualTo(403);
    }
}
