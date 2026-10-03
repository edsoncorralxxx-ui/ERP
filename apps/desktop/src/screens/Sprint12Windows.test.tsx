import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type {
  FiscalDashboard, ItemFiscalProfile, SessionUser, TaxObligation, TaxParameters, TaxPeriod, TaxSetup,
} from '../api/types';
import { percentual, percentualParaFracao } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { FiscalClassificationWindow } from './FiscalClassificationWindow';
import { FiscalDashboardWindow } from './FiscalDashboardWindow';
import { TaxObligationsWindow } from './TaxObligationsWindow';
import { TaxPeriodWindow, competenciaPadrao } from './TaxPeriodWindow';
import { TaxTablesWindow } from './TaxTablesWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['document.read', 'document.classify', 'tax.read', 'tax_parameter.admin', 'tax_period.simulate', 'tax_period.declare', 'tax_das.issue',
    'tax_period.close_step', 'tax_period.close', 'tax_period.reopen', 'tax_obligation.update', 'tax_classification.update', 'tax_profile.admin',
    'financial_title.read', 'financial_title.settle'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['document.read', 'tax.read', 'financial_title.read'] };

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });
const naoAchou = () => resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });

function abrir(janela: ReactNode, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), setTitle: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>{janela}</WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

const LIM = ['18000000', '36000000', '72000000', '180000000', '360000000', '480000000'];
const parametros: TaxParameters = {
  id: 'p-2', revision: 2, regime: 'SIMPLES_NACIONAL', validFrom: '2026-09', source: 'LC 123/2006', notes: null, createdAt: '2026-10-01T12:00:00Z', createdBy: 'sistema',
  annexes: [
    { annex: 'II', label: 'Anexo II — Indústria', taxes: ['IRPJ', 'CSLL', 'COFINS', 'PIS/Pasep', 'CPP', 'IPI', 'ICMS'],
      brackets: ['0.045', '0.078', '0.1', '0.112', '0.147', '0.3'].map((rate, i) => ({
        upToCents: LIM[i], rate, deductionCents: ['0', '594000', '1386000', '2250000', '8550000', '72000000'][i],
        shares: i < 5 ? ['0.055', '0.035', '0.1151', '0.0249', '0.375', '0.075', '0.32'] : ['0.085', '0.075', '0.2096', '0.0454', '0.235', '0.35', '0'] })) },
    { annex: 'IV', label: 'Anexo IV — Serviços', taxes: [],
      brackets: ['0.045', '0.09', '0.102', '0.14', '0.22', '0.33'].map((rate, i) => ({ upToCents: LIM[i], rate, deductionCents: '0', shares: [] })) },
  ],
};

const anexo = (an: 'I' | 'II' | 'III', label: string, revenueCents: string, taxCents: string, effectiveRate: string, taxes: [string, string][], issExcessCents = '0') => ({
  annex: an, label, bracket: 5, nominalRate: '0.147', deductionCents: '8550000', effectiveRate, revenueCents, taxCents, issExcessCents,
  taxes: taxes.map(([tax, cents]) => ({ tax, share: '0.1', cents })),
});

