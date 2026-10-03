import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Equipment, Proposal, SalesOrder, SessionUser } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { Selecao } from './comum/Selecao';
import { EquipmentWindow } from './EquipmentWindow';
import { ProposalWindow } from './ProposalWindow';
import { SalesOrderWindow } from './SalesOrderWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'item.read', 'proposal.read', 'proposal.create', 'proposal.update', 'proposal.issue', 'sales_order.read',
    'sales_order.create', 'sales_order.update', 'sales_order.confirm', 'sales_order.cancel', 'project.read', 'equipment.read', 'equipment.update'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['partner.read', 'item.read', 'proposal.read', 'sales_order.read'] };

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });
const clientes = [{ id: 'c-1', code: 'C00001', legalName: 'Fecularia Vale Ltda.', tradeName: null, cnpjFormatted: null, city: null, state: null, units: 1, status: 'ATIVO', version: '1' }];
const cliente = { id: 'c-1', code: 'C00001', legalName: 'Fecularia Vale Ltda.', units: [{ id: 'un-1', name: 'Matriz' }], contacts: [] };
const itens = [{ id: 'i-1', code: 'M00001', description: 'Perfil L 40x40', nature: 'MATERIAL', uom: 'M', category: 'Perfis', stockControlled: true, referenceCost: null, status: 'ATIVO', version: '1' }];

function cadastros(req: TransportRequest): TransportResponse | null {
  if (req.path.startsWith('/api/v1/customers?')) return resposta(200, clientes);
  if (req.path === '/api/v1/customers/c-1') return resposta(200, cliente);
  if (req.path.startsWith('/api/v1/items?')) return resposta(200, itens);
  return null;
}

