import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Bom, BomImport, BomLine, BomRevision, EquipmentBom, EquipmentBomLine, ItemSummary, PlannedCost, SessionUser } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { escolher } from '../test/selecao';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { BomImportWindow } from './BomImportWindow';
import { BomRevisionWindow } from './BomRevisionWindow';
import { margem } from './comum/Bom';
import { EquipmentBomPanel } from './EquipmentBomPanel';
import { PlannedCostPanel } from './PlannedCostPanel';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['bom.read', 'bom.update', 'bom.approve', 'project_bom.apply', 'item.read', 'project.read', 'equipment.read'],
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
  id: 'l-1', position: 1, kind: 'ITEM', itemId: 'i-1', itemCode: 'P00001', itemActive: true, childRevisionId: null, childBomId: null, childBomCode: null,
  childBomName: null, childRevisionLabel: null, childRevisionStatus: null, referenceCode: 'ELE-0038', description: 'Suporte 45° para Trilho DIN',
  quantity: null, uom: 'UN', unitCost: '9.44', lineCents: null, pending: 1, category: 'Painel elétrico', supplier: null, material: null, notes: null,
  itemReferenceCost: null, childLatestId: null, childLatestLabel: null, ...p,
});

const painel = (p: Partial<BomRevision> = {}): BomRevision => ({
  id: 'r-painel', bomId: 'b-painel', bomCode: 'BOM00004', bomName: 'Painel elétrico — Balança', modelId: null, modelCode: null, modelName: null, revision: 0,
  label: '00', status: 'DRAFT', basedOnId: null, informedTotalCents: '2912967', notes: null, importId: 'imp-1', approvedAt: null, approvedBy: null, version: '1',
  createdAt: '2026-10-01T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null, totalCents: '2912967', pending: 1,
  lines: [linha({}), linha({ id: 'l-2', position: 2, referenceCode: 'ELE-0017', description: 'CLP Allen Bradley Micro 850', quantity: '1', unitCost: '4780', lineCents: '478000', pending: 0 })],
  categories: [{ category: 'Painel elétrico', cents: '2912967', lines: 50 }],
  problems: [{ severity: 'BLOCKING', position: 1, message: 'Linha 1 — Suporte 45° para Trilho DIN: sem quantidade.' }],
  usedBy: [{ bomId: 'b-ele', bomName: 'Elétrica — Balança', revisionId: 'r-ele', revisionLabel: '00', status: 'DRAFT' }],
  revisions: [{ id: 'r-painel', label: '00', status: 'DRAFT', totalCents: '2912967', pending: 1, approvedAt: null, approvedBy: null }],
  outdatedParents: [],
  ...p,
});