/** Apuração de 09/2026 com os números do mock (R$ 52.415,79). */
const periodo = (extra: Partial<TaxPeriod> = {}): TaxPeriod => ({
  competence: '2026-09', status: 'EM_APURACAO', version: '3', revenueCents: '38640000',
  revenueByAnnex: { I: '1184000', II: '26550000', III: '10906000' }, documentCount: 2,
  documents: [
    { documentId: 'd-1', code: 'DF00001', kind: 'PRODUTO', series: '1', number: '4880', issueDate: '2026-09-10', customerCode: 'C00001',
      customerName: 'Cooperativa Agroindustrial Noroeste', orderCode: 'PV00001', description: 'Balança Renda+ R50', annex: 'II', cents: '26550000',
      defaultLines: 0, authorization: 'AUTORIZADA', version: '2' },
    { documentId: 'd-1', code: 'DF00001', kind: 'PRODUTO', series: '1', number: '4880', issueDate: '2026-09-10', customerCode: 'C00001',
      customerName: 'Cooperativa Agroindustrial Noroeste', orderCode: 'PV00001', description: 'Célula de carga', annex: 'I', cents: '1184000',
      defaultLines: 0, authorization: 'AUTORIZADA', version: '2' },
    { documentId: 'd-2', code: 'DF00002', kind: 'SERVICO', series: '1', number: '518', issueDate: '2026-09-24', customerCode: 'C00002',
      customerName: 'Farinheira Santa Helena Ltda.', orderCode: 'PV00001', description: 'Instalação e treinamento', annex: 'III', cents: '10906000',
      defaultLines: 0, authorization: 'PENDENTE', version: '3' },
  ],
  rbt12: { calculatedCents: '334000000', informedCents: null, informedBy: null, informedNotes: null, usedCents: '334000000', usedOrigin: 'CALCULADO', missing: [], months: [] },
  parameters: parametros,
  calculation: {
    source: 'PREVIA', seq: null, result: 'CALCULADA', parameterRevision: 2, rbt12Cents: '334000000', rbt12Origin: 'CALCULADO', revenueCents: '38640000',
    totalTaxCents: '5241579', createdAt: null, createdBy: null,
    memory: {
      competence: '2026-09', parameterRevision: 2, rbt12Cents: '334000000', rbt12Origin: 'CALCULADO', reasons: [],
      warnings: ['ISS limitado a 5% da receita do Anexo III — Serviços: a diferença de R$ 845,04 foi redistribuída aos tributos federais, na proporção de cada um.'],
      annexes: [
        anexo('I', 'Anexo I — Comércio', '1184000', '138365', '0.11686228', [['CPP', '58113'], ['ICMS', '46352']]),
        anexo('II', 'Anexo II — Indústria', '26550000', '3223202', '0.12140120', [['CPP', '1208700'], ['ICMS', '1031425']]),
        anexo('III', 'Anexo III — Serviços', '10906000', '1880012', '0.17238323', [['CPP', '871076'], ['ISS', '545300']], '84504'),
      ],
      taxes: { CPP: '2137889', ICMS: '1077777', ISS: '545300' },
    },
  },
  simulations: [], guides: [], declarations: [],
  steps: [
    { code: 'NOTAS_CONFERIDAS', name: 'Conferir notas de saída da competência', responsible: 'Fiscal', automatic: false, done: false, doneAt: null, doneBy: null, detail: null },
    { code: 'NOTAS_AUTORIZADAS', name: 'Autorizar as notas pendentes', responsible: 'Faturamento', automatic: true, done: false, doneAt: null, doneBy: null, detail: 'Pendentes de autorização: DF00002 (nº 518).' },
    { code: 'PGDAS_TRANSMITIDO', name: 'Transmitir o PGDAS-D', responsible: 'Fiscal', automatic: true, done: false, doneAt: null, doneBy: null, detail: 'Registre a transmissão do PGDAS-D.' },
  ],
  closures: [],
  rbt12Months: [{ competence: '2026-09', revenueCents: '38640000', rbt12Cents: '334000000', bracket: 5, effectiveRate: '0.135652' }],
  dasDueDate: '2026-10-20', differenceCents: null, yearToDateCents: '261640000',
  limits: { annualLimitCents: '480000000', sublimitCents: '360000000', tolerance: '0.2', alertThreshold: '0.9' },
  alerts: ['A nota 518 (Farinheira Santa Helena Ltda., R$ 109.060,00) ainda aguarda autorização e já está somada na receita de 09/2026.'],
  ...extra,
});

const setup: TaxSetup = {
  profile: { regime: 'SIMPLES_NACIONAL', optedSince: null, cnaeMain: '2829-1/99 — Outras máquinas', cnaeSecondary: null, revenueRecognition: 'COMPETENCIA',
    nfseIssuer: 'Padrão nacional', annualLimitCents: '480000000', sublimitCents: '360000000', tolerance: '0.2', alertThreshold: '0.9', version: '1',
    updatedAt: '2026-10-01T12:00:00Z', updatedBy: 'sistema' },
  activities: [{ id: 'a-1', position: 1, name: 'Revenda de peças de reposição e acessórios', framing: 'CNAE 4663-0/00', annex: 'I', annexLabel: 'Anexo I — Comércio',
    taxes: 'IRPJ, CSLL, COFINS, PIS, CPP, ICMS', status: 'ATIVO', items: 1, version: '1' }],
  ibsCbs: { period: '2027-S1', deadline: '2026-09-30', validFrom: '2027-01-01', validTo: '2027-06-30', withdrawalUntil: '2026-11-30', current: null, history: [] },
  revenueStart: '2026-09',
};

