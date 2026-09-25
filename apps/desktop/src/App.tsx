import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CompanyProfileWindow } from './screens/CompanyProfileWindow';
import { ServerStatusWindow } from './screens/ServerStatusWindow';
import { Dialog } from './shell/Dialog';
import { MenuBar } from './shell/MenuBar';
import { SideNav } from './shell/SideNav';
import { StatusBar } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { useConnection } from './shell/useConnection';
import { WindowContext, type WindowApi, type WindowCommands } from './windows/WindowContext';
import { WindowFrame } from './windows/WindowFrame';
import { initialWindowState, windowReducer, type Bounds, type WindowKind } from './windows/windowManager';

const KINDS: Record<WindowKind, { title: string; size: { w: number; h: number } }> = {
  'company-profile': { title: 'Dados da empresa', size: { w: 760, h: 560 } },
  'server-status': { title: 'Status do servidor', size: { w: 520, h: 380 } },
};

export function App() {
  const [state, dispatch] = useReducer(windowReducer, initialWindowState);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [commands, setCommands] = useState<Record<string, WindowCommands>>({});
  const workspace = useRef<HTMLDivElement>(null);
  const connection = useConnection();

  const bounds = useCallback((): Bounds => {
    const el = workspace.current;
    return { width: el?.clientWidth ?? 1200, height: el?.clientHeight ?? 700 };
  }, []);

  const open = useCallback(
    (kind: WindowKind, recordKey = 'singleton') => dispatch({ type: 'open', kind, recordKey, title: KINDS[kind].title, size: KINDS[kind].size, bounds: bounds() }),
    [bounds],
  );

  useEffect(() => {
    const onResize = () => dispatch({ type: 'fit', bounds: bounds() });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bounds]);

  const active = state.windows.find((w) => w.id === state.activeId) ?? null;
  const activeSave = active ? commands[active.id]?.save : undefined;

  const saveActive = useCallback(() => {
    if (activeSave) void activeSave();
  }, [activeSave]);

  const requestClose = useCallback(
    (id: string) => {
      const w = state.windows.find((x) => x.id === id);
      if (w?.dirty) setClosing(id);
      else dispatch({ type: 'close', id });
    },
    [state.windows],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActive();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActive]);

  const apis = useMemo(() => {
    const map: Record<string, WindowApi> = {};
    for (const w of state.windows) {
      map[w.id] = {
        windowId: w.id,
        setDirty: (dirty) => dispatch({ type: 'setDirty', id: w.id, dirty }),
        registerCommands: (c) => setCommands((prev) => (prev[w.id]?.save === c.save ? prev : { ...prev, [w.id]: c })),
        notify: setMessage,
        requestClose: () => requestClose(w.id),
      };
    }
    return map;
    // Recriar apenas quando o conjunto de janelas muda, para não reexecutar efeitos das telas a cada foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.windows.map((w) => `${w.id}:${w.dirty}`).join('|'), requestClose]);

  const closingWin = state.windows.find((w) => w.id === closing);

  return (
    <div className="rp rp-app">
      <MenuBar
        windows={state.windows}
        activeId={state.activeId}
        onOpenCompany={() => open('company-profile')}
        onOpenStatus={() => open('server-status')}
        onCloseActive={() => active && requestClose(active.id)}
        onSaveActive={saveActive}
        canSave={!!activeSave}
        onCascade={() => dispatch({ type: 'cascade', bounds: bounds() })}
        onTile={() => dispatch({ type: 'tile', bounds: bounds() })}
        onFocus={(id) => dispatch({ type: 'focus', id })}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />
      <Toolbar
        canSave={!!activeSave}
        hasActive={!!active}
        hasWindows={state.windows.length > 0}
        onSave={saveActive}
        onClose={() => active && requestClose(active.id)}
        onCascade={() => dispatch({ type: 'cascade', bounds: bounds() })}
        onTile={() => dispatch({ type: 'tile', bounds: bounds() })}
      />
      <div className="rp-main">
        <SideNav
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          onOpenCompany={() => open('company-profile')}
          onOpenStatus={() => open('server-status')}
        />
        <div className="rp-workspace" ref={workspace}>
          <div className="rp-workspace__brand" aria-hidden="true">
            <span className="rp-workspace__brand-name">Renda+</span> <span className="rp-workspace__brand-erp">ERP</span>
          </div>
          {state.windows.map((w) => (
            <WindowContext.Provider key={w.id} value={apis[w.id] ?? null}>
              <WindowFrame
                win={w}
                active={w.id === state.activeId}
                onFocus={() => w.id !== state.activeId && dispatch({ type: 'focus', id: w.id })}
                onMove={(x, y) => dispatch({ type: 'move', id: w.id, x, y, bounds: bounds() })}
                onResize={(width, height) => dispatch({ type: 'resize', id: w.id, w: width, h: height, bounds: bounds() })}
                onMinimize={() => dispatch({ type: 'minimize', id: w.id })}
                onToggleMaximize={() => dispatch({ type: 'toggleMaximize', id: w.id })}
                onClose={() => requestClose(w.id)}
              >
                {apis[w.id] && (w.kind === 'company-profile' ? <CompanyProfileWindow /> : <ServerStatusWindow connection={connection} />)}
              </WindowFrame>
            </WindowContext.Provider>
          ))}
        </div>
      </div>
      <StatusBar connection={connection} activeTitle={active?.title ?? null} message={message} />

      {closingWin && (
        <Dialog
          title="Alterações não salvas"
          onEscape={() => setClosing(null)}
          buttons={[
            { label: 'Continuar editando', onClick: () => setClosing(null) },
            {
              label: 'Descartar',
              onClick: () => {
                dispatch({ type: 'close', id: closingWin.id });
                setClosing(null);
              },
            },
            {
              label: 'Salvar e fechar',
              primary: true,
              onClick: async () => {
                const ok = (await commands[closingWin.id]?.save?.()) ?? false;
                setClosing(null);
                if (ok) dispatch({ type: 'close', id: closingWin.id });
              },
            },
          ]}
        >
          <p>A janela “{closingWin.title}” tem alterações que ainda não foram salvas no servidor.</p>
        </Dialog>
      )}
    </div>
  );
}
