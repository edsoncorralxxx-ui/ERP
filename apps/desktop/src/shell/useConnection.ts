import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ServerStatus } from '../api/types';

/** Uma verificação do servidor: quando, se respondeu e em quanto tempo. */
export type Check = { at: Date; ok: boolean; ms: number };

export type Connection = (
  | { state: 'checking' }
  | { state: 'online'; status: ServerStatus; checkedAt: Date }
  | { state: 'offline'; checkedAt: Date }
) & { history: Check[] };

const MAX_HISTORY = 24;

/** Consulta periódica do estado do servidor para o rodapé e o cockpit, guardando as últimas verificações da sessão. */
export function useConnection(intervalMs = 10_000): Connection {
  const [conn, setConn] = useState<Connection>({ state: 'checking', history: [] });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const start = performance.now();
      try {
        const { data } = await api.get<ServerStatus>('/api/v1/status');
        const at = new Date();
        const ms = Math.round(performance.now() - start);
        if (alive) setConn((c) => ({ state: 'online', status: data, checkedAt: at, history: [...c.history, { at, ok: true, ms }].slice(-MAX_HISTORY) }));
      } catch {
        const at = new Date();
        if (alive) setConn((c) => ({ state: 'offline', checkedAt: at, history: [...c.history, { at, ok: false, ms: 0 }].slice(-MAX_HISTORY) }));
      }
    };
    void check();
    const t = setInterval(check, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return conn;
}
