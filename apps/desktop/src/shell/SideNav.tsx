import { useState, type KeyboardEvent } from 'react';
import menu from '../../../../docs/backend/b01/menu.json';
import type { WindowKind } from '../windows/windowManager';
import { subIcon } from './modules';

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

/** Chave que liga um item implementado à janela que o app abre. */
export const itemKey = (it: MenuItem) => it.acao ?? `${it.tela ?? ''}:${it.secao ?? ''}`;

const WINDOWS: Record<string, WindowKind> = {
  'status-servidor': 'server-status',
  'configuracoes:EMPRESA': 'company-profile',
};

/** Janela aberta pelo item; só itens marcados como implementados têm destino. */
export function windowFor(it: MenuItem): WindowKind | undefined {
  return it.implementado ? WINDOWS[itemKey(it)] : undefined;
}

type DrawerProps = { open: boolean; view: RailView; onClose: () => void; onOpen: (kind: WindowKind) => void };

/**
 * Gaveta do menu lateral com o Painel de módulos (30 módulos, na ordem do design system), no visual do protótipo:
 * um grupo aberto por vez, cada item com o ícone pelo contexto do nome; itens previstos esmaecidos, com a fase.
 */
export function Drawer({ open, view, onClose, onOpen }: DrawerProps) {
  const [expanded, setExpanded] = useState<string | null>('Configurações');
  const toggle = (nome: string) => setExpanded((cur) => (cur === nome ? null : nome));

  return (
    <aside className="rp-drawer rp-gaveta" data-open={open} aria-hidden={!open} aria-label="Módulos">
      <div className="rp-drawer-inner">
        <div className="rp-drawer-head">
          <button type="button" className="rp-drawer-close" aria-label="Recolher módulos" title="Recolher módulos" tabIndex={open ? 0 : -1} onClick={onClose} />
        </div>
        <div className="rp-drawer-view rp-rolagem" data-view="modulos" data-active={view === 'modulos'}>
          <div className="rp-nav rp-nav--icones">
            {MENU.map((m) => {
              const isOpen = expanded === m.nome;
              return (
                <div key={m.nome} className="rp-nav-group" data-open={isOpen}>
                  <button type="button" className="rp-nav-item" tabIndex={open ? 0 : -1} aria-expanded={isOpen} onClick={() => toggle(m.nome)}>
                    <i className={`rp-ico rp-ico-w-${m.icone}`} aria-hidden="true" />
                    <span>{m.nome}</span>
                  </button>
                  <div className="rp-nav-subs">
                    {m.itens.map((it) => {
                      const kind = windowFor(it);
                      const title = kind || it.nota ? it.rotulo : `${it.rotulo} — previsto: ${it.fase}`;
                      return (
                        <div
                          key={`${it.rotulo}-${itemKey(it)}-${it.visao ?? ''}-${it.recurso ?? ''}`}
                          className={`rp-nav-sub${kind ? '' : ' rp-nav-sub--indisponivel'}`}
                          role="button"
                          tabIndex={open && isOpen ? 0 : -1}
                          aria-disabled={!kind || undefined}
                          title={title}
                          onClick={() => kind && onOpen(kind)}
                          onKeyDown={(e) => kind && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(kind))}
                        >
                          <i className={`rp-ico rp-ico-w-${subIcon(it.rotulo, m.icone)}`} aria-hidden="true" />
                          <span className="rp-nav-sub__rotulo">{it.rotulo}</span>
                          {!kind && !it.nota && <span className="rp-nav-sub__fase">{it.fase}</span>}
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
