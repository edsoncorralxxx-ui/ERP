import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BankAccount, FinancialCategory, Payable, SessionUser, Settlement } from '../api/types';
import { competenciaDaApi, hojeIso, somarMeses } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { FinancialCategoriesWindow } from './FinancialCategoriesWindow';
import { NewPayableWindow } from './NewPayableWindow';
import { PayableWindow } from './PayableWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'financial_title.read', 'financial_title.create', 'financial_title.settle', 'financial_title.cancel', 'settlement.reverse',
    'financial_category.admin'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['partner.read', 'financial_title.read'] };

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

const categoria = (code: string, name: string, extra: Partial<FinancialCategory> = {}): FinancialCategory => ({
  id: `cat-${code}`, code, name, direction: 'DESPESA', status: 'ATIVO', system: false, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'sistema',
  updatedAt: null, updatedBy: null, ...extra,
});
const categorias = [
  categoria('SERVICOS_TERCEIROS', 'Serviços de terceiros'),
  categoria('IMPOSTOS_SIMPLES', 'Impostos — Simples Nacional', { system: true }),
  categoria('RECEITA_VENDA', 'Receita de vendas', { direction: 'RECEITA', system: true }),
];

const titulo: Payable = {
  id: 'cp-1', code: 'CP00001', supplierId: 'f-1', supplierCode: 'F00002', supplierName: 'ACME Serviços Industriais Ltda.', originType: 'MANUAL',
  originId: 'g-1:1', origin: 'Manutenção da linha — parcela 1/3', projectId: null, category: 'SERVICOS_TERCEIROS', competence: '2026-09',
  documentNumber: 'NFS-e 4521', notes: null, issueDate: '2026-09-28', dueDate: '2026-10-10', originalCents: '100000', paidCents: '0',
  balanceCents: '100000', status: 'OPEN', overdue: false, cancelReason: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
};

const conta = (id: string, code: string, name: string, saldo: string): BankAccount => ({
  id, code, name, kind: 'BANCO', bank: 'Banco do Brasil', agency: null, accountNumber: null, openingCents: saldo, openingOn: '2026-01-01',
  balanceCents: saldo, movements: 0, status: 'ATIVO', version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
});
const contas = [conta('a-1', 'CT001', 'Caixa', '0'), conta('a-2', 'CT002', 'Banco do Brasil', '1000000')];

const pagamento: Settlement = {
  id: 's-1', code: 'PG00001', direction: 'PAYABLE', accountId: 'a-2', accountCode: 'CT002', accountName: 'Banco do Brasil', customerId: 'f-1',
  customerCode: 'F00002', customerName: 'ACME Serviços Industriais Ltda.', effectiveDate: hojeIso(), amountCents: '40000', creditCents: '0',
  allocations: [{ titleId: 'cp-1', titleCode: 'CP00001', label: 'Manutenção da linha — parcela 1/3', amountCents: '40000' }], notes: null,
  status: 'POSTED', reversalReason: null, reversalDate: null, reversedAt: null, reversedBy: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
};

describe('Novo título a pagar', () => {
  it('divide o total em parcelas, envia a categoria e a competência e mostra os títulos gerados', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/suppliers') return resposta(200, [{ id: 'f-1', code: 'F00002', legalName: 'ACME Serviços Industriais Ltda.', status: 'ATIVO' }]);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      if (req.path === '/api/v1/payables' && req.method === 'POST') {
        posts.push(req);
        return resposta(201, [1, 2, 3].map((n) => ({ ...titulo, id: `cp-${n}`, code: `CP0000${n}`, origin: `Manutenção da linha — parcela ${n}/3` })));
      }
      return naoAchou();
    });
    const win = abrir(<NewPayableWindow />);
    const user = userEvent.setup();
    await escolher(user, screen.getByRole('combobox', { name: 'Beneficiário' }), 'F00002 — ACME Serviços Industriais Ltda.');
    // Só categorias de despesa ativas.
    await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
    expect(screen.queryByRole('option', { name: 'Receita de vendas' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Serviços de terceiros' }));
    expect(screen.getByLabelText('Competência')).toHaveValue(competenciaDaApi(hojeIso()));
    await user.clear(screen.getByLabelText('Competência'));
    await user.type(screen.getByLabelText('Competência'), '09/2026');
    await user.type(screen.getByLabelText('Documento'), 'NFS-e 4521');
    await user.type(screen.getByLabelText('Descrição'), 'Manutenção da linha');
    await user.type(screen.getByLabelText('Total'), '3.000,00');
    await user.click(screen.getByRole('button', { name: 'Dividir o total' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Dividir o total' })).getByRole('button', { name: 'Dividir' }));
    expect(screen.getByLabelText('Soma das parcelas')).toHaveTextContent('R$ 3.000,00');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(posts[0].body!)).toEqual({
      supplierId: 'f-1', category: 'SERVICOS_TERCEIROS', competence: '2026-09', documentNumber: 'NFS-e 4521', description: 'Manutenção da linha',
      totalCents: '300000', notes: null,
      installments: [0, 1, 2].map((i) => ({ dueDate: somarMeses(hojeIso(), i), amountCents: '100000' })),
    });
    const gerados = await screen.findByRole('table', { name: 'Títulos gerados' });
    expect(gerados).toHaveTextContent('CP00001');
    expect(gerados).toHaveTextContent('CP00003');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Títulos CP00001 a CP00003 adicionados com sucesso: R$ 3.000,00 a pagar' });
    await user.click(screen.getByRole('link', { name: 'Abrir título CP00002' }));
    expect(win.open).toHaveBeenCalledWith('payable', 'cp-2', ['cp-1', 'cp-2', 'cp-3']);
  });

  it('aponta nas parcelas a soma diferente do total recusada pelo servidor', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/suppliers') return resposta(200, []);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      if (req.path === '/api/v1/payables') {
        return resposta(422, { code: 'PAYABLE_INVALID', message: 'Corrija os campos indicados.', details: [
          { field: 'supplierId', message: 'Informe o beneficiário.' },
          { field: 'installments', message: 'A soma das parcelas (R$ 0,00) difere do total (R$ 10,00).' },
        ] });
      }
      return naoAchou();
    });
    abrir(<NewPayableWindow />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Total'), '10');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Informe o beneficiário.')).toBeInTheDocument();
    expect(screen.getByText('A soma das parcelas (R$ 0,00) difere do total (R$ 10,00).')).toBeInTheDocument();
  });
});

