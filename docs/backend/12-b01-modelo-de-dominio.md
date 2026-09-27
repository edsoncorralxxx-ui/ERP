# B01 — Modelo de domínio, Value Objects e estados

Situação: especificação B01. Não é código implementado. Os nomes Java seguem o documento 06. As invariantes são numeradas (`INV-*`) para que os testes de B02–B10 as referenciem diretamente. Premissas que dependem de regra de negócio indicam a pendência (`PD-*`, em `b01/pendencias.json`).

## 1. Value Objects do kernel

Os Value Objects são imutáveis, comparados por valor, sem setters, e validam a si mesmos na construção. Nenhum usa `double` ou `float`.

### 1.1 Money

```text
Money(long cents, Currency currency)          // Currency: BRL na versão inicial, sempre explícita
  plus(Money) / minus(Money)                   // exige mesma moeda; senão CurrencyMismatch
  negate(), isZero(), isNegative(), compareTo(Money)
  times(Rate, RoundingPolicy) -> Money         // decimal exato, arredonda uma vez pela política
  allocate(List<Weight>, AllocationPolicy) -> List<Money>   // soma exata garantida
  static parse(String amountCents, Currency)   // contrato da API: string de inteiro
```

- **INV-MON-1** Operações entre moedas diferentes são rejeitadas.
- **INV-MON-2** `allocate` devolve partes cuja soma é exatamente o valor original. Os resíduos seguem a `AllocationPolicy` (premissa B01: um centavo por vez, a partir da primeira parte; PD-002).
- **INV-MON-3** Nenhum arredondamento implícito: todo método que produz centavos a partir de decimal recebe uma `RoundingPolicy` (premissa B01: HALF_EVEN; PD-002).
- **INV-MON-4** O overflow de `long` é detectado (`Math.addExact`) e nunca ocorre silenciosamente.

### 1.2 Quantity e unidades

```text
Quantity(BigDecimal value, UnitOfMeasure unit)   // escala máxima 6 (PD-007)
  plus/minus(Quantity)                             // exige mesma unidade
  convertTo(UnitOfMeasure, UnitConversion)         // fator explícito e > 0
UnitPrice(BigDecimal perUnit, Currency, UnitOfMeasure)  // escala 6
  times(Quantity, RoundingPolicy) -> Money         // unidade da quantidade deve coincidir
```

- **INV-QTY-1** Quantidades de unidades diferentes só se somam após conversão explícita.
- **INV-QTY-2** A escala excedente é rejeitada; nunca é truncada silenciosamente.

### 1.3 Outros

| VO | Conteúdo | Regras |
|---|---|---|
| Rate | fração decimal (ex.: 0,300000 = 30%) | escala 6; percentuais de exibição são só formatação |
| DateRange | início e fim inclusivos | início ≤ fim |
| CompetencePeriod | ano-mês | sem fuso; não convertido em instante |
| BusinessDate | data de negócio | distinta de instantes de auditoria (UTC) |
| EntityRef | tipo + id opaco | referência a registro de outro módulo sem dependência |
| AggregateVersion | inteiro ≥ 0 | concorrência otimista (ETag/If-Match) |
| IdempotencyKey | texto opaco do cliente | único por (empresa, operação) |
| Reason | texto obrigatório não vazio | exigido em cancelamento, estorno, ajuste, reabertura |

## 2. Comercial — SalesOrder (agregado)

```text
SalesOrder
  id: SalesOrderId, code, companyId, version: AggregateVersion
  customerId, unitId, proposalRef?: (proposalId, revision)
  contractDate: BusinessDate, promisedDate?: BusinessDate
  lines: List<SalesOrderLine>          // itemRef, kind(EQUIPMENT|SERVICE|MATERIAL), quantity, unitPrice, discount, lineTotal
  schedule: PaymentSchedule            // List<PlannedInstallment(seq, dueDate, amount, milestone?)>
  status: OrderStatus
  confirmation?: OrderConfirmation     // at, by, snapshotHash, projectIds, equipmentIds, titleIds
  amendments: List<Amendment>
  cancellation?: OrderCancellation

  addLine / changeLine / removeLine    // só em DRAFT
  setSchedule(PaymentSchedule)         // só em DRAFT
  confirm(ConfirmationPolicy, Instant, UserId) -> OrderConfirmed
  amend(ApprovedAmendment) -> SalesOrderAmended
  cancel(CancellationPolicy, EffectsSnapshot, Reason) -> SalesOrderCancelled
  total(): Money                        // Σ lineTotal
```

