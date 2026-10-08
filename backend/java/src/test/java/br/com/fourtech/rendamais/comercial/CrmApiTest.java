package br.com.fourtech.rendamais.comercial;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.cadastros.CadastrosApiTest;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 11 contra PostgreSQL real: prospecção → interação → oportunidade pelas etapas do funil (valor ponderado do SAP B1)
 * → conversão em cliente → proposta → pedido (oportunidade ganha); perda com motivo; agenda; funil e conversão (IND-016).
 */
class CrmApiTest extends CadastrosApiTest {

    private static final LocalDate HOJE = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    private static String dia(int n) {
        return HOJE.plusDays(n).toString();
    }

    private String prospeccao(String key, String empresa) throws Exception {
        HttpResponse<String> r = post("/api/v1/leads", key, """
                {"companyName":"%s","city":"Paranavaí","state":"pr","hasRenda":"NAO","source":"LISTA",
                 "contactName":"Sr. Teste","contactPhone":"(44) 99999-0000"}
                """.formatted(empresa));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return campo(r.body(), "id");
    }

    private String oportunidade(String key, String leadId, String nome, String potencial) throws Exception {
        HttpResponse<String> r = post("/api/v1/opportunities", key, """
                {"leadId":"%s","name":"%s","potentialCents":"%s","expectedClose":"%s",
                 "nextActionDate":"%s","nextActionNote":"Ligar para o comprador"}
                """.formatted(leadId, nome, potencial, dia(60), dia(2)));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return campo(r.body(), "id");
    }

