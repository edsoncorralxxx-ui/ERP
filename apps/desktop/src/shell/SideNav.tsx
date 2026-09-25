import { useState } from 'react';

export type RailView = 'cockpit' | 'modulos' | 'relacionar';

type Sub = { label: string; icon: string; action?: () => void };
type Module = { name: string; icon: string; subs?: Sub[] };

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

type DrawerProps = { open: boolean; view: RailView; onClose: () => void; onOpenCompany: () => void; onOpenStatus: () => void };

/** Gaveta do Menu lateral recolhível, com o Painel de módulos (30 módulos, na ordem do design system). */
export function Drawer({ open, view, onClose, onOpenCompany, onOpenStatus }: DrawerProps) {
  const modules: Module[] = [
    { name: 'Cockpit', icon: 'cockpit' },
    { name: 'Dashboard', icon: 'dashboard' },
    { name: 'Cadastros', icon: 'cadastros' },
    { name: 'CRM', icon: 'crm' },
    { name: 'Vendas', icon: 'vendas' },
    { name: 'Engenharia', icon: 'engenharia' },
    { name: 'Compras', icon: 'compras' },
    { name: 'Estoque', icon: 'estoque' },
    { name: 'MRP', icon: 'mrp' },
    { name: 'Produção', icon: 'producao' },
    { name: 'Projetos', icon: 'projetos' },
    { name: 'Instalações', icon: 'instalacoes' },
    { name: 'Equipamentos', icon: 'equipamentos' },
    { name: 'Renda+', icon: 'renda' },
    { name: 'Qualidade', icon: 'qualidade' },
    { name: 'Manutenção', icon: 'manutencao' },
    { name: 'Pós-venda', icon: 'posvenda' },
    { name: 'Financeiro', icon: 'financas' },
    { name: 'Faturamento', icon: 'faturamento' },
    { name: 'Fiscal', icon: 'fiscal' },
    { name: 'Custos', icon: 'custos' },
    { name: 'Contabilidade / Controladoria', icon: 'contabilidade' },
    { name: 'Tarefas', icon: 'tarefas' },
    { name: 'BI & Relatórios', icon: 'bi' },
    { name: 'Documentos', icon: 'documentos' },
    { name: 'Integrações', icon: 'integracoes' },
    { name: 'Recursos Humanos', icon: 'rh' },
    { name: 'Patrimônio', icon: 'patrimonio' },
    { name: 'Administração', icon: 'administracao', subs: [{ label: 'Status do servidor', icon: 'administracao', action: onOpenStatus }] },
    { name: 'Configurações', icon: 'configuracoes-mod', subs: [{ label: 'Dados da empresa', icon: 'cadastros', action: onOpenCompany }] },
  ];
  const [expanded, setExpanded] = useState<string | null>('Configurações');

  return (
    <aside className="rp-drawer" data-open={open} aria-hidden={!open} aria-label="Menu lateral">
      <div className="rp-drawer-inner">
        <div className="rp-drawer-head">
          <button type="button" className="rp-drawer-close" aria-label="Recolher menu" title="Recolher menu" onClick={onClose} />
        </div>
        <div className="rp-drawer-view" data-view="modulos" data-active={view === 'modulos'}>
          <div className="rp-nav">
            {modules.map((m) => (
              <div key={m.name} className="rp-nav-group" data-open={expanded === m.name}>
                <div
                  className="rp-nav-item"
                  role="button"
                  tabIndex={open ? 0 : -1}
                  aria-expanded={expanded === m.name}
                  onClick={() => setExpanded(expanded === m.name ? null : m.name)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setExpanded(expanded === m.name ? null : m.name))}
                >
                  <i className={`rp-ico rp-ico-w-${m.icon}`} />
                  {m.name}
                </div>
                <div className="rp-nav-subs">
                  {(m.subs ?? [{ label: 'Disponível nas próximas sprints', icon: m.icon }]).map((s) => (
                    <div
                      key={s.label}
                      className={`rp-nav-sub${s.action ? '' : ' rp-nav-sub--indisponivel'}`}
                      role={s.action ? 'button' : undefined}
                      tabIndex={s.action && open && expanded === m.name ? 0 : -1}
                      aria-disabled={!s.action || undefined}
                      onClick={s.action}
                      onKeyDown={(e) => s.action && e.key === 'Enter' && s.action()}
                    >
                      <i className={`rp-ico rp-ico-w-${s.icon}`} />
                      {s.label}
                    </div>
                  ))}
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
