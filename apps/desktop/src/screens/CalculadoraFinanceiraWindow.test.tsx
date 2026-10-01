import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setTransport, type TransportResponse } from '../api/client';
import type { SessionUser, TaxParameters } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { CalculadoraFinanceiraWindow } from './CalculadoraFinanceiraWindow';

const USUARIO: SessionUser = { id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['tax.read'] };
const resposta = (status: number, body: unknown): TransportResponse => ({ status, headers: {}, body: JSON.stringify(body) });

const PARAMETROS: TaxParameters = {
  id: 'p-1', revision: 2, regime: 'SIMPLES_NACIONAL', validFrom: '2026-01-01', productAnnex: 'I', serviceAnnex: 'III', source: 'LC 123', notes: null,
  createdAt: '2026-01-01T00:00:00Z', createdBy: 'ana',
  brackets: {
    PRODUTO: [{ upToCents: '18000000', rate: '0.04', deductionCents: '0' }, { upToCents: '36000000', rate: '0.073', deductionCents: '594000' }],
    SERVICO: [{ upToCents: '18000000', rate: '0.06', deductionCents: '0' }],
  },
};

function abrir() {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(USUARIO)}>
      <WindowContext.Provider value={winApi}>
        <CalculadoraFinanceiraWindow />
      </WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

describe('Calculadora financeira', () => {
  beforeEach(() => setTransport(async (req) => (req.path === '/api/v1/tax-parameters' ? resposta(200, [PARAMETROS]) : resposta(404, {}))));

  it('calcula a prestação da série e recalcula ao mudar a taxa', async () => {
    const user = userEvent.setup();
    abrir();
    expect(screen.getByRole('textbox', { name: 'PMT — Prestação' })).toHaveValue('R$ 916,80');
    const i = screen.getByLabelText('i — Taxa por período (%)');
    await user.clear(i);
    await user.type(i, '2');
    expect(screen.getByRole('textbox', { name: 'PMT — Prestação' })).toHaveValue('R$ 945,60');
  });

  it('monta a tabela Price e troca para SAC', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('tab', { name: 'Financiamento' }));
    expect(screen.getByRole('textbox', { name: '1ª prestação' })).toHaveValue('R$ 945,60');
    expect(screen.getByRole('table', { name: 'Tabela de amortização' }).querySelectorAll('tbody tr')).toHaveLength(12);
    await escolher(user, screen.getByLabelText('Sistema'), 'SAC (amortização constante)');
    expect(screen.getByRole('textbox', { name: '1ª prestação' })).toHaveValue('R$ 1.033,33');
  });

  it('acha a TIR do fluxo de caixa', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('tab', { name: 'Fluxo de caixa' }));
    expect(screen.getByRole('textbox', { name: 'TIR por período' })).toHaveValue('8,8963%');
    expect(screen.getByRole('textbox', { name: 'Payback simples' })).toHaveValue('2,60 períodos');
  });

  it('usa os parâmetros do Simples da empresa e calcula as retenções', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('tab', { name: 'Fiscal' }));
    // Anexo III da LC 123: RBT12 de R$ 500.000,00 cai na 3ª faixa.
    expect(screen.getByRole('textbox', { name: 'Alíquota efetiva' })).toHaveValue('9,9720%');
    await waitFor(() => expect(screen.getByLabelText('Tabela')).toHaveTextContent('Anexo III — Serviços'));
    await escolher(user, screen.getByLabelText('Tabela'), 'Parâmetros da empresa — produto (Anexo I)');
    const rbt = screen.getByLabelText('RBT12 (receita de 12 meses)');
    await user.clear(rbt);
    await user.type(rbt, '100000');
    expect(screen.getByRole('textbox', { name: 'Alíquota efetiva' })).toHaveValue('4,0000%');
    // Nota de R$ 10.000,00 com IRRF e PIS/COFINS/CSLL: 150 + 465 retidos.
    expect(screen.getByRole('textbox', { name: 'Valor líquido a receber' })).toHaveValue('R$ 9.385,00');
  });
});
