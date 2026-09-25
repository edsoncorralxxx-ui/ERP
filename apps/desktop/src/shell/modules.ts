/**
 * Catálogo do Painel de módulos, na ordem e com os submódulos do protótipo Renda+ ERP Mock.
 * Cada submódulo leva o ícone escolhido pelo contexto do nome (padrão `rp-nav--icones` do design system).
 * Os que já têm tela abrem uma janela; os demais aparecem esmaecidos até a sprint que os implementa.
 */
import type { WindowKind } from '../windows/windowManager';

export type ModuleDef = { id: string; name: string; icon: string; subs: string[] };

export const MODULES: ModuleDef[] = [
  { id: 'cockpit', name: 'Cockpit', icon: 'cockpit', subs: ['Home / Cockpit', 'Agenda', 'Alertas', 'Indicadores'] },
  { id: 'dashboard', name: 'Dashboard', icon: 'dashboard', subs: ['Visão Executiva', 'Comercial', 'Operacional', 'Financeiro'] },
  { id: 'cadastros', name: 'Cadastros', icon: 'cadastros', subs: ['Clientes', 'Fornecedores', 'Contatos', 'Produtos', 'Serviços', 'Materiais e Componentes', 'Unidades de Medida', 'Categorias', 'Marcas', 'Transportadoras', 'Bancos', 'Centros de Custo', 'Planos de Contas', 'Condições de Pagamento', 'Formas de Pagamento', 'Depósitos', 'Localizações de Estoque', 'Moedas', 'Colaboradores', 'Tipos de Documento', 'Calendários e Feriados'] },
  { id: 'crm', name: 'CRM', icon: 'crm', subs: ['Painel Comercial', 'Leads', 'Oportunidades', 'Atividades e Agenda'] },
  { id: 'vendas', name: 'Vendas', icon: 'vendas', subs: ['Orçamentos', 'Pedidos de Venda', 'Contratos', 'Revisões / Aditivos', 'Plano de Faturamento', 'Expedições / Entregas', 'Vendas Realizadas', 'Metas', 'Comissões', 'Tabela de Preços'] },
  { id: 'engenharia', name: 'Engenharia', icon: 'engenharia', subs: ['Estrutura de Produto', 'BOM', 'BOM Mecânica', 'BOM Elétrica'] },
  { id: 'compras', name: 'Compras', icon: 'compras', subs: ['Solicitações de Compra', 'Cotações', 'Pedidos de Compra', 'Recebimentos', 'Histórico de Compras', 'Avaliação de Fornecedores'] },
  { id: 'estoque', name: 'Estoque', icon: 'estoque', subs: ['Visão Geral', 'Saldo de Estoque', 'Entradas', 'Saídas', 'Transferências', 'Reservas', 'Inventários', 'Ajustes', 'Estoque Mínimo', 'Estoque em Trânsito', 'Lotes', 'Números de Série', 'Rastreabilidade'] },
  { id: 'mrp', name: 'MRP', icon: 'mrp', subs: ['Executar MRP', 'Demanda', 'Necessidades de Materiais', 'Necessidades Líquidas', 'Sugestões de Compra', 'Sugestões de Produção', 'Exceções', 'Histórico de Execuções'] },
  { id: 'producao', name: 'Produção', icon: 'producao', subs: ['Ordens de Produção', 'Planejamento', 'Fila de Produção', 'Necessidade de Materiais', 'Separação de Materiais', 'Reservas de Materiais', 'Consumo de Materiais', 'Apontamentos', 'Etapas de Fabricação', 'Montagem Mecânica', 'Montagem Elétrica', 'Automação', 'Testes', 'Inspeção Final', 'Produtos Finalizados', 'Custos de Produção'] },
  { id: 'projetos', name: 'Projetos', icon: 'projetos', subs: ['Carteira de Projetos', 'Projetos', 'Projetos por Status', 'Projetos Atrasados', 'Cronogramas', 'Marcos / Milestones', 'Etapas', 'Tarefas', 'Responsáveis', 'Riscos e Pendências', 'Custos do Projeto', 'Documentos', 'Histórico'] },
  { id: 'instalacoes', name: 'Instalações', icon: 'instalacoes', subs: ['Instalações Programadas', 'Em Instalação', 'Equipe de Instalação', 'Checklist', 'Despesas de Viagem', 'Comissionamento', 'Aceite do Cliente', 'Instalações Concluídas'] },
  { id: 'equipamentos', name: 'Equipamentos', icon: 'equipamentos', subs: ['Equipamentos Vendidos', 'Número de Série', 'Equipamentos por Cliente', 'Localização', 'Histórico', 'Componentes Instalados', 'Garantias', 'Documentos'] },
  { id: 'renda', name: 'Renda+', icon: 'renda', subs: ['Equipamentos Renda+', 'Operações', 'Aferições', 'Matéria Seca', 'Calibrações'] },
  { id: 'qualidade', name: 'Qualidade', icon: 'qualidade', subs: ['Inspeções', 'Checklists', 'Plano de Inspeção', 'Não Conformidades', 'Ações Corretivas', 'Ações Preventivas', 'Testes', 'Controle de Qualidade', 'Certificados', 'Indicadores da Qualidade', 'Documentos de Qualidade'] },
  { id: 'manutencao', name: 'Manutenção', icon: 'manutencao', subs: ['Ordens de Serviço', 'Manutenções Preventivas', 'Manutenções Corretivas', 'Plano de Manutenção', 'Equipamentos', 'Peças Utilizadas', 'Histórico de Manutenção'] },
  { id: 'posvenda', name: 'Pós-venda', icon: 'posvenda', subs: ['Chamados', 'Tickets', 'Assistência Técnica', 'Garantias', 'Visitas Técnicas', 'Histórico do Cliente', 'SLA', 'Pendências', 'Base de Conhecimento', 'Satisfação do Cliente'] },
  { id: 'financeiro', name: 'Financeiro', icon: 'financas', subs: ['Visão Geral', 'Contas a Receber', 'Recebimentos', 'Contas a Pagar', 'Pagamentos', 'Caixa', 'Conciliação Bancária', 'Fluxo de Caixa', 'Previsão Financeira', 'Adiantamentos', 'Renegociações', 'Cobranças', 'Inadimplência'] },
  { id: 'faturamento', name: 'Faturamento', icon: 'faturamento', subs: ['Faturamentos', 'Plano de Faturamento', 'Faturamento Parcial', 'Notas Fiscais', 'Produtos', 'Serviços', 'Parcelas', 'Cancelamentos', 'Documentos Fiscais', 'Documentos Relacionados', 'Histórico de Faturamento'] },
  { id: 'fiscal', name: 'Fiscal', icon: 'fiscal', subs: ['Painel Fiscal', 'Apuração do Simples', 'Obrigações', 'Classificação Fiscal', 'Tabelas do Simples'] },
  { id: 'custos', name: 'Custos', icon: 'custos', subs: ['Custos de Produtos', 'Custos da Renda+', 'Custos de Produção', 'Custos de Projetos', 'Custos de Instalação', 'Custos por Centro de Custo', 'Custo Padrão', 'Custo BOM', 'Custo Comprometido', 'Custo Realizado', 'Custo Previsto x Real', 'Margem de Contribuição', 'Rentabilidade'] },
  { id: 'contabil', name: 'Contabilidade / Controladoria', icon: 'contabilidade', subs: ['Plano de Contas', 'Lançamentos', 'Centros de Custo', 'Competências', 'Períodos Contábeis', 'Livro Razão', 'Diário', 'Balancete', 'DRE', 'Balanço', 'Orçamento', 'Realizado x Orçado', 'Rateios', 'Lançamentos Recorrentes', 'Fechamento Contábil'] },
  { id: 'tarefas', name: 'Tarefas', icon: 'tarefas', subs: ['Minhas Tarefas', 'Todas as Tarefas', 'Pendentes', 'Em Andamento', 'Concluídas', 'Atrasadas', 'Agenda', 'Aprovações Pendentes', 'Minhas Solicitações'] },
  { id: 'bi', name: 'BI & Relatórios', icon: 'bi', subs: ['Visão Executiva', 'Comercial', 'Vendas', 'Financeiro', 'Produção', 'Estoque', 'Compras', 'Projetos', 'Fiscal', 'Custos', 'Rentabilidade', 'Instalações', 'Qualidade', 'Pós-venda', 'Clientes', 'Produtos', 'Relatórios Personalizados'] },
  { id: 'documentos', name: 'Documentos', icon: 'documentos', subs: ['Arquivos', 'Contratos', 'Projetos', 'Manuais', 'Desenhos', 'Laudos', 'Fotos', 'Certificados', 'Documentos Fiscais', 'Documentos da Qualidade', 'Documentação Técnica', 'Modelos / Templates'] },
  { id: 'integracoes', name: 'Integrações', icon: 'integracoes', subs: ['Conectores', 'Importações', 'Exportações', 'Webhooks', 'Registro de Integrações'] },
  { id: 'rh', name: 'Recursos Humanos', icon: 'rh', subs: ['Colaboradores', 'Cargos', 'Equipes', 'Treinamentos', 'Férias e Ausências'] },
  { id: 'patrimonio', name: 'Patrimônio', icon: 'patrimonio', subs: ['Bens', 'Depreciação', 'Transferências', 'Baixas', 'Inventário Patrimonial'] },
  { id: 'admin', name: 'Administração', icon: 'administracao', subs: ['Usuários', 'Perfis e Permissões', 'Empresas', 'Departamentos', 'Sequências e Numeração', 'Parâmetros do Sistema', 'Status do Servidor'] },
  { id: 'config', name: 'Configurações', icon: 'configuracoes-mod', subs: ['Empresa', 'Preferências', 'Comercial', 'Projetos', 'Engenharia', 'Compras', 'Produção', 'Estoque', 'Financeiro', 'Fiscal', 'Qualidade', 'Instalações', 'Pós-venda'] },
];

