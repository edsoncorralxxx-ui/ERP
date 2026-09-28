# Sprint 6 — Documentos e faturamento vinculados às parcelas

Situação: **Entregue para Review, com o ajuste pedido pelo PO na Review** (28/09/2026). Planning aprovado pelo PO em 28/09/2026 ("aprovado, implemente a sprint 6"); na Review o PO mudou a regra do faturamento para o **regime de caixa** (ver "Ajuste da Review" abaixo), e a sprint foi refeita nesse ponto.

## Objetivo

Registrar o faturamento sem duplicar cobrança: lançar a nota fiscal de venda emitida fora do Renda+ e **vinculá-la às parcelas que já existem**, inteira ou em partes, de forma que o pedido mostre sempre quanto já foi faturado e quanto falta faturar — com o valor vinculado nunca passando do total da nota nem do valor da parcela, mesmo com lançamentos simultâneos. Faturamento e recebimento continuam independentes: a nota não cria título, não muda saldo a receber nem caixa. Primeira fatia do módulo `documentos` (B06).

## Ajuste da Review — regime de caixa (decisão do PO, 28/09/2026)

Na primeira entrega a nota era digitada linha a linha e vinculada a qualquer parcela até o valor dela. O PO decidiu:

| Tema | Decisão |
|---|---|
| PD-023 — o que a nota fatura | **Só o recebido que ainda não tem nota** (a emitir = recebido − faturado, por parcela e por pedido). Nota antes do recebimento é recusada (`DOCUMENT_EXCEEDS_RECEIVED`) |
| Como a nota nasce | A partir do **pedido**: o usuário escolhe o pedido, o sistema mostra o a emitir e monta a nota; o usuário emite no portal da SEFAZ ou da prefeitura e registra aqui número, série e emissão. O valor pode ser menor que o a emitir (nota parcial) |
| Linhas | Montadas pelo sistema, **proporcionais às linhas do pedido** (equipamento e material = Produto, serviço = Serviço), com os centavos que sobram na primeira linha |
| Vínculos | Montados pelo sistema, **pela ordem de vencimento** das parcelas, até o a emitir de cada uma |
| Notas a emitir | Nova lista *Faturamento → Notas a emitir* com cada pedido, o recebido, o faturado, o a emitir e quanto é produto e serviço; a seta abre a nota já com o pedido. No pedido, o valor "A emitir" e o botão **Registrar nota** |
| O Renda+ emite a nota? | Não: registra a nota emitida fora. Emissão pela SEFAZ/prefeitura (certificado digital, XML, autorização) pode virar uma sprint própria |
| Estorno de recebimento já faturado | Permitido (o dinheiro voltou); o pedido mostra "Faturado além do recebido" |
| Desfazer vínculo | Continua na API; a tela não oferece mais (para corrigir, cancela-se a nota e registra-se de novo) |

## Pendências da Review da Sprint 5 (antes do planning)

A Sprint 5 está entregue para Review com premissas que ainda esperam resposta. Esta sprint **não depende** delas, mas elas precisam de decisão:

| Pendência | Premissa em uso | Precisa de |
|---|---|---|
| PD-004 — pagamento acima do saldo | Recusar | Financeiro |
| PD-005 — estorno parcial | Só estorno total | Financeiro |
| PD-009 — quem recebe e estorna | Só Administrador | PO |
| Várias parcelas numa baixa pela tela | A tela recebe uma por vez (a API já aceita várias) | Financeiro |

## Decisões propostas para o planning

