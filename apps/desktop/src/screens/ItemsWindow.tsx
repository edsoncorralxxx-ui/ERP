import { useMemo } from 'react';
import { api } from '../api/client';
import type { ItemSummary } from '../api/types';
import { decimalDaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';

/** Avisado pela ficha do item depois de gravar, para as listas abertas se atualizarem. */
export const ITENS_ALTERADOS = 'renda:itens-alterados';

let novos = 0;
export const novoItem = () => `novo-${++novos}`;

export const NATUREZA = { MATERIAL: 'Material', SERVICO: 'Serviço' } as const;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<ItemSummary[]>(`/api/v1/items?${q.toString()}`)).data;
};

/** Janela de lista "Materiais e serviços". */
export function ItemsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('item.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('item', novoItem()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<ItemSummary>
      nome={['item', 'itens']}
      rotulo="Materiais e serviços"
      placeholder="Código ou descrição"
      carregar={carregar}
      evento={ITENS_ALTERADOS}
      abrir={(id) => win.open('item', id)}
      rotuloLinha={(i) => `Abrir ${i.description}`}
      novo={novo}
      colunas={[
        { titulo: 'Código', valor: (i) => i.code },
        { titulo: 'Descrição', valor: (i) => i.description },
        { titulo: 'Natureza', valor: (i) => NATUREZA[i.nature] },
        { titulo: 'UM', valor: (i) => i.uom },
        { titulo: 'Categoria', valor: (i) => i.category },
        { titulo: 'Estoque', valor: (i) => (i.stockControlled ? 'Sim' : 'Não') },
        { titulo: 'Custo de referência', num: true, valor: (i) => (i.referenceCost === null ? '' : `R$ ${decimalDaApi(i.referenceCost)}`) },
      ]}
      filtros={[
        {
          chave: 'natureza',
          rotulo: 'Natureza',
          opcoes: [
            { valor: 'MATERIAL', rotulo: 'Material' },
            { valor: 'SERVICO', rotulo: 'Serviço' },
          ],
          testa: (i, v) => i.nature === v,
        },
        { chave: 'categoria', rotulo: 'Categoria', testa: (i, v) => i.category.toLowerCase().includes(v.toLowerCase()) },
      ]}
    />
  );
}
