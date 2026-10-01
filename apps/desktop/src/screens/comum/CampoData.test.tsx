import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoData } from './CampoData';

function Teste({ inicial = '', onEnter = () => {} }: { inicial?: string; onEnter?: () => void }) {
  const [v, setV] = useState(inicial);
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && onEnter()}>
      <label htmlFor="d">Vencimento</label>
      <CampoData id="d" rotulo="Vencimento" valor={v} onChange={setV} />
      <button>Outro</button>
    </div>
  );
}

describe('Campo de data', () => {
  it('o calendário aparece à direita, dentro do campo, só com o campo selecionado', async () => {
    const user = userEvent.setup();
    render(<Teste />);
    const campo = screen.getByLabelText('Vencimento');
    expect(screen.queryByRole('button', { name: 'Abrir calendário de Vencimento' })).toBeNull();
    await user.click(campo);
    const icone = screen.getByRole('button', { name: 'Abrir calendário de Vencimento' });
    expect(icone).toHaveClass('rp-campo-icone');
    await user.click(icone);
    expect(screen.getByRole('dialog', { name: 'Calendário' })).toBeInTheDocument();
    expect(campo).toHaveFocus();
  });

  it('Alt+↓ abre o calendário pelo teclado', async () => {
    const user = userEvent.setup();
    render(<Teste />);
    await user.click(screen.getByLabelText('Vencimento'));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.getByRole('dialog', { name: 'Calendário' })).toBeInTheDocument();
  });

  it('Enter resolve a conta de datas sem confirmar a janela', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Teste onEnter={onEnter} />);
    const campo = screen.getByLabelText('Vencimento');
    await user.click(campo);
    await user.keyboard('=19/05/2026+90du{Enter}');
    expect(campo).toHaveValue('24/09/2026');
    expect(onEnter).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('sem "=" também calcula ao sair; sem data parte da que estava no campo', async () => {
    const user = userEvent.setup();
    render(<Teste inicial="15/01/2026" />);
    const campo = screen.getByLabelText('Vencimento');
    await user.clear(campo);
    await user.type(campo, '19/05/2026+90dc');
    await user.tab();
    expect(campo).toHaveValue('17/08/2026');
    await user.type(campo, '=+1m');
    await user.keyboard('{Enter}');
    expect(campo).toHaveValue('17/09/2026');
  });

  it('Esc cancela a conta; conta inválida volta à data de antes ao sair', async () => {
    const user = userEvent.setup();
    render(<Teste inicial="10/10/2026" />);
    const campo = screen.getByLabelText('Vencimento');
    await user.type(campo, '=+5du');
    await user.keyboard('{Escape}');
    expect(campo).toHaveValue('10/10/2026');
    await user.type(campo, '=+5xx');
    await user.tab();
    expect(campo).toHaveValue('10/10/2026');
  });
});
