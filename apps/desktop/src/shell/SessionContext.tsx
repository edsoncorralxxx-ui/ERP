import { createContext, useContext } from 'react';
import type { SessionUser } from '../api/types';

/** Usuário da sessão e o que o perfil dele permite. O servidor confere de novo em cada operação. */
export type Session = { user: SessionUser; can: (permission: string) => boolean };

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession fora de uma sessão');
  return s;
}

export function sessionOf(user: SessionUser): Session {
  const set = new Set(user.permissions);
  return { user, can: (p) => set.has(p) };
}
