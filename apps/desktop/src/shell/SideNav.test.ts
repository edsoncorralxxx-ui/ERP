import { MENU, windowFor } from './SideNav';

describe('menu lateral', () => {
  it('tem os 30 módulos do design system, cada um com itens', () => {
    expect(MENU).toHaveLength(30);
    expect(MENU.every((m) => m.itens.length > 0)).toBe(true);
  });

  it('todo item marcado como implementado abre uma janela (nenhum clique morto)', () => {
    const implementados = MENU.flatMap((m) => m.itens).filter((i) => i.implementado);
    expect(implementados.map((i) => i.rotulo).sort()).toEqual([
      'Clientes e unidades',
      'Dados da empresa',
      'Fornecedores',
      'Materiais e serviços',
      'Status do servidor',
      'Unidades e categorias',
      'Usuários e permissões',
    ]);
    expect(implementados.every((i) => windowFor(i) !== undefined)).toBe(true);
  });

  it('itens previstos não têm ação e informam a fase', () => {
    const previstos = MENU.flatMap((m) => m.itens).filter((i) => !i.implementado);
    expect(previstos.every((i) => windowFor(i) === undefined && i.fase.length > 0)).toBe(true);
  });
});
