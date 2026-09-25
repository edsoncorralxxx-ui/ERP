import { actionFor, MENU } from './SideNav';

describe('menu lateral', () => {
  const actions = { openCompany: vi.fn(), openStatus: vi.fn() };

  it('tem os 30 módulos do design system, cada um com itens', () => {
    expect(MENU).toHaveLength(30);
    expect(MENU.every((m) => m.itens.length > 0)).toBe(true);
  });

  it('todo item marcado como implementado abre uma janela (nenhum clique morto)', () => {
    const implementados = MENU.flatMap((m) => m.itens).filter((i) => i.implementado);
    expect(implementados.map((i) => i.rotulo).sort()).toEqual(['Dados da empresa', 'Status do servidor']);
    expect(implementados.every((i) => typeof actionFor(i, actions) === 'function')).toBe(true);
  });

  it('itens previstos não têm ação e informam a fase', () => {
    const previstos = MENU.flatMap((m) => m.itens).filter((i) => !i.implementado);
    expect(previstos.every((i) => actionFor(i, actions) === undefined && i.fase.length > 0)).toBe(true);
  });
});
