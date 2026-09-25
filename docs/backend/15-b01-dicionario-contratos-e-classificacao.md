# B01 — Dicionário empresarial, contratos de formulário e classificação

Situação: especificação B01. Fontes canônicas (legíveis por máquina): `b01/conceitos.json` (57 conceitos), `b01/formularios.json` (32 contratos), `b01/eventos.json` (95 eventos), `b01/indicadores.json` (20 indicadores) e `b01/pendencias.json` (24 pendências). Este documento explica esses arquivos; em caso de divergência, vale o JSON verificado por `tools/b01/verificar_b01.py`.

## 1. Dicionário empresarial

Cada conceito tem um único módulo dono, significado, unidade, granularidade, datas aplicáveis, origem, a lista do que **não** deve ser confundido com ele e sinônimos (usados na importação e na busca, sem fundir fatos diferentes).

As distinções que o plano exige:

| Conceito | É | Não é | Nasce em |
|---|---|---|---|
| PEDIDO | compromisso confirmado do cliente | proposta, faturamento, recebimento | ConfirmSalesOrder |
| FATURAMENTO | documento fiscal emitido externamente e registrado | obrigação nova, recebimento | RegisterDocument |
| TITULO | obrigação a receber/pagar com saldo | documento fiscal | pedido confirmado, compra aprovada, repasse ou fiscal confirmado |
| RECEBIMENTO | liquidação de título a receber com entrada em conta | faturamento, recebimento de material | PostSettlement (a receber) |
| RECEBIMENTO_MATERIAL | entrada física conferida | pagamento, custo | PostGoodsReceipt |
| COMPRA | compromisso aprovado com fornecedor | custo incorrido, pagamento | ApprovePurchaseOrder |
| CUSTO_COMPROMETIDO | compras aprovadas ainda não incorridas | custo incorrido (não se somam) | PurchaseApproved |
| CUSTO_INCORRIDO | custo apropriado por origem única | pagamento | consumo, aceite de serviço, horas, despesa reconhecida |
| PAGAMENTO | liquidação de título a pagar | custo | PostSettlement (a pagar) |
| RESERVA | quantidade comprometida no estoque | consumo, reserva de caixa | ReserveStock |
| RESERVA_CAIXA | destinação interna | pagamento, redução do saldo bancário | ConfirmDistribution |
| PREVISAO_CAIXA | saldo de títulos abertos nas datas previstas | cenário/simulação | derivado |
| CENARIO | hipótese calculada à parte | previsão oficial, fato | AnalysisRun |

Os exemplos numéricos dessas distinções estão em `14-b01-exemplos-de-eventos.md`.

## 2. Contrato de formulário (FormDefinition v1)

Cada formulário declara:

| Elemento | Conteúdo no JSON |
|---|---|
| Nome e significado | `nome`, `significado`, `conceito` do dicionário |
| Campos | `nome`, `tipo`, `unidade`/`precisao` quando numérico, `obrigatorio`, `origem` (usuario, sistema, derivado, importacao, referencia) |
| Classificação | `classificacoes` aplicáveis |
| Validação | `validacoes`; regras sem dado suficiente apontam `pendencia` |
| Eventos gerados | `comandos[].eventos` (tipos do catálogo) |
| Indicadores afetados | `indicadores` (IND-*) |
| Análises habilitadas | `analises` (AN-* da matriz 08) |
| Ações | `acoes` do usuário e `comandos` com `permissao` |
| Rastreabilidade | `rastreabilidadePadrao` comum a todos |

O contrato é **o mesmo para React e Java**: o cliente usa para montar e pré-validar a janela; o servidor é quem valida de fato. Campos `derivado` nunca são aceitos do cliente. Salvar rascunho é diferente de executar um comando de negócio: confirmar, baixar, estornar e aprovar têm comandos próprios.

### 2.1 Resumo dos 32 contratos

Tabela gerada a partir de `b01/formularios.json`.

