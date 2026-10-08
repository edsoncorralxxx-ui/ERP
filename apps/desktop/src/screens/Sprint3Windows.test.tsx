import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Item, SessionUser, Supplier } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { CatalogWindow } from './CatalogWindow';
import { ItemWindow } from './ItemWindow';
import { SupplierWindow } from './SupplierWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'partner.create', 'partner.update', 'partner.deactivate', 'item.read', 'item.create', 'item.update', 'item.deactivate', 'catalog.admin'],
};
const CONSULTA: SessionUser = { ...ADMIN, profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['partner.read', 'item.read'] };

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });
const categorias = [{ id: 'cat-1', name: 'Chapas', status: 'ATIVO', version: '1', items: 0, suppliers: 0, updatedAt: null, updatedBy: 'ana' }];
const unidades = [
  { code: 'M', name: 'Metro', status: 'ATIVO', version: '1', items: 0, updatedAt: null, updatedBy: 'sistema' },
  { code: 'BR', name: 'Barra', status: 'ATIVO', version: '1', items: 0, updatedAt: null, updatedBy: 'ana' },
  { code: 'H', name: 'Hora', status: 'ATIVO', version: '1', items: 0, updatedAt: null, updatedBy: 'sistema' },
];

function abrir(janela: ReactNode, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>{janela}</WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

describe('Fornecedor', () => {
  it('CNPJ de um cliente não duplica o parceiro: o diálogo o torna também fornecedor', async () => {
    const chamadas: TransportRequest[] = [];
    const existente: Supplier = {
      id: 'p-9', code: 'C00003', legalName: 'Aços Paraná Ltda.', tradeName: null, cnpj: '11222333000181', cnpjFormatted: '11.222.333/0001-81',
      group: null, status: 'ATIVO', customer: true, leadTimeDays: null, paymentTerms: null, suppliedCategories: [], contacts: [],
      version: '2', createdAt: '2026-09-25T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
    };
    setTransport(async (req) => {
      chamadas.push(req);
      if (req.path === '/api/v1/item-categories') return resposta(200, categorias);
      if (req.path === '/api/v1/suppliers' && req.method === 'POST') {
        return resposta(422, {
          code: 'PARTNER_OTHER_ROLE', message: 'Este CNPJ já é do cliente C00003 — Aços Paraná Ltda.. Você pode torná-lo também fornecedor.',
          details: [{ field: 'cnpj', message: 'x' }, { field: 'partnerId', message: 'p-9' }, { field: 'version', message: '1' }],
        });
      }
      if (req.path === '/api/v1/suppliers/p-9/enable') return resposta(200, existente, { etag: '"2"' });
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<SupplierWindow recordKey="novo-1" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Razão social$/), 'Aços Paraná');
    await user.type(screen.getByLabelText(/^CNPJ$/), '11.222.333/0001-81');
    await user.dblClick(await screen.findByRole('option', { name: 'Chapas' }));
    expect(screen.getByRole('listbox', { name: 'Fornece (na ordem)' })).toHaveTextContent('Chapas');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Parceiro já cadastrado' });
    expect(dialogo).toHaveTextContent('Deseja torná-lo também fornecedor?');
    await user.click(screen.getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue('C00003'));
    const enable = chamadas.find((c) => c.path.endsWith('/enable'))!;
    expect(enable.headers?.['If-Match']).toBe('"1"');
    expect(JSON.parse(chamadas.find((c) => c.method === 'POST' && c.path === '/api/v1/suppliers')!.body!).suppliedCategoryIds).toEqual(['cat-1']);
    expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Parceiro C00003 agora também é fornecedor' });
    expect(screen.getByLabelText('Cliente')).toHaveValue('Também é cliente ativo');
  });
});

describe('Produto ou serviço', () => {
  it('material controla estoque, serviço não; os decimais vão com ponto para a API', async () => {
    const posts: TransportRequest[] = [];
    const item = (body: Record<string, unknown>, id: string, code: string): Item => ({
      id, code, description: String(body.description), nature: body.nature as Item['nature'], uom: String(body.uom), category: { id: 'cat-1', name: 'Chapas' },
      stockControlled: !!body.stockControlled, referenceCost: (body.referenceCost as string | null) ?? null, ncm: null, serviceCode: null, status: 'ATIVO',
      conversions: [], version: '1', createdAt: '2026-09-25T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
    } as unknown as Item);
    const gravados: Record<string, Item> = {};
    setTransport(async (req) => {
      if (req.path === '/api/v1/items' && req.method === 'POST') {
        posts.push(req);
        const body = JSON.parse(req.body!);
        const it = body.nature === 'SERVICO' ? item(body, 'i-2', 'SV-070') : item(body, 'i-1', 'MP-2010');
        gravados[it.id] = it;
        return resposta(201, it, { etag: '"1"' });
      }
      const g = Object.values(gravados).find((x) => req.path === `/api/v1/items/${x.id}`);
      if (g) return resposta(200, g, { etag: '"1"' });
      if (req.method === 'GET') return resposta(200, []);
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ItemWindow recordKey="novo-MATERIAL-1" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Descrição$/), 'Perfil L 40x40');
    await user.type(screen.getByLabelText('Custo de referência (R$)'), '1.234,5');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Item MP-2010 adicionado com sucesso' }));
    expect(JSON.parse(posts[0].body!)).toMatchObject({ nature: 'MATERIAL', type: 'MATERIAL', stockControlled: true, serviceCode: null });
    expect(JSON.parse(posts[0].body!).referenceCost).toMatch(/^1234\.50?$/);
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
  });

  it('serviço vai sem estoque e sem NCM', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/items' && req.method === 'POST') {
        posts.push(req);
        return resposta(422, { code: 'VALIDATION', message: 'Corrija os campos indicados.', details: [] });
      }
      if (req.method === 'GET') return resposta(200, []);
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<ItemWindow recordKey="novo-SERVICO-2" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Descrição$/), 'Visita técnica');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body!)).toMatchObject({ nature: 'SERVICO', type: 'SERVICO', stockControlled: false, ncm: null, uom: 'SV' });
  });
});

describe('Unidades e categorias', () => {
  it('perfil Consulta vê as listas, mas não inclui nem altera', async () => {
    setTransport(async (req) => {
      if (req.path === '/api/v1/units-of-measure') return resposta(200, unidades);
      if (req.path === '/api/v1/item-categories') return resposta(200, categorias);
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    abrir(<CatalogWindow />, CONSULTA);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Barra'));
    expect(screen.getByLabelText('Nome')).toHaveAttribute('readonly');
    expect(screen.getByRole('radio', { name: 'Ativa' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Novo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Categorias de item/ }));
    expect(await screen.findByText('Chapas')).toBeInTheDocument();
  });
});