| Pendência | Proposta desta sprint | Quem decide |
|---|---|---|
| PD-023 — faturamento parcial | Premissa B01: vínculo **documento → parcelas com valor por vínculo**. Σ vínculos do documento ≤ total do documento; Σ vínculos de uma parcela (de todos os documentos ativos) ≤ **valor original** da parcela. O limite é o "a faturar" da parcela, não o saldo a receber: uma parcela já recebida pode (e deve) ser faturada, como no exemplo do doc 14 (NF de R$ 92.500,00 = parcela 1 inteira + R$ 37.000,00 da parcela 2) | Premissa B01 — **a confirmar com o financeiro** |
| Emissão da nota | O Renda+ **não emite** NF-e/NFS-e: registra a nota emitida no sistema da prefeitura/SEFAZ (conceito FATURAMENTO do B01: "documento emitido externamente e registrado") | Contrato B01 |
| Direção | Só **Saída** (nota de venda, contraparte = cliente). Entrada entra com Contas a pagar | Time |
| Número da nota | Informado pelo usuário, com **série**; único por direção + contraparte + série + número (`DOCUMENT_DUPLICATE`). O sistema dá também um código interno `DF00001` | Time |
| Competência | Obrigatória, **mês da emissão por padrão**, editável (IND-005 usa a competência) | Premissa B01 (PD-024) — **a confirmar com o contador** |
| Linhas | Descrição, tipo **Produto/Serviço** e valor; total = Σ linhas, exato em centavos | Contrato B01 |
| Parcelas vinculáveis | Só parcelas a receber **do mesmo cliente**, não canceladas. Vínculos podem ser feitos no registro ou depois, em partes, até o total da nota | Time |
| Cancelar documento | Comando novo `CancelDocument` (o B01 não tem, mas o IND-005 conta só "não cancelados"): motivo obrigatório; libera os vínculos; o documento fica preservado como cancelado. Documento cancelado não recebe vínculo | Time — **a confirmar pelo PO** |
| Desfazer um vínculo | Remover um vínculo com motivo, sem cancelar a nota (para corrigir uma parcela errada) | Time — **a confirmar pelo PO** |
| PD-003 — cancelar pedido faturado | Já previsto no B01 (doc 13): pedido confirmado com **documento vinculado** não cancela (`CANCELLATION_BLOCKED_BY_EFFECTS`, "cancele ou desvincule a nota"); depois de cancelar a nota, cancela | Premissa B01 |
| Classificação (`ClassifyDocument`) | Natureza da operação (lista inicial: Venda de produção, Venda de mercadoria, Prestação de serviço, Remessa) e projeto, este sugerido pelos títulos vinculados. Nunca inferida só pela descrição | Premissa B01 — **a confirmar com o contador** |
| PD-009 — permissões | `document.read` para todos; `document.register`, `document.link`, `document.classify` e `document.cancel` só no **Administrador**, como na Sprint 5 | Premissa — **a confirmar pelo PO** |
| Anexos (PDF/XML da nota) | Fora: dependem do armazenamento privado de arquivos com hash (B04) | Time |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S6-01 | Registrar documento de saída | Idempotente pela chave (mesma chave com outro corpo → `IDEMPOTENCY_KEY_REUSED`); cliente ativo; emissão não futura; competência `AAAA-MM`; ao menos uma linha com valor > 0; total = Σ linhas; número único (`DOCUMENT_DUPLICATE` apontando o documento existente); código `DF`; auditoria; evento `DocumentRegistered` com o payload do catálogo |
| S6-02 | Vincular a parcelas (PD-023) | Numa transação, com as parcelas bloqueadas em ordem de id: parcela do mesmo cliente e não cancelada; Σ vínculos ≤ total da nota (`LINK_EXCEEDS_DOCUMENT`, com o que resta na nota); Σ vínculos da parcela ≤ valor original (`LINK_EXCEEDS_TITLE`, com o "a faturar" da parcela); versão do documento conferida (412); parcela recebida continua vinculável; evento `DocumentLinkedToTitles` |
| S6-03 | Vínculos concorrentes | Parcela de R$ 100,00 com duas notas vinculando R$ 70,00 ao mesmo tempo: uma aceita, a outra 422 com "A faturar da parcela: R$ 30,00"; a última barreira fica no banco |
| S6-04 | Cancelar documento e desfazer vínculo | Motivo obrigatório; cancelar libera todos os vínculos e repetir devolve o cancelamento existente; desvincular libera só aquele vínculo; documento cancelado → 409 ao vincular; trilha no documento e nas parcelas |
| S6-05 | Pedido faturado | Faturado e **a faturar** por parcela, por pedido (IND-003) e no título; cancelar pedido com nota vinculada → recusado; depois de cancelar a nota, cancela; recebimento e estorno não mudam faturado nem a faturar (e vice-versa) |
| S6-06 | Classificar | Natureza da operação e projeto; tipo Produto/Serviço por linha; reclassificar gera nova versão com histórico; evento `DocumentClassified` |
| S6-07 | Telas | **Documentos e faturamento** (lista com filtros por competência, cliente e situação e total faturado do filtro — IND-005); **Documento** (cabeçalho + Linhas, Vínculos com "Vincular parcelas" que sugere o a faturar, Classificação, Histórico; Cancelar); coluna Faturado/A faturar nas parcelas do pedido, do projeto e no Título a receber, com seta para a nota; Consulta só vê; design system (`rp-*`, Seleção, Campo de data) |
| S6-08 | Contratos | Módulo `documentos` no servidor dependendo só de `financeiro` pela `TitleQueryApi` (fronteira do B01, `ArchitectureTest`); migração V10 (`business_document`, `document_line`, `document_title_link`); OpenAPI; permissões nos perfis; erros no catálogo; `menu.json` marca Documentos e faturamento como implementado |
| S6-09 | Roteiro de ponta a ponta com conferência pela API | Ação da retrospectiva da Sprint 5: `apps/desktop/e2e/sprint-06.e2e.ts` cria a nota pela tela e **confere pela API** no mesmo roteiro (documento, vínculos, a faturar do pedido); roda no job `e2e` do CI junto com os das Sprints 4 e 5 |
| S6-10 | Dívidas da Sprint 5 | (a) O campo Data do app sugere o **dia de negócio do servidor** (fuso de São Paulo), não o do computador; (b) teste de conferência que compara o recebido gravado no título com Σ alocações ativas, rodado no CI |

