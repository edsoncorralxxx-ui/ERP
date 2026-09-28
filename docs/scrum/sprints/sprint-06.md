# Sprint 6 — Documentos e faturamento vinculados às parcelas

Situação: **Planejamento — aguardando aprovação do PO** (28/09/2026). Proposta montada a partir do roteiro de sprints (`../product-backlog.md`), do contrato do formulário `documentos` do B01 e da retrospectiva da Sprint 5. As regras de negócio pendentes seguem as premissas do B01, listadas abaixo para aceite ou ajuste antes de começar.

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

## Perguntas para o PO antes de começar

1. Aceita a premissa do PD-023 (limite pelo valor da parcela, independente do recebimento)?
2. Cancelar nota e desfazer vínculo entram nesta sprint?
3. Registrar e vincular notas fica só com o Administrador, ou já criamos o perfil Financeiro?
4. A empresa emite notas com mais de um CNPJ ou série?
