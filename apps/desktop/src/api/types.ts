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
