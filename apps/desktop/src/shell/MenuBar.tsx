import { useEffect, useRef, useState } from 'react';
import type { AppWindow } from '../windows/windowManager';

type Props = {
  windows: AppWindow[];
  activeId: string | null;
  onOpenCompany: () => void;
  onOpenStatus: () => void;
  onCloseActive: () => void;
  onSaveActive: () => void;
  canSave: boolean;
  onCascade: () => void;
  onTile: () => void;
  onFocus: (id: string) => void;
  onToggleSidebar: () => void;
};

type Item = { label: string; shortcut?: string; disabled?: boolean; checked?: boolean; action: () => void } | 'separator';

/** Menus superiores: somente comandos implementados. */
export function MenuBar(p: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const menus: Record<string, Item[]> = {
    Arquivo: [
      { label: 'Salvar', shortcut: '⌘S', disabled: !p.canSave, action: p.onSaveActive },
      { label: 'Fechar janela', disabled: !p.activeId, action: p.onCloseActive },
    ],
    Exibir: [{ label: 'Painel de módulos', action: p.onToggleSidebar }],
    Módulos: [
      { label: 'Dados da empresa', action: p.onOpenCompany },
      { label: 'Status do servidor', action: p.onOpenStatus },
    ],
    Janelas: [
      { label: 'Cascata', disabled: p.windows.length === 0, action: p.onCascade },
      { label: 'Lado a lado', disabled: p.windows.length === 0, action: p.onTile },
      ...(p.windows.length ? (['separator'] as Item[]) : []),
      ...p.windows.map<Item>((w) => ({
        label: `${w.title}${w.mode === 'minimized' ? ' (minimizada)' : ''}`,
        checked: w.id === p.activeId,
        action: () => p.onFocus(w.id),
      })),
    ],
    Ajuda: [{ label: 'Sobre o Renda+ ERP', action: p.onOpenStatus }],
  };

  return (
    <nav className="rp-menubar" ref={ref} aria-label="Menu principal">
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className="rp-menubar__menu">
          <button
            type="button"
            className={`rp-menubar__button${open === name ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === name}
            onClick={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <ul className="rp-menubar__list" role="menu">
              {items.map((it, i) =>
                it === 'separator' ? (
                  <li key={`s${i}`} className="rp-menubar__sep" role="separator" />
                ) : (
                  <li key={it.label} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(null);
                        it.action();
                      }}
                    >
                      <span className="rp-menubar__check">{it.checked ? '✓' : ''}</span>
                      <span>{it.label}</span>
                      {it.shortcut && <span className="rp-menubar__shortcut">{it.shortcut}</span>}
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
