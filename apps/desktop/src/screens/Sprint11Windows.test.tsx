import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Funnel, Interaction, Lead, LeadImport, Opportunity, OpportunityStage, SessionUser } from '../api/types';
import { hojeIso } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { CrmAgendaWindow } from './CrmAgendaWindow';
import { FunnelWindow } from './FunnelWindow';
import { LeadImportWindow } from './LeadImportWindow';
import { LeadWindow } from './LeadWindow';
import { OpportunityWindow } from './OpportunityWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['lead.read', 'lead.create', 'lead.update', 'opportunity.read', 'opportunity.create', 'opportunity.update', 'crm_stage.admin',
    'partner.read', 'partner.create', 'proposal.read', 'proposal.create'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['lead.read', 'opportunity.read', 'partner.read', 'proposal.read'] };

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });
const naoAchou = () => resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });

function abrir(janela: ReactNode, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>{janela}</WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

const ETAPAS: OpportunityStage[] = [
  { code: 'QUALIFICACAO', name: 'Qualificação', position: 1, closePercent: '10.00', version: '1', updatedAt: null, updatedBy: null },
  { code: 'VISITA_TECNICA', name: 'Visita técnica', position: 2, closePercent: '25.00', version: '1', updatedAt: null, updatedBy: null },
  { code: 'PROPOSTA', name: 'Proposta', position: 3, closePercent: '50.00', version: '1', updatedAt: null, updatedBy: null },
  { code: 'NEGOCIACAO', name: 'Negociação', position: 4, closePercent: '75.00', version: '1', updatedAt: null, updatedBy: null },
];

const prospeccao = (p: Partial<Lead> = {}): Lead => ({
  id: 'l-1', code: 'PS00001', companyName: 'Fecularia Noroeste Ltda.', tradeName: null, city: 'Paranavaí', state: 'PR', hasRenda: 'NAO', rating: null,
  stage: 'IDENTIFICADO', discardReason: null, owner: 'ana', source: 'LISTA', contactName: 'Sr. Teste', contactPhone: null, contactEmail: null, notes: null,
  customerId: null, customerCode: null, customerName: null, nextActionDate: null, nextActionNote: null, lastInteraction: null, openOpportunities: 0,
  imported: false, version: '1', createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null, ...p,
});

const oportunidade = (p: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o-1', code: 'OP00001', name: 'Balança automática', leadId: 'l-1', leadCode: 'PS00001', leadName: 'Fecularia Noroeste Ltda.', customerId: null,
  customerCode: null, customerName: null, unitId: null, unitName: null, owner: 'ana', source: 'LISTA', interest: 'MEDIO', potentialCents: '15000000',
  weightedCents: '1500000', closePercent: '10.00', expectedClose: '2026-12-01', stage: 'QUALIFICACAO', stageName: 'Qualificação', status: 'ABERTA',
  lossReason: null, lossNote: null, closedAt: null, wonOrderCode: null, nextActionDate: '2026-12-31', nextActionNote: 'Ligar para o comprador',
  lastInteraction: null, notes: null, competitors: [], version: '1', createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null, ...p,
});

/** Respostas comuns: responsáveis, etapas e clientes. */
const comuns = (req: TransportRequest): TransportResponse | null => {
  if (req.path === '/api/v1/crm/owners') return resposta(200, [{ username: 'ana', displayName: 'Ana' }]);
  if (req.path === '/api/v1/opportunity-stages') return resposta(200, ETAPAS);
  if (req.path.startsWith('/api/v1/customers')) return resposta(200, []);
  return null;
};

