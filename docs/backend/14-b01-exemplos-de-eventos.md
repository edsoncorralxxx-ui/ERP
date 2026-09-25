# B01 — Exemplos: pedido, faturamento, recebimento, custo e pagamento

Situação: exemplos sintéticos de especificação. Nomes, datas e valores são fictícios e não vêm da carteira real. Eles servem de casos de aceite para B05–B09. As regras marcadas como premissa dependem das pendências indicadas.

## 1. Cenário completo de um pedido

**Premissas do cenário:**
- Pedido PV-DEMO-001, com 1 balança Renda+ por R$ 185.000,00.
- Parcelas: 30% (R$ 55.500,00, vence em 10/10/2026), 40% (R$ 74.000,00, vence em 10/11/2026) e 30% (R$ 55.500,00, vence em 10/12/2026).
- Saldo inicial da conta: R$ 50.000,00.
- Compra de 2 motorredutores a R$ 4.000,00 cada.

| # | Data | Evento (comando) | Carteira confirmada IND-001 | A faturar IND-003 | Faturado IND-005 | Recebido IND-006 | Saldo a receber IND-007 | Estoque (R$) | Comprometido IND-012 | Incorrido IND-011 | A pagar IND-008 | Caixa IND-009 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 30/09 | Pedido em rascunho | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 50.000,00 |
| 1 | 01/10 | ConfirmSalesOrder | 185.000,00 | 185.000,00 | 0 | 0 | 185.000,00 | 0 | 0 | 0 | 0 | 50.000,00 |
| 2 | 05/10 | ApprovePurchaseOrder (2 × 4.000,00) | 185.000,00 | 185.000,00 | 0 | 0 | 185.000,00 | 0 | 8.000,00 | 0 | 8.000,00 | 50.000,00 |
| 3 | 10/10 | PostSettlement parcela 1 | 185.000,00 | 185.000,00 | 0 | 55.500,00 | 129.500,00 | 0 | 8.000,00 | 0 | 8.000,00 | 105.500,00 |
| 4 | 15/10 | PostGoodsReceipt (2 un) | 185.000,00 | 185.000,00 | 0 | 55.500,00 | 129.500,00 | 8.000,00 | 8.000,00 | 0 | 8.000,00 | 105.500,00 |
| 5 | 20/10 | RegisterDocument NF 92.500,00 + LinkDocumentToTitles | 185.000,00 | 92.500,00 | 92.500,00 | 55.500,00 | 129.500,00 | 8.000,00 | 8.000,00 | 0 | 8.000,00 | 105.500,00 |
| 6 | 25/10 | ConsumeMaterial (1 un na ordem) | 185.000,00 | 92.500,00 | 92.500,00 | 55.500,00 | 129.500,00 | 4.000,00 | 4.000,00 | 4.000,00 | 8.000,00 | 105.500,00 |
| 7 | 04/11 | PostSettlement pagamento da compra | 185.000,00 | 92.500,00 | 92.500,00 | 55.500,00 | 129.500,00 | 4.000,00 | 4.000,00 | 4.000,00 | 0 | 97.500,00 |

### O que cada linha demonstra

1. **Rascunho não é venda.** Não entra em carteira, títulos ou indicadores.
2. **Confirmação é o fato comercial.** Cria carteira, 1 projeto, 1 equipamento e 3 títulos a receber (Σ = 185.000,00). Não é faturamento, recebimento nem caixa.
3. **Compra aprovada é compromisso.** Gera custo comprometido e obrigação a pagar. Não é custo incorrido nem pagamento.
4. **Recebimento financeiro liquida um título.** Aumenta caixa e recebido; reduz saldo a receber. Não muda carteira nem faturamento. "Recebido" não exige documento fiscal prévio, e o documento não exige recebimento.
5. **Recebimento de material é físico.** Aumenta estoque. Não é custo do projeto nem liquida a obrigação com o fornecedor.
6. **Faturamento é documento externo registrado.** Reduz "a faturar" e se **vincula** a títulos existentes: parcela 1 (55.500,00) e 37.000,00 da parcela 2 (PD-023). **Não cria títulos novos**, então o saldo a receber continua 129.500,00.
7. **Consumo é a origem do custo de material.** O custo incorrido é 4.000,00, ao custo médio. O comprometido cai para 4.000,00 porque metade da linha de compra foi incorrida; o outro motorredutor continua em estoque.
8. **Pagamento liquida a obrigação.** O caixa cai 8.000,00 e o a pagar zera. **O custo incorrido não muda.** Somar o pagamento ao custo contaria o mesmo gasto duas vezes.

### Conferências que o teste de B05–B09 deve automatizar