const obrigacao = (extra: Partial<TaxObligation>): TaxObligation => ({
  id: 'o-1', code: 'OB00002', templateCode: 'DESTDA', name: 'DeSTDA', competence: '2026-09', dueDate: '2026-10-28', sphere: 'ESTADUAL', kind: 'DECLARACAO',
  responsible: 'Fiscal', detail: 'DIFAL das compras.', status: 'A_ENTREGAR', deliveredOn: null, receiptNumber: null, notes: null, daysToDue: 25, late: false,
  dueThisWeek: false, linked: false, version: '1', updatedAt: '2026-10-01T12:00:00Z', updatedBy: 'sistema', ...extra,
});

/** Servidor falso com estado: depois de um comando, a releitura devolve o que o comando gravou. */
function servidor(extra: (req: TransportRequest) => TransportResponse | undefined = () => undefined) {
  const chamadas: TransportRequest[] = [];
  let atual: TaxPeriod = periodo();
  let config: TaxSetup = setup;
  setTransport(async (req) => {
    chamadas.push(req);
    const r = extra(req);
    if (r) {
      if (r.status < 300 && req.method !== 'GET' && req.path.startsWith('/api/v1/tax-periods/2026-09')) atual = JSON.parse(r.body) as TaxPeriod;
      if (r.status < 300 && req.method !== 'GET' && (req.path.startsWith('/api/v1/tax-ibs') || req.path.startsWith('/api/v1/tax-setup'))) config = JSON.parse(r.body) as TaxSetup;
      return r;
    }
    if (req.path.startsWith('/api/v1/tax-periods/2026-09') && req.method === 'GET') return resposta(200, atual, { etag: `"${atual.version}"` });
    if (req.path.startsWith('/api/v1/tax-periods?year=')) return resposta(200, []);
    if (req.path === '/api/v1/tax-setup') return resposta(200, config, { etag: `"${config.profile.version}"` });
    if (req.path === '/api/v1/bank-accounts') return resposta(200, [{ id: 'c-1', code: 'CX01', name: 'Caixa', status: 'ATIVO' }]);
    return naoAchou();
  });
  return chamadas;
}

describe('Alíquotas', () => {
  it('mostra a fração da API em percentual e converte o percentual digitado em fração', () => {
    expect(percentual('0.11686228')).toBe('11,6862%');
    expect(percentual('0.045')).toBe('4,50%');
    expect(percentualParaFracao('14,70')).toBe('0.147');
  });
});

