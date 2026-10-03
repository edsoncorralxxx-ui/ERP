import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Bom, BomImport, BomLine, BomSummary, BomTreeNode, EquipmentBom, EquipmentBomLine, ItemSummary, PlannedCost, SessionUser } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { BomImportWindow } from './BomImportWindow';
import { BomWindow } from './BomWindow';
import { margem } from './comum/Bom';
import { EquipmentBomPanel } from './EquipmentBomPanel';
import { PlannedCostPanel } from './PlannedCostPanel';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['bom.read', 'bom.update', 'project_bom.apply', 'item.read', 'project.read', 'equipment.read'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['bom.read', 'item.read', 'project.read', 'equipment.read'] };

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

const linha = (p: Partial<BomLine>): BomLine => ({
  id: 'l-1', position: 1, kind: 'ITEM', itemId: 'i-1', itemCode: 'P00001', itemActive: true, childBomId: null, childBomCode: null, childBomName: null,
  referenceCode: 'ELE-0038', description: 'Suporte 45° para Trilho DIN', quantity: null, uom: 'UN', unitCost: '9.44', lineCents: null, pending: 1,
  category: 'Painel elétrico', supplier: null, material: null, notes: null, itemReferenceCost: null, ...p,
});

const subLinha = (id: string, bomId: string, code: string, nome: string, cents: string, pending = 0) => linha({
  id, kind: 'SUBASSEMBLY', itemId: null, itemCode: null, childBomId: bomId, childBomCode: code, childBomName: nome, referenceCode: code, description: nome,
  quantity: '1', uom: 'CJ', unitCost: null, lineCents: cents, pending, category: null,
});

// Árvore da BOM real: Balança → Mecânica e Elétrica → Painel elétrico (o painel tem a linha sem quantidade).
const arvore = (painelCents = '2912967', pendente = 1): BomTreeNode => ({
  bomId: 'b-mod', code: 'BOM00001', name: 'Balança Hidrostática', quantity: null, totalCents: String(2847740 + 1179144 + Number(painelCents)), pending: pendente, itemLines: 0,
  children: [
    { bomId: 'b-mec', code: 'BOM00002', name: 'Mecânica — Balança', quantity: '1', totalCents: '2847740', pending: 0, itemLines: 127, children: [] },
    { bomId: 'b-ele', code: 'BOM00003', name: 'Elétrica — Balança', quantity: '1', totalCents: String(1179144 + Number(painelCents)), pending: pendente, itemLines: 26,
      children: [{ bomId: 'b-painel', code: 'BOM00004', name: 'Painel elétrico — Balança', quantity: '1', totalCents: painelCents, pending: pendente, itemLines: 50, children: [] }] },
  ],
});

const bom = (p: Partial<Bom> = {}): Bom => ({
  id: 'b-painel', code: 'BOM00004', name: 'Painel elétrico — Balança', modelId: null, modelCode: null, modelName: null, informedTotalCents: '2912967', notes: null,
  version: '1', createdAt: '2026-10-01T12:00:00Z', createdBy: 'ana', updatedAt: '2026-10-01T12:00:00Z', updatedBy: 'ana', totalCents: '2912967', pending: 1,
  lines: [linha({}), linha({ id: 'l-2', position: 2, referenceCode: 'ELE-0017', description: 'CLP Allen Bradley Micro 850', quantity: '1', unitCost: '4780', lineCents: '478000', pending: 0 })],
  categories: [{ category: 'Painel elétrico', cents: '2912967', lines: 50 }],
  problems: [{ severity: 'BLOCKING', position: 1, message: 'Linha 1 — Suporte 45° para Trilho DIN: sem quantidade.' }],
  usedBy: [{ bomId: 'b-ele', bomCode: 'BOM00003', bomName: 'Elétrica — Balança' }],
  tree: arvore().children[1].children[0],
  ...p,
});

const modelo = (p: Partial<Bom> = {}): Bom => bom({
  id: 'b-mod', code: 'BOM00001', name: 'Balança Hidrostática', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança Hidrostática', informedTotalCents: '6939851',
  totalCents: '6939851', usedBy: [], problems: [], categories: [], tree: arvore(),
  lines: [subLinha('l-m', 'b-mec', 'BOM00002', 'Mecânica — Balança', '2847740'), subLinha('l-e', 'b-ele', 'BOM00003', 'Elétrica — Balança', '4092111', 1)],
  ...p,
});

