# Sprint 5 — Contas a receber: recebimento parcial, estorno e contas financeiras

Situação: **Entregue para Review** (28/09/2026). Objetivo do roteiro aprovado pelo PO ("implemente a próxima sprint", 28/09/2026); as regras de negócio pendentes seguem as premissas do B01, listadas abaixo para aceite ou ajuste na Review.

## Objetivo

Receber o que foi vendido: registrar o recebimento de uma parcela, inteiro ou em partes, na conta onde o dinheiro entrou, e estorná-lo quando preciso — com o saldo do título e da conta sempre exatos, nunca negativos, mesmo com baixas simultâneas. Primeira fatia do épico B06 (financeiro) sobre os títulos gerados na Sprint 4. Também a ação da retrospectiva da Sprint 4: o roteiro Playwright passa a rodar no CI.

## Decisões do planning

| Pendência | Decisão desta sprint | Quem decidiu |
|---|---|---|
| PD-004 — pagamento acima do saldo | Premissa B01: **recusar** (`INSUFFICIENT_TITLE_BALANCE`, com o saldo atual). Crédito ou adiantamento do cliente fica para depois; a API recusa `creditCents` diferente de zero | Premissa B01 — **a confirmar com o financeiro** |
| PD-005 — estorno parcial | Premissa B01: **estorno total por recebimento**; para corrigir parte, estorna-se e lança-se de novo | Premissa B01 — **a confirmar com o financeiro** |
| PD-006 — estorno de recebimento conciliado | Premissa B01 (desconciliar antes). A conciliação ainda não existe, então todo recebimento é estornável; a regra entra com a conciliação | Premissa B01 |
| PD-009 — quem baixa e estorna | Permissões novas `financial_title.settle` (receber), `settlement.reverse` (estornar) e `bank_account.admin` (contas) só no perfil **Administrador**; Consulta vê tudo. Perfil "Financeiro" entra quando o PO definir a separação de funções | Premissa desta sprint — **a confirmar pelo PO** |
| Contas financeiras | O recebimento exige a conta onde o dinheiro entrou (B01: `accountId`). Cadastro mínimo de **contas financeiras** (caixa e bancos, com saldo inicial) e o **extrato** de movimentos; o sistema já vem com a conta **Caixa** (`CT001`). Extrato bancário importado e conciliação ficam na sprint de conciliação | Time (contrato PostSettlement do B01) |
| Data do recebimento | Informada pelo usuário (hoje por padrão), **não pode ser futura**; a data do estorno é o dia em que ele é feito, e o movimento inverso sai nessa data | Time |
| Um recebimento, vários títulos | A API aceita alocar um recebimento em várias parcelas **do mesmo cliente** (INV-ST-1/2); a tela desta sprint recebe um título por vez | Time |
| Juros, multa e desconto | Fora desta sprint (ajustes do título, `AdjustTitle`); o valor recebido fecha exatamente com as parcelas | Time |

