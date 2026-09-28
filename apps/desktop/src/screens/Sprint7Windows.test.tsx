import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { SessionUser, TaxParameters, TaxPeriod, TaxPeriodSummary, TaxSimulation } from '../api/types';
import { percentual, percentualParaFracao } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { TaxParametersWindow } from './TaxParametersWindow';
import { TaxPeriodsWindow } from './TaxPeriodsWindow';
import { TaxPeriodWindow } from './TaxPeriodWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['document.read', 'tax.read', 'tax_parameter.admin', 'tax_period.simulate', 'tax_period.confirm', 'tax_period.close', 'tax_period.reopen'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['document.read', 'tax.read'] };

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

const faixa = (upToCents: string, rate: string, deductionCents: string) => ({ upToCents, rate, deductionCents });

/** Revisão 1: tabelas da planilha FOURTECH (Anexo II e Anexo III). */
const revisao1: TaxParameters = {
  id: 'par-1', revision: 1, regime: 'SIMPLES_NACIONAL', validFrom: '2026-09', productAnnex: 'II', serviceAnnex: 'III',
  brackets: {
    PRODUTO: [faixa('18000000', '0.045', '0'), faixa('36000000', '0.078', '594000'), faixa('72000000', '0.100', '1386000'),
      faixa('180000000', '0.112', '2250000'), faixa('360000000', '0.147', '8550000'), faixa('480000000', '0.300', '72000000')],
    SERVICO: [faixa('18000000', '0.060', '0'), faixa('36000000', '0.112', '936000'), faixa('72000000', '0.135', '1764000'),
      faixa('180000000', '0.160', '3564000'), faixa('360000000', '0.210', '12564000'), faixa('480000000', '0.330', '64800000')],
  },
  source: 'Planilha FOURTECH · Parâmetros do Simples Nacional', notes: null, createdAt: '2026-09-28T12:00:00Z', createdBy: 'sistema',
};

/** Simulação do exemplo do planning: RBT12 informado de R$ 300.000,00, 5,82% e 8,08%. */
const simulacao: TaxSimulation = {
  id: 's-2', seq: 2, result: 'CALCULADA', parameterRevision: 1, rbt12Cents: '30000000', rbt12Origin: 'INFORMADO',
  productRevenueCents: '1286174', serviceRevenueCents: '713826', productTaxCents: '74855', serviceTaxCents: '57677', totalTaxCents: '132532',
  memory: {
    competence: '2026-10', parameterRevision: 1, parameterValidFrom: '2026-09', parameterSource: 'Planilha FOURTECH', rbt12Cents: '30000000',
    rbt12Origin: 'INFORMADO', rbt12Months: [], rbt12Missing: ['2026-09'], informedRbt12Cents: '30000000', productRevenueCents: '1286174',
    serviceRevenueCents: '713826', reasons: [], warnings: [],
    kinds: [
      { kind: 'PRODUTO', annex: 'II', bracket: 2, nominalRate: '0.078', deductionCents: '594000', effectiveRate: '0.05820000', revenueCents: '1286174', taxCents: '74855' },
      { kind: 'SERVICO', annex: 'III', bracket: 2, nominalRate: '0.112', deductionCents: '936000', effectiveRate: '0.08080000', revenueCents: '713826', taxCents: '57677' },
    ],
  },
  createdAt: '2026-09-28T12:05:00Z', createdBy: 'ana',
};

const naoCalculavel: TaxSimulation = {
  ...simulacao, id: 's-1', seq: 1, result: 'NAO_CALCULAVEL', rbt12Cents: null, rbt12Origin: null, productTaxCents: null, serviceTaxCents: null, totalTaxCents: null,
  memory: { ...simulacao.memory, rbt12Cents: null, rbt12Origin: null, informedRbt12Cents: null, kinds: [],
    reasons: ['RBT12 desconhecido: o Renda+ não tem a receita de 09/2026; informe o RBT12 que o contador usou no PGDAS-D.'] },
};

const competencia = (extra: Partial<TaxPeriod> = {}): TaxPeriod => ({
  competence: '2026-10', status: 'ABERTA', version: '0', revenueKnown: true, productRevenueCents: '1286174', serviceRevenueCents: '713826',
  revenueCents: '2000000',
  documents: [
    { id: 'd-1', code: 'DF00001', kind: 'PRODUTO', series: '1', number: '1234', issueDate: '2026-09-28', customerCode: 'C00001',
      customerName: 'Fecularia Vale Ltda.', orderCode: 'PV00001', productCents: '1286174', serviceCents: '0', totalCents: '1286174' },
    { id: 'd-2', code: 'DF00002', kind: 'SERVICO', series: '1', number: '5001', issueDate: '2026-09-28', customerCode: 'C00001',
      customerName: 'Fecularia Vale Ltda.', orderCode: 'PV00001', productCents: '0', serviceCents: '713826', totalCents: '713826' },
  ],
  rbt12: { calculatedCents: null, informedCents: null, informedBy: null, informedNotes: null, usedCents: null, usedOrigin: null, missing: ['2026-09'] },
  parameters: revisao1, simulations: [], confirmations: [], closures: [], differenceCents: null,
  ...extra,
});