describe('Prospecção', () => {
  it('cadastra com estrela vazia (desconhecida, nunca zero), com Idempotency-Key', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path === '/api/v1/leads' && req.method === 'POST') {
        posts.push(req);
        return resposta(201, prospeccao(), { etag: '"1"' });
      }
      return naoAchou();
    });
    const win = abrir(<LeadWindow recordKey="novo-1" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Empresa'), 'Fecularia Noroeste Ltda.');
    await user.type(screen.getByLabelText('Cidade / UF'), 'Paranavaí');
    await user.type(screen.getByLabelText('UF'), 'pr');
    expect(screen.getByLabelText('Classificação')).toHaveTextContent('Sem classificação (desconhecida)');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const body = JSON.parse(posts[0].body!);
    expect(body).toMatchObject({ companyName: 'Fecularia Noroeste Ltda.', city: 'Paranavaí', state: 'PR', rating: null, owner: 'ana' });
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Prospecção PS00001 adicionada com sucesso' });
  });

  it('registra interação com a próxima ação e abre a oportunidade a partir da prospecção', async () => {
    const posts: TransportRequest[] = [];
    let lead = prospeccao();
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path === '/api/v1/leads/l-1' && req.method === 'GET') return resposta(200, lead, { etag: `"${lead.version}"` });
      if (req.path === '/api/v1/leads/l-1/interactions' && req.method === 'GET') return resposta(200, []);
      if (req.path === '/api/v1/leads/l-1/interactions' && req.method === 'POST') {
        posts.push(req);
        lead = prospeccao({ stage: 'CONTATADO', version: '2', nextActionDate: '2026-12-31', nextActionNote: 'Enviar catálogo', lastInteraction: hojeIso() });
        const i: Interaction = { id: 'i-1', leadId: 'l-1', opportunityId: null, kind: 'LIGACAO', occurredOn: hojeIso(), contactName: 'Sr. Teste',
          summary: 'Interesse na balança', nextActionDate: '2026-12-31', nextActionNote: 'Enviar catálogo', createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana' };
        return resposta(201, i);
      }
      return naoAchou();
    });
    const win = abrir(<LeadWindow recordKey="l-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Empresa')).toHaveValue('Fecularia Noroeste Ltda.'));
    await user.click(screen.getByRole('button', { name: 'Registrar interação' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Registrar interação' });
    await user.type(within(dialogo).getByLabelText('Resumo'), 'Interesse na balança');
    await user.type(within(dialogo).getByLabelText('Próxima ação em'), '31/12/2026');
    await user.type(within(dialogo).getByLabelText('Próxima ação'), 'Enviar catálogo');
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toMatchObject({ kind: 'LIGACAO', summary: 'Interesse na balança', nextActionDate: '2026-12-31', nextActionNote: 'Enviar catálogo', contactName: 'Sr. Teste' });
    await waitFor(() => expect(screen.getByLabelText('Próxima ação')).toHaveValue('Enviar catálogo'));
    expect(screen.getByText('Contatado', { selector: '.rp-badge' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir oportunidade' }));
    expect(win.open).toHaveBeenCalledWith('opportunity', expect.stringMatching(/^novo-\d+:lead:l-1$/));
  });

  it('Consulta só vê: sem Adicionar, interação, conversão nem descarte', async () => {
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path === '/api/v1/leads/l-1') return resposta(200, prospeccao(), { etag: '"1"' });
      if (req.path === '/api/v1/leads/l-1/interactions') return resposta(200, []);
      return naoAchou();
    });
    abrir(<LeadWindow recordKey="l-1" />, CONSULTA);
    await waitFor(() => expect(screen.getByLabelText('Empresa')).toHaveValue('Fecularia Noroeste Ltda.'));
    expect(screen.getByLabelText('Empresa')).toHaveAttribute('readonly');
    for (const b of ['Atualizar', 'Registrar interação', 'Abrir oportunidade', 'Converter em cliente', 'Descartar']) {
      expect(screen.queryByRole('button', { name: b })).not.toBeInTheDocument();
    }
  });
});