Numeração gerada pelo sistema: conta financeira `CT001`, recebimento `RC00001`.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S5-01 | Receber (baixa parcial e total) | Idempotente pela chave; Σ alocações = total (INV-ST-1, `SETTLEMENT_UNBALANCED` com a diferença); título uma vez, mesma direção (INV-ST-2); títulos bloqueados em ordem de id (INV-ST-3); valor acima do saldo recusado com o saldo atual (INV-FT-1); versão do título conferida quando informada (412); conta ativa; data não futura; entrada na conta; auditoria no recebimento e em cada título; evento `SettlementPosted` |
| S5-02 | Baixas concorrentes | Título de R$ 100,00 com duas baixas simultâneas de R$ 70,00 (chaves diferentes): uma registrada, a outra 422 com saldo R$ 30,00; saldo final R$ 30,00, um movimento só |
| S5-03 | Estornar | Motivo obrigatório; estorno total (PD-005): o valor volta ao saldo dos mesmos títulos, saída inversa na conta vinculada à entrada, recebimento preservado como estornado com data, ator e motivo; estornar de novo devolve o estorno existente (INV-ST-6); evento `SettlementReversed` |
| S5-04 | Pedido com recebimento | Cancelar pedido confirmado com parcela recebida é recusado (`CANCELLATION_BLOCKED_BY_EFFECTS`, PD-003); depois do estorno, cancela; título cancelado não recebe baixa (409) |
| S5-05 | Contas financeiras | Caixa semeado; Administrador cadastra e altera com versão; nome único; banco obrigatório no tipo Banco; saldo = inicial + movimentos; saldo inicial e data fixos depois do primeiro movimento; conta inativa não recebe (`ACCOUNT_INACTIVE`); extrato com saldo acumulado; histórico |
| S5-06 | Telas | Contas a receber (lista com situação: em aberto, vencidos, liquidados, cancelados), Título a receber (Geral, Recebimentos com Estornar, Histórico; **Receber** com conta, data e valor), Contas financeiras (Contas e Extrato); seta para o título nas parcelas do pedido e do projeto; design system |
| S5-07 | Contratos | OpenAPI dos endpoints novos; permissões nos perfis; `menu.json` marca Contas a receber e Contas financeiras; catálogo de erros; fronteiras do B01 (teste de arquitetura) |
| S5-08 | Roteiro de ponta a ponta no CI | Ação da retrospectiva da Sprint 4: job `e2e` no GitHub Actions sobe PostgreSQL e o servidor (banco vazio) e roda os roteiros das Sprints 4 e 5 no Chromium, guardando as capturas e o log do servidor |

Ordem de execução: S5-05 → S5-01 → S5-02 → S5-03 → S5-04 (servidor) → S5-07 → S5-06 → S5-08.

## Fora do escopo

Crédito/adiantamento do cliente (PD-004); estorno parcial (PD-005); juros, multa, desconto e abatimento (`AdjustTitle`); renegociação; contas a pagar; transferência entre contas; importação de extrato e conciliação (PD-006); fluxo de caixa; recebimento de vários títulos numa só baixa pela tela (a API já aceita); pedido passando a "Concluído" (depende também dos estágios do projeto, B07); documentos fiscais (Sprint 6).

## Como verificar (ao final)

