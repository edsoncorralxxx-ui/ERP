import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { BusinessDocument, Receivable, SessionUser, TitleInvoicing } from '../api/types';
import { competenciaDaApi, competenciaParaApi, definirHojeDoServidor, hojeIso } from '../format';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { DocumentWindow } from './DocumentWindow';
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

const clientes = [{ id: 'c-1', code: 'C00001', legalName: 'Fecularia Vale Ltda.', tradeName: null, cnpj: null, city: null, state: null, status: 'ATIVO' }];

const nota: BusinessDocument = {
  id: 'd-1', code: 'DF00001', direction: 'SAIDA', customerId: 'c-1', customerCode: 'C00001', customerName: 'Fecularia Vale Ltda.', series: '1',
  number: '1234', issueDate: '2026-09-28', competence: '2026-09', totalCents: '9250000', linkedCents: '0', unlinkedCents: '9250000',
  lines: [{ seq: 1, description: 'Balança de fluxo BF-200', kind: 'PRODUTO', amountCents: '9250000' }], links: [], notes: null, operationNature: null,
  projectId: null, projectCode: null, classificationRevision: 0, status: 'ATIVO', cancelReason: null, version: '1', createdAt: '2026-09-28T12:00:00Z',
  createdBy: 'ana', updatedAt: '2026-09-28T12:00:00Z', updatedBy: 'ana',
};

