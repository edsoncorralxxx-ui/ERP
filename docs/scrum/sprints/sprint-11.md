# Sprint 11 — CRM: prospecção, interações e funil de oportunidades

Situação: **Entregue para Review** (03/10/2026). Planning aprovado pelo PO em 03/10/2026 ("1. SIM, porém estude o CRM do SAP também, 2. exemplo, 3. sim, 4. sim, 5. sim").

O cronograma do projeto (EAP e Gantt, restante do B07), proposto antes desta sprint, voltou ao backlog por decisão do PO ("vamos implementar a sprint do CRM"). A proposta e as dez perguntas dele ficam para quando ele voltar.

## Objetivo

Registrar as empresas-alvo (**prospecção**) e cada contato com elas (**interações**), nunca deixar uma oportunidade aberta sem **próxima ação**, levar a **oportunidade** pelas etapas do funil até a proposta e o pedido que já existem, e ver o funil com o **valor ponderado** e a **conversão por etapa** (IND-016). Primeira fatia do CRM no módulo `comercial` (B05, telas *Prospecção* e *Oportunidades*).

## Respostas do PO (03/10/2026)

| Pergunta | Resposta | Consequência nesta sprint |
|---|---|---|
| 1. Etapas do funil | Sim, e estudar o CRM do SAP | Qualificação → Visita técnica → Proposta → Negociação → Ganha / Perdida, com o **percentual de fechamento por etapa** e o **valor ponderado** do SAP Business One (estudo abaixo) |
| 2. Lista de Fecularias | Exemplo | A carga é testada com `exemplos/prospeccao-exemplo.json` (empresas fictícias com os casos difíceis da lista real); a lista real entra quando o PO mandar |
| 3. Motivos de perda | Lista fixa | Preço, Prazo, Concorrente, Sem orçamento, Desistiu, Outro; texto obrigatório em "Outro" |
| 4. Próxima ação | Obrigatória na oportunidade aberta | Abrir, mudar de etapa e registrar interação numa oportunidade aberta exigem data e descrição da próxima ação; na prospecção é opcional |
| 5. Permissões | Consulta só vê | `lead.read` e `opportunity.read` no Administrador e na Consulta; o resto só no Administrador |

## Estudo do CRM do SAP Business One

O app segue as janelas do SAP Business One (ADR-017), então o CRM dele é a referência natural. O que o SAP B1 faz e o que adotamos:

| SAP Business One | Como funciona lá | Nesta sprint |
|---|---|---|
| **Parceiro do tipo Lead** | O lead é um parceiro de negócio do tipo *Lead*, que vira *Cliente* quando compra, sem recadastrar | A prospecção é um registro próprio (o B01 separa LEAD de CLIENTE: estrelas, possui Renda+, etapa), e **Converter em cliente** cria o cliente com os dados dela e liga os dois; as oportunidades e interações passam a mostrar o cliente |
| **Atividades** | Ligação, reunião, tarefa, nota, campanha e outros, ligadas ao parceiro, ao contato e a documentos, com lembrete e acompanhamento | **Interações**: ligação, e-mail, WhatsApp, visita, reunião e nota, com data, contato, resumo e a próxima ação; ligadas à prospecção, à oportunidade ou ao cliente. Lembretes por notificação ficam fora |
| **Oportunidade de venda — cabeçalho** | Parceiro, contato, responsável, nome, nº, situação (aberta, ganha, perdida), % de fechamento | Código `OP00001`, nome, prospecção ou cliente (e unidade), responsável, situação, etapa e % de fechamento |
| **Aba Potencial** | Data prevista de fechamento, valor potencial, **valor ponderado** (potencial × % da etapa), nível de interesse | Previsão de fechamento, valor potencial, valor ponderado, nível de interesse (baixo, médio, alto) e origem |
| **Aba Etapas** | Uma linha por etapa percorrida: datas, responsável, %, valor potencial e ponderado, documento ligado | Histórico de etapas (de, para, %, potencial e ponderado na data, quem e quando); é ele que alimenta a conversão por etapa |
| **Aba Concorrentes** | Concorrente, nível de ameaça, observação, quem ganhou | Concorrentes com ameaça (baixa, média, alta) e observação |
| **Aba Resumo** | Fecha como ganha (com o documento) ou perdida (com os motivos) | Ganha quando a proposta vira pedido; perdida com o motivo da lista fixa |
| **Configuração das etapas** | Cada etapa tem nome, ordem e % de fechamento editáveis | *Etapas do funil*: o Administrador altera nome e %; a ordem é fixa nesta sprint |
| **Relatórios** | Pipeline de oportunidades, análise de etapas, oportunidades ganhas e perdidas | *Funil de vendas*: quantidade, potencial e ponderado por etapa; ganhas e perdidas no período com os motivos; conversão por etapa (IND-016) |
| Parceiros, documentos ligados, anexos | Revendas e documentos de venda em abas | Só as propostas (aba *Propostas*); parceiros indicadores e anexos ficam fora |