1. Confirmar um pedido com duas parcelas (R$ 55.500,00 e R$ 100.000,00), como na Sprint 4.
2. *Financeiro → Contas financeiras → Novo*: "Banco do Brasil", tipo Conta bancária, banco "Banco do Brasil", saldo inicial R$ 1.000,00. **Adicionar**.
3. *Financeiro → Contas a receber*: as duas parcelas em aberto; abrir a de R$ 55.500,00 pela seta.
4. **Receber**: conta Banco do Brasil, valor R$ 20.000,00 → saldo R$ 35.500,00, situação Parcial.
5. **Receber** R$ 35.500,01 → recusado no campo com "Saldo atual: R$ 35.500,00."; **Receber** R$ 35.500,00 → Liquidado, o botão Receber some.
6. Aba *Recebimentos* → **Estornar** cada recebimento com motivo → o título volta a R$ 55.500,00 em aberto; o *Histórico* mostra baixas e estornos.
7. *Contas financeiras → Extrato* do Banco do Brasil: duas entradas, duas saídas, saldo final R$ 1.000,00.
8. Receber de novo uma parte e tentar **Cancelar pedido**: recusado enquanto houver recebimento.
9. Entrar como Consulta: vê títulos, recebimentos e contas; não recebe, não estorna, não altera contas.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README) — e o job `e2e` do CI.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S5-01 Receber | Pronto | `FinanceiroApiTest.recebimentoParcialTotalEEstornoDevolvemSaldoETrilha`: parcial de R$ 20.000,00 com a versão lida (título vai a PARTIAL, versão 2); mesma chave → o mesmo `RC`; mesma chave com outro corpo → `IDEMPOTENCY_KEY_REUSED`; versão velha → 412; um recebimento para as duas parcelas (resto da 1 + parte da 2); recusas sem efeito: acima do saldo (`Saldo atual: R$ 90.000,00`), soma diferente (`diferença de R$ 0,01`), data futura, título repetido, crédito (PD-004) |
| S5-02 Baixas concorrentes | Pronto | `baixasConcorrentesNuncaDeixamSaldoNegativo`: duas baixas de R$ 70,00 simultâneas num título de R$ 100,00 → uma 201 e uma 422 com "Saldo atual: R$ 30,00"; recebido R$ 70,00; um recebimento e um movimento no banco. Última barreira no banco: `check (received_cents between 0 and original_cents)` |
| S5-03 Estornar | Pronto | Mesmo teste do S5-01: motivo obrigatório; estornos devolvem os títulos a OPEN com R$ 55.500,00 e R$ 100.000,00; estornar de novo devolve o existente (2 estornos no banco); extrato com as saídas e saldo final R$ 1.000,00; recebimento consultável como REVERSED com ator; trilhas do recebimento e do título; eventos `SettlementPosted` ×2 (payload com as alocações) e `SettlementReversed` ×2 |
| S5-04 Pedido com recebimento | Pronto | `pedidoComRecebimentoSoCancelaDepoisDoEstorno`: cancelamento recusado com "estorne o recebimento", nenhum título cancelado; depois do estorno cancela; baixa em título cancelado → 409 |
| S5-05 Contas financeiras | Pronto | `contasFinanceirasTemNomeUnicoSaldoInicialFixoEInativaNaoRecebe`: Caixa `CT001` semeado; banco sem nome do banco → 422; nome repetido (sem diferenciar maiúsculas) → `ACCOUNT_DUPLICATE`; saldo inicial alterado depois de movimento → 422; inativar com versão; 412 com versão velha; conta inativa → `ACCOUNT_INACTIVE`; histórico |
| S5-06 Telas | Pronto | `Sprint5Windows.test.tsx` (6 testes): Receber com o saldo já no valor, conta escolhida na Seleção, corpo no formato da API com a versão do título e **a mesma chave reenviada depois de queda de rede**; recusa acima do saldo apontada no campo Valor; Estornar com motivo obrigatório; Consulta sem Receber/Estornar; conta com saldo inicial negativo em centavos (`-1.234,5` → `-123450`); extrato com entrada, saída e saldo |
| S5-07 Contratos | Pronto | `docs/backend/api/openapi.yaml` (+13 rotas; `OpenApiContractTest` passa); permissões `financial_title.settle`, `settlement.reverse`, `bank_account.admin` no Administrador; `menu.json` com Contas a receber e Contas financeiras implementados; erros `SETTLEMENT_INVALID`, `ACCOUNT_INVALID`, `ACCOUNT_DUPLICATE` no catálogo; eventos `SettlementPosted`/`SettlementReversed` com o payload do catálogo; `ArchitectureTest` passa (tudo dentro do módulo `financeiro`); verificador B01 OK |
| S5-08 Roteiro no CI | Pronto (a confirmar no primeiro push) | Job `e2e` em `.github/workflows/ci.yml`; `apps/desktop/e2e/sprint-05.e2e.ts` executado aqui no Chromium contra o servidor real (banco vazio), junto com o da Sprint 4: 2 roteiros passando |

Testes executados: servidor **81** (PostgreSQL 16 real; eram 76), app **64** (eram 58), typecheck do app e do Electron, verificador B01 + 15 testes, roteiros Playwright das Sprints 4 e 5.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); o job `e2e` do CI roda pela primeira vez no push desta sprint.

**Limitações conhecidas:**
- A data de negócio (recebimento não futuro, data do estorno) usa o fuso de São Paulo no servidor; o campo Data do app sugere o dia do computador. Com o computador em outro fuso perto da meia-noite, a sugestão pode ser recusada como futura.
- O recebido do título é mantido numa coluna (sob bloqueio) além das alocações; as duas fontes são gravadas na mesma transação, mas não há ainda uma rotina de conferência entre elas.

## Retrospectiva

- Funcionou: escrever o cenário concorrente do B01 (R$ 70 + R$ 70 em R$ 100) como teste antes da tela garantiu o bloqueio em ordem de id desde o primeiro commit; o roteiro Playwright da Sprint 4 rodou junto e confirmou que nada do pedido quebrou.
- Melhorar: a tela recebe um título por vez, embora a API aceite vários; o financeiro deve dizer na Review se precisa receber várias parcelas numa baixa só (ex.: um depósito que paga duas parcelas).
- Ação: na Sprint 6, cada documento fiscal criado no roteiro Playwright deve ser conferido também pela API no mesmo roteiro (hoje o roteiro só confere a tela).
