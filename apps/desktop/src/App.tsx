import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api/client';
import type { CompanyProfile, SessionUser } from './api/types';
import { ChangePasswordWindow } from './screens/ChangePasswordWindow';
import { CockpitWindow } from './screens/CockpitWindow';
import { CompanyProfileWindow } from './screens/CompanyProfileWindow';
import { CustomerWindow } from './screens/CustomerWindow';
import { CustomersWindow } from './screens/CustomersWindow';
import { ServerStatusWindow } from './screens/ServerStatusWindow';
import { UsersWindow } from './screens/UsersWindow';
import { Dialog } from './shell/Dialog';
import { LoginScreen } from './shell/LoginScreen';
import { MenuBar } from './shell/MenuBar';
import { SessionContext, sessionOf } from './shell/SessionContext';
import { Drawer, Rail, type RailView } from './shell/SideNav';
import { StatusBar, type LoggedMessage, type StatusMessage } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { useConnection } from './shell/useConnection';
import { WindowContext, type WindowApi, type WindowCommands } from './windows/WindowContext';
import { WindowFrame } from './windows/WindowFrame';
import { initialWindowState, windowReducer, type Bounds, type WindowKind } from './windows/windowManager';

const KINDS: Record<WindowKind, { title: string; size: { w: number; h: number } }> = {
  'company-profile': { title: 'Dados da empresa', size: { w: 760, h: 580 } },
  'server-status': { title: 'Status do servidor', size: { w: 500, h: 400 } },
  cockpit: { title: 'Meu cockpit', size: { w: 1180, h: 720 } },
  customers: { title: 'Clientes e unidades', size: { w: 1100, h: 620 } },
  customer: { title: 'Cliente', size: { w: 980, h: 640 } },
  users: { title: 'Usuários e permissões', size: { w: 980, h: 560 } },
  password: { title: 'Trocar senha', size: { w: 520, h: 330 } },
};

type Lock = 'BLOQUEIO' | 'EXPIRADA';

/**
 * Moldura do aplicativo no padrão do protótipo Renda+ ERP Mock: tela de abertura, Barra superior, trilho com a gaveta
 * de módulos ao lado da área de trabalho, janelas internas sobrepostas e o Rodapé com o log de mensagens.
 */
export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const session = useMemo(() => (user ? sessionOf(user) : null), [user]);

  // Sessão expirada ou revogada no meio do trabalho: o login aparece por cima, sem fechar as janelas.
  useEffect(() => {
    setUnauthorizedHandler(() => setLock((l) => l ?? 'EXPIRADA'));
    return () => setUnauthorizedHandler(null);
  }, []);

  const enter = (u: SessionUser) => {
    setUser(u);
    setLock(null);
  };

  if (!user || !session) return <LoginScreen onEnter={enter} />;
  return (
    <SessionContext.Provider value={session}>
      <Shell
        key={user.id}
        user={user}
        onLock={() => {
          void api.del('/api/v1/session?reason=BLOQUEIO').catch(() => undefined);
          setLock('BLOQUEIO');
        }}
        onSignOut={() => {
          void api.del('/api/v1/session').catch(() => undefined);
          setUser(null);
        }}
      />
      {lock && (
        <div className="rp-login-sobre">
          <LoginScreen
            lockedUser={user.username}
            notice={
              lock === 'EXPIRADA'
                ? 'Sua sessão expirou. Entre de novo para continuar; o que você digitou nas janelas continua lá.'
                : 'Tela bloqueada. Digite sua senha para continuar.'
            }
            onEnter={enter}
          />
        </div>
      )}
    </SessionContext.Provider>
  );
}

