import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BankAccount, Receivable, SessionUser, Settlement } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { ReceivablesWindow } from './ReceivablesWindow';
import { ReceivableWindow } from './ReceivableWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['financial_title.read', 'financial_title.settle', 'settlement.reverse', 'bank_account.manage', 'partner.read', 'project.read'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['financial_title.read', 'partner.read', 'project.read'] };

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
  issueDate: '2026-09-27', dueDate: '2026-10-10', originalCents: '5550000', receivedCents: '0', balanceCents: '5550000', status: 'OPEN',
  overdue: false, cancelReason: null, version: '1', createdAt: '2026-09-27T12:00:00Z', createdBy: 'ana',
};
const contas: BankAccount[] = [
  { id: 'b-1', code: 'CT001', name: 'Caixa', bank: null, openingCents: '0', openingOn: '2026-09-01', balanceCents: '0', status: 'ATIVO', version: '1' },
  { id: 'b-2', code: 'CT002', name: 'Banco do Brasil', bank: 'Banco do Brasil', openingCents: '0', openingOn: '2026-09-01', balanceCents: '0', status: 'ATIVO', version: '1' },
];
const recebimento: Settlement = {
  id: 's-1', code: 'RC00001', direction: 'RECEIVABLE', accountId: 'b-2', accountCode: 'CT002', accountName: 'Banco do Brasil', customerId: 'c-1',
  customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', effectiveDate: '2026-09-28', totalCents: '2000000', notes: null,
  allocations: [{ titleId: 't-1', titleCode: 'CR00001', titleLabel: titulo.origin, amountCents: '2000000' }], status: 'POSTED',
  reversalReason: null, reversedAt: null, reversedBy: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
};
const parcial: Receivable = { ...titulo, receivedCents: '2000000', balanceCents: '3550000', status: 'PARTIAL', version: '2' };

describe('Título a receber', () => {
  it('registra baixa parcial na conta escolhida e reenvia com a mesma chave depois de queda de rede', async () => {
    const chamadas: TransportRequest[] = [];
    let atual = titulo;
    let lista: Settlement[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, lista);
      if (req.path === '/api/v1/bank-accounts') return resposta(200, contas);
      if (req.method === 'POST' && req.path === '/api/v1/settlements') {
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        atual = parcial;
        lista = [recebimento];
        return resposta(201, recebimento, { etag: '"1"' });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Saldo')).toHaveValue('R$ 55.500,00'));
    expect(screen.getByText('Nenhum recebimento registrado neste título.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Registrar recebimento' });
    // A conta vem preenchida com a primeira; o valor, com o saldo (quitar); menos que o saldo é baixa parcial.
    await waitFor(() => expect(within(dialogo).getByLabelText('Conta')).toHaveTextContent('CT001 — Caixa'));
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('55.500,00');
    await user.click(within(dialogo).getByLabelText('Conta'));
    await user.click(await screen.findByRole('option', { name: 'CT002 — Banco do Brasil' }));
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '20.000');
    for (let i = 0; i < 2; i++) await user.click(within(screen.getByRole('alertdialog', { name: 'Registrar recebimento' })).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.getByLabelText('Saldo')).toHaveValue('R$ 35.500,00'));
    const posts = chamadas.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    expect(posts[1].headers?.['Idempotency-Key']).toBe(posts[0].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toMatchObject({
      direction: 'RECEIVABLE', accountId: 'b-2', amountCents: '2000000',
      allocations: [{ titleId: 't-1', amountCents: '2000000', expectedTitleVersion: '1' }],
    });
    expect(JSON.parse(posts[1].body!).effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('RC00001');
    expect(screen.getByText('Parcial')).toBeInTheDocument();
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Recebimento RC00001 de R$ 20.000,00 registrado com sucesso no título CR00001' });
  });

  it('mostra no diálogo o saldo atual quando o valor passa do saldo', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, titulo, { etag: '"1"' });
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, []);
      if (req.path === '/api/v1/bank-accounts') return resposta(200, contas);
      if (req.method === 'POST') {
        return resposta(422, { code: 'INSUFFICIENT_TITLE_BALANCE', message: 'O título CR00001 tem saldo de R$ 55.500,00; não recebe R$ 60.000,00.',
          details: [{ field: 'allocations[0].amountCents', message: 'Saldo atual R$ 55.500,00.' }] });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar recebimento' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Registrar recebimento' });
    await waitFor(() => expect(within(dialogo).getByLabelText('Conta')).toHaveTextContent('CT001 — Caixa'));
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '60.000,00');
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(within(dialogo).getByText('Saldo atual R$ 55.500,00.')).toBeInTheDocument());
    expect(within(dialogo).getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
    expect(win.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'erro' }));
  });

  it('estorna o recebimento selecionado com motivo obrigatório', async () => {
    const chamadas: TransportRequest[] = [];
    let lista = [recebimento];
    let atual = parcial;
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, lista);
      if (req.path === '/api/v1/settlements/s-1/reversals') {
        const estornado: Settlement = { ...recebimento, status: 'REVERSED', reversalReason: 'Cheque devolvido', reversedAt: '2026-09-28T13:00:00Z', reversedBy: 'ana', version: '2' };
        lista = [estornado];
        atual = { ...titulo, version: '3' };
        return resposta(200, estornado);
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Recebimentos do título' });
    await waitFor(() => expect(grade).toHaveTextContent('RC00001'));
    expect(screen.getByRole('button', { name: 'Estornar recebimento' })).toBeDisabled();
    await user.click(within(grade).getByText('RC00001'));
    await user.click(screen.getByRole('button', { name: 'Estornar recebimento' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Estornar recebimento' });
    expect(dialogo).toHaveTextContent('fica estornado por inteiro');
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar' }));
    expect(within(dialogo).getByText('Informe o motivo do estorno.')).toBeInTheDocument();
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Cheque devolvido');
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo')).toHaveValue('R$ 55.500,00'));
    expect(JSON.parse(chamadas.find((c) => c.path.endsWith('/reversals'))!.body!)).toEqual({ reason: 'Cheque devolvido' });
    expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('Estornado');
    expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('Cheque devolvido');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Recebimento RC00001 estornado com sucesso' });
  });

  it('Consulta vê o título e os recebimentos, sem registrar nem estornar', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, parcial, { etag: '"2"' });
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, [recebimento]);
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<ReceivableWindow recordKey="t-1" />, CONSULTA);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Recebimentos do título' })).toHaveTextContent('RC00001'));
    expect(screen.queryByRole('button', { name: 'Registrar recebimento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Estornar recebimento' })).toBeNull();
  });
});

describe('Contas a receber', () => {
  it('mostra só em aberto e parciais por padrão, com vencidos marcados e o saldo a receber no rodapé', async () => {
    const liquidado: Receivable = { ...titulo, id: 't-2', code: 'CR00002', receivedCents: '5550000', balanceCents: '0', status: 'SETTLED' };
    const vencido: Receivable = { ...parcial, id: 't-3', code: 'CR00003', overdue: true };
    setTransport(async (req) => {
      if (req.path.startsWith('/api/v1/receivables?')) return resposta(200, [titulo, liquidado, vencido]);
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ReceivablesWindow />);
    const grade = await screen.findByRole('table', { name: 'Contas a receber' });
    await waitFor(() => expect(grade).toHaveTextContent('CR00003'));
    expect(grade).not.toHaveTextContent('CR00002');
    expect(within(grade).getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('Saldo a receber: R$ 91.000,00')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Abrir título CR00001' }));
    expect(win.open).toHaveBeenCalledWith('receivable', 't-1');
  });
});
