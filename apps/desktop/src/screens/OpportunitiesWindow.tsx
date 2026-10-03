import { useMemo } from 'react';
import { api } from '../api/client';
import type { Opportunity } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { OPORTUNIDADES_ALTERADAS, pct, useEtapas } from './comum/Crm';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloOportunidade } from './comum/Selos';

let novas = 0;
/** Chave de oportunidade nova; com `:lead:{id}` ou `:cliente:{id}` a ficha já abre com a prospecção ou o cliente. */
export const novaOportunidade = () => `novo-${++novas}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<Opportunity[]>(`/api/v1/opportunities?${q.toString()}`)).data;
};

/**
 * Janela de lista "Oportunidades" (CRM, Sprint 11): etapa com o percentual de fechamento, potencial, valor ponderado
 * (potencial × percentual, como no SAP B1), previsão de fechamento e a próxima ação; o rodapé soma o ponderado.
 */
export function OpportunitiesWindow() {
  const win = useWindow();
  const { can } = useSession();
  const etapas = useEtapas();
  const podeCriar = can('opportunity.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('opportunity', novaOportunidade()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<Opportunity>
      nome={['oportunidade', 'oportunidades']}
      rotulo="Oportunidades"
      placeholder="Número, nome, prospecção ou cliente"
      carregar={carregar}
      evento={OPORTUNIDADES_ALTERADAS}
      abrir={(id, sequencia) => win.open('opportunity', id, sequencia)}
      rotuloLinha={(o) => `Abrir oportunidade ${o.code}`}
      novo={novo}
      situacoes={[
        { valor: 'ABERTA', rotulo: 'Abertas' },
        { valor: 'GANHA', rotulo: 'Ganhas' },
        { valor: 'PERDIDA', rotulo: 'Perdidas' },
        { valor: 'TODAS', rotulo: 'Todas' },
      ]}
      filtros={[
        { chave: 'etapa', rotulo: 'Etapa', opcoes: etapas.map((e) => ({ valor: e.code, rotulo: e.name })), testa: (o, v) => o.stage === v },
        { chave: 'resp', rotulo: 'Responsável', testa: (o, v) => o.owner.toLowerCase().includes(v.toLowerCase()) },
      ]}
      selo={(o) => seloOportunidade(o.status)}
      total={(linhas) => `Ponderado: ${reais(linhas.reduce((s, o) => s + BigInt(o.weightedCents), 0n).toString())}`}
      colunas={[
        { titulo: 'Nº', valor: (o) => o.code },
        { titulo: 'Nome', valor: (o) => o.name },
        { titulo: 'Cliente ou prospecção', valor: (o) => (o.customerCode ? `${o.customerCode} — ${o.customerName}` : `${o.leadCode} — ${o.leadName}`) },
        { titulo: 'Etapa', valor: (o) => o.stageName },
        { titulo: '%', num: true, valor: (o) => pct(o.closePercent) },
        { titulo: 'Potencial', num: true, valor: (o) => reais(o.potentialCents) },
        { titulo: 'Ponderado', num: true, valor: (o) => reais(o.weightedCents) },
        { titulo: 'Fechamento previsto', valor: (o) => dataDaApi(o.expectedClose) },
        { titulo: 'Próxima ação', valor: (o) => (o.nextActionDate ? `${dataDaApi(o.nextActionDate)} — ${o.nextActionNote ?? ''}` : o.status === 'ABERTA' ? 'Sem próxima ação' : '') },
        { titulo: 'Responsável', valor: (o) => o.owner },
      ]}
    />
  );
}
