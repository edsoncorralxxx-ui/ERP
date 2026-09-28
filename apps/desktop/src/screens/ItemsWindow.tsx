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

export const NATUREZA = { MATERIAL: 'Produto', SERVICO: 'Serviço' } as const;

/** 84239029 → 8423.90.29 */
const ncm = (v: string) => `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6)}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<ItemSummary[]>(`/api/v1/items?${q.toString()}`)).data;
};

/** Janela de lista "Produtos e serviços". */
export function ItemsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('item.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('item', novoItem()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<ItemSummary>
      nome={['item', 'itens']}
      rotulo="Produtos e serviços"
      placeholder="Código, descrição, NCM ou código de serviço"
      carregar={carregar}
      evento={ITENS_ALTERADOS}
      abrir={(id, sequencia) => win.open('item', id, sequencia)}
      rotuloLinha={(i) => `Abrir ${i.description}`}
      novo={novo}
      colunas={[
        { titulo: 'Código', valor: (i) => i.code },
        { titulo: 'Descrição', valor: (i) => i.description },
        { titulo: 'Natureza', valor: (i) => NATUREZA[i.nature] },
        { titulo: 'UM', valor: (i) => i.uom },
        { titulo: 'Categoria', valor: (i) => i.category },
        { titulo: 'NCM / Cód. serviço', valor: (i) => (i.ncm ? ncm(i.ncm) : i.serviceCode ?? '') },
        { titulo: 'Estoque', valor: (i) => (i.stockControlled ? 'Sim' : 'Não') },
        { titulo: 'Custo de referência', num: true, valor: (i) => (i.referenceCost === null ? '' : `R$ ${decimalDaApi(i.referenceCost)}`) },
      ]}
      filtros={[
        {
          chave: 'natureza',
          rotulo: 'Natureza',
          opcoes: [
            { valor: 'MATERIAL', rotulo: 'Produto' },
            { valor: 'SERVICO', rotulo: 'Serviço' },
          ],
          testa: (i, v) => i.nature === v,
        },
        { chave: 'categoria', rotulo: 'Categoria', testa: (i, v) => i.category.toLowerCase().includes(v.toLowerCase()) },
      ]}
    />
  );
}
