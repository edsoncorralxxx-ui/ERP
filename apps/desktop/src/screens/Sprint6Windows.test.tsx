import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BusinessDocument, OrderInvoicing, Receivable, SessionUser, TitleInvoicing } from '../api/types';
import { competenciaDaApi, competenciaParaApi, definirHojeDoServidor, hojeIso } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { DocumentWindow } from './DocumentWindow';
import { ToIssueWindow } from './ToIssueWindow';
import { ReceivableWindow } from './ReceivableWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'financial_title.read', 'document.read', 'document.register', 'document.link', 'document.classify', 'document.cancel'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['partner.read', 'financial_title.read', 'document.read'] };

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

const nota: BusinessDocument = {
  id: 'd-1', code: 'DF00001', direction: 'SAIDA', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.',
  orderId: 'o-1', orderCode: 'PV00001', series: '1',
  number: '1234', issueDate: '2026-09-28', competence: '2026-09', totalCents: '9250000', linkedCents: '0', unlinkedCents: '9250000',
  lines: [{ seq: 1, description: 'Balança de fluxo BF-200', kind: 'PRODUTO', amountCents: '9250000' }], links: [], notes: null, operationNature: null,
  projectId: null, projectCode: null, classificationRevision: 0, status: 'ATIVO', cancelReason: null, version: '1', createdAt: '2026-09-28T12:00:00Z',
  createdBy: 'ana', updatedAt: '2026-09-28T12:00:00Z', updatedBy: 'ana',
};

const parcela = (id: string, code: string, valor: string, faturado: string, extra: Partial<TitleInvoicing> = {}): TitleInvoicing => ({
  titleId: id, titleCode: code, label: `Pedido PV00001 — parcela ${code.slice(-1)}/2`, dueDate: `2026-10-1${code.slice(-1)}`, titleStatus: 'OPEN',
  projectId: 'pj-1', originalCents: valor, receivedCents: '0', balanceCents: valor, invoicedCents: faturado,
  toInvoiceCents: (BigInt(valor) - BigInt(faturado)).toString(), toIssueCents: '0', documents: [], ...extra,
});

const vinculada = (links: [string, string, string][]): BusinessDocument => {
  const soma = links.reduce((t, [, , v]) => t + BigInt(v), 0n);
  return {
    ...nota, version: '2', linkedCents: soma.toString(), unlinkedCents: (BigInt(nota.totalCents) - soma).toString(),
    links: links.map(([titleId, titleCode, amountCents], i) => ({
      id: `l-${i}`, titleId, titleCode, titleLabel: `Pedido PV00001 — parcela ${i + 1}/2`, amountCents, status: 'ATIVO', removedReason: null,
      removedAt: null, removedBy: null, createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
    })),
  };
};

describe('Datas de negócio e competência', () => {
  afterEach(() => definirHojeDoServidor(null));

  it('usa o dia do servidor enquanto o computador estiver no mesmo dia em que o leu', () => {
    definirHojeDoServidor('2031-01-02');
    expect(hojeIso()).toBe('2031-01-02');
    definirHojeDoServidor(null);
    expect(hojeIso()).not.toBe('2031-01-02');
  });

  it('converte a competência entre MM/AAAA e AAAA-MM', () => {
    expect(competenciaDaApi('2026-09')).toBe('09/2026');
    expect(competenciaDaApi('2026-09-28')).toBe('09/2026');
    expect(competenciaParaApi('9/2026')).toBe('2026-09');
    expect(competenciaParaApi('13/2026')).toBe('13/2026');
  });
});

