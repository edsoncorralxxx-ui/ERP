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
