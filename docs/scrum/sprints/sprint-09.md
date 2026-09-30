# Sprint 9 — Fluxo de caixa e transferência entre contas

Situação: **Em execução**. Planning aprovado pelo PO em 30/09/2026 ("aprovado"), com as cinco respostas como propostas (tabela abaixo).

## Objetivo

Ver o caixa mês a mês: o **realizado** (o que entrou e saiu das contas) e o **previsto** (saldos dos títulos a receber e a pagar pelo vencimento), sempre separados, com cada valor abrindo a lista do que o compõe. Junto, a **transferência entre contas próprias**, que muda o saldo de cada conta mas não o total da empresa. Primeira fatia de caixa do módulo `financeiro` (B06, tela *Fluxo de caixa*; IND-009 e IND-010).

## Respostas do PO (30/09/2026)

| Pergunta | Resposta | Consequência nesta sprint |
|---|---|---|
| 1. Títulos vencidos e não pagos | Como proposto | Coluna **Em atraso** antes do mês corrente; o saldo líquido dela entra no saldo previsto a partir do mês corrente |
| 2. Horizonte e granularidade | Como proposto | Mensal; padrão de 3 meses antes a 6 meses depois do mês atual, alterável no filtro (até 24 meses) |
| 3. Mês corrente | Como proposto | Realizado até hoje e previsto até o fim do mês, em linhas separadas |
| 4. Transferência | Como proposto | Só entre contas próprias ativas, sem data futura; estorno desfaz a transferência inteira, com motivo |
| 5. Ordem das sprints | Como proposto | Sprint 10: conciliação bancária com importação de extrato OFX/CSV |

## Decisões do planning

| Tema | Decisão |
|---|---|
| Transferência | Código `TR00001`; uma **saída** na conta de origem e uma **entrada** na de destino, vinculadas à transferência, na mesma transação; `Idempotency-Key`; contas bloqueadas em ordem de id; o estorno cria os dois movimentos inversos e preserva a transferência como estornada |
| Saldo realizado (IND-009) | Saldo inicial da conta (a partir da data do saldo inicial) + Σ movimentos até a data. No consolidado as transferências se anulam |
| Meses | Passado: realizado. Corrente: realizado até hoje + em atraso + previsto de hoje ao fim do mês. Futuro: previsto. Saldo final = saldo inicial + entradas − saídas; o saldo final de um mês é o inicial do seguinte |
| Previsto | Σ saldo dos títulos ativos com saldo e vencimento no período (a receber = entrada, a pagar = saída). O que já foi recebido ou pago sai do saldo do título, então não reaparece |
| Filtros | **Conta**: recorta o realizado e o saldo inicial (os títulos não têm conta; o previsto continua o da empresa). **Categoria**: recorta o previsto pela categoria do título e o realizado pelas alocações dos recebimentos e pagamentos; transferências ficam de fora |
| Composição | Cada valor abre a lista de movimentos ou títulos que o formam, com a seta para o registro; a soma da lista é o valor da célula |
| Pendências | Competência fiscal já encerrada (a partir do início da receita no Renda+) sem conferência do contador aparece como "Pendência — imposto não conferido" no mês de vencimento do DAS, sem valor. O fiscal informa pela porta `CashFlowPendingSource` do financeiro (mesmo desenho do `CompetenceLockGuard`, sem dependência circular) |
| Permissões (PD-009) | Ver o fluxo com `financial_title.read`; transferir e estornar transferência com `transfer.post`, só no **Administrador** |

### Exemplo numérico

Hoje é 30/09/2026. Banco com R$ 10.000,00 e Caixa com R$ 20.000,00 (total R$ 30.000,00).

1. Transferir R$ 5.000,00 do Caixa para o Banco: Banco R$ 15.000,00, Caixa R$ 15.000,00, total continua R$ 30.000,00.
2. Títulos abertos: parcela a receber de R$ 55.500,00 com R$ 20.000,00 recebidos (saldo R$ 35.500,00) em 10/10; a pagar R$ 1.000,00 em 10/10; DAS R$ 1.335,00 em 20/10; a pagar R$ 1.000,00 em 10/11.