describe('Alíquotas', () => {
  it('mostra a fração da API em percentual e converte o percentual digitado em fração', () => {
    expect(percentual('0.05820000')).toBe('5,82%');
    expect(percentual('0.045')).toBe('4,50%');
    expect(percentual('0.168')).toBe('16,80%');
    expect(percentual('0.12345678')).toBe('12,3456%');
    expect(percentualParaFracao('7,80')).toBe('0.078');
    expect(percentualParaFracao('30%')).toBe('0.3');
    expect(percentualParaFracao('0,5')).toBe('0.005');
    expect(percentualParaFracao('abc')).toBe('abc');
  });
});

describe('Impostos gerenciais', () => {
  it('lista as competências do ano com receita, simulação, contador e diferença; a seta abre a competência com a sequência da lista', async () => {
    const linha = (competence: string, extra: Partial<TaxPeriodSummary> = {}): TaxPeriodSummary => ({
      competence, status: 'ABERTA', version: '0', revenueKnown: true, productRevenueCents: '0', serviceRevenueCents: '0', revenueCents: '0',
      documentCount: 0, simulationResult: null, simulationCents: null, confirmedCents: null, dueDate: null, differenceCents: null, ...extra,
    });
    const ano = new Date().getFullYear();
    setTransport(async (req) => (req.path === `/api/v1/tax-periods?year=${ano}`
      ? resposta(200, [
          linha(`${ano}-09`),
          linha(`${ano}-10`, { status: 'FECHADA', productRevenueCents: '1286174', serviceRevenueCents: '713826', revenueCents: '2000000', documentCount: 2,
            simulationResult: 'CALCULADA', simulationCents: '132532', confirmedCents: '133000', dueDate: `${ano}-11-20`, differenceCents: '468' }),
        ])
      : naoAchou()));
    const win = abrir(<TaxPeriodsWindow />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Impostos gerenciais' });
    await waitFor(() => expect(grade).toHaveTextContent(`10/${ano}`));
    expect(grade).toHaveTextContent('R$ 12.861,74');
    expect(grade).toHaveTextContent('R$ 1.325,32');
    expect(grade).toHaveTextContent('R$ 1.330,00');
    expect(grade).toHaveTextContent('R$ 4,68');
    expect(grade).toHaveTextContent(`20/11/${ano}`);
    expect(grade).toHaveTextContent('Fechada');
    expect(screen.getByText('Receita da lista: R$ 20.000,00 · Simulado: R$ 1.325,32 · Contador: R$ 1.330,00')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: `Abrir competência 10/${ano}` }));
    expect(win.open).toHaveBeenCalledWith('tax-period', `${ano}-10`, [`${ano}-09`, `${ano}-10`]);
  });
});

