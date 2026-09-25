import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { setTransport } from './api/client';

const status = { status: 'UP', apiVersion: 'v1', serverVersion: '0.1.0', database: 'UP', serverTime: '2026-09-25T12:00:00Z' };
const perfil = {
  id: 'id-1', legalName: 'Fourtech Ltda.', tradeName: 'Fourtech', cnpj: null, cnpjFormatted: null,
  address: { street: null, number: null, complement: null, district: null, city: null, state: null, postalCode: null },
  phone: null, email: null, configured: true, version: '1', updatedAt: null, updatedBy: null,
};

beforeEach(() => {
  localStorage.clear();
  setTransport(async (req) => ({
    status: 200,
    headers: { etag: '"1"' },
    body: JSON.stringify(req.path.startsWith('/api/v1/status') ? status : perfil),
  }));
});

async function entrar(nome = 'Ana') {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Usuário'), nome);
  await user.click(screen.getByRole('button', { name: 'OK' }));
  return user;
}

describe('moldura do aplicativo', () => {
  it('a tela de abertura exige o usuário antes de entrar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o usuário');
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();
  });

  it('depois do login saúda o usuário pelo nome e mostra a empresa', async () => {
    await entrar('Ana');
    expect(await screen.findByText('Bem-vindo, Ana. Você está no cockpit inicial da Fourtech.')).toBeInTheDocument();
    expect(screen.getByRole('menubar', { name: 'Menu principal' })).toBeInTheDocument();
  });

  it('a gaveta lista os 30 módulos e abre a janela do submódulo já implementado', async () => {
    const user = await entrar();
    const gaveta = screen.getByRole('complementary', { name: 'Módulos' });
    expect(within(gaveta).getAllByRole('button', { expanded: false }).length + within(gaveta).getAllByRole('button', { expanded: true }).length).toBe(30);
    await user.click(within(gaveta).getByRole('button', { name: 'Configurações' }));
    await user.click(within(gaveta).getByRole('button', { name: 'Empresa' }));
    expect(await screen.findByRole('dialog', { name: 'Dados da empresa' })).toBeInTheDocument();
    // Submódulo ainda sem tela fica indisponível.
    expect(within(gaveta).getByText('Preferências').closest('[aria-disabled]')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Meu cockpit no trilho abre o cockpit maximizado; minimizar leva à faixa de janelas minimizadas', async () => {
    const user = await entrar();
    await user.click(screen.getByRole('tab', { name: 'Meu cockpit' }));
    const cockpit = await screen.findByRole('dialog', { name: 'Meu cockpit' });
    expect(cockpit).toHaveClass('rp-janela-mdi--max');
    expect(screen.getByRole('tab', { name: 'Meu cockpit' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(cockpit).getByRole('button', { name: 'Minimizar' }));
    const faixa = screen.getByRole('toolbar', { name: 'Janelas minimizadas' });
    await user.click(within(faixa).getByRole('button', { name: 'Meu cockpit' }));
    expect(screen.getByRole('dialog', { name: 'Meu cockpit' })).toBeInTheDocument();
  });

  it('bloquear a tela volta para a abertura e lembra o usuário quando pedido', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Usuário'), 'Bia');
    await user.click(screen.getByLabelText('Lembrar meu usuário'));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await user.click(screen.getByRole('button', { name: 'Bloquear tela' }));
    expect(screen.getByLabelText('Usuário')).toHaveValue('Bia');
  });

  it('o log de mensagens do sistema abre pela aba e mostra a contagem', async () => {
    const user = await entrar();
    const aba = screen.getByRole('button', { name: /Log de mensagens do sistema \(0\)/ });
    await user.click(aba);
    expect(screen.getByRole('log', { name: 'Log de mensagens do sistema' })).toHaveTextContent('Nenhuma mensagem nesta sessão.');
    await user.click(screen.getByRole('button', { name: 'Fechar log' }));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
});
