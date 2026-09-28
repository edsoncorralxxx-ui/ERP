export type ServerStatus = {
  status: 'UP' | 'DEGRADED';
  apiVersion: string;
  serverVersion: string;
  database: 'UP' | 'DOWN';
  serverTime: string;
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
  kind: 'SETTLEMENT' | 'SETTLEMENT_REVERSAL';
  settlementId: string;
  settlementCode: string;
  description: string;
  balanceCents: string;
  createdAt: string;
  createdBy: string;
};
