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
