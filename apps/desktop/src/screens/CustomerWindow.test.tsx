import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { Customer, SessionUser } from '../api/types';
import { SessionContext, sessionOf } from '../shell/SessionContext';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { CustomerWindow } from './CustomerWindow';

const ADMIN: SessionUser = {
  id: 'u-1', username: 'ana', displayName: 'Ana', profile: 'ADMINISTRADOR', profileLabel: 'Administrador',
  permissions: ['partner.read', 'partner.create', 'partner.update', 'partner.deactivate'],
};

const cliente = (version: string, over: Partial<Customer> = {}): Customer => ({
  id: 'c-1', code: 'C00001', legalName: 'Fecularia Vale Ltda.', tradeName: 'Vale', cnpj: null, cnpjFormatted: null, group: null,
  status: 'ATIVO', units: [{ id: 'u-9', name: 'Matriz', street: null, number: null, district: null, city: 'Assis', state: 'SP', postalCode: null }],
  contacts: [], version, createdAt: '2026-09-25T12:00:00Z', createdBy: 'ana', updatedAt: '2026-09-25T12:00:00Z', updatedBy: 'ana', ...over,
});

function abrir(recordKey: string, user: SessionUser = ADMIN) {
  const winApi: WindowApi = { windowId: 'w1', setDirty: vi.fn(), registerCommands: vi.fn(), notify: vi.fn(), requestClose: vi.fn(), open: vi.fn() };
  render(
    <SessionContext.Provider value={sessionOf(user)}>
      <WindowContext.Provider value={winApi}>
        <CustomerWindow recordKey={recordKey} />
      </WindowContext.Provider>
    </SessionContext.Provider>,
  );
  return winApi;
}

const resposta = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(body) });

describe('Cliente', () => {
  it('novo cliente abre em modo de adição e um reenvio após queda usa a mesma chave de idempotência', async () => {
    const posts: TransportRequest[] = [];
    let rede = false;
    setTransport(async (req) => {
      posts.push(req);
      if (!rede) {
        rede = true;
        throw new TypeError('queda de conexão');
      }
      return resposta(201, cliente('1'), { etag: '"1"' });
    });
    const win = abrir('novo-1');
    const user = userEvent.setup();
    const razao = screen.getByLabelText(/^Razão social$/);
    expect(razao.closest('.rp-form')).toHaveClass('rp-form--adicao');
    await user.type(razao, 'Fecularia Vale Ltda.');
    await user.click(screen.getByRole('tab', { name: /Unidades/ }));
    await user.click(screen.getByRole('button', { name: /adicionar uma unidade/ }));
    await user.type(screen.getByLabelText('Nome da linha 1'), 'Matriz');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'aviso', text: expect.stringContaining('Sem conexão') })));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(win.notify).toHaveBeenCalledWith({ tone: 'sucesso', text: 'Cliente C00001 adicionado com sucesso' }));
    expect(posts).toHaveLength(2);
    expect(posts[0].headers?.['Idempotency-Key']).toBeTruthy();
    expect(posts[1].headers?.['Idempotency-Key']).toBe(posts[0].headers?.['Idempotency-Key']);
    expect(JSON.parse(posts[0].body!).units[0]).toMatchObject({ id: null, name: 'Matriz' });
    expect(screen.getByLabelText('Código')).toHaveValue('C00001');
  });

  it('erros de unidade levam à aba Unidades e marcam a célula', async () => {
    setTransport(async () =>
      resposta(422, { code: 'PARTNER_INVALID', message: 'Corrija os campos indicados.', details: [{ field: 'units[0].state', message: 'UF inválida.' }] }),
    );
    abrir('novo-2');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Razão social$/), 'X Ltda.');
    await user.click(screen.getByRole('tab', { name: /Unidades/ }));
    await user.click(screen.getByRole('button', { name: /adicionar uma unidade/ }));
    await user.type(screen.getByLabelText('Nome da linha 1'), 'Matriz');
    await user.type(screen.getByLabelText('UF da linha 1'), 'xx');
    await user.click(screen.getByRole('tab', { name: /Geral/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText(/Unidade 1: UF inválida./)).toBeInTheDocument();
    expect(screen.getByLabelText('UF da linha 1')).toHaveAttribute('aria-invalid', 'true');
  });

  it('edição desatualizada abre o conflito e preserva o que foi digitado', async () => {
    setTransport(async (req) =>
      req.method === 'GET'
        ? resposta(200, cliente('3'), { etag: '"3"' })
        : resposta(412, { code: 'VERSION_MISMATCH', message: 'x', details: [{ field: 'version', message: 'atual=4' }] }),
    );
    abrir('c-1');
    const user = userEvent.setup();
    const fantasia = await screen.findByLabelText(/^Nome fantasia$/);
    await user.clear(fantasia);
    await user.type(fantasia, 'Outro nome');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByRole('alertdialog', { name: 'Cliente alterado por outra pessoa' })).toHaveTextContent('versão atual 4');
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText(/^Nome fantasia$/)).toHaveValue('Outro nome');
  });

  it('a aba Histórico mostra quem mudou o quê', async () => {
    setTransport(async (req) =>
      req.path.endsWith('/history')
        ? resposta(200, [
            { occurredAt: '2026-09-25T13:00:00Z', actor: 'ana', action: 'PARTNER_UPDATED', version: 2, reason: null, changes: { tradeName: { before: 'Vale', after: 'Vale do Paranapanema' } } },
            { occurredAt: '2026-09-25T12:00:00Z', actor: 'ana', action: 'PARTNER_REGISTERED', version: 1, reason: null, changes: { legalName: { before: null, after: 'Fecularia Vale Ltda.' } } },
          ])
        : resposta(200, cliente('2'), { etag: '"2"' }),
    );
    abrir('c-1');
    const user = userEvent.setup();
    await screen.findByLabelText(/^Nome fantasia$/);
    await user.click(screen.getByRole('tab', { name: /Histórico/ }));
    const grade = await screen.findByRole('table', { name: 'Histórico do cliente' });
    expect(grade).toHaveTextContent('Alteração');
    expect(grade).toHaveTextContent('Nome fantasia');
    expect(grade).toHaveTextContent('Vale do Paranapanema');
    expect(grade).toHaveTextContent('Cadastro');
  });

  it('perfil Consulta vê a ficha só para leitura, sem Atualizar nem Inativar', async () => {
    setTransport(async () => resposta(200, cliente('2'), { etag: '"2"' }));
    abrir('c-1', { ...ADMIN, profile: 'CONSULTA', permissions: ['partner.read'] });
    const razao = await screen.findByLabelText(/^Razão social$/);
    expect(razao).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument();
  });

  it('tabela de edição: Ctrl+Insert adiciona uma linha e Ctrl+Delete remove a linha em foco', async () => {
    setTransport(async () => resposta(200, cliente('1'), { etag: '"1"' }));
    abrir('c-1');
    const user = userEvent.setup();
    await screen.findByLabelText(/^Nome fantasia$/);
    await user.click(screen.getByRole('tab', { name: /Unidades/ }));
    await user.click(screen.getByLabelText('Nome da linha 1'));
    await user.keyboard('{Control>}{Insert}{/Control}');
    expect(screen.getByLabelText('Nome da linha 2')).toHaveValue('');
    await user.click(screen.getByLabelText('Nome da linha 1'));
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(screen.getByLabelText('Nome da linha 1')).toHaveValue('');
    expect(screen.queryByLabelText('Nome da linha 2')).not.toBeInTheDocument();
  });
});
