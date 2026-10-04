import { useState, type KeyboardEvent } from 'react';
import menu from '../../../../docs/backend/b01/menu.json';
import { WINDOW_KINDS, type WindowKind } from '../windows/windowManager';
import { subIcon } from './modules';
import { useSession } from './SessionContext';

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
  /** Janela que o app abre: tipo ou tipo/chave (ex.: cadastro-lista/clientes). */
  janela?: string;
  tela?: string;
  recurso?: string;
};
export type MenuModule = { nome: string; icone: string; itens: MenuItem[] };

/** Catálogo do menu lateral: fonte única em docs/backend/b01/menu.json (igual ao mock), conferida pelo verificador do B01. */
export const MENU: MenuModule[] = (menu as { modulos: MenuModule[] }).modulos;

/** Destino de um item: a janela e a chave do registro (singleton quando a janela não tem chave). */
export type Destino = { kind: WindowKind; recordKey: string };

const KINDS_SET = new Set<string>(WINDOW_KINDS);

/** Janela aberta pelo item; item sem janela, ou com janela que o app ainda não tem, fica esmaecido. */
export function windowFor(it: MenuItem): Destino | undefined {
  if (!it.janela) return undefined;
  const [kind, recordKey] = it.janela.split('/');
  return KINDS_SET.has(kind) ? { kind: kind as WindowKind, recordKey: recordKey ?? 'singleton' } : undefined;
}

/** Permissão de leitura que cada janela exige; sem ela o item aparece, mas não abre. */
export const NEEDS: Partial<Record<WindowKind, string>> = {
  users: 'user.admin',
  customers: 'partner.read',
  suppliers: 'partner.read',
  items: 'item.read',
  catalog: 'item.read',
  leads: 'lead.read',
  lead: 'lead.read',
  'lead-import': 'lead.create',
  opportunities: 'opportunity.read',
  opportunity: 'opportunity.read',
  funnel: 'opportunity.read',
  'crm-agenda': 'opportunity.read',
  'opportunity-stages': 'opportunity.read',
  proposals: 'proposal.read',
  orders: 'sales_order.read',
  projects: 'project.read',
  equipments: 'equipment.read',
  receivables: 'financial_title.read',
  payables: 'financial_title.read',
  'financial-categories': 'financial_title.read',
  'cash-flow': 'financial_title.read',
  'bank-accounts': 'financial_title.read',
  documents: 'document.read',
  'to-issue': 'document.read',
  'fiscal-dashboard': 'tax.read',
  'tax-period': 'tax.read',
  'tax-obligations': 'tax.read',
  'fiscal-classification': 'tax.read',
  'tax-tables': 'tax.read',
  'company-profile': 'company.read',
  boms: 'bom.read',
  bom: 'bom.read',
  'bom-import': 'bom.update',
  'equipment-models': 'bom.read',
};

type DrawerProps = { open: boolean; view: RailView; onClose: () => void; onOpen: (kind: WindowKind, recordKey?: string) => void };

/**
 * Gaveta do menu lateral com o Painel de módulos (30 módulos, na ordem do design system), no visual do protótipo:
 * um grupo aberto por vez, cada item com o ícone pelo contexto do nome; itens previstos esmaecidos, com a fase.
 */
export function Drawer({ open, view, onClose, onOpen }: DrawerProps) {
  const [expanded, setExpanded] = useState<string | null>('Cadastros');
  const { can } = useSession();
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
                      const target = windowFor(it);
                      const need = target && NEEDS[target.kind];
                      const blocked = !!need && !can(need);
                      const dest = blocked ? undefined : target;
                      const abrir = () => dest && onOpen(dest.kind, dest.recordKey);
                      const title = blocked ? `${it.rotulo} — seu perfil não permite` : dest ? `Abrir ${it.rotulo}` : `${it.rotulo} — ainda não disponível`;
                      return (
                        <div
                          key={it.rotulo}
                          className={`rp-nav-sub${dest ? '' : ' rp-nav-sub--indisponivel'}`}
                          role="button"
                          tabIndex={open && isOpen ? 0 : -1}
                          aria-disabled={!dest || undefined}
                          title={title}
                          onClick={abrir}
                          onKeyDown={(e) => dest && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), abrir())}
                        >
                          <i className={`rp-ico rp-ico-w-${subIcon(it.rotulo, m.icone)}`} aria-hidden="true" />
                          <span className="rp-nav-sub__rotulo">{it.rotulo}</span>
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