Ordem de execução: S6-08 (migração e módulo) → S6-01 → S6-02 → S6-03 → S6-04 → S6-05 (servidor) → S6-06 → S6-07 → S6-09 → S6-10.

Se faltar tempo, sai primeiro S6-06 (classificação) e depois S6-10; S6-01 a S6-05, S6-07 e S6-09 formam o mínimo da sprint.

## Fora do escopo

Emissão de NF-e/NFS-e e comunicação com SEFAZ/prefeitura; importação de XML da nota (B04, worker Python); anexos de arquivo (B04); documentos de entrada e contas a pagar; impostos da nota e apuração (Sprint 7, fiscal gerencial, PD-013); devolução e nota de ajuste; carta de correção; nota sem pedido (serviço avulso); aditivo de pedido; painel financeiro.

## Como verificar (ao final)

1. Confirmar um pedido de R$ 155.500,00 com equipamento (R$ 100.000,00) e instalação (serviço, R$ 55.500,00), em duas parcelas (R$ 55.500,00 e R$ 100.000,00), e receber R$ 20.000,00 da primeira.
2. *Faturamento → Notas a emitir*: o pedido aparece com R$ 20.000,00 a emitir — produto R$ 12.861,74 e serviço R$ 7.138,26.
3. Pela seta, a nota abre com o pedido, as linhas e a parcela já montadas. Emitir a nota no portal; informar número 1234, série 1 e emissão; **Adicionar**. O pedido some da lista; o saldo a receber continua R$ 135.500,00.
4. Receber mais R$ 35.500,00 da parcela 1 e R$ 10.000,00 da parcela 2: o pedido volta com R$ 45.500,00 a emitir. Valor da nota R$ 45.500,01 → recusado com "A emitir do pedido: R$ 45.500,00."; R$ 30.000,00 → a aba Parcelas mostra tudo na parcela 1 (a mais antiga); número 1235, **Adicionar**.
5. Nova nota do mesmo pedido com o número 1234 → recusada com "Já registrada como DF…".
6. Abrir o pedido → *Projeto e títulos*: Faturado R$ 50.000,00, A emitir R$ 15.500,00 e o botão **Registrar nota**.
7. **Cancelar pedido** → recusado: há recebimento e nota vinculada (a mensagem lista os dois).
8. Na nota 1235, **Cancelar documento** com motivo → o pedido volta a ter R$ 45.500,00 a emitir.
9. *Documentos e faturamento*, buscando o cliente: só a nota 1234 ativa; "Faturado da lista: R$ 20.000,00".
10. Entrar como Consulta: vê notas e notas a emitir; não registra, não cancela, não classifica.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README) — e o job `e2e` do CI.

