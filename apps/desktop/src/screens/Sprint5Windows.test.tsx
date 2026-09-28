import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BankAccount, Receivable, SessionUser, Settlement } from '../api/types';
import { hojeIso } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { BankAccountsWindow } from './BankAccountsWindow';
import { ReceivableWindow } from './ReceivableWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'financial_title.read', 'financial_title.settle', 'settlement.reverse', 'bank_account.admin'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['partner.read', 'financial_title.read'] };

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });

function abrir(janela: ReactNode, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>{janela}</WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

const titulo: Receivable = {
  id: 't-1', code: 'CR00001', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', originType: 'SALES_ORDER_INSTALLMENT',
  originId: 'o-1:1', origin: 'Pedido PV00001 — parcela 1/2 — Sinal', projectId: 'pj-1', category: 'RECEITA_VENDA', competence: '2026-10',
  issueDate: '2026-09-28', dueDate: '2026-10-10', originalCents: '5550000', receivedCents: '0', balanceCents: '5550000', status: 'OPEN',
  overdue: false, cancelReason: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
};

const conta = (id: string, code: string, name: string, extra: Partial<BankAccount> = {}): BankAccount => ({
  id, code, name, kind: 'BANCO', bank: 'Banco do Brasil', agency: null, accountNumber: null, openingCents: '0', openingOn: '2026-01-01',
  balanceCents: '0', movements: 0, status: 'ATIVO', version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null, ...extra,
});
const contas = [conta('a-1', 'CT001', 'Caixa', { kind: 'CAIXA', bank: null }), conta('a-2', 'CT002', 'Banco do Brasil')];

const baixa: Settlement = {
  id: 's-1', code: 'RC00001', direction: 'RECEIVABLE', accountId: 'a-2', accountCode: 'CT002', accountName: 'Banco do Brasil', customerId: 'c-1',
  customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', effectiveDate: '2026-09-28', amountCents: '2000000', creditCents: '0',
  allocations: [{ titleId: 't-1', titleCode: 'CR00001', label: 'Pedido PV00001 — parcela 1/2 — Sinal', amountCents: '2000000' }], notes: null,
  status: 'POSTED', reversalReason: null, reversalDate: null, reversedAt: null, reversedBy: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
};

describe('Título a receber', () => {
  it('recebe parte do saldo com a versão lida e reenvia a mesma chave depois de uma queda de rede', async () => {
    const chamadas: TransportRequest[] = [];
    let atual: Receivable = titulo;
    let baixas: Settlement[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, atual);
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, baixas);
      if (req.path === '/api/v1/bank-accounts') return resposta(200, contas);
      if (req.path === '/api/v1/settlements' && req.method === 'POST') {
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        atual = { ...titulo, receivedCents: '2000000', balanceCents: '3550000', status: 'PARTIAL', version: '2' };
        baixas = [baixa];
        return resposta(201, baixa, { etag: '"1"' });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Saldo a receber')).toHaveValue('R$ 55.500,00'));
    await user.click(screen.getByRole('button', { name: 'Receber' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Receber' });
    // O saldo já vem no valor e hoje na data.
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('55.500,00');
    await escolher(user, within(dialogo).getByRole('combobox', { name: 'Conta' }), 'CT002 — Banco do Brasil');
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '20.000');
    for (let i = 0; i < 2; i++) await user.click(within(screen.getByRole('alertdialog', { name: 'Receber' })).getByRole('button', { name: 'Receber' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo a receber')).toHaveValue('R$ 35.500,00'));
    const posts = chamadas.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({
      direction: 'RECEIVABLE', accountId: 'a-2', effectiveDate: hojeIso(), amountCents: '2000000', currency: 'BRL',
      allocations: [{ titleId: 't-1', amountCents: '2000000', expectedTitleVersion: '1' }], notes: null,
    });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Recebimento RC00001 de R$ 20.000,00 registrado com sucesso no título CR00001' });
    await user.click(screen.getByRole('tab', { name: /Recebimentos/ }));
    expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('RC00001');
  });

  it('mostra no campo a recusa de valor acima do saldo', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, titulo);
      if (req.path.startsWith('/api/v1/settlements?')) return resposta(200, []);
      if (req.path === '/api/v1/bank-accounts') return resposta(200, contas);
      if (req.path === '/api/v1/settlements') {
        return resposta(422, { code: 'INSUFFICIENT_TITLE_BALANCE', message: 'O valor de R$ 60.000,00 passa do saldo do título CR00001 (R$ 55.500,00).',
          details: [{ field: 'titles.t-1', message: 'Saldo atual: R$ 55.500,00.' }] });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Receber' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Receber' });
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Conta' })).toHaveTextContent('CT001 — Caixa'));
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '60.000,00');
    await user.click(within(dialogo).getByRole('button', { name: 'Receber' }));
    expect(await within(dialogo).findByText('Saldo atual: R$ 55.500,00.')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
  });

  it('estorna com motivo e Consulta não vê Receber nem Estornar', async () => {
    const posts: TransportRequest[] = [];
    let baixas = [baixa];
    setTransport(async (req) => {
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, { ...titulo, receivedCents: '2000000', balanceCents: '3550000', status: 'PARTIAL', version: '2' });
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, baixas);
      if (req.path === '/api/v1/settlements/s-1/reversals') {
        posts.push(req);
        baixas = [{ ...baixa, status: 'REVERSED', reversalReason: 'Cheque devolvido', reversalDate: '2026-09-28', reversedBy: 'ana' }];
        return resposta(200, baixas[0]);
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Recebimentos/ }));
    await user.click(screen.getByRole('button', { name: 'Estornar recebimento RC00001' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Estornar recebimento' });
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar' }));
    expect(within(dialogo).getByText('Informe o motivo do estorno.')).toBeInTheDocument();
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Cheque devolvido');
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('Estornado'));
    expect(JSON.parse(posts[0].body!)).toEqual({ reason: 'Cheque devolvido' });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Recebimento RC00001 estornado com sucesso: R$ 20.000,00 voltaram ao saldo' });
    expect(screen.queryByRole('button', { name: /Estornar recebimento/ })).toBeNull();
  });

  it('Consulta vê o título e os recebimentos sem botões de baixa', async () => {
    setTransport(async (req) =>
      req.path === '/api/v1/receivables/t-1' ? resposta(200, titulo) : req.path.startsWith('/api/v1/settlements?') ? resposta(200, [baixa]) : resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] }));
    abrir(<ReceivableWindow recordKey="t-1" />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Recebimentos/ }));
    expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('RC00001');
    expect(screen.queryByRole('button', { name: 'Receber' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Estornar/ })).toBeNull();
  });
});