describe('Competência fiscal', () => {
  it('simula sem RBT12 (não calculável), informa o RBT12 e simula de novo com a mesma chave depois de uma queda de rede', async () => {
    const posts: TransportRequest[] = [];
    let atual = competencia();
    let falhaDeRede = true;
    setTransport(async (req) => {
      if (req.path === '/api/v1/tax-periods/2026-10' && req.method === 'GET') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/tax-periods/2026-10/simulations') {
        posts.push(req);
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        atual = atual.rbt12.informedCents
          ? { ...atual, version: '3', simulations: [simulacao, naoCalculavel] }
          : { ...atual, version: '1', simulations: [naoCalculavel] };
        return resposta(201, atual, { etag: `"${atual.version}"` });
      }
      if (req.path === '/api/v1/tax-periods/2026-10/rbt12') {
        posts.push(req);
        atual = { ...atual, version: '2', rbt12: { ...atual.rbt12, informedCents: '30000000', informedBy: 'Escritório contábil', usedCents: '30000000', usedOrigin: 'INFORMADO' } };
        return resposta(200, atual, { etag: '"2"' });
      }
      return naoAchou();
    });
    const win = abrir(<TaxPeriodWindow recordKey="2026-10" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Receita documentada')).toHaveValue('R$ 20.000,00'));
    expect(screen.getByLabelText('Receita de produto')).toHaveValue('R$ 12.861,74');
    expect(screen.getByLabelText('Parâmetros vigentes')).toHaveValue('Revisão 1 — Simples Nacional, produto Anexo II, serviço Anexo III');
    expect(screen.getByLabelText('RBT12 usado')).toHaveValue('Desconhecido: informe o RBT12 do PGDAS-D');
    expect(screen.getByRole('table', { name: 'Notas da competência' })).toHaveTextContent('Nº 5001 / série 1Serviço (NFS-e)');
    // Fechar só depois da conferência do contador.
    expect(screen.getByRole('button', { name: 'Fechar competência' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Simular' }));
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    await waitFor(() => expect(screen.getByLabelText('Motivos')).toHaveTextContent('RBT12 desconhecido'));
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Simulação 1 da competência 10/2026 registrada: não calculável' });

    await user.click(screen.getByRole('tab', { name: /RBT12/ }));
    await user.type(screen.getByLabelText('RBT12 do PGDAS-D'), '300.000,00');
    await user.type(screen.getByLabelText('Informado por'), 'Escritório contábil');
    await user.click(screen.getByRole('button', { name: 'Informar RBT12' }));
    await waitFor(() => expect(screen.getByLabelText('RBT12 usado')).toHaveValue('R$ 300.000,00 (informado pelo contador)'));
    expect(posts[2].headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(posts[2].body!)).toEqual({ amountCents: '30000000', informedBy: 'Escritório contábil', notes: null });

    await user.click(screen.getByRole('button', { name: 'Simular' }));
    await waitFor(() => expect(screen.getByLabelText('Total simulado')).toHaveTextContent('R$ 1.325,32'));
    expect(posts[3].headers?.['Idempotency-Key']).not.toBe(posts[0].headers?.['Idempotency-Key']);
    const memoria = screen.getByRole('table', { name: 'Memória do cálculo' });
    expect(memoria).toHaveTextContent('ProdutoII2ª7,80%R$ 5.940,005,82%R$ 12.861,74R$ 748,55');
    expect(memoria).toHaveTextContent('ServiçoIII2ª11,20%R$ 9.360,008,08%R$ 7.138,26R$ 576,77');
    expect(screen.getByRole('table', { name: 'Simulações anteriores' })).toHaveTextContent('Não calculável');
    expect(screen.getByLabelText('Simulação gerencial')).toHaveValue('R$ 1.325,32');
  });

  it('registra a conferência do contador, fecha e reabre com motivo', async () => {
    const posts: TransportRequest[] = [];
    let atual = competencia({ version: '3', simulations: [simulacao], rbt12: { ...competencia().rbt12, informedCents: '30000000', usedCents: '30000000', usedOrigin: 'INFORMADO' } });
    setTransport(async (req) => {
      if (req.path === '/api/v1/tax-periods/2026-10' && req.method === 'GET') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/tax-periods/2026-10/confirmations') {
        posts.push(req);
        atual = { ...atual, version: '4', differenceCents: '468', confirmations: [{ id: 'c-1', seq: 1, amountCents: '133000', dueDate: '2026-11-20',
          notes: null, simulationSeq: 2, createdAt: '2026-09-28T12:10:00Z', createdBy: 'ana' }] };
        return resposta(201, atual, { etag: '"4"' });
      }
      if (req.path === '/api/v1/tax-periods/2026-10/closures') {
        posts.push(req);
        atual = { ...atual, version: '5', status: 'FECHADA', closures: [{ action: 'FECHAMENTO', reason: null, revenueCents: '2000000', occurredAt: '2026-09-28T12:11:00Z', actor: 'ana' }] };
        return resposta(200, atual, { etag: '"5"' });
      }
      if (req.path === '/api/v1/tax-periods/2026-10/reopenings') {
        posts.push(req);
        atual = { ...atual, version: '6', status: 'ABERTA' };
        return resposta(200, atual, { etag: '"6"' });
      }
      return naoAchou();
    });
    const win = abrir(<TaxPeriodWindow recordKey="2026-10" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Conferência/ }));
    await user.type(screen.getByLabelText('Valor do contador', { selector: 'input:not([readonly])' }), '1.330,00');
    const venc = screen.getByLabelText('Vencimento', { selector: 'input:not([readonly])' });
    await user.clear(venc);
    await user.type(venc, '20/11/2026');
    await user.click(screen.getByRole('button', { name: 'Registrar conferência' }));
    await waitFor(() => expect(screen.getByLabelText('Diferença')).toHaveValue('R$ 4,68'));
    expect(posts[0].headers?.['If-Match']).toBe('"3"');
    expect(JSON.parse(posts[0].body!)).toEqual({ amountCents: '133000', dueDate: '2026-11-20', notes: null });
    expect(win.notify).toHaveBeenCalledWith({
      tone: 'sucesso', text: 'Conferência do contador da competência 10/2026 registrada com sucesso: R$ 1.330,00; diferença R$ 4,68',
    });
    expect(screen.getByRole('table', { name: 'Conferências do contador' })).toHaveTextContent('Simulação 2');

    await user.click(screen.getByRole('button', { name: 'Fechar competência' }));
    await waitFor(() => expect(screen.getByText(/Competência fechada: notas de 10\/2026/)).toBeInTheDocument());
    expect(posts[1].headers?.['If-Match']).toBe('"4"');
    expect(screen.queryByRole('button', { name: 'Simular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar conferência' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reabrir competência' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Reabrir competência' });
    await user.click(within(dialogo).getByRole('button', { name: 'Reabrir' }));
    expect(within(dialogo).getByText('Informe o motivo da reabertura.')).toBeInTheDocument();
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Nota de serviço com valor errado');
    await user.click(within(dialogo).getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simular' })).toBeEnabled());
    expect(JSON.parse(posts[2].body!)).toEqual({ reason: 'Nota de serviço com valor errado' });
    expect(posts[2].headers?.['If-Match']).toBe('"5"');
  });

  it('Consulta vê a competência e a simulação sem simular, conferir, fechar nem informar o RBT12', async () => {
    setTransport(async (req) => (req.path === '/api/v1/tax-periods/2026-10' ? resposta(200, competencia({ version: '3', simulations: [simulacao] })) : naoAchou()));
    abrir(<TaxPeriodWindow recordKey="2026-10" />, CONSULTA);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Simulação gerencial')).toHaveValue('R$ 1.325,32'));
    expect(screen.queryByRole('button', { name: 'Simular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar competência' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /RBT12/ }));
    expect(screen.queryByRole('button', { name: 'Informar RBT12' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Conferência/ }));
    expect(screen.queryByRole('button', { name: 'Registrar conferência' })).toBeNull();
  });
});

describe('Parâmetros fiscais', () => {
  it('mostra as faixas da revisão e adiciona uma nova revisão com a vigência e as alíquotas como fração', async () => {
    const posts: TransportRequest[] = [];
    const revisao2: TaxParameters = { ...revisao1, id: 'par-2', revision: 2, validFrom: '2027-01', source: 'E-mail do contador' };
    let revisoes = [revisao1];
    setTransport(async (req) => {
      if (req.path === '/api/v1/tax-parameters' && req.method === 'GET') return resposta(200, revisoes);
      if (req.path === '/api/v1/tax-parameters') {
        posts.push(req);
        revisoes = [revisao2, revisao1];
        return resposta(201, revisao2);
      }
      return naoAchou();
    });
    const win = abrir(<TaxParametersWindow />);
    const user = userEvent.setup();
    const produto = await screen.findByRole('table', { name: 'Faixas de produto' });
    await waitFor(() => expect(produto).toHaveTextContent('2ªR$ 180.000,01R$ 360.000,007,80%R$ 5.940,00'));
    expect(produto).toHaveTextContent('6ªR$ 3.600.000,01R$ 4.800.000,0030,00%R$ 720.000,00');
    expect(screen.getByRole('table', { name: 'Faixas de serviço' })).toHaveTextContent('2ªR$ 180.000,01R$ 360.000,0011,20%R$ 9.360,00');
    expect(screen.getByLabelText('Anexos')).toHaveValue('Produto II, serviço III');

    await user.click(screen.getByRole('button', { name: 'Nova revisão' }));
    await user.type(screen.getByLabelText('Vigência a partir de'), '01/2027');
    await user.type(screen.getByLabelText('Fonte das tabelas'), 'E-mail do contador');
    const aliquota = screen.getByLabelText('Produto: alíquota da 2ª faixa');
    expect(aliquota).toHaveValue('7,80');
    await user.clear(aliquota);
    await user.type(aliquota, '8');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({
      tone: 'sucesso', text: 'Revisão 2 dos parâmetros fiscais adicionada com sucesso (vigência 01/2027)' }));
    const corpo = JSON.parse(posts[0].body!);
    expect(corpo).toMatchObject({ validFrom: '2027-01', productAnnex: 'II', serviceAnnex: 'III', source: 'E-mail do contador' });
    expect(corpo.brackets.PRODUTO[1]).toEqual({ upToCents: '36000000', rate: '0.08', deductionCents: '594000' });
    expect(corpo.brackets.SERVICO[5]).toEqual({ upToCents: '480000000', rate: '0.33', deductionCents: '64800000' });
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
  });

  it('Consulta vê as revisões sem poder criar outra', async () => {
    setTransport(async (req) => (req.path === '/api/v1/tax-parameters' ? resposta(200, [revisao1]) : naoAchou()));
    abrir(<TaxParametersWindow />, CONSULTA);
    expect(await screen.findByRole('table', { name: 'Faixas de produto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova revisão' })).toBeNull();
  });
});
