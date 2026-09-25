import { useState, type KeyboardEvent } from 'react';
import type { WindowKind } from '../windows/windowManager';
import { MODULES, ROUTES, subIcon } from './modules';

export type RailView = 'modulos' | 'relacionar';

type RailProps = {
  view: RailView;
  open: boolean;
  cockpitOpen: boolean;
  onSelect: (v: RailView) => void;
  onCockpit: () => void;
};

/**
 * Trilho lateral com as três abas fixas. Como no protótipo, "Meu cockpit" abre a janela do cockpit
 * e as outras duas abrem e recolhem a gaveta na vista correspondente.
 */
export function Rail({ view, open, cockpitOpen, onSelect, onCockpit }: RailProps) {
  const key = (fn: () => void) => (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn());
  return (
    <div className="rp-rail" role="tablist" aria-label="Vistas laterais" aria-orientation="vertical">
      <div className="rp-rail-tab" role="tab" tabIndex={0} data-view="cockpit" aria-selected={cockpitOpen} onClick={onCockpit} onKeyDown={key(onCockpit)}>
        Meu cockpit
      </div>
      {(
        [
          ['modulos', 'Módulos'],
          ['relacionar', 'Arrastar e relacionar'],
        ] as [RailView, string][]
      ).map(([id, label]) => (
        <div
          key={id}
          className="rp-rail-tab"
          role="tab"
          tabIndex={0}
          data-view={id}
          aria-selected={open && view === id}
          onClick={() => onSelect(id)}
          onKeyDown={key(() => onSelect(id))}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

type DrawerProps = { open: boolean; view: RailView; onClose: () => void; onOpen: (kind: WindowKind) => void };

/** Gaveta do menu lateral com o Painel de módulos: um grupo aberto por vez, submódulos com ícone pelo contexto. */
export function Drawer({ open, view, onClose, onOpen }: DrawerProps) {
  const [expanded, setExpanded] = useState<string | null>('cockpit');
  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <aside className="rp-drawer rp-gaveta" data-open={open} aria-hidden={!open} aria-label="Módulos">
      <div className="rp-drawer-inner">
        <div className="rp-drawer-head">
          <button type="button" className="rp-drawer-close" aria-label="Recolher módulos" title="Recolher módulos" tabIndex={open ? 0 : -1} onClick={onClose} />
        </div>
        <div className="rp-drawer-view rp-rolagem" data-view="modulos" data-active={view === 'modulos'}>
          <div className="rp-nav rp-nav--icones">
            {MODULES.map((m) => {
              const isOpen = expanded === m.id;
              return (
                <div key={m.id} className="rp-nav-group" data-open={isOpen}>
                  <button type="button" className="rp-nav-item" tabIndex={open ? 0 : -1} aria-expanded={isOpen} onClick={() => toggle(m.id)}>
                    <i className={`rp-ico rp-ico-w-${m.icon}`} aria-hidden="true" />
                    <span>{m.name}</span>
                  </button>
                  <div className="rp-nav-subs">
                    {m.subs.map((s) => {
                      const kind = ROUTES[`${m.id}|${s}`];
                      return (
                        <div
                          key={s}
                          className={`rp-nav-sub${kind ? '' : ' rp-nav-sub--indisponivel'}`}
                          role="button"
                          tabIndex={open && isOpen ? 0 : -1}
                          aria-disabled={!kind || undefined}
                          title={kind ? undefined : 'Disponível nas próximas sprints'}
                          onClick={() => kind && onOpen(kind)}
                          onKeyDown={(e) => kind && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(kind))}
                        >
                          <i className={`rp-ico rp-ico-w-${subIcon(s, m.id)}`} aria-hidden="true" />
                          <span>{s}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rp-drawer-view" data-view="relacionar" data-active={view === 'relacionar'}>
          <div className="rp-nav rp-nav--pastas">
            {['Cadastros', 'Vendas', 'Compras', 'Estoque', 'Financeiro'].map((p) => (
              <div key={p} className="rp-nav-group" data-open={false}>
                <div className="rp-nav-item rp-nav-sub--indisponivel" aria-disabled="true" title="Arrastar e relacionar entra depois dos primeiros cadastros">
                  <i className="rp-ico rp-ico-w-pasta" aria-hidden="true" />
                  <span>{p}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="rp-drawer-aviso">Arraste um registro para uma pasta para ver os documentos relacionados. Disponível depois dos primeiros cadastros.</p>
        </div>
      </div>
    </aside>
  );
}