## Riscos

- **PD-023 pode mudar**: se o financeiro disser que a nota deve seguir o saldo a receber (e não o valor da parcela), muda só a política de limite (Policy substituível, ADR-010), não o modelo nem a API.
- **Número da nota**: se houver mais de um emissor (matriz/filial), a unicidade precisa incluir o CNPJ emitente — confirmar na abertura da sprint.
- Dados reais de notas antigas ficam para a migração (B12); nesta sprint só entram notas novas.

## Perguntas do planning

O PO aprovou o planning sem responder item a item; a sprint seguiu as propostas, que continuam abertas para a Review:

1. PD-023: limite pelo valor da parcela, independente do recebimento — **adotado**.
2. Cancelar nota e desfazer vínculo — **entraram**.
3. Registrar, vincular, classificar e cancelar notas — **só o Administrador**; Consulta vê.
4. Mais de um CNPJ emitente — **não tratado**: número único por cliente, série e número entre as notas ativas (a nota cancelada libera o número para o registro correto). Se houver filial emitente, a unicidade passa a incluir o CNPJ.

## Review — evidências

Depois do ajuste da Review (regime de caixa):

| Item | Resultado | Evidência |
|---|---|---|
| S6-01 Registrar pelo pedido | Pronto | `DocumentosApiTest.notaDoPedidoFaturaSoORecebidoComLinhasProporcionaisEVinculosPorVencimento`: sem recebimento → `DOCUMENT_EXCEEDS_RECEIVED`; com R$ 20.000,00 recebidos, a nota sai com as linhas R$ 12.861,74 (Produto) e R$ 7.138,26 (Serviço) e o vínculo na parcela 1; idempotente pela chave; número repetido (inclusive com zeros à esquerda) → `DOCUMENT_DUPLICATE`; evento `DocumentRegistered` com o pedido. `registroConfereCamposEClassificaComOProjetoDoPedido`: pedido, série, número, emissão futura, competência e valor zero apontados no campo |
| S6-02 Só o recebido (PD-023) | Pronto | Mesmo teste: R$ 20.000,01 → "A emitir do pedido: R$ 20.000,00."; nota parcial de R$ 30.000,00 vai à parcela mais antiga e a seguinte fecha R$ 15.500,00 entre as duas parcelas; vínculo manual acima do recebido sem nota → `LINK_EXCEEDS_TITLE` "A emitir da parcela: R$ 0,00."; o saldo a receber não muda; estorno de recebimento já faturado é aceito e o pedido mostra R$ 20.000,00 faturados além do recebido |
| S6-03 Notas simultâneas | Pronto | `notasSimultaneasDoMesmoPedidoNaoPassamDoRecebido`: duas notas de R$ 70,00 ao mesmo tempo num pedido com R$ 100,00 recebidos → uma 201 e uma 422 com "A emitir do pedido: R$ 30,00."; uma nota e um vínculo. Barreiras no banco: faturado ≤ valor da parcela e vinculado ≤ total da nota |
| S6-04 Cancelar | Pronto | Motivo obrigatório; cancelar desfaz os vínculos e o pedido volta à lista a emitir; repetir devolve o mesmo cancelamento; o número fica livre; desfazer vínculo pela API devolve o a emitir da parcela |
| S6-05 Pedido faturado | Pronto | `pedidoFaturadoSoCancelaDepoisDeCancelarANotaEEstornar`: a recusa lista o recebimento e a nota; depois de cancelar a nota e estornar, o pedido cancela; pedido cancelado não recebe nota |
| S6-06 Classificar | Pronto | Natureza obrigatória; projeto só o das parcelas vinculadas; reclassificar gera a revisão 2; evento `DocumentClassified` |
| S6-07 Telas | Pronto | `Sprint6Windows.test.tsx` (9 testes): nota aberta com o pedido, linhas e a emitir do servidor; nota parcial refeita pelo servidor; **a mesma chave reenviada depois de queda de rede**; valor acima do a emitir apontado no campo; pedido sem nada a emitir não deixa adicionar; cancelar com a versão lida; classificação; Consulta sem botões; lista Notas a emitir com a seta que abre a nota do pedido; Título a receber com Faturado, A emitir e as notas vinculadas. Pedido e Detalhe do projeto com as colunas Faturado e A emitir |
| S6-08 Contratos | Pronto | Migrações V10 e V11 (pedido na nota); `openapi.yaml` com `/invoicing/orders` e `/invoicing/orders/{orderId}` (`OpenApiContractTest` passa); comercial ganhou a porta pública `SalesOrderQueryApi`, e documentos passa a depender de comercial (`modulos.json`, `ArchitectureTest` passa); PD-023 respondida em `pendencias.json`; contrato do formulário com o pedido e linhas e vínculos derivados; `menu.json` com Notas a emitir; erro `DOCUMENT_EXCEEDS_RECEIVED` no catálogo; verificador B01 OK |
| S6-09 Roteiro com conferência pela API | Pronto | `apps/desktop/e2e/sprint-06.e2e.ts` refeito para o caixa (passos 2 a 9 acima), conferindo pela API cada nota criada pela tela; executado aqui no Chromium com os roteiros das Sprints 4 e 5: 3 passando |
| S6-10 Dívidas da Sprint 5 | Pronto | Dia de negócio do servidor nos campos de data; conferência recebido × alocações e faturado × vínculos nos testes |

