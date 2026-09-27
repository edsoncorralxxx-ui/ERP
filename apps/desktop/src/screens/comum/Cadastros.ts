import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Customer, CustomerSummary, ItemSummary } from '../../api/types';

/** Clientes ativos para os documentos comerciais, mais o que o documento já usa (mesmo se inativado depois). */
export function useClientes(): CustomerSummary[] {
  const [clientes, setClientes] = useState<CustomerSummary[]>([]);
  useEffect(() => {
    api.get<CustomerSummary[]>('/api/v1/customers?status=TODOS').then((r) => setClientes(r.data)).catch(() => undefined);
  }, []);
  return clientes;
}

/** Unidades do cliente escolhido (ficha do cliente). */
export function useUnidades(customerId: string): { id: string; name: string }[] {
  const [unidades, setUnidades] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!customerId) {
      setUnidades([]);
      return;
    }
    let vivo = true;
    api
      .get<Customer>(`/api/v1/customers/${customerId}`)
      .then((r) => vivo && setUnidades(r.data.units.filter((u) => u.id).map((u) => ({ id: u.id!, name: u.name ?? '' }))))
      .catch(() => vivo && setUnidades([]));
    return () => {
      vivo = false;
    };
  }, [customerId]);
  return unidades;
}

/** Produtos e serviços (ativos e inativos, para mostrar o que as linhas já usam). */
export function useItens(): ItemSummary[] {
  const [itens, setItens] = useState<ItemSummary[]>([]);
  useEffect(() => {
    api.get<ItemSummary[]>('/api/v1/items?status=TODOS').then((r) => setItens(r.data)).catch(() => undefined);
  }, []);
  return itens;
}

export function novaChave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
