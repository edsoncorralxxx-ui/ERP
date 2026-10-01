# Sprint 10 — BOM: composição de custos por modelo e por equipamento

Situação: **Entregue para Review** (01/10/2026). Planning aprovado pelo PO em 01/10/2026 ("aprovado"), com as perguntas respondidas na tabela abaixo.

A conciliação bancária com importação de extrato OFX/CSV, proposta para esta sprint, foi **adiada pelo PO em 01/10/2026** e voltou ao backlog. A proposta e as perguntas dela (onde processar o arquivo, extrato real do banco, conciliar com diferença, janela de ±3 dias, PD-006) ficam para quando ela voltar.

## Objetivo

Cadastrar a lista de materiais e serviços de cada **modelo de equipamento** em **revisões com submontagens**, congeladas depois de aprovadas. Aplicar uma revisão ao equipamento vendido, com ajustes próprios daquele equipamento, e ver no projeto o **custo planejado** e a **margem prevista** em relação ao valor vendido. Uma revisão nova do modelo não muda o que já foi aplicado. Primeira fatia do módulo `engenharia` (B07, tela *BOM — composição de custos*).

## Respostas do PO (01/10/2026)

| Pergunta | Resposta | Consequência nesta sprint |
|---|---|---|
| 1. Modelo de equipamento vira cadastro | Sim | Cadastro *Modelos*; o texto livre dos equipamentos atuais vira modelo, numa lista conferida pelo PO antes de aplicar |
| 2. BOM em um nível ou com submontagens | Com submontagem | Linha de **item** ou de **submontagem** (outra BOM com revisão própria); ciclo recusado |
| 3. Quem aprova a revisão | Administrador | `bom.update`, `bom.approve` e `project_bom.apply` só no **Administrador** |
| 4. Custo unitário | Digitado | O custo é digitado em cada linha, não vem do custo de referência do item |
| 5. Ajuste por equipamento | Pode ser ajustada | A BOM do equipamento aceita incluir, retirar e alterar linhas, com motivo e auditoria |
| 6. Exemplo real | Enviado em JSON | `exemplos/bom-balanca-hidrostatica-rev00.json`: Balança Hidrostática Renda+ Automática, rev. 00 de 03/03/2026 |
| 7. Submontagens | Submontagem | **Mecânica**, **Elétrica** e **Painel elétrico** são BOMs próprias, com revisão, reaproveitáveis em outros modelos |
| 8. Linhas sem código | Código gerado | Na carga, item sem código vira item do cadastro com código gerado (`MEC-0001`, `ELE-0001`) |
| 9. Unidade vazia na elétrica | UND | Linha sem unidade é carregada como **UND** |
| 10. Coluna "Unid. Ref." | Retirar | Não é carregada nem guardada |
| 11. Diferença de R$ 3.000,00 da pintura | A pintura é R$ 1.400,00 | A diferença não existe na BOM real: R$ 28.477,40 + R$ 40.921,11 = R$ 69.398,51. O aviso de "total informado diferente da soma" continua, testado com um exemplo próprio do teste |

## Decisões do planning

