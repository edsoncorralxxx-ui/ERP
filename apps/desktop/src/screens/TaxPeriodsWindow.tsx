import { api } from '../api/client';
import type { TaxPeriodStatus, TaxPeriodSummary } from '../api/types';
import { competenciaDaApi, dataDaApi, hojeIso, numero, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type OpcaoSituacao } from './comum/JanelaLista';
import { DOCUMENTOS_ALTERADOS } from './DocumentsWindow';

/** Avisado pela ficha da competência depois de simular, conferir, fechar ou reabrir, para a lista se atualizar. */
export const IMPOSTOS_ALTERADOS = 'renda:impostos-alterados';

type Linha = TaxPeriodSummary & { id: string };

/** Anos do filtro: o corrente primeiro (padrão), o seguinte e os três anteriores. */
const anos = (): OpcaoSituacao[] => {
  const atual = Number(hojeIso().slice(0, 4));
  return [atual, atual + 1, atual - 1, atual - 2, atual - 3].map((a) => ({ valor: String(a), rotulo: `Ano ${a}` }));
};

const carregar = async (busca: string, ano: string) => {
  const linhas = (await api.get<TaxPeriodSummary[]>(`/api/v1/tax-periods?year=${ano}`)).data.map((s) => ({ ...s, id: s.competence }));
  const termo = busca.trim();
  return termo ? linhas.filter((l) => competenciaDaApi(l.competence).includes(termo)) : linhas;
};

export const seloCompetencia = (status: TaxPeriodStatus) =>
  status === 'FECHADA' ? <span className="rp-badge rp-badge--aprovado">Fechada</span> : <span className="rp-badge rp-badge--pendente">Aberta</span>;

/** Simulação na grade: o valor, "Não calculável" ou vazio (ainda não simulada). */
export const simulacaoDaLinha = (s: Pick<TaxPeriodSummary, 'simulationResult' | 'simulationCents'>) =>
  s.simulationResult === 'NAO_CALCULAVEL' ? 'Não calculável' : s.simulationCents ? reais(s.simulationCents) : '';

const somar = (ls: Linha[], f: (l: Linha) => string | null) => ls.reduce((t, l) => t + BigInt(f(l) ?? '0'), 0n).toString();

/**
 * Janela de lista "Impostos gerenciais" (formulário "impostos", Sprint 7): as competências do ano com a receita das notas
 * (produto e serviço), a simulação gerencial, o valor do contador, a diferença e a situação — separados, como pede o
 * ADR-011. A seta abre a ficha da competência.
 */
export function TaxPeriodsWindow() {
  const win = useWindow();
  return (
    <JanelaLista<Linha>
      nome={['competência', 'competências']}
      rotulo="Impostos gerenciais"
      placeholder="Competência (MM/AAAA)"
      carregar={carregar}
      evento={IMPOSTOS_ALTERADOS}
      eventos={[DOCUMENTOS_ALTERADOS]}
      abrir={(id, sequencia) => win.open('tax-period', id, sequencia)}
      rotuloLinha={(l) => `Abrir competência ${competenciaDaApi(l.competence)}`}
      situacoes={anos()}
      selo={(l) => seloCompetencia(l.status)}
      total={(ls) =>
        `Receita da lista: ${reais(somar(ls, (l) => l.revenueCents))} · Simulado: ${reais(somar(ls, (l) => l.simulationCents))} · Contador: ${reais(
          somar(ls, (l) => l.confirmedCents),
        )}`
      }
      colunas={[
        { titulo: 'Competência', valor: (l) => competenciaDaApi(l.competence) },
        { titulo: 'Produto', num: true, valor: (l) => reais(l.productRevenueCents) },
        { titulo: 'Serviço', num: true, valor: (l) => reais(l.serviceRevenueCents) },
        { titulo: 'Receita documentada', num: true, valor: (l) => reais(l.revenueCents) },
        { titulo: 'Notas', num: true, valor: (l) => numero(l.documentCount) },
        { titulo: 'Simulação', num: true, valor: simulacaoDaLinha },
        { titulo: 'Contador', num: true, valor: (l) => (l.confirmedCents ? reais(l.confirmedCents) : '') },
        { titulo: 'Diferença', num: true, valor: (l) => (l.differenceCents ? reais(l.differenceCents) : '') },
        { titulo: 'Vencimento', valor: (l) => dataDaApi(l.dueDate) },
      ]}
      filtros={[
        {
          chave: 'movimento',
          rotulo: 'Movimento',
          opcoes: [
            { valor: 'COM', rotulo: 'Com notas ou conferência' },
            { valor: 'SEM', rotulo: 'Sem movimento' },
          ],
          testa: (l, v) => (v === 'COM') === (l.documentCount > 0 || !!l.confirmedCents || !!l.simulationResult),
        },
      ]}
    />
  );
}
