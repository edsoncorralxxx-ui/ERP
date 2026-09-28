import { useMemo } from 'react';
import { api } from '../api/client';
import type { SalesOrderSummary } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloPedido } from './comum/Selos';

/** Avisado pela ficha do pedido depois de gravar, para as listas abertas se atualizarem. */
export const PEDIDOS_ALTERADOS = 'renda:pedidos-alterados';

let novos = 0;
export const novoPedido = () => `novo-${++novos}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<SalesOrderSummary[]>(`/api/v1/sales-orders?${q.toString()}`)).data;
};

/** Janela de lista "Pedidos e contratos", com o total dos pedidos listados. */
export function SalesOrdersWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('sales_order.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('order', novoPedido()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<SalesOrderSummary>
      nome={['pedido', 'pedidos']}
      rotulo="Pedidos e contratos"
      placeholder="Número, cliente ou unidade"
      carregar={carregar}
      evento={PEDIDOS_ALTERADOS}
      abrir={(id, sequencia) => win.open('order', id, sequencia)}
      rotuloLinha={(o) => `Abrir pedido ${o.code}`}
      novo={novo}
      situacoes={[
        { valor: 'TODOS', rotulo: 'Todos' },
        { valor: 'DRAFT', rotulo: 'Rascunhos' },
        { valor: 'CONFIRMED', rotulo: 'Confirmados' },
        { valor: 'CANCELLED', rotulo: 'Cancelados' },
      ]}
      selo={(o) => seloPedido(o.status)}
      total={(linhas) => `Total: ${reais(linhas.reduce((t, o) => t + BigInt(o.totalCents), 0n).toString())}`}
      colunas={[
        { titulo: 'Nº', valor: (o) => o.code },
        { titulo: 'Cliente', valor: (o) => `${o.customerCode} — ${o.customerName}` },
        { titulo: 'Unidade', valor: (o) => o.unitName },
        { titulo: 'Proposta', valor: (o) => o.proposalCode ?? '' },
        { titulo: 'Contratação', valor: (o) => dataDaApi(o.contractDate) },
        { titulo: 'Total', num: true, valor: (o) => reais(o.totalCents) },
      ]}
    />
  );
}
