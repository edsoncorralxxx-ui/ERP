import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoDinheiro } from './CampoDinheiro';

function Teste({ inicial = '', onEnter = () => {} }: { inicial?: string; onEnter?: () => void }) {
  const [v, setV] = useState(inicial);
  return <CampoDinheiro aria-label="Valor" value={v} maxLength={20} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} />;
}

describe('Campo de dinheiro', () => {
  it('mostra R$ dentro do campo', () => {
    render(<Teste inicial="10,00" />);
    expect(screen.getByText('R$')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Calculadora' })).toBeNull();
  });

  it('"=" abre a calculadora e Enter põe o resultado sem confirmar a janela', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Teste inicial="10,00" onEnter={onEnter} />);
    const campo = screen.getByLabelText('Valor');
    await user.click(campo);
    await user.keyboard('=');
    expect(campo).toHaveValue('=');
    expect(screen.getByRole('img', { name: 'Calculadora' })).toBeInTheDocument();
    await user.keyboard('2+2{Enter}');
    expect(campo).toHaveValue('4,00');
    expect(screen.queryByRole('img', { name: 'Calculadora' })).toBeNull();
    expect(onEnter).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('Esc cancela a conta e volta ao valor de antes', async () => {
    const user = userEvent.setup();
    render(<Teste inicial="10,00" />);
    const campo = screen.getByLabelText('Valor');
    await user.click(campo);
    await user.keyboard('=5*3{Escape}');
    expect(campo).toHaveValue('10,00');
  });

  it('sair do campo também calcula; conta inválida volta ao valor de antes', async () => {
    const user = userEvent.setup();
    render(<><Teste inicial="1,00" /><button>Outro</button></>);
    const campo = screen.getByLabelText('Valor');
    await user.click(campo);
    await user.keyboard('=1.000*1,5');
    await user.tab();
    expect(campo).toHaveValue('1.500,00');
    await user.click(campo);
    await user.keyboard('=2+');
    await user.tab();
    expect(campo).toHaveValue('1.500,00');
  });

  it('campo somente leitura não abre a calculadora', async () => {
    const user = userEvent.setup();
    render(<CampoDinheiro aria-label="Valor" value="5,00" readOnly onChange={() => {}} />);
    await user.click(screen.getByLabelText('Valor'));
    await user.keyboard('=');
    expect(screen.getByLabelText('Valor')).toHaveValue('5,00');
  });
});