**Invariantes**

- **INV-SO-1** Há pelo menos uma linha. A quantidade é maior que zero; o preço é maior ou igual a zero; o desconto fica entre zero e o bruto da linha.
- **INV-SO-2** `lineTotal = round(quantity × unitPrice) − discount`, arredondado por linha (PD-002). `total = Σ lineTotal`.
- **INV-SO-3** `Σ schedule.amount = total`, exato em centavos. Sequências são únicas e vencimentos existem.
- **INV-SO-4** Linhas, preços e cronograma só mudam em DRAFT. Depois da confirmação, só por `Amendment` aprovado, que preserva a versão original.
- **INV-SO-5** A confirmação ocorre uma única vez. Uma segunda tentativa devolve a `OrderConfirmation` existente e não gera novos efeitos.
- **INV-SO-6** Para confirmar, cliente e unidade precisam estar ativos e a unidade precisa pertencer ao cliente. Isso é verificado dentro da transação pelo `PartnerQueryApi`.
- **INV-SO-7** Cancelar um pedido confirmado passa pela `CancellationPolicy`. A premissa B01 bloqueia se houver recebimento, reserva, consumo ou produção (PD-003).

**Estados**

| De | Para | Comando | Condição |
|---|---|---|---|
| DRAFT | CONFIRMED | ConfirmSalesOrder | INV-SO-1..6 |
| DRAFT | CANCELLED | CancelSalesOrder | motivo |
| CONFIRMED | IN_EXECUTION | derivado de ProjectStageChanged ≠ PLANEJADO | automático |
| CONFIRMED / IN_EXECUTION | CANCELLED | CancelSalesOrder | CancellationPolicy (PD-003) |
| IN_EXECUTION | COMPLETED | derivado: todos os equipamentos aceitos e títulos sem saldo | automático |

## 3. Financeiro — FinancialTitle (agregado)

```text
FinancialTitle
  id, code, companyId, version
  direction: RECEIVABLE | PAYABLE
  counterpartyId, origin: EntityRef, projectRef?: EntityRef, category, competence: CompetencePeriod
  issueDate, dueDate: BusinessDate
  originalAmount: Money
  adjustments: List<TitleAdjustment>   // kind(INTEREST|PENALTY|DISCOUNT|ABATEMENT|CORRECTION), signedAmount, reason, at, by, reversedBy?
  allocations: List<AllocationRecord>  // settlementId, amount, reversed: boolean
  lifecycle: ACTIVE | RENEGOTIATED | CANCELLED

  balance() = originalAmount + Σ adjustments ativos − Σ allocations não estornadas
  status()  = CANCELLED | RENEGOTIATED | SETTLED (balance = 0) | PARTIAL (0 < balance < devido) | OPEN
  isOverdue(today) = balance > 0 && dueDate < today     // condição, não estado
  applyAllocation(settlementId, Money)                   // chamado pelo serviço de liquidação sob bloqueio
  reverseAllocation(settlementId)
  adjust(kind, Money, Reason)
  cancel(Reason)                                         // só sem alocações ativas
```

- **INV-FT-1** `balance() ≥ 0` sempre. Uma alocação acima do saldo é rejeitada (`INSUFFICIENT_TITLE_BALANCE`). O excedente só entra como crédito explícito (PD-004).
- **INV-FT-2** O valor original e a origem são imutáveis. Correções entram como ajustes com motivo, e ajustes são estornados, nunca apagados.
- **INV-FT-3** Existe um único título ativo por origem: `unique(companyId, origin.type, origin.id)`. Isso protege contra duplicação mesmo com chaves de idempotência diferentes.
- **INV-FT-4** Um título com alocação ativa não é cancelado; primeiro vem o estorno.
- **INV-FT-5** A renegociação mantém referência aos títulos substituídos e ao valor liquidado. O saldo remanescente migra para os novos títulos, com soma exata.

