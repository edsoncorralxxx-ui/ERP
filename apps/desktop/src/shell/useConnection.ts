import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ServerStatus } from '../api/types';

export type Connection =
  | { state: 'checking' }
  | { state: 'online'; status: ServerStatus; checkedAt: Date }
  | { state: 'offline'; checkedAt: Date };

/** Consulta periódica do estado do servidor para o rodapé. */
export function useConnection(intervalMs = 10_000): Connection {
  const [conn, setConn] = useState<Connection>({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const { data } = await api.get<ServerStatus>('/api/v1/status');
        if (alive) setConn({ state: 'online', status: data, checkedAt: new Date() });
      } catch {
        if (alive) setConn({ state: 'offline', checkedAt: new Date() });
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
