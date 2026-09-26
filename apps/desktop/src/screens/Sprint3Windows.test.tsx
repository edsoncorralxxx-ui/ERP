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

describe('Material ou serviço', () => {
  it('serviço não controla estoque e os decimais vão com ponto para a API', async () => {
    const posts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.path === '/api/v1/units-of-measure') return resposta(200, unidades);
      if (req.path === '/api/v1/item-categories') return resposta(200, categorias);
      if (req.path === '/api/v1/items' && req.method === 'POST') {
        posts.push(req);
        const body = JSON.parse(req.body!);
        const item: Item = {
          id: 'i-1', code: body.nature === 'MATERIAL' ? 'M00001' : 'S00001', description: body.description, nature: body.nature, uom: body.uom,
          category: { id: 'cat-1', name: 'Chapas' }, stockControlled: body.stockControlled, referenceCost: '1234.500000', status: 'ATIVO',
          conversions: [{ id: 'c-1', fromUom: 'BR', factor: '6.000000' }], version: '1', createdAt: '2026-09-25T12:00:00Z', createdBy: 'ana', updatedAt: null, updatedBy: null,
        };
        return resposta(201, item, { etag: '"1"' });
      }
      return resposta(404, { code: 'NOT_FOUND', message: 'x', details: [] });
    });
    const win = abrir(<ItemWindow recordKey="novo-1" />);
    const user = userEvent.setup();
    const descricao = screen.getByLabelText(/^Descrição$/);
    expect(descricao.closest('.rp-form')).toHaveClass('rp-form--adicao');
    await user.type(descricao, 'Perfil L 40x40');
    await user.click(screen.getByRole('radio', { name: 'Serviço' }));
    expect(screen.getByRole('checkbox', { name: 'Controla estoque' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Material' }));
    expect(screen.getByRole('checkbox', { name: 'Controla estoque' })).toBeChecked();
    await screen.findByRole('option', { name: 'M — Metro' });
    await user.selectOptions(screen.getByLabelText('Unidade de medida'), 'M');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'cat-1');
    await user.type(screen.getByLabelText('Custo de referência (R$)'), '1.234,5');
    await user.click(screen.getByRole('tab', { name: /Conversões/ }));
    await user.click(screen.getByRole('button', { name: /adicionar uma conversão/ }));
    await user.selectOptions(screen.getByLabelText('Unidade de compra da linha 1'), 'BR');
    await user.type(screen.getByLabelText('Fator da linha 1'), '6');
    expect(screen.getByText('1 BR = 6 M')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Material M00001 adicionado com sucesso' }));
    const body = JSON.parse(posts[0].body!);
    expect(body).toMatchObject({ nature: 'MATERIAL', uom: 'M', categoryId: 'cat-1', stockControlled: true, referenceCost: '1234.50', conversions: [{ fromUom: 'BR', factor: '6' }] });
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Geral/ }));
    expect(screen.getByLabelText('Custo de referência (R$)')).toHaveValue('1.234,50');
    expect(screen.getByRole('radio', { name: 'Serviço' })).toBeDisabled();
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
