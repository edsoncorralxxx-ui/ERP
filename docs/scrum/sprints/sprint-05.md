# Sprint 5 — Contas a receber: recebimento parcial e estorno

Situação: **Entregue para Review** (28/09/2026). Objetivo do roteiro aprovado pelo PO ("implemente a próxima sprint", 28/09/2026). As regras de negócio pendentes seguem as premissas do B01 e estão listadas abaixo para aceite ou ajuste na Review.

## Objetivo

Registrar o dinheiro que entra: baixar total ou parcialmente os títulos a receber gerados pelo pedido confirmado (Sprint 4), numa conta (caixa ou banco), e estornar um recebimento lançado errado, sem nunca deixar saldo negativo nem apagar o que foi registrado. Segunda fatia do épico B05 e primeira do B06. Também a ação da retrospectiva da Sprint 4: o roteiro Playwright passa a rodar no CI.

## Decisões do planning

| Pendência | Decisão desta sprint | Quem decidiu |
|---|---|---|
| PD-004 — pagamento acima do saldo | Premissa B01: **recusado** (422 `INSUFFICIENT_TITLE_BALANCE` com o saldo atual); crédito/adiantamento do cliente fica para o financeiro ampliado | Premissa B01 — **a confirmar com o financeiro** |
| PD-005 — estorno parcial | Premissa B01: **estorno total por recebimento**; para corrigir parte, estorna-se e lança-se de novo | Premissa B01 — **a confirmar com o financeiro** |
| PD-006 — estorno de recebimento conciliado | Ainda não há conciliação; quando houver, a premissa B01 (exigir desconciliar antes) entra junto | Premissa B01 |
| PD-003 — cancelamento de pedido confirmado | Agora com efeito real: pedido com título que tem recebimento **não cancela** (`CANCELLATION_BLOCKED_BY_EFFECTS`); estornado o recebimento, cancela | Premissa B01 (Sprint 4) |
| Contas | Cadastro mínimo de contas financeiras (nome, banco, saldo de abertura); a migração cria o **Caixa** (`CT001`). Sem tela própria nesta sprint: contas novas pela API (`bank_account.manage`, Administrador); a tela entra com "Contas e conciliação" | Time — **a confirmar pelo PO** |
| Um recebimento, um cliente | Um recebimento pode quitar vários títulos, mas todos do mesmo cliente | Time |
| Data do recebimento | Não pode ser futura (é a data em que o valor entrou na conta). O estorno lança o movimento inverso **na mesma data** do original, para o saldo histórico da conta ficar correto | Time — **a confirmar com o financeiro** |
| Juros, multa e desconto | Fora desta sprint (ajustes do título, B06) | Time |

Numeração: recebimento `RC00001`, conta `CT001`.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S5-01 | Registrar recebimento (baixa parcial) | `POST /settlements` com Idempotency-Key: títulos bloqueados em ordem de id (INV-ST-3); Σ alocações = valor (INV-ST-1); cada título uma vez, a receber, do mesmo cliente (INV-ST-2); acima do saldo recusa tudo com o saldo atual (INV-FT-1); versão do título conferida quando informada (412); título cancelado não recebe (409); movimento de entrada na conta; auditoria da liquidação e de cada título; evento `SettlementPosted` |
| S5-02 | Concorrência | Título de R$ 100,00 e recebimentos simultâneos de R$ 70,00: um é aceito, os outros recebem 422 com saldo R$ 30,00; saldo final R$ 30,00 |
| S5-03 | Estornar recebimento | Motivo obrigatório; estorno total (PD-005); saldos voltam pelas mesmas alocações; movimento de caixa inverso vinculado ao original; recebimento continua consultável como estornado; estornar de novo devolve o estorno existente (INV-ST-6); evento `SettlementReversed` |
| S5-04 | Cancelamento com efeitos (PD-003) | Pedido com recebimento não cancela; depois do estorno, cancela |
| S5-05 | Contas financeiras | Lista com saldo (abertura + movimentos); cadastro pelo Administrador, nome único; Caixa criado pela migração |
| S5-06 | Telas | *Contas a receber* (lista com vencidos, saldo a receber no rodapé, filtros) e *Título a receber* (valores, recebimentos, histórico; Registrar recebimento; Estornar recebimento); setas para o título no pedido e no projeto |
| S5-07 | Contratos | OpenAPI dos endpoints novos; permissões `financial_title.settle`, `settlement.reverse`, `bank_account.manage`; `menu.json` marca Contas a receber como implementado |
| S5-08 | Roteiro no CI | Job `e2e` no GitHub Actions: PostgreSQL, servidor empacotado com o primeiro administrador, Vite e Chromium; roteiros das Sprints 4 e 5; evidências e log do servidor guardados como artefato |