| Tema | Decisão |
|---|---|
| Estrutura | Modelo → BOM (`bom_template`) → revisões (`bom_revision`, numeradas 00, 01…) → linhas (`bom_line`). A linha aponta para um **item** do cadastro ou para uma **submontagem** (outra BOM, revisão aprovada escolhida na linha). Ciclo (A contém B, que contém A) é recusado ao salvar |
| Linha | Item ou submontagem, quantidade (escala 6, > 0), unidade com conversão do cadastro, **custo unitário digitado** (escala 6), categoria da BOM (as da origem: CAT-01…CAT-10, ELE-01, ELE-02), fornecedor e material opcionais, observação |
| Ciclo de vida | Rascunho → **Aprovada** (imutável) → Substituída quando outra é aprovada. Revisão nova parte de cópia da última. Aprovar exige toda linha com quantidade e custo; quantidade vazia é problema que bloqueia, nunca zero |
| Custo | Linha = quantidade × custo unitário, arredondado nos centavos uma vez (meio para cima). Submontagem = total da revisão dela × quantidade. Total = Σ linhas; subtotais por submontagem e por categoria |
| Total informado | Campo opcional na revisão; diferente da soma, a diferença é exibida e nunca corrigida |
| Equipamento | Aplicar uma revisão aprovada cria a BOM do equipamento, uma cópia congelada (idempotente: aplicar de novo não duplica). Ajustes (incluir, retirar, alterar) exigem motivo e ficam na auditoria; a tela mostra a diferença em relação à revisão do modelo. Trocar de revisão exige motivo e guarda o histórico |
| Custo planejado e margem | Por projeto: Σ BOM dos equipamentos; valor vendido das linhas do pedido; margem = vendido − custo, em R$ e %. Equipamento sem BOM: "sem custo planejado", nunca zero. Cada valor abre a composição |
| Carga do arquivo | `POST /bom-imports` com o JSON no formato do exemplo e `Idempotency-Key`; primeiro **prévia** (linhas, totais e problemas), depois **confirmar**. O mesmo arquivo (hash) não carrega duas vezes. Os problemas da origem aparecem e nada é corrigido sozinho |
| Permissões (PD-009) | Ver com `bom.read` (Administrador e Consulta); editar e importar com `bom.update`; aprovar com `bom.approve`; aplicar e ajustar no equipamento com `project_bom.apply` — os três só no **Administrador** (nomes do contrato B01 do formulário "bom") |

### Exemplo numérico (BOM real, rev. 00)

| Submontagem | Categorias | Linhas | Custo |
|---|---|---|---|
| Mecânica | CAT-01 a CAT-10 (Pintura SRV-02: R$ 1.400,00) | 127 | R$ 28.477,40 |
| Elétrica, sem o painel | ELE-02 Componentes externos | 26 | R$ 11.791,44 |
| Painel elétrico (dentro da Elétrica) | ELE-01 | 50 | R$ 29.129,67 |
| **Balança Hidrostática Renda+ Automática** | | **203** | **R$ 69.398,51** |

A Elétrica completa custa R$ 40.921,11 (R$ 11.791,44 + R$ 29.129,67). Se o equipamento for vendido por R$ 120.000,00, a margem prevista é de R$ 50.601,49 (42,17%).

### Problemas da origem que a prévia da carga mostra