| Tela | Tipo | Módulo | Conceito | Campos | Comandos | Indicadores | Recursos AN | Pendências |
|---|---|---|---|---:|---|---|---|---|
| Visão geral (`dashboard`) | painel | consultas | INDICADOR | 4 | — (consulta) | IND-001, IND-005, IND-006, IND-008, IND-009, IND-010, IND-017, IND-018, IND-020 | AN-035, AN-038 | — |
| Clientes e unidades (`clientes`) | cadastro | cadastros | CLIENTE | 9 | RegisterPartner, UpdatePartner, DeactivatePartner | IND-001, IND-007 | AN-001, AN-009 | — |
| Fornecedores (`fornecedores`) | cadastro | cadastros | FORNECEDOR | 7 | RegisterPartner, UpdatePartner, DeactivatePartner | IND-008 | AN-026, AN-029 | — |
| Materiais e serviços (`materiais`) | cadastro | cadastros | ITEM | 8 | RegisterItem, UpdateItem, DeactivateItem | IND-014 | AN-020, AN-028 | PD-007 |
| Equipamentos (`equipamentos`) | cadastro | projetos | EQUIPAMENTO | 9 | UpdateEquipment, AttachDocument, OpenServiceTicket | IND-002, IND-017 | AN-031, AN-008 | PD-015 |
| Prospecção (`prospeccao`) | cadastro | comercial | LEAD | 8 | RegisterLead, RecordInteraction, OpenOpportunity | IND-016 | AN-002, AN-006 | — |
| Oportunidades e propostas (`propostas`) | documento | comercial | PROPOSTA | 10 | IssueProposalRevision, RecordProposalOutcome, ConvertProposalToOrder, ExportProposal | IND-016 | AN-003, AN-002 | PD-002 |
| Pedidos e contratos (`pedidos`) | documento | comercial | PEDIDO | 11 | ConfirmSalesOrder, AmendSalesOrder, CancelSalesOrder | IND-001, IND-002, IND-003, IND-004 | AN-004, AN-005 | PD-001, PD-003 |
| Carteira de projetos (`carteira`) | consulta | consultas | PROJETO | 5 | — (consulta) | IND-001, IND-015, IND-020 | AN-004 | — |
| Detalhe do projeto (`projeto`) | documento | projetos | PROJETO | 8 | AssignProjectResponsible, ChangeProjectStage, RecordDecision | IND-011, IND-012, IND-013, IND-015 | AN-014, AN-021 | — |
| BOM — composição de custos (`bom`) | documento | engenharia | BOM | 6 | ApproveBomRevision, ApplyBomToProject | IND-011 | AN-020 | — |
| EAP e cronograma (`cronograma`) | documento | engenharia | ATIVIDADE | 6 | RecalculateSchedule, RecordActivityProgress, ApproveBaseline | IND-015, IND-020 | AN-021 | PD-017, PD-018 |
| Necessidades e cotações (`necessidades`) | documento | suprimentos | NECESSIDADE | 7 | CalculateRequirements, CreatePurchaseRequest, RecordQuotation | IND-018 | AN-027, AN-026 | PD-016 |
| Pedidos de compra (`compras`) | documento | suprimentos | COMPRA | 7 | ApprovePurchaseOrder, CancelPurchaseOrderRemainder | IND-008, IND-012 | AN-026, AN-027 | PD-009 |
| Recebimentos e terceiros (`recebimentos`) | documento | recebimentos | RECEBIMENTO_MATERIAL | 5 | PostGoodsReceipt, AcceptService, ReturnGoodsToSupplier, DispatchToThirdParty, ReceiveFromThirdParty | IND-014 | AN-029, AN-026 | — |
| Estoque e inventário (`estoque`) | documento | estoque | ESTOQUE_FISICO | 7 | ReserveStock, ReleaseReservation, ConsumeMaterial, ReturnMaterial, TransferStock, AdjustStock, PostInventoryCount | IND-014 | AN-028 | PD-011 |
| Ordens de produção (`producao`) | documento | producao | ORDEM_PRODUCAO | 7 | ReleaseProductionOrder, ReportProduction, CompleteProductionOrder | IND-011, IND-015 | AN-022, AN-023 | PD-014 |
| Inspeções e qualidade (`qualidade`) | documento | qualidade | INSPECAO | 5 | RecordInspection, ApproveInspection, OpenNonconformity, OpenRework | — | AN-024, AN-025 | PD-014 |
| Instalação e entrega (`instalacao`) | documento | instalacao | ACEITE_CLIENTE | 6 | ScheduleInstallation, RecordInstallationExecution, RecognizeInstallationExpense, ConfirmAcceptance | IND-002, IND-011 | AN-030 | PD-015 |
| Documentos e faturamento (`documentos`) | documento | documentos | FATURAMENTO | 8 | RegisterDocument, LinkDocumentToTitles, ClassifyDocument | IND-003, IND-005 | AN-018, AN-019 | PD-023 |
| Contas a receber (`receber`) | documento | financeiro | TITULO | 11 | PostSettlement, ReverseSettlement, AdjustTitle, RenegotiateTitles | IND-006, IND-007, IND-010 | AN-010 | PD-004, PD-005 |
| Contas a pagar (`pagar`) | documento | financeiro | TITULO | 9 | RegisterPayableTitle, PostSettlement, ReverseSettlement, CancelTitle | IND-008, IND-010 | AN-011 | PD-010 |
| Contas e conciliação (`conciliacao`) | documento | financeiro | CONCILIACAO | 5 | ImportStatement, Reconcile, UndoReconciliation, TransferBetweenAccounts | IND-009 | AN-012 | PD-006 |
| Fluxo de caixa (`caixa`) | consulta | financeiro | PREVISAO_CAIXA | 8 | ExportCashMatrix | IND-009, IND-010 | AN-013 | — |
| Custos e resultado (`custos`) | consulta | custos | RESULTADO_PROJETO | 7 | ApproveProjectBudget | IND-011, IND-012, IND-013 | AN-014, AN-015 | — |
| Repasses (`repasses`) | documento | repasses | REPASSE | 8 | ReviseDistributionRule, SimulateDistribution, ConfirmDistribution, AdjustDistribution | IND-008, IND-010 | AN-017 | PD-002, PD-012 |
| Impostos gerenciais (`impostos`) | documento | fiscal | COMPETENCIA_FISCAL | 7 | ReviseTaxParameters, SimulateTaxPeriod, ConfirmTaxPeriod, CloseTaxPeriod, ReopenTaxPeriod | IND-005 | AN-019 | PD-013 |
| Assistência técnica (`assistencia`) | documento | posvenda | CHAMADO | 8 | OpenServiceTicket, CreateServiceOrder, ConsumeMaterial, RecordServiceExecution, CloseServiceTicket | IND-017, IND-011 | AN-031, AN-009 | PD-015 |
| Manutenção preventiva (`preventiva`) | documento | posvenda | PREVENTIVA | 6 | RevisePreventivePlan, GeneratePreventiveOrders | IND-017 | AN-031 | — |
| Relatórios (`relatorios`) | consulta | consultas | INDICADOR | 5 | RequestExport | IND-001, IND-007, IND-009, IND-011, IND-013, IND-014, IND-017 | AN-038 | — |
| Importação e conferência (`importacao`) | documento | integracao | IMPORTACAO | 6 | UploadImportFile, DecideStagingRecord, ApplyImport | IND-019 | AN-012 | PD-019 |
| Configurações e manutenção (`configuracoes`) | cadastro | plataforma | FATO_OPERACIONAL | 4 | ChangeSetting, GrantAccess, RevokeAccess, RequestBackup | — | — | PD-009, PD-021 |