describe('Oportunidade', () => {
  it('nova a partir da prospecção exige a próxima ação e mostra o ponderado da primeira etapa', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path === '/api/v1/leads/l-1') return resposta(200, prospeccao());
      if (req.path === '/api/v1/opportunities' && req.method === 'POST') {
        posts.push(req);
        const body = JSON.parse(req.body!);
        if (!body.nextActionDate) {
          return resposta(422, { code: 'OPPORTUNITY_INVALID', message: 'Corrija os campos indicados.', details: [{ field: 'nextActionDate', message: 'Informe a data da próxima ação.' }] });
        }
        return resposta(201, oportunidade(), { etag: '"1"' });
      }
      return naoAchou();
    });
    abrir(<OpportunityWindow recordKey="novo-1:lead:l-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Prospecção')).toHaveValue('PS00001 — Fecularia Noroeste Ltda.'));
    expect(screen.getByLabelText('Nome')).toHaveValue('Balança — Fecularia Noroeste Ltda.');
    await user.type(screen.getByLabelText('Valor potencial'), '150000');
    // Qualificação: 10% de R$ 150.000,00.
    expect(screen.getByLabelText('Valor ponderado')).toHaveValue('R$ 15.000,00 (10,00% de fechamento)');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Informe a data da próxima ação.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Próxima ação em'), '31/12/2026');
    await user.type(screen.getByLabelText('Próxima ação'), 'Ligar para o comprador');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(JSON.parse(posts[1].body!)).toMatchObject({ leadId: 'l-1', potentialCents: '15000000', nextActionDate: '2026-12-31', nextActionNote: 'Ligar para o comprador' });
  });

  it('muda de etapa com a próxima ação e a versão lida; marcar como perdida pede o motivo da lista', async () => {
    const posts: TransportRequest[] = [];
    let opp = oportunidade({ customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Noroeste Ltda.' });
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path === '/api/v1/opportunities/o-1' && req.method === 'GET') return resposta(200, opp, { etag: `"${opp.version}"` });
      if (req.path === '/api/v1/opportunities/o-1/stage') {
        posts.push(req);
        opp = { ...opp, stage: 'VISITA_TECNICA', stageName: 'Visita técnica', closePercent: '25.00', weightedCents: '3750000', version: '2' };
        return resposta(200, opp, { etag: '"2"' });
      }
      if (req.path === '/api/v1/opportunities/o-1/loss') {
        posts.push(req);
        opp = { ...opp, status: 'PERDIDA', lossReason: 'CONCORRENTE', closePercent: '0.00', weightedCents: '0', version: '3', nextActionDate: null, nextActionNote: null };
        return resposta(200, opp, { etag: '"3"' });
      }
      return naoAchou();
    });
    const win = abrir(<OpportunityWindow recordKey="o-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('Qualificação'));
    await user.click(screen.getByRole('button', { name: 'Mudar etapa' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Mudar etapa' });
    // A próxima etapa vem sugerida.
    expect(within(dialogo).getByLabelText('Etapa')).toHaveTextContent('Visita técnica (25,00%)');
    await user.type(within(dialogo).getByLabelText('Próxima ação em'), '31/12/2026');
    await user.type(within(dialogo).getByLabelText('Próxima ação'), 'Visitar a fábrica');
    await user.click(within(dialogo).getByRole('button', { name: 'Mudar etapa' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(posts[0].body!)).toEqual({ stage: 'VISITA_TECNICA', nextActionDate: '2026-12-31', nextActionNote: 'Visitar a fábrica' });
    await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('Visita técnica'));
    expect(screen.getByLabelText('Valor ponderado')).toHaveValue('R$ 37.500,00 (25,00% de fechamento)');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Oportunidade OP00001 na etapa Visita técnica (25,00%)' });

    await user.click(screen.getByRole('button', { name: 'Marcar como perdida' }));
    const perda = screen.getByRole('alertdialog', { name: 'Registrar perda' });
    await user.click(within(perda).getByRole('button', { name: 'Registrar perda' }));
    expect(within(perda).getByText('Escolha o motivo da perda.')).toBeInTheDocument();
    await escolher(user, within(perda).getByLabelText('Motivo'), 'Concorrente');
    await user.click(within(perda).getByRole('button', { name: 'Registrar perda' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(JSON.parse(posts[1].body!)).toEqual({ lossReason: 'CONCORRENTE', lossNote: null });
    await waitFor(() => expect(screen.getByText('Perdida', { selector: '.rp-badge' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mudar etapa' })).not.toBeInTheDocument();
  });
});

describe('Funil, agenda e carga', () => {
  it('funil mostra o ponderado por etapa e "Não calculável" quando ninguém entrou na etapa', async () => {
    const funil: Funnel = {
      from: '2026-01-01', to: '2026-10-03',
      stages: [
        { code: 'QUALIFICACAO', name: 'Qualificação', closePercent: '10.00', count: 1, potentialCents: '12000000', weightedCents: '1200000' },
        { code: 'VISITA_TECNICA', name: 'Visita técnica', closePercent: '25.00', count: 1, potentialCents: '15000000', weightedCents: '3750000' },
        { code: 'PROPOSTA', name: 'Proposta', closePercent: '50.00', count: 0, potentialCents: '0', weightedCents: '0' },
        { code: 'NEGOCIACAO', name: 'Negociação', closePercent: '75.00', count: 1, potentialCents: '9876543', weightedCents: '7407407' },
      ],
      openCount: 3, openPotentialCents: '36876543', openWeightedCents: '12357407', won: { count: 0, potentialCents: '0' },
      lost: { count: 1, potentialCents: '8000000' }, lostByReason: { CONCORRENTE: { count: 1, potentialCents: '8000000' } },
      conversion: [
        { code: 'QUALIFICACAO', name: 'Qualificação', entered: 3, advanced: 2, rate: '66.67' },
        { code: 'PROPOSTA', name: 'Proposta', entered: 0, advanced: 0, rate: null },
      ],
    };
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path.startsWith('/api/v1/crm/funnel')) return resposta(200, funil);
      return naoAchou();
    });
    abrir(<FunnelWindow />);
    const etapas = await screen.findByRole('table', { name: 'Oportunidades abertas por etapa' });
    expect(within(etapas).getByText('R$ 123.574,07')).toBeInTheDocument();
    expect(within(etapas).getByText('R$ 74.074,07')).toBeInTheDocument();
    const conversao = screen.getByRole('table', { name: 'Conversão por etapa' });
    expect(within(conversao).getByText('66,67%')).toBeInTheDocument();
    expect(within(conversao).getByText('Não calculável')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Perdas por motivo' })).getByText('Concorrente')).toBeInTheDocument();
  });

  it('agenda agrupa as próximas ações e a seta abre a ficha', async () => {
    setTransport(async (req) => {
      const c = comuns(req);
      if (c) return c;
      if (req.path.startsWith('/api/v1/crm/agenda')) {
        return resposta(200, [
          { bucket: 'VENCIDA', kind: 'PROSPECCAO', id: 'l-1', code: 'PS00001', name: 'Fecularia Noroeste', party: 'Paranavaí / PR', owner: 'ana', stage: 'CONTATADO', nextActionDate: '2026-10-01', nextActionNote: 'Enviar catálogo' },
          { bucket: 'HOJE', kind: 'OPORTUNIDADE', id: 'o-1', code: 'OP00001', name: 'Balança', party: 'Fecularia Noroeste', owner: 'ana', stage: 'NEGOCIACAO', nextActionDate: '2026-10-03', nextActionNote: 'Negociar' },
        ]);
      }
      return naoAchou();
    });
    const win = abrir(<CrmAgendaWindow />);
    const user = userEvent.setup();
    const agenda = await screen.findByRole('table', { name: 'Agenda do CRM' });
    await waitFor(() => expect(within(agenda).getByText('Vencidas (1)')).toBeInTheDocument());
    expect(within(agenda).getByText('Hoje (1)')).toBeInTheDocument();
    expect(within(agenda).getByText('Negociação')).toBeInTheDocument();
    await user.click(within(agenda).getByRole('link', { name: 'Abrir OP00001' }));
    expect(win.open).toHaveBeenCalledWith('opportunity', 'o-1');
  });

  it('carga mostra erros e avisos na prévia e confirma com Idempotency-Key', async () => {
    const chamadas: TransportRequest[] = [];
    const previa: LeadImport = {
      id: 'imp-1', fileName: 'prospeccao-exemplo.json', status: 'PREVIA', source: 'Lista de exemplo', lineCount: 3, toLoad: 2, blocked: 1, warnings: 1,
      lines: [
        { line: 1, companyName: 'Amidonaria Beta', tradeName: null, city: 'Nova Londrina', state: 'PR', hasRenda: 'SIM', rating: 4, contactName: null, contactPhone: null, contactEmail: null, notes: null, blocked: false },
        { line: 2, companyName: 'Amidonaria Beta', tradeName: null, city: 'Nova Londrina', state: 'PR', hasRenda: 'SIM', rating: null, contactName: null, contactPhone: null, contactEmail: null, notes: null, blocked: false },
        { line: 3, companyName: 'Mandioca Épsilon', tradeName: null, city: 'Naviraí', state: 'MS', hasRenda: 'NAO', rating: null, contactName: null, contactPhone: null, contactEmail: null, notes: null, blocked: true },
      ],
      problems: [
        { severity: 'AVISO', line: 2, message: 'Mesmo nome e cidade da linha 1.' },
        { severity: 'ERRO', line: 3, message: 'Estrelas 7 fora de 1 a 5. A linha não será carregada.' },
      ],
      createdCodes: [], createdAt: '2026-10-03T12:00:00Z', createdBy: 'ana', confirmedAt: null, confirmedBy: null,
    };
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/lead-imports') return resposta(201, previa);
      if (req.path === '/api/v1/lead-imports/imp-1/confirmation') {
        return resposta(200, { ...previa, status: 'CONFIRMADA', createdCodes: ['PS00001', 'PS00002'], confirmedAt: '2026-10-03T12:01:00Z', confirmedBy: 'ana' });
      }
      return naoAchou();
    });
    const win = abrir(<LeadImportWindow />);
    const user = userEvent.setup();
    const arquivo = new File(['{"prospeccoes":[]}'], 'prospeccao-exemplo.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Lista de prospecção (JSON)'), arquivo);
    const grade = await screen.findByRole('table', { name: 'Linhas da lista' });
    expect(within(grade).getByText(/Aviso: Mesmo nome e cidade da linha 1/)).toBeInTheDocument();
    expect(within(grade).getByText(/Erro: Estrelas 7 fora de 1 a 5/)).toBeInTheDocument();
    expect(within(grade).getByText('Sem classificação')).toBeInTheDocument();
    expect(screen.getByLabelText('Linhas que serão carregadas')).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: 'Confirmar carga' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Lista prospeccao-exemplo.json carregada com sucesso: 2 prospecções adicionadas' }));
    const confirmacao = chamadas.find((c) => c.path.endsWith('/confirmation'))!;
    expect(confirmacao.headers?.['Idempotency-Key']).toBeTruthy();
  });
});
