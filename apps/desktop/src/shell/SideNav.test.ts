import { MENU, windowFor } from './SideNav';

describe('menu lateral', () => {
  it('tem os 25 módulos do mock, na ordem dele, cada um com itens', () => {
    expect(MENU.map((m) => m.nome)).toEqual([
      'Cadastros', 'CRM', 'Vendas', 'Engenharia', 'Compras', 'Estoque', 'MRP', 'Produção', 'Projetos', 'Instalações', 'Equipamentos',
      'Renda+', 'Qualidade', 'Manutenção', 'Pós-venda', 'Financeiro', 'Faturamento', 'Fiscal', 'Custos', 'Contabilidade / Controladoria',
      'Tarefas', 'BI & Relatórios', 'Documentos', 'Administração', 'Configurações',
    ]);
    expect(MENU.every((m) => m.itens.length > 0)).toBe(true);
  });

  it('Cadastros tem os 21 itens do mock', () => {
    expect(MENU[0].itens.map((i) => i.rotulo)).toEqual([
      'Clientes', 'Fornecedores', 'Contatos', 'Produtos', 'Serviços', 'Materiais e Componentes', 'Unidades de Medida', 'Categorias', 'Marcas',
      'Transportadoras', 'Bancos', 'Centros de Custo', 'Planos de Contas', 'Condições de Pagamento', 'Formas de Pagamento', 'Depósitos',
      'Localizações de Estoque', 'Moedas', 'Colaboradores', 'Tipos de Documento', 'Calendários e Feriados',
    ]);
  });

  it('todo item com janela abre uma janela que o app tem (nenhum clique morto)', () => {
    const comJanela = MENU.flatMap((m) => m.itens).filter((i) => i.janela);
    expect(comJanela.filter((i) => windowFor(i) === undefined).map((i) => i.janela)).toEqual([]);
  });

  it('itens sem janela ficam esmaecidos e informam a fase', () => {
    const previstos = MENU.flatMap((m) => m.itens).filter((i) => !i.janela);
    expect(previstos.every((i) => windowFor(i) === undefined && i.fase.length > 0)).toBe(true);
  });

  it('a chave da janela vem depois da barra', () => {
    expect(windowFor({ rotulo: 'Clientes', fase: 'x', janela: 'company-profile' })).toEqual({ kind: 'company-profile', recordKey: 'singleton' });
  });
});
