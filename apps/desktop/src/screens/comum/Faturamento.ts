import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { TitleInvoicing } from '../../api/types';
import { useSession } from '../../shell/SessionContext';

/** Avisado pela ficha do documento depois de vincular, desfazer ou cancelar; as parcelas abertas recarregam o faturado. */
export const FATURAMENTO_ALTERADO = 'renda:faturamento-alterado';

/**
 * Faturado, a faturar (IND-003 por parcela) e a emitir (recebido sem nota, regime de caixa) das parcelas, pelos ids. Sem a permissão document.read, fica vazio e as
 * telas simplesmente não mostram as colunas.
 */
export function useFaturamento(titleIds: string[]): Map<string, TitleInvoicing> | null {
  const { can } = useSession();
  const pode = can('document.read');
  const chave = titleIds.join(',');
  const [dados, setDados] = useState<Map<string, TitleInvoicing> | null>(null);
  useEffect(() => {
    if (!pode || !chave) {
      setDados(null);
      return;
    }
    let vivo = true;
    const carregar = () => {
      const q = chave.split(',').map((t) => `titleId=${encodeURIComponent(t)}`).join('&');
      api
        .get<TitleInvoicing[]>(`/api/v1/invoicing?${q}`)
        .then((r) => vivo && setDados(new Map(r.data.map((f) => [f.titleId, f]))))
        .catch(() => vivo && setDados(null));
    };
    carregar();
    window.addEventListener(FATURAMENTO_ALTERADO, carregar);
    return () => {
      vivo = false;
      window.removeEventListener(FATURAMENTO_ALTERADO, carregar);
    };
  }, [pode, chave]);
  return dados;
}

/** Soma em centavos de um campo das parcelas conhecidas. */
export const somaFaturamento = (dados: Map<string, TitleInvoicing>, ids: string[], campo: 'invoicedCents' | 'toInvoiceCents' | 'toIssueCents'): string =>
  ids.reduce((t, id) => t + BigInt(dados.get(id)?.[campo] ?? '0'), 0n).toString();
