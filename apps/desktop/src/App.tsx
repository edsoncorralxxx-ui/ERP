import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api/client';
import type { CompanyProfile, SessionUser } from './api/types';
import { CatalogWindow } from './screens/CatalogWindow';
import { ChangePasswordWindow } from './screens/ChangePasswordWindow';
import { CockpitWindow } from './screens/CockpitWindow';
import { CompanyProfileWindow } from './screens/CompanyProfileWindow';
import { CustomerWindow } from './screens/CustomerWindow';
import { CustomersWindow } from './screens/CustomersWindow';
import { EquipmentsWindow } from './screens/EquipmentsWindow';
import { EquipmentWindow } from './screens/EquipmentWindow';
import { ItemsWindow } from './screens/ItemsWindow';
import { ItemWindow } from './screens/ItemWindow';
import { BankAccountsWindow } from './screens/BankAccountsWindow';
import { BomImportWindow } from './screens/BomImportWindow';
import { BomWindow } from './screens/BomWindow';
import { BomsWindow } from './screens/BomsWindow';
import { EquipmentModelsWindow } from './screens/EquipmentModelsWindow';
import { DocumentsWindow } from './screens/DocumentsWindow';
import { DocumentWindow } from './screens/DocumentWindow';
import { ToIssueWindow } from './screens/ToIssueWindow';
import { FiscalClassificationWindow } from './screens/FiscalClassificationWindow';
import { FiscalDashboardWindow } from './screens/FiscalDashboardWindow';
import { TaxObligationsWindow } from './screens/TaxObligationsWindow';
import { TaxPeriodWindow } from './screens/TaxPeriodWindow';
import { TaxTablesWindow } from './screens/TaxTablesWindow';
import { ProjectsWindow } from './screens/ProjectsWindow';
import { ProjectWindow } from './screens/ProjectWindow';
import { ProposalsWindow } from './screens/ProposalsWindow';
import { LeadsWindow } from './screens/LeadsWindow';
import { LeadWindow } from './screens/LeadWindow';
import { LeadImportWindow } from './screens/LeadImportWindow';
import { OpportunitiesWindow } from './screens/OpportunitiesWindow';
import { OpportunityWindow } from './screens/OpportunityWindow';
import { FunnelWindow } from './screens/FunnelWindow';
import { CrmAgendaWindow } from './screens/CrmAgendaWindow';
import { OpportunityStagesWindow } from './screens/OpportunityStagesWindow';
import { ProposalWindow } from './screens/ProposalWindow';
import { ReceivablesWindow } from './screens/ReceivablesWindow';
import { ReceivableWindow } from './screens/ReceivableWindow';
import { PayablesWindow } from './screens/PayablesWindow';
import { PayableWindow } from './screens/PayableWindow';
import { NewPayableWindow } from './screens/NewPayableWindow';
import { FinancialCategoriesWindow } from './screens/FinancialCategoriesWindow';
import { CashFlowWindow } from './screens/CashFlowWindow';
import { SalesOrdersWindow } from './screens/SalesOrdersWindow';
import { SalesOrderWindow } from './screens/SalesOrderWindow';
import { ServerStatusWindow } from './screens/ServerStatusWindow';
import { SuppliersWindow } from './screens/SuppliersWindow';
import { SupplierWindow } from './screens/SupplierWindow';
import { UsersWindow } from './screens/UsersWindow';
import { Dialog } from './shell/Dialog';
import { LoginScreen } from './shell/LoginScreen';
import { MenuBar } from './shell/MenuBar';
import { SessionContext, sessionOf } from './shell/SessionContext';
import { Drawer, Rail, type RailView } from './shell/SideNav';
import { StatusBar, type LoggedMessage, type StatusMessage } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { useConnection } from './shell/useConnection';
import { BuscaGlobal } from './shell/BuscaGlobal';
import { WindowContext, type WindowApi, type WindowCommands } from './windows/WindowContext';
import { WindowFrame } from './windows/WindowFrame';
import { destino, navegavel, SEQUENCIA_PADRAO, type Passo } from './windows/navegacao';
import { initialWindowState, windowReducer, type Bounds, type WindowKind } from './windows/windowManager';

