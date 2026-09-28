import { api } from '../api/client';
import type { Receivable } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloTitulo } from './comum/Selos';

/** Avisado pela ficha do título depois de um recebimento ou estorno. */
export const TITULOS_ALTERADOS = 'renda:titulos-alterados';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<Receivable[]>(`/api/v1/receivables?${q.toString()}`)).data;
};

/** Selo da situação com a condição de vencido ao lado (vencido é data e saldo, não situação). */
export const seloReceber = (t: Pick<Receivable, 'status' | 'overdue'>) => (
  <>
    {seloTitulo(t.status)}
    {t.overdue && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Vencido</span>}
  </>
);

/** Janela de lista "Contas a receber" (formulário "receber"): as parcelas dos pedidos confirmados, com recebido e saldo. */
export function ReceivablesWindow() {
  const win = useWindow();
  return (
    <JanelaLista<Receivable>
      nome={['título', 'títulos']}
      rotulo="Contas a receber"
      placeholder="Título, cliente ou pedido"
      carregar={carregar}
      evento={TITULOS_ALTERADOS}
      abrir={(id, sequencia) => win.open('receivable', id, sequencia)}
      rotuloLinha={(t) => `Abrir título ${t.code}`}
      situacoes={[
        { valor: 'ATIVOS', rotulo: 'Todos, sem cancelados' },
        { valor: 'ABERTOS', rotulo: 'Em aberto' },
        { valor: 'VENCIDOS', rotulo: 'Vencidos' },
        { valor: 'LIQUIDADOS', rotulo: 'Liquidados' },
        { valor: 'CANCELADOS', rotulo: 'Cancelados' },
        { valor: 'TODOS', rotulo: 'Todos, com cancelados' },
      ]}
      selo={seloReceber}
      colunas={[
        { titulo: 'Título', valor: (t) => t.code },
        { titulo: 'Cliente', valor: (t) => `${t.customerCode} — ${t.customerName}` },
        { titulo: 'Descrição', valor: (t) => t.origin },
        { titulo: 'Vencimento', valor: (t) => dataDaApi(t.dueDate) },
        { titulo: 'Valor', num: true, valor: (t) => reais(t.originalCents) },
        { titulo: 'Recebido', num: true, valor: (t) => reais(t.receivedCents) },
        { titulo: 'Saldo', num: true, valor: (t) => reais(t.balanceCents) },
      ]}
      total={(ts) => `Saldo da lista: ${reais(ts.reduce((s, t) => s + BigInt(t.balanceCents), 0n).toString())}`}
    />
  );
}
