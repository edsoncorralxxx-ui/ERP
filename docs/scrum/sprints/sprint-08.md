# Sprint 8 — Contas a pagar: títulos, pagamentos e o DAS da competência conferida

Situação: **Em execução**. Planning aprovado pelo PO em 28/09/2026 ("aprovado"), com as cinco respostas como propostas (tabela abaixo).

## Objetivo

Registrar o que a empresa deve e o que ela paga: títulos a pagar lançados à mão (fornecedor, categoria, competência, vencimento, uma ou mais parcelas) e o **título do DAS gerado pela conferência do contador**, pagamento parcial ou total a partir de uma conta financeira, estorno e cancelamento — com o saldo e o extrato da conta mostrando as saídas. Primeira fatia de contas a pagar do módulo `financeiro` (B06) e ação da retrospectiva da Sprint 7 (o DAS nasce da competência conferida, uma vez só).

## Respostas do PO (28/09/2026)

| Pergunta | Resposta | Consequência nesta sprint |
|---|---|---|
| 1. Reconferir o DAS | Como proposto | DAS sem pagamento: o título anterior é **cancelado** e nasce outro com o novo valor, com vínculo e histórico. DAS com pagamento: a nova conferência é **recusada** até estornar o pagamento (`TAX_DAS_PAID`). Conferência de R$ 0,00 não cria título |
| 2. Beneficiário do DAS | Como proposto | Parceiro **"Receita Federal — DAS"** semeado pela migração (fornecedor, sem CNPJ) |
| 3. Categorias (PD-010) | Como proposto | Lista inicial semeada: Materiais, Serviços de terceiros, Frete, Impostos — Simples Nacional, Folha e encargos, Aluguel, Energia e utilidades, Despesas administrativas, Outras despesas (despesa) e Receita de vendas (receita, a que os pedidos já usam). Cadastro de novas categorias pelo Administrador |
| 4. Conta negativa | Aceitar com aviso | O pagamento que deixa a conta negativa é aceito; a janela avisa antes de confirmar ("A conta ficará com saldo de −R$ …") |
| 5. Permissões (PD-009) | Como proposto | `financial_title.create`, `financial_title.settle`, `settlement.reverse`, `financial_title.cancel` e `financial_category.admin` só no **Administrador**; Consulta vê |

## Decisões do planning

| Tema | Decisão |
|---|---|
| Título manual | Uma parcela = um título (como no contas a receber), código `CP00001`; origem `MANUAL` com a mesma chave de registro para as parcelas; soma das parcelas = total, com **Dividir o total** (os centavos que sobram vão para a primeira parcela, como no pedido — PD-002). Campos: beneficiário (fornecedor ativo), categoria de despesa ativa, competência (`AAAA-MM`, informada), projeto opcional, número do documento do fornecedor e observação |
| Pagamento | A mesma liquidação da Sprint 5, com direção `PAYABLE`: movimento de **saída** (valor negativo) na conta; alocações só em títulos a pagar do mesmo beneficiário; excedente recusado (PD-004, `INSUFFICIENT_TITLE_BALANCE`); dois pagamentos simultâneos não passam do saldo (títulos bloqueados em ordem de id) |
| Estorno | Total (PD-005), com motivo; o movimento inverso é uma **entrada**; o título volta ao saldo anterior |
| Cancelamento | Só título manual e sem pagamento válido, com motivo; título do DAS só é cancelado pela reconferência |
| DAS | Conferir a competência cria, na mesma transação, o título a pagar: valor do contador, vencimento da conferência, competência da conferência, categoria **Impostos — Simples Nacional**, beneficiário Receita Federal — DAS, origem `TAX_PERIOD` = `competência:nº da conferência`. O fiscal chama `TitleIssuanceApi.issuePayables` (porta pública do financeiro; `fiscal → financeiro` já previsto em `modulos.json`); o `TaxPeriodConfirmed` sai com o `titleId` |

### Exemplo numérico

**Título manual** — fornecedor ACME, *Serviços de terceiros*, competência 09/2026, R$ 3.000,00 em 3 parcelas de R$ 1.000,00 (CP00001 a CP00003); conta Banco com saldo inicial de R$ 10.000,00.

1. Pagar R$ 400,00 do CP00001 → parcial, saldo R$ 600,00; Banco R$ 9.600,00 (saída de R$ 400,00 no extrato).
2. Pagar R$ 600,01 → recusado: "Saldo atual: R$ 600,00."
3. Estornar o pagamento → CP00001 volta a R$ 1.000,00; Banco R$ 10.000,00.

