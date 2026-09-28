# Sprint 6 — Documentos e faturamento vinculados às parcelas

Situação: **Entregue para Review** (28/09/2026). Planning aprovado pelo PO em 28/09/2026 ("aprovado, implemente a sprint 6"), com as decisões propostas abaixo; as regras de negócio pendentes seguem as premissas do B01, para aceite ou ajuste na Review.

## Objetivo

Registrar o faturamento sem duplicar cobrança: lançar a nota fiscal de venda emitida fora do Renda+ e **vinculá-la às parcelas que já existem**, inteira ou em partes, de forma que o pedido mostre sempre quanto já foi faturado e quanto falta faturar — com o valor vinculado nunca passando do total da nota nem do valor da parcela, mesmo com lançamentos simultâneos. Faturamento e recebimento continuam independentes: a nota não cria título, não muda saldo a receber nem caixa. Primeira fatia do módulo `documentos` (B06).

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

1. Confirmar um pedido com duas parcelas (R$ 55.500,00 e R$ 100.000,00) e receber R$ 20.000,00 da primeira, como na Sprint 5.
2. *Faturamento → Documentos e faturamento → Novo*: saída, cliente do pedido, série 1, número 1234, emissão hoje (competência sugerida no mês), linha de produto R$ 92.500,00. **Adicionar**.
3. **Vincular parcelas**: R$ 55.500,00 na parcela 1 (já parcialmente recebida) e R$ 37.000,00 na parcela 2 → a nota fica totalmente vinculada.
4. Abrir o pedido: faturado R$ 92.500,00, a faturar R$ 63.000,00; o saldo a receber **não mudou** (R$ 135.500,00).
5. Nova nota 1235 de R$ 70.000,00 vinculando R$ 63.000,01 na parcela 2 → recusado no campo com "A faturar da parcela: R$ 63.000,00."; vincular R$ 63.000,00 → aceito; a nota fica com R$ 7.000,00 sem vínculo.
6. Repetir a nota 1234 da mesma série para o mesmo cliente → recusado apontando a nota existente.
7. **Cancelar pedido** → recusado enquanto houver nota vinculada.
8. **Cancelar** a nota 1235 com motivo → a faturar do pedido volta a R$ 63.000,00; o *Histórico* mostra registro, vínculos e cancelamento.
9. Lista com a competência do mês: total faturado R$ 92.500,00 (a nota cancelada fica fora).
10. Entrar como Consulta: vê notas e vínculos; não registra, não vincula, não cancela.

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