Testes executados: servidor **86** (PostgreSQL 16 real), app **73**, typecheck do app e do Electron, verificador B01 + 15 testes, roteiros Playwright das Sprints 4, 5 e 6.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela).

**Limitações conhecidas:**
- Uma nota por vez reúne produto e serviço, nas proporções do pedido. No Brasil, produto (NF-e) e serviço (NFS-e) costumam sair em documentos separados: a tela mostra quanto é cada um, mas o registro de duas notas (uma só de produto, outra só de serviço) para o mesmo recebimento fica para o próximo refinamento.
- O faturado de cada parcela é mantido numa tabela própria (sob bloqueio) além dos vínculos; as duas fontes são conferidas nos testes, sem rotina de conferência em produção.
- A lista de notas a emitir considera até 500 pedidos confirmados.


## Retrospectiva

- Funcionou: a porta `TitleCancellationGuard` resolveu o bloqueio do cancelamento do pedido sem o financeiro depender de documentos, e o teste concorrente escrito antes da tela garantiu o bloqueio por parcela desde o primeiro commit.
- Melhorar: o roteiro Playwright achou uma recusa que listava só o primeiro efeito (recebimento) e escondia a nota vinculada; a recusa agora lista todos. Vale conferir as mensagens de recusa com mais de uma causa já nos testes do servidor.
- Melhorar: a regra do faturamento (PD-023) ficou como premissa até a Review e foi trocada lá, depois de a tela pronta. Pendência de negócio que muda a tela deve ser confirmada com o PO no planning, com um exemplo numérico, antes de implementar.
- Ação: na Sprint 7 (fiscal gerencial), a competência das notas desta sprint alimenta a receita por competência; conferir no roteiro que o total por competência bate com a lista de documentos. E perguntar no planning se produto e serviço saem em notas separadas.