describe('Contas financeiras', () => {
  it('cadastra conta com saldo inicial em centavos e mostra o extrato com o saldo acumulado', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/bank-accounts?includeInactive=true') return resposta(200, contas);
      if (req.path === '/api/v1/bank-accounts' && req.method === 'POST') {
        posts.push(req);
        return resposta(201, conta('a-3', 'CT003', 'Sicredi', { openingCents: '-123450' }));
      }
      if (req.path === '/api/v1/bank-accounts/a-1/movements') {
        return resposta(200, [
          { id: 'm-1', effectiveDate: '2026-09-28', amountCents: '2000000', kind: 'SETTLEMENT', settlementId: 's-1', settlementCode: 'RC00001', description: 'Recebimento RC00001', balanceCents: '2000000', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana' },
          { id: 'm-2', effectiveDate: '2026-09-28', amountCents: '-2000000', kind: 'SETTLEMENT_REVERSAL', settlementId: 's-1', settlementCode: 'RC00001', description: 'Estorno do recebimento RC00001', balanceCents: '0', createdAt: '2026-09-28T13:00:00Z', createdBy: 'ana' },
        ]);
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<BankAccountsWindow />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('table', { name: 'Contas financeiras' })).toHaveTextContent('CT002'));
    await user.type(screen.getByLabelText('Nome'), 'Sicredi');
    await user.type(screen.getByLabelText('Banco'), 'Sicredi');
    await user.clear(screen.getByLabelText('Saldo inicial'));
    await user.type(screen.getByLabelText('Saldo inicial'), '-1.234,5');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toMatchObject({ name: 'Sicredi', kind: 'BANCO', bank: 'Sicredi', openingCents: '-123450', openingOn: hojeIso() });

    await user.click(screen.getByRole('tab', { name: /Extrato/ }));
    await escolher(user, screen.getByRole('combobox', { name: 'Conta' }), 'CT001 — Caixa');
    const extrato = await screen.findByRole('table', { name: 'Extrato da conta' });
    await waitFor(() => expect(extrato).toHaveTextContent('Estorno do recebimento RC00001'));
    expect(within(extrato).getAllByRole('row')[2]).toHaveTextContent('R$ 20.000,00R$ 0,00');
  });

  it('Consulta vê as contas sem poder alterar', async () => {
    setTransport(async (req) => (req.path === '/api/v1/bank-accounts?includeInactive=true' ? resposta(200, contas) : resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] })));
    abrir(<BankAccountsWindow />, CONSULTA);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Contas financeiras' })).toHaveTextContent('Caixa'));
    expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