describe('Título a pagar', () => {
  it('paga parte do saldo avisando a conta negativa e reenvia a mesma chave depois de uma queda de rede', async () => {
    const chamadas: TransportRequest[] = [];
    let atual: Payable = titulo;
    let pagamentos: Settlement[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/payables/cp-1') return resposta(200, atual);
      if (req.path === '/api/v1/settlements?titleId=cp-1') return resposta(200, pagamentos);
      if (req.path === '/api/v1/bank-accounts') return resposta(200, contas);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      if (req.path === '/api/v1/settlements' && req.method === 'POST') {
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        atual = { ...titulo, paidCents: '40000', balanceCents: '60000', status: 'PARTIAL', version: '2' };
        pagamentos = [pagamento];
        return resposta(201, pagamento, { etag: '"1"' });
      }
      return naoAchou();
    });
    const win = abrir(<PayableWindow recordKey="cp-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 1.000,00'));
    expect(screen.getByLabelText('Categoria')).toHaveValue('Serviços de terceiros');
    await user.click(screen.getByRole('button', { name: 'Pagar' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Pagar' });
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('1.000,00');
    // O Caixa (saldo zero) ficaria negativo: aviso, sem impedir.
    await waitFor(() => expect(within(dialogo).getByRole('status')).toHaveTextContent('A conta CT001 ficará com saldo de -R$ 1.000,00.'));
    await escolher(user, within(dialogo).getByRole('combobox', { name: 'Conta' }), 'CT002 — Banco do Brasil');
    await user.clear(within(dialogo).getByLabelText('Valor'));
    await user.type(within(dialogo).getByLabelText('Valor'), '400');
    expect(within(dialogo).getByLabelText('Saldo da conta depois')).toHaveValue('R$ 9.600,00');
    expect(within(dialogo).queryByRole('status')).not.toBeInTheDocument();
    for (let i = 0; i < 2; i++) await user.click(within(screen.getByRole('alertdialog', { name: 'Pagar' })).getByRole('button', { name: 'Pagar' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 600,00'));
    const posts = chamadas.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({
      direction: 'PAYABLE', accountId: 'a-2', effectiveDate: hojeIso(), amountCents: '40000', currency: 'BRL',
      allocations: [{ titleId: 'cp-1', amountCents: '40000', expectedTitleVersion: '1' }], notes: null,
    });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Pagamento PG00001 de R$ 400,00 registrado com sucesso no título CP00001' });
    await user.click(screen.getByRole('tab', { name: /Pagamentos/ }));
    expect(screen.getByRole('table', { name: 'Pagamentos do título' })).toHaveTextContent('PG00001');
  });

  it('estorna o pagamento e cancela o título manual com motivo', async () => {
    const posts: TransportRequest[] = [];
    let atual: Payable = { ...titulo, paidCents: '40000', balanceCents: '60000', status: 'PARTIAL', version: '2' };
    let pagamentos = [pagamento];
    setTransport(async (req) => {
      if (req.path === '/api/v1/payables/cp-1') return resposta(200, atual);
      if (req.path === '/api/v1/settlements?titleId=cp-1') return resposta(200, pagamentos);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      if (req.path === '/api/v1/settlements/s-1/reversals') {
        posts.push(req);
        pagamentos = [{ ...pagamento, status: 'REVERSED', reversalReason: 'Pago na conta errada', reversalDate: hojeIso(), reversedBy: 'ana' }];
        atual = { ...titulo, version: '3' };
        return resposta(200, pagamentos[0]);
      }
      if (req.path === '/api/v1/payables/cp-1/cancellation') {
        posts.push(req);
        atual = { ...atual, status: 'CANCELLED', balanceCents: '0', cancelReason: 'Lançado em duplicidade', version: '4' };
        return resposta(200, atual, { etag: '"4"' });
      }
      return naoAchou();
    });
    const win = abrir(<PayableWindow recordKey="cp-1" />);
    const user = userEvent.setup();
    // Com pagamento, não há Cancelar título.
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 600,00'));
    expect(screen.queryByRole('button', { name: 'Cancelar título' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Pagamentos/ }));
    await user.click(screen.getByRole('button', { name: 'Estornar pagamento PG00001' }));
    const estorno = screen.getByRole('alertdialog', { name: 'Estornar pagamento' });
    await user.type(within(estorno).getByLabelText('Motivo'), 'Pago na conta errada');
    await user.click(within(estorno).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 1.000,00'));
    expect(JSON.parse(posts[0].body!)).toEqual({ reason: 'Pago na conta errada' });

    await user.click(screen.getByRole('button', { name: 'Cancelar título' }));
    const cancela = screen.getByRole('alertdialog', { name: 'Cancelar título' });
    await user.type(within(cancela).getByLabelText('Motivo'), 'Lançado em duplicidade');
    await user.click(within(cancela).getByRole('button', { name: 'Cancelar título' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 0,00'));
    expect(posts[1].headers?.['If-Match']).toBe('"3"');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Título CP00001 cancelado com sucesso' });
    await user.click(screen.getByRole('tab', { name: 'Geral' }));
    expect(screen.getByText(/Lançado em duplicidade/)).toBeInTheDocument();
  });

  it('DAS abre a competência e não oferece cancelar; Consulta não paga', async () => {
    const das: Payable = { ...titulo, id: 'cp-9', code: 'CP00009', originType: 'TAX_PERIOD', originId: '2026-09:1', origin: 'DAS 09/2026',
      supplierName: 'Receita Federal — DAS', category: 'IMPOSTOS_SIMPLES', documentNumber: null, originalCents: '133000', balanceCents: '133000' };
    setTransport(async (req) => {
      if (req.path === '/api/v1/payables/cp-9') return resposta(200, das);
      if (req.path.startsWith('/api/v1/settlements?')) return resposta(200, []);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      return naoAchou();
    });
    const win = abrir(<PayableWindow recordKey="cp-9" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Categoria')).toHaveValue('Impostos — Simples Nacional'));
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar título' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Abrir competência 09/2026' }));
    expect(win.open).toHaveBeenCalledWith('tax-period', '2026-09');
  });

  it('Consulta vê o título sem Pagar, Estornar nem Cancelar', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/payables/cp-1') return resposta(200, { ...titulo, paidCents: '40000', balanceCents: '60000', status: 'PARTIAL' });
      if (req.path.startsWith('/api/v1/settlements?')) return resposta(200, [pagamento]);
      if (req.path.startsWith('/api/v1/financial-categories')) return resposta(200, categorias);
      return naoAchou();
    });
    abrir(<PayableWindow recordKey="cp-1" />, CONSULTA);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Saldo a pagar')).toHaveValue('R$ 600,00'));
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar título' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Pagamentos/ }));
    expect(screen.queryByRole('button', { name: 'Estornar pagamento PG00001' })).not.toBeInTheDocument();
  });
});

describe('Categorias financeiras', () => {
  it('adiciona uma categoria de despesa e não deixa inativar a do sistema', async () => {
    const posts: TransportRequest[] = [];
    let lista = categorias;
    setTransport(async (req) => {
      if (req.path.startsWith('/api/v1/financial-categories') && req.method === 'GET') return resposta(200, lista);
      if (req.path === '/api/v1/financial-categories' && req.method === 'POST') {
        posts.push(req);
        const nova = categoria('MANUTENCAO_DE_MAQUINAS', 'Manutenção de máquinas');
        lista = [...lista, nova];
        return resposta(201, nova, { etag: '"1"' });
      }
      return naoAchou();
    });
    const win = abrir(<FinancialCategoriesWindow />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Categorias financeiras' });
    await waitFor(() => expect(grade).toHaveTextContent('Impostos — Simples Nacional'));
    await user.type(screen.getByLabelText('Nome'), 'Manutenção de máquinas');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toEqual({ name: 'Manutenção de máquinas', direction: 'DESPESA' });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Categoria Manutenção de máquinas adicionada com sucesso' });
    await waitFor(() => expect(grade).toHaveTextContent('MANUTENCAO_DE_MAQUINAS'));
    await user.click(within(grade).getByText('Impostos — Simples Nacional'));
    expect(screen.getByRole('combobox', { name: 'Situação' })).toBeDisabled();
  });
});
