import { useMemo } from 'react';
import { api } from '../api/client';
import type { CustomerSummary } from '../api/types';
import { numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';

/** Avisado pela ficha do cliente depois de gravar, para as listas abertas se atualizarem. */
export const CLIENTES_ALTERADOS = 'renda:clientes-alterados';

let novos = 0;
/** Chave de uma janela de cliente novo: cada "Novo" abre uma ficha própria. */
export const novoCliente = () => `novo-${++novos}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<CustomerSummary[]>(`/api/v1/customers?${q.toString()}`)).data;
};

/** Janela de lista "Clientes e unidades": busca, grade com a seta que abre a ficha, Novo e o funil de filtro. */
export function CustomersWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('partner.create');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('customer', novoCliente()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<CustomerSummary>
      nome={['cliente', 'clientes']}
      rotulo="Clientes"
      placeholder="Código, razão social, nome fantasia ou CNPJ"
      carregar={carregar}
      evento={CLIENTES_ALTERADOS}
      abrir={(id) => win.open('customer', id)}
      rotuloLinha={(c) => `Abrir ${c.legalName}`}
      novo={novo}
      colunas={[
        { titulo: 'Código', valor: (c) => c.code },
        { titulo: 'Razão social', valor: (c) => c.legalName },
        { titulo: 'Nome fantasia', valor: (c) => c.tradeName ?? '' },
        { titulo: 'CNPJ', valor: (c) => c.cnpjFormatted ?? '' },
        { titulo: 'Cidade / UF', valor: (c) => (c.city ? `${c.city}${c.state ? ` / ${c.state}` : ''}` : '') },
        { titulo: 'Unidades', num: true, valor: (c) => numero(c.units) },
      ]}
      filtros={[{ chave: 'local', rotulo: 'Cidade / UF', testa: (c, v) => `${c.city ?? ''}/${c.state ?? ''}`.toLowerCase().includes(v.toLowerCase()) }]}
    />
  );
}