/** Submódulos que já abrem uma janela: `módulo|submódulo` → tipo de janela. */
export const ROUTES: Record<string, WindowKind> = {
  'cockpit|Home / Cockpit': 'cockpit',
  'cockpit|Indicadores': 'cockpit',
  'admin|Empresas': 'company-profile',
  'admin|Status do Servidor': 'server-status',
  'config|Empresa': 'company-profile',
};

// Ícone do item pelo contexto do nome, na mesma ordem de prioridade do protótipo.
const CONTEXT: [RegExp, string][] = [
  [/cliente|fornecedor|contato|transportadora|colaborador|parceiro|lead/i, 'parceiros'],
  [/oportunidade|funil/i, 'oportunidades'],
  [/proposta|orçamento|pedido de venda|venda|contrato|comiss|meta|preço/i, 'vendas'],
  [/compra|cotaç|solicitaç/i, 'compras'],
  [/estoque|depósito|localizaç|lote|série|invent|saldo|entrada|saída|transfer|reserva|rastreab|expediç|entrega/i, 'estoque'],
  [/nota|fiscal|imposto|apuraç|simples|alíquota|tribut|obrigaç/i, 'fiscal'],
  [/fatura/i, 'faturamento'],
  [/custo|margem|rentab/i, 'custos'],
  [/banco|conciliaç|caixa|pagamento|recebimento|cobran|moeda/i, 'bancos'],
  [/conta|lançamento|balan|dre|razão|diário|contábil|rateio|orçad/i, 'contabilidade'],
  [/receber|pagar|financeir|adiantamento|renegocia|inadimpl/i, 'financas'],
  [/produção|fabricaç|montagem|apontamento|automação/i, 'producao'],
  [/mrp|necessidade|sugest|demanda/i, 'mrp'],
  [/projeto|cronograma|marco|etapa|risco/i, 'projetos'],
  [/instalaç|comissionamento|aceite|viagem/i, 'instalacoes'],
  [/qualidade|inspeç|checklist|conformidade|corretiva|preventiva|certificado|teste/i, 'qualidade'],
  [/manutenç|ordem de serviço|peça/i, 'manutencao'],
  [/chamado|ticket|assistência|garantia|visita|sla|satisfaç|conhecimento/i, 'posvenda'],
  [/serviço/i, 'servico'],
  [/tarefa|aprovaç|pendente|agenda/i, 'tarefas'],
  [/documento|arquivo|desenho|manual|laudo|foto|modelo/i, 'documentos'],
  [/relatório|dashboard|visão|indicador|cockpit/i, 'relatorios'],
  [/usuário|perfil|permiss|departamento|empresa|parâmetro|sequência|servidor/i, 'administracao'],
  [/equipamento/i, 'equipamentos'],
  [/engenharia|bom|estrutura|revis/i, 'engenharia'],
  [/produto|material|marca|categoria|unidade/i, 'formulario'],
];

export function subIcon(name: string, moduleId: string): string {
  if (moduleId === 'config') return 'configuracoes-mod';
  if (moduleId === 'bi') return 'relatorios';
  return CONTEXT.find(([re]) => re.test(name))?.[1] ?? 'formulario';
}