Totais: 32 formulários, 99 comandos, 20 indicadores referenciados. Todo cadastro ou documento tem ao menos um comando com permissão; todo comando emite eventos do catálogo.

## 2.2 Menu lateral

`b01/menu.json` distribui as funcionalidades nos 30 módulos da Barra lateral do design system, na ordem dele: as 32 telas, as visões do painel e os recursos do catálogo analítico que ganham tela própria. Cada item traz a sprint ou fase prevista, e só é clicável no app quando `implementado` é verdadeiro. O verificador falha se alguma tela ou recurso AN ficar fora do menu, ou se os módulos saírem da ordem do design system. Recursos Humanos e Patrimônio aparecem no design system, mas ficam fora do escopo da versão inicial.

## 3. Classificação

```text
ClassificationRule (versionada)
  id, revision, scope (conceito/formulário), validFrom, validTo?
  inputs: campos usados, condition: expressão declarativa registrada, output: classe(s)
  approvedBy, approvedAt

ClassificationAssignment
  subject: EntityRef, ruleRevision?, className
  kind: CONFIRMED | SUGGESTED
  source: RULE | USER | PYTHON_SUGGESTION | IMPORT
  confidence?: apenas em sugestões, nunca apresentada como probabilidade sem calibração
  decidedBy?, decidedAt?, supersedes?
```

- Sugestões (Python, importação ou IA futura) ficam separadas das classificações confirmadas e só entram nos fatos após confirmação.
- Reclassificar gera uma nova atribuição (`supersedes`) e identifica os indicadores afetados. Os relatórios usam, por padrão, a classificação vigente na data do fato, e a consulta pela classificação atual é explicitada (PD-022).
- Classificação fiscal (produto/serviço, natureza da operação) é confirmada por pessoa. Não é inferida só pela descrição, pois a origem tem balança como SERVIÇO e instalação como PRODUTO.
- Classes iniciais por formulário estão em `classificacoes`. Os valores das listas (categorias, centros de resultado, segmentos) serão cadastrados (PD-010).

## 4. Qualidade de dados

O modelo (`DataQualityIssue`) e as regras iniciais estão em `12-b01-modelo-de-dominio.md` §7.2 e `13-b01-especificacao-de-comandos.md` §6.2. Um problema bloqueante impede aplicar o registro importado; um aviso só é exibido. O valor original é sempre preservado.

## 5. Como manter

1. Altere o JSON correspondente em `docs/backend/b01/`.
2. `python3 tools/b01/formatar_json.py` para padronizar o formato.
3. `python3 tools/b01/verificar_b01.py` deve terminar com `OK`.
4. `python3 -m unittest discover -s tools/b01` garante que o verificador continua detectando falhas.
5. Um contrato publicado muda por nova `versao`; a versão anterior continua válida para os registros que a usaram.