    @Test
    void prospeccaoComEstrelaDesconhecidaInteracaoEDescarte() throws Exception {
        HttpResponse<String> zero = post("/api/v1/leads", "s11-lead-zero", "{\"companyName\":\"Fécula Zero\",\"rating\":0}");
        assertThat(zero.statusCode()).isEqualTo(422);
        assertThat(zero.body()).contains("\"field\":\"rating\"");

        String id = prospeccao("s11-lead-0001", "Fecularia Noroeste Ltda.");
        HttpResponse<String> lida = get("/api/v1/leads/" + id);
        assertThat(lida.body()).contains("\"code\":\"L-", "\"rating\":null", "\"state\":\"PR\"", "\"stage\":\"IDENTIFICADO\"",
                "\"owner\":\"" + ADMIN + "\"", "\"hasRenda\":\"NAO\"");
        // Repetir com a mesma chave devolve a mesma prospecção.
        assertThat(post("/api/v1/leads", "s11-lead-0001", """
                {"companyName":"Fecularia Noroeste Ltda.","city":"Paranavaí","state":"pr","hasRenda":"NAO","source":"LISTA",
                 "contactName":"Sr. Teste","contactPhone":"(44) 99999-0000"}
                """).body()).contains(id);
        assertThat(conta("select count(*) from lead")).isEqualTo(1);

        HttpResponse<String> futura = post("/api/v1/leads/" + id + "/interactions", "s11-int-0001", """
                {"kind":"LIGACAO","occurredOn":"%s","summary":"Vai ligar"}
                """.formatted(dia(1)));
        assertThat(futura.statusCode()).isEqualTo(422);
        assertThat(futura.body()).contains("\"field\":\"occurredOn\"");

        HttpResponse<String> ligacao = post("/api/v1/leads/" + id + "/interactions", "s11-int-0002", """
                {"kind":"LIGACAO","contactName":"Sr. Teste","summary":"Interesse na balança automática",
                 "nextActionDate":"%s","nextActionNote":"Enviar catálogo"}
                """.formatted(dia(3)));
        assertThat(ligacao.statusCode()).as(ligacao.body()).isEqualTo(201);
        assertThat(ligacao.body()).contains("\"occurredOn\":\"" + HOJE + "\"");
        assertThat(get("/api/v1/leads/" + id).body()).contains("\"stage\":\"CONTATADO\"", "\"nextActionDate\":\"" + dia(3) + "\"",
                "\"nextActionNote\":\"Enviar catálogo\"", "\"lastInteraction\":\"" + HOJE + "\"", "\"version\":\"2\"");
        assertThat(post("/api/v1/leads/" + id + "/interactions", "s11-int-0002", """
                {"kind":"LIGACAO","contactName":"Sr. Teste","summary":"Interesse na balança automática",
                 "nextActionDate":"%s","nextActionNote":"Enviar catálogo"}
                """.formatted(dia(3))).body()).contains(campo(ligacao.body(), "id"));
        assertThat(conta("select count(*) from crm_interaction")).isEqualTo(1);
        assertThat(get("/api/v1/leads/" + id + "/interactions").body()).contains("Interesse na balança automática");

        // Estrelas e etapa pela ficha, com a versão lida; a versão antiga é recusada.
        HttpResponse<String> alterada = withVersion("PUT", "/api/v1/leads/" + id, "2", """
                {"companyName":"Fecularia Noroeste Ltda.","city":"Paranavaí","state":"PR","hasRenda":"NAO","rating":4,
                 "stage":"INTERESSADO","nextActionDate":"%s","nextActionNote":"Enviar catálogo"}
                """.formatted(dia(3)));
        assertThat(alterada.statusCode()).as(alterada.body()).isEqualTo(200);
        assertThat(alterada.body()).contains("\"rating\":4", "\"stage\":\"INTERESSADO\"");
        assertThat(withVersion("PUT", "/api/v1/leads/" + id, "2", "{\"companyName\":\"X\"}").statusCode()).isEqualTo(412);

        assertThat(withVersion("POST", "/api/v1/leads/" + id + "/discard", "3", "{}").statusCode()).isEqualTo(422);
        HttpResponse<String> descartada = withVersion("POST", "/api/v1/leads/" + id + "/discard", "3",
                "{\"reason\":\"Fechou a fecularia\"}");
        assertThat(descartada.body()).contains("\"stage\":\"DESCARTADO\"", "\"discardReason\":\"Fechou a fecularia\"",
                "\"nextActionDate\":null");
        assertThat(post("/api/v1/leads/" + id + "/interactions", "s11-int-0003", "{\"kind\":\"NOTA\",\"summary\":\"x\"}").statusCode())
                .isEqualTo(409);
        assertThat(get("/api/v1/leads/" + id + "/history").body())
                .contains("LEAD_REGISTERED", "LEAD_INTERACTION_RECORDED", "LEAD_UPDATED", "LEAD_DISCARDED");
        assertThat(jdbc.sql("select event_type from outbox_event where aggregate_type = 'lead'").query(String.class).list())
                .contains("LeadRegistered", "LeadInteractionRecorded", "LeadUpdated");

        // Consulta só vê.
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("GET", "/api/v1/leads/" + id, consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/crm/agenda", consulta, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(call("POST", "/api/v1/leads", consulta, "{\"companyName\":\"X\"}", Map.of("Idempotency-Key", "s11-cons-0001"))
                .statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/leads/" + id + "/interactions", consulta, "{\"kind\":\"NOTA\",\"summary\":\"x\"}",
                Map.of("Idempotency-Key", "s11-cons-0002")).statusCode()).isEqualTo(403);
    }

