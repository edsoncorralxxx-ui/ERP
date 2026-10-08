import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { SessionUser } from '../api/types';
import { BuscaGlobal, buscarOperacoes } from './BuscaGlobal';
import { SessionContext, sessionOf } from './SessionContext';

const USUARIO: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'sales_order.read', 'financial_title.read'],
};

const resposta = (status: number, body: unknown): TransportResponse => ({ status, headers: {}, body: JSON.stringify(body) });

function montar(user: SessionUser = USUARIO) {
  const onOpen = vi.fn();
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <BuscaGlobal onOpen={onOpen} />
    </SessionContext.Provider>,
  );
  return onOpen;
}

describe('Busca global', () => {
  it('acha operações do menu sem acento e só as que o usuário pode abrir', () => {
    const can = sessionOf(USUARIO).can;
    const chaves = (t: string, c = can) => buscarOperacoes(t, c).map((r) => `${r.kind}/${r.recordKey ?? ''}`);
    expect(chaves('clientes')).toContain('cadastro-lista/clientes');
    expect(chaves('produtos')).not.toContain('cadastro-lista/produtos');
    expect(buscarOperacoes('ORCAMENTOS', sessionOf({ ...USUARIO, permissions: ['proposal.read'] }).can).map((r) => r.kind)).toContain('proposals');
  });

  it('procura nos dados mestre e documentos permitidos e abre o escolhido com Enter', async () => {
    const pedidos: TransportRequest[] = [];
    setTransport(async (req) => {
      pedidos.push(req);
      if (req.path.startsWith('/api/v1/customers?')) return resposta(200, [{ id: 'c-1', code: 'C00001', legalName: 'Terra Firme Comércio Ltda.', tradeName: 'Terra Firme' }]);
      if (req.path.startsWith('/api/v1/sales-orders?')) return resposta(200, [{ id: 'o-1', code: 'PV00012', customerName: 'Terra Firme Comércio Ltda.' }]);
      if (req.path.startsWith('/api/v1/suppliers?')) return resposta(500, { code: 'X', message: 'falhou', details: [] });
      return resposta(200, []);
    });
    const user = userEvent.setup();
    const onOpen = montar();
    await user.type(screen.getByRole('combobox', { name: 'Busca global' }), 'terra');

    const lista = await screen.findByRole('listbox', { name: 'Resultados da busca' });
    await waitFor(() => expect(screen.getByRole('option', { name: /C00001/ })).toBeInTheDocument());
    expect(lista).toHaveTextContent('Dados mestre');
    expect(lista).toHaveTextContent('Documentos');
    expect(screen.getByRole('option', { name: /PV00012/ })).toBeInTheDocument();
    // Só as listas permitidas, todas com o termo e incluindo inativos e cancelados.
    const caminhos = pedidos.map((p) => p.path);
    expect(caminhos).toContain('/api/v1/customers?status=TODOS&search=terra');
    expect(caminhos.some((c) => c.startsWith('/api/v1/items'))).toBe(false);
    // Os caracteres encontrados vêm sublinhados.
    expect(screen.getByRole('option', { name: /C00001/ }).querySelector('u')).toHaveTextContent('Terra');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onOpen).toHaveBeenCalledWith('order', 'o-1');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Busca global' })).toHaveValue('');
  });

  it('abre a operação com um clique e avisa quando nada é encontrado', async () => {
    setTransport(async () => resposta(200, []));
    const user = userEvent.setup();
    const onOpen = montar();
    const campo = screen.getByRole('combobox', { name: 'Busca global' });
    await user.type(campo, 'fornecedores');
    await user.click(await screen.findByRole('option', { name: /Fornecedores/ }));
    expect(onOpen).toHaveBeenCalledWith('cadastro-lista', 'fornecedores');

    await user.type(campo, 'zzzz');
    expect(await screen.findByText('Nenhum registro correspondente encontrado')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Escape}');
    expect(campo).toHaveValue('');
  });
});
