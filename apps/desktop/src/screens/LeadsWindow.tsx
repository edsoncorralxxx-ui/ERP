import { useMemo } from 'react';
import { api } from '../api/client';
import type { Lead } from '../api/types';
import { dataDaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { estrelas, ORIGEM, PROSPECCOES_ALTERADAS, RENDA } from './comum/Crm';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloProspeccao } from './comum/Selos';

let novas = 0;
export const novaProspeccao = () => `novo-${++novas}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ stage: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<Lead[]>(`/api/v1/leads?${q.toString()}`)).data;
};

/**
 * Janela de lista "Prospecção" (CRM, Sprint 11): empresas-alvo com classificação, etapa, responsável, última interação e
 * próxima ação; Importar lista carrega a lista de prospecção com prévia.
 */
export function LeadsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('lead.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('lead', novaProspeccao()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<Lead>
      nome={['prospecção', 'prospecções']}
      rotulo="Prospecção"
      placeholder="Código, empresa, cidade ou contato"
      carregar={carregar}
      evento={PROSPECCOES_ALTERADAS}
      abrir={(id, sequencia) => win.open('lead', id, sequencia)}
      rotuloLinha={(l) => `Abrir prospecção ${l.code}`}
      novo={novo}
      rotuloSituacao="Etapa"
      situacoes={[
        { valor: 'TODAS', rotulo: 'Todas' },
        { valor: 'IDENTIFICADO', rotulo: 'Identificadas' },
        { valor: 'CONTATADO', rotulo: 'Contatadas' },
        { valor: 'INTERESSADO', rotulo: 'Interessadas' },
        { valor: 'DESCARTADO', rotulo: 'Descartadas' },
      ]}
      filtros={[
        { chave: 'uf', rotulo: 'UF', max: 2, testa: (l, v) => (l.state ?? '').toUpperCase() === v.toUpperCase() },
        { chave: 'renda', rotulo: 'Possui Renda+', opcoes: Object.entries(RENDA).map(([valor, rotulo]) => ({ valor, rotulo })), testa: (l, v) => l.hasRenda === v },
        { chave: 'resp', rotulo: 'Responsável', testa: (l, v) => l.owner.toLowerCase().includes(v.toLowerCase()) },
      ]}
      selo={(l) => seloProspeccao(l.stage)}
      acoes={
        can('lead.create') ? (
          <button type="button" className="rp-btn" onClick={() => win.open('lead-import')}>
            <span><u>I</u>mportar lista</span>
          </button>
        ) : undefined
      }
      colunas={[
        { titulo: 'Código', valor: (l) => l.code },
        { titulo: 'Empresa', valor: (l) => l.companyName },
        { titulo: 'Cidade', valor: (l) => [l.city, l.state].filter(Boolean).join(' / ') },
        { titulo: 'Renda+', valor: (l) => RENDA[l.hasRenda] },
        { titulo: 'Estrelas', valor: (l) => estrelas(l.rating) },
        { titulo: 'Origem', valor: (l) => ORIGEM[l.source] },
        { titulo: 'Responsável', valor: (l) => l.owner },
        { titulo: 'Última interação', valor: (l) => dataDaApi(l.lastInteraction) },
        { titulo: 'Próxima ação', valor: (l) => (l.nextActionDate ? `${dataDaApi(l.nextActionDate)} — ${l.nextActionNote ?? ''}` : '') },
        { titulo: 'Cliente', valor: (l) => l.customerCode ?? '' },
      ]}
    />
  );
}
