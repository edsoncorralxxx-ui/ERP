import { api } from '../api/client';
import type { Equipment } from '../api/types';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloEquipamento } from './comum/Selos';

/** Avisado pela ficha do equipamento depois de gravar. */
export const EQUIPAMENTOS_ALTERADOS = 'renda:equipamentos-alterados';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ includeCancelled: String(situacao === 'TODOS') });
  if (busca) q.set('search', busca);
  return (await api.get<Equipment[]>(`/api/v1/equipment?${q.toString()}`)).data;
};

/** Janela de lista "Equipamentos": cada equipamento com identidade própria, nascido da confirmação do pedido. */
export function EquipmentsWindow() {
  const win = useWindow();
  return (
    <JanelaLista<Equipment>
      nome={['equipamento', 'equipamentos']}
      rotulo="Equipamentos"
      placeholder="Código, modelo, série, projeto ou cliente"
      carregar={carregar}
      evento={EQUIPAMENTOS_ALTERADOS}
      abrir={(id, sequencia) => win.open('equipment', id, sequencia)}
      rotuloLinha={(e) => `Abrir equipamento ${e.code}`}
      situacoes={[
        { valor: 'ATIVO', rotulo: 'Ativos' },
        { valor: 'TODOS', rotulo: 'Todos, com cancelados' },
      ]}
      selo={(e) => seloEquipamento(e.status)}
      colunas={[
        { titulo: 'Equipamento', valor: (e) => e.code },
        { titulo: 'Modelo', valor: (e) => e.model },
        { titulo: 'Nº de série', valor: (e) => e.serialNumber ?? '' },
        { titulo: 'Cliente', valor: (e) => `${e.customerCode} — ${e.customerName}` },
        { titulo: 'Unidade', valor: (e) => e.unitName },
        { titulo: 'Projeto', valor: (e) => e.projectCode },
        { titulo: 'Pedido', valor: (e) => e.orderCode },
      ]}
    />
  );
}