| Item | Resultado | Evidência |
|---|---|---|
| S6-01 Registrar | Pronto | `DocumentosApiTest.notaVinculadaAsParcelasMostraFaturadoSemMudarOSaldo`: nota `DF` idempotente (mesma chave → o mesmo documento; outro corpo → `IDEMPOTENCY_KEY_REUSED`); número repetido — inclusive com zeros à esquerda — → `DOCUMENT_DUPLICATE` apontando o código; evento `DocumentRegistered` com o payload do catálogo. `registroConfereCamposClienteDaParcelaEClassificacao`: série, número, emissão futura, competência inválida, linha sem descrição/tipo/valor e sem linhas, todos apontados no campo; duas linhas (Produto e Serviço) somam o total |
| S6-02 Vincular (PD-023) | Pronto | Mesmo teste: a nota de R$ 92.500,00 fatura a parcela 1 inteira (já parcialmente recebida) e R$ 37.000,00 da parcela 2; o saldo a receber e a versão dos títulos não mudam; R$ 63.000,01 → `LINK_EXCEEDS_TITLE` "A faturar da parcela: R$ 63.000,00."; acima do total da nota → `LINK_EXCEEDS_DOCUMENT`; versão velha → 412; parcela de outro cliente recusada; mesma parcela duas vezes na nota recusada |
| S6-03 Vínculos simultâneos | Pronto | `vinculosSimultaneosNaMesmaParcelaNaoPassamDoValor`: duas notas vinculando R$ 70,00 ao mesmo tempo numa parcela de R$ 100,00 → uma 200 e uma 422 com "A faturar da parcela: R$ 30,00."; um vínculo só. Barreiras no banco: `invoiced_cents <= limit_cents` por parcela e `linked_cents <= total_cents` por nota |
| S6-04 Cancelar e desfazer | Pronto | Motivo obrigatório; cancelar libera os vínculos (preservados como desfeitos, com motivo) e repetir devolve o mesmo; nota cancelada → 409 ao vincular; o número fica livre; desfazer um vínculo devolve o a faturar da parcela; trilha na nota e na parcela; eventos `DocumentCancelled` e `DocumentLinkRemoved` |
| S6-05 Pedido faturado | Pronto | `pedidoFaturadoSoCancelaDepoisDeCancelarANota`: cancelar pedido com nota vinculada → `CANCELLATION_BLOCKED_BY_EFFECTS` "vinculada à nota nº 900", nenhum título cancelado; depois de cancelar a nota, o pedido cancela; parcela cancelada não recebe vínculo. Com recebimento **e** nota, a recusa lista os dois efeitos. O financeiro recusa pela porta `TitleCancellationGuard`, implementada por documentos (sem dependência nova do financeiro) |
| S6-06 Classificar | Pronto | Natureza obrigatória; projeto só o de uma parcela vinculada; reclassificar gera a revisão 2; evento `DocumentClassified` com a revisão |
| S6-07 Telas | Pronto | `Sprint6Windows.test.tsx` (8 testes): registro com a competência da emissão e **a mesma chave reenviada depois de queda de rede**; Vincular parcelas com a sugestão por vencimento, a parcela cancelada fora e a recusa apontada na parcela; desfazer e cancelar com motivo e a versão lida; classificação; Consulta sem botões; Título a receber com Faturado, A faturar e a aba Faturamento com a seta para a nota. Pedido e Detalhe do projeto ganharam as colunas Faturado e A faturar |
| S6-08 Contratos | Pronto | Migração V10; `docs/backend/api/openapi.yaml` (+8 rotas; `OpenApiContractTest` passa); permissões `document.*` nos perfis; erros `DOCUMENT_INVALID`, `DOCUMENT_DUPLICATE`, `LINK_EXCEEDS_DOCUMENT`, `LINK_EXCEEDS_TITLE` no catálogo; comandos `RemoveDocumentLink` e `CancelDocument` e seus eventos no B01; `menu.json` com Documentos e faturamento implementado; `ArchitectureTest` passa (documentos → financeiro só pelas APIs públicas); verificador B01 OK |
| S6-09 Roteiro com conferência pela API | Pronto | `apps/desktop/e2e/sprint-06.e2e.ts` executado aqui no Chromium contra o servidor real (banco vazio), junto com os das Sprints 4 e 5: 3 roteiros passando. Cada nota criada pela tela é conferida pela API (documento, vínculos, faturado das parcelas e saldo) |
| S6-10 Dívidas da Sprint 5 | Pronto | (a) `/api/v1/status` devolve `businessDate` (fuso de São Paulo) e o app usa esse dia nos campos de data enquanto o computador estiver no mesmo dia; (b) conferência recebido do título = Σ alocações de recebimentos não estornados, e movimentos de caixa por recebimento, nos testes do financeiro; conferência equivalente para o faturado das parcelas e o vinculado das notas |

Testes executados: servidor **86** (PostgreSQL 16 real; eram 81), app **72** (eram 64), typecheck e build do app e do Electron, verificador B01 + 15 testes, roteiros Playwright das Sprints 4, 5 e 6.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela).

**Limitações conhecidas:**
- O faturado de cada parcela é mantido numa tabela própria (sob bloqueio) além dos vínculos; as duas fontes são gravadas na mesma transação e conferidas nos testes, mas ainda não há rotina de conferência em produção.
- A tela Vincular parcelas mostra as parcelas do cliente, de todos os pedidos; não filtra por pedido.
- A lista de documentos soma o faturado da lista visível (até 500 notas); o painel de faturamento por competência (IND-005) entra com os indicadores.

## Retrospectiva

- Funcionou: a porta `TitleCancellationGuard` resolveu o bloqueio do cancelamento do pedido sem o financeiro depender de documentos, e o teste concorrente escrito antes da tela garantiu o bloqueio por parcela desde o primeiro commit.
- Melhorar: o roteiro Playwright achou uma recusa que listava só o primeiro efeito (recebimento) e escondia a nota vinculada; a recusa agora lista todos. Vale conferir as mensagens de recusa com mais de uma causa já nos testes do servidor.
- Ação: na Sprint 7 (fiscal gerencial), a competência das notas desta sprint alimenta a receita por competência; conferir no roteiro que o total por competência bate com a lista de documentos.