    @Test
    void oportunidadePeloFunilAteOPedido() throws Exception {
        String lead = prospeccao("s11-lead-0010", "Amidonaria Paraíso");
        // A próxima ação é opcional na oportunidade (Sprint 13): o acompanhamento vem das atividades.
        HttpResponse<String> semAcao = post("/api/v1/opportunities", "s11-opp-0000",
                "{\"leadId\":\"" + prospeccao("s11-lead-0011", "Amidonaria Sem Ação") + "\",\"name\":\"Balança\",\"potentialCents\":\"15000000\"}");
        assertThat(semAcao.statusCode()).as(semAcao.body()).isEqualTo(201);
        assertThat(semAcao.body()).contains("\"nextActionDate\":null");

        String opp = oportunidade("s11-opp-0001", lead, "Balança automática", "15000000");
        HttpResponse<String> aberta = get("/api/v1/opportunities/" + opp);
        // Prospecção: 10% de R$ 150.000,00 = R$ 15.000,00.
        assertThat(aberta.body()).contains("\"code\":\"OP-", "\"stage\":\"PROSPECCAO\"", "\"stageName\":\"Prospecção\"",
                "\"closePercent\":\"10.00\"", "\"weightedCents\":\"1500000\"", "\"status\":\"ABERTA\"", "\"customerId\":null",
                "\"leadName\":\"Amidonaria Paraíso\"");
        assertThat(get("/api/v1/leads/" + lead).body()).contains("\"stage\":\"INTERESSADO\"", "\"openOpportunities\":1");

        HttpResponse<String> visita = withVersion("POST", "/api/v1/opportunities/" + opp + "/stage", "1", """
                {"stage":"VISITA_TECNICA","nextActionDate":"%s","nextActionNote":"Visitar a fábrica"}
                """.formatted(dia(5)));
        assertThat(visita.statusCode()).as(visita.body()).isEqualTo(200);
        assertThat(visita.body()).contains("\"closePercent\":\"40.00\"", "\"weightedCents\":\"6000000\"",
                "\"nextActionNote\":\"Visitar a fábrica\"");
        assertThat(get("/api/v1/opportunities/" + opp + "/stages").body())
                .contains("\"toStage\":\"PROSPECCAO\"", "\"toStage\":\"VISITA_TECNICA\"", "\"weightedCents\":\"6000000\"");

        // Interação na oportunidade aberta exige a próxima ação.
        assertThat(post("/api/v1/opportunities/" + opp + "/interactions", "s11-int-0010",
                "{\"kind\":\"VISITA\",\"summary\":\"Medimos a linha\"}").statusCode()).isEqualTo(422);
        assertThat(post("/api/v1/opportunities/" + opp + "/interactions", "s11-int-0011", """
                {"kind":"VISITA","summary":"Medimos a linha","nextActionDate":"%s","nextActionNote":"Mandar proposta"}
                """.formatted(dia(7))).statusCode()).isEqualTo(201);
        assertThat(get("/api/v1/leads/" + lead + "/interactions").body()).contains("Medimos a linha");

        // Sem cliente não há proposta; converter em cliente cria o cliente uma vez e liga a oportunidade.
        HttpResponse<String> semCliente = post("/api/v1/proposals", "s11-prop-0000", """
                {"opportunityId":"%s","customerId":"%s","title":"x","validUntil":"%s","lines":[]}
                """.formatted(opp, lead, dia(30)));
        assertThat(semCliente.statusCode()).isEqualTo(422);
        HttpResponse<String> leadLido = get("/api/v1/leads/" + lead);
        HttpResponse<String> convertido = withVersion("POST", "/api/v1/leads/" + lead + "/customer", campo(leadLido.body(), "version"), null);
        assertThat(convertido.statusCode()).as(convertido.body()).isEqualTo(200);
        String cliente = campo(convertido.body(), "customerId");
        assertThat(convertido.body()).contains("\"customerName\":\"Amidonaria Paraíso\"");
        assertThat(withVersion("POST", "/api/v1/leads/" + lead + "/customer", "1", null).body()).contains(cliente);
        assertThat(conta("select count(*) from partner where legal_name = 'Amidonaria Paraíso'")).isEqualTo(1);
        assertThat(get("/api/v1/customers/" + cliente).body()).contains("\"city\":\"Paranavaí\"", "Sr. Teste");
        HttpResponse<String> comCliente = get("/api/v1/opportunities/" + opp);
        assertThat(comCliente.body()).contains("\"customerId\":\"" + cliente + "\"", "\"unitName\":\"Paranavaí\"");

        // Proposta da oportunidade: emitir leva à etapa Proposta; virar pedido ganha a oportunidade.
        HttpResponse<String> prop = post("/api/v1/proposals", "s11-prop-0001", """
                {"opportunityId":"%s","customerId":"%s","title":"Balança automática","validUntil":"%s",
                 "lines":[{"kind":"EQUIPAMENTO","description":"Balança Renda+","quantity":"1","unitPrice":"150000"}]}
                """.formatted(opp, cliente, dia(30)));
        assertThat(prop.statusCode()).as(prop.body()).isEqualTo(201);
        String proposta = campo(prop.body(), "id");
        assertThat(prop.body()).contains("\"opportunityId\":\"" + opp + "\"");
        assertThat(withVersion("POST", "/api/v1/proposals/" + proposta + "/issue", "1", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/opportunities/" + opp).body()).contains("\"stage\":\"PROPOSTA\"", "\"weightedCents\":\"9000000\"");
        assertThat(get("/api/v1/opportunities/" + opp + "/proposals").body()).contains(proposta);
        HttpResponse<String> pedido = post("/api/v1/proposals/" + proposta + "/orders", "s11-conv-0001", "{}");
        assertThat(pedido.statusCode()).as(pedido.body()).isEqualTo(201);
        HttpResponse<String> ganha = get("/api/v1/opportunities/" + opp);
        assertThat(ganha.body()).contains("\"status\":\"GANHA\"", "\"wonOrderCode\":\"" + campo(pedido.body(), "code") + "\"",
                "\"closePercent\":\"100.00\"", "\"weightedCents\":\"15000000\"", "\"nextActionDate\":null");
        assertThat(get("/api/v1/opportunities/" + opp + "/history").body())
                .contains("OPPORTUNITY_OPENED", "OPPORTUNITY_STAGE_CHANGED", "OPPORTUNITY_CUSTOMER_LINKED", "OPPORTUNITY_WON");
        assertThat(jdbc.sql("select event_type from outbox_event where aggregate_type = 'opportunity'").query(String.class).list())
                .contains("OpportunityOpened", "OpportunityStageChanged");
    }

    @Test
    void perdaComMotivoDaListaEPropostaSemOportunidade() throws Exception {
        String lead = prospeccao("s11-lead-0020", "Fécula Horizonte");
        String opp = oportunidade("s11-opp-0020", lead, "Retrofit", "8000000");
        HttpResponse<String> outro = withVersion("POST", "/api/v1/opportunities/" + opp + "/loss", "1", "{\"lossReason\":\"OUTRO\"}");
        assertThat(outro.statusCode()).isEqualTo(422);
        assertThat(outro.body()).contains("\"field\":\"lossNote\"");
        HttpResponse<String> perdida = withVersion("POST", "/api/v1/opportunities/" + opp + "/loss", "1", "{\"lossReason\":\"CONCORRENTE\"}");
        assertThat(perdida.body()).contains("\"status\":\"PERDIDA\"", "\"lossReason\":\"CONCORRENTE\"", "\"weightedCents\":\"0\"");
        assertThat(withVersion("POST", "/api/v1/opportunities/" + opp + "/stage", "2", """
                {"stage":"NEGOCIACAO","nextActionDate":"%s","nextActionNote":"x"}""".formatted(dia(1))).statusCode()).isEqualTo(409);

        // Proposta feita sem oportunidade ganha uma na etapa Proposta; a perda da proposta perde a oportunidade com o motivo.
        String cliente = campo(post("/api/v1/customers", "s11-cli-0020", "{\"legalName\":\"Amido Leste Ltda.\",\"units\":[{\"name\":\"Fábrica\"}]}").body(), "id");
        HttpResponse<String> prop = post("/api/v1/proposals", "s11-prop-0020", """
                {"customerId":"%s","title":"Balança avulsa","validUntil":"%s",
                 "lines":[{"kind":"EQUIPAMENTO","description":"Balança","quantity":"1","unitPrice":"98765.43"}]}
                """.formatted(cliente, dia(30)));
        assertThat(prop.statusCode()).as(prop.body()).isEqualTo(201);
        String oppDaProposta = campo(prop.body(), "opportunityId");
        assertThat(get("/api/v1/opportunities/" + oppDaProposta).body()).contains("\"stage\":\"PROPOSTA\"",
                "\"potentialCents\":\"9876543\"", "\"name\":\"Balança avulsa\"", "\"nextActionDate\":\"" + dia(30) + "\"");
        // Com a proposta aberta, a perda é registrada na proposta.
        assertThat(withVersion("POST", "/api/v1/opportunities/" + oppDaProposta + "/loss", "1",
                "{\"lossReason\":\"PRECO\"}").statusCode()).isEqualTo(409);
        assertThat(withVersion("POST", "/api/v1/proposals/" + campo(prop.body(), "id") + "/outcome", "1",
                "{\"outcome\":\"PERDIDA\",\"reason\":\"Achou caro\",\"lossReason\":\"PRECO\"}").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/opportunities/" + oppDaProposta).body()).contains("\"status\":\"PERDIDA\"", "\"lossReason\":\"PRECO\"",
                "\"lossNote\":\"Achou caro\"");

        HttpResponse<String> funil = get("/api/v1/crm/funnel");
        assertThat(funil.body()).contains("\"lost\":{\"count\":2,\"potentialCents\":\"17876543\"}",
                "\"CONCORRENTE\":{\"count\":1,\"potentialCents\":\"8000000\"}", "\"PRECO\":{\"count\":1,\"potentialCents\":\"9876543\"}");
    }

    @Test
    void funilPonderadoConversaoEtapasConfiguraveisEAgenda() throws Exception {
        String a = oportunidade("s11-opp-0030", prospeccao("s11-lead-0030", "Fécula A"), "OP A", "12000000");
        String b = oportunidade("s11-opp-0031", prospeccao("s11-lead-0031", "Fécula B"), "OP B", "15000000");
        String c = oportunidade("s11-opp-0032", prospeccao("s11-lead-0032", "Fécula C"), "OP C", "9876543");
        withVersion("POST", "/api/v1/opportunities/" + b + "/stage", "1", """
                {"stage":"VISITA_TECNICA","nextActionDate":"%s","nextActionNote":"Visita"}""".formatted(dia(1)));
        withVersion("POST", "/api/v1/opportunities/" + c + "/stage", "1", """
                {"stage":"NEGOCIACAO","nextActionDate":"%s","nextActionNote":"Negociar"}""".formatted(HOJE));

        // Etapas do mock (V20): R$ 12.000,00 (10%) + R$ 60.000,00 (40%) + R$ 79.012,34 (80% de 98.765,43) = R$ 151.012,34.
        HttpResponse<String> funil = get("/api/v1/crm/funnel");
        assertThat(funil.statusCode()).as(funil.body()).isEqualTo(200);
        assertThat(funil.body()).contains("\"openCount\":3", "\"openPotentialCents\":\"36876543\"", "\"openWeightedCents\":\"15101234\"",
                "{\"code\":\"PROSPECCAO\",\"name\":\"Prospecção\",\"closePercent\":\"10.00\",\"count\":1,\"potentialCents\":\"12000000\",\"weightedCents\":\"1200000\"}",
                "{\"code\":\"NEGOCIACAO\",\"name\":\"Negociação\",\"closePercent\":\"80.00\",\"count\":1,\"potentialCents\":\"9876543\",\"weightedCents\":\"7901234\"}",
                // 3 entraram em Prospecção, 2 avançaram; ninguém entrou em Proposta: não calculável.
                "{\"code\":\"PROSPECCAO\",\"name\":\"Prospecção\",\"entered\":3,\"advanced\":2,\"rate\":\"66.67\"}",
                "{\"code\":\"PROPOSTA\",\"name\":\"Proposta\",\"entered\":0,\"advanced\":0,\"rate\":null}");

        // Etapa configurável: Visita técnica a 30% muda o ponderado.
        assertThat(withVersion("PUT", "/api/v1/opportunity-stages/VISITA_TECNICA", "1",
                "{\"name\":\"Visita técnica\",\"closePercent\":\"130\"}").statusCode()).isEqualTo(422);
        HttpResponse<String> etapa = withVersion("PUT", "/api/v1/opportunity-stages/VISITA_TECNICA", "1",
                "{\"name\":\"Visita técnica\",\"closePercent\":\"30\"}");
        assertThat(etapa.body()).contains("\"closePercent\":\"30.00\"", "\"version\":\"2\"");
        assertThat(get("/api/v1/opportunities/" + b).body()).contains("\"weightedCents\":\"4500000\"");
        assertThat(get("/api/v1/opportunity-stages/VISITA_TECNICA/history").body()).contains("OPPORTUNITY_STAGE_CONFIGURED");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("PUT", "/api/v1/opportunity-stages/VISITA_TECNICA", consulta, "{\"name\":\"x\",\"closePercent\":\"1\"}",
                Map.of("If-Match", "\"2\"")).statusCode()).isEqualTo(403);

        // Agenda: C hoje, B amanhã (próximos 7 dias), A em 2 dias.
        HttpResponse<String> agenda = get("/api/v1/crm/agenda");
        assertThat(agenda.body()).contains("\"bucket\":\"HOJE\",\"kind\":\"OPORTUNIDADE\",\"id\":\"" + c + "\"",
                "\"bucket\":\"SEMANA\",\"kind\":\"OPORTUNIDADE\",\"id\":\"" + b + "\"",
                "\"bucket\":\"SEMANA\",\"kind\":\"OPORTUNIDADE\",\"id\":\"" + a + "\"");
        assertThat(get("/api/v1/crm/owners").body()).contains("\"username\":\"" + ADMIN + "\"");
    }