const KINDS: Record<WindowKind, { title: string; size: { w: number; h: number } }> = {
  'company-profile': { title: 'Dados da empresa', size: { w: 760, h: 580 } },
  'server-status': { title: 'Status do servidor', size: { w: 500, h: 400 } },
  cockpit: { title: 'Meu cockpit', size: { w: 1180, h: 720 } },
  customers: { title: 'Clientes e unidades', size: { w: 1100, h: 620 } },
  customer: { title: 'Cliente', size: { w: 980, h: 640 } },
  suppliers: { title: 'Fornecedores', size: { w: 1100, h: 620 } },
  supplier: { title: 'Fornecedor', size: { w: 980, h: 660 } },
  items: { title: 'Produtos e serviços', size: { w: 1100, h: 620 } },
  item: { title: 'Produto ou serviço', size: { w: 900, h: 600 } },
  catalog: { title: 'Unidades e categorias', size: { w: 920, h: 560 } },
  leads: { title: 'Prospecção', size: { w: 1180, h: 620 } },
  lead: { title: 'Prospecção', size: { w: 1080, h: 660 } },
  'lead-import': { title: 'Importar lista de prospecção', size: { w: 1160, h: 660 } },
  opportunities: { title: 'Oportunidades', size: { w: 1200, h: 620 } },
  opportunity: { title: 'Oportunidade de venda', size: { w: 1100, h: 680 } },
  funnel: { title: 'Funil de vendas', size: { w: 1180, h: 700 } },
  'crm-agenda': { title: 'Agenda do CRM', size: { w: 1100, h: 600 } },
  'opportunity-stages': { title: 'Etapas do funil', size: { w: 900, h: 560 } },
  proposals: { title: 'Propostas', size: { w: 1100, h: 620 } },
  proposal: { title: 'Proposta', size: { w: 1120, h: 680 } },
  orders: { title: 'Pedidos e contratos', size: { w: 1100, h: 620 } },
  order: { title: 'Pedido de venda', size: { w: 1120, h: 700 } },
  projects: { title: 'Carteira de projetos', size: { w: 1100, h: 620 } },
  project: { title: 'Detalhe do projeto', size: { w: 1000, h: 640 } },
  equipments: { title: 'Equipamentos', size: { w: 1100, h: 620 } },
  equipment: { title: 'Equipamento', size: { w: 1120, h: 660 } },
  receivables: { title: 'Contas a receber', size: { w: 1160, h: 620 } },
  receivable: { title: 'Título a receber', size: { w: 1000, h: 620 } },
  payables: { title: 'Contas a pagar', size: { w: 1160, h: 620 } },
  payable: { title: 'Título a pagar', size: { w: 1000, h: 640 } },
  'financial-categories': { title: 'Categorias financeiras', size: { w: 900, h: 560 } },
  'cash-flow': { title: 'Fluxo de caixa', size: { w: 1240, h: 660 } },
  'bank-accounts': { title: 'Contas financeiras', size: { w: 1000, h: 600 } },
  documents: { title: 'Documentos e faturamento', size: { w: 1160, h: 620 } },
  document: { title: 'Documento de faturamento', size: { w: 1080, h: 660 } },
  'to-issue': { title: 'Notas a emitir', size: { w: 1180, h: 600 } },
  'fiscal-dashboard': { title: 'Painel fiscal', size: { w: 1180, h: 760 } },
  'tax-period': { title: 'Apuração do Simples Nacional', size: { w: 1180, h: 760 } },
  'tax-obligations': { title: 'Obrigações fiscais e acessórias', size: { w: 1180, h: 720 } },
  'fiscal-classification': { title: 'Classificação fiscal de itens', size: { w: 1180, h: 720 } },
  'tax-tables': { title: 'Tabelas e parâmetros do Simples Nacional', size: { w: 1180, h: 720 } },
  boms: { title: 'BOM — composição de custos', size: { w: 1160, h: 620 } },
  bom: { title: 'BOM', size: { w: 1320, h: 720 } },
  'bom-import': { title: 'Importar BOM', size: { w: 1160, h: 700 } },
  'equipment-models': { title: 'Modelos de equipamento', size: { w: 900, h: 560 } },
  users: { title: 'Usuários e permissões', size: { w: 980, h: 560 } },
  password: { title: 'Alteração de senha', size: { w: 520, h: 330 } },
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
    (kind: WindowKind, recordKey = 'singleton', sequence?: string[]) => {
      dispatch({
        type: 'open', kind, recordKey, title: KINDS[kind].title, size: KINDS[kind].size, bounds: bounds(), maximized: kind === 'cockpit', sequence,
      });
    },
    [bounds],
  );
  const openKind = useCallback((kind: WindowKind, recordKey?: string, sequence?: string[]) => open(kind, recordKey, sequence), [open]);
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

  /**
   * Primeiro, Anterior, Próximo e Último registro na ficha ativa: anda pela lista de onde ela foi aberta (ou pela lista
   * completa do tipo, se veio de uma seta). Com alterações não gravadas, não sai do registro.
   */
  const podeNavegar = !!active && navegavel(active.kind);
  const navegar = useCallback(
    async (passo: Passo) => {
      const w = active;
      if (!w || !navegavel(w.kind)) return;
      if (w.dirty) {
        notify({ tone: 'aviso', text: 'Grave ou descarte as alterações antes de ir para outro registro (NAV-001)' });
        return;
      }
      let sequence = w.sequence;
      if (!sequence) {
        try {
          sequence = await SEQUENCIA_PADRAO[w.kind]!(w.recordKey);
        } catch (e) {
          const x = e as { message?: string; code?: string };
          notify({ tone: 'erro', text: `${x.message ?? 'Falha ao carregar a lista'} (${x.code ?? 'NAV-002'})` });
          return;
        }
      }
      const alvo = destino(sequence, w.recordKey, passo);
      if (!alvo) {
        const inicio = passo === 'primeiro' || passo === 'anterior';
        notify({ tone: 'info', text: inicio ? 'Você já está no primeiro registro' : 'Você já está no último registro' });
        return;
      }
      dispatch({ type: 'navigate', id: w.id, recordKey: alvo, sequence });
    },
    [active, notify],
  );
  const navegacao = useMemo(
    () => (podeNavegar
      ? { primeiro: () => void navegar('primeiro'), anterior: () => void navegar('anterior'), proximo: () => void navegar('proximo'), ultimo: () => void navegar('ultimo') }
      : {}),
    [podeNavegar, navegar],
  );

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
      const passo: Record<string, Passo> = { ArrowUp: 'primeiro', ArrowLeft: 'anterior', ArrowRight: 'proximo', ArrowDown: 'ultimo' };
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActive();
      } else if ((e.metaKey || e.ctrlKey) && e.altKey && passo[e.key]) {
        // ⌥⌘ + setas: registro primeiro, anterior, próximo e último (menu Dados).
        if (document.querySelector('.rp-modal, .rp-login-sobre')) return;
        e.preventDefault();
        if (podeNavegar) void navegar(passo[e.key]);
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        // Caixa de mensagem ou login por cima: o Esc é deles. Lista suspensa e calendário já tratam o próprio Esc.
        if (document.querySelector('.rp-modal, .rp-login-sobre')) return;
        // Foco na gaveta: recolhe a gaveta. Senão fecha a janela ativa; sem janela aberta, recolhe a gaveta.
        const naGaveta = !!(document.activeElement as HTMLElement | null)?.closest('.rp-gaveta');
        if (drawer.open && (naGaveta || !active)) setDrawer((d) => ({ ...d, open: false }));
        else if (active) {
          e.preventDefault();
          requestClose(active.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActive, drawer.open, active, requestClose, podeNavegar, navegar]);

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
          canNavigate={podeNavegar}
          onNavigate={(passo) => void navegar(passo)}
          canNew={!!activeNew}
          onNew={() => activeNew?.()}
        />
        <Toolbar
          actions={{
            bloquear: lock,
            novo: activeNew,
            ...navegacao,
            ajuda: () => open('server-status'),
            consulta: openCockpit,
          }}
        />
      </div>
      <div className="rp-appbody rp-aplicativo__corpo">
        <Rail view={drawer.view} open={drawer.open} cockpitOpen={cockpitOpen} onSelect={selectRail} onCockpit={openCockpit} />
        <Drawer open={drawer.open} view={drawer.view} onClose={() => setDrawer((d) => ({ ...d, open: false }))} onOpen={openKind} />
        <div className="rp-appmain">
          <div className="rp-appwork">
            {/* A linha de boas-vindas e a busca ficam por baixo da área de trabalho: as janelas podem passar por cima delas. */}
            <div className="rp-apphead rp-apphead--sob">
              <span>
                Bem-vindo, {user.displayName}. Você está no cockpit inicial da {company ?? 'Fourtech'}.
              </span>
              <BuscaGlobal onOpen={openKind} />
            </div>
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
                    {/* A chave troca com o registro: ir ao anterior ou ao próximo monta a ficha de novo, já com o outro registro. */}
                    <Fragment key={w.recordKey}>
                    {apis[w.id] &&
                      (w.kind === 'company-profile' ? (
                        <CompanyProfileWindow />
                      ) : w.kind === 'cockpit' ? (
                        <CockpitWindow connection={connection} />
                      ) : w.kind === 'customers' ? (
                        <CustomersWindow />
                      ) : w.kind === 'customer' ? (
                        <CustomerWindow recordKey={w.recordKey} />
                      ) : w.kind === 'suppliers' ? (
                        <SuppliersWindow />
                      ) : w.kind === 'supplier' ? (
                        <SupplierWindow recordKey={w.recordKey} />
                      ) : w.kind === 'items' ? (
                        <ItemsWindow />
                      ) : w.kind === 'item' ? (
                        <ItemWindow recordKey={w.recordKey} />
                      ) : w.kind === 'catalog' ? (
                        <CatalogWindow />
                      ) : w.kind === 'leads' ? (
                        <LeadsWindow />
                      ) : w.kind === 'lead' ? (
                        <LeadWindow recordKey={w.recordKey} />
                      ) : w.kind === 'lead-import' ? (
                        <LeadImportWindow />
                      ) : w.kind === 'opportunities' ? (
                        <OpportunitiesWindow />
                      ) : w.kind === 'opportunity' ? (
                        <OpportunityWindow recordKey={w.recordKey} />
                      ) : w.kind === 'funnel' ? (
                        <FunnelWindow />
                      ) : w.kind === 'crm-agenda' ? (
                        <CrmAgendaWindow />
                      ) : w.kind === 'opportunity-stages' ? (
                        <OpportunityStagesWindow />
                      ) : w.kind === 'proposals' ? (
                        <ProposalsWindow />
                      ) : w.kind === 'proposal' ? (
                        <ProposalWindow recordKey={w.recordKey} />
                      ) : w.kind === 'orders' ? (
                        <SalesOrdersWindow />
                      ) : w.kind === 'order' ? (
                        <SalesOrderWindow recordKey={w.recordKey} />
                      ) : w.kind === 'projects' ? (
                        <ProjectsWindow />
                      ) : w.kind === 'project' ? (
                        <ProjectWindow recordKey={w.recordKey} />
                      ) : w.kind === 'equipments' ? (
                        <EquipmentsWindow />
                      ) : w.kind === 'equipment' ? (
                        <EquipmentWindow recordKey={w.recordKey} />
                      ) : w.kind === 'receivables' ? (
                        <ReceivablesWindow />
                      ) : w.kind === 'receivable' ? (
                        <ReceivableWindow recordKey={w.recordKey} />
                      ) : w.kind === 'payables' ? (
                        <PayablesWindow />
                      ) : w.kind === 'payable' ? (
                        w.recordKey.startsWith('novo-') ? <NewPayableWindow /> : <PayableWindow recordKey={w.recordKey} />
                      ) : w.kind === 'financial-categories' ? (
                        <FinancialCategoriesWindow />
                      ) : w.kind === 'cash-flow' ? (
                        <CashFlowWindow />
                      ) : w.kind === 'bank-accounts' ? (
                        <BankAccountsWindow />
                      ) : w.kind === 'documents' ? (
                        <DocumentsWindow />
                      ) : w.kind === 'document' ? (
                        <DocumentWindow recordKey={w.recordKey} />
                      ) : w.kind === 'to-issue' ? (
                        <ToIssueWindow />
                      ) : w.kind === 'fiscal-dashboard' ? (
                        <FiscalDashboardWindow />
                      ) : w.kind === 'tax-period' ? (
                        <TaxPeriodWindow recordKey={w.recordKey} />
                      ) : w.kind === 'tax-obligations' ? (
                        <TaxObligationsWindow recordKey={w.recordKey} />
                      ) : w.kind === 'fiscal-classification' ? (
                        <FiscalClassificationWindow recordKey={w.recordKey} />
                      ) : w.kind === 'tax-tables' ? (
                        <TaxTablesWindow recordKey={w.recordKey} />
                      ) : w.kind === 'boms' ? (
                        <BomsWindow />
                      ) : w.kind === 'bom' ? (
                        <BomWindow recordKey={w.recordKey} />
                      ) : w.kind === 'bom-import' ? (
                        <BomImportWindow />
                      ) : w.kind === 'equipment-models' ? (
                        <EquipmentModelsWindow />
                      ) : w.kind === 'users' ? (
                        <UsersWindow />
                      ) : w.kind === 'password' ? (
                        <ChangePasswordWindow />
                      ) : (
                        <ServerStatusWindow connection={connection} />
                      ))}
                    </Fragment>
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