| | Out/2026 | Nov/2026 |
|---|---|---|
| Saldo inicial | R$ 30.000,00 | R$ 63.165,00 |
| Entradas previstas | R$ 35.500,00 | R$ 0,00 |
| Saídas previstas | R$ 2.335,00 | R$ 1.000,00 |
| Saldo final | **R$ 63.165,00** | **R$ 62.165,00** |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S9-01 | Transferência entre contas | Migração V14 (`transfer`, movimentos de transferência); `POST /transfers` com `Idempotency-Key`; saída e entrada vinculadas; total inalterado; conta inativa, origem = destino, valor ≤ 0 e data futura recusados; estorno total com motivo; eventos `TransferPosted` e `TransferReversed`; auditoria |
| S9-02 | Saldo realizado (IND-009) | `GET /bank-accounts/balances?date=`: por conta e total; transferências se anulam no total |
| S9-03 | Fluxo de caixa | `GET /cash-flow`: meses do horizonte com saldo inicial, realizado, previsto e saldo final, e a coluna Em atraso; os números do exemplo; parte recebida/paga não reaparece; filtros de conta e categoria |
| S9-04 | Composição | `GET /cash-flow/composition`: linhas de cada valor; a soma confere com o valor da célula (teste para cada coluna) |
| S9-05 | Pendências | Competência encerrada sem conferência aparece como pendência no mês do vencimento do DAS, nunca como zero |
| S9-06 | Contratos | OpenAPI (`/transfers`, `/bank-accounts/balances`, `/cash-flow`); permissões; eventos; `menu.json` com *Fluxo de caixa* implementado; verificador B01 OK |
| S9-07 | Telas | *Financeiro → Fluxo de caixa* (filtros conta, categoria, de/até; grade por mês; clique no valor abre a composição com setas; pendências); *Contas financeiras*: **Transferir** e a transferência no extrato com **Estornar transferência**; Consulta só vê; design system (`rp-*`) |
| S9-08 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-09.e2e.ts`: transferência sem mudar o total; fluxo filtrado por uma categoria própria do roteiro com os valores previstos; composição de uma célula conferida pela API; roda no CI e **duas vezes seguidas no mesmo banco** (ação da retrospectiva da Sprint 8) |

Ordem: S9-01 → S9-02 → S9-03 → S9-04 → S9-05 (servidor) → S9-06 → S9-07 → S9-08. Se faltar tempo, sai primeiro o filtro por categoria no realizado (fica só no previsto).

## Fora do escopo

Conciliação e importação de extrato (Sprint 10); cenários e simulações; despesas recorrentes sem título; exportação para planilha; visão por projeto; repasses; transferência para contas de terceiros.

## Como verificar (ao final)

1. *Contas financeiras*: Banco com R$ 10.000,00; receber R$ 20.000,00 no Caixa (como na Sprint 5).
2. **Transferir** R$ 5.000,00 do Caixa para o Banco: extrato do Caixa com −R$ 5.000,00, do Banco com +R$ 5.000,00; total das contas inalterado.
3. *Financeiro → Fluxo de caixa*: meses de 07/2026 a 03/2027; outubro com as entradas e saídas previstas do exemplo; saldos encadeados.
4. Clicar em "Saídas previstas" de outubro: o título a pagar e o DAS, somando R$ 2.335,00, cada um com a seta para a ficha.
5. Filtrar pela conta Banco: o saldo inicial e o realizado mudam; o previsto não.
6. **Estornar transferência** com motivo: os dois saldos voltam.
7. Entrar como Consulta: vê o fluxo e o extrato; não transfere nem estorna.

## Riscos

- **Previsto parece compromisso**: a grade separa realizado e previsto em linhas diferentes e a coluna Em atraso mostra o que já venceu.
- **Movimento de caixa sem liquidação**: a transferência é o primeiro movimento que não vem de recebimento ou pagamento; o extrato, o saldo e os testes das Sprints 5 e 8 continuam no CI.