describe('Apuração do Simples Nacional', () => {
  it('mostra o cálculo por anexo e por tributo com o ISS limitado e calcula com a chave de idempotência', async () => {
    const chamadas = servidor((req) => (req.method === 'POST' && req.path.endsWith('/simulations')
      ? resposta(201, periodo({ calculation: { ...periodo().calculation, source: 'GRAVADO', seq: 1, createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana' }, version: '4' }), { etag: '"4"' })
      : undefined));
    const win = abrir(<TaxPeriodWindow recordKey="2026-09" />);
    expect(await screen.findByRole('table', { name: 'Alíquota efetiva por anexo' })).toBeInTheDocument();
    const calc = screen.getByRole('table', { name: 'Alíquota efetiva por anexo' });
    expect(within(calc).getByText('Anexo I — Comércio')).toBeInTheDocument();
    expect(within(calc).getByText('11,6862%')).toBeInTheDocument();
    expect(within(calc).getByLabelText('Total do DAS')).toHaveTextContent('R$ 52.415,79');
    expect(screen.getByRole('table', { name: 'Repartição do DAS por tributo' })).toHaveTextContent('R$ 5.453,00');
    expect(screen.getByText(/ISS limitado a 5%/)).toBeInTheDocument();
    expect(screen.getByText(/Prévia com os dados de agora/)).toBeInTheDocument();
    expect(screen.getByLabelText('DAS apurado')).toHaveValue('R$ 52.415,79');
    expect(screen.getByText(/ainda aguarda autorização/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Cálculo 1 da competência 09/2026 registrado com sucesso: R$ 52.415,79' }));
    const post = chamadas.find((c) => c.method === 'POST' && c.path === '/api/v1/tax-periods/2026-09/simulations')!;
    expect(post.headers?.['Idempotency-Key']).toBeTruthy();
  });

  it('aberta pelo menu (chave "singleton") usa a competência padrão', async () => {
    const chamadas = servidor(() => undefined);
    abrir(<TaxPeriodWindow recordKey="singleton" />);
    await waitFor(() => expect(chamadas.some((c) => c.path === `/api/v1/tax-periods/${competenciaPadrao()}`)).toBe(true));
    expect(chamadas.some((c) => c.path.includes('singleton') || c.path.includes('NaN'))).toBe(false);
  });

  it('agrupa a receita por anexo e autoriza a nota pendente com a versão lida', async () => {
    const chamadas = servidor((req) => (req.method === 'PUT' && req.path === '/api/v1/documents/d-2/authorization' ? resposta(200, {}) : undefined));
    abrir(<TaxPeriodWindow recordKey="2026-09" />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Receitas' }));
    const tabela = screen.getByRole('table', { name: 'Receitas da competência por anexo' });
    expect(within(tabela).getByText('Anexo II — Indústria')).toBeInTheDocument();
    expect(within(tabela).getByText('NFS-e 518')).toBeInTheDocument();
    expect(within(tabela).getByLabelText('Receita bruta da competência')).toHaveTextContent('R$ 386.400,00');
    await userEvent.click(within(tabela).getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(chamadas.some((c) => c.path === '/api/v1/documents/d-2/authorization')).toBe(true));
    const put = chamadas.find((c) => c.path === '/api/v1/documents/d-2/authorization')!;
    expect(put.headers?.['If-Match']).toBe('"3"');
    expect(JSON.parse(put.body!)).toEqual({ status: 'AUTORIZADA' });
  });

  it('gera a guia DAS com o cálculo sugerido e registra o pagamento pela conta', async () => {
    const guia = { id: 'g-1', seq: 1, documentNumber: '07.18.26', principalCents: '5241579', fineCents: '0', interestCents: '0', totalCents: '5241579',
      dueDate: '2026-10-20', notes: null, titleId: 't-1', titleCode: 'CP00001', titleStatus: 'OPEN', titleBalanceCents: '5241579', status: 'ABERTO' as const,
      paidOn: null, createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana' };
    const chamadas = servidor((req) => {
      if (req.method === 'POST' && req.path.endsWith('/das-guides')) return resposta(201, periodo({ guides: [guia], version: '4' }), { etag: '"4"' });
      if (req.method === 'POST' && req.path === '/api/v1/settlements') return resposta(201, { id: 's-1' });
      return undefined;
    });
    const win = abrir(<TaxPeriodWindow recordKey="2026-09" />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Guia DAS' }));
    expect(screen.getByLabelText('Valor principal')).toHaveValue('52.415,79');
    await userEvent.type(screen.getByLabelText('Número do documento'), '07.18.26');
    await userEvent.click(within(screen.getByRole('group', { name: 'Documento de arrecadação' })).getByRole('button', { name: 'Gerar DAS' }));
    await waitFor(() => expect(chamadas.some((c) => c.path.endsWith('/das-guides'))).toBe(true));
    const post = chamadas.find((c) => c.path.endsWith('/das-guides'))!;
    expect(post.headers?.['If-Match']).toBe('"3"');
    expect(JSON.parse(post.body!)).toMatchObject({ documentNumber: '07.18.26', dueDate: '2026-10-20', principalCents: '5241579', fineCents: '0' });
    await waitFor(() => expect(screen.getByLabelText('Total a pagar')).toHaveValue('R$ 52.415,79'));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Pagamento do DAS de 09/2026 registrado com sucesso: R$ 52.415,79' }));
    const pg = JSON.parse(chamadas.find((c) => c.path === '/api/v1/settlements')!.body!);
    expect(pg).toMatchObject({ direction: 'PAYABLE', accountId: 'c-1', amountCents: '5241579', allocations: [{ titleId: 't-1', amountCents: '5241579' }] });
  });

  it('conclui a etapa manual do fechamento e só deixa encerrar com todas concluídas', async () => {
    const chamadas = servidor((req) => (req.method === 'PUT' && req.path.includes('/closing-steps/') ? resposta(200, periodo({ version: '4' }), { etag: '"4"' }) : undefined));
    abrir(<TaxPeriodWindow recordKey="2026-09" />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Fechamento' }));
    expect(screen.getByRole('button', { name: 'Encerrar competência' })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'Fechamento da competência' })).toHaveAttribute('aria-valuenow', '0');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(chamadas.some((c) => c.path === '/api/v1/tax-periods/2026-09/closing-steps/NOTAS_CONFERIDAS')).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.path.endsWith('NOTAS_CONFERIDAS'))!.body!)).toEqual({ done: true });
  });

  it('Consulta vê a apuração sem os botões de ação', async () => {
    servidor();
    abrir(<TaxPeriodWindow recordKey="2026-09" />, CONSULTA);
    expect(await screen.findByRole('table', { name: 'Alíquota efetiva por anexo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calcular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transmitir PGDAS-D' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gerar DAS' })).toBeNull();
  });
});

describe('Painel fiscal', () => {
  it('mostra os indicadores, o aviso da opção IBS/CBS, as próximas obrigações e os alertas', async () => {
    const painel: FiscalDashboard = {
      competence: '2026-09', status: 'EM_APURACAO', dasCents: '5241579', effectiveRate: '0.135652', dasDueDate: '2026-10-20', rbt12Cents: '334000000', bracket: 5,
      yearToDateCents: '261640000', sublimitCents: '360000000', limitCents: '480000000',
      nextWeek: [obrigacao({ id: 'o-9', name: 'eSocial — eventos periódicos', dueDate: '2026-10-08', dueThisWeek: true, daysToDue: 5 })],
      upcoming: [obrigacao({}), obrigacao({ id: 'o-9', name: 'eSocial — eventos periódicos', dueDate: '2026-10-08', dueThisWeek: true, daysToDue: 5 })],
      series: [{ competence: '2026-09', revenueCents: '38640000', rbt12Cents: '334000000', dasByAnnex: { I: '138365', II: '3223202', III: '1880012' }, dasCents: '5241579' }],
      taxes: { CPP: '2137889', ICMS: '1077777', ISS: '545300' },
      guides: [{ competence: '2026-09', dueDate: '2026-10-20', totalCents: '5241579', status: 'SEM_GUIA', paidOn: null }],
      stepsDone: 2, stepsTotal: 7, alerts: ['A nota 518 ainda aguarda autorização.'], ibsCbsChoice: null, daysToIbsDeadline: -3, period: periodo(),
    };
    servidor((req) => (req.path.startsWith('/api/v1/fiscal/dashboard') ? resposta(200, painel) : undefined));
    const win = abrir(<FiscalDashboardWindow />);
    expect((await screen.findAllByText('R$ 52.415,79'))[0]).toHaveClass('rp-kpi-valor');
    expect(screen.getByText('R$ 3.340.000')).toBeInTheDocument();
    expect(screen.getByText(/5ª faixa · 69,6% do limite/)).toBeInTheDocument();
    expect(screen.getByText(/72,7% do sublimite · faltam R\$ 983.600/)).toBeInTheDocument();
    expect(screen.getByText(/o prazo terminou em 30\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Próximas obrigações' })).toHaveTextContent('DeSTDA');
    expect(screen.getByText('A nota 518 ainda aguarda autorização.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Receita do ano × sublimite' })).toHaveAttribute('aria-valuenow', '73');
    await userEvent.click(screen.getByRole('button', { name: 'Apurar o Simples' }));
    expect(win.open).toHaveBeenCalledWith('tax-period', expect.stringMatching(/^\d{4}-\d{2}$/));
  });
});

describe('Obrigações fiscais e acessórias', () => {
  it('lista as pendentes, entrega com recibo e mostra que o PGDAS-D segue a apuração', async () => {
    const lista = [
      obrigacao({}),
      obrigacao({ id: 'o-2', code: 'OB00003', templateCode: 'PGDAS_D', name: 'PGDAS-D', dueDate: '2026-10-20', linked: true, status: 'EM_APURACAO', daysToDue: 17 }),
      obrigacao({ id: 'o-3', code: 'OB00004', templateCode: 'PGDAS_D', name: 'PGDAS-D', competence: '2026-08', dueDate: '2026-09-20', linked: true, status: 'ENTREGUE',
        deliveredOn: '2026-09-18', receiptNumber: 'R-1', daysToDue: -13 }),
    ];
    const chamadas = servidor((req) => {
      if (req.path === '/api/v1/tax-obligations' && req.method === 'GET') return resposta(200, lista);
      if (req.path === '/api/v1/tax-obligations/o-1/deliveries') return resposta(200, obrigacao({ status: 'ENTREGUE', deliveredOn: '2026-10-03', receiptNumber: 'D-1' }));
      return undefined;
    });
    const win = abrir(<TaxObligationsWindow recordKey="" />);
    const grade = await screen.findByRole('table', { name: 'Obrigações fiscais e acessórias' });
    await waitFor(() => expect(within(grade).getAllByRole('row')).toHaveLength(4));
    expect(within(grade).getByText('em 25 dias')).toBeInTheDocument();
    expect(within(grade).queryByText('R-1')).toBeNull();
    expect(screen.getByText(/2 obrigações · 0 vencem nos próximos 7 dias/)).toBeInTheDocument();
    expect(screen.getByLabelText('Calendário de vencimentos')).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('group', { name: 'DeSTDA' })).getByRole('button', { name: 'Entregue' }));
    await userEvent.type(screen.getByLabelText('Nº do recibo'), 'D-1');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'sucesso', text: expect.stringContaining('marcada como entregue') })));
    const post = chamadas.find((c) => c.path === '/api/v1/tax-obligations/o-1/deliveries')!;
    expect(post.headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(post.body!)).toMatchObject({ receiptNumber: 'D-1' });

    await userEvent.click(within(grade).getAllByText('PGDAS-D')[0]);
    expect(await screen.findByText(/Segue a Apuração do Simples da competência 09\/2026/)).toBeInTheDocument();
  });
});

describe('Classificação fiscal de itens', () => {
  it('mostra o que falta e grava o perfil com a versão do perfil', async () => {
    const item: ItemFiscalProfile = {
      itemId: 'i-1', code: 'P00001', description: 'Kit de pesos-padrão', nature: 'MATERIAL', type: 'PRODUTO', category: 'Peças', ncm: null, serviceCode: null,
      cfopInternal: null, cfopInterstate: null, csosn: null, origin: null, annex: null, activityId: null, activityName: null, nbs: null, issRetention: null,
      review: false, reviewNote: null, status: 'SEM_CLASSIFICACAO', reasons: ['NCM ausente.', 'CFOP ausente.'], version: '0',
    };
    const chamadas = servidor((req) => {
      if (req.path === '/api/v1/fiscal-classification' && req.method === 'GET') return resposta(200, [item]);
      if (req.path === '/api/v1/fiscal-classification/i-1') return resposta(200, { ...item, ncm: '84239000', status: 'CLASSIFICADO', reasons: [], version: '1' });
      return undefined;
    });
    const win = abrir(<FiscalClassificationWindow recordKey="" />);
    expect(await screen.findByText('NCM ausente.')).toBeInTheDocument();
    expect(screen.getByText(/1 de 1 itens · 1 pendência de classificação/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('NCM'), '8423.90.00');
    await userEvent.type(screen.getByLabelText('CFOP interno'), '5.102');
    await userEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Classificação fiscal do item P00001 gravada com sucesso: classificado' }));
    const put = chamadas.find((c) => c.method === 'PUT' && c.path === '/api/v1/fiscal-classification/i-1')!;
    expect(put.headers?.['If-Match']).toBe('"0"');
    expect(JSON.parse(put.body!)).toMatchObject({ ncm: '8423.90.00', cfopInternal: '5.102' });
  });
});

describe('Tabelas e parâmetros do Simples Nacional', () => {
  it('mostra as faixas do anexo com a repartição e registra a opção IBS/CBS', async () => {
    const chamadas = servidor((req) => {
      if (req.path === '/api/v1/tax-parameters') return resposta(200, [parametros]);
      if (req.path === '/api/v1/tax-revenue-history') return resposta(200, []);
      if (req.path === '/api/v1/company-profile') return resposta(200, { address: { city: 'Ivinhema', state: 'MS' } });
      if (req.path === '/api/v1/tax-ibs-cbs-options') {
        return resposta(201, { ...setup, ibsCbs: { ...setup.ibsCbs, current: { id: 'x', period: '2027-S1', choice: 'FORA_DAS', deadline: '2026-09-30',
          withdrawalUntil: '2026-11-30', notes: null, createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana' } } });
      }
      return undefined;
    });
    const win = abrir(<TaxTablesWindow recordKey="" />);
    expect(await screen.findByText('Decisão pendente')).toBeInTheDocument();
    expect(screen.getByLabelText('Município / UF')).toHaveValue('Ivinhema / MS');
    await userEvent.click(screen.getByRole('radio', { name: /fora do DAS/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar opção' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'sucesso' })));
    expect(JSON.parse(chamadas.find((c) => c.path === '/api/v1/tax-ibs-cbs-options')!.body!)).toEqual({ choice: 'FORA_DAS' });
    expect(await screen.findByText('Concluída')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Anexos e faixas' }));
    const faixas = screen.getByRole('table', { name: 'Faixas do Anexo II — Indústria' });
    expect(within(faixas).getAllByRole('row')).toHaveLength(7);
    expect(within(faixas).getByText('De 1.800.000,01 até 3.600.000,00')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Repartição do Anexo II — Indústria' })).toHaveTextContent('37,50%');
  });
});
