import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { FinancialCategory } from '../../api/types';

/** Avisado pela janela de categorias depois de cadastrar, renomear ou inativar. */
export const CATEGORIAS_ALTERADAS = 'renda:categorias-alteradas';

/** Categorias financeiras (com as inativas, para mostrar o nome do que os títulos já usam), recarregadas quando mudam. */
export function useCategorias(): FinancialCategory[] {
  const [categorias, setCategorias] = useState<FinancialCategory[]>([]);
  useEffect(() => {
    const carregar = () =>
      void api.get<FinancialCategory[]>('/api/v1/financial-categories?includeInactive=true').then((r) => setCategorias(r.data)).catch(() => undefined);
    carregar();
    window.addEventListener(CATEGORIAS_ALTERADAS, carregar);
    return () => window.removeEventListener(CATEGORIAS_ALTERADAS, carregar);
  }, []);
  return categorias;
}

/** Nome da categoria pelo código gravado no título; o código quando a categoria não está na lista. */
export const nomeCategoria = (categorias: FinancialCategory[], code: string) => categorias.find((c) => c.code === code)?.name ?? code;
