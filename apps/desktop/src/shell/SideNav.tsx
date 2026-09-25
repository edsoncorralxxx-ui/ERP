import { useState } from 'react';

type Props = { collapsed: boolean; onToggle: () => void; onOpenCompany: () => void; onOpenStatus: () => void };

type Group = { name: string; items: { label: string; action: () => void }[] };

/** Painel de módulos recolhível. Mostra apenas funções já implementadas. */
export function SideNav({ collapsed, onToggle, onOpenCompany, onOpenStatus }: Props) {
  const groups: Group[] = [
    {
      name: 'Administração',
      items: [
        { label: 'Dados da empresa', action: onOpenCompany },
        { label: 'Status do servidor', action: onOpenStatus },
      ],
    },
  ];
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Administração: true });

  return (
    <aside className={`rp-sidenav${collapsed ? ' is-collapsed' : ''}`} aria-label="Módulos">
      <button type="button" className="rp-sidenav__toggle" onClick={onToggle} aria-label={collapsed ? 'Abrir painel de módulos' : 'Recolher painel de módulos'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && (
        <div className="rp-sidenav__panel">
          <div className="rp-sidenav__heading">Módulos</div>
          {groups.map((g) => (
            <div key={g.name} className="rp-sidenav__group">
              <button
                type="button"
                className="rp-sidenav__group-button"
                aria-expanded={!!openGroups[g.name]}
                onClick={() => setOpenGroups({ ...openGroups, [g.name]: !openGroups[g.name] })}
              >
                <span aria-hidden="true">{openGroups[g.name] ? '▾' : '▸'}</span> {g.name}
              </button>
              {openGroups[g.name] && (
                <ul>
                  {g.items.map((it) => (
                    <li key={it.label}>
                      <button type="button" className="rp-sidenav__item" onClick={it.action}>
                        {it.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="rp-sidenav__note">Os demais módulos entram a cada sprint.</p>
        </div>
      )}
    </aside>
  );
}