| Linha | Problema | Tratamento |
|---|---|---|
| Elétrica 38 — Suporte 45° p/ Trilho DIN | Sem quantidade (total R$ 0,00) | Bloqueia a aprovação até a quantidade ser informada |
| Mecânica 5 e 33 (ADR-01-269-P); 38 e 42 (ADR-01-129-P) | Mesmo código com medida e preço diferentes | Aviso; o PO decide se é o mesmo item |
| Mecânica 24 (SAE 1021), 45 (Inox 311), 46 (descrição Inox, material SAE 1020), 32 (sem material) | Material possivelmente digitado errado | Aviso; carregado como está |
| Mecânica 89 a 92, 99 e 100 | Unidade CT com preço que parece unitário | Aviso; carregado como está |
| 124 linhas sem código | Sem código | Item novo com código gerado |
| Elétrica sem unidade | Sem unidade | UND |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S10-01 | Modelos de equipamento | Migração V15; cadastro *Modelos* (código, descrição, situação), com versão e inativação; equipamento aponta para o modelo; os textos de modelo existentes viram modelos (conferidos pelo PO) |
| S10-02 | Revisão com submontagens | `bom_template`, `bom_revision`, `bom_line`; linha de item ou submontagem; ciclo recusado (`BOM_CYCLE`); rascunho → aprovada imutável; revisão nova a partir de cópia; eventos `BomRevisionApproved`; auditoria |
| S10-03 | Custo da revisão | Linha, submontagem, subtotais por categoria e total; arredondamento uma vez por linha; quantidade vazia bloqueia a aprovação; total informado × soma com a diferença exibida |
| S10-04 | Carga da BOM | `POST /bom-imports` (prévia e confirmação, `Idempotency-Key`, hash); o exemplo carrega em Mecânica, Elétrica e Painel elétrico com R$ 28.477,40 + R$ 40.921,11 = R$ 69.398,51; itens com código gerado; os problemas da tabela acima aparecem; recarregar não duplica |
| S10-05 | Aplicar ao equipamento | `POST /equipment/{id}/bom`; cópia congelada; idempotente; revisão nova do modelo não altera o equipamento; troca de revisão com motivo; evento `BomApplied` |
| S10-06 | Ajuste por equipamento | Incluir, retirar e alterar linhas com motivo; diferença em relação ao modelo; evento `EquipmentBomAdjusted`; auditoria |
| S10-07 | Custo planejado e margem | No projeto: custo planejado, valor vendido, margem em R$ e %; "sem custo planejado" quando faltar BOM; composição de cada valor confere com a soma |
| S10-08 | Comparar revisões | Linhas incluídas, removidas e alteradas (quantidade e custo) e variação do total |
| S10-09 | Contratos | OpenAPI (`/equipment-models`, `/bom-templates`, `/bom-revisions`, `/bom-imports`, `/equipment/{id}/bom`, custo do projeto); permissões; eventos e comandos no B01; `menu.json` com *BOM — composição de custos* implementado; verificador B01 OK |
| S10-10 | Telas | *Projetos e engenharia → BOM*: modelos, árvore de submontagens, grade de linhas com subtotais, **Importar BOM** (prévia com problemas), **Aprovar revisão**, **Nova revisão**, **Comparar**; *Equipamentos*: **Aplicar BOM** e **Ajustar** com motivo; *Detalhe do projeto*: custo, margem e composição com setas; Consulta só vê; design system (`rp-*`) |
| S10-11 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-10.e2e.ts`: importa a BOM real, informa a quantidade da linha 38, aprova, aplica ao equipamento de um pedido, ajusta uma linha, confere custo e margem pela API, aprova uma revisão nova e confere que o equipamento não mudou; roda no CI e duas vezes seguidas no mesmo banco |

Ordem: S10-01 → S10-02 → S10-03 → S10-04 → S10-05 → S10-06 → S10-07 → S10-08 → S10-09 → S10-10 → S10-11. Se faltar tempo, sai primeiro o S10-08 (comparar revisões) e depois a margem (fica só o custo planejado).

## Fora do escopo

Conciliação bancária (adiada); carga de BOM em outros formatos (planilha, PDF); ligação das linhas com atividades do cronograma (EAP, próxima fatia de B07); necessidades de compra e reserva de estoque (B08); custo realizado e composição montada (B09); custo de referência do item alimentando a BOM.

## Como verificar (ao final)

1. *Projetos e engenharia → BOM*: **Importar BOM** com `exemplos/bom-balanca-hidrostatica-rev00.json`; a prévia mostra 203 linhas, R$ 69.398,51 e os problemas da tabela.
2. Confirmar: modelo "Balança Hidrostática Renda+ Automática" com as submontagens Mecânica (R$ 28.477,40), Elétrica (R$ 40.921,11) e, dentro dela, Painel elétrico (R$ 29.129,67).
3. **Aprovar revisão** é recusado até informar a quantidade do Suporte 45°; depois aprova.
4. *Equipamentos*: **Aplicar BOM** ao equipamento de um pedido; *Detalhe do projeto* mostra o custo planejado e a margem; clicar no custo abre a composição.
5. **Ajustar** a BOM do equipamento (por exemplo, retirar uma linha) com motivo: o custo do projeto muda e a diferença em relação ao modelo aparece.
6. **Nova revisão** do modelo, alterar a Pintura e aprovar: o equipamento continua com a rev. 00; **Comparar** mostra a mudança.
7. Entrar como Consulta: vê tudo; não importa, não aprova nem aplica.

## Riscos

- **Volume de linhas**: 203 linhas digitadas à mão seriam inviáveis; a carga do JSON é o caminho principal, e a grade precisa rolar e somar bem com esse volume.
- **Submontagem compartilhada**: uma revisão nova do Painel elétrico não pode mudar o custo de uma revisão aprovada que já o usa; a linha de submontagem guarda a revisão escolhida.
- **Itens com código gerado**: 124 itens novos entram no cadastro de uma vez; a prévia mostra quais serão criados antes de confirmar.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S10-01 Modelos de equipamento | Pronto | Migração V15: o texto de modelo dos equipamentos vira `equipment_model` (textos iguais sem diferenciar maiúsculas e espaços repetidos ficam juntos) e o equipamento aponta para ele; a confirmação do pedido encontra o modelo pelo nome ou o cadastra. `BomApiTest.modelosDeEquipamentoEConsultaSoVe`: pedido com "  balança hidrostática   RENDA+ automática " cai no mesmo modelo; nome repetido → `EQUIPMENT_MODEL_DUPLICATE`; renomear com If-Match. Tela *Modelos de equipamento* com a coluna Equipamentos para conferência |
| S10-02 Revisão com submontagens | Pronto | `bom`, `bom_revision`, `bom_line`; linha de item ou de submontagem (revisão escolhida de outra BOM); ciclo → `BOM_CYCLE`; BOM de modelo não entra como submontagem; aprovada não muda (409); revisão nova copia a aprovada; um rascunho por BOM (`BOM_DRAFT_EXISTS`) |
| S10-03 Custo da revisão | Pronto | `BomCostTest`: linha arredondada meio para cima uma vez, submontagem × quantidade, pendência fora da soma. Subtotais por categoria (Serviços R$ 10.109,79 com a Pintura de R$ 1.400,00); total informado × soma com a diferença exibida e não corrigida |
| S10-04 Carga da BOM | Pronto | `previaDaBomRealMostraTotaisSubmontagensEProblemasSemGravarNada`: 203 linhas, R$ 69.398,51 (Mecânica R$ 28.477,40, Elétrica R$ 40.921,11, Painel elétrico R$ 29.129,67), a linha 38 sem quantidade, os códigos repetidos, o item 46 (inox × SAE 1020), 124 códigos gerados (MEC-0001…, ELE-0001…), as 6 observações do arquivo; a prévia não grava itens nem BOM e o mesmo arquivo devolve a mesma carga. `cargaCriaModelo…`: 201 itens (5 serviços), 4 BOMs, confirmar de novo ou reenviar não cria nada |
| S10-05 Aplicar ao equipamento | Pronto | Cópia congelada em árvore (206 linhas); aplicar de novo não muda a versão; rascunho não se aplica; a revisão 01 do modelo não muda o equipamento (fica na 00 "Substituída"); trocar de revisão exige motivo |
| S10-06 Ajuste por equipamento | Pronto | Retirar a Pintura (R$ 69.407,95 → R$ 68.007,95), alterar a quantidade dos parafusos, incluir item numa submontagem, tudo com motivo e versão (412 com a versão antiga); o modelo continua em R$ 69.407,95; auditoria `EQUIPMENT_BOM_ADJUSTED` |
| S10-07 Custo planejado e margem | Pronto | `GET /projects/{id}/planned-cost`: sem BOM → "sem custo planejado" e sem margem; com BOM: R$ 120.000,00 − R$ 69.407,95 = R$ 50.592,05 (42,16%) |
| S10-08 Comparar revisões | Pronto | Modelo rev. 01 × 00: a Mecânica mudou de revisão (+ R$ 100,00); Mecânica rev. 01 × 00: a Pintura de R$ 1.400,00 para R$ 1.500,00 |
| S10-09 Contratos | Pronto | `openapi.yaml` com `/equipment-models`, `/boms`, `/bom-revisions`, `/bom-imports`, `/equipment/{id}/bom` e `/projects/{id}/planned-cost` (`OpenApiContractTest` passa); eventos `BomImported`, `EquipmentBomAdjusted`, `EquipmentModelRegistered`, `EquipmentModelUpdated`; comandos ImportBom e AdjustEquipmentBom no B01; `engenharia` passa a declarar `acesso` e `auditoria`; `menu.json` com *BOM — composição de custos* e *Modelos de equipamento*; verificador B01 OK |
| S10-10 Telas | Pronto | `Sprint10Windows.test.tsx` (7 testes): pendência e gravação da quantidade com If-Match, recusa da aprovação listando a linha, aprovação; seta da submontagem; Consulta só vê; prévia e confirmação da carga com Idempotency-Key; aplicar e retirar linha com motivo no equipamento; custo planejado sem e com margem |
| S10-11 Roteiro de ponta a ponta | Pronto | `apps/desktop/e2e/sprint-10.e2e.ts` no Chromium contra o servidor real, com o produto da BOM real renomeado por execução: prévia de 203 linhas e R$ 69.398,51; quantidade do Suporte 45° no Painel; aprovação das 4 BOMs; aplicação ao equipamento do pedido; Pintura retirada (R$ 68.007,95); margem R$ 51.992,05 (43,33%) conferida pela API; revisão 01 aprovada pela API sem mudar o equipamento; comparação 00 → 01 na tela. Passa com o banco vazio e em execuções repetidas no mesmo banco |

Testes executados: servidor **113** (PostgreSQL 16 real; eram 104), app **131** (eram 124), typecheck, build, verificador B01 + testes, roteiros Playwright das Sprints 4 a 10.

**Corrigido junto:** as janelas abertas das submontagens agora se atualizam quando a aprovação da BOM de cima as aprova (antes continuavam mostrando "Rascunho").

**Decisões tomadas na execução (para confirmar na Review):**
- **Unidade "UND" e vazia → UN**: o cadastro já tinha UN (Unidade), então UND e a unidade vazia viram UN. SRV (Serviço) e CT (Cento) foram cadastradas pela carga.
- **"Unid. Ref." da elétrica**: os textos como "3 unidades" foram retirados, como você pediu. Mas em 6 linhas a coluna trazia a própria unidade — M (cabos) e SRV (mão de obra). Nessas, a carga usa a unidade em vez de UN. Se preferir UN também nelas, é uma linha no código.
- **Margem**: é calculada sobre o **valor contratado do projeto** (o pedido inteiro), não por equipamento. Num pedido com mais de um item, a margem é a do conjunto.
- **Itens criados pela carga** entram sem controle de estoque e sem custo de referência; a categoria do item é a da BOM ("Chapas e peças cortadas a laser").
- **Códigos repetidos** (ADR-01-269-P e ADR-01-129-P): as duas linhas usam o mesmo item do cadastro, com a descrição de cada linha; a prévia avisa.
- **Exemplo do planning**: com a quantidade 1 no Suporte 45° (R$ 9,44), o total aprovado é R$ 69.407,95, e a margem do exemplo passa de 42,17% para 42,16%.

**Não verificado aqui:** o app dentro do Electron no macOS; a migração dos modelos no seu banco com equipamentos reais. A regra de agrupar da V15 foi conferida à parte, numa tabela temporária: "Balança BF-200" e "balança  bf-200 " ficaram num modelo, e nenhum equipamento ficou sem modelo. O nome que fica é a primeira grafia em ordem alfabética (por exemplo "RENDA+ AUTOMÁTICA" no lugar de "Renda+ Automática"); dá para renomear na tela *Modelos de equipamento*.

**Limitações conhecidas:**
- Juntar dois modelos parecidos (ex.: "BF-200" e "BF 200") ainda não existe; dá para renomear, mas não unir. Fica para quando você conferir a lista.
- Editar a BOM é linha a linha (incluir, alterar, retirar), gravando na hora; não há edição em grade de várias linhas de uma vez.
- O roteiro da Sprint 4 continua falhando às vezes quando roda de novo no mesmo banco (a ficha do equipamento não fecha com Esc depois de gravar, quando o foco está no botão); é a tarefa à parte registrada na Sprint 9.

## Retrospectiva

- Funcionou: começar pelo arquivo real do PO. Os números da BOM (R$ 28.477,40 + R$ 40.921,11) viraram os testes do servidor e do roteiro, e a dúvida dos R$ 3.000,00 foi resolvida antes de virar código.
- Funcionou: o cálculo de custo é uma função única (`BomCost`) usada pela revisão, pela BOM do equipamento e pelo custo do projeto, então as três telas sempre batem.
- Melhorar: o roteiro de ponta a ponta achou dois problemas que os testes de componente não pegaram — a lista com o botão Novo recriado a cada render (laço de renderização) e as janelas das submontagens desatualizadas depois da aprovação. Telas que abrem outras janelas do mesmo registro precisam de um teste com duas janelas.
- Ação: na próxima sprint, rodar o roteiro de ponta a ponta assim que a primeira tela existir, não só no fim.