**DAS** — competência 09/2026 conferida em R$ 1.330,00, vencimento 20/10/2026 → título "DAS 09/2026" de R$ 1.330,00, vencimento 20/10/2026, categoria Impostos — Simples Nacional. Reconferir com R$ 1.335,00 → o título de R$ 1.330,00 fica cancelado ("substituído pela conferência 2") e nasce um de R$ 1.335,00; só um DAS ativo na competência.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S8-01 | Categorias financeiras | Migração V13 com `financial_category` e a lista semeada; título a pagar exige categoria de despesa ativa e competência (PD-010); Administrador cria, renomeia e inativa categoria; categoria semeada usada pelo sistema não é inativada |
| S8-02 | Título a pagar manual | `POST /payables` com Idempotency-Key; parcelas somam o total; beneficiário fornecedor ativo; a mesma chave devolve os mesmos títulos; evento `FinancialTitleCreated` com `direction` PAYABLE; auditoria |
| S8-03 | Pagamento | `POST /settlements` com `direction` PAYABLE; saída na conta; recusa excedente, título a receber (`SETTLEMENT_DIRECTION_MISMATCH`) e título de outro beneficiário; pagamentos simultâneos não passam do saldo; conta pode ficar negativa |
| S8-04 | Estorno e cancelamento | Estorno do pagamento devolve o saldo e cria entrada na conta; cancelar título manual sem pagamento, com motivo (`FinancialTitleCancelled`); com pagamento → recusado; título do DAS → recusado |
| S8-05 | DAS a partir do fiscal | Conferência cria o título; reconferir cancela o anterior sem pagamento e cria outro (um DAS ativo por competência); com pagamento, reconferir → `TAX_DAS_PAID`; R$ 0,00 não cria título; a competência mostra o título do DAS; `TaxPeriodConfirmed.titleId` preenchido |
| S8-06 | Contratos | OpenAPI de `/payables`, `/financial-categories` e da direção PAYABLE em `/settlements` (`OpenApiContractTest`); permissões nos perfis; erros e eventos no catálogo; `menu.json` com *Contas a pagar* implementado; PD-010 respondida em `pendencias.json`; verificador B01 OK |
| S8-07 | Telas | **Contas a pagar** (Título, Beneficiário, Vencimento, Original, Pago, Saldo, Situação; filtros Em aberto, Vencidos, A vencer, Pagos, Cancelados, Todos); **Novo título a pagar** com parcelas e *Dividir o total*; ficha do título (abas Pagamentos e Histórico; **Pagar**, **Estornar**, **Cancelar título**; aviso de saldo negativo); **Categorias financeiras**; na competência fiscal, a seta para o título do DAS; o extrato mostra as saídas; anterior e próximo registro na ficha; Consulta só vê; design system (`rp-*`) |
| S8-08 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-08.e2e.ts`: título manual em 3 parcelas → pagamento parcial → excedente recusado → estorno → saldo da conta conferido pela API; conferência da competência cria o DAS; reconferir não deixa dois DAS ativos (conferido pela API); roda no job `e2e` com as Sprints 4 a 7 |

Ordem: S8-01 → S8-02 → S8-03 → S8-04 → S8-05 (servidor) → S8-06 → S8-07 → S8-08. Se faltar tempo, sai primeiro a janela própria de categorias (a lista semeada é usada sem tela de edição).

## Fora do escopo

Conciliação e importação de extrato (OFX/CSV); fluxo de caixa; título gerado por pedido de compra (B08) e por repasses (B10); juros, multa e desconto; renegociação; pagamento em lote; boleto/código de barras; anexos; alçadas por valor e separação de funções; retenções; emissão do DAS/PGDAS-D; transferência entre contas.

## Como verificar (ao final)

1. *Cadastros → Fornecedores*: fornecedor ACME. *Financeiro → Contas financeiras*: Banco com saldo inicial de R$ 10.000,00.
2. *Financeiro → Contas a pagar → Novo*: ACME, Serviços de terceiros, competência 09/2026, R$ 3.000,00, 3 parcelas → **Dividir o total** → gravar: CP00001 a CP00003 de R$ 1.000,00.
3. Ficha do CP00001 → **Pagar** R$ 400,00 pelo Banco → parcial, saldo R$ 600,00; o extrato do Banco mostra −R$ 400,00 e saldo R$ 9.600,00.
4. **Pagar** R$ 600,01 → recusado com o saldo. **Estornar** o pagamento → saldo R$ 1.000,00; Banco R$ 10.000,00.
5. **Cancelar título** no CP00003 com motivo → cancelado. Com pagamento, o cancelamento é recusado.
6. *Fiscal → Impostos gerenciais*, competência 09/2026 → **Registrar conferência** R$ 1.330,00, vencimento 20/10/2026 → a aba Conferência mostra o título do DAS; ele aparece em Contas a pagar. Reconferir com R$ 1.335,00 → o anterior fica cancelado e há um só DAS ativo.
7. Pagar o DAS e tentar reconferir → recusado ("estorne o pagamento do DAS").
8. Entrar como Consulta: vê tudo; não cria, não paga, não estorna, não cancela.

## Riscos

- **Pagamento muda o recebimento**: a liquidação é a mesma da Sprint 5; os testes e o roteiro da Sprint 5 continuam no CI para garantir que receber e estornar não mudaram.
- **DAS e a conferência na mesma transação**: se a criação do título falhar, a conferência também não grava — uma competência nunca fica conferida sem o DAS.
- **Categorias em texto nos títulos antigos**: os títulos a receber já gravam `RECEITA_VENDA`; a categoria passa a ter cadastro com esse mesmo código, sem migrar dados.