## 4. Financeiro — Settlement (agregado) e estorno

```text
Settlement
  id, companyId, direction, accountId, effectiveDate: BusinessDate
  total: Money
  allocations: List<SettlementAllocation(titleId, amount)>
  credit?: Money                         // crédito/adiantamento explícito (PD-004)
  components: List<ExplicitComponent>    // tarifas, juros recebidos etc., cada um com categoria
  cashMovementId
  status: POSTED | REVERSED
  reversal?: SettlementReversal(reason, at, by, reversingCashMovementId)
```

- **INV-ST-1** `Σ allocations + credit + Σ components = total`. Uma diferença nunca some.
- **INV-ST-2** Todas as alocações têm a mesma direção da liquidação e cada título aparece uma vez.
- **INV-ST-3** Cada alocação é aplicada ao título sob bloqueio pessimista, com os títulos em ordem crescente de id, na mesma transação da liquidação, do movimento de caixa, do recibo de comando, da auditoria e do outbox.
- **INV-ST-4** O estorno é total por liquidação (PD-005). Ele cria um movimento de caixa inverso vinculado, restaura os saldos pelas mesmas alocações e preserva a liquidação original como REVERSED.
- **INV-ST-5** Liquidação conciliada não é estornada diretamente; exige desconciliação explícita (PD-006, erro `SETTLEMENT_RECONCILED`).
- **INV-ST-6** Estornar duas vezes devolve o estorno existente (idempotência pelo agregado).

## 5. Fato operacional — OperationalFact

```text
OperationalFact (imutável, gravado na transação do comando)
  id, companyId, factType            // ex.: SALES_ORDER_CONFIRMED
  conceptId                          // dicionário (b01/conceitos.json)
  subject: EntityRef, subjectVersion
  occurredOn: BusinessDate, recordedAt: Instant
  actorId, source: UI | IMPORT | SYSTEM, commandId, correlationId
  dimensions: Map<String, EntityRef|String>   // cliente, unidade, projeto, item, UF, competência...
  measures: Map<String, Money|Quantity>       // ex.: totalCents, quantity
  classifications: List<(ruleRevisionId, className)>   // somente confirmadas
  reverses?: FactId                            // compensação de cancelamento/estorno
```

- **INV-FACT-1** Um fato nunca é alterado. Cancelamentos e estornos geram um fato compensatório (`reverses`).
- **INV-FACT-2** A reconstrução de qualquer indicador a partir dos fatos coincide com a atualização incremental.
- **INV-FACT-3** Sugestões de classificação não entram em `classifications`; apenas atribuições confirmadas.

## 6. Motor — IndicatorDefinition e AnalysisRun

```text
IndicatorDefinition (imutável por versão)
  id, version, name, conceptIds, unit, granularity, timeBasis
  formula: FormulaSpec              // árvore declarativa: agregação(fato, medida, filtros) e operadores (+ − × ÷)
  allowedFilters, periodicity, dependencies: List<IndicatorRef>
  missingPolicy: UNKNOWN            // ausente nunca vira zero
  zeroDenominator: NOT_CALCULABLE
  owner, status: DRAFT | ACTIVE | RETIRED

IndicatorValue
  definition(id, version), filters, period, value?: Money|Quantity|Rate
  state: CALCULATED | UNKNOWN | NOT_CALCULABLE | STALE
  cutoff, watermark, compositionQueryId, updatedAt
```

- **INV-IND-1** Existe uma definição ativa por id. Telas, relatórios e exportações usam a mesma definição e o mesmo corte.
- **INV-IND-2** O grafo de dependências é acíclico (verificado em `b01/indicadores.json`).
- **INV-IND-3** A fórmula não aceita SQL ou código do cliente; só funções registradas no servidor.
- **INV-IND-4** Todo valor abre sua composição (fatos/registros de origem paginados).

