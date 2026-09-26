import { useMemo } from 'react';
import { api } from '../api/client';
import type { SupplierSummary } from '../api/types';
import { numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';

/** Avisado pela ficha do fornecedor depois de gravar, para as listas abertas se atualizarem. */
export const FORNECEDORES_ALTERADOS = 'renda:fornecedores-alterados';

let novos = 0;
export const novoFornecedor = () => `novo-${++novos}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<SupplierSummary[]>(`/api/v1/suppliers?${q.toString()}`)).data;
};

/** Janela de lista "Fornecedores": o mesmo parceiro do cliente, no papel de fornecedor. */
export function SuppliersWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('partner.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('supplier', novoFornecedor()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<SupplierSummary>
      nome={['fornecedor', 'fornecedores']}
      rotulo="Fornecedores"
      placeholder="Código, razão social, nome fantasia ou CNPJ"
      carregar={carregar}
      evento={FORNECEDORES_ALTERADOS}
      abrir={(id) => win.open('supplier', id)}
      rotuloLinha={(f) => `Abrir ${f.legalName}`}
      novo={novo}
      colunas={[
        { titulo: 'Código', valor: (f) => f.code },
        { titulo: 'Razão social', valor: (f) => f.legalName },
        { titulo: 'Nome fantasia', valor: (f) => f.tradeName ?? '' },
        { titulo: 'CNPJ', valor: (f) => f.cnpjFormatted ?? '' },
        { titulo: 'Categorias fornecidas', valor: (f) => f.suppliedCategories ?? '' },
        { titulo: 'Prazo (dias)', num: true, valor: (f) => (f.leadTimeDays === null ? '' : numero(f.leadTimeDays)) },
      ]}
      filtros={[{ chave: 'categoria', rotulo: 'Categoria', testa: (f, v) => (f.suppliedCategories ?? '').toLowerCase().includes(v.toLowerCase()) }]}
    />
  );
}
