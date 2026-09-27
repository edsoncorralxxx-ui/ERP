import { createContext, useContext } from 'react';
import type { StatusMessage } from '../shell/StatusBar';
import type { WindowKind } from './windowManager';

/** Operações que uma janela oferece ao shell (barra de ferramentas, Cmd+S, fechar com alterações). */
export type WindowCommands = {
  save?: () => Promise<boolean>;
  /** Ferramenta "Novo" da barra superior, quando a janela ativa sabe criar um registro. */
  novo?: () => void;
};

export type WindowApi = {
  windowId: string;
  setDirty: (dirty: boolean) => void;
  setTitle?: (title: string) => void;
  registerCommands: (commands: WindowCommands) => void;
  /** Mensagem na linha de status do aplicativo (padrão do design system para sucesso e erro). */
  notify: (message: StatusMessage) => void;
  requestClose: () => void;
  /** Abre (ou traz à frente) outra janela: é o destino das setas de link. */
  open: (kind: WindowKind, recordKey?: string) => void;
};

export const WindowContext = createContext<WindowApi | null>(null);

export function useWindow(): WindowApi {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error('useWindow fora de uma janela');
  return ctx;
}
