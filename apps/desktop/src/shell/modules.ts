/**
 * Módulos do menu lateral: os módulos futuros do Renda+ ERP e suas telas, conforme o mapa das 32 telas
 * (docs/backend/03-mapa-32-telas-backend.csv), na ordem do menu. Cada tela leva o próprio ícone do design system.
 * As telas que já existem abrem uma janela; as demais aparecem esmaecidas, com a fase do roteiro em que entram.
 */
import type { WindowKind } from '../windows/windowManager';

export type ScreenDef = { name: string; icon: string; phase?: string; kind?: WindowKind };
export type ModuleDef = { id: string; name: string; icon: string; subs: ScreenDef[] };

export const MODULES: ModuleDef[] = [
  { id: 'cockpit', name: 'Meu cockpit', icon: 'cockpit', subs: [{ name: 'Visão geral', icon: 'relatorios', kind: 'cockpit' }] },
  {
    id: 'cadastros', name: 'Cadastros', icon: 'cadastros', subs: [
      { name: 'Clientes e unidades', icon: 'parceiros', phase: 'B03' },
      { name: 'Fornecedores', icon: 'parceiros', phase: 'B03' },
      { name: 'Materiais e serviços', icon: 'formulario', phase: 'B03' },
      { name: 'Equipamentos', icon: 'equipamentos', phase: 'B03' },
    ],
  },
  {
    id: 'comercial', name: 'Comercial', icon: 'vendas', subs: [
      { name: 'Prospecção', icon: 'crm', phase: 'B05' },
      { name: 'Oportunidades e propostas', icon: 'oportunidades', phase: 'B05' },
      { name: 'Pedidos e contratos', icon: 'vendas', phase: 'B05' },
    ],
  },
  {
    id: 'projetos', name: 'Projetos e engenharia', icon: 'projetos', subs: [
      { name: 'Carteira de projetos', icon: 'projetos', phase: 'B05' },
      { name: 'Detalhe do projeto', icon: 'formulario', phase: 'B05' },
      { name: 'BOM — composição de custos', icon: 'engenharia', phase: 'B07' },
      { name: 'EAP e cronograma', icon: 'tarefas', phase: 'B07' },
    ],
  },
  {
    id: 'operacao', name: 'Operação industrial', icon: 'producao', subs: [
      { name: 'Necessidades e cotações', icon: 'mrp', phase: 'B08' },
      { name: 'Pedidos de compra', icon: 'compras', phase: 'B08' },
      { name: 'Recebimentos e terceiros', icon: 'estoque', phase: 'B08' },
      { name: 'Estoque e inventário', icon: 'estoque', phase: 'B08' },
      { name: 'Ordens de produção', icon: 'producao', phase: 'B09' },
      { name: 'Inspeções e qualidade', icon: 'qualidade', phase: 'B09' },
      { name: 'Instalação e entrega', icon: 'instalacoes', phase: 'B09' },
    ],
  },
  {
    id: 'financeiro', name: 'Financeiro', icon: 'financas', subs: [
      { name: 'Documentos e faturamento', icon: 'faturamento', phase: 'B06' },
      { name: 'Contas a receber', icon: 'financas', phase: 'B06' },
      { name: 'Contas a pagar', icon: 'financas', phase: 'B06' },
      { name: 'Contas e conciliação', icon: 'bancos', phase: 'B06' },
      { name: 'Fluxo de caixa', icon: 'relatorios', phase: 'B06' },
      { name: 'Custos e resultado', icon: 'custos', phase: 'B06' },
    ],
  },
  {
    id: 'gestao', name: 'Gestão', icon: 'bi', subs: [
      { name: 'Repasses', icon: 'bancos', phase: 'B10' },
      { name: 'Impostos gerenciais', icon: 'fiscal', phase: 'B10' },
      { name: 'Relatórios', icon: 'relatorio-lista', phase: 'B10' },
    ],
  },
  {
    id: 'posvenda', name: 'Pós-venda', icon: 'posvenda', subs: [
      { name: 'Assistência técnica', icon: 'servico', phase: 'B11' },
      { name: 'Manutenção preventiva', icon: 'manutencao', phase: 'B11' },
    ],
  },
  {
    id: 'admin', name: 'Administração', icon: 'administracao', subs: [
      { name: 'Dados da empresa', icon: 'cadastros', kind: 'company-profile' },
      { name: 'Status do servidor', icon: 'integracoes', kind: 'server-status' },
      { name: 'Importação e conferência', icon: 'integracoes', phase: 'B04' },
      { name: 'Configurações e manutenção', icon: 'configuracoes-mod', phase: 'B13' },
    ],
  },
];
