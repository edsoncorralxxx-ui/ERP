import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { Bom, BomSummary, EquipmentModel } from '../api/types';
import { centavos, dataHora } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { BOM_ALTERADA } from './comum/Bom';
import { novaChave } from './comum/Cadastros';
import { JanelaLista } from './comum/JanelaLista';
import { Selecao } from './comum/Selecao';

const carregar = async (busca: string) => {
  const q = new URLSearchParams();
  if (busca) q.set('search', busca);
  return (await api.get<BomSummary[]>(`/api/v1/boms?${q.toString()}`)).data;
};

/**
 * Janela de lista "BOM — composição de custos" (Sprint 10): as BOMs dos modelos e as submontagens, com o total, as
 * pendências e a última alteração. Abre a BOM (árvore, linhas e diagrama); Novo cadastra uma BOM e Importar BOM abre a
 * carga do arquivo.
 */
export function BomsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const [nova, setNova] = useState(false);
  // Função estável: a lista registra o Novo na barra de ferramentas a cada mudança dela.
  const podeCriar = can('bom.update');
  const novo = useMemo(() => (podeCriar ? () => setNova(true) : undefined), [podeCriar]);
  return (
    <>
      <JanelaLista<BomSummary & { status: string }>
        nome={['BOM', 'BOMs']}
        rotulo="BOMs"
        placeholder="Código, nome da BOM ou do modelo"
        carregar={async (busca) => (await carregar(busca)).map((b) => ({ ...b, status: b.pending ? 'PENDENTE' : 'COMPLETA' }))}
        evento={BOM_ALTERADA}
        abrir={(id) => win.open('bom', id)}
        rotuloLinha={(b) => `Abrir BOM ${b.code}`}
        situacoes={[{ valor: 'TODOS', rotulo: 'Todas' }]}
        selo={(b) =>
          b.pending ? <span className="rp-badge rp-badge--pendente">{b.pending} {b.pending === 1 ? 'pendência' : 'pendências'}</span> : <span className="rp-badge rp-badge--aprovado">Completa</span>}
        colunas={[
          { titulo: 'BOM', valor: (b) => b.code },
          { titulo: 'Nome', valor: (b) => b.name },
          { titulo: 'Modelo', valor: (b) => (b.modelName ? `${b.modelCode} — ${b.modelName}` : 'Submontagem') },
          { titulo: 'Linhas', num: true, valor: (b) => String(b.lineCount) },
          { titulo: 'Total', num: true, valor: (b) => centavos(b.totalCents) },
          { titulo: 'Atualizada em', valor: (b) => (b.updatedAt ? `${dataHora(b.updatedAt)} por ${b.updatedBy}` : '') },
        ]}
        novo={novo}
        acoes={
          can('bom.update') ? (
            <button type="button" className="rp-btn" onClick={() => win.open('bom-import')}>
              <span><u>I</u>mportar BOM</span>
            </button>
          ) : undefined
        }
      />
      {nova && <DialogoNovaBom idBase={`${win.windowId}-nova`} onFechar={() => setNova(false)} />}
    </>
  );
}

/** Nova BOM: de um modelo (uma por modelo) ou submontagem; nasce sem linhas e abre para editar. */
function DialogoNovaBom({ idBase, onFechar }: { idBase: string; onFechar: () => void }) {
  const win = useWindow();
  const [nome, setNome] = useState('');
  const [modelo, setModelo] = useState('');
  const [modelos, setModelos] = useState<EquipmentModel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = useRef(novaChave());
  useEffect(() => {
    api.get<EquipmentModel[]>('/api/v1/equipment-models').then((r) => setModelos(r.data)).catch(() => setModelos([]));
  }, []);
  const confirmar = async () => {
    if (!nome.trim()) return setErro('Informe o nome da BOM.');
    try {
      const r = await api.post<Bom>('/api/v1/boms', { name: nome.trim(), modelId: modelo || null }, { 'Idempotency-Key': chave.current });
      win.notify({ tone: 'sucesso', text: `BOM ${r.data.code} — ${r.data.name} adicionada com sucesso` });
      window.dispatchEvent(new Event(BOM_ALTERADA));
      onFechar();
      win.open('bom', r.data.id);
    } catch (e) {
      const x = e as ApiError;
      if (!x.isNetwork) chave.current = novaChave();
      setErro(x.details[0]?.message ?? x.message);
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };
  return (
    <Dialog icon="info" label="Nova BOM" onEscape={onFechar}
      buttons={[
        { label: 'Adicionar', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onFechar },
      ]}>
      Escolha o modelo para a BOM do equipamento, ou deixe sem modelo para uma submontagem (Mecânica, Painel elétrico).
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-nome`}>Nome</label>
        <input id={`${idBase}-nome`} className="rp-field" value={nome} maxLength={200} onChange={(e) => (setNome(e.target.value), setErro(null))} />
        <label className="rp-label" htmlFor={`${idBase}-modelo`}>Modelo</label>
        <Selecao id={`${idBase}-modelo`} valor={modelo} onChange={setModelo}
          opcoes={[{ valor: '', rotulo: 'Sem modelo (submontagem)' }, ...(modelos ?? []).map((m) => ({ valor: m.id, rotulo: `${m.code} — ${m.name}` }))]} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}