    private static String jsonString(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    @Test
    void cargaDaListaComPreviaAvisosEBloqueiosSemDuplicar() throws Exception {
        String arquivo = Files.readString(Path.of("../../docs/scrum/sprints/exemplos/prospeccao-exemplo.json"));
        String corpo = "{\"fileName\":\"prospeccao-exemplo.json\",\"content\":" + jsonString(arquivo) + "}";
        HttpResponse<String> previa = post("/api/v1/lead-imports", null, corpo);
        assertThat(previa.statusCode()).as(previa.body()).isEqualTo(201);
        String id = campo(previa.body(), "id");
        // 10 linhas: estrela 7, empresa vazia e UF XX ficam de fora; a Beta repetida e a Gama em outra cidade só avisam.
        assertThat(previa.body()).contains("\"status\":\"PREVIA\"", "\"lineCount\":10", "\"toLoad\":7", "\"blocked\":3",
                "\"warnings\":2", "Estrelas 7 fora de 1 a 5", "Empresa vazia", "UF \\\"XX\\\" inválida",
                "Mesmo nome e cidade da linha 2", "Mesmo nome da linha 4 em outra cidade (Paranavaí × Mandaguaçu)");
        assertThat(conta("select count(*) from lead")).isZero();
        assertThat(campo(post("/api/v1/lead-imports", null, corpo).body(), "id")).isEqualTo(id);

        HttpResponse<String> confirmada = post("/api/v1/lead-imports/" + id + "/confirmation", "s11-imp-0001", null);
        assertThat(confirmada.statusCode()).as(confirmada.body()).isEqualTo(200);
        assertThat(confirmada.body()).contains("\"status\":\"CONFIRMADA\"", "\"createdCodes\":[\"L-");
        assertThat(conta("select count(*) from lead")).isEqualTo(7);
        assertThat(conta("select count(*) from lead where rating is null")).isEqualTo(2);
        assertThat(conta("select count(*) from lead where has_renda = 'DESCONHECIDO'")).isEqualTo(1);
        assertThat(conta("select count(*) from lead where source = 'LISTA' and stage = 'IDENTIFICADO'")).isEqualTo(7);
        post("/api/v1/lead-imports/" + id + "/confirmation", "s11-imp-0002", null);
        post("/api/v1/lead-imports", null, corpo);
        assertThat(conta("select count(*) from lead")).isEqualTo(7);

        // Outro arquivo com uma empresa já cadastrada: aviso, nunca união automática.
        String outro = "{\"prospeccoes\":[{\"empresa\":\"Fecularia Exemplo Alfa\",\"cidade\":\"Paranavaí\",\"uf\":\"PR\"}]}";
        HttpResponse<String> segunda = post("/api/v1/lead-imports", null, "{\"content\":" + jsonString(outro) + "}");
        assertThat(segunda.body()).contains("parece a prospecção já cadastrada", "\"toLoad\":1");
        String consulta = login(CONSULTA, Profile.CONSULTA);
        assertThat(call("POST", "/api/v1/lead-imports", consulta, corpo, Map.of()).statusCode()).isEqualTo(403);
    }
}