/** Pedido PV00001 pelo caixa: R$ 20.000,00 recebidos na parcela 1, sem nota; proposta para {@code valor}. */
const pedidoCaixa = (valor = '2000000', extra: Partial<OrderInvoicing> = {}): OrderInvoicing => {
  const v = BigInt(valor);
  const produto = (v * 10000000n) / 15550000n + (v === 2000000n ? 1n : v === 1000000n ? 1n : 0n);
  return {
    id: 'o-1', orderCode: 'PV00001', orderStatus: 'CONFIRMED', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.',
    projectId: 'pj-1', totalCents: '15550000', receivedCents: '2000000', invoicedCents: '0', toIssueCents: '2000000', beyondReceivedCents: '0',
    proposedCents: valor, productCents: produto.toString(), serviceCents: (v - produto).toString(),
    parcels: [
      { titleId: 't-1', titleCode: 'CR00001', label: 'Pedido PV00001 — parcela 1/2', dueDate: '2026-10-10', titleStatus: 'PARTIAL', originalCents: '5550000',
        receivedCents: '2000000', invoicedCents: '0', toIssueCents: '2000000', proposedCents: valor },
      { titleId: 't-2', titleCode: 'CR00002', label: 'Pedido PV00001 — parcela 2/2', dueDate: '2026-11-10', titleStatus: 'OPEN', originalCents: '10000000',
        receivedCents: '0', invoicedCents: '0', toIssueCents: '0', proposedCents: '0' },
    ],
    lines: [
      { seq: 1, description: 'Balança de fluxo BF-200', kind: 'PRODUTO', amountCents: produto.toString() },
      { seq: 2, description: 'Instalação e comissionamento', kind: 'SERVICO', amountCents: (v - produto).toString() },
    ],
    ...extra,
  };
};