function abrir(janela: ReactNode, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>{janela}</WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

const linha = { id: 'l-1', kind: 'EQUIPAMENTO', itemId: null, itemCode: null, description: 'Balança BF-200', quantity: '2.000000', uom: 'UN', unitPrice: '150000.000000', discountCents: '0', grossCents: '30000000', totalCents: '30000000' } as const;

const pedidoRascunho: SalesOrder = {
  id: 'o-1', code: 'PV00001', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', unitId: 'un-1', unitName: 'Matriz',
  proposalId: null, proposalCode: null, proposalRevision: null, contractDate: '2026-10-01', promisedDate: null, notes: null, status: 'DRAFT',
  totalCents: '30000000', scheduledCents: '0', lines: [linha], installments: [], confirmedAt: null, confirmedBy: null, projectId: null, projectCode: null,
  projectStage: null, equipment: [], titles: [], cancelledAt: null, cancelledBy: null, cancelReason: null, version: '1', createdAt: '2026-09-27T12:00:00Z',
  createdBy: 'ana', updatedAt: null, updatedBy: null,
};

describe('Seleção do design system', () => {
  it('abre a lista desenhada (não a nativa), navega pelo teclado e fecha com Esc sem escolher', async () => {
    function Teste() {
      const [v, setV] = useState('A');
      return <Selecao aria-label="Grupo" valor={v} onChange={setV} opcoes={[{ valor: 'A', rotulo: 'Alfa' }, { valor: 'B', rotulo: 'Beta' }, { valor: 'C', rotulo: 'Gama' }]} />;
    }
    render(<Teste />);
    const user = userEvent.setup();
    const campo = screen.getByRole('combobox', { name: 'Grupo' });
    expect(campo).toHaveTextContent('Alfa');
    expect(document.querySelector('select')).toBeNull();
    await user.click(campo);
    const lista = screen.getByRole('listbox');
    expect(lista).toHaveClass('rp-menu');
    expect(within(lista).getAllByRole('option').map((o) => o.className)).toEqual(expect.arrayContaining([expect.stringContaining('rp-menu-item')]));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(campo).toHaveTextContent('Beta');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('g');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(campo).toHaveTextContent('Beta');
  });
});

describe('Proposta', () => {
  it('rascunho vai com linhas no formato da API e mostra o total calculado como no servidor', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      const c = cadastros(req);
      if (c) return c;
      if (req.method === 'POST' && req.path === '/api/v1/proposals') {
        posts.push(req);
        return resposta(422, { code: 'PROPOSAL_INVALID', message: 'Corrija os campos indicados.', details: [{ field: 'lines[0].description', message: 'Informe o modelo do equipamento.' }] });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ProposalWindow recordKey="novo-1" />);
    const user = userEvent.setup();
    await escolher(user, screen.getByLabelText('Cliente'), 'C00001 — Fecularia Vale Ltda.');
    await escolher(user, screen.getByLabelText('Unidade'), 'Matriz');
    await user.type(screen.getByLabelText('Título'), 'Linha de dosagem');
    await user.click(screen.getByRole('button', { name: /adicionar uma linha/ }));
    await user.clear(screen.getByLabelText('Quantidade da linha 1'));
    await user.type(screen.getByLabelText('Quantidade da linha 1'), '10,5');
    await escolher(user, screen.getByLabelText('Tipo da linha 1'), 'Produto');
    await escolher(user, screen.getByLabelText('Item da linha 1'), 'M00001 — Perfil L 40x40');
    await user.type(screen.getByLabelText('Preço unitário da linha 1'), '16,33');
    expect(screen.getByLabelText('Total da linha 1')).toHaveTextContent('171,46');
    expect(screen.getByLabelText('Total')).toHaveValue('R$ 171,46');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const body = JSON.parse(posts[0].body!);
    expect(body).toMatchObject({ customerId: 'c-1', unitId: 'un-1', title: 'Linha de dosagem', lines: [{ kind: 'MATERIAL', itemId: 'i-1', quantity: '10.5', unitPrice: '16.33', discountCents: '0' }] });
    expect(body.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(win.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'erro' }));
  });

  it('revisão emitida fica só leitura; converter em pedido abre o pedido e registra o ganho', async () => {
    const emitida: Proposal = {
      id: 'p-1', code: 'PR00001', opportunityId: 'o-1', opportunityCode: 'OP00001', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', unitId: 'un-1', unitName: 'Matriz',
      title: 'Linha de dosagem', status: 'ABERTA', outcomeReason: null, currentRevision: 1,
      revisions: [{ id: 'r-1', revision: 1, status: 'EMITIDA', validUntil: '2026-11-30', paymentTerms: '30/40/30', totalCents: '30000000', issuedAt: '2026-09-27T12:00:00Z', issuedBy: 'ana', lines: [linha] }],
      version: '2', createdAt: '2026-09-27T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
    };
    const chamadas: TransportRequest[] = [];
    setTransport(async (req) => {
      chamadas.push(req);
      const c = cadastros(req);
      if (c) return c;
      if (req.path === '/api/v1/proposals/p-1') return resposta(200, emitida, { etag: '"2"' });
      if (req.path === '/api/v1/proposals/p-1/orders') return resposta(201, { ...pedidoRascunho, proposalId: 'p-1', proposalCode: 'PR00001', proposalRevision: 1 });
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ProposalWindow recordKey="p-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Número')).toHaveValue('PR00001'));
    expect(screen.getByLabelText('Título')).toHaveAttribute('readonly');
    expect(screen.getByText(/emitida: para alterar, crie uma nova revisão/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Converter em pedido' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Converter em pedido' })).getByRole('button', { name: 'Converter' }));
    await waitFor(() => expect(win.open).toHaveBeenCalledWith('order', 'o-1'));
    const conv = chamadas.find((c) => c.path === '/api/v1/proposals/p-1/orders')!;
    expect(conv.headers?.['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(conv.body!)).toMatchObject({ unitId: 'un-1' });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Pedido PV00001 adicionado com sucesso a partir da proposta PR00001' });
  });
});

