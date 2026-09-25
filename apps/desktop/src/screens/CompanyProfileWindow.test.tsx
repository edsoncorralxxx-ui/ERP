import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setTransport, type TransportRequest, type TransportResponse } from '../api/client';
import type { CompanyProfile } from '../api/types';
import { WindowContext, type WindowApi } from '../windows/WindowContext';
import { CompanyProfileWindow } from './CompanyProfileWindow';

const profile = (version: string, legalName: string | null = null): CompanyProfile => ({
  id: 'id-1', legalName, tradeName: null, cnpj: null, cnpjFormatted: null,
  address: { street: null, number: null, complement: null, district: null, city: null, state: null, postalCode: null },
  phone: null, email: null, configured: legalName !== null, version, updatedAt: null, updatedBy: null,
});

function renderWindow() {
  const winApi: WindowApi = {
    windowId: 'w1',
    setDirty: vi.fn(),
    registerCommands: vi.fn(),
    notify: vi.fn(),
    requestClose: vi.fn(),
  };
  render(
    <WindowContext.Provider value={winApi}>
      <CompanyProfileWindow />
    </WindowContext.Provider>,
  );
  return winApi;
}

describe('Dados da empresa', () => {
  it('salva com a versão lida e mostra a nova versão', async () => {
    const puts: TransportRequest[] = [];
    setTransport(async (req) => {
      if (req.method === 'GET') return { status: 200, headers: { etag: '"0"' }, body: JSON.stringify(profile('0')) };
      puts.push(req);
      return { status: 200, headers: { etag: '"1"' }, body: JSON.stringify(profile('1', 'Fourtech Demonstração')) };
    });
    const win = renderWindow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Razão social/), 'Fourtech Demonstração');
    expect(win.setDirty).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText(/Dados salvos \(versão 1\)/);
    expect(puts[0].headers?.['If-Match']).toBe('"0"');
    expect(JSON.parse(puts[0].body!).legalName).toBe('Fourtech Demonstração');
    expect(win.setDirty).toHaveBeenLastCalledWith(false);
  });

  it('conflito de versão abre o diálogo e preserva o que foi digitado', async () => {
    setTransport(async (req): Promise<TransportResponse> =>
      req.method === 'GET'
        ? { status: 200, headers: { etag: '"0"' }, body: JSON.stringify(profile('0')) }
        : { status: 412, headers: {}, body: JSON.stringify({ code: 'VERSION_MISMATCH', message: 'x', details: [{ field: 'version', message: 'atual=4' }] }) },
    );
    renderWindow();
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Razão social/);
    await user.type(input, 'Minha edição');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alertdialog', { name: /alterados por outra pessoa/ })).toHaveTextContent('versão atual 4');
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Razão social/)).toHaveValue('Minha edição');
  });

  it('mostra os erros de validação junto de cada campo', async () => {
    setTransport(async (req): Promise<TransportResponse> =>
      req.method === 'GET'
        ? { status: 200, headers: { etag: '"0"' }, body: JSON.stringify(profile('0')) }
        : {
            status: 422,
            headers: {},
            body: JSON.stringify({
              code: 'COMPANY_PROFILE_INVALID',
              message: 'Corrija os campos indicados.',
              details: [
                { field: 'legalName', message: 'Informe a razão social.' },
                { field: 'cnpj', message: 'Dígitos verificadores do CNPJ não conferem.' },
              ],
            }),
          },
    );
    renderWindow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/CNPJ/), '11.222.333/0001-82');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Informe a razão social/)).toBeInTheDocument();
    expect(screen.getByText(/Dígitos verificadores/)).toBeInTheDocument();
    expect(screen.getByLabelText(/CNPJ/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sem conexão mantém as alterações na janela', async () => {
    let online = true;
    setTransport(async (req) => {
      if (!online) throw new TypeError('offline');
      if (req.method === 'GET') return { status: 200, headers: { etag: '"0"' }, body: JSON.stringify(profile('0')) };
      throw new Error('inesperado');
    });
    renderWindow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Razão social/), 'Rascunho');
    online = false;
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Sem conexão/));
    expect(screen.getByLabelText(/Razão social/)).toHaveValue('Rascunho');
  });
});