describe('BOM', () => {
  it('abre com a árvore da estrutura, mostra as linhas da submontagem escolhida e grava a quantidade com a versão lida', async () => {
    const puts: TransportRequest[] = [];
    let painel = bom();
    let raiz = modelo();
    setTransport(async (req) => {
      if (req.path === '/api/v1/boms/b-mod' && req.method === 'GET') return resposta(200, raiz, { etag: `"${raiz.version}"` });
      if (req.path === '/api/v1/boms/b-painel' && req.method === 'GET') return resposta(200, painel, { etag: `"${painel.version}"` });
      if (req.path === '/api/v1/boms/b-painel' && req.method === 'PUT') {
        puts.push(req);
        painel = bom({ version: '2', pending: 0, totalCents: '2913911', problems: [], lines: [linha({ quantity: '1', lineCents: '944', pending: 0 }), bom().lines[1]] });
        raiz = modelo({ totalCents: '6940795', pending: 0, tree: arvore('2913911', 0) });
        return resposta(200, painel, { etag: '"2"' });
      }
      return naoAchou();
    });
    const win = abrir(<BomWindow recordKey="b-mod" />);
    const user = userEvent.setup();
    const estrutura = await screen.findByRole('tree', { name: 'Estrutura da BOM' });
    expect(within(estrutura).getAllByRole('treeitem')).toHaveLength(4);
    expect(within(estrutura).getByRole('treeitem', { name: /Balança Hidrostática/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Total da BOM')).toHaveValue('R$ 69.398,51'));

    // Escolher o Painel elétrico na árvore mostra as linhas dele, com a pendência.
    await user.click(within(estrutura).getByText('Painel elétrico — Balança'));
    const grade = await screen.findByRole('table', { name: 'Linhas da BOM' });
    await waitFor(() => expect(screen.getByLabelText('BOM')).toHaveValue('BOM00004 — Painel elétrico — Balança'));
    expect(within(grade).getByText('Sem quantidade')).toBeInTheDocument();
    expect(screen.getByLabelText('Usada em')).toHaveValue('Elétrica — Balança');
    expect(screen.getByRole('note')).toHaveTextContent('enquanto isso a BOM não se aplica a equipamento');

    // Informar a quantidade grava a BOM inteira com If-Match; a árvore se atualiza com o total novo.
    await user.click(within(screen.getByRole('table', { name: 'Linhas da BOM' })).getByText('Suporte 45° para Trilho DIN'));
    await user.click(screen.getByRole('button', { name: 'Alterar linha' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Alterar linha' });
    await user.clear(within(dialogo).getByLabelText('Quantidade'));
    await user.type(within(dialogo).getByLabelText('Quantidade'), '1');
    await user.click(within(dialogo).getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].headers?.['If-Match']).toBe('"1"');
    const corpo = JSON.parse(puts[0].body!);
    expect(corpo.lines).toHaveLength(2);
    expect(corpo.lines[0]).toMatchObject({ kind: 'ITEM', itemId: 'i-1', quantity: '1', unitCost: '9.44', referenceCode: 'ELE-0038' });
    expect(corpo.informedTotalCents).toBe('2912967');
    await waitFor(() => expect(screen.getByLabelText('Total da BOM')).toHaveValue('R$ 29.139,11'));
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Linha 1 da BOM Painel elétrico — Balança atualizada com sucesso' });
    await waitFor(() => expect(within(screen.getByRole('tree', { name: 'Estrutura da BOM' })).getByRole('treeitem', { name: /Balança Hidrostática/ }))
      .toHaveTextContent('R$ 69.407,95'));
    expect(screen.queryByText(/Aprovar/)).not.toBeInTheDocument();
  });

  it('o diagrama mostra a estrutura em árvore e duas vezes na caixa abre as linhas dela', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/boms/b-mod') return resposta(200, modelo(), { etag: '"1"' });
      if (req.path === '/api/v1/boms/b-painel') return resposta(200, bom(), { etag: '"1"' });
      return naoAchou();
    });
    abrir(<BomWindow recordKey="b-mod" />);
    const user = userEvent.setup();
    await screen.findByLabelText('Total da BOM');
    await user.click(screen.getByRole('tab', { name: 'Diagrama' }));
    const diagrama = screen.getByRole('tree', { name: 'Diagrama da estrutura' });
    const caixas = within(diagrama).getAllByRole('treeitem');
    expect(caixas).toHaveLength(4);
    expect(caixas.map((c) => c.getAttribute('aria-level'))).toEqual(['1', '2', '2', '3']);
    const painel = within(diagrama).getByRole('treeitem', { name: 'Painel elétrico — Balança, R$ 29.129,67, 1 pendência' });
    expect(painel).toHaveTextContent('BOM00004 · Qtd. 1 · 50 itens');
    expect(caixas[0]).toHaveTextContent('BOM00001 · 2 submontagens');
    expect(caixas[2]).toHaveTextContent('BOM00003 · Qtd. 1 · 26 itens · 1 submontagem');
    // Uma linha de ligação por submontagem.
    expect(document.querySelectorAll('.rp-diagrama__ligacoes path')).toHaveLength(3);
    expect(document.querySelector('.rp-ico-rosca, canvas')).toBeNull();
    await user.dblClick(painel);
    await screen.findByRole('table', { name: 'Linhas da BOM' });
    await waitFor(() => expect(screen.getByLabelText('BOM')).toHaveValue('BOM00004 — Painel elétrico — Balança'));
  });

  it('a seta da submontagem escolhe a BOM na árvore e Consulta só vê', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/boms/b-mod') return resposta(200, modelo(), { etag: '"3"' });
      if (req.path === '/api/v1/boms/b-mec') {
        return resposta(200, bom({ id: 'b-mec', code: 'BOM00002', name: 'Mecânica — Balança', pending: 0, problems: [], lines: [bom().lines[1]], tree: arvore().children[0] }));
      }
      return naoAchou();
    });
    const win = abrir(<BomWindow recordKey="b-mod" />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Mostrar a submontagem Mecânica — Balança' }));
    await waitFor(() => expect(screen.getByLabelText('BOM')).toHaveValue('BOM00002 — Mecânica — Balança'));
    expect(within(screen.getByRole('tree', { name: 'Estrutura da BOM' })).getByRole('treeitem', { name: /Mecânica/ })).toHaveAttribute('aria-selected', 'true');
    expect(win.open).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Incluir linha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alterar linha' })).not.toBeInTheDocument();
  });

  it('ao incluir um item, o custo unitário vem do custo de referência do cadastro', async () => {
    const item: ItemSummary = { id: 'i-7', code: 'P00129', description: 'Painel de Comando 400x300x250mm', nature: 'MATERIAL', uom: 'UN',
      category: 'Painel elétrico', stockControlled: false, referenceCost: '135.560000', ncm: null, serviceCode: null, status: 'ATIVO', version: '2' };
    const puts: TransportRequest[] = [];
    const painel = bom({ tree: { ...arvore().children[1].children[0], quantity: null } });
    setTransport(async (req) => {
      if (req.path === '/api/v1/boms/b-painel' && req.method === 'GET') return resposta(200, painel, { etag: '"1"' });
      if (req.path.startsWith('/api/v1/items?search=')) return resposta(200, [item]);
      if (req.path === '/api/v1/boms/b-painel' && req.method === 'PUT') {
        puts.push(req);
        return resposta(200, { ...painel, version: '2' }, { etag: '"2"' });
      }
      return naoAchou();
    });
    abrir(<BomWindow recordKey="b-painel" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Incluir linha' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Incluir linha' });
    await user.type(within(dialogo).getByLabelText('Item'), 'P00129');
    await user.click(within(dialogo).getByRole('button', { name: 'Buscar item' }));
    await waitFor(() => expect(within(dialogo).getByLabelText('Custo unitário')).toHaveValue('135,56'));
    await user.click(within(dialogo).getByRole('button', { name: 'Incluir' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(JSON.parse(puts[0].body!).lines[2]).toMatchObject({ kind: 'ITEM', itemId: 'i-7', unitCost: '135.56', quantity: '1' });
  });
});

const previa: BomImport = {
  id: 'imp-1', fileName: 'BOM_Renda_Mecanica_Eletrica.json', status: 'PREVIEW', product: 'Balança Hidrostática Renda+ Automática', revisionLabel: '00',
  revisionDate: '2026-03-03', lineCount: 203, totalCents: '6939851', pending: 1, informedTotalCents: '6939851',
  groups: [
    { name: 'Mecânica', parent: 'Balança Hidrostática Renda+ Automática', lines: 127, totalCents: '2847740', pending: 0, informedCents: '2847740' },
    { name: 'Elétrica', parent: 'Balança Hidrostática Renda+ Automática', lines: 76, totalCents: '4092111', pending: 1, informedCents: '4092111' },
    { name: 'Painel elétrico', parent: 'Elétrica', lines: 50, totalCents: '2912967', pending: 1, informedCents: '2912967' },
  ],
  problems: [
    { severity: 'BLOCKING', position: 38, message: 'Elétrica 38 — Suporte 45° para Trilho DIN: sem quantidade no arquivo. Informe antes de aplicar a BOM.' },
    { severity: 'WARNING', position: null, message: 'O código ADR-01-269-P aparece 2 vezes com descrições diferentes.' },
  ],
  newItems: 201, existingItems: 0, newUnits: ['SRV (Serviço)', 'CT (Cento)'], newCategories: ['Serviços'], fileNotes: ['Valores transcritos dos PDFs.'],
  lines: [{ group: 'Mecânica', category: 'Serviços', sourceNo: 126, referenceCode: 'SRV-02', generatedCode: false, description: 'Pintura', quantity: '1', uom: 'SRV',
    unitCost: '1400', lineCents: '140000', itemCode: null, newItem: true, supplier: 'Serralheria Chacal', material: null }],
  bomId: null, createdAt: '2026-10-01T12:00:00Z', createdBy: 'ana', confirmedAt: null, confirmedBy: null,
};

describe('Importar BOM', () => {
  it('mostra a prévia com submontagens e problemas e confirma com Idempotency-Key', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/bom-imports') {
        posts.push(req);
        return resposta(201, previa);
      }
      if (req.path === '/api/v1/bom-imports/imp-1/confirmation') {
        posts.push(req);
        return resposta(200, { ...previa, status: 'CONFIRMED', bomId: 'b-mod', confirmedAt: '2026-10-01T12:05:00Z', confirmedBy: 'ana' });
      }
      return naoAchou();
    });
    const win = abrir(<BomImportWindow />);
    const user = userEvent.setup();
    const arquivo = new File(['{"produto":"Balança"}'], 'BOM_Renda_Mecanica_Eletrica.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Arquivo da BOM (JSON)'), arquivo);
    await screen.findByRole('table', { name: 'Submontagens da carga' });
    expect(JSON.parse(posts[0].body!)).toEqual({ fileName: 'BOM_Renda_Mecanica_Eletrica.json', content: '{"produto":"Balança"}' });
    expect(screen.getByLabelText('Soma das linhas')).toHaveValue('R$ 69.398,51');
    expect(screen.getByLabelText('Itens novos')).toHaveValue('201 (já cadastrados: 0)');
    const grupos = screen.getByRole('table', { name: 'Submontagens da carga' });
    expect(within(grupos).getByText('Painel elétrico')).toBeInTheDocument();
    expect(within(grupos).getByText('29.129,67', { selector: 'td:nth-child(6)' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Problemas da carga' })).toHaveTextContent('Impede aplicar ao equipamento: Elétrica 38 — Suporte 45° para Trilho DIN');
    expect(screen.getByRole('note')).toHaveTextContent('Unidades novas: SRV (Serviço), CT (Cento).');
    await user.click(screen.getByRole('button', { name: 'Confirmar carga' }));
    await waitFor(() => expect(win.open).toHaveBeenCalledWith('bom', 'b-mod'));
    expect(posts[1].headers?.['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(screen.getByText('Carregada')).toBeInTheDocument();
  });
});

const ebLinha = (p: Partial<EquipmentBomLine>): EquipmentBomLine => ({
  id: 'el-1', parentId: null, depth: 0, position: 1, kind: 'ITEM', itemId: 'i-9', itemCode: 'S00002', childRevisionId: null, referenceCode: 'SRV-02',
  description: 'Pintura', quantity: '1', uom: 'SRV', unitCost: '1400', lineCents: '140000', category: 'Serviços', supplier: null, material: null, notes: null,
  origin: 'MODEL', modelQuantity: '1', modelUnitCost: '1400', status: 'ACTIVE', state: 'MODEL', adjustmentReason: null, ...p,
});

const equipamentoRef = { id: 'e-1', code: 'EQ00001', projectId: 'pj-1', projectCode: 'PJ00001', modelId: 'md-1', modelCode: 'MD00001',
  modelName: 'Balança Hidrostática', serialNumber: null, active: true };

const aplicada: EquipmentBom = {
  equipment: equipamentoRef, applied: true, id: 'eb-1', bomId: 'b-mod', bomCode: 'BOM00001', bomName: 'Balança Hidrostática', version: '1', appliedAt: '2026-10-01T13:00:00Z', appliedBy: 'ana', updatedAt: null, updatedBy: null,
  totalCents: '6940795', pending: 0, modelTotalCents: '6940795', modelChanged: false, added: 0, removed: 0, changed: 0,
  lines: [ebLinha({ id: 'el-s', kind: 'SUBASSEMBLY', itemId: null, itemCode: null, description: 'Mecânica — Balança', uom: 'CJ', unitCost: null,
    lineCents: '2847740', referenceCode: 'BOM00002', modelUnitCost: null }), ebLinha({ parentId: 'el-s', depth: 1 })],
};

describe('BOM do equipamento', () => {
  it('aplica a BOM do modelo e retira uma linha só deste equipamento, com motivo', async () => {
    const posts: TransportRequest[] = [];
    let atual: EquipmentBom = { ...aplicada, applied: false, id: null, bomId: null, lines: [], totalCents: null, modelTotalCents: null, version: null };
    const boms: BomSummary[] = [{ id: 'b-mod', code: 'BOM00001', name: 'Balança Hidrostática', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança Hidrostática',
      totalCents: '6940795', pending: 0, lineCount: 2, updatedAt: '2026-10-01T12:00:00Z', updatedBy: 'ana' }];
    setTransport(async (req) => {
      if (req.path === '/api/v1/equipment/e-1/bom' && req.method === 'GET') return resposta(200, atual);
      if (req.path === '/api/v1/boms') return resposta(200, boms);
      if (req.path === '/api/v1/equipment/e-1/bom' && req.method === 'POST') {
        posts.push(req);
        atual = aplicada;
        return resposta(200, atual, { etag: '"1"' });
      }
      if (req.path === '/api/v1/equipment/e-1/bom/adjustments') {
        posts.push(req);
        atual = { ...aplicada, version: '2', totalCents: '6800795', removed: 1,
          lines: [aplicada.lines[0], ebLinha({ parentId: 'el-s', depth: 1, status: 'REMOVED', state: 'REMOVED', lineCents: null, adjustmentReason: 'Cliente pinta' })] };
        return resposta(200, atual, { etag: '"2"' });
      }
      return naoAchou();
    });
    const win = abrir(<EquipmentBomPanel equipmentId="e-1" ativo />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aplicar BOM' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Aplicar BOM' });
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'BOM' })).toHaveTextContent('BOM00001 — Balança Hidrostática — R$ 69.407,95'));
    await user.click(within(dialogo).getByRole('button', { name: 'Aplicar' }));
    await screen.findByRole('table', { name: 'BOM do equipamento' });
    expect(JSON.parse(posts[0].body!)).toEqual({ bomId: 'b-mod', reason: null });
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    expect(screen.getByLabelText('Total do equipamento')).toHaveValue('R$ 69.407,95');

    await user.click(screen.getByText('Pintura'));
    await user.click(screen.getByRole('button', { name: 'Retirar linha' }));
    const retirar = screen.getByRole('alertdialog', { name: 'Retirar linha' });
    await user.click(within(retirar).getByRole('button', { name: 'Retirar' }));
    expect(within(retirar).getByText('Informe o motivo do ajuste.')).toBeInTheDocument();
    await user.type(within(retirar).getByLabelText('Motivo'), 'Cliente pinta');
    await user.click(within(retirar).getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(posts[1].body!)).toMatchObject({ action: 'REMOVE', lineId: 'el-1', reason: 'Cliente pinta' });
    await waitFor(() => expect(screen.getByLabelText('Total do equipamento')).toHaveValue('R$ 68.007,95'));
    expect(screen.getByText('Retirada', { selector: '.rp-badge' })).toBeInTheDocument();
    expect(screen.getByLabelText('Diferença para o modelo')).toHaveValue('-R$ 1.400,00 — 0 incluídas, 1 retirada, 0 alteradas');
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'BOM do equipamento EQ00001 ajustada: total R$ 68.007,95' });
  });

  it('avisa quando a BOM do modelo mudou e reaplica com motivo', async () => {
    const posts: TransportRequest[] = [];
    let atual: EquipmentBom = { ...aplicada, modelTotalCents: '6950795', modelChanged: true };
    setTransport(async (req) => {
      if (req.path === '/api/v1/equipment/e-1/bom' && req.method === 'GET') return resposta(200, atual);
      if (req.path === '/api/v1/boms') {
        return resposta(200, [{ id: 'b-mod', code: 'BOM00001', name: 'Balança Hidrostática', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança Hidrostática',
          totalCents: '6950795', pending: 0, lineCount: 2, updatedAt: '2026-10-02T12:00:00Z', updatedBy: 'ana' }]);
      }
      if (req.path === '/api/v1/equipment/e-1/bom' && req.method === 'POST') {
        posts.push(req);
        atual = { ...aplicada, totalCents: '6950795', modelTotalCents: '6950795', modelChanged: false };
        return resposta(200, atual);
      }
      return naoAchou();
    });
    const win = abrir(<EquipmentBomPanel equipmentId="e-1" ativo />);
    const user = userEvent.setup();
    const aviso = await screen.findByRole('note');
    expect(aviso).toHaveTextContent('A BOM do modelo mudou depois de aplicada (total atual R$ 69.507,95)');
    await user.click(within(aviso).getByRole('button', { name: 'Reaplicar BOM' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Reaplicar BOM' });
    await user.click(within(dialogo).getByRole('button', { name: 'Reaplicar' }));
    expect(within(dialogo).getByText('Informe o motivo para reaplicar a BOM.')).toBeInTheDocument();
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Pintura reajustada');
    await user.click(within(dialogo).getByRole('button', { name: 'Reaplicar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toEqual({ bomId: 'b-mod', reason: 'Pintura reajustada' });
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument());
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'BOM Balança Hidrostática reaplicada ao equipamento EQ00001: total R$ 69.507,95' });
  });

  it('a submontagem fecha e abre como pasta', async () => {
    setTransport(async (req) => (req.path === '/api/v1/equipment/e-1/bom' ? resposta(200, aplicada) : naoAchou()));
    abrir(<EquipmentBomPanel equipmentId="e-1" ativo />);
    const user = userEvent.setup();
    await screen.findByText('Pintura');
    await user.click(screen.getByRole('button', { name: 'Fechar Mecânica — Balança' }));
    expect(screen.queryByText('Pintura')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir Mecânica — Balança' }));
    expect(screen.getByText('Pintura')).toBeInTheDocument();
  });

  it('Consulta vê a BOM sem os botões de ajuste', async () => {
    setTransport(async (req) => (req.path === '/api/v1/equipment/e-1/bom' ? resposta(200, aplicada) : naoAchou()));
    abrir(<EquipmentBomPanel equipmentId="e-1" ativo />, CONSULTA);
    await screen.findByRole('table', { name: 'BOM do equipamento' });
    expect(screen.queryByRole('button', { name: 'Retirar linha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reaplicar BOM' })).not.toBeInTheDocument();
  });
});

describe('Custo planejado do projeto', () => {
  const base: PlannedCost = {
    projectId: 'pj-1', projectCode: 'PJ00001', projectName: 'Fecularia', stage: 'PLANEJADO', contractCents: '12000000', plannedCostCents: '0', complete: false,
    withoutBom: 1, marginCents: null, marginRate: null,
    equipment: [{ equipment: equipamentoRef, applied: false, bomId: null, bomName: null, costCents: null, pending: 0, adjusted: false }],
  };

  it('equipamento sem BOM fica sem custo planejado e sem margem; com BOM mostra a margem', async () => {
    let custo = base;
    setTransport(async (req) => (req.path === '/api/v1/projects/pj-1/planned-cost' ? resposta(200, custo) : naoAchou()));
    abrir(<PlannedCostPanel projectId="pj-1" />);
    expect(await screen.findByText('Sem custo planejado')).toBeInTheDocument();
    expect(screen.getByLabelText('Margem prevista')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('1 equipamento está sem custo planejado');
    custo = { ...base, plannedCostCents: '6940795', complete: true, withoutBom: 0, marginCents: '5059205', marginRate: '0.4216',
      equipment: [{ ...base.equipment[0], applied: true, bomId: 'b-mod', bomName: 'Balança Hidrostática', costCents: '6940795' }] };
    window.dispatchEvent(new Event('renda:bom-alterada'));
    await waitFor(() => expect(screen.getByLabelText('Margem prevista')).toHaveValue('R$ 50.592,05 (42,16%)'));
    expect(screen.getByLabelText('Custo planejado')).toHaveValue('R$ 69.407,95');
  });

  it('margem em percentual arredonda nos centésimos e aceita negativa', () => {
    expect(margem('0.4216')).toBe('42,16%');
    expect(margem('0.421650')).toBe('42,17%');
    expect(margem('-0.12')).toBe('-12,00%');
    expect(margem(null)).toBe('');
  });
});


