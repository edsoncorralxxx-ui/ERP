import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BankAccount, CashFlow, CashFlowComposition, CashMovement, SessionUser, Transfer } from '../api/types';
import { hojeIso } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { BankAccountsWindow } from './BankAccountsWindow';
import { CashFlowWindow } from './CashFlowWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['financial_title.read', 'bank_account.admin', 'transfer.post'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['financial_title.read'] };

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

const conta = (id: string, code: string, name: string, saldo: string): BankAccount => ({
  id, code, name, kind: 'BANCO', bank: 'Banco do Brasil', agency: null, accountNumber: null, openingCents: '0', openingOn: '2026-01-01',
  balanceCents: saldo, movements: 1, status: 'ATIVO', version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
});
const contas = [conta('a-1', 'CT001', 'Caixa', '2000000'), conta('a-2', 'CT002', 'Banco do Brasil', '1000000')];

const transferencia: Transfer = {
  id: 'tr-1', code: 'TR00001', fromAccountId: 'a-1', fromAccountCode: 'CT001', fromAccountName: 'Caixa', toAccountId: 'a-2', toAccountCode: 'CT002',
  toAccountName: 'Banco do Brasil', effectiveDate: hojeIso(), amountCents: '500000', notes: null, status: 'POSTED', reversalReason: null, reversalDate: null,
  reversedAt: null, reversedBy: null, version: '1', createdAt: '2026-09-30T12:00:00Z', createdBy: 'ana',
};

const movimento: CashMovement = {
  id: 'm-1', effectiveDate: hojeIso(), amountCents: '-500000', kind: 'TRANSFER', settlementId: null, transferId: 'tr-1', settlementCode: 'TR00001',
  description: 'Transferência TR00001 para CT002 — Banco do Brasil', balanceCents: '1500000', createdAt: '2026-09-30T12:00:00Z', createdBy: 'ana',
};