describe('Pedido', () => {
  it('divide o total com o resíduo na primeira parcela, confere a soma e confirma com a mesma chave ao repetir', async () => {
    const confirmado: SalesOrder = {
      ...pedidoRascunho, status: 'CONFIRMED', version: '3', scheduledCents: '30000000', projectId: 'pj-1', projectCode: 'PJ00001', projectStage: 'PLANEJADO',
      installments: [{ seq: 1, dueDate: '2026-10-01', amountCents: '10000000', milestone: null }, { seq: 2, dueDate: '2026-11-01', amountCents: '10000000', milestone: null },
        { seq: 3, dueDate: '2026-12-01', amountCents: '10000000', milestone: null }],
      equipment: [{ id: 'e-1', code: 'EQ00001', model: 'Balança BF-200', serialNumber: null, status: 'ATIVO' }, { id: 'e-2', code: 'EQ00002', model: 'Balança BF-200', serialNumber: null, status: 'ATIVO' }],
      titles: [{ id: 't-1', code: 'CR00001', label: 'Pedido PV00001 — parcela 1/3', dueDate: '2026-10-01', competence: '2026-10', originalCents: '10000000', balanceCents: '10000000', status: 'OPEN' }],
    };
    const chamadas: TransportRequest[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      chamadas.push(req);
      const c = cadastros(req);
      if (c) return c;
      if (req.path === '/api/v1/sales-orders/o-1' && req.method === 'GET') return resposta(200, pedidoRascunho, { etag: '"1"' });
      if (req.path === '/api/v1/sales-orders/o-1' && req.method === 'PUT') return resposta(200, { ...pedidoRascunho, installments: confirmado.installments, scheduledCents: '30000000', version: '2' }, { etag: '"2"' });
      if (req.path === '/api/v1/sales-orders/o-1/confirmations') {
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        return resposta(200, confirmado, { etag: '"3"' });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<SalesOrderWindow recordKey="o-1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Número')).toHaveValue('PV00001'));
    await user.click(screen.getByRole('tab', { name: /Parcelas/ }));
    expect(screen.getByText(/Diferença de R\$ 300.000,00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dividir o total' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Dividir o total' });
    await user.clear(within(dialogo).getByLabelText('1º vencimento'));
    await user.type(within(dialogo).getByLabelText('1º vencimento'), '011026');
    await user.click(within(dialogo).getByRole('button', { name: 'Dividir' }));
    expect(screen.getByLabelText('Valor da parcela 1')).toHaveValue('100.000,00');
    expect(screen.getByText('Confere com o total do pedido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(screen.getByLabelText('Versão')).toHaveValue('2'));
    const put = JSON.parse(chamadas.find((c) => c.method === 'PUT')!.body!);
    expect(put.installments.map((p: { dueDate: string; amountCents: string }) => [p.dueDate, p.amountCents])).toEqual([
      ['2026-10-01', '10000000'], ['2026-11-01', '10000000'], ['2026-12-01', '10000000'],
    ]);

    // A rede cai na primeira confirmação; a segunda reenvia com a mesma chave (o servidor devolve a mesma confirmação).
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
      await user.click(within(screen.getByRole('alertdialog', { name: 'Confirmar pedido' })).getByRole('button', { name: 'Confirmar' }));
    }
    await waitFor(() => expect(screen.getByRole('table', { name: 'Equipamentos do pedido' })).toHaveTextContent('EQ00002'));
    const confirmacoes = chamadas.filter((c) => c.path.endsWith('/confirmations'));
    expect(confirmacoes).toHaveLength(2);
    expect(confirmacoes[0].headers?.['Idempotency-Key']).toBe(confirmacoes[1].headers?.['Idempotency-Key']);
    expect(confirmacoes[1].headers?.['If-Match']).toBe('"2"');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Pedido PV00001 confirmado com sucesso: projeto PJ00001, 2 equipamento(s) e 1 parcela(s) a receber' });
    expect(screen.queryByRole('button', { name: 'Confirmar pedido' })).toBeNull();
  });

  it('Consulta vê o pedido sem botões de alteração', async () => {
    setTransport(async (req) => cadastros(req) ?? (req.path === '/api/v1/sales-orders/o-1' ? resposta(200, pedidoRascunho, { etag: '"1"' }) : resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] })));
    abrir(<SalesOrderWindow recordKey="o-1" />, CONSULTA);
    await waitFor(() => expect(screen.getByLabelText('Número')).toHaveValue('PV00001'));
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar pedido' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});

describe('Equipamento', () => {
  it('grava a série com a versão lida e mostra a recusa de série repetida no campo', async () => {
    const eq: Equipment = {
      id: 'e-1', code: 'EQ00001', model: 'Balança BF-200', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança BF-200', itemId: null, projectId: 'pj-1', projectCode: 'PJ00001', orderCode: 'PV00001', customerId: 'c-1',
      customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', unitId: 'un-1', unitName: 'Matriz', serialNumber: null, notes: null, status: 'ATIVO',
      acceptedOn: null, warrantyStart: null, version: '1', createdAt: '2026-09-27T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
    };
    const puts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/equipment/e-1' && req.method === 'GET') return resposta(200, eq, { etag: '"1"' });
      if (req.method === 'PUT') {
        puts.push(req);
        return resposta(422, { code: 'EQUIPMENT_SERIAL_DUPLICATE', message: 'A série BF-1 já está no equipamento EQ00002 do mesmo modelo.', details: [{ field: 'serialNumber', message: 'Já usada no equipamento EQ00002.' }] });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<EquipmentWindow recordKey="e-1" />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nº de série'), 'BF-1');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Já usada no equipamento EQ00002.')).toBeInTheDocument();
    expect(puts[0].headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(puts[0].body!)).toEqual({ serialNumber: 'BF-1', notes: null });
    expect(screen.getByLabelText('Aceite')).toHaveValue('');
  });
});