describe('Documento de faturamento pelo caixa', () => {
  it('registra a nota do pedido com as linhas e parcelas do sistema e reenvia a mesma chave depois de uma queda de rede', async () => {
    const posts: TransportRequest[] = [];
    const propostas: string[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      if (req.path === '/api/v1/invoicing/orders?status=A_EMITIR') return resposta(200, [pedidoCaixa()]);
      if (req.path.startsWith('/api/v1/invoicing/orders/o-1')) {
        propostas.push(req.path);
        return resposta(200, pedidoCaixa(req.path.endsWith('=1000000') ? '1000000' : '2000000'));
      }
      if (req.path === '/api/v1/documents' && req.method === 'POST') {
        posts.push(req);
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        return resposta(201, { ...nota, totalCents: '1000000', linkedCents: '1000000', unlinkedCents: '0', version: '2' }, { etag: '"2"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="novo-1:o-1" />);
    const user = userEvent.setup();
    // O pedido já vem escolhido: cliente, recebido, a emitir e a nota proposta.
    await waitFor(() => expect(screen.getByLabelText('A emitir')).toHaveValue('R$ 20.000,00'));
    expect(screen.getByLabelText('Cliente')).toHaveValue('C00001 — Fecularia Vale Ltda.');
    expect(screen.getByLabelText('Valor da nota')).toHaveValue('20.000,00');
    expect(screen.getByRole('table', { name: 'Linhas da nota' })).toHaveTextContent('Balança de fluxo BF-200ProdutoR$ 12.861,74');
    expect(screen.getByRole('table', { name: 'Linhas da nota' })).toHaveTextContent('Instalação e comissionamentoServiçoR$ 7.138,26');
    // Nota parcial: o servidor refaz a proposta para o valor digitado.
    await user.clear(screen.getByLabelText('Valor da nota'));
    await user.type(screen.getByLabelText('Valor da nota'), '10.000');
    await user.click(screen.getByRole('tab', { name: /Parcelas/ }));
    await waitFor(() => expect(screen.getByLabelText('Soma das parcelas nesta nota')).toHaveTextContent('R$ 10.000,00'));
    expect(propostas).toContain('/api/v1/invoicing/orders/o-1?amountCents=1000000');
    expect(screen.getByRole('table', { name: 'Parcelas do pedido' })).toHaveTextContent('CR00001');
    await user.type(screen.getByLabelText('Nº da nota'), '1234');
    const emissao = screen.getByLabelText('Emissão', { selector: 'input' });
    await user.clear(emissao);
    await user.type(emissao, '28/09/2026');
    expect(screen.getByLabelText('Competência')).toHaveValue('09/2026');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(screen.getByLabelText('Documento')).toHaveValue('DF00001'));
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({
      direction: 'SAIDA', orderId: 'o-1', series: '1', number: '1234', issueDate: '2026-09-28', competence: '2026-09', amountCents: '1000000', notes: null,
    });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Documento DF00001 (nota nº 1234) adicionado com sucesso: R$ 10.000,00 faturados no pedido PV00001' });
    expect(screen.getByRole('tab', { name: /Vínculos/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('aponta no valor da nota o que passa do recebido e não deixa registrar pedido sem nada a emitir', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/invoicing/orders?status=A_EMITIR') return resposta(200, [pedidoCaixa()]);
      if (req.path === '/api/v1/invoicing/orders/o-1?amountCents=2000001') {
        return resposta(422, { code: 'DOCUMENT_EXCEEDS_RECEIVED', message: 'O valor passa do recebido sem nota do pedido PV00001 (R$ 20.000,00).',
          details: [{ field: 'amountCents', message: 'A emitir do pedido: R$ 20.000,00.' }] });
      }
      if (req.path === '/api/v1/invoicing/orders/o-1') return resposta(200, pedidoCaixa());
      if (req.path === '/api/v1/invoicing/orders/o-2') {
        return resposta(200, pedidoCaixa('0', { id: 'o-2', orderCode: 'PV00002', receivedCents: '0', toIssueCents: '0', lines: [], parcels: [] }));
      }
      return naoAchou();
    });
    abrir(<DocumentWindow recordKey="novo-1:o-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Valor da nota')).toHaveValue('20.000,00'));
    await user.clear(screen.getByLabelText('Valor da nota'));
    await user.type(screen.getByLabelText('Valor da nota'), '20.000,01');
    await user.tab();
    expect(await screen.findByText('A emitir do pedido: R$ 20.000,00.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor da nota')).toHaveAttribute('aria-invalid', 'true');

    abrir(<DocumentWindow recordKey="novo-2:o-2" />);
    expect(await screen.findByText(/O pedido PV00002 não tem recebimento sem nota/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Adicionar' }).at(-1)).toBeDisabled();
  });

  it('cancela a nota com motivo e a versão lida', async () => {
    const posts: TransportRequest[] = [];
    let atual = vinculada([['t-1', 'CR00001', '2000000']]);
    setTransport(async (req) => {
      if (req.path === '/api/v1/documents/d-1') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/documents/d-1/cancellations') {
        posts.push(req);
        atual = { ...atual, version: '3', status: 'CANCELADO', cancelReason: 'Valor digitado errado', linkedCents: '0', unlinkedCents: atual.totalCents };
        return resposta(200, atual, { etag: '"3"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="d-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Vínculos/ }));
    expect(screen.getByRole('table', { name: 'Vínculos da nota com as parcelas' })).toHaveTextContent('CR00001');
    expect(screen.getByLabelText('Pedido')).toHaveValue('PV00001');
    await user.click(screen.getByRole('button', { name: 'Cancelar documento' }));
    const cancelar = screen.getByRole('alertdialog', { name: 'Cancelar documento' });
    await user.type(within(cancelar).getByLabelText('Motivo'), 'Valor digitado errado');
    await user.click(within(cancelar).getByRole('button', { name: 'Cancelar documento' }));
    await waitFor(() => expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Valor digitado errado'));
    expect(posts[0].headers?.['If-Match']).toBe('"2"');
    expect(JSON.parse(posts[0].body!)).toEqual({ reason: 'Valor digitado errado' });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Documento DF00001 (nota nº 1234) cancelado com sucesso; o valor volta às notas a emitir' });
    expect(screen.queryByRole('button', { name: 'Cancelar documento' })).toBeNull();
  });

  it('classifica com a natureza e o projeto das parcelas vinculadas', async () => {
    const puts: TransportRequest[] = [];
    const atual = vinculada([['t-1', 'CR00001', '5550000']]);
    setTransport(async (req) => {
      if (req.path === '/api/v1/documents/d-1' && req.method === 'GET') return resposta(200, atual, { etag: '"2"' });
      if (req.path === '/api/v1/invoicing?titleId=t-1') return resposta(200, [parcela('t-1', 'CR00001', '5550000', '5550000')]);
      if (req.path === '/api/v1/documents/d-1/classification') {
        puts.push(req);
        return resposta(200, { ...atual, version: '3', operationNature: 'VENDA_PRODUCAO', projectId: 'pj-1', projectCode: 'PJ00001', classificationRevision: 1 }, { etag: '"3"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="d-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Classificação/ }));
    await escolher(user, screen.getByRole('combobox', { name: 'Natureza da operação' }), 'Venda de produção própria');
    await escolher(user, screen.getByRole('combobox', { name: 'Projeto' }), 'Projeto do pedido PV00001');
    await user.click(screen.getByRole('button', { name: 'Classificar' }));
    await waitFor(() => expect(screen.getByLabelText('Revisão da classificação')).toHaveValue('1'));
    expect(puts[0].headers?.['If-Match']).toBe('"2"');
    expect(JSON.parse(puts[0].body!)).toEqual({ operationNature: 'VENDA_PRODUCAO', projectId: 'pj-1' });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Documento DF00001 classificado com sucesso (revisão 1)' });
  });

  it('Consulta vê a nota e os vínculos sem cancelar nem classificar', async () => {
    setTransport(async (req) => (req.path === '/api/v1/documents/d-1' ? resposta(200, vinculada([['t-1', 'CR00001', '5550000']]), { etag: '"2"' }) : naoAchou()));
    abrir(<DocumentWindow recordKey="d-1" />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Vínculos/ }));
    expect(screen.getByRole('table', { name: 'Vínculos da nota com as parcelas' })).toHaveTextContent('CR00001');
    expect(screen.queryByRole('button', { name: 'Cancelar documento' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Classificação/ }));
    expect(screen.queryByRole('button', { name: 'Classificar' })).toBeNull();
  });
});

describe('Notas a emitir', () => {
  it('lista os pedidos com recebimento sem nota e a seta abre a nota nova com o pedido', async () => {
    setTransport(async (req) => (req.path === '/api/v1/invoicing/orders?status=A_EMITIR' ? resposta(200, [pedidoCaixa()]) : naoAchou()));
    const win = abrir(<ToIssueWindow />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Notas a emitir' });
    await waitFor(() => expect(grade).toHaveTextContent('PV00001'));
    expect(grade).toHaveTextContent('R$ 20.000,00');
    expect(grade).toHaveTextContent('A emitir');
    expect(screen.getByText('A emitir da lista: R$ 20.000,00')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Registrar nota do pedido PV00001' }));
    expect(win.open).toHaveBeenCalledWith('document', expect.stringMatching(/^novo-\d+:o-1$/));
  });
});

describe('Título a receber com faturamento', () => {
  it('mostra faturado, a faturar e as notas vinculadas com a seta para o documento', async () => {
    const titulo: Receivable = {
      id: 't-1', code: 'CR00001', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', originType: 'SALES_ORDER_INSTALLMENT',
      originId: 'o-1:1', origin: 'Pedido PV00001 — parcela 1/2', projectId: 'pj-1', category: 'RECEITA_VENDA', competence: '2026-10',
      issueDate: '2026-09-28', dueDate: '2026-10-10', originalCents: '10000000', receivedCents: '0', balanceCents: '10000000', status: 'OPEN',
      overdue: false, cancelReason: null, version: '1', createdAt: '2026-09-28T12:00:00Z', createdBy: 'ana',
    };
    setTransport(async (req) => {
      if (req.path === '/api/v1/receivables/t-1') return resposta(200, titulo);
      if (req.path === '/api/v1/settlements?titleId=t-1') return resposta(200, []);
      if (req.path === '/api/v1/invoicing?titleId=t-1') {
        return resposta(200, [parcela('t-1', 'CR00001', '10000000', '3700000', {
          documents: [{ documentId: 'd-1', documentCode: 'DF00001', series: '1', number: '1234', issueDate: '2026-09-28', amountCents: '3700000' }] })]);
      }
      return naoAchou();
    });
    const win = abrir(<ReceivableWindow recordKey="t-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Faturado')).toHaveValue('R$ 37.000,00'));
    expect(screen.getByLabelText('A emitir')).toHaveValue('R$ 0,00');
    await user.click(screen.getByRole('tab', { name: /Faturamento/ }));
    expect(screen.getByRole('table', { name: 'Notas vinculadas ao título' })).toHaveTextContent('Nº 1234 / série 1');
    await user.click(screen.getByRole('link', { name: 'Abrir documento DF00001' }));
    expect(win.open).toHaveBeenCalledWith('document', 'd-1');
  });
});
