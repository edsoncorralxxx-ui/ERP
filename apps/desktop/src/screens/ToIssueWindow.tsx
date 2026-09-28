import { api } from '../api/client';
import type { OrderInvoicing } from '../api/types';
import { reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { novoDocumento } from './DocumentsWindow';
import { TITULOS_ALTERADOS } from './ReceivablesWindow';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<OrderInvoicing[]>(`/api/v1/invoicing/orders?${q.toString()}`)).data;
};

/** Situação do pedido pelo caixa: a emitir, em dia ou faturado além do recebido (depois de um estorno). */
export const seloCaixa = (o: Pick<OrderInvoicing, 'toIssueCents' | 'beyondReceivedCents'>) =>
  BigInt(o.toIssueCents) > 0n ? (
    <span className="rp-badge rp-badge--pendente">A emitir</span>
  ) : BigInt(o.beyondReceivedCents) > 0n ? (
    <span className="rp-badge rp-badge--cancelado">Faturado além do recebido</span>
  ) : (
    <span className="rp-badge rp-badge--aprovado">Em dia</span>
  );

/**
 * Janela de lista "Notas a emitir" (regime de caixa, decisão do PO na Review da Sprint 6): os pedidos confirmados com
 * recebimento que ainda não tem nota, com quanto é produto (NF-e) e quanto é serviço (NFS-e) — notas separadas, Sprint 7. A seta abre a nota nova já com o pedido,
 * para registrar a nota depois de emiti-la no portal da SEFAZ ou da prefeitura.
 */
export function ToIssueWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeRegistrar = can('document.register') && can('document.link');
  return (
    <JanelaLista<OrderInvoicing>
      nome={['pedido', 'pedidos']}
      rotulo="Notas a emitir"
      placeholder="Número do pedido ou cliente"
      carregar={carregar}
      evento={TITULOS_ALTERADOS}
      abrir={(id) => (podeRegistrar ? win.open('document', novoDocumento(id)) : win.open('order', id))}
      rotuloLinha={(o) => (podeRegistrar ? `Registrar nota do pedido ${o.orderCode}` : `Abrir pedido ${o.orderCode}`)}
      situacoes={[
        { valor: 'A_EMITIR', rotulo: 'Com nota a emitir' },
        { valor: 'TODOS', rotulo: 'Todos os pedidos confirmados' },
      ]}
      selo={seloCaixa}
      total={(os) => `A emitir da lista: ${reais(os.reduce((t, o) => t + BigInt(o.toIssueCents), 0n).toString())}`}
      colunas={[
        { titulo: 'Pedido', valor: (o) => o.orderCode },
        { titulo: 'Cliente', valor: (o) => `${o.customerCode} — ${o.customerName}` },
        { titulo: 'Total do pedido', num: true, valor: (o) => reais(o.totalCents) },
        { titulo: 'Recebido', num: true, valor: (o) => reais(o.receivedCents) },
        { titulo: 'Faturado', num: true, valor: (o) => reais(o.invoicedCents) },
        { titulo: 'A emitir', num: true, valor: (o) => reais(o.toIssueCents) },
        { titulo: 'Produto (NF-e)', num: true, valor: (o) => reais(o.productCents) },
        { titulo: 'Serviço (NFS-e)', num: true, valor: (o) => reais(o.serviceCents) },
      ]}
    />
  );
}