Fontes: [Leverage Technologies — SAP Business One Opportunity Management](https://www.leveragetech.com.au/blog/sap-business-one-opportunity-management-sales-management-made-easy/), [Clearmark — Managing Sales Opportunities in SAP Business One](https://clearmark.freshdesk.com/support/solutions/articles/131695-managing-sales-opportunities-in-sap-business-one), [SAP Learning — Exploring CRM in SAP Business One](https://learning.sap.com/courses/managing-logistics-in-sap-business-one-es/exploring-customer-relationship-management-crm-), [Emerging Alliance — Managing activities in SAP Business One](https://www.emerging-alliance.com/managing-activities-in-sap-business-one/), [Salesforce — B2B Sales Pipeline](https://www.salesforce.com/sales/pipeline/b2b/).

## Decisões do planning

| Tema | Decisão |
|---|---|
| Prospecção | Código `PS00001`; empresa, nome comercial, cidade, UF, possui Renda+ (sim, não, desconhecido), estrelas (1 a 5 ou vazio — vazio é desconhecido, nunca zero), etapa (Identificado, Contatado, Interessado, Descartado com motivo), responsável, contato (nome, telefone, e-mail), origem, observação, próxima ação opcional; cliente ligado quando houver. Versão e auditoria |
| Interação | Tipo, data (não futura), contato, resumo (obrigatório), próxima ação (data e descrição); fica gravada como foi registrada (correção é outra interação). Ao registrar, a próxima ação passa para a prospecção ou oportunidade, e a prospecção Identificada passa a Contatada |
| Oportunidade | Código `OP00001`; aberta a partir da prospecção ou de um cliente; nome, valor potencial (≥ 0), previsão de fechamento, nível de interesse, origem, responsável, etapa, próxima ação obrigatória enquanto aberta, concorrentes |
| Etapas | Qualificação 10%, Visita técnica 25%, Proposta 50%, Negociação 75% (percentuais iniciais, editáveis pelo Administrador). Pode avançar ou voltar; cada mudança grava o histórico. Ganha = 100%, perdida = 0% |
| Valor ponderado | Potencial × % da etapa, arredondado nos centavos uma vez (meio para cima). Ex.: R$ 150.000,00 em Visita técnica (25%) = R$ 37.500,00 |
| Propostas | Toda proposta pertence a uma oportunidade. Nova proposta pela oportunidade (que precisa ter cliente); proposta criada sem oportunidade ganha uma na hora, em Proposta. Emitir a proposta leva a oportunidade a Proposta, se estava antes. Converter em pedido marca a oportunidade como **Ganha**; registrar a perda da proposta pede o motivo da lista e marca a oportunidade como **Perdida** quando ela não tem outra proposta aberta. A migração cria uma oportunidade para cada proposta existente |
| Converter em cliente | Cria o cliente (razão social = empresa, nome comercial, uma unidade com cidade e UF, o contato) e liga a prospecção e as oportunidades dela; idempotente. Exige `partner.create` |
| Carga da prospecção | `POST /lead-imports` com o JSON e `Idempotency-Key`: prévia (linhas, problemas) e confirmação; o mesmo arquivo (hash) não carrega duas vezes. Nomes repetidos ou parecidos (mesmo nome sem acentos, maiúsculas e "Ltda") viram aviso e são carregados separados; nada é unido sozinho. Estrela fora de 1 a 5 bloqueia a linha |
| Agenda | Próximas ações das prospecções e oportunidades abertas: vencidas, hoje, próximos 7 dias e depois; oportunidade aberta sem próxima ação aparece como pendência (só existe nas criadas pela migração) |
| Conversão por etapa (IND-016) | Para cada etapa: oportunidades que **entraram** nela no período e, dessas, as que **avançaram** depois (etapa seguinte ou ganha). Sem nenhuma entrada: "não calculável", nunca 0% |
| Permissões (PD-009) | `lead.read`, `opportunity.read` (Administrador e Consulta); `lead.create`, `lead.update`, `opportunity.create`, `opportunity.update`, `crm_stage.admin` (só Administrador) |

### Exemplo numérico

| Oportunidade | Etapa | Potencial | % | Ponderado |
|---|---|---|---|---|
| OP A | Qualificação | R$ 120.000,00 | 10% | R$ 12.000,00 |
| OP B | Visita técnica | R$ 150.000,00 | 25% | R$ 37.500,00 |
| OP C | Negociação | R$ 98.765,43 | 75% | R$ 74.074,07 (74.074,0725 → meio para cima) |
| **Funil aberto** | | **R$ 368.765,43** | | **R$ 123.574,07** |

Conversão: no período, 3 oportunidades entraram em Qualificação e 2 avançaram (66,67%); 0 entraram em Negociação → "não calculável".

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S11-01 | Prospecção | Migração V17; `/leads` com cadastro (Idempotency-Key), alteração (If-Match), descarte com motivo, trilha; estrela vazia ≠ 0; eventos `LeadRegistered`, `LeadUpdated` |
| S11-02 | Interações | `/interactions`; tipo, data não futura, resumo; próxima ação passa para o registro; Identificado → Contatado; `LeadInteractionRecorded` |
| S11-03 | Oportunidade | `/opportunities`; abrir da prospecção ou do cliente com próxima ação; alterar potencial, previsão, interesse, concorrentes; `OpportunityOpened` |
| S11-04 | Etapas e funil | `/opportunity-stages` (nome e % editáveis pelo Administrador); mudar de etapa com histórico e próxima ação; perder com motivo da lista; `OpportunityStageChanged`; valor ponderado |
| S11-05 | Ligação com as propostas | `proposal.opportunity_id`; migração cria as oportunidades das propostas existentes; emitir, converter em pedido e perder a proposta movem a oportunidade; nenhuma proposta sem oportunidade |
| S11-06 | Converter em cliente | `POST /leads/{id}/customer`: cria o cliente uma vez e liga a prospecção e as oportunidades |
| S11-07 | Carga da prospecção | `/lead-imports` com prévia e confirmação, hash, avisos de nomes repetidos ou parecidos, bloqueio de estrela inválida; o exemplo carrega com os números esperados |
| S11-08 | Agenda e funil | `GET /crm/agenda` e `GET /crm/funnel` (por etapa, ganhas e perdidas com motivos, conversão IND-016 com "não calculável") |
| S11-09 | Contratos | OpenAPI; eventos, comandos, permissões e `menu.json` no B01; verificador B01 OK |
| S11-10 | Telas | *CRM → Prospecção* (lista, ficha com Interações, Oportunidades e Histórico, **Importar lista**, **Converter em cliente**), *CRM → Oportunidades* (ficha no desenho do SAP: Potencial, Etapas, Interações, Propostas, Concorrentes, Resumo, Histórico), *CRM → Funil de vendas*, *CRM → Agenda*, *CRM → Etapas do funil*; *Vendas → Propostas* (era "Oportunidades e propostas") com a oportunidade; Consulta só vê; design system (`rp-*`) |
| S11-11 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-11.e2e.ts`, escrito logo que a primeira tela existir: carga do exemplo, interação, oportunidade, etapas, conversão em cliente, proposta, pedido e oportunidade ganha; roda duas vezes no mesmo banco |

Ordem: S11-01 → S11-11. Se faltar tempo, sai primeiro a carga (S11-07) e depois os concorrentes.

## Fora do escopo

Enviar e-mail ou WhatsApp pelo sistema; lembretes por notificação; campanhas e canais (AN-006), planejamento de marketing (AN-007); previsão de vendas com probabilidade calibrada pelo histórico; parceiros indicadores e anexos na oportunidade; unir prospecções duplicadas; a lista real de fecularias (entra quando o PO mandar); o cronograma (EAP e Gantt).

## Como verificar (ao final)

1. *CRM → Prospecção → Importar lista* com `exemplos/prospeccao-exemplo.json`: a prévia mostra as linhas, os avisos de nomes parecidos e a estrela inválida; confirmar carrega; reenviar não duplica.
2. Abrir uma prospecção, **Registrar interação** (ligação, resumo e próxima ação): a etapa passa a Contatado e a próxima ação aparece na lista e na *Agenda*.
3. **Abrir oportunidade** (potencial R$ 150.000,00, próxima ação): fica em Qualificação, 10%, ponderado R$ 15.000,00; **Mudar etapa** para Visita técnica: R$ 37.500,00 e uma linha na aba Etapas.
4. **Converter em cliente**: o cliente aparece em *Clientes e unidades* e na oportunidade.
5. **Nova proposta** pela oportunidade, emitir e converter em pedido: a oportunidade fica **Ganha**.
6. Outra oportunidade, **Marcar como perdida** com "Concorrente": aparece em *Funil de vendas* nas perdidas por motivo.
7. *Etapas do funil*: mudar Visita técnica para 30% muda o ponderado no funil.
8. Entrar como Consulta: vê tudo; não cadastra, não registra interação nem muda etapa.

## Riscos

- **Migração das propostas existentes**: cada proposta vira uma oportunidade; as abertas ficam sem próxima ação e aparecem como pendência na Agenda, em vez de inventar uma data.
- **Duplicidade na lista real**: nomes parecidos podem ser duas unidades legítimas (Alimentos Lopes) ou erro de digitação (AMAGIL × AMAFIL); a carga só avisa.
- **Volume da sprint**: são cinco telas novas; a ordem acima diz o que sai primeiro.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S11-01 Prospecção | Pronto | Migração V17 (`lead`); `CrmApiTest.prospeccaoComEstrelaDesconhecidaInteracaoEDescarte`: estrela 0 → 422, vazia fica `null`; UF em maiúsculas; a mesma chave devolve a mesma prospecção; versão antiga → 412; descarte exige motivo; trilha `LEAD_REGISTERED`, `LEAD_INTERACTION_RECORDED`, `LEAD_UPDATED`, `LEAD_DISCARDED`; Consulta lê e recebe 403 ao cadastrar |
| S11-02 Interações | Pronto | Data futura → 422; sem data = hoje; a próxima ação passa para a prospecção; Identificado → Contatado; repetir a chave não duplica (`crm_interaction` = 1); prospecção descartada recusa interação (409) |
| S11-03 Oportunidade | Pronto | Sem próxima ação → 422 nos dois campos; aberta na Qualificação com 10% (R$ 150.000,00 → R$ 15.000,00); a prospecção passa a Interessado |
| S11-04 Etapas e funil | Pronto | Mudar etapa exige a próxima ação; Visita técnica → R$ 37.500,00 e a linha na aba Etapas; perda "Outro" sem texto → 422; perdida não muda mais (409); etapa a 130% → 422, a 30% muda o ponderado para R$ 45.000,00; Consulta não configura (403) |
| S11-05 Ligação com as propostas | Pronto | Emitir a proposta leva à etapa Proposta (R$ 75.000,00); converter em pedido → oportunidade Ganha com o pedido; proposta sem oportunidade cria uma na etapa Proposta com a validade como próxima ação; com proposta aberta, a perda vai pela proposta (409) e a perda da proposta perde a oportunidade com o motivo da lista. Migração conferida num banco com 3 propostas (aberta, ganha e perdida): OP00001 a OP00003 com a situação certa, a perdida com "Outro" e o motivo antigo, e a numeração seguindo em OP00004 |
| S11-06 Converter em cliente | Pronto | Cliente cadastrado uma vez (com a cidade como unidade e o contato), ligado à prospecção e à oportunidade; converter de novo devolve o mesmo cliente |
| S11-07 Carga da prospecção | Pronto | `cargaDaListaComPreviaAvisosEBloqueiosSemDuplicar` com `exemplos/prospeccao-exemplo.json`: 10 linhas, 7 carregadas, 3 com erro (estrela 7, empresa vazia, UF XX), 2 avisos (Beta repetida na mesma cidade, Gama em outra cidade); a prévia não cadastra; reenviar e confirmar de novo não duplica; empresa já cadastrada em outra lista vira aviso |
| S11-08 Agenda e funil | Pronto | Exemplo do planning: abertas R$ 368.765,43, ponderado R$ 123.574,07 (R$ 74.074,0725 → R$ 74.074,07); Qualificação 3 entraram e 2 avançaram (66,67%); Proposta sem entradas → "não calculável" (`rate: null`); perdas por motivo; agenda com hoje e próximos 7 dias |
| S11-09 Contratos | Pronto | `openapi.yaml` com `/leads`, `/lead-imports`, `/opportunities`, `/opportunity-stages`, `/crm/agenda`, `/crm/funnel`, `/crm/owners` (`OpenApiContractTest` passa); formulário `prospeccao` com os comandos e as permissões novas; eventos `LeadUpdated`, `LeadsImported`, `OpportunityUpdated`, `OpportunityStageConfigured`; `menu.json` com as cinco telas do CRM e "Propostas"; verificador B01 OK |
| S11-10 Telas | Pronto | `Sprint11Windows.test.tsx` (8 testes): cadastro com estrela vazia e Idempotency-Key; interação e Abrir oportunidade; Consulta só vê; oportunidade nova exige a próxima ação e mostra o ponderado; Mudar etapa com If-Match e perda com o motivo da lista; funil com "Não calculável"; agenda com a seta; carga com erros, avisos e confirmação |
| S11-11 Roteiro de ponta a ponta | Pronto | `apps/desktop/e2e/sprint-11.e2e.ts` no Chromium contra o servidor real: carga do exemplo (10/7/3/2), interação, oportunidade a R$ 15.000,00 e R$ 37.500,00, conversão em cliente, proposta e pedido pela API, oportunidade Ganha com o pedido no Resumo, funil e agenda. Passou em quatro execuções seguidas no mesmo banco (as empresas levam um sufixo por execução) |

Testes executados: servidor **117** (PostgreSQL 16 real; eram 112), app **144** (eram 136), typecheck, build, verificador B01 + testes, roteiros Playwright das Sprints 5 a 11 contra o servidor real.

**Corrigido junto:** o nome `rp-funil` já era do design system (o botão do funil de filtro); a tela usa `rp-crm-funil`. O roteiro de ponta a ponta achou isso no primeiro dia, como combinado na retrospectiva da Sprint 10.

**Decisões tomadas na execução (para confirmar na Review):**
- **Oportunidade sem cliente**: a oportunidade aberta a partir da prospecção pode existir sem cliente; a proposta só sai depois de **Converter em cliente** (como o lead do SAP B1, que vira cliente quando compra).
- **Propostas antigas**: cada uma virou uma oportunidade na etapa Proposta, com o título da proposta como nome, o total da revisão vigente como potencial e você (quem criou a proposta) como responsável. As abertas ficam **sem próxima ação** e aparecem na Agenda como pendência, em vez de uma data inventada.
- **Proposta feita fora do CRM** (direto em Vendas → Propostas): ganha uma oportunidade na hora, na etapa Proposta, com a validade da proposta como próxima ação.
- **Perda da proposta**: o diálogo pede o motivo da lista e o texto; a oportunidade só é perdida junto se não tiver outra proposta aberta.
- **Interação não muda**: corrigir uma interação é registrar outra (nota), para a trilha não perder o que foi dito.
- **Duplicidade na carga**: o nome é comparado sem acentos, maiúsculas, pontuação e "Ltda./ME/Indústria"; isso pega "Fécula Exemplo Gama" × "FECULA EXEMPLO GAMA LTDA", mas não pega grafias diferentes como AMAGIL × AMAFIL — essas continuam para a sua conferência.
- **"Oportunidades e propostas" virou "Propostas"** no menu de Vendas; as oportunidades ficam no CRM.

**Não verificado aqui:** o app dentro do Electron no macOS; a migração V17 no seu banco com as propostas reais (conferida num banco de teste com uma proposta de cada situação); a lista real de fecularias (o arquivo de exemplo usa empresas fictícias com os mesmos casos difíceis).

**Limitações conhecidas:**
- Responsável é o usuário do sistema; enquanto só houver o Administrador e a Consulta, a agenda "por responsável" mostra tudo de quem cadastrou.
- Lembretes por notificação, e-mail e WhatsApp pelo sistema ficaram fora (planning).
- O roteiro da Sprint 4 continua falhando quando roda de novo no mesmo banco (a ficha do equipamento não fecha com Esc depois de gravar, quando o foco está no botão); é a tarefa à parte registrada na Sprint 9. O trecho dele que esta sprint mudou (Vendas → Propostas) passa.

## Retrospectiva

- Funcionou: estudar o CRM do SAP Business One antes de desenhar. A oportunidade com abas (Potencial, Etapas, Concorrentes, Resumo) e o valor ponderado por etapa vieram prontos do modelo que o app já imita.
- Funcionou: rodar o roteiro de ponta a ponta logo que as telas existiram (ação da Sprint 10). Ele pegou o conflito de nome de classe com o design system, que os testes de componente não pegariam.
- Melhorar: classe nova no `app.css` pode colidir com uma do `bundle.css` sem nenhum aviso.
- Ação: na próxima sprint, prefixar as classes de tela com o nome do módulo (`rp-crm-`, `rp-bom-`) e conferir no `bundle.css` antes de criar.
