export type ServerStatus = {
  status: 'UP' | 'DEGRADED';
  apiVersion: string;
  serverVersion: string;
  database: 'UP' | 'DOWN';
  serverTime: string;
  /** Hoje no fuso da empresa (Sprint 6); o app usa como sugestão nos campos de data. */
  businessDate?: string;
};

export type Address = {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type CompanyProfile = {
  id: string;
  legalName: string | null;
  tradeName: string | null;
  cnpj: string | null;
  cnpjFormatted: string | null;
  address: Address;
  phone: string | null;
  email: string | null;
  configured: boolean;
  version: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Usuário da sessão (GET /api/v1/session). */
export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  profile: 'ADMINISTRADOR' | 'CONSULTA';
  profileLabel: string;
  permissions: string[];
};

/** Resposta do login como chega ao React: sem o token, que fica no processo principal. */
export type LoginResponse = { expiresAt: string; idleTimeoutSeconds: number; user: SessionUser };

export type CustomerUnit = {
  id: string | null;
  name: string | null;
  /** CNPJ da unidade (filial), só dígitos; opcional. */
  cnpj?: string | null;
  cnpjFormatted?: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type CustomerContact = { id: string | null; name: string | null; role: string | null; phone: string | null; email: string | null };

export type Customer = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  cnpjFormatted: string | null;
  group: string | null;
  status: 'ATIVO' | 'INATIVO';
  /** Também é fornecedor ativo (cliente e fornecedor são papéis do mesmo parceiro). */
  supplier: boolean;
  units: CustomerUnit[];
  contacts: CustomerContact[];
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CustomerSummary = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  cnpjFormatted: string | null;
  city: string | null;
  state: string | null;
  units: number;
  status: 'ATIVO' | 'INATIVO';
  version: string;
};

export type HistoryEntry = {
  occurredAt: string;
  actor: string;
  action: string;
  version: number;
  reason: string | null;
  changes: Record<string, { before: string | null; after: string | null }>;
};

export type UserAccount = {
  id: string;
  username: string;
  displayName: string;
  profile: 'ADMINISTRADOR' | 'CONSULTA';
  active: boolean;
  locked: boolean;
  version: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type Situacao = 'ATIVO' | 'INATIVO';

export type CategoryRef = { id: string; name: string };

export type Supplier = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  cnpjFormatted: string | null;
  group: string | null;
  /** Situação do papel de fornecedor. */
  status: Situacao;
  /** Também é cliente ativo. */
  customer: boolean;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  suppliedCategories: CategoryRef[];
  contacts: CustomerContact[];
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SupplierSummary = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  cnpjFormatted: string | null;
  city: string | null;
  state: string | null;
  suppliedCategories: string | null;
  leadTimeDays: number | null;
  status: Situacao;
  version: string;
};

export type Natureza = 'MATERIAL' | 'SERVICO';

/** MATERIAL é o produto (na tela: Produto); SERVICO, o serviço. */
/** Decimais trafegam como texto com ponto ("184.500000"), sem ponto flutuante (ADR-006). */
export type ItemConversion = { id: string | null; fromUom: string; factor: string };

export type Item = {
  id: string;
  code: string;
  description: string;
  nature: Natureza;
  uom: string;
  category: CategoryRef;
  stockControlled: boolean;
  referenceCost: string | null;
  /** NCM do produto, 8 dígitos. */
  ncm: string | null;
  /** Código do serviço na lista da LC 116 ("14.01"), o COD_LST do SPED. */
  serviceCode: string | null;
  status: Situacao;
  conversions: ItemConversion[];
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ItemSummary = {
  id: string;
  code: string;
  description: string;
  nature: Natureza;
  uom: string;
  category: string;
  stockControlled: boolean;
  referenceCost: string | null;
  ncm: string | null;
  serviceCode: string | null;
  status: Situacao;
  version: string;
};

export type UnitOfMeasure = { code: string; name: string; status: Situacao; version: string; items: number; updatedAt: string | null; updatedBy: string | null };

export type ItemCategory = {
  id: string;
  name: string;
  status: Situacao;
  version: string;
  items: number;
  suppliers: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

// ───────────── Sprint 4: propostas, pedidos, projetos, equipamentos e títulos ─────────────

export type TipoLinha = 'EQUIPAMENTO' | 'MATERIAL' | 'SERVICO';

/** Linha comercial: quantidade e preço como texto com ponto; valores em centavos como texto de inteiro. */
export type SalesLine = {
  id: string;
  kind: TipoLinha;
  itemId: string | null;
  itemCode: string | null;
  description: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  discountCents: string;
  grossCents: string;
  totalCents: string;
};

export type ProposalStatus = 'ABERTA' | 'GANHA' | 'PERDIDA';

export type ProposalRevision = {
  id: string;
  revision: number;
  status: 'RASCUNHO' | 'EMITIDA';
  validUntil: string;
  paymentTerms: string | null;
  totalCents: string;
  issuedAt: string | null;
  issuedBy: string | null;
  lines: SalesLine[];
};

export type Proposal = {
  id: string;
  code: string;
  opportunityId: string;
  opportunityCode: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  unitId: string | null;
  unitName: string | null;
  title: string;
  status: ProposalStatus;
  outcomeReason: string | null;
  currentRevision: number;
  revisions: ProposalRevision[];
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ProposalSummary = {
  id: string;
  code: string;
  opportunityCode: string;
  customerCode: string;
  customerName: string;
  unitName: string | null;
  title: string;
  status: ProposalStatus;
  revision: number;
  revisionStatus: 'RASCUNHO' | 'EMITIDA';
  validUntil: string;
  totalCents: string;
  version: string;
};

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'IN_EXECUTION' | 'COMPLETED' | 'CANCELLED';

export type Installment = { seq: number | null; dueDate: string; amountCents: string; milestone: string | null };

export type TitleStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'RENEGOTIATED' | 'CANCELLED';

export type SalesOrder = {
  id: string;
  code: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  unitId: string;
  unitName: string;
  proposalId: string | null;
  proposalCode: string | null;
  proposalRevision: number | null;
  contractDate: string;
  promisedDate: string | null;
  notes: string | null;
  status: OrderStatus;
  totalCents: string;
  scheduledCents: string;
  lines: SalesLine[];
  installments: Installment[];
  confirmedAt: string | null;
  confirmedBy: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectStage: string | null;
  equipment: { id: string; code: string; model: string; serialNumber: string | null; status: string }[];
  titles: { id: string; code: string; label: string; dueDate: string; competence: string; originalCents: string; balanceCents: string; status: TitleStatus }[];
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SalesOrderSummary = {
  id: string;
  code: string;
  customerCode: string;
  customerName: string;
  unitName: string;
  proposalCode: string | null;
  contractDate: string;
  totalCents: string;
  status: OrderStatus;
  version: string;
};

export type ProjectStage = 'PLANEJADO' | 'ENGENHARIA' | 'SUPRIMENTOS' | 'PRODUCAO' | 'INSTALACAO' | 'ACEITO' | 'ENCERRADO';

export type Project = {
  id: string;
  code: string;
  name: string;
  orderId: string;
  orderCode: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  unitId: string;
  unitName: string;
  stage: ProjectStage;
  contractDelivery: string | null;
  contractCents: string;
  equipmentCount: number;
  closedReason: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type Equipment = {
  id: string;
  code: string;
  model: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  itemId: string | null;
  projectId: string;
  projectCode: string;
  orderCode: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  unitId: string;
  unitName: string;
  serialNumber: string | null;
  notes: string | null;
  status: 'ATIVO' | 'CANCELADO';
  acceptedOn: string | null;
  warrantyStart: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type Receivable = {
  id: string;
  code: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  originType: string;
  originId: string;
  origin: string;
  projectId: string | null;
  category: string;
  competence: string;
  issueDate: string;
  dueDate: string;
  originalCents: string;
  receivedCents: string;
  balanceCents: string;
  status: TitleStatus;
  overdue: boolean;
  cancelReason: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
};

/** Título a pagar (Sprint 8): manual (`MANUAL`) ou o DAS da conferência do contador (`TAX_PERIOD`). */
export type Payable = {
  id: string;
  code: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  originType: 'MANUAL' | 'TAX_PERIOD' | string;
  originId: string;
  origin: string;
  projectId: string | null;
  category: string;
  competence: string;
  documentNumber: string | null;
  notes: string | null;
  issueDate: string;
  dueDate: string;
  originalCents: string;
  paidCents: string;
  balanceCents: string;
  status: TitleStatus;
  overdue: boolean;
  cancelReason: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
};

/** Categoria financeira de receita ou despesa (PD-010); o título guarda o `code`. */
export type FinancialCategory = {
  id: string;
  code: string;
  name: string;
  direction: 'RECEITA' | 'DESPESA';
  status: Situacao;
  system: boolean;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SettlementStatus = 'POSTED' | 'REVERSED';

export type Settlement = {
  id: string;
  code: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  accountId: string;
  accountCode: string;
  accountName: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  effectiveDate: string;
  amountCents: string;
  creditCents: string;
  allocations: { titleId: string; titleCode: string; label: string; amountCents: string }[];
  notes: string | null;
  status: SettlementStatus;
  reversalReason: string | null;
  reversalDate: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
};

export type BankAccountKind = 'CAIXA' | 'BANCO';

export type BankAccount = {
  id: string;
  code: string;
  name: string;
  kind: BankAccountKind;
  bank: string | null;
  agency: string | null;
  accountNumber: string | null;
  openingCents: string;
  openingOn: string;
  balanceCents: string;
  movements: number;
  status: Situacao;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CashMovement = {
  id: string;
  effectiveDate: string;
  amountCents: string;
  kind: 'SETTLEMENT' | 'SETTLEMENT_REVERSAL' | 'TRANSFER' | 'TRANSFER_REVERSAL';
  /** Liquidação ou transferência (Sprint 9) que gerou o movimento; `settlementCode` é o código dela (RC, PG ou TR). */
  settlementId: string | null;
  transferId: string | null;
  settlementCode: string;
  description: string;
  balanceCents: string;
  createdAt: string;
  createdBy: string;
};

/** Transferência entre contas próprias (Sprint 9). */
export type Transfer = {
  id: string;
  code: string;
  fromAccountId: string;
  fromAccountCode: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountCode: string;
  toAccountName: string;
  effectiveDate: string;
  amountCents: string;
  notes: string | null;
  status: 'POSTED' | 'REVERSED';
  reversalReason: string | null;
  reversalDate: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
};

export type CashFlowPeriod = 'REALIZADO' | 'CORRENTE' | 'PREVISTO';

export type CashFlowMonth = {
  month: string;
  period: CashFlowPeriod;
  openingCents: string;
  realizedInCents: string;
  realizedOutCents: string;
  overdueInCents: string;
  overdueOutCents: string;
  forecastInCents: string;
  forecastOutCents: string;
  closingCents: string;
};

/** Fluxo de caixa mês a mês: realizado e previsto separados; pendências sem valor (Sprint 9). */
export type CashFlow = {
  today: string;
  from: string;
  to: string;
  accountId: string | null;
  category: string | null;
  months: CashFlowMonth[];
  pendings: { month: string; category: string; reference: string; message: string }[];
};

export type CashFlowColumn = 'OPENING' | 'REALIZED_IN' | 'REALIZED_OUT' | 'OVERDUE_IN' | 'OVERDUE_OUT' | 'FORECAST_IN' | 'FORECAST_OUT';

export type CashFlowLine = {
  targetKind: 'receivable' | 'payable' | 'bank-account';
  targetId: string;
  code: string;
  date: string;
  description: string;
  party: string | null;
  amountCents: string;
};

export type CashFlowComposition = { month: string; column: CashFlowColumn; lines: CashFlowLine[]; totalCents: string };

export type DocumentStatus = 'ATIVO' | 'CANCELADO';
export type DocumentLineKind = 'PRODUTO' | 'SERVICO';
export type OperationNature = 'VENDA_PRODUCAO' | 'VENDA_MERCADORIA' | 'PRESTACAO_SERVICO' | 'REMESSA';

export type DocumentLink = {
  id: string;
  titleId: string;
  titleCode: string | null;
  titleLabel: string | null;
  amountCents: string;
  status: 'ATIVO' | 'DESFEITO';
  removedReason: string | null;
  removedAt: string | null;
  removedBy: string | null;
  createdAt: string;
  createdBy: string;
};

/** Documento fiscal registrado (nota emitida fora do Renda+), com linhas e vínculos às parcelas. */
export type BusinessDocument = {
  id: string;
  code: string;
  direction: 'SAIDA' | 'ENTRADA';
  /** Pelas linhas; MISTO só nas notas registradas antes das notas separadas (Sprint 7). */
  kind: DocumentLineKind | 'MISTO';
  customerId: string;
  customerCode: string;
  customerName: string;
  orderId: string | null;
  orderCode: string | null;
  series: string;
  number: string;
  issueDate: string;
  competence: string;
  totalCents: string;
  linkedCents: string;
  unlinkedCents: string;
  lines: {
    seq: number;
    description: string;
    kind: DocumentLineKind;
    amountCents: string;
    itemId?: string | null;
    annex?: string;
    annexSource?: 'CLASSIFICACAO' | 'EQUIPAMENTO' | 'PADRAO' | 'MIGRACAO';
  }[];
  links: DocumentLink[];
  notes: string | null;
  operationNature: OperationNature | null;
  projectId: string | null;
  projectCode: string | null;
  classificationRevision: number;
  status: DocumentStatus;
  cancelReason: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  authorization?: 'AUTORIZADA' | 'PENDENTE';
  authorizationProtocol?: string | null;
};

/** Faturado e a faturar de uma parcela, com as notas vinculadas. */
export type TitleInvoicing = {
  titleId: string;
  titleCode: string;
  label: string;
  dueDate: string;
  titleStatus: TitleStatus;
  projectId: string | null;
  originalCents: string;
  receivedCents: string;
  balanceCents: string;
  invoicedCents: string;
  toInvoiceCents: string;
  /** Recebido que ainda não tem nota (regime de caixa). */
  toIssueCents: string;
  documents: { documentId: string; documentCode: string; series: string; number: string; issueDate: string; amountCents: string }[];
};

/** Pedido visto pelo caixa: recebido, faturado, a emitir e a nota proposta (linhas e parcelas). */
/** Um tipo da nota no pedido: total das linhas, recebido proporcional, faturado e a emitir. */
export type InvoicingKind = { orderCents: string; receivedCents: string; invoicedCents: string; toIssueCents: string };

export type OrderInvoicing = {
  id: string;
  orderCode: string;
  orderStatus: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  projectId: string | null;
  totalCents: string;
  receivedCents: string;
  invoicedCents: string;
  toIssueCents: string;
  beyondReceivedCents: string;
  /** A emitir de produto e de serviço (o recebido se reparte na proporção do pedido). */
  productCents: string;
  serviceCents: string;
  product: InvoicingKind;
  service: InvoicingKind;
  /** Tipo da nota proposta. */
  kind: DocumentLineKind;
  proposedCents: string;
  parcels: {
    titleId: string; titleCode: string; label: string; dueDate: string; titleStatus: TitleStatus; originalCents: string;
    receivedCents: string; invoicedCents: string; toIssueCents: string; proposedCents: string;
  }[];
  lines: { seq: number; description: string; kind: DocumentLineKind; amountCents: string }[];
};

// ───────────── Fiscal (Sprints 7 e 12) ─────────────

export type TaxPeriodStatus = 'EM_APURACAO' | 'ENCERRADA';
export type Annex = 'I' | 'II' | 'III' | 'IV' | 'V';

/** Guia DAS (valor declarado no PGDAS-D) com o título a pagar. */
export type TaxGuide = {
  id: string;
  seq: number;
  documentNumber: string | null;
  principalCents: string;
  fineCents: string;
  interestCents: string;
  totalCents: string;
  dueDate: string;
  notes: string | null;
  titleId: string | null;
  titleCode: string | null;
  titleStatus: string | null;
  titleBalanceCents: string | null;
  status: 'ABERTO' | 'PAGO' | 'SUBSTITUIDA';
  paidOn: string | null;
  createdAt: string;
  createdBy: string;
};

/** Linha do Histórico de competências. */
export type TaxPeriodSummary = {
  competence: string;
  status: TaxPeriodStatus;
  version: string;
  revenueCents: string;
  revenueKnown: boolean;
  rbt12Cents: string | null;
  effectiveRate: string | null;
  calculatedCents: string | null;
  calculationStored: boolean;
  guide: TaxGuide | null;
};

export type TaxBracket = { upToCents: string; rate: string; deductionCents: string; shares: string[] };
export type TaxAnnexTable = { annex: Annex; label: string; taxes: string[]; brackets: TaxBracket[] };

/** Revisão dos parâmetros do Simples Nacional por anexo; alíquotas e repartição como fração ("0.078"). */
export type TaxParameters = {
  id: string;
  revision: number;
  regime: 'SIMPLES_NACIONAL';
  validFrom: string;
  annexes: TaxAnnexTable[];
  source: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
};

/** Resultado de um anexo na memória do cálculo. */
export type TaxAnnexResult = {
  annex: Annex;
  label: string;
  bracket: number;
  nominalRate: string;
  deductionCents: string;
  effectiveRate: string;
  revenueCents: string;
  taxCents: string;
  issExcessCents: string;
  taxes: { tax: string; share: string; cents: string }[];
};

/** Memória do cálculo (gravada com o cálculo ou da prévia). */
export type TaxMemory = {
  competence: string;
  parameterRevision: number | null;
  parameterSource?: string | null;
  rbt12Cents: string | null;
  rbt12Origin: 'CALCULADO' | 'INFORMADO' | null;
  rbt12Months?: { competence: string; cents: string; origin: string }[];
  rbt12Missing?: string[];
  revenue?: Record<string, string>;
  revenueCents?: string;
  totalTaxCents?: string | null;
  reasons: string[];
  warnings: string[];
  annexes?: TaxAnnexResult[];
  taxes?: Record<string, string>;
};

export type TaxCalculation = {
  source: 'GRAVADO' | 'PREVIA';
  seq: number | null;
  result: 'CALCULADA' | 'NAO_CALCULAVEL';
  parameterRevision: number | null;
  rbt12Cents: string | null;
  rbt12Origin: 'CALCULADO' | 'INFORMADO' | null;
  revenueCents: string;
  totalTaxCents: string | null;
  memory: TaxMemory;
  createdAt: string | null;
  createdBy: string | null;
};

export type TaxDocumentPart = {
  documentId: string;
  code: string;
  kind: 'PRODUTO' | 'SERVICO' | 'MISTO';
  series: string;
  number: string;
  issueDate: string;
  customerCode: string;
  customerName: string;
  orderCode: string | null;
  description: string;
  annex: Annex;
  cents: string;
  defaultLines: number;
  authorization: 'AUTORIZADA' | 'PENDENTE';
  version: string;
};

export type TaxStep = {
  code: string;
  name: string;
  responsible: string;
  automatic: boolean;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  detail: string | null;
};

export type TaxClosure = { action: 'FECHAMENTO' | 'REABERTURA'; reason: string | null; revenueCents: string | null; occurredAt: string; actor: string };

/** Apuração da competência. */
export type TaxPeriod = {
  competence: string;
  status: TaxPeriodStatus;
  version: string;
  revenueCents: string;
  revenueByAnnex: Record<string, string>;
  documentCount: number;
  documents: TaxDocumentPart[];
  rbt12: {
    calculatedCents: string | null;
    informedCents: string | null;
    informedBy: string | null;
    informedNotes: string | null;
    usedCents: string | null;
    usedOrigin: 'CALCULADO' | 'INFORMADO' | null;
    missing: string[];
    months: { competence: string; cents: string; origin: 'HISTORICO' | 'NOTAS' }[];
  };
  parameters: TaxParameters | null;
  calculation: TaxCalculation;
  simulations: { id: string; seq: number; result: 'CALCULADA' | 'NAO_CALCULAVEL'; parameterRevision: number | null; rbt12Cents: string | null; rbt12Origin: string | null; revenueCents: string; totalTaxCents: string | null; createdAt: string; createdBy: string }[];
  guides: TaxGuide[];
  declarations: { id: string; seq: number; transmittedOn: string; receiptNumber: string; declaredRevenueCents: string; notes: string | null; createdAt: string; createdBy: string }[];
  steps: TaxStep[];
  closures: TaxClosure[];
  rbt12Months: { competence: string; revenueCents: string | null; rbt12Cents: string | null; bracket: number | null; effectiveRate: string | null }[];
  dasDueDate: string;
  differenceCents: string | null;
  yearToDateCents: string;
  limits: { annualLimitCents: string; sublimitCents: string; tolerance: string; alertThreshold: string };
  alerts: string[];
};

export type TaxObligationStatus = 'A_ENTREGAR' | 'EM_PREPARACAO' | 'EM_APURACAO' | 'ABERTO' | 'DECISAO_PENDENTE' | 'ENTREGUE' | 'PAGO';

export type TaxObligation = {
  id: string;
  code: string;
  templateCode: string | null;
  name: string;
  competence: string;
  dueDate: string;
  sphere: 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL';
  kind: 'DECLARACAO' | 'GUIA';
  responsible: string;
  detail: string | null;
  status: TaxObligationStatus;
  deliveredOn: string | null;
  receiptNumber: string | null;
  notes: string | null;
  daysToDue: number;
  late: boolean;
  dueThisWeek: boolean;
  linked: boolean;
  version: string;
  updatedAt: string;
  updatedBy: string;
};

export type FiscalDashboard = {
  competence: string;
  status: TaxPeriodStatus;
  dasCents: string | null;
  effectiveRate: string | null;
  dasDueDate: string;
  rbt12Cents: string | null;
  bracket: number | null;
  yearToDateCents: string;
  sublimitCents: string;
  limitCents: string;
  nextWeek: TaxObligation[];
  upcoming: TaxObligation[];
  series: { competence: string; revenueCents: string; rbt12Cents: string | null; dasByAnnex: Record<string, string | null>; dasCents: string | null }[];
  taxes: Record<string, string>;
  guides: { competence: string; dueDate: string; totalCents: string | null; status: 'ABERTO' | 'PAGO' | 'SUBSTITUIDA' | 'SEM_GUIA'; paidOn: string | null }[];
  stepsDone: number;
  stepsTotal: number;
  alerts: string[];
  ibsCbsChoice: 'DENTRO_DAS' | 'FORA_DAS' | null;
  daysToIbsDeadline: number;
  period: TaxPeriod;
};

export type ItemFiscalStatus = 'SEM_CLASSIFICACAO' | 'REVISAR' | 'CLASSIFICADO';

export type ItemFiscalProfile = {
  itemId: string;
  code: string;
  description: string;
  nature: 'MATERIAL' | 'SERVICO';
  type: 'PRODUTO' | 'MATERIAL' | 'SERVICO';
  category: string;
  ncm: string | null;
  serviceCode: string | null;
  cfopInternal: string | null;
  cfopInterstate: string | null;
  csosn: string | null;
  origin: string | null;
  annex: Annex | 'INSUMO' | null;
  activityId: string | null;
  activityName: string | null;
  nbs: string | null;
  issRetention: 'SIM' | 'NAO' | 'CONFORME_MUNICIPIO' | null;
  review: boolean;
  reviewNote: string | null;
  status: ItemFiscalStatus;
  reasons: string[];
  version: string;
};

export type TaxActivity = {
  id: string;
  position: number;
  name: string;
  framing: string;
  annex: Annex;
  annexLabel: string;
  taxes: string;
  status: 'ATIVO' | 'INATIVO';
  items: number;
  version: string;
};

export type TaxIbsCbsOption = {
  id: string;
  period: string;
  choice: 'DENTRO_DAS' | 'FORA_DAS';
  deadline: string;
  withdrawalUntil: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
};

export type TaxSetup = {
  profile: {
    regime: 'SIMPLES_NACIONAL';
    optedSince: string | null;
    cnaeMain: string | null;
    cnaeSecondary: string | null;
    revenueRecognition: 'COMPETENCIA';
    nfseIssuer: string | null;
    annualLimitCents: string;
    sublimitCents: string;
    tolerance: string;
    alertThreshold: string;
    version: string;
    updatedAt: string;
    updatedBy: string;
  };
  activities: TaxActivity[];
  ibsCbs: { period: string; deadline: string; validFrom: string; validTo: string; withdrawalUntil: string; current: TaxIbsCbsOption | null; history: TaxIbsCbsOption[] };
  revenueStart: string;
};

export type TaxRevenueHistory = {
  competence: string;
  annexICents: string;
  annexIICents: string;
  annexIIICents: string;
  annexIVCents: string;
  annexVCents: string;
  totalCents: string;
  source: 'DIGITADO' | 'ARQUIVO';
  informedBy: string;
  notes: string | null;
  version: string;
  updatedAt: string;
  updatedBy: string;
};

export type TaxRevenueImport = {
  fileName: string | null;
  hash: string;
  alreadyLoaded: boolean;
  confirmed: boolean;
  months: number;
  lines: { line: number; competence: string; annexes: Record<string, string>; totalCents: string; problem: string | null; warning: string | null }[];
  problems: string[];
};

// ───────────── Engenharia: modelos, BOM e custo planejado (Sprint 10) ─────────────

export type EquipmentModel = {
  id: string;
  code: string;
  name: string;
  status: 'ATIVO' | 'INATIVO';
  equipmentCount: number;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type BomSummary = {
  id: string;
  code: string;
  name: string;
  modelId: string | null;
  modelCode: string | null;
  modelName: string | null;
  totalCents: string;
  pending: number;
  lineCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type BomLine = {
  id: string;
  position: number;
  kind: 'ITEM' | 'SUBASSEMBLY';
  itemId: string | null;
  itemCode: string | null;
  itemActive: boolean;
  childBomId: string | null;
  childBomCode: string | null;
  childBomName: string | null;
  referenceCode: string | null;
  description: string;
  quantity: string | null;
  uom: string;
  unitCost: string | null;
  lineCents: string | null;
  pending: number;
  category: string | null;
  supplier: string | null;
  material: string | null;
  notes: string | null;
  itemReferenceCost: string | null;
};

export type BomProblem = { severity: 'BLOCKING' | 'WARNING' | 'INFO'; position: number | null; message: string };

/** Nó da árvore de submontagens: o total é de uma unidade; `quantity` é a da linha no nó de cima (vazia na raiz). */
export type BomTreeNode = {
  bomId: string;
  code: string;
  name: string;
  quantity: string | null;
  totalCents: string;
  pending: number;
  itemLines: number;
  children: BomTreeNode[];
};

export type Bom = {
  id: string;
  code: string;
  name: string;
  modelId: string | null;
  modelCode: string | null;
  modelName: string | null;
  informedTotalCents: string | null;
  notes: string | null;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  totalCents: string;
  pending: number;
  lines: BomLine[];
  categories: { category: string; cents: string; lines: number }[];
  problems: BomProblem[];
  usedBy: { bomId: string; bomCode: string; bomName: string }[];
  tree: BomTreeNode;
};

export type BomLineRequest = {
  kind: 'ITEM' | 'SUBASSEMBLY';
  itemId?: string | null;
  childBomId?: string | null;
  referenceCode?: string | null;
  description?: string | null;
  quantity?: string | null;
  uom?: string | null;
  unitCost?: string | null;
  category?: string | null;
  supplier?: string | null;
  material?: string | null;
  notes?: string | null;
};

export type BomImport = {
  id: string;
  fileName: string;
  status: 'PREVIEW' | 'CONFIRMED';
  product: string;
  revisionLabel: string | null;
  revisionDate: string | null;
  lineCount: number;
  totalCents: string;
  pending: number;
  informedTotalCents: string | null;
  groups: { name: string; parent: string; lines: number; totalCents: string; pending: number; informedCents: string | null }[];
  problems: BomProblem[];
  newItems: number;
  existingItems: number;
  newUnits: string[];
  newCategories: string[];
  fileNotes: string[];
  lines: {
    group: string;
    category: string;
    sourceNo: number;
    referenceCode: string | null;
    generatedCode: boolean;
    description: string;
    quantity: string | null;
    uom: string;
    unitCost: string | null;
    lineCents: string | null;
    itemCode: string | null;
    newItem: boolean;
    supplier: string | null;
    material: string | null;
  }[];
  bomId: string | null;
  createdAt: string;
  createdBy: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

export type EquipmentRef = {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  active: boolean;
};

export type EquipmentBomLine = {
  id: string;
  parentId: string | null;
  depth: number;
  position: number;
  kind: 'ITEM' | 'SUBASSEMBLY';
  itemId: string | null;
  itemCode: string | null;
  childRevisionId: string | null;
  referenceCode: string | null;
  description: string;
  quantity: string | null;
  uom: string;
  unitCost: string | null;
  lineCents: string | null;
  category: string | null;
  supplier: string | null;
  material: string | null;
  notes: string | null;
  origin: 'MODEL' | 'ADJUSTMENT';
  modelQuantity: string | null;
  modelUnitCost: string | null;
  status: 'ACTIVE' | 'REMOVED';
  state: 'MODEL' | 'CHANGED' | 'ADDED' | 'REMOVED';
  adjustmentReason: string | null;
};

export type EquipmentBom = {
  equipment: EquipmentRef;
  applied: boolean;
  id: string | null;
  bomId: string | null;
  bomCode: string | null;
  bomName: string | null;
  version: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  totalCents: string | null;
  pending: number;
  modelTotalCents: string | null;
  modelChanged: boolean;
  added: number;
  removed: number;
  changed: number;
  lines: EquipmentBomLine[];
};

export type PlannedCost = {
  projectId: string;
  projectCode: string;
  projectName: string;
  stage: string;
  contractCents: string;
  plannedCostCents: string;
  complete: boolean;
  withoutBom: number;
  marginCents: string | null;
  marginRate: string | null;
  equipment: {
    equipment: EquipmentRef;
    applied: boolean;
    bomId: string | null;
    bomName: string | null;
    costCents: string | null;
    pending: number;
    adjusted: boolean;
  }[];
};

// ───────────── CRM (Sprint 11) ─────────────

export type LeadStage = 'IDENTIFICADO' | 'CONTATADO' | 'INTERESSADO' | 'DESCARTADO';
export type HasRenda = 'SIM' | 'NAO' | 'DESCONHECIDO';
export type CrmSource = 'INDICACAO' | 'FEIRA' | 'SITE' | 'LISTA' | 'PROSPECCAO_ATIVA' | 'CLIENTE_ATUAL' | 'OUTRO';

export type Lead = {
  id: string;
  code: string;
  companyName: string;
  tradeName: string | null;
  city: string | null;
  state: string | null;
  hasRenda: HasRenda;
  rating: number | null;
  stage: LeadStage;
  discardReason: string | null;
  owner: string;
  source: CrmSource;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  nextActionDate: string | null;
  nextActionNote: string | null;
  lastInteraction: string | null;
  openOpportunities: number;
  imported: boolean;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type InteractionKind = 'LIGACAO' | 'EMAIL' | 'WHATSAPP' | 'VISITA' | 'REUNIAO' | 'NOTA';

export type Interaction = {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  kind: InteractionKind;
  occurredOn: string;
  contactName: string | null;
  summary: string;
  nextActionDate: string | null;
  nextActionNote: string | null;
  createdAt: string;
  createdBy: string;
};

export type OpportunityStatus = 'ABERTA' | 'GANHA' | 'PERDIDA';
export type LossReason = 'PRECO' | 'PRAZO' | 'CONCORRENTE' | 'SEM_ORCAMENTO' | 'DESISTIU' | 'OUTRO';
export type Competitor = { name: string; threat: 'BAIXA' | 'MEDIA' | 'ALTA'; notes: string | null };

export type Opportunity = {
  id: string;
  code: string;
  name: string;
  leadId: string | null;
  leadCode: string | null;
  leadName: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  unitId: string | null;
  unitName: string | null;
  owner: string;
  source: CrmSource;
  interest: 'BAIXO' | 'MEDIO' | 'ALTO';
  potentialCents: string;
  weightedCents: string;
  closePercent: string;
  expectedClose: string | null;
  stage: string;
  stageName: string;
  status: OpportunityStatus;
  lossReason: LossReason | null;
  lossNote: string | null;
  closedAt: string | null;
  wonOrderCode: string | null;
  nextActionDate: string | null;
  nextActionNote: string | null;
  lastInteraction: string | null;
  notes: string | null;
  competitors: Competitor[];
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type OpportunityStage = {
  code: string;
  name: string;
  position: number;
  closePercent: string;
  version: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type OpportunityStageChange = {
  id: string;
  fromStage: string | null;
  toStage: string;
  toStageName: string;
  status: OpportunityStatus;
  closePercent: string;
  potentialCents: string;
  weightedCents: string;
  changedAt: string;
  changedBy: string;
};

export type AgendaItem = {
  bucket: 'SEM_ACAO' | 'VENCIDA' | 'HOJE' | 'SEMANA' | 'DEPOIS';
  kind: 'PROSPECCAO' | 'OPORTUNIDADE';
  id: string;
  code: string;
  name: string;
  party: string | null;
  owner: string;
  stage: string;
  nextActionDate: string | null;
  nextActionNote: string | null;
};

export type FunnelClosed = { count: number; potentialCents: string };

export type Funnel = {
  from: string;
  to: string;
  stages: { code: string; name: string; closePercent: string; count: number; potentialCents: string; weightedCents: string }[];
  openCount: number;
  openPotentialCents: string;
  openWeightedCents: string;
  won: FunnelClosed;
  lost: FunnelClosed;
  lostByReason: Partial<Record<LossReason, FunnelClosed>>;
  conversion: { code: string; name: string; entered: number; advanced: number; rate: string | null }[];
};

export type CrmOwner = { username: string; displayName: string };

export type LeadImportLine = {
  line: number;
  companyName: string | null;
  tradeName: string | null;
  city: string | null;
  state: string | null;
  hasRenda: HasRenda | null;
  rating: number | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  blocked: boolean;
};

export type LeadImport = {
  id: string;
  fileName: string;
  status: 'PREVIA' | 'CONFIRMADA';
  source: string | null;
  lineCount: number;
  toLoad: number;
  blocked: number;
  warnings: number;
  lines: LeadImportLine[];
  problems: { severity: 'ERRO' | 'AVISO'; line: number; message: string }[];
  createdCodes: string[];
  createdAt: string;
  createdBy: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

// ───────────── Sprint 13: cadastros pelo mock ─────────────

export type PapelParceiro = 'CLIENTE' | 'FORNECEDOR' | 'TRANSPORTADORA';
export type TipoEndereco = 'COBRANCA' | 'ENTREGA' | 'UNIDADE' | 'FATURAMENTO';
export type PerfilValor = string | number | boolean;

export type PartnerUnit = CustomerUnit & { kind: TipoEndereco; isDefault: boolean };
export type PartnerContact = CustomerContact & { primary: boolean; receivesInvoices: boolean };

/** Parceiro como a rota do papel devolve (clientes, fornecedores ou transportadoras): `status` é o do papel da rota. */
export type Partner = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  cnpjFormatted: string | null;
  group: string | null;
  status: Situacao;
  customer: boolean;
  supplier: boolean;
  carrier: boolean;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  suppliedCategories: CategoryRef[];
  units: PartnerUnit[];
  contacts: PartnerContact[];
  profile: Record<string, PerfilValor>;
  version: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Indicadores da ficha do parceiro (GET /cadastros/partners/{id}/summary); nulo = módulo ainda sem dados. */
export type PartnerFichaSummary = {
  openReceivableCents: number;
  openPayableCents: number;
  openOrdersCents: number;
  equipmentCount: number;
  openOpportunities: number;
  creditUsedCents: number;
  purchaseOrdersCents: number | null;
  pendingReceiptsCents: number | null;
  openQuotations: number | null;
  freightsYear: number | null;
  inTransit: number | null;
  occurrences: number | null;
};

export type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  costCenter: string | null;
  admissionDate: string | null;
  email: string | null;
  phone: string | null;
  status: Situacao;
  version: string;
};
