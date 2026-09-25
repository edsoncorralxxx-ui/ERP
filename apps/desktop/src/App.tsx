import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from './api/client';
import type { CompanyProfile } from './api/types';
import { CompanyProfileWindow } from './screens/CompanyProfileWindow';
import { ServerStatusWindow } from './screens/ServerStatusWindow';
import { Dialog } from './shell/Dialog';
import { MenuBar } from './shell/MenuBar';
import { Drawer, Rail, type RailView } from './shell/SideNav';
import { StatusBar, type StatusMessage } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { useConnection } from './shell/useConnection';
import { WindowContext, type WindowApi, type WindowCommands } from './windows/WindowContext';
import { WindowFrame } from './windows/WindowFrame';
import { initialWindowState, windowReducer, type Bounds, type WindowKind } from './windows/windowManager';

const KINDS: Record<WindowKind, { title: string; size: { w: number; h: number } }> = {
  'company-profile': { title: 'Dados da empresa', size: { w: 720, h: 560 } },
  'server-status': { title: 'Status do servidor', size: { w: 500, h: 400 } },
};

/** Moldura do aplicativo conforme o design system: Barra superior, Barra lateral recolhível, área de trabalho e rodapé. */
export function App() {
  const [state, dispatch] = useReducer(windowReducer, initialWindowState);
  const [drawer, setDrawer] = useState<{ open: boolean; view: RailView }>({ open: false, view: 'modulos' });
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [commands, setCommands] = useState<Record<string, WindowCommands>>({});
  const workspace = useRef<HTMLDivElement>(null);
  const connection = useConnection();

  const bounds = useCallback((): Bounds => {
    const el = workspace.current;
    return { width: el?.clientWidth ?? 1200, height: el?.clientHeight ?? 700 };
  }, []);

  // Nome da empresa para a saudação e o rodapé.
  const refreshCompany = useCallback(() => {
    api
      .get<CompanyProfile>('/api/v1/company-profile')
      .then((r) => setCompany(r.data.tradeName || r.data.legalName || null))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (connection.state === 'online') refreshCompany();
  }, [connection.state, refreshCompany]);

  const notify = useCallback(
    (m: StatusMessage) => {
      setMessage(m);
      if (m.tone === 'sucesso') refreshCompany();
    },
    [refreshCompany],
  );

  const open = useCallback(
    (kind: WindowKind, recordKey = 'singleton') => {
      dispatch({ type: 'open', kind, recordKey, title: KINDS[kind].title, size: KINDS[kind].size, bounds: bounds() });
      setDrawer((d) => ({ ...d, open: false }));
    },
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
      } else if (e.key === 'Escape' && drawer.open) {
        setDrawer((d) => ({ ...d, open: false }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActive, drawer.open]);

  const windowsKey = state.windows.map((w) => `${w.id}:${w.dirty}`).join('|');
  const apis = useMemo(() => {
    const map: Record<string, WindowApi> = {};
    for (const w of state.windows) {
      map[w.id] = {
        windowId: w.id,
        setDirty: (dirty) => dispatch({ type: 'setDirty', id: w.id, dirty }),
        registerCommands: (c) => setCommands((prev) => (prev[w.id]?.save === c.save ? prev : { ...prev, [w.id]: c })),
        notify,
        requestClose: () => requestClose(w.id),
      };
    }
    return map;
    // Recriado apenas quando o conjunto de janelas ou o estado de alteração muda.
  }, [windowsKey, requestClose, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRail = (view: RailView) => setDrawer((d) => ({ view, open: d.open && d.view === view ? false : true }));
  const closingWin = state.windows.find((w) => w.id === closing);

  return (
    <div className="rp rp-app rp-aplicativo">
      <div className="rp-appbar">
        <MenuBar
          windows={state.windows}
          activeId={state.activeId}
          canSave={!!activeSave}
          onSaveActive={saveActive}
          onCloseActive={() => active && requestClose(active.id)}
          onOpenCompany={() => open('company-profile')}
          onOpenStatus={() => open('server-status')}
          onCascade={() => dispatch({ type: 'cascade', bounds: bounds() })}
          onTile={() => dispatch({ type: 'tile', bounds: bounds() })}
          onFocus={(id) => dispatch({ type: 'focus', id })}
          onToggleDrawer={() => setDrawer((d) => ({ ...d, open: !d.open }))}
          onAppWindow={(action) => void window.renda?.window?.(action)}
        />
        <Toolbar onHelp={() => open('server-status')} />
      </div>
      <div className="rp-appbody rp-aplicativo__corpo">
        <Rail view={drawer.view} open={drawer.open} onSelect={selectRail} />
        <div className="rp-appmain">
          <div className="rp-apphead">
            <span>Bem-vindo. Você está no cockpit inicial da {company ?? 'Fourtech'}.</span>
            <div className="rp-search">
              <input placeholder="Pesquisar operações, dados mestre e documentos" disabled title="A busca global entra nas próximas sprints" aria-label="Busca global" />
              <button type="button" aria-label="Pesquisar" disabled>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4.5" fill="none" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="2.4" />
                  <path d="M10 10l4.5 4.5" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          <div className="rp-appwork">
            <Drawer
              open={drawer.open}
              view={drawer.view}
              onClose={() => setDrawer((d) => ({ ...d, open: false }))}
              onOpenCompany={() => open('company-profile')}
              onOpenStatus={() => open('server-status')}
            />
            <main className="rp-aplicativo__area" ref={workspace}>
              <div className="rp-watermark" aria-hidden="true">
                <span>
                  Renda<b>+</b>
                  <i>ERP</i>
                </span>
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
            </main>
          </div>
        </div>
      </div>
      <StatusBar connection={connection} activeTitle={active?.title ?? null} company={company} message={message} onDismiss={() => setMessage(null)} />

      {closingWin && (
        <Dialog
          icon="aviso"
          label="Alterações não salvas"
          onEscape={() => setClosing(null)}
          buttons={[
            {
              label: 'Sim',
              primary: true,
              onClick: async () => {
                const ok = (await commands[closingWin.id]?.save?.()) ?? false;
                setClosing(null);
                if (ok) dispatch({ type: 'close', id: closingWin.id });
              },
            },
            {
              label: 'Não',
              onClick: () => {
                dispatch({ type: 'close', id: closingWin.id });
                setClosing(null);
              },
            },
            { label: 'Cancelar', onClick: () => setClosing(null) },
          ]}
        >
          A janela {closingWin.title} tem alterações que ainda não foram gravadas no servidor.
          <br />
          Deseja salvar antes de fechar?
        </Dialog>
      )}
    </div>
  );
}
