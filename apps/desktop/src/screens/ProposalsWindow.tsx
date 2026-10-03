import { useMemo } from 'react';
import { api } from '../api/client';
import type { ProposalSummary } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { REVISAO, seloProposta } from './comum/Selos';

/** Avisado pela ficha da proposta depois de gravar, para as listas abertas se atualizarem. */
export const PROPOSTAS_ALTERADAS = 'renda:propostas-alteradas';

let novas = 0;
export const novaProposta = () => `novo-${++novas}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<ProposalSummary[]>(`/api/v1/proposals?${q.toString()}`)).data;
};

/** Janela de lista "Propostas": a revisão vigente de cada proposta, com total e validade. */
export function ProposalsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('proposal.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('proposal', novaProposta()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<ProposalSummary>
      nome={['proposta', 'propostas']}
      rotulo="Propostas"
      placeholder="Número, título ou cliente"
      carregar={carregar}
      evento={PROPOSTAS_ALTERADAS}
      abrir={(id, sequencia) => win.open('proposal', id, sequencia)}
      rotuloLinha={(p) => `Abrir proposta ${p.code}`}
      novo={novo}
      situacoes={[
        { valor: 'ABERTA', rotulo: 'Abertas' },
        { valor: 'GANHA', rotulo: 'Ganhas' },
        { valor: 'PERDIDA', rotulo: 'Perdidas' },
        { valor: 'TODOS', rotulo: 'Todas' },
      ]}
      selo={(p) => seloProposta(p.status)}
      colunas={[
        { titulo: 'Nº', valor: (p) => p.code },
        { titulo: 'Cliente', valor: (p) => `${p.customerCode} — ${p.customerName}` },
        { titulo: 'Título', valor: (p) => p.title },
        { titulo: 'Rev.', num: true, valor: (p) => p.revision },
        { titulo: 'Revisão', valor: (p) => REVISAO[p.revisionStatus] },
        { titulo: 'Validade', valor: (p) => dataDaApi(p.validUntil) },
        { titulo: 'Total', num: true, valor: (p) => reais(p.totalCents) },
      ]}
    />
  );
}
