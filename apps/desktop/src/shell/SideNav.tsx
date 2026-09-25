import { useState } from 'react';
import menu from '../../../../docs/backend/b01/menu.json';

export type RailView = 'cockpit' | 'modulos' | 'relacionar';


/** Trilho lateral com as três abas fixas do design system. */
export function Rail({ view, open, onSelect }: { view: RailView; open: boolean; onSelect: (v: RailView) => void }) {
  const tabs: [RailView, string][] = [
    ['cockpit', 'Meu cockpit'],
    ['modulos', 'Módulos'],
    ['relacionar', 'Arrastar e relacionar'],
  ];
  return (
    <div className="rp-rail" role="tablist" aria-label="Navegação" aria-orientation="vertical">
      {tabs.map(([id, label]) => (
        <div
          key={id}
          className="rp-rail-tab"
          role="tab"
          tabIndex={0}
          data-view={id}
          aria-selected={open && view === id}
          onClick={() => onSelect(id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(id))}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export type MenuItem = {
  rotulo: string;
  fase: string;
  tela?: string;
  secao?: string;
  visao?: string;
  recurso?: string;
  acao?: string;
  nota?: boolean;
  implementado?: boolean;
};
export type MenuModule = { nome: string; icone: string; itens: MenuItem[] };

/** Catálogo do menu lateral: fonte única em docs/backend/b01/menu.json, conferida pelo verificador do B01. */
export const MENU: MenuModule[] = (menu as { modulos: MenuModule[] }).modulos;

export type MenuActions = { openCompany: () => void; openStatus: () => void };

/** Chave que liga um item implementado à ação que o app executa. */
export const itemKey = (it: MenuItem) => it.acao ?? `${it.tela ?? ''}:${it.secao ?? ''}`;

export function actionFor(it: MenuItem, a: MenuActions): (() => void) | undefined {
  if (!it.implementado) return undefined;
  const map: Record<string, () => void> = {
    'status-servidor': a.openStatus,
    'configuracoes:EMPRESA': a.openCompany,
  };
  return map[itemKey(it)];
}

type DrawerProps = { open: boolean; view: RailView; onClose: () => void; onOpenCompany: () => void; onOpenStatus: () => void };

/** Gaveta do Menu lateral recolhível, com o Painel de módulos (30 módulos, na ordem do design system). */
export function Drawer({ open, view, onClose, onOpenCompany, onOpenStatus }: DrawerProps) {
  const [expanded, setExpanded] = useState<string | null>('Configurações');
  const actions: MenuActions = { openCompany: onOpenCompany, openStatus: onOpenStatus };
  const toggle = (nome: string) => setExpanded(expanded === nome ? null : nome);

  return (
    <aside className="rp-drawer" data-open={open} aria-hidden={!open} aria-label="Menu lateral">
      <div className="rp-drawer-inner">
        <div className="rp-drawer-head">
          <button type="button" className="rp-drawer-close" aria-label="Recolher menu" title="Recolher menu" onClick={onClose} />
        </div>
        <div className="rp-drawer-view" data-view="modulos" data-active={view === 'modulos'}>
          <div className="rp-nav">
            {MENU.map((m) => (
              <div key={m.nome} className="rp-nav-group" data-open={expanded === m.nome}>
                <div
                  className="rp-nav-item"
                  role="button"
                  tabIndex={open ? 0 : -1}
                  aria-expanded={expanded === m.nome}
                  onClick={() => toggle(m.nome)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(m.nome))}
                >
                  <i className={`rp-ico rp-ico-w-${m.icone}`} />
                  {m.nome}
                </div>
                <div className="rp-nav-subs">
                  {m.itens.map((it) => {
                    const action = actionFor(it, actions);
                    const title = action ? it.rotulo : it.nota ? it.rotulo : `${it.rotulo} — previsto: ${it.fase}`;
                    return (
                      <div
                        key={`${it.rotulo}-${itemKey(it)}-${it.visao ?? ''}-${it.recurso ?? ''}`}
                        className={`rp-nav-sub${action ? '' : ' rp-nav-sub--indisponivel'}`}
                        role={action ? 'button' : undefined}
                        tabIndex={action && open && expanded === m.nome ? 0 : -1}
                        aria-disabled={!action || undefined}
                        title={title}
                        onClick={action}
                        onKeyDown={(e) => action && e.key === 'Enter' && action()}
                      >
                        <i className={`rp-ico rp-ico-w-${m.icone}`} />
                        <span className="rp-nav-sub__rotulo">{it.rotulo}</span>
                        {!action && !it.nota && <span className="rp-nav-sub__fase">{it.fase}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rp-drawer-view" data-view="cockpit" data-active={view === 'cockpit'}>
          <p className="rp-drawer-aviso">Os cockpits entram com os indicadores, nas próximas sprints.</p>
        </div>
        <div className="rp-drawer-view" data-view="relacionar" data-active={view === 'relacionar'}>
          <p className="rp-drawer-aviso">Arrastar e relacionar entra depois dos primeiros cadastros.</p>
        </div>
      </div>
    </aside>
  );
}
