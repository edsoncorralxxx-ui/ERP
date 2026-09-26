import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { setTransport, type TransportRequest, type TransportResponse } from './api/client';

const status = { status: 'UP', apiVersion: 'v1', serverVersion: '0.1.0', database: 'UP', serverTime: '2026-09-25T12:00:00Z' };
const perfil = {
  id: 'id-1', legalName: 'Fourtech Ltda.', tradeName: 'Fourtech', cnpj: null, cnpjFormatted: null,
  address: { street: null, number: null, complement: null, district: null, city: null, state: null, postalCode: null },
  phone: null, email: null, configured: true, version: '1', updatedAt: null, updatedBy: null,
};
const ADMIN = {
  id: 'u-1', username: 'ana', displayName: 'Ana Souza', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['company.read', 'company.update', 'partner.create', 'partner.deactivate', 'partner.read', 'partner.update', 'user.admin'],
};
const CONSULTA = { ...ADMIN, id: 'u-2', username: 'bia', displayName: 'Bia Lima', profile: 'CONSULTA', profileLabel: 'Consulta', permissions: ['company.read', 'partner.read'] };

/** Servidor falso: login ana/senha-correta-1 (administradora) ou bia/senha-correta-1 (consulta). */
function servidor(extra: (req: TransportRequest) => TransportResponse | undefined = () => undefined) {
  const chamadas: TransportRequest[] = [];
  let logado = true;
  setTransport(async (req) => {
    chamadas.push(req);
    const r = extra(req);
    if (r) return r;
    const ok = (body: unknown, headers: Record<string, string> = {}) => ({ status: 200, headers, body: JSON.stringify(body) });
    if (req.path === '/api/v1/status') return ok(status);
    if (req.path === '/api/v1/session' && req.method === 'POST') {
      const { username, password } = JSON.parse(req.body!);
      if (password !== 'senha-correta-1') {
        return { status: 401, headers: {}, body: JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Usuário ou senha incorretos.', details: [] }) };
      }
      logado = true;
      return ok({ expiresAt: '2026-09-26T00:00:00Z', idleTimeoutSeconds: 28800, user: username === 'bia' ? CONSULTA : ADMIN });
    }
    if (req.path.startsWith('/api/v1/session') && req.method === 'DELETE') {
      logado = false;
      return { status: 204, headers: {}, body: '' };
    }
    if (!logado) return { status: 401, headers: {}, body: JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Sessão expirada', details: [] }) };
    if (req.path === '/api/v1/company-profile') return ok(perfil, { etag: '"1"' });
    if (req.path.startsWith('/api/v1/customers')) return ok([]);
    if (['/api/v1/suppliers', '/api/v1/items', '/api/v1/units-of-measure', '/api/v1/item-categories'].some((p) => req.path.startsWith(p))) return ok([]);
    return ok({});
  });
  return { chamadas, expirar: () => (logado = false) };
}

beforeEach(() => localStorage.clear());

async function entrar(nome = 'ana') {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Usuário'), nome);
  await user.type(screen.getByLabelText('Senha'), 'senha-correta-1');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await screen.findByRole('menubar', { name: 'Menu principal' });
  return user;
}

describe('moldura do aplicativo', () => {
  it('a tela de abertura exige usuário e senha e mostra o erro do servidor', async () => {
    servidor();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o usuário');
    await user.type(screen.getByLabelText('Usuário'), 'ana');
    await user.type(screen.getByLabelText('Senha'), 'errada-errada');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos. (INVALID_CREDENTIALS)');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();
  });

  it('depois do login saúda pelo nome e mostra o perfil no rodapé', async () => {
    const { chamadas } = servidor();
    await entrar();
    expect(await screen.findByText('Bem-vindo, Ana Souza. Você está no cockpit inicial da Fourtech.')).toBeInTheDocument();
    expect(screen.getByTitle('Usuário')).toHaveTextContent('Ana Souza (Administrador)');
    const login = chamadas.find((c) => c.path === '/api/v1/session' && c.method === 'POST')!;
    expect(JSON.parse(login.body!)).toEqual({ username: 'ana', password: 'senha-correta-1' });
  });

  it('a gaveta lista os 30 módulos e abre Clientes e unidades', async () => {
    servidor();
    const user = await entrar();
    const gaveta = screen.getByRole('complementary', { name: 'Módulos' });
    expect(within(gaveta).getAllByRole('button', { expanded: false }).length + within(gaveta).getAllByRole('button', { expanded: true }).length).toBe(30);
    await user.click(within(gaveta).getByRole('button', { name: /Clientes e unidades/ }));
    expect(await screen.findByRole('dialog', { name: 'Clientes e unidades' })).toBeInTheDocument();
    expect(await screen.findByText('Nenhum cliente cadastrado ainda.')).toBeInTheDocument();
    const futura = within(gaveta).getByText('Auditoria').closest('[aria-disabled]');
    expect(futura).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(gaveta).getByRole('button', { name: /^Fornecedores/ }));
    expect(await screen.findByRole('dialog', { name: 'Fornecedores' })).toBeInTheDocument();
    expect(await screen.findByText('Nenhum fornecedor cadastrado ainda.')).toBeInTheDocument();
  });

  it('campo com limite em foco mostra o tamanho permitido no rodapé', async () => {
    servidor();
    const user = await entrar();
    const gaveta = screen.getByRole('complementary', { name: 'Módulos' });
    await user.click(within(gaveta).getByRole('button', { name: /Clientes e unidades/ }));
    const busca = await screen.findByRole('searchbox');
    await user.click(busca);
    expect(screen.getByTitle('Tamanho permitido do campo')).toHaveTextContent('(200 caracteres)');
    await user.click(await screen.findByText('Nenhum cliente cadastrado ainda.'));
    expect(screen.getByTitle('Usuário')).toHaveTextContent('Ana Souza (Administrador)');
  });

  it('perfil Consulta não abre Usuários e não vê o botão Novo de clientes', async () => {
    servidor();
    const user = await entrar('bia');
    const gaveta = screen.getByRole('complementary', { name: 'Módulos' });
    await user.click(within(gaveta).getByRole('button', { name: 'Administração' }));
    const usuarios = within(gaveta).getByText('Usuários e permissões').closest('[aria-disabled]');
    expect(usuarios).toHaveAttribute('title', 'Usuários e permissões — seu perfil não permite');
    await user.click(within(gaveta).getByRole('button', { name: 'Cadastros' }));
    await user.click(within(gaveta).getByRole('button', { name: /Clientes e unidades/ }));
    const lista = await screen.findByRole('dialog', { name: 'Clientes e unidades' });
    expect(within(lista).queryByRole('button', { name: 'Novo' })).not.toBeInTheDocument();
  });

  it('Meu cockpit no trilho abre o cockpit maximizado; minimizar leva à faixa de janelas minimizadas', async () => {
    servidor();
    const user = await entrar();
    await user.click(screen.getByRole('tab', { name: 'Meu cockpit' }));
    const cockpit = await screen.findByRole('dialog', { name: 'Meu cockpit' });
    expect(cockpit).toHaveClass('rp-janela-mdi--max');
    await user.click(within(cockpit).getByRole('button', { name: 'Minimizar' }));
    const faixa = screen.getByRole('toolbar', { name: 'Janelas minimizadas' });
    await user.click(within(faixa).getByRole('button', { name: 'Meu cockpit' }));
    expect(screen.getByRole('dialog', { name: 'Meu cockpit' })).toBeInTheDocument();
  });

  it('bloquear a tela encerra a sessão e pede a senha por cima, sem fechar as janelas', async () => {
    const { chamadas } = servidor();
    const user = await entrar();
    await user.click(screen.getByRole('tab', { name: 'Meu cockpit' }));
    await screen.findByRole('dialog', { name: 'Meu cockpit' });
    await user.click(screen.getByRole('button', { name: 'Bloquear tela' }));
    expect(chamadas.some((c) => c.method === 'DELETE' && c.path === '/api/v1/session?reason=BLOQUEIO')).toBe(true);
    expect(await screen.findByText('Tela bloqueada. Digite sua senha para continuar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuário')).toHaveValue('ana');
    expect(screen.getByRole('dialog', { name: 'Meu cockpit' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Senha'), 'senha-correta-1');
    await user.click(within(screen.getByRole('dialog', { name: 'Renda+ ERP' })).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByText('Tela bloqueada. Digite sua senha para continuar.')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Meu cockpit' })).toBeInTheDocument();
  });

  it('sessão expirada no meio do trabalho mostra o login por cima com aviso', async () => {
    const srv = servidor();
    const user = await entrar();
    srv.expirar();
    const gaveta = screen.getByRole('complementary', { name: 'Módulos' });
    await user.click(within(gaveta).getByRole('button', { name: /Clientes e unidades/ }));
    expect(await screen.findByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Clientes e unidades' })).toBeInTheDocument();
  });

  it('o log de mensagens do sistema abre pela aba e mostra a contagem', async () => {
    servidor();
    const user = await entrar();
    await user.click(screen.getByRole('button', { name: /Log de mensagens do sistema \(0\)/ }));
    expect(screen.getByRole('log', { name: 'Log de mensagens do sistema' })).toHaveTextContent('Nenhuma mensagem nesta sessão.');
    await user.click(screen.getByRole('button', { name: 'Fechar log' }));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
});
