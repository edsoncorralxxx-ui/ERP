/**
 * Ícone de cada item do menu lateral pelo contexto do nome (padrão `rp-nav--icones` do design system),
 * na mesma ordem de prioridade do protótipo Renda+ ERP Mock. Os itens em si vêm de docs/backend/b01/menu.json.
 */
const CONTEXT: [RegExp, string][] = [
  [/cliente|fornecedor|contato|transportadora|colaborador|parceiro|lead|prospec/i, 'parceiros'],
  [/oportunidade|funil|campanha|marketing/i, 'oportunidades'],
  [/proposta|orçamento|pedidos? e contrato|venda|contrato|comiss|meta|preço/i, 'vendas'],
  [/compra|cotaç|solicitaç/i, 'compras'],
  [/estoque|depósito|localizaç|lote|série|invent|saldo|recebimento|terceiro|transfer|reserva|rastreab|expediç|entrega/i, 'estoque'],
  [/nota|fiscal|imposto|apuraç|simples|alíquota|tribut|obrigaç/i, 'fiscal'],
  [/fatura/i, 'faturamento'],
  [/custo|margem|rentab|resultado/i, 'custos'],
  [/banco|conciliaç|caixa|pagamento|moeda|repasse/i, 'bancos'],
  [/receber|pagar|financeir|adiantamento|renegocia|inadimpl/i, 'financas'],
  [/conta|lançamento|balan|dre|razão|diário|contábil|rateio|orçad/i, 'contabilidade'],
  [/produção|fabricaç|montagem|apontamento|automação|industrial/i, 'producao'],
  [/mrp|necessidade|sugest|demanda|capacidade/i, 'mrp'],
  [/projeto|cronograma|eap|marco|etapa|risco/i, 'projetos'],
  [/instalaç|comissionamento|aceite|viagem/i, 'instalacoes'],
  [/qualidade|inspeç|checklist|conformidade|corretiva|preventiva|certificado|teste|calibra/i, 'qualidade'],
  [/manutenç|ordem de serviço|peça/i, 'manutencao'],
  [/chamado|ticket|assistência|garantia|visita|sla|satisfaç|relacionamento|conhecimento/i, 'posvenda'],
  [/serviço/i, 'servico'],
  [/tarefa|aprovaç|pendente|agenda|plano de ação|decis/i, 'tarefas'],
  [/documento|arquivo|desenho|manual|laudo|foto|modelo/i, 'documentos'],
  [/import|integra|servidor/i, 'integracoes'],
  [/relatório|dashboard|painel|visão|indicador|cockpit|problemas/i, 'relatorios'],
  [/usuário|perfil|permiss|departamento|empresa|parâmetro|sequência|auditoria/i, 'administracao'],
  [/equipamento/i, 'equipamentos'],
  [/engenharia|bom|estrutura|revis/i, 'engenharia'],
  [/produto|material|marca|categoria|unidade/i, 'formulario'],
];

export function subIcon(name: string, moduleIcon: string): string {
  if (moduleIcon === 'configuracoes-mod') return 'configuracoes-mod';
  if (moduleIcon === 'bi') return 'relatorios';
  return CONTEXT.find(([re]) => re.test(name))?.[1] ?? 'formulario';
}
