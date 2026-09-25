/**
 * Cliente da API do servidor Renda+.
 * No Electron usa a ponte `window.renda` (a rede fica no processo principal); no navegador de desenvolvimento
 * usa fetch relativo com o proxy do Vite.
 */

export type TransportRequest = { method: string; path: string; headers?: Record<string, string>; body?: string };
export type TransportResponse = { status: number; headers: Record<string, string>; body: string };
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

declare global {
  interface Window {
    renda?: {
      request: Transport;
      info: () => Promise<{ version: string; serverUrl: string; platform: string }>;
    };
  }
}

export type ApiErrorDetail = { field: string | null; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isConflict(): boolean {
    return this.status === 412;
  }
}

/**
 * Transporte do navegador de desenvolvimento (sem Electron): imita a ponte do processo principal, guardando o token
 * da sessão só na memória desta página e tirando-o da resposta do login antes de entregá-la ao resto do app.
 */
let browserToken: string | null = null;

const fetchTransport: Transport = async (req) => {
  const headers: Record<string, string> = { ...req.headers };
  if (browserToken) headers['Authorization'] = `Bearer ${browserToken}`;
  const res = await fetch(req.path, { method: req.method, headers, body: req.body });
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
  let body = await res.text();
  const isSession = req.path === '/api/v1/session' || req.path.startsWith('/api/v1/session?');
  if (isSession && req.method === 'POST' && res.ok) {
    const parsed = JSON.parse(body) as { token?: string };
    browserToken = parsed.token ?? null;
    delete parsed.token;
    body = JSON.stringify(parsed);
  } else if ((isSession && req.method === 'DELETE') || res.status === 401) {
    browserToken = null;
  }
  return { status: res.status, headers: out, body };
};

let transport: Transport = (req) => (window.renda ? window.renda.request(req) : fetchTransport(req));

/** Permite substituir o transporte nos testes. */
export function setTransport(t: Transport): void {
  transport = t;
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export type ApiResult<T> = { data: T; etag?: string; correlationId?: string };

/** Avisado quando uma chamada autenticada recebe 401 (sessão expirada ou revogada): o app mostra o login por cima. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

async function send<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<ApiResult<T>> {
  const correlationId = newCorrelationId();
  const headers: Record<string, string> = { 'X-Correlation-Id': correlationId, ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: TransportResponse;
  try {
    res = await transport({ method, path, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK_UNAVAILABLE', 'Sem conexão com o servidor.', [], correlationId);
  }
  const headerMap = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const parsed = res.body ? safeJson(res.body) : undefined;
  if (res.status >= 200 && res.status < 300) {
    return { data: parsed as T, etag: headerMap['etag'], correlationId: headerMap['x-correlation-id'] ?? correlationId };
  }
  const err = (parsed ?? {}) as { code?: string; message?: string; details?: ApiErrorDetail[]; correlationId?: string };
  if (res.status === 401 && err.code === 'UNAUTHENTICATED') onUnauthorized?.();
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiError(0, 'NETWORK_UNAVAILABLE', 'Servidor indisponível no momento.', [], correlationId);
  }
  throw new ApiError(
    res.status,
    err.code ?? `HTTP_${res.status}`,
    err.message ?? 'Não foi possível concluir a operação.',
    err.details ?? [],
    err.correlationId ?? headerMap['x-correlation-id'] ?? correlationId,
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string) => send<T>('GET', path),
  put: <T>(path: string, body: unknown, ifMatch: string) => send<T>('PUT', path, body, { 'If-Match': ifMatch }),
  post: <T>(path: string, body: unknown, headers: Record<string, string> = {}) => send<T>('POST', path, body, headers),
  del: <T>(path: string) => send<T>('DELETE', path),
};
