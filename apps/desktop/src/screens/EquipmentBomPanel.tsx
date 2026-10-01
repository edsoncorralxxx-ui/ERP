import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { Bom, EquipmentBom, EquipmentBomLine, HistoryEntry, ItemSummary } from '../api/types';
import { centavos, dataHora, decimalParaApi, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { BOM_ALTERADA } from './BomRevisionWindow';
import { custo, quantidade, seloEstadoLinha, seloRevisaoBom } from './comum/Bom';
import { novaChave } from './comum/Cadastros';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';

type Acao = 'aplicar' | 'trocar' | 'ADD' | 'UPDATE' | 'REMOVE' | 'RESTORE' | null;

/**
 * Aba BOM da ficha do equipamento (Sprint 10): a cópia congelada da revisão aplicada, em árvore, com o que mudou só neste
 * equipamento (incluída, retirada, alterada) e o total comparado com o do modelo. Aplicar, trocar a revisão e ajustar
 * exigem project_bom.apply; trocar e ajustar pedem motivo.
 */
export function EquipmentBomPanel({ equipmentId, ativo }: { equipmentId: string; ativo: boolean }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [eb, setEb] = useState<EquipmentBom | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEb((await api.get<EquipmentBom>(`/api/v1/equipment/${equipmentId}/bom`)).data);
      setErro(null);
      setHistorico(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor.' : `${x.message} (${x.code})`);
    }
  }, [equipmentId]);

  useEffect(() => void carregar(), [carregar]);

  useEffect(() => {
    if (!verHistorico || historico !== null) return;
    api.get<HistoryEntry[]>(`/api/v1/equipment/${equipmentId}/bom/history`).then((r) => setHistorico(r.data)).catch(() => setHistorico([]));
  }, [verHistorico, historico, equipmentId]);

  const podeAjustar = ativo && can('project_bom.apply');
  const linha = eb?.lines.find((l) => l.id === sel) ?? null;

  const concluir = (r: EquipmentBom, texto: string) => {
    setEb(r);
    setHistorico(null);
    setAcao(null);
    win.notify({ tone: 'sucesso', text: texto });
    window.dispatchEvent(new Event(BOM_ALTERADA));
  };

  if (erro) {
    return (
      <p className="rp-janela-mdi__aviso">
        <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
      </p>
    );
  }
  if (!eb) return <p className="rp-janela-mdi__aviso">Carregando</p>;

  const fid = (k: string) => `${win.windowId}-bom-${k}`;
  const diferenca = eb.applied && eb.totalCents && eb.modelTotalCents ? (BigInt(eb.totalCents) - BigInt(eb.modelTotalCents)).toString() : null;

  return (
    <div className="rp-ficha__geral">
      {!eb.applied ? (
        <>
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Sem BOM aplicada: o equipamento ainda não tem custo planejado.
          </p>
          {podeAjustar && (
            <div className="rp-btn-row">
              <button type="button" className="rp-btn" onClick={() => setAcao('aplicar')}><span><u>A</u>plicar BOM</span></button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rp-form rp-janela-mdi__form">
            <span className="rp-label">BOM</span>
            <span />
            <span className="rp-ficha__ref">
              <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir revisão ${eb.revisionLabel} da BOM`} title="Abrir a revisão aplicada"
                onClick={() => win.open('bom-revision', eb.revisionId!)} onKeyDown={(e) => e.key === 'Enter' && win.open('bom-revision', eb.revisionId!)} />
              <input className="rp-field rp-field--readonly" readOnly aria-label="BOM aplicada" value={`${eb.bomCode} — ${eb.bomName} — rev. ${eb.revisionLabel}`} />
              {seloRevisaoBom(eb.revisionStatus!)}
            </span>
            <span className="rp-label">Total do equipamento</span>
            <span />
            <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Total do equipamento" value={reais(eb.totalCents)} />
            <span className="rp-label">Total do modelo</span>
            <span />
            <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Total do modelo" value={reais(eb.modelTotalCents)} />
            <span className="rp-label">Diferença</span>
            <span />
            <input className="rp-field rp-field--readonly" readOnly aria-label="Diferença para o modelo"
              value={`${reais(diferenca)} — ${eb.added} ${eb.added === 1 ? 'incluída' : 'incluídas'}, ${eb.removed} ${eb.removed === 1 ? 'retirada' : 'retiradas'}, ${eb.changed} ${eb.changed === 1 ? 'alterada' : 'alteradas'}`} />
            <span className="rp-label">Aplicada em</span>
            <span />
            <input className="rp-field rp-field--readonly" readOnly aria-label="Aplicada em" value={`${dataHora(eb.appliedAt)} por ${eb.appliedBy}`} />
          </div>
          <div className="rp-tabela">
            <div className="rp-tabela-acoes">
              <span className="rp-tabela-tit">Linhas do equipamento</span>
              {podeAjustar && (
                <>
                  <button type="button" className="rp-btn" onClick={() => setAcao('ADD')}><span>In<u>c</u>luir item</span></button>
                  <button type="button" className="rp-btn" disabled={!linha || linha.status === 'REMOVED'} onClick={() => setAcao('UPDATE')}><span>A<u>l</u>terar linha</span></button>
                  {linha?.status === 'REMOVED' ? (
                    <button type="button" className="rp-btn" onClick={() => setAcao('RESTORE')}><span><u>D</u>evolver linha</span></button>
                  ) : (
                    <button type="button" className="rp-btn" disabled={!linha} onClick={() => setAcao('REMOVE')}><span><u>R</u>etirar linha</span></button>
                  )}
                  <button type="button" className="rp-btn" onClick={() => setAcao('trocar')}><span><u>T</u>rocar revisão</span></button>
                </>
              )}
              <button type="button" className="rp-btn" onClick={() => setVerHistorico((v) => !v)}>{verHistorico ? 'Ver linhas' : 'Histórico da BOM'}</button>
            </div>
            {verHistorico ? (
              <GradeHistorico historico={historico} rotulo="Histórico da BOM do equipamento" />
            ) : (
              <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
                <table className="rp-grid rp-janela-mdi__grade" aria-label="BOM do equipamento">
                  <thead>
                    <tr>
                      <th className="rownum">#</th>
                      <th>Cód. ref.</th>
                      <th>Descrição</th>
                      <th className="num">Qtd.</th>
                      <th>Un.</th>
                      <th className="num">Custo unit.</th>
                      <th className="num">Total</th>
                      <th>Ajuste</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eb.lines.map((l, i) => (
                      <tr key={l.id} aria-selected={sel === l.id} onClick={() => setSel(l.id)} className={l.status === 'REMOVED' ? 'rp-bom__retirada' : undefined}>
                        <td className="rownum">{i + 1}</td>
                        <td>{l.referenceCode ?? ''}</td>
                        <td className={`rp-bom__nivel-${Math.min(l.depth, 4)}`}>{l.kind === 'SUBASSEMBLY' ? <b>{l.description}</b> : l.description}</td>
                        <td className="num">
                          {quantidade(l.quantity)}
                          {l.state === 'CHANGED' && l.modelQuantity !== l.quantity && <span className="rp-ficha__antes"> (era {quantidade(l.modelQuantity)})</span>}
                        </td>
                        <td>{l.uom}</td>
                        <td className="num">
                          {l.kind === 'ITEM' ? custo(l.unitCost) : ''}
                          {l.state === 'CHANGED' && l.kind === 'ITEM' && l.modelUnitCost !== l.unitCost && <span className="rp-ficha__antes"> (era {custo(l.modelUnitCost)})</span>}
                        </td>
                        <td className="num">{centavos(l.lineCents)}</td>
                        <td>{seloEstadoLinha(l.state)}</td>
                        <td>{l.adjustmentReason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6}>Total do equipamento</td>
                      <td className="num">{centavos(eb.totalCents)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {(acao === 'aplicar' || acao === 'trocar') && (
        <DialogoAplicar idBase={fid('aplicar')} eb={eb} trocar={acao === 'trocar'} onCancelar={() => setAcao(null)}
          onAplicado={(r, texto) => concluir(r, texto)} />
      )}
      {acao && acao !== 'aplicar' && acao !== 'trocar' && (
        <DialogoAjuste idBase={fid('ajuste')} eb={eb} acao={acao} linha={linha} onCancelar={() => setAcao(null)}
          onAjustado={(r, texto) => concluir(r, texto)}
          onConflito={() => {
            setAcao(null);
            void carregar();
          }} />
      )}
    </div>
  );
}

/** Aplicar a primeira BOM ou trocar a revisão (com motivo; os ajustes do equipamento são descartados). */
function DialogoAplicar({ idBase, eb, trocar, onAplicado, onCancelar }: {
  idBase: string;
  eb: EquipmentBom;
  trocar: boolean;
  onAplicado: (r: EquipmentBom, texto: string) => void;
  onCancelar: () => void;
}) {
  const win = useWindow();
  const [opcoes, setOpcoes] = useState<{ valor: string; rotulo: string; modelo: string | null }[]>([]);
  const [revisao, setRevisao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const chave = useRef(novaChave());

  useEffect(() => {
    api.get<Bom[]>('/api/v1/boms').then((r) => {
      const daqui = r.data.filter((b) => b.modelId && b.approved).map((b) => ({
        valor: b.approved!.id, rotulo: `${b.code} — ${b.name} — rev. ${b.approved!.label} — ${reais(b.approved!.totalCents)}`, modelo: b.modelId,
      }));
      setOpcoes(daqui);
      const livre = (o: { valor: string }) => !trocar || o.valor !== eb.revisionId;
      setRevisao(daqui.find((o) => o.modelo === eb.equipment.modelId && livre(o))?.valor ?? daqui.find(livre)?.valor ?? '');
    }).catch(() => setOpcoes([]));
  }, [eb.equipment.modelId, eb.revisionId, trocar]);

  const escolhida = opcoes.find((o) => o.valor === revisao);
  const confirmar = async () => {
    if (!revisao) return setErro('Escolha a revisão aprovada.');
    if (trocar && !motivo.trim()) return setErro('Informe o motivo da troca de revisão.');
    try {
      const r = await api.post<EquipmentBom>(`/api/v1/equipment/${eb.equipment.id}/bom`, { revisionId: revisao, reason: motivo.trim() || null },
        { 'Idempotency-Key': chave.current });
      onAplicado(r.data, `BOM ${r.data.bomName} rev. ${r.data.revisionLabel} aplicada ao equipamento ${r.data.equipment.code}`);
    } catch (e) {
      const x = e as ApiError;
      if (!x.isNetwork) chave.current = novaChave();
      setErro(x.details[0]?.message ?? x.message);
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };
  return (
    <Dialog icon={trocar ? 'aviso' : 'info'} label={trocar ? 'Trocar revisão da BOM' : 'Aplicar BOM'} onEscape={onCancelar}
      buttons={[
        { label: trocar ? 'Trocar' : 'Aplicar', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      {trocar
        ? 'O equipamento passa a usar a outra revisão; os ajustes feitos só nele são descartados e ficam no histórico.'
        : 'A revisão aprovada é copiada para o equipamento e não muda quando o modelo ganhar uma revisão nova.'}
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-rev`}>Revisão</label>
        <Selecao id={`${idBase}-rev`} valor={revisao} onChange={(v) => (setRevisao(v), setErro(null))}
          opcoes={opcoes.length ? opcoes.map(({ valor, rotulo }) => ({ valor, rotulo })) : [{ valor: '', rotulo: 'Nenhuma BOM de modelo aprovada' }]} />
        {trocar && (
          <>
            <label className="rp-label" htmlFor={`${idBase}-motivo`}>Motivo</label>
            <input id={`${idBase}-motivo`} className="rp-field" value={motivo} maxLength={500} onChange={(e) => (setMotivo(e.target.value), setErro(null))} />
          </>
        )}
      </div>
      {escolhida && escolhida.modelo !== eb.equipment.modelId && (
        <span className="rp-janela-mdi__aviso" role="status">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> A BOM escolhida é de outro modelo; o equipamento é do modelo {eb.equipment.modelName}.
        </span>
      )}
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}

const TITULO: Record<'ADD' | 'UPDATE' | 'REMOVE' | 'RESTORE', string> = { ADD: 'Incluir item', UPDATE: 'Alterar linha', REMOVE: 'Retirar linha', RESTORE: 'Devolver linha' };

/** Ajuste só deste equipamento, sempre com motivo; o modelo não muda. */
function DialogoAjuste({ idBase, eb, acao, linha, onAjustado, onConflito, onCancelar }: {
  idBase: string;
  eb: EquipmentBom;
  acao: 'ADD' | 'UPDATE' | 'REMOVE' | 'RESTORE';
  linha: EquipmentBomLine | null;
  onAjustado: (r: EquipmentBom, texto: string) => void;
  onConflito: () => void;
  onCancelar: () => void;
}) {
  const win = useWindow();
  const [motivo, setMotivo] = useState('');
  const [qtd, setQtd] = useState(acao === 'UPDATE' && linha ? quantidade(linha.quantity) : '1');
  const [preco, setPreco] = useState(acao === 'UPDATE' && linha ? custo(linha.unitCost) : '');
  const [pai, setPai] = useState(linha?.kind === 'SUBASSEMBLY' ? linha.id : linha?.parentId ?? '');
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ItemSummary[]>([]);
  const [itemId, setItemId] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    if (!busca.trim()) return;
    const r = (await api.get<ItemSummary[]>(`/api/v1/items?search=${encodeURIComponent(busca.trim())}`)).data.filter((i) => i.status === 'ATIVO');
    setItens(r);
    if (r.length === 1) setItemId(r[0].id);
    if (r.length === 0) setErro('Nenhum registro correspondente encontrado.');
  };

  const confirmar = async () => {
    if (!motivo.trim()) return setErro('Informe o motivo do ajuste.');
    if (acao === 'ADD' && !itemId) return setErro('Escolha o produto ou serviço.');
    const body = {
      action: acao,
      lineId: acao === 'ADD' ? null : linha?.id,
      parentLineId: acao === 'ADD' ? pai || null : null,
      itemId: acao === 'ADD' ? itemId : null,
      quantity: acao === 'ADD' || acao === 'UPDATE' ? decimalParaApi(qtd) : null,
      unitCost: (acao === 'ADD' || (acao === 'UPDATE' && linha?.kind === 'ITEM')) ? decimalParaApi(preco.replace(/R\$\s?/, '')) : null,
      reason: motivo.trim(),
    };
    try {
      const r = await api.post<EquipmentBom>(`/api/v1/equipment/${eb.equipment.id}/bom/adjustments`, body, { 'If-Match': `"${eb.version}"` });
      onAjustado(r.data, `BOM do equipamento ${eb.equipment.code} ajustada: total ${reais(r.data.totalCents)}`);
    } catch (e) {
      const x = e as ApiError;
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      if (x.isConflict) return onConflito();
      setErro(x.details[0]?.message ?? x.message);
    }
  };

  const submontagens = eb.lines.filter((l) => l.kind === 'SUBASSEMBLY' && l.status === 'ACTIVE');
  return (
    <Dialog icon="info" label={TITULO[acao]} onEscape={onCancelar}
      buttons={[
        { label: acao === 'ADD' ? 'Incluir' : acao === 'UPDATE' ? 'Atualizar' : acao === 'REMOVE' ? 'Retirar' : 'Devolver', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      {acao === 'ADD' ? 'O item entra só na BOM deste equipamento.' : `Linha: ${linha?.description ?? ''}.`} O modelo não muda.
      <div className="rp-form rp-msgbox__form">
        {acao === 'ADD' && (
          <>
            <label className="rp-label" htmlFor={`${idBase}-pai`}>Incluir em</label>
            <Selecao id={`${idBase}-pai`} valor={pai} onChange={setPai}
              opcoes={[{ valor: '', rotulo: 'Primeiro nível' }, ...submontagens.map((s) => ({ valor: s.id, rotulo: s.description }))]} />
            <label className="rp-label" htmlFor={`${idBase}-busca`}>Item</label>
            <span className="rp-campo">
              <input id={`${idBase}-busca`} className="rp-field" value={busca} maxLength={100} placeholder="Código ou descrição"
                onChange={(e) => (setBusca(e.target.value), setErro(null))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void buscar())} />
              <button type="button" className="rp-campo-btn" aria-label="Buscar item" title="Buscar item" onClick={() => void buscar()}>
                <i className="rp-ico rp-ico-consulta" aria-hidden="true" />
              </button>
            </span>
            {itens.length > 0 && (
              <>
                <label className="rp-label" htmlFor={`${idBase}-item`}>Encontrados</label>
                <Selecao id={`${idBase}-item`} valor={itemId} onChange={setItemId}
                  opcoes={[{ valor: '', rotulo: 'Escolha o item' }, ...itens.map((i) => ({ valor: i.id, rotulo: `${i.code} — ${i.description}` }))]} />
              </>
            )}
          </>
        )}
        {(acao === 'ADD' || acao === 'UPDATE') && (
          <>
            <label className="rp-label" htmlFor={`${idBase}-qtd`}>Quantidade</label>
            <input id={`${idBase}-qtd`} className="rp-field rp-field--num rp-field--curto" value={qtd} maxLength={20} onChange={(e) => setQtd(e.target.value)} />
            {(acao === 'ADD' || linha?.kind === 'ITEM') && (
              <>
                <label className="rp-label" htmlFor={`${idBase}-custo`}>Custo unitário</label>
                <CampoDinheiro id={`${idBase}-custo`} casas={6} className="rp-field rp-field--num rp-field--curto" value={preco} maxLength={24}
                  onChange={(e) => setPreco(e.target.value)} />
              </>
            )}
          </>
        )}
        <label className="rp-label" htmlFor={`${idBase}-motivo`}>Motivo</label>
        <input id={`${idBase}-motivo`} className="rp-field" value={motivo} maxLength={500} onChange={(e) => (setMotivo(e.target.value), setErro(null))}
          onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}