describe('Revisão da BOM', () => {
  it('mostra a linha sem quantidade como pendência, grava a quantidade com a versão lida e aprova', async () => {
    const puts: TransportRequest[] = [];
    let aprovacoes = 0;
    let estado = painel();
    const lida = () => resposta(200, estado, { etag: `"${estado.version}"` });
    setTransport(async (req) => {
      if (req.path === '/api/v1/bom-revisions/r-painel' && req.method === 'GET') return lida();
      if (req.path === '/api/v1/bom-revisions/r-painel' && req.method === 'PUT') {
        puts.push(req);
        estado = painel({
          version: '2', pending: 0, totalCents: '2913911', problems: [],
          lines: [linha({ quantity: '1', lineCents: '944', pending: 0 }), painel().lines[1]],
        });
        return lida();
      }
      if (req.path === '/api/v1/bom-revisions/r-painel/approval') {
        aprovacoes++;
        if (aprovacoes === 1) {
          return resposta(422, { code: 'BOM_INCOMPLETE', message: 'A revisão tem pendências; resolva antes de aprovar.',
            details: [{ field: 'Painel elétrico — Balança rev. 00', message: 'Linha 1 — Suporte 45° para Trilho DIN: sem quantidade.' }] });
        }
        estado = painel({ status: 'APPROVED', version: '3', pending: 0, totalCents: '2913911', problems: [], approvedAt: '2026-10-01T13:00:00Z', approvedBy: 'ana',
          revisions: [{ id: 'r-painel', label: '00', status: 'APPROVED', totalCents: '2913911', pending: 0, approvedAt: null, approvedBy: null }],
          lines: [linha({ quantity: '1', lineCents: '944', pending: 0 }), painel().lines[1]] });
        return lida();
      }
      return naoAchou();
    });
    const win = abrir(<BomRevisionWindow recordKey="r-painel" />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Linhas da revisão' });
    expect(within(grade).getByText('Sem quantidade')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Total parcial: 1 linha está sem quantidade ou sem custo');
    expect(screen.getByLabelText('Total da revisão')).toHaveValue('R$ 29.129,67');

    // Aprovar com pendência: a recusa lista a linha.
    await user.click(screen.getByRole('button', { name: 'Aprovar revisão' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Aprovar revisão' })).getByRole('button', { name: 'Aprovar' }));
    const recusa = await screen.findByRole('alertdialog', { name: 'Revisão com pendências' });
    expect(recusa).toHaveTextContent('Painel elétrico — Balança rev. 00: Linha 1 — Suporte 45° para Trilho DIN: sem quantidade.');
    await user.click(within(recusa).getByRole('button', { name: 'OK' }));

    // Informar a quantidade grava o rascunho inteiro com If-Match.
    await user.click(within(grade).getByText('Suporte 45° para Trilho DIN'));
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
    await waitFor(() => expect(screen.getByLabelText('Total da revisão')).toHaveValue('R$ 29.139,11'));

    await user.click(screen.getByRole('button', { name: 'Aprovar revisão' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Aprovar revisão' })).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Revisão 00 da BOM Painel elétrico — Balança aprovada com sucesso' }));
    expect(screen.getByText('Aprovada', { selector: '.rp-badge' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alterar linha' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova revisão' })).toBeInTheDocument();
  });

  it('a submontagem abre pela seta e Consulta só vê', async () => {
    const modelo = painel({
      id: 'r-mod', bomName: 'Balança Hidrostática', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança Hidrostática', status: 'APPROVED',
      approvedAt: '2026-10-01T13:00:00Z', approvedBy: 'ana', pending: 0, problems: [], usedBy: [],
      lines: [linha({ id: 'l-s', kind: 'SUBASSEMBLY', itemId: null, itemCode: null, childRevisionId: 'r-mec', childBomId: 'b-mec', childBomCode: 'BOM00002',
        childBomName: 'Mecânica — Balança', childRevisionLabel: '00', childRevisionStatus: 'APPROVED', referenceCode: 'BOM00002', description: 'Mecânica — Balança',
        quantity: '1', uom: 'CJ', unitCost: null, lineCents: '2847740', pending: 0 })],
      revisions: [{ id: 'r-mod', label: '00', status: 'APPROVED', totalCents: '2847740', pending: 0, approvedAt: null, approvedBy: null }],
    });
    setTransport(async (req) => (req.path === '/api/v1/bom-revisions/r-mod' ? resposta(200, modelo, { etag: '"3"' }) : naoAchou()));
    const win = abrir(<BomRevisionWindow recordKey="r-mod" />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Abrir submontagem Mecânica — Balança rev. 00' }));
    expect(win.open).toHaveBeenCalledWith('bom-revision', 'r-mec');
    expect(screen.queryByRole('button', { name: 'Incluir linha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar revisão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova revisão' })).not.toBeInTheDocument();
  });
});

describe('Revisões da BOM (ajustes da Review)', () => {
  const sub = linha({ id: 'l-s', kind: 'SUBASSEMBLY', itemId: null, itemCode: null, childRevisionId: 'r-p0', childBomId: 'b-p', childBomCode: 'BOM00004',
    childBomName: 'Painel elétrico', childRevisionLabel: '00', childRevisionStatus: 'SUPERSEDED', referenceCode: 'BOM00004', description: 'Painel elétrico',
    quantity: '1', uom: 'CJ', unitCost: null, lineCents: '2913911', pending: 0, childLatestId: 'r-p3', childLatestLabel: '03' });
  const eletrica = (p: Partial<BomRevision> = {}) => painel({
    id: 'r-e1', bomId: 'b-e', bomName: 'Elétrica', label: '01', revision: 1, pending: 0, problems: [], usedBy: [], lines: [sub],
    revisions: [
      { id: 'r-e1', label: '01', status: 'DRAFT', totalCents: '2913911', pending: 0, approvedAt: null, approvedBy: null },
      { id: 'r-e0', label: '00', status: 'APPROVED', totalCents: '2913911', pending: 0, approvedAt: null, approvedBy: null },
    ],
    ...p,
  });

  it('troca de revisão na mesma janela, usa a submontagem mais nova e descarta o rascunho', async () => {
    const pedidos: TransportRequest[] = [];
    setTransport(async (req) => {
      pedidos.push(req);
      if (req.path === '/api/v1/bom-revisions/r-e1' && req.method === 'GET') return resposta(200, eletrica(), { etag: '"1"' });
      if (req.path === '/api/v1/bom-revisions/r-e0' && req.method === 'GET') {
        return resposta(200, eletrica({ id: 'r-e0', label: '00', revision: 0, status: 'APPROVED', approvedAt: '2026-10-01T12:00:00Z', approvedBy: 'ana' }), { etag: '"2"' });
      }
      if (req.path === '/api/v1/bom-revisions/r-e1' && req.method === 'PUT') return resposta(200, eletrica({ version: '2' }), { etag: '"2"' });
      if (req.path === '/api/v1/bom-revisions/r-e1' && req.method === 'DELETE') {
        return resposta(200, { id: 'b-e', approved: { id: 'r-e0', label: '00', status: 'APPROVED', totalCents: '2913911', pending: 0, approvedAt: null, approvedBy: null } });
      }
      return naoAchou();
    });
    const win = abrir(<BomRevisionWindow recordKey="r-e1" />);
    const user = userEvent.setup();
    const grade = await screen.findByRole('table', { name: 'Linhas da revisão' });
    expect(within(grade).getByText('Há rev. 03 aprovada')).toBeInTheDocument();
    await user.click(within(grade).getByRole('button', { name: 'Usar a rev. 03' }));
    await waitFor(() => expect(pedidos.some((r) => r.method === 'PUT')).toBe(true));
    expect(JSON.parse(pedidos.find((r) => r.method === 'PUT')!.body!).lines[0]).toMatchObject({ kind: 'SUBASSEMBLY', childRevisionId: 'r-p3' });

    await user.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Descartar rascunho' })).getByRole('button', { name: 'Descartar' }));
    // Depois de descartar, a mesma janela mostra a revisão aprovada.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Revisão' })).toHaveTextContent('00 — Aprovada'));
    expect(pedidos.some((r) => r.method === 'DELETE' && r.path === '/api/v1/bom-revisions/r-e1')).toBe(true);
    await escolher(user, screen.getByRole('combobox', { name: 'Revisão' }), '01 — Rascunho');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Revisão' })).toHaveTextContent('01 — Rascunho'));
    expect(win.open).not.toHaveBeenCalled();
  });

  it('depois de aprovar a submontagem oferece atualizar as BOMs de cima', async () => {
    const posts: TransportRequest[] = [];
    let estado = painel({ pending: 0, problems: [], lines: [painel().lines[1]] });
    setTransport(async (req) => {
      if (req.path === '/api/v1/bom-revisions/r-painel' && req.method === 'GET') return resposta(200, estado, { etag: `"${estado.version}"` });
      if (req.path === '/api/v1/bom-revisions/r-painel/approval') {
        estado = painel({ status: 'APPROVED', version: '2', pending: 0, problems: [], lines: [painel().lines[1]], approvedAt: '2026-10-02T12:00:00Z', approvedBy: 'ana',
          outdatedParents: [{ bomId: 'b-e', bomName: 'Elétrica', revisionId: 'r-e0', revisionLabel: '00', usesLabel: '00', hasDraft: false }],
          revisions: [{ id: 'r-painel', label: '00', status: 'APPROVED', totalCents: '2912967', pending: 0, approvedAt: null, approvedBy: null }] });
        return resposta(200, estado, { etag: '"2"' });
      }
      if (req.path === '/api/v1/bom-revisions/r-painel/propagation') {
        posts.push(req);
        estado = { ...estado, outdatedParents: [] };
        return resposta(200, [
          { bomId: 'b-e', bomName: 'Elétrica', fromLabel: '00', toLabel: '01', revisionId: 'r-e1', action: 'APPROVED' },
          { bomId: 'b-m', bomName: 'Balança', fromLabel: '00', toLabel: '01', revisionId: 'r-m1', action: 'APPROVED' },
        ]);
      }
      return naoAchou();
    });
    const win = abrir(<BomRevisionWindow recordKey="r-painel" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aprovar revisão' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Aprovar revisão' })).getByRole('button', { name: 'Aprovar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Atualizar BOMs de cima' });
    expect(within(dialogo).getByRole('list', { name: 'BOMs desatualizadas' })).toHaveTextContent('Elétrica rev. 00 usa a rev. 00 — ganha uma revisão nova, aprovada');
    await user.click(within(dialogo).getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'BOMs atualizadas: Elétrica rev. 01 aprovada; Balança rev. 01 aprovada' }));
  });

  it('ao incluir um item, o custo unitário vem do custo de referência do cadastro', async () => {
    const item: ItemSummary = { id: 'i-7', code: 'P00129', description: 'Painel de Comando 400x300x250mm', nature: 'MATERIAL', uom: 'UN',
      category: 'Painel elétrico', stockControlled: false, referenceCost: '135.560000', ncm: null, serviceCode: null, status: 'ATIVO', version: '2' };
    const puts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/bom-revisions/r-painel' && req.method === 'GET') return resposta(200, painel(), { etag: '"1"' });
      if (req.path.startsWith('/api/v1/items?search=')) return resposta(200, [item]);
      if (req.path === '/api/v1/bom-revisions/r-painel' && req.method === 'PUT') {
        puts.push(req);
        return resposta(200, painel({ version: '2' }), { etag: '"2"' });
      }
      return naoAchou();
    });
    abrir(<BomRevisionWindow recordKey="r-painel" />);
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
    { severity: 'BLOCKING', position: 38, message: 'Elétrica 38 — Suporte 45° para Trilho DIN: sem quantidade no arquivo. Informe antes de aprovar a revisão.' },
    { severity: 'WARNING', position: null, message: 'O código ADR-01-269-P aparece 2 vezes com descrições diferentes.' },
  ],
  newItems: 201, existingItems: 0, newUnits: ['SRV (Serviço)', 'CT (Cento)'], newCategories: ['Serviços'], fileNotes: ['Valores transcritos dos PDFs.'],
  lines: [{ group: 'Mecânica', category: 'Serviços', sourceNo: 126, referenceCode: 'SRV-02', generatedCode: false, description: 'Pintura', quantity: '1', uom: 'SRV',
    unitCost: '1400', lineCents: '140000', itemCode: null, newItem: true, supplier: 'Serralheria Chacal', material: null }],
  revisionId: null, bomId: null, createdAt: '2026-10-01T12:00:00Z', createdBy: 'ana', confirmedAt: null, confirmedBy: null,
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
        return resposta(200, { ...previa, status: 'CONFIRMED', revisionId: 'r-mod', bomId: 'b-mod', confirmedAt: '2026-10-01T12:05:00Z', confirmedBy: 'ana' });
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
    expect(screen.getByRole('list', { name: 'Problemas da carga' })).toHaveTextContent('Impede a aprovação: Elétrica 38 — Suporte 45° para Trilho DIN');
    expect(screen.getByRole('note')).toHaveTextContent('Unidades novas: SRV (Serviço), CT (Cento).');
    await user.click(screen.getByRole('button', { name: 'Confirmar carga' }));
    await waitFor(() => expect(win.open).toHaveBeenCalledWith('bom-revision', 'r-mod'));
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
  equipment: equipamentoRef, applied: true, id: 'eb-1', bomId: 'b-mod', bomCode: 'BOM00001', bomName: 'Balança Hidrostática', revisionId: 'r-mod',
  revisionLabel: '00', revisionStatus: 'APPROVED', version: '1', appliedAt: '2026-10-01T13:00:00Z', appliedBy: 'ana', updatedAt: null, updatedBy: null,
  totalCents: '6940795', pending: 0, modelTotalCents: '6940795', added: 0, removed: 0, changed: 0,
  lines: [ebLinha({ id: 'el-s', kind: 'SUBASSEMBLY', itemId: null, itemCode: null, description: 'Mecânica — Balança', uom: 'CJ', unitCost: null,
    lineCents: '2847740', referenceCode: 'BOM00002', modelUnitCost: null }), ebLinha({ parentId: 'el-s', depth: 1 })],
};

describe('BOM do equipamento', () => {
  it('aplica a revisão aprovada do modelo e retira uma linha só deste equipamento, com motivo', async () => {
    const posts: TransportRequest[] = [];
    let atual: EquipmentBom = { ...aplicada, applied: false, id: null, bomId: null, revisionId: null, revisionLabel: null, revisionStatus: null, lines: [], totalCents: null, modelTotalCents: null, version: null };
    const boms: Bom[] = [{ id: 'b-mod', code: 'BOM00001', name: 'Balança Hidrostática', modelId: 'md-1', modelCode: 'MD00001', modelName: 'Balança Hidrostática',
      approved: { id: 'r-mod', label: '00', status: 'APPROVED', totalCents: '6940795', pending: 0, approvedAt: null, approvedBy: null }, draft: null, revisionCount: 1,
      createdAt: '2026-10-01T12:00:00Z', createdBy: 'ana' }];
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
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Revisão' })).toHaveTextContent('BOM00001 — Balança Hidrostática — rev. 00 — R$ 69.407,95'));
    await user.click(within(dialogo).getByRole('button', { name: 'Aplicar' }));
    await screen.findByRole('table', { name: 'BOM do equipamento' });
    expect(JSON.parse(posts[0].body!)).toEqual({ revisionId: 'r-mod', reason: null });
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

  it('Consulta vê a BOM sem os botões de ajuste', async () => {
    setTransport(async (req) => (req.path === '/api/v1/equipment/e-1/bom' ? resposta(200, aplicada) : naoAchou()));
    abrir(<EquipmentBomPanel equipmentId="e-1" ativo />, CONSULTA);
    await screen.findByRole('table', { name: 'BOM do equipamento' });
    expect(screen.queryByRole('button', { name: 'Retirar linha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar revisão' })).not.toBeInTheDocument();
  });
});

describe('Custo planejado do projeto', () => {
  const base: PlannedCost = {
    projectId: 'pj-1', projectCode: 'PJ00001', projectName: 'Fecularia', stage: 'PLANEJADO', contractCents: '12000000', plannedCostCents: '0', complete: false,
    withoutBom: 1, marginCents: null, marginRate: null,
    equipment: [{ equipment: equipamentoRef, applied: false, bomId: null, bomName: null, revisionId: null, revisionLabel: null, costCents: null, pending: 0, adjusted: false }],
  };

  it('equipamento sem BOM fica sem custo planejado e sem margem; com BOM mostra a margem', async () => {
    let custo = base;
    setTransport(async (req) => (req.path === '/api/v1/projects/pj-1/planned-cost' ? resposta(200, custo) : naoAchou()));
    abrir(<PlannedCostPanel projectId="pj-1" />);
    expect(await screen.findByText('Sem custo planejado')).toBeInTheDocument();
    expect(screen.getByLabelText('Margem prevista')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('1 equipamento está sem custo planejado');
    custo = { ...base, plannedCostCents: '6940795', complete: true, withoutBom: 0, marginCents: '5059205', marginRate: '0.4216',
      equipment: [{ ...base.equipment[0], applied: true, bomId: 'b-mod', bomName: 'Balança Hidrostática', revisionId: 'r-mod', revisionLabel: '00', costCents: '6940795' }] };
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