```text
AnalysisRun
  id, method(id, version), datasetSnapshotId, parameters, hypotheses, seed?
  environment(processorVersion, libraries)
  state: REQUESTED → ELIGIBILITY_CHECK → (INSUFFICIENT_DATA | QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED)
  eligibility: EligibilityReport (causas quando insuficiente)
  result?: metrics, intervals(kind: CONFIDENCE|PREDICTION|CREDIBLE), limitations, artifacts
  stale: boolean                     // fatos mudaram após o corte do snapshot
```

- **INV-AR-1** O snapshot é imutável durante a execução. Uma nova execução não apaga a anterior.
- **INV-AR-2** Dados insuficientes são um estado válido, com causas; não são erro.
- **INV-AR-3** O resultado do Python é validado no Java (esquema, limites, lease vigente) antes de ser publicado.
- **INV-AR-4** Execuções nunca alteram fatos ou comandos de negócio.

## 7. Qualidade

"Qualidade" no B01 cobre dois objetos distintos.

### 7.1 Inspeção (qualidade de produto)

```text
Inspection
  id, subject: EntityRef (ordem de produção, equipamento, instalação)
  checklistRevision (imutável), items: List<(criterion, technicalLimit?, measurement?, result, evidenceIds)>
  inspector, status: PENDING → IN_REVIEW → APPROVED | REJECTED
  nonconformities: List<NonconformityId>, supersedes?: InspectionId
```

- **INV-INS-1** Aprovar exige todos os itens obrigatórios com resultado e evidência, conforme a revisão do checklist (critérios reais pendentes: PD-014).
- **INV-INS-2** Reprovação abre não conformidade. A nova inspeção após correção referencia a anterior sem alterá-la.
- **INV-INS-3** Limites de controle estatístico (motor) não substituem limites técnicos da especificação.

### 7.2 Qualidade de dados

```text
DataQualityIssue
  id, subject: EntityRef, ruleId, severity: BLOCKING | WARNING
  kind: MISSING | DUPLICATE_CANDIDATE | OUT_OF_RANGE | INCONSISTENT_DATE | SUM_MISMATCH | UNKNOWN_MAPPING
  observed, expected?, evidence(source file, page, line), status: OPEN | ACCEPTED | CORRECTED | DISMISSED, decision
```

- **INV-DQ-1** Um problema BLOCKING impede a aplicação do registro importado ou a confirmação que depende dele.
- **INV-DQ-2** A correção preserva o valor original e o corrigido, com autor e motivo.
- **INV-DQ-3** Detecções conhecidas da origem entram como casos de teste: soma da BOM × total impresso (R$ 3.000,00), entrega = venda + 90 dias, competência 01/2027 com ano 2026, `#REF!`, custo elétrico com diferença de R$ 601,49.

## 8. Demais agregados (resumo para B03–B11)

| Agregado | Invariante central | Fase |
|---|---|---|
| Partner | CNPJ único quando presente; papéis sem duplicar cadastro; inativação sem apagar | B03 |
| Proposal/Revision | revisão emitida imutável | B05 |
| Project | vínculo a pedido/cliente/unidade; estágios podem coexistir | B05 |
| Equipment | identidade própria; aceite e garantia vêm de evento real | B05/B09 |
| BomRevision / ProjectBom | revisão aprovada imutável; projeto conserva a sua | B07 |
| Schedule / Baseline | sem ciclos; recálculo não altera baseline | B07 |
| StockPosition / Reservation | reservado ≤ físico; disponível ≥ 0 sob concorrência | B08 |
| PurchaseOrder | Σ condição = total; saldo remanescente cancelável | B08 |
| ProductionOrder | liberação exige revisão e condições | B09 |
| CostEntry | `unique(sourceType, sourceId)` | B08/B09 |
| DistributionRun | confirmação congela memória; títulos uma vez | B10 |
| TaxPeriod | histórico/simulação/contador separados; reabertura motivada | B10 |
| PreventiveOccurrence | `unique(plan, revision, equipment, scheduledDate)` | B11 |
| StagingRecord | original preservado; aplicação idempotente por origem | B04/B12 |
