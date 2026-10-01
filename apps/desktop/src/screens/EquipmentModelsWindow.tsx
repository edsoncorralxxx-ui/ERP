import { useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { EquipmentModel } from '../api/types';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { DialogoInativar } from './comum/Dialogos';
import { JanelaLista, type Situacao } from './comum/JanelaLista';

export const MODELOS_ALTERADOS = 'renda:modelos-alterados';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ includeInactive: String(situacao !== 'ATIVO') });
  if (busca) q.set('search', busca);
  const todos = (await api.get<EquipmentModel[]>(`/api/v1/equipment-models?${q.toString()}`)).data;
  return situacao === 'INATIVO' ? todos.filter((m) => m.status === 'INATIVO') : todos;
};

/**
 * Modelos de equipamento (Sprint 10): o texto de modelo dos equipamentos já vendidos virou cadastro (decisão do PO em
 * 01/10/2026); a coluna Equipamentos ajuda a conferir os que ficaram juntos. Cadastrar, renomear e inativar com motivo.
 */
export function EquipmentModelsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const [aberto, setAberto] = useState<EquipmentModel | 'novo' | null>(null);
  const lidos = useRef<EquipmentModel[]>([]);
  // Função estável: a lista registra o Novo na barra de ferramentas a cada mudança dela.
  const podeCriar = can('bom.update');
  const novo = useMemo(() => (podeCriar ? () => setAberto('novo') : undefined), [podeCriar]);
  return (
    <>
      <JanelaLista<EquipmentModel>
        nome={['modelo', 'modelos']}
        rotulo="Modelos de equipamento"
        placeholder="Código ou nome do modelo"
        carregar={async (busca, situacao) => (lidos.current = await carregar(busca, situacao))}
        evento={MODELOS_ALTERADOS}
        abrir={(id) => setAberto(lidos.current.find((m) => m.id === id) ?? null)}
        rotuloLinha={(m) => `Abrir modelo ${m.code}`}
        colunas={[
          { titulo: 'Código', valor: (m) => m.code },
          { titulo: 'Modelo', valor: (m) => m.name },
          { titulo: 'Equipamentos', num: true, valor: (m) => m.equipmentCount },
        ]}
        novo={novo}
      />
      {aberto && <DialogoModelo idBase={`${win.windowId}-modelo`} modelo={aberto === 'novo' ? null : aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}

function DialogoModelo({ idBase, modelo, onFechar }: { idBase: string; modelo: EquipmentModel | null; onFechar: () => void }) {
  const win = useWindow();
  const { can } = useSession();
  const [nome, setNome] = useState(modelo?.name ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [inativar, setInativar] = useState(false);
  const chave = useRef(novaChave());
  const editavel = can('bom.update') && (!modelo || modelo.status === 'ATIVO');

  const avisar = (texto: string) => {
    win.notify({ tone: 'sucesso', text: texto });
    window.dispatchEvent(new Event(MODELOS_ALTERADOS));
    onFechar();
  };
  const falhou = (e: unknown) => {
    const x = e as ApiError;
    if (!x.isNetwork) chave.current = novaChave();
    setErro(x.details[0]?.message ?? x.message);
    win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
  };
  const gravar = async () => {
    if (!nome.trim()) return setErro('Informe o nome do modelo.');
    try {
      if (!modelo) {
        const r = await api.post<EquipmentModel>('/api/v1/equipment-models', { name: nome.trim() }, { 'Idempotency-Key': chave.current });
        avisar(`Modelo ${r.data.code} — ${r.data.name} adicionado com sucesso`);
      } else {
        const r = await api.put<EquipmentModel>(`/api/v1/equipment-models/${modelo.id}`, { name: nome.trim() }, `"${modelo.version}"`);
        avisar(`Modelo ${r.data.code} atualizado com sucesso`);
      }
    } catch (e) {
      falhou(e);
    }
  };

  if (inativar && modelo) {
    return (
      <DialogoInativar rotulo="Inativar modelo" idCampo={`${idBase}-motivo`}
        texto={`O modelo ${modelo.code} — ${modelo.name} sai das listas de escolha; os ${modelo.equipmentCount} equipamentos e as BOMs dele continuam.`}
        onCancelar={() => setInativar(false)}
        onConfirmar={(motivo) =>
          void api.post<EquipmentModel>(`/api/v1/equipment-models/${modelo.id}/deactivate`, { reason: motivo }, { 'If-Match': `"${modelo.version}"` })
            .then((r) => avisar(`Modelo ${r.data.code} inativado`))
            .catch((e) => (setInativar(false), falhou(e)))} />
    );
  }
  return (
    <Dialog icon="info" label={modelo ? 'Modelo de equipamento' : 'Novo modelo de equipamento'} onEscape={onFechar}
      buttons={[
        ...(editavel ? [{ label: modelo ? 'Atualizar' : 'Adicionar', primary: true, onClick: () => void gravar() }] : []),
        ...(modelo && editavel ? [{ label: 'Inativar', onClick: () => setInativar(true) }] : []),
        { label: editavel ? 'Cancelar' : 'OK', primary: !editavel, onClick: onFechar },
      ]}>
      {modelo ? `Modelo ${modelo.code}, com ${modelo.equipmentCount} ${modelo.equipmentCount === 1 ? 'equipamento' : 'equipamentos'}.` : 'O nome é único, sem diferenciar maiúsculas.'}
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-nome`}>Nome</label>
        <input id={`${idBase}-nome`} className={`rp-field${editavel ? '' : ' rp-field--readonly'}`} readOnly={!editavel} value={nome} maxLength={200}
          onChange={(e) => (setNome(e.target.value), setErro(null))} onKeyDown={(e) => e.key === 'Enter' && editavel && void gravar()} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}
