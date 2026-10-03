import type { LeadStage, OpportunityStatus, OrderStatus, ProjectStage, ProposalStatus, TitleStatus } from '../../api/types';

/** Selos de situação (componente Selo de status): sempre com a palavra, nunca só a cor. */
const selo = (classe: string, texto: string) => <span className={`rp-badge${classe ? ` rp-badge--${classe}` : ''}`}>{texto}</span>;

export const PROPOSTA: Record<ProposalStatus, string> = { ABERTA: 'Aberta', GANHA: 'Ganha', PERDIDA: 'Perdida' };
export const seloProposta = (s: ProposalStatus) => selo(s === 'ABERTA' ? 'aberto' : s === 'GANHA' ? 'aprovado' : 'cancelado', PROPOSTA[s]);

export const REVISAO = { RASCUNHO: 'Rascunho', EMITIDA: 'Emitida' } as const;
export const seloRevisao = (s: 'RASCUNHO' | 'EMITIDA') => selo(s === 'RASCUNHO' ? '' : 'fechado', REVISAO[s]);

export const PEDIDO: Record<OrderStatus, string> = {
  DRAFT: 'Rascunho', CONFIRMED: 'Confirmado', IN_EXECUTION: 'Em execução', COMPLETED: 'Concluído', CANCELLED: 'Cancelado',
};
export const seloPedido = (s: OrderStatus) =>
  selo(s === 'DRAFT' ? '' : s === 'CANCELLED' ? 'cancelado' : s === 'COMPLETED' ? 'fechado' : s === 'IN_EXECUTION' ? 'pendente' : 'aprovado', PEDIDO[s]);

export const ESTAGIO: Record<ProjectStage, string> = {
  PLANEJADO: 'Planejado', ENGENHARIA: 'Engenharia', SUPRIMENTOS: 'Suprimentos', PRODUCAO: 'Produção', INSTALACAO: 'Instalação',
  ACEITO: 'Aceito', ENCERRADO: 'Encerrado',
};
export const seloEstagio = (s: ProjectStage) => selo(s === 'ENCERRADO' ? 'cancelado' : s === 'ACEITO' ? 'aprovado' : s === 'PLANEJADO' ? 'aberto' : 'pendente', ESTAGIO[s]);

export const TITULO: Record<TitleStatus, string> = { OPEN: 'Em aberto', PARTIAL: 'Parcial', SETTLED: 'Liquidado', RENEGOTIATED: 'Renegociado', CANCELLED: 'Cancelado' };
export const seloTitulo = (s: TitleStatus) => selo(s === 'OPEN' ? 'aberto' : s === 'PARTIAL' ? 'pendente' : s === 'SETTLED' ? 'aprovado' : s === 'CANCELLED' ? 'cancelado' : 'fechado', TITULO[s]);

export const seloEquipamento = (s: 'ATIVO' | 'CANCELADO') => selo(s === 'ATIVO' ? 'aprovado' : 'cancelado', s === 'ATIVO' ? 'Ativo' : 'Cancelado');

export const ETAPA_PROSPECCAO: Record<LeadStage, string> = { IDENTIFICADO: 'Identificado', CONTATADO: 'Contatado', INTERESSADO: 'Interessado', DESCARTADO: 'Descartado' };
export const seloProspeccao = (s: LeadStage) =>
  selo(s === 'IDENTIFICADO' ? '' : s === 'CONTATADO' ? 'aberto' : s === 'INTERESSADO' ? 'pendente' : 'cancelado', ETAPA_PROSPECCAO[s]);

export const OPORTUNIDADE: Record<OpportunityStatus, string> = { ABERTA: 'Aberta', GANHA: 'Ganha', PERDIDA: 'Perdida' };
export const seloOportunidade = (s: OpportunityStatus) => selo(s === 'ABERTA' ? 'aberto' : s === 'GANHA' ? 'aprovado' : 'cancelado', OPORTUNIDADE[s]);