## Fora do escopo

Crédito/adiantamento do cliente (PD-004), estorno parcial (PD-005), juros/multa/desconto, renegociação, contas a pagar, conciliação e extrato, tela de contas financeiras, fluxo de caixa, documentos fiscais (Sprint 6).

## Como verificar (ao final)

1. Confirmar um pedido de R$ 100.000,00 em duas parcelas (R$ 55.500,00 e R$ 44.500,00).
2. *Financeiro → Contas a receber*: os dois títulos em aberto, "Saldo a receber: R$ 100.000,00".
3. Abrir o título de R$ 55.500,00 → **Registrar recebimento**: conta Caixa, R$ 20.000,00. Saldo R$ 35.500,00, situação Parcial.
4. Tentar R$ 40.000,00: recusado com "Saldo atual R$ 35.500,00".
5. Registrar R$ 35.500,00: saldo zero, Liquidado.
6. Selecionar o primeiro recebimento → **Estornar recebimento** com motivo: saldo volta a R$ 20.000,00; o recebimento aparece como Estornado, com o motivo; a aba Histórico mostra os dois recebimentos e o estorno.
7. Tentar cancelar o pedido: recusado enquanto houver recebimento.
8. Entrar como Consulta: vê títulos e recebimentos, sem registrar nem estornar.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README) — e no CI, job "Roteiro de ponta a ponta".

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S5-01 a S5-05 | Pronto | `FinanceiroApiTest` (5 testes contra PostgreSQL real): baixa parcial, mesma chave, acima do saldo, versão velha, soma diferente, data futura, quitação, estorno com e sem motivo, estorno repetido, caixa voltando ao saldo anterior, histórico e eventos; concorrência de 4 recebimentos de R$ 70,00; recebimento de vários títulos; título de outro cliente; cancelamento bloqueado e liberado; contas e perfil Consulta |
| S5-06 | Pronto | `Sprint5Windows.test.tsx` (5 testes): baixa parcial na conta escolhida com a mesma chave depois de queda de rede, saldo atual no diálogo, estorno com motivo, Consulta sem ações, lista com vencidos e saldo a receber |
| S5-07 | Pronto | `openapi.yaml` (+8 rotas), `Permissions`/`Profile`, `menu.json`, `SideNav.test.ts` |
| S5-08 | Pronto (local); CI no próximo push | `.github/workflows/ci.yml` (job `e2e`), `apps/desktop/e2e/sprint-05.e2e.ts` — os dois roteiros passaram localmente com os mesmos passos do job |

Testes executados: servidor **81** (PostgreSQL 16 real; eram 76), app **63** (eram 58), typecheck e build do app e do Electron, verificador B01, roteiros Playwright das Sprints 4 e 5 no Chromium contra o servidor empacotado com banco vazio (2/2).

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); o job `e2e` do GitHub Actions roda no próximo push.

## Retrospectiva

- Funcionou: o saldo derivado das alocações (nada gravado no título) fez o estorno e o bloqueio do cancelamento saírem de graça; a regra PD-003 da Sprint 4 passou a valer sem mudar o comercial.
- Melhorar: a leitura do título bloqueado precisa ser um comando separado do bloqueio (senão, em READ COMMITTED, o recebido lido pode ser anterior ao do concorrente); ficou documentado no repositório.
- Ação: na Sprint 6, a tela de contas financeiras junto com o faturamento, se o PO confirmar a premissa das contas.
