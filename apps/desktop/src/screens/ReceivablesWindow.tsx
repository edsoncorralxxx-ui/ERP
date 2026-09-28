import { api } from '../api/client';
import type { Receivable } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloTitulo } from './comum/Selos';

/** Avisado depois de registrar ou estornar um recebimento: listas de títulos, pedidos e projetos recarregam. */
export const RECEBER_ALTERADOS = 'renda:receber-alterados';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ includeCancelled: String(situacao === 'TODOS') });
  if (busca) q.set('search', busca);
  const titulos = (await api.get<Receivable[]>(`/api/v1/receivables?${q.toString()}`)).data;
  return situacao === 'ABERTOS' ? titulos.filter((t) => t.status === 'OPEN' || t.status === 'PARTIAL') : titulos;
};

/** Contas a receber (formulário "receber"): títulos por vencimento, com o recebido, o saldo e os vencidos marcados. */
export function ReceivablesWindow() {
  const win = useWindow();
  return (
    <JanelaLista<Receivable>
      nome={['título', 'títulos']}
      rotulo="Contas a receber"
      placeholder="Título, cliente ou pedido"
      carregar={carregar}
      evento={RECEBER_ALTERADOS}
      abrir={(id) => win.open('receivable', id)}
      rotuloLinha={(t) => `Abrir título ${t.code}`}
      situacoes={[
        { valor: 'ABERTOS', rotulo: 'Em aberto e parciais' },
        { valor: 'ATIVOS', rotulo: 'Todos, sem cancelados' },
        { valor: 'TODOS', rotulo: 'Todos, com cancelados' },
      ]}
      selo={(t) => seloTitulo(t.status)}
      total={(linhas) => `Saldo a receber: ${reais(linhas.reduce((s, t) => s + BigInt(t.balanceCents), 0n).toString())}`}
      filtros={[
        {
          chave: 'vencimento',
          rotulo: 'Vencimento',
          opcoes: [
            { valor: 'VENCIDOS', rotulo: 'Só vencidos' },
            { valor: 'A_VENCER', rotulo: 'Só a vencer' },
          ],
          testa: (t, v) => (v === 'VENCIDOS' ? t.overdue : !t.overdue && t.balanceCents !== '0'),
        },
        { chave: 'cliente', rotulo: 'Cliente', testa: (t, v) => `${t.customerCode} ${t.customerName}`.toLowerCase().includes(v.toLowerCase()) },
      ]}
      colunas={[
        { titulo: 'Título', valor: (t) => t.code },
        { titulo: 'Cliente', valor: (t) => `${t.customerCode} — ${t.customerName}` },
        { titulo: 'Descrição', valor: (t) => t.origin },
        {
          titulo: 'Vencimento',
          valor: (t) => (
            <>
              {dataDaApi(t.dueDate)}
              {t.overdue && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Vencido</span>}
            </>
          ),
        },
        { titulo: 'Valor', num: true, valor: (t) => reais(t.originalCents) },
        { titulo: 'Recebido', num: true, valor: (t) => reais(t.receivedCents) },
        { titulo: 'Saldo', num: true, valor: (t) => reais(t.balanceCents) },
      ]}
    />
  );
}