describe('Transferência entre contas', () => {
  it('transfere com a mesma chave depois de uma queda de rede e mostra o saldo da origem depois', async () => {
    const posts: TransportRequest[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      if (req.path.startsWith('/api/v1/bank-accounts?')) return resposta(200, contas);
      if (req.path === '/api/v1/transfers' && req.method === 'POST') {
        posts.push(req);
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        return resposta(201, transferencia, { etag: '"1"' });
      }
      return naoAchou();
    });
    const win = abrir(<BankAccountsWindow />);
    const user = userEvent.setup();
    await screen.findByText('Caixa');
    await user.click(screen.getByRole('button', { name: 'Transferir' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Transferir' });
    expect(within(dialogo).getByRole('combobox', { name: 'Origem' })).toHaveTextContent('CT001 — Caixa');
    expect(within(dialogo).getByRole('combobox', { name: 'Destino' })).toHaveTextContent('CT002 — Banco do Brasil');
    await user.type(within(dialogo).getByLabelText('Valor'), '5.000,00');
    expect(within(dialogo).getByLabelText('Saldo da origem depois')).toHaveValue('R$ 15.000,00');
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '25.000,00');
    expect(within(dialogo).getByRole('status')).toHaveTextContent('A conta CT001 ficará com saldo de -R$ 5.000,00.');
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '5.000,00');
    for (let i = 0; i < 2; i++) await user.click(within(screen.getByRole('alertdialog', { name: 'Transferir' })).getByRole('button', { name: 'Transferir' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Transferir' })).not.toBeInTheDocument());
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({ fromAccountId: 'a-1', toAccountId: 'a-2', effectiveDate: hojeIso(), amountCents: '500000', notes: null });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Transferência TR00001 de R$ 5.000,00 de CT001 para CT002 registrada com sucesso' });
  });

  it('não deixa escolher a mesma conta nos dois lados', async () => {
    setTransport(async (req) => (req.path.startsWith('/api/v1/bank-accounts?') ? resposta(200, contas) : naoAchou()));
    abrir(<BankAccountsWindow />);
    const user = userEvent.setup();
    await screen.findByText('Caixa');
    await user.click(screen.getByRole('button', { name: 'Transferir' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Transferir' });
    await escolher(user, within(dialogo).getByRole('combobox', { name: 'Destino' }), 'CT001 — Caixa');
    await user.type(within(dialogo).getByLabelText('Valor'), '10');
    await user.click(within(dialogo).getByRole('button', { name: 'Transferir' }));
    expect(within(dialogo).getByText('A conta de destino deve ser diferente da origem.')).toBeInTheDocument();
  });

  it('estorna a transferência pelo extrato com motivo', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path.startsWith('/api/v1/bank-accounts?')) return resposta(200, contas);
      if (req.path === '/api/v1/bank-accounts/a-1/movements') return resposta(200, [movimento]);
      if (req.path === '/api/v1/transfers?accountId=a-1') return resposta(200, [transferencia]);
      if (req.path === '/api/v1/transfers/tr-1/reversals') {
        posts.push(req);
        return resposta(200, { ...transferencia, status: 'REVERSED', reversalReason: 'Conta errada' });
      }
      return naoAchou();
    });
    const win = abrir(<BankAccountsWindow />);
    const user = userEvent.setup();
    await screen.findByText('Caixa');
    await user.click(screen.getByRole('tab', { name: 'Extrato' }));
    const extrato = await screen.findByRole('table', { name: 'Extrato da conta' });
    await waitFor(() => expect(extrato).toHaveTextContent('Transferência TR00001 para CT002'));
    await user.click(within(extrato).getByRole('button', { name: 'Estornar transferência TR00001' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Estornar transferência' });
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Conta errada');
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toEqual({ reason: 'Conta errada' });
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Transferência TR00001 estornada com sucesso' }));
  });

  it('Consulta vê o extrato sem Transferir nem Estornar', async () => {
    setTransport(async (req) => {
      if (req.path.startsWith('/api/v1/bank-accounts?')) return resposta(200, contas);
      if (req.path === '/api/v1/bank-accounts/a-1/movements') return resposta(200, [movimento]);
      if (req.path === '/api/v1/transfers?accountId=a-1') return resposta(200, [transferencia]);
      return naoAchou();
    });
    abrir(<BankAccountsWindow />, CONSULTA);
    const user = userEvent.setup();
    await screen.findByText('Caixa');
    expect(screen.queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Extrato' }));
    const extrato = await screen.findByRole('table', { name: 'Extrato da conta' });
    await waitFor(() => expect(extrato).toHaveTextContent('Transferência TR00001'));
    expect(within(extrato).queryByRole('button')).not.toBeInTheDocument();
  });
});

const mes = (month: string, period: CashFlow['months'][number]['period'], v: Partial<CashFlow['months'][number]>) => ({
  month, period, openingCents: '0', realizedInCents: '0', realizedOutCents: '0', overdueInCents: '0', overdueOutCents: '0', forecastInCents: '0',
  forecastOutCents: '0', closingCents: '0', ...v,
});

const fluxo: CashFlow = {
  today: '2026-09-30', from: '2026-09', to: '2026-11', accountId: null, category: null,
  months: [
    mes('2026-09', 'CORRENTE', { openingCents: '1000000', realizedInCents: '2000000', overdueOutCents: '50000', closingCents: '2950000' }),
    mes('2026-10', 'PREVISTO', { openingCents: '2950000', forecastInCents: '3550000', forecastOutCents: '233500', closingCents: '6266500' }),
    mes('2026-11', 'PREVISTO', { openingCents: '6266500', forecastOutCents: '100000', closingCents: '6166500' }),
  ],
  pendings: [{ month: '2026-10', category: 'IMPOSTOS_SIMPLES', reference: '2026-08', message: 'Pendência — imposto da competência 08/2026 não conferido pelo contador (DAS sem valor)' }],
};

const saidas: CashFlowComposition = {
  month: '2026-10', column: 'FORECAST_OUT', totalCents: '233500',
  lines: [
    { targetKind: 'payable', targetId: 'cp-1', code: 'CP00001', date: '2026-10-10', description: 'Manutenção da linha', party: 'ACME', amountCents: '100000' },
    { targetKind: 'payable', targetId: 'cp-2', code: 'CP00002', date: '2026-10-20', description: 'DAS 09/2026', party: 'Receita Federal — DAS', amountCents: '133500' },
  ],
};

describe('Fluxo de caixa', () => {
  it('mostra os meses com a coluna Em atraso, as pendências e a composição de um valor com as setas', async () => {
    const chamadas: TransportRequest[] = [];
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path.startsWith('/api/v1/bank-accounts?')) return resposta(200, contas);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, []);
      if (req.path.startsWith('/api/v1/cash-flow/composition?')) return resposta(200, saidas);
      if (req.path.startsWith('/api/v1/cash-flow')) return resposta(200, fluxo);
      return naoAchou();
    });
    const win = abrir(<CashFlowWindow />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Fluxo de caixa' });
    expect(within(grade).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mês', 'Em atraso', '09/2026Corrente', '10/2026Previsto', '11/2026Previsto']);
    expect(within(grade).getByRole('row', { name: /Saldo final/ })).toHaveTextContent('R$ 29.500,00R$ 62.665,00R$ 61.665,00');
    expect(within(grade).getByRole('button', { name: 'Saídas em atraso até 30/09/2026: R$ 500,00' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pendências do fluxo')).toHaveTextContent('10/2026: Pendência — imposto da competência 08/2026 não conferido');
    expect(screen.getByLabelText('De')).toHaveValue('09/2026');
    // Mês futuro não tem realizado para abrir; o saldo final não é clicável.
    expect(within(grade).queryByRole('button', { name: /Entradas realizadas de 10\/2026/ })).not.toBeInTheDocument();
    expect(within(grade).queryByRole('button', { name: /Saldo final/ })).not.toBeInTheDocument();

    await user.click(within(grade).getByRole('button', { name: 'Saídas previstas de 10/2026: R$ 2.335,00' }));
    const comp = await screen.findByRole('table', { name: 'Composição do valor' });
    expect(chamadas.some((c) => c.path === '/api/v1/cash-flow/composition?month=2026-10&column=FORECAST_OUT')).toBe(true);
    expect(comp).toHaveTextContent('CP00002');
    expect(screen.getByLabelText('Total da composição')).toHaveTextContent('R$ 2.335,00');
    await user.click(within(comp).getByRole('link', { name: 'Abrir CP00002' }));
    expect(win.open).toHaveBeenCalledWith('payable', 'cp-2');
  });

  it('filtra pela conta e pelo período', async () => {
    const chamadas: TransportRequest[] = [];
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path.startsWith('/api/v1/bank-accounts?')) return resposta(200, contas);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, []);
      if (req.path.startsWith('/api/v1/cash-flow')) return resposta(200, fluxo);
      return naoAchou();
    });
    abrir(<CashFlowWindow />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Fluxo de caixa' });
    await escolher(user, screen.getByRole('combobox', { name: 'Conta' }), 'CT002 — Banco do Brasil');
    await waitFor(() => expect(chamadas.some((c) => c.path.includes('accountId=a-2'))).toBe(true));
    await user.clear(screen.getByLabelText('Até'));
    await user.type(screen.getByLabelText('Até'), '03/2027');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes('to=2027-03') && c.path.includes('accountId=a-2'))).toBe(true));
  });
});