function Shell({ user, onLock, onSignOut }: { user: SessionUser; onLock: () => void; onSignOut: () => void }) {
  const [state, dispatch] = useReducer(windowReducer, initialWindowState);
  const [drawer, setDrawer] = useState<{ open: boolean; view: RailView }>({ open: true, view: 'modulos' });
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [log, setLog] = useState<LoggedMessage[]>([]);
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

  // Toda mensagem da linha de status também vai para o Log de mensagens do sistema.
  const notify = useCallback(
    (m: StatusMessage) => {
      setMessage(m);
      setLog((l) => [...l, { ...m, at: new Date() }].slice(-200));
      if (m.tone === 'sucesso') refreshCompany();
    },
    [refreshCompany],
  );
  const dismiss = useCallback(() => setMessage(null), []);

  // Queda e volta da conexão entram no log, como no cliente clássico.
  const lastState = useRef(connection.state);
  useEffect(() => {
    const prev = lastState.current;
    lastState.current = connection.state;
    if (prev === connection.state || connection.state === 'checking') return;
    if (connection.state === 'offline') notify({ tone: 'aviso', text: 'Sem conexão com o servidor; tentando novamente a cada 10 segundos (NET-001)' });
    else if (prev === 'offline') notify({ tone: 'info', text: 'Conexão com o servidor restabelecida' });
  }, [connection.state, notify]);

  // O cockpit abre maximizado, como no protótipo; reabrir qualquer janela só a traz à frente.
  const open = useCallback(
    (kind: WindowKind, recordKey = 'singleton') => {
      dispatch({ type: 'open', kind, recordKey, title: KINDS[kind].title, size: KINDS[kind].size, bounds: bounds(), maximized: kind === 'cockpit' });
    },
    [bounds],
  );
  const openKind = useCallback((kind: WindowKind, recordKey?: string) => open(kind, recordKey), [open]);
  const openCockpit = useCallback(() => open('cockpit'), [open]);

  // Reajusta as janelas quando a área de trabalho muda de tamanho (gaveta abrindo/fechando, janela nativa).
  useEffect(() => {
    const onResize = () => dispatch({ type: 'fit', bounds: bounds() });
    window.addEventListener('resize', onResize);
    const el = workspace.current;
    const observer = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (el && observer) observer.observe(el);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [bounds]);

  const active = state.windows.find((w) => w.id === state.activeId) ?? null;
  const activeSave = active ? commands[active.id]?.save : undefined;
  const activeNew = active ? commands[active.id]?.novo : undefined;
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

  // Bloquear mantém as janelas (e o que foi digitado) por trás do login; encerrar a sessão fecha tudo.
  const lock = onLock;
  const signOut = useCallback(() => {
    if (state.windows.some((w) => w.dirty)) {
      notify({ tone: 'aviso', text: 'Grave ou descarte as alterações das janelas abertas antes de encerrar a sessão (LOGOUT-001)' });
      return;
    }
    onSignOut();
  }, [state.windows, notify, onSignOut]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActive();
      } else if (e.key === 'Escape' && drawer.open && !(document.activeElement as HTMLElement | null)?.closest('.rp-janela-mdi')) {
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
        registerCommands: (c) =>
          setCommands((prev) => (prev[w.id]?.save === c.save && prev[w.id]?.novo === c.novo ? prev : { ...prev, [w.id]: c })),
        notify,
        requestClose: () => requestClose(w.id),
        open: openKind,
      };
    }
    return map;
    // Recriado apenas quando o conjunto de janelas ou o estado de alteração muda.
  }, [windowsKey, requestClose, notify, openKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRail = (view: RailView) => setDrawer((d) => ({ view, open: d.open && d.view === view ? false : true }));
  const closingWin = state.windows.find((w) => w.id === closing);
  const minimized = state.windows.filter((w) => w.mode === 'minimized');
  const cockpitOpen = state.windows.some((w) => w.kind === 'cockpit' && w.mode !== 'minimized');

  return (
    <div className="rp rp-app rp-aplicativo">
      <div className="rp-appbar">
        <MenuBar
          windows={state.windows}
          activeId={state.activeId}
          canSave={!!activeSave}
          onSaveActive={saveActive}
          onCloseActive={() => active && requestClose(active.id)}
          onOpen={openKind}
          onLock={lock}
          onSignOut={signOut}
          onCascade={() => dispatch({ type: 'cascade', bounds: bounds() })}
          onTile={() => dispatch({ type: 'tile', bounds: bounds() })}
          onFocus={(id) => dispatch({ type: 'focus', id })}
          onToggleDrawer={() => setDrawer((d) => ({ ...d, open: !d.open }))}
        />
        <Toolbar
          actions={{
            bloquear: lock,
            novo: activeNew,
            ajuda: () => open('server-status'),
            consulta: openCockpit,
          }}
        />
      </div>
      <div className="rp-appbody rp-aplicativo__corpo">
        <Rail view={drawer.view} open={drawer.open} cockpitOpen={cockpitOpen} onSelect={selectRail} onCockpit={openCockpit} />
        <Drawer open={drawer.open} view={drawer.view} onClose={() => setDrawer((d) => ({ ...d, open: false }))} onOpen={openKind} />
        <div className="rp-appmain">
          <div className="rp-apphead">
            <span>
              Bem-vindo, {user.displayName}. Você está no cockpit inicial da {company ?? 'Fourtech'}.
            </span>
            <div className="rp-search">
              <input placeholder="Pesquisar operações, dados mestre e documentos" disabled title="A busca global entra nas próximas sprints" aria-label="Busca global" />
              <button type="button" aria-label="Pesquisar" disabled>
                <i className="rp-ico rp-ico-buscar" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="rp-appwork">
            <main className="rp-aplicativo__area" ref={workspace} aria-label="Área de trabalho">
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
                    {apis[w.id] &&
                      (w.kind === 'company-profile' ? (
                        <CompanyProfileWindow />
                      ) : w.kind === 'cockpit' ? (
                        <CockpitWindow connection={connection} />
                      ) : w.kind === 'customers' ? (
                        <CustomersWindow />
                      ) : w.kind === 'customer' ? (
                        <CustomerWindow recordKey={w.recordKey} />
                      ) : w.kind === 'users' ? (
                        <UsersWindow />
                      ) : w.kind === 'password' ? (
                        <ChangePasswordWindow />
                      ) : (
                        <ServerStatusWindow connection={connection} />
                      ))}
                  </WindowFrame>
                </WindowContext.Provider>
              ))}
              {minimized.length > 0 && (
                <div className="rp-minimizadas" role="toolbar" aria-label="Janelas minimizadas">
                  {minimized.map((w) => (
                    <button key={w.id} type="button" className="rp-minimizada" title={`Restaurar ${w.title}`} onClick={() => dispatch({ type: 'focus', id: w.id })}>
                      {w.title}
                    </button>
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
      <StatusBar connection={connection} user={`${user.displayName} (${user.profileLabel})`} activeTitle={active?.title ?? null} company={company} message={message} log={log} onDismiss={dismiss} />

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
