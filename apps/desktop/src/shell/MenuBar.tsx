import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AppWindow, WindowKind } from '../windows/windowManager';

type Props = {
  windows: AppWindow[];
  activeId: string | null;
  canSave: boolean;
  onSaveActive: () => void;
  onCloseActive: () => void;
  onOpen: (kind: WindowKind) => void;
  onLock: () => void;
  onSignOut: () => void;
  onCascade: () => void;
  onTile: () => void;
  onFocus: (id: string) => void;
  onToggleDrawer: () => void;
};

type Item = { label: string; kbd?: string; disabled?: boolean; selected?: boolean; action?: () => void } | 'sep';

const PROXIMAS = [{ label: 'Disponível nas próximas sprints', disabled: true }] as Item[];

/** Barra de menus do design system (ordem fixa, letra de acesso sublinhada). Os botões da janela ficam com o macOS. */
export function MenuBar(p: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const menus: { id: string; label: ReactNode; items: Item[] }[] = [
    {
      id: 'arquivo',
      label: (<><u>A</u>rquivo</>),
      items: [
        { label: 'Atualizar', kbd: '⌘S', disabled: !p.canSave, action: p.onSaveActive },
        { label: 'Fechar janela', kbd: 'Esc', disabled: !p.activeId, action: p.onCloseActive },
        'sep',
        { label: 'Trocar senha', action: () => p.onOpen('password') },
        { label: 'Bloquear tela', action: p.onLock },
        { label: 'Encerrar sessão', action: p.onSignOut },
        { label: 'Sair', action: () => void api.del('/api/v1/session').catch(() => undefined).finally(() => window.close()) },
      ],
    },
    { id: 'editar', label: (<><u>E</u>ditar</>), items: PROXIMAS },
    { id: 'exibir', label: (<><u>V</u>isualizar</>), items: [{ label: 'Menu lateral', action: p.onToggleDrawer }] },
    { id: 'dados', label: (<><u>D</u>ados</>), items: PROXIMAS },
    { id: 'irpara', label: (<><u>I</u>r para</>), items: PROXIMAS },
    {
      id: 'modulos',
      label: (<><u>M</u>ódulos</>),
      items: [
        { label: 'Meu cockpit', action: () => p.onOpen('cockpit') },
        'sep',
        { label: 'Clientes e unidades', action: () => p.onOpen('customers') },
        'sep',
        { label: 'Dados da empresa', action: () => p.onOpen('company-profile') },
        { label: 'Status do servidor', action: () => p.onOpen('server-status') },
      ],
    },
    { id: 'ferramentas', label: (<><u>F</u>erramentas</>), items: PROXIMAS },
    {
      id: 'janela',
      label: (<><u>J</u>anela</>),
      items: [
        { label: 'Cascata', disabled: p.windows.length === 0, action: p.onCascade },
        { label: 'Lado a lado', disabled: p.windows.length === 0, action: p.onTile },
        ...(p.windows.length ? (['sep'] as Item[]) : []),
        ...p.windows.map<Item>((w) => ({
          label: w.mode === 'minimized' ? `${w.title} (minimizada)` : w.title,
          selected: w.id === p.activeId,
          action: () => p.onFocus(w.id),
        })),
      ],
    },
    { id: 'ajuda', label: (<>Aj<u>u</u>da</>), items: [{ label: 'Sobre o Renda+ ERP', action: () => p.onOpen('server-status') }] },
  ];

  return (
    <div className="rp-menubar" ref={ref}>
      <div role="menubar" aria-label="Menu principal">
        {menus.map((m) => (
          <span
            key={m.id}
            role="menuitem"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            data-menu={m.id}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && (e.preventDefault(), setOpen(m.id))}
          >
            {m.label}
            {open === m.id && (
              <div className="rp-menu rp-menu--suspenso" role="menu" onClick={(e) => e.stopPropagation()}>
                {m.items.map((it, i) =>
                  it === 'sep' ? (
                    <div key={`s${i}`} className="rp-menu-sep" role="separator" />
                  ) : (
                    <div
                      key={it.label}
                      className="rp-menu-item"
                      role="menuitem"
                      tabIndex={it.disabled ? -1 : 0}
                      aria-disabled={it.disabled || undefined}
                      aria-selected={it.selected || undefined}
                      onClick={() => {
                        if (it.disabled) return;
                        setOpen(null);
                        it.action?.();
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !it.disabled && (setOpen(null), it.action?.())}
                    >
                      {it.label}
                      {it.kbd && <kbd>{it.kbd}</kbd>}
                    </div>
                  ),
                )}
              </div>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
