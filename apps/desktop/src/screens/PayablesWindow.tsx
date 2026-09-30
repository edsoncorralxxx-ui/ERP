import { useMemo } from 'react';
import { api } from '../api/client';
import type { Payable } from '../api/types';
import { dataDaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CONTAS_ALTERADAS } from './BankAccountsWindow';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloTitulo } from './comum/Selos';
import { IMPOSTOS_ALTERADOS } from './TaxPeriodsWindow';

/** Avisado pela ficha e pelo novo título a pagar depois de gravar, pagar, estornar ou cancelar. */
export const PAGAR_ALTERADOS = 'renda:pagar-alterados';

let novos = 0;
export const novoTituloPagar = () => `novo-${++novos}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<Payable[]>(`/api/v1/payables?${q.toString()}`)).data;
};

/** Selo da situação do título a pagar ("Pago" no lugar de "Liquidado") com a condição de vencido ao lado. */
export const seloPagar = (t: Pick<Payable, 'status' | 'overdue'>) => (
  <>
    {t.status === 'SETTLED' ? <span className="rp-badge rp-badge--aprovado">Pago</span> : seloTitulo(t.status)}
    {t.overdue && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Vencido</span>}
  </>
);

/**
 * Janela de lista "Contas a pagar" (formulário "pagar"): títulos manuais e o DAS gerado pela conferência do contador,
 * com o pago e o saldo. Novo abre o título a pagar com as parcelas.
 */
export function PayablesWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('financial_title.create');
  const { open } = win;
  const novo = useMemo(() => (podeCriar ? () => open('payable', novoTituloPagar()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<Payable>
      nome={['título', 'títulos']}
      rotulo="Contas a pagar"
      placeholder="Título, beneficiário, descrição ou documento"
      carregar={carregar}
      evento={PAGAR_ALTERADOS}
      eventos={[CONTAS_ALTERADAS, IMPOSTOS_ALTERADOS]}
      abrir={(id, sequencia) => win.open('payable', id, sequencia)}
      rotuloLinha={(t) => `Abrir título ${t.code}`}
      novo={novo}
      situacoes={[
        { valor: 'ATIVOS', rotulo: 'Todos, sem cancelados' },
        { valor: 'ABERTOS', rotulo: 'Em aberto' },
        { valor: 'VENCIDOS', rotulo: 'Vencidos' },
        { valor: 'A_VENCER', rotulo: 'A vencer' },
        { valor: 'PAGOS', rotulo: 'Pagos' },
        { valor: 'CANCELADOS', rotulo: 'Cancelados' },
        { valor: 'TODOS', rotulo: 'Todos, com cancelados' },
      ]}
      selo={seloPagar}
      colunas={[
        { titulo: 'Título', valor: (t) => t.code },
        { titulo: 'Beneficiário', valor: (t) => `${t.supplierCode} — ${t.supplierName}` },
        { titulo: 'Descrição', valor: (t) => t.origin },
        { titulo: 'Vencimento', valor: (t) => dataDaApi(t.dueDate) },
        { titulo: 'Original', num: true, valor: (t) => reais(t.originalCents) },
        { titulo: 'Pago', num: true, valor: (t) => reais(t.paidCents) },
        { titulo: 'Saldo', num: true, valor: (t) => reais(t.balanceCents) },
      ]}
      total={(ts) => `Saldo da lista: ${reais(ts.reduce((s, t) => s + BigInt(t.balanceCents), 0n).toString())}`}
    />
  );
}
