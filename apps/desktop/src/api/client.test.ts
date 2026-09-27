import { api, ApiError, setTransport } from './client';

describe('cliente da API', () => {
  it('envia correlação e If-Match e devolve ETag', async () => {
    const calls: unknown[] = [];
    setTransport(async (req) => {
      calls.push(req);
      return { status: 200, headers: { ETag: '"2"' }, body: '{"version":"2"}' };
    });
    const r = await api.put<{ version: string }>('/api/v1/company-profile', { a: 1 }, '"1"');
    expect(r.data.version).toBe('2');
    expect(r.etag).toBe('"2"');
    const sent = calls[0] as { headers: Record<string, string>; body: string };
    expect(sent.headers['If-Match']).toBe('"1"');
    expect(sent.headers['X-Correlation-Id']).toBeTruthy();
    expect(JSON.parse(sent.body)).toEqual({ a: 1 });
  });

  it('converte o erro padronizado do servidor', async () => {
    setTransport(async () => ({
      status: 412,
      headers: {},
      body: JSON.stringify({ code: 'VERSION_MISMATCH', message: 'Alterado', details: [{ field: 'version', message: 'atual=3' }], correlationId: 'abc12345' }),
    }));
    const err = await api.get('/api/v1/x').catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 412, code: 'VERSION_MISMATCH', correlationId: 'abc12345', isConflict: true });
  });

  it('falha de rede vira NETWORK_UNAVAILABLE', async () => {
    setTransport(async () => {
      throw new TypeError('fetch failed');
    });
    const err = (await api.get('/api/v1/x').catch((e) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(err.message).toContain('Sem conexão');
  });

  it('proxy sem servidor (502/503/504) também é indisponibilidade', async () => {
    setTransport(async () => ({ status: 502, headers: {}, body: '' }));
    const err = (await api.get('/api/v1/x').catch((e) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
  });
});