- Caixa final = 50.000,00 + 55.500,00 − 8.000,00 = **97.500,00** (IND-009).
- Saldo a receber = 185.000,00 − 55.500,00 = **129.500,00**, igual à soma das parcelas 2 e 3.
- Estoque + incorrido = 4.000,00 + 4.000,00 = 8.000,00 = valor recebido da compra: nada sumiu nem duplicou.
- Margem na base contratada até aqui = 185.000,00 − 4.000,00 = 181.000,00 (IND-013, base CONTRATADA). A mesma margem na base RECEBIDA = 55.500,00 − 4.000,00 = 51.500,00. A tela precisa exibir a base escolhida.
- Previsão de caixa (IND-010) de nov./26: +74.000,00. A parcela 1 liquidada **não** reaparece na previsão de out./26.

### Fatos operacionais gerados

| # | Fatos (factType) | Medidas principais |
|---|---|---|
| 1 | SALES_ORDER_CONFIRMED, PROJECT_CREATED, EQUIPMENT_CREATED, 3 × FINANCIAL_TITLE_CREATED | totalCents 18500000; parcelas 5550000, 7400000, 5550000 |
| 2 | PURCHASE_APPROVED, FINANCIAL_TITLE_CREATED (a pagar) | totalCents 800000 |
| 3 | SETTLEMENT_POSTED | alocação 5550000 |
| 4 | GOODS_RECEIVED | quantity 2 un; amountCents 800000 |
| 5 | DOCUMENT_REGISTERED, DOCUMENT_LINKED_TO_TITLES | totalCents 9250000; vínculos 5550000 + 3700000 |
| 6 | MATERIAL_CONSUMED → (custos) COST_ENTRY_RECORDED | quantity 1 un; amountCents 400000; source = movimento de consumo |
| 7 | SETTLEMENT_POSTED (a pagar) | alocação 800000 |

## 2. Estorno

Suponha que a baixa da linha 3 tenha sido lançada na conta errada. `ReverseSettlement` com motivo "Conta incorreta" produz:

| Antes do estorno | Depois do estorno |
|---|---|
| Parcela 1: saldo 0, SETTLED | Parcela 1: saldo 55.500,00, OPEN (vencida se hoje > 10/10) |
| Caixa da conta A: +55.500,00 | Movimento inverso −55.500,00 na conta A, vinculado ao original |
| Recebido IND-006: 55.500,00 | 0 (a liquidação original fica REVERSED, consultável) |
| Fato SETTLEMENT_POSTED | + fato SETTLEMENT_REVERSED com `reverses` apontando para ele |

A nova baixa na conta correta é outro comando, com nova chave de idempotência. O vínculo do documento fiscal à parcela 1 não é alterado: faturamento e recebimento são independentes.

## 3. Cancelamento

Pedido PV-DEMO-002 de R$ 100.000,00, confirmado em 02/10 com 2 parcelas de R$ 50.000,00, sem nenhum recebimento, reserva, consumo, produção ou documento vinculado.

- `CancelSalesOrder` em 06/10, com motivo, é aceito (premissa B01, PD-003).
- Os 2 títulos passam a CANCELLED, o projeto vai de PLANEJADO para ENCERRADO (motivo: cancelamento) e o equipamento é marcado cancelado.
- Fatos compensatórios fazem a carteira confirmada de out./26 (IND-001) variar +100.000,00 e depois −100.000,00: resultado líquido zero, com o histórico preservado.
- Se a parcela 1 já tivesse recebimento, a resposta seria 422 CANCELLATION_BLOCKED_BY_EFFECTS listando o título com alocação. Primeiro seria necessário estornar ou definir a regra de devolução (PD-003).

## 4. Arredondamento e resíduos (premissa PD-002)

| Caso | Resultado | Soma |
|---|---|---|
| R$ 100,00 em 3 parcelas iguais | 33,34 + 33,33 + 33,33 | 100,00 |
| R$ 185.000,00 em 30/40/30% | 55.500,00 + 74.000,00 + 55.500,00 | 185.000,00 |
| R$ 1.000,01 em 50/50% | 500,01 + 500,00 | 1.000,01 |
| Linha 3 × R$ 33,333333 (preço unitário escala 6) | round(99,999999) = 100,00 (HALF_EVEN) | — |

Regra testável para qualquer política adotada: **a soma das partes é sempre exatamente o total.** A troca da política de resíduo não altera agregados, só a Strategy `AllocationPolicy` versionada.

## 5. Transferência entre contas próprias

Transferir R$ 20.000,00 da conta A para a conta B gera saída em A e entrada em B, vinculadas. O saldo consolidado (IND-009) não muda. Não há receita, despesa nem efeito em títulos ou custos. Reimportar o extrato de A ou B não duplica o movimento, graças à chave de deduplicação da linha de extrato.
