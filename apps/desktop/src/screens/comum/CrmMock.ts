import { centavos } from '../../format';

/** Avisado quando oportunidades, leads ou atividades mudam, para os quadros abertos se atualizarem. */
export const CRM_ALTERADO = 'renda:crm-alterado';
export const avisarCrm = () => window.dispatchEvent(new Event(CRM_ALTERADO));

/** Origem com os nomes do mock. */
export const ORIGEM_MOCK: Record<string, string> = {
  FEIRA: 'Feira do setor de mandioca', SITE: 'Site', INDICACAO: 'Indicação', PROSPECCAO_ATIVA: 'Prospecção ativa', CLIENTE_ATUAL: 'Cliente da base',
  LISTA: 'Lista de prospecção', OUTRO: 'Outra',
};

/** Situação do lead no mock (as etapas da prospecção do Sprint 11 com os nomes do mock). */
export const SITUACAO_LEAD: Record<string, string> = { IDENTIFICADO: 'Novo', CONTATADO: 'Em contato', INTERESSADO: 'Qualificado', DESCARTADO: 'Descartado' };

export const TIPO_ATIVIDADE: Record<string, string> = { VISITA_TECNICA: 'Visita técnica', REUNIAO: 'Reunião', LIGACAO: 'Ligação', EMAIL: 'E-mail', TAREFA: 'Tarefa' };
export const ICONE_ATIVIDADE: Record<string, string> = {
  VISITA_TECNICA: 'rp-ico-instalacoes', REUNIAO: 'rp-ico-usuario', LIGACAO: 'rp-ico-celular', EMAIL: 'rp-ico-email', TAREFA: 'rp-ico-tarefas',
};
/** Classe da cor do evento na agenda (tokens atividade-*). */
export const COR_ATIVIDADE: Record<string, string> = { VISITA_TECNICA: 'visita', REUNIAO: 'reuniao', LIGACAO: 'ligacao', EMAIL: 'email', TAREFA: 'tarefa' };
export const SITUACAO_ATIVIDADE: Record<string, string> = { PLANEJADA: 'Planejada', HOJE: 'Hoje', ATRASADA: 'Atrasada', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };

/** Selo do mock: o mesmo mapa de cores para etapas, situação do lead e situação da atividade. */
const SELO: Record<string, string> = {
  Negociação: 'pendente', Proposta: 'pendente', Ganha: 'aprovado', Perdida: 'cancelado', Qualificado: 'aprovado', 'Em contato': 'aberto', Novo: 'pendente',
  Descartado: 'cancelado', Concluída: 'fechado', Atrasada: 'cancelado', Hoje: 'pendente', Planejada: 'aberto', Cancelada: 'cancelado',
  Substituída: 'fechado', 'Enviada ao cliente': 'pendente', Rascunho: 'aberto',
};
export const classeSelo = (rotulo: string) => `rp-badge rp-badge--${SELO[rotulo] ?? 'aberto'}`;

/** Classe da cor da etapa no kanban (tokens funil-*). */
export const COR_ETAPA: Record<string, string> = {
  PROSPECCAO: 'prospeccao', QUALIFICACAO: 'qualificacao', VISITA_TECNICA: 'visita', PROPOSTA: 'proposta', NEGOCIACAO: 'negociacao', GANHA: 'ganha', PERDIDA: 'perdida',
};

export type OportunidadeLinha = {
  id: string; code: string; title: string; customerId: string | null; customerCode: string | null; customerName: string | null;
  leadId: string | null; leadCode: string | null; leadName: string | null; stage: string; stageName: string; stagePosition: number;
  closePercent: number; status: 'ABERTA' | 'GANHA' | 'PERDIDA'; potentialCents: number; weightedCents: number; expectedClose: string | null;
  owner: string; source: string; lastActivity: string | null; daysWithoutActivity: number | null; nextActivity: string | null;
  closedAt: string | null; version: string;
};

export type Atividade = {
  id: string; kind: string; subject: string; day: string; startTime: string; endTime: string; durationMin: number;
  partnerId: string | null; partnerCode: string | null; partnerName: string | null; leadId: string | null; leadCode: string | null; leadName: string | null;
  opportunityId: string | null; opportunityCode: string | null; opportunityName: string | null; owner: string; status: string; situation: string;
  notes: string | null; version: number;
};

/** Etapa da oportunidade como o mock mostra: o nome da etapa, ou Ganha/Perdida. */
export const etapaVisivel = (o: Pick<OportunidadeLinha, 'status' | 'stageName'>) => (o.status === 'GANHA' ? 'Ganha' : o.status === 'PERDIDA' ? 'Perdida' : o.stageName);
export const nomeCliente = (o: Pick<OportunidadeLinha, 'customerName' | 'leadName'>) => o.customerName ?? o.leadName ?? '';

/** Fechada há mais de 30 dias: sai da lista e do kanban (continua no histórico, nos filtros Ganha/Perdida e no painel). */
export const fechadaAntiga = (o: Pick<OportunidadeLinha, 'status' | 'closedAt'>, hoje: string) => {
  if (o.status === 'ABERTA' || !o.closedAt) return false;
  return (Date.parse(hoje) - Date.parse(o.closedAt)) / 86400000 > 30;
};

/** "R$ 128 mil" do kanban. */
export const mil = (cents: number) => `${(cents / 100000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
/** "R$ 2.438.440" dos indicadores (sem centavos). */
export const reaisInteiros = (cents: number) => `R$ ${Math.round(cents / 100).toLocaleString('pt-BR')}`;
export const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
export const pct = (n: number) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
export { centavos };