const parcela = (id: string, code: string, valor: string, faturado: string, extra: Partial<TitleInvoicing> = {}): TitleInvoicing => ({
  titleId: id, titleCode: code, label: `Pedido PV00001 — parcela ${code.slice(-1)}/2`, dueDate: `2026-10-1${code.slice(-1)}`, titleStatus: 'OPEN',
  projectId: 'pj-1', originalCents: valor, receivedCents: '0', balanceCents: valor, invoicedCents: faturado,
  toInvoiceCents: (BigInt(valor) - BigInt(faturado)).toString(), documents: [], ...extra,
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

describe('Documento de faturamento', () => {
  it('registra a nota com a competência da emissão e reenvia a mesma chave depois de uma queda de rede', async () => {
    const posts: TransportRequest[] = [];
    let falhaDeRede = true;
    setTransport(async (req) => {
      if (req.path === '/api/v1/customers?status=TODOS') return resposta(200, clientes);
      if (req.path === '/api/v1/documents' && req.method === 'POST') {
        posts.push(req);
        if (falhaDeRede) {
          falhaDeRede = false;
          throw new Error('rede caiu');
        }
        return resposta(201, nota, { etag: '"1"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="novo-1" />);
    const user = userEvent.setup();
    await escolher(user, await screen.findByRole('combobox', { name: 'Cliente' }), 'C00001 — Fecularia Vale Ltda.');
    await user.type(screen.getByLabelText('Nº da nota'), '1234');
    const emissao = screen.getByLabelText('Emissão', { selector: 'input' });
    await user.clear(emissao);
    await user.type(emissao, '28/09/2026');
    // A competência acompanha a emissão.
    expect(screen.getByLabelText('Competência')).toHaveValue('09/2026');
    await user.click(screen.getByText('Clique para adicionar uma linha…'));
    await user.type(screen.getByLabelText('Descrição da linha 1'), 'Balança de fluxo BF-200');
    await user.type(screen.getByLabelText('Valor da linha 1'), '92.500,00');
    expect(screen.getByLabelText('Total da nota')).toHaveValue('R$ 92.500,00');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(screen.getByLabelText('Documento')).toHaveValue('DF00001'));
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({
      direction: 'SAIDA', customerId: 'c-1', series: '1', number: '1234', issueDate: '2026-09-28', competence: '2026-09',
      lines: [{ description: 'Balança de fluxo BF-200', kind: 'PRODUTO', amountCents: '9250000' }], notes: null,
    });
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Documento DF00001 (nota nº 1234) adicionado com sucesso' });
    expect(screen.getByRole('tab', { name: /Vínculos/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('vincula sugerindo o sem vínculo por vencimento e aponta na parcela a recusa acima do a faturar', async () => {
    const posts: TransportRequest[] = [];
    let recusar = true;
    setTransport(async (req) => {
      if (req.path === '/api/v1/documents/d-1') return resposta(200, nota, { etag: '"1"' });
      if (req.path === '/api/v1/invoicing?customerId=c-1') {
        return resposta(200, [parcela('t-1', 'CR00001', '5550000', '0'), parcela('t-2', 'CR00002', '10000000', '0'),
          parcela('t-3', 'CR00003', '100', '0', { titleStatus: 'CANCELLED' })]);
      }
      if (req.path === '/api/v1/documents/d-1/links') {
        posts.push(req);
        if (recusar) {
          recusar = false;
          return resposta(422, { code: 'LINK_EXCEEDS_TITLE', message: 'O vínculo passa do que falta faturar na parcela CR00002 (R$ 37.000,00).',
            details: [{ field: 'links[1].amountCents', message: 'A faturar da parcela: R$ 37.000,00.' }] });
        }
        return resposta(200, vinculada([['t-1', 'CR00001', '5550000'], ['t-2', 'CR00002', '3700000']]), { etag: '"2"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="d-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Vincular parcelas' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Vincular parcelas' });
    // Sugestão: a parcela 1 inteira e o resto na parcela 2; a cancelada não aparece.
    await waitFor(() => expect(within(dialogo).getByLabelText('Vincular à parcela CR00001')).toHaveValue('55.500,00'));
    expect(within(dialogo).getByLabelText('Vincular à parcela CR00002')).toHaveValue('37.000,00');
    expect(within(dialogo).queryByText('CR00003')).toBeNull();
    expect(within(dialogo).getByLabelText('Soma dos vínculos')).toHaveTextContent('R$ 92.500,00');
    await user.click(within(dialogo).getByRole('button', { name: 'Vincular' }));
    expect(await within(dialogo).findByText(/CR00002: A faturar da parcela: R\$ 37\.000,00\./)).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Vincular à parcela CR00002')).toHaveAttribute('aria-invalid', 'true');
    await user.click(within(dialogo).getByRole('button', { name: 'Vincular' }));
    await waitFor(() => expect(screen.getByLabelText('Vinculado')).toHaveValue('R$ 92.500,00'));
    expect(posts[1].headers?.['If-Match']).toBe('"1"');
    expect(posts[0].headers?.['Idempotency-Key']).not.toBe(posts[1].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[1].body!)).toEqual({ links: [{ titleId: 't-1', amountCents: '5550000' }, { titleId: 't-2', amountCents: '3700000' }] });
    expect(screen.getByRole('table', { name: 'Vínculos da nota com as parcelas' })).toHaveTextContent('CR00002');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Nota nº 1234 vinculada com sucesso: R$ 92.500,00 faturados nas parcelas; restam R$ 0,00 sem vínculo' });
  });

  it('desfaz vínculo e cancela a nota com motivo, com a versão lida', async () => {
    const posts: TransportRequest[] = [];
    let atual = vinculada([['t-1', 'CR00001', '5550000'], ['t-2', 'CR00002', '3700000']]);
    setTransport(async (req) => {
      if (req.path === '/api/v1/documents/d-1') return resposta(200, atual, { etag: `"${atual.version}"` });
      if (req.path === '/api/v1/documents/d-1/links/l-1/removals') {
        posts.push(req);
        atual = { ...atual, version: '3', linkedCents: '5550000', unlinkedCents: '3700000',
          links: [atual.links[0], { ...atual.links[1], status: 'DESFEITO', removedReason: 'Parcela errada', removedAt: '2026-09-28T13:00:00Z', removedBy: 'ana' }] };
        return resposta(200, atual, { etag: '"3"' });
      }
      if (req.path === '/api/v1/documents/d-1/cancellations') {
        posts.push(req);
        atual = { ...atual, version: '4', status: 'CANCELADO', cancelReason: 'Valor digitado errado', linkedCents: '0', unlinkedCents: '9250000' };
        return resposta(200, atual, { etag: '"4"' });
      }
      return naoAchou();
    });
    const win = abrir(<DocumentWindow recordKey="d-1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Vínculos/ }));
    await user.click(screen.getByRole('button', { name: 'Desfazer vínculo com a parcela CR00002' }));
    const desfazer = screen.getByRole('alertdialog', { name: 'Desfazer vínculo' });
    await user.type(within(desfazer).getByLabelText('Motivo'), 'Parcela errada');
    await user.click(within(desfazer).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(screen.getByLabelText('Sem vínculo')).toHaveValue('R$ 37.000,00'));
    expect(posts[0].headers?.['If-Match']).toBe('"2"');
    expect(JSON.parse(posts[0].body!)).toEqual({ reason: 'Parcela errada' });
    expect(screen.getByRole('table', { name: 'Vínculos da nota com as parcelas' })).toHaveTextContent('Desfeito');

    await user.click(screen.getByRole('button', { name: 'Cancelar documento' }));
    const cancelar = screen.getByRole('alertdialog', { name: 'Cancelar documento' });
    await user.type(within(cancelar).getByLabelText('Motivo'), 'Valor digitado errado');
    await user.click(within(cancelar).getByRole('button', { name: 'Cancelar documento' }));
    await waitFor(() => expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Valor digitado errado'));
    expect(posts[1].headers?.['If-Match']).toBe('"3"');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Documento DF00001 (nota nº 1234) cancelado com sucesso; os vínculos foram desfeitos' });
    expect(screen.queryByRole('button', { name: 'Vincular parcelas' })).toBeNull();
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

  it('Consulta vê a nota e os vínculos sem vincular, desfazer, cancelar nem classificar', async () => {
    setTransport(async (req) => (req.path === '/api/v1/documents/d-1' ? resposta(200, vinculada([['t-1', 'CR00001', '5550000']]), { etag: '"2"' }) : naoAchou()));
    abrir(<DocumentWindow recordKey="d-1" />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Vínculos/ }));
    expect(screen.getByRole('table', { name: 'Vínculos da nota com as parcelas' })).toHaveTextContent('CR00001');
    expect(screen.queryByRole('button', { name: /Desfazer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vincular parcelas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar documento' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Classificação/ }));
    expect(screen.queryByRole('button', { name: 'Classificar' })).toBeNull();
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
    expect(screen.getByLabelText('A faturar')).toHaveValue('R$ 63.000,00');
    await user.click(screen.getByRole('tab', { name: /Faturamento/ }));
    expect(screen.getByRole('table', { name: 'Notas vinculadas ao título' })).toHaveTextContent('Nº 1234 / série 1');
    await user.click(screen.getByRole('link', { name: 'Abrir documento DF00001' }));
    expect(win.open).toHaveBeenCalledWith('document', 'd-1');
  });
});
