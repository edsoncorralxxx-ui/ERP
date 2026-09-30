import { api } from '../api/client';
import type { WindowKind } from './windowManager';

/** Ferramentas de navegação entre registros da barra superior e do menu Dados. */
export type Passo = 'primeiro' | 'anterior' | 'proximo' | 'ultimo';

const ids = async (path: string) => (await api.get<{ id: string }[]>(path)).data.map((r) => r.id);

/** Meses de janeiro a dezembro do ano da competência (`AAAA-MM`). */
const mesesDoAno = (competencia: string) => {
  const ano = competencia.slice(0, 4);
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
};

/**
 * Fichas que andam entre registros e a sequência usada quando a ficha não veio de uma lista (seta de outro registro):
 * a lista completa do tipo, na ordem em que o servidor a devolve (a mesma das janelas de lista), com os inativos e
 * cancelados.
 */
export const SEQUENCIA_PADRAO: Partial<Record<WindowKind, (recordKey: string) => Promise<string[]>>> = {
  customer: () => ids('/api/v1/customers?status=TODOS'),
  supplier: () => ids('/api/v1/suppliers?status=TODOS'),
  item: () => ids('/api/v1/items?status=TODOS'),
  proposal: () => ids('/api/v1/proposals?status=TODOS'),
  order: () => ids('/api/v1/sales-orders?status=TODOS'),
  project: () => ids('/api/v1/projects?status=TODOS'),
  equipment: () => ids('/api/v1/equipment?status=TODOS'),
  receivable: () => ids('/api/v1/receivables?status=TODOS'),
  payable: () => ids('/api/v1/payables?status=TODOS'),
  document: () => ids('/api/v1/documents?status=TODOS'),
  'tax-period': async (competencia) => mesesDoAno(competencia),
};

export const navegavel = (kind: WindowKind) => kind in SEQUENCIA_PADRAO;

/**
 * Registro de destino na sequência, ou nulo quando não há para onde ir (já no primeiro ou no último). De um registro
 * novo (fora da sequência), Anterior vai ao último e Próximo ao primeiro, como no cliente clássico.
 */
export function destino(sequencia: string[], atual: string, passo: Passo): string | null {
  if (sequencia.length === 0) return null;
  const i = sequencia.indexOf(atual);
  const alvo =
    passo === 'primeiro' ? sequencia[0]
      : passo === 'ultimo' ? sequencia[sequencia.length - 1]
        : passo === 'anterior' ? (i === -1 ? sequencia[sequencia.length - 1] : i > 0 ? sequencia[i - 1] : null)
          : i === -1 ? sequencia[0] : i < sequencia.length - 1 ? sequencia[i + 1] : null;
  return alvo && alvo !== atual ? alvo : null;
}
