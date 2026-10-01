import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Bom, BomComparison, BomLine, BomLineRequest, BomRevision, HistoryEntry, ItemSummary } from '../api/types';
import { centavos, centavosParaApi, dataHora, decimalParaApi, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { custo, ListaProblemas, quantidade, REVISAO_BOM, seloRevisaoBom } from './comum/Bom';
import { novaChave } from './comum/Cadastros';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { DialogoConflito } from './comum/Dialogos';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';

/** Avisado depois de gravar, aprovar ou criar revisão, para a lista de BOMs e outras janelas recarregarem. */
export const BOM_ALTERADA = 'renda:bom-alterada';

type Tab = 'linhas' | 'categorias' | 'problemas' | 'estrutura' | 'historico';

/** Linha como o PUT espera, a partir da linha lida. */
export const linhaParaApi = (l: BomLine): BomLineRequest => ({
  kind: l.kind,
  itemId: l.itemId,
  childRevisionId: l.childRevisionId,
  referenceCode: l.referenceCode,
  description: l.description,
  quantity: l.quantity,
  uom: l.uom,
  unitCost: l.unitCost,
  category: l.category,
  supplier: l.supplier,
  material: l.material,
  notes: l.notes,
});

type No = { nivel: number; rev: BomRevision };

/**
 * Revisão da BOM (formulário "bom", Sprint 10): as linhas com o valor de cada uma, os subtotais por categoria, as
 * pendências e os problemas, a estrutura de submontagens e o histórico. No rascunho, incluir, alterar e retirar linhas
 * gravam na hora (com a versão lida); aprovar leva junto as submontagens em rascunho e, depois disso, a revisão não muda.
 */
export function BomRevisionWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [rev, setRev] = useState<BomRevision | null>(null);
  const [etag, setEtag] = useState('');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('linhas');
  const [sel, setSel] = useState<number | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [estrutura, setEstrutura] = useState<No[] | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<'incluir' | 'alterar' | 'retirar' | 'dados' | 'aprovar' | null>(null);
  const [recusa, setRecusa] = useState<{ mensagem: string; itens: string[] } | null>(null);
  const [comparar, setComparar] = useState('');
  const [comparacao, setComparacao] = useState<BomComparison | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chaveNova = useRef(novaChave());

  const rascunho = rev?.status === 'DRAFT';
  const editavel = rascunho && can('bom.update');

  const aplicar = useCallback((r: BomRevision, etagLido?: string) => {
    setRev(r);
    setEtag(etagLido ?? `"${r.version}"`);
    setHistorico(null);
    setEstrutura(null);
  }, []);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const r = await api.get<BomRevision>(`/api/v1/bom-revisions/${recordKey}`);
      aplicar(r.data, r.etag);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [recordKey, aplicar]);

  useEffect(() => void carregar(), [carregar]);

  // Aprovar uma BOM aprova as submontagens em rascunho abaixo dela: as janelas abertas delas se atualizam.
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(BOM_ALTERADA, r);
    return () => window.removeEventListener(BOM_ALTERADA, r);
  }, [carregar]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null || !rev) return;
    api
      .get<HistoryEntry[]>(`/api/v1/boms/${rev.bomId}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, rev, historico]);

  // Estrutura: a revisão e, abaixo, a revisão escolhida de cada submontagem, em qualquer nível.
  useEffect(() => {
    if (tab !== 'estrutura' || estrutura !== null || !rev) return;
    const montar = async (r: BomRevision, nivel: number, saida: No[]) => {
      saida.push({ nivel, rev: r });
      if (nivel >= 10) return;
      for (const l of r.lines.filter((x) => x.kind === 'SUBASSEMBLY' && x.childRevisionId)) {
        const filho = (await api.get<BomRevision>(`/api/v1/bom-revisions/${l.childRevisionId}`)).data;
        await montar(filho, nivel + 1, saida);
      }
    };
    const saida: No[] = [];
    montar(rev, 0, saida)
      .then(() => setEstrutura(saida))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, rev, estrutura]);

  /** Grava o rascunho inteiro com as linhas e os dados dados; devolve verdadeiro se gravou. */
  const gravar = async (linhas: BomLineRequest[], informado: string | null, notas: string | null, sucesso: string): Promise<boolean> => {
    if (!rev) return false;
    setOcupado(true);
    try {
      const r = await api.put<BomRevision>(`/api/v1/bom-revisions/${rev.id}`, { informedTotalCents: informado, notes: notas, lines: linhas }, etag);
      aplicar(r.data, r.etag);
      win.notify({ tone: 'sucesso', text: sucesso });
      window.dispatchEvent(new Event(BOM_ALTERADA));
      return true;
    } catch (e) {
      const x = e as ApiError;
      if (x.isConflict) {
        setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
        win.notify({ tone: 'aviso', text: `A revisão foi alterada por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
      } else {
        const detalhe = x.details.map((d) => d.message).filter((m) => m !== x.message)[0];
        win.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${detalhe ? ` ${detalhe}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const linhasAtuais = () => (rev ? rev.lines.map(linhaParaApi) : []);
  const linhaSel = rev && sel !== null ? rev.lines[sel] : null;

  const aprovar = async () => {
    if (!rev) return;
    setDialogo(null);
    setOcupado(true);
    try {
      const r = await api.post<BomRevision>(`/api/v1/bom-revisions/${rev.id}/approval`, null);
      aplicar(r.data, r.etag);
      win.notify({ tone: 'sucesso', text: `Revisão ${r.data.label} da BOM ${r.data.bomName} aprovada com sucesso` });
      window.dispatchEvent(new Event(BOM_ALTERADA));
    } catch (e) {
      const x = e as ApiError;
      if (x.status === 422) setRecusa({ mensagem: x.message, itens: x.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)) });
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setOcupado(false);
    }
  };

  const novaRevisao = async () => {
    if (!rev) return;
    setOcupado(true);
    try {
      const r = await api.post<BomRevision>(`/api/v1/boms/${rev.bomId}/revisions`, null, { 'Idempotency-Key': chaveNova.current });
      chaveNova.current = novaChave();
      win.notify({ tone: 'sucesso', text: `Revisão ${r.data.label} da BOM ${r.data.bomName} criada em rascunho` });
      window.dispatchEvent(new Event(BOM_ALTERADA));
      win.open('bom-revision', r.data.id);
    } catch (e) {
      const x = e as ApiError;
      if (!x.isNetwork) chaveNova.current = novaChave();
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setOcupado(false);
    }
  };

  const fazerComparacao = async (outra: string) => {
    setComparar(outra);
    if (!rev || !outra) return setComparacao(null);
    // Sempre da revisão mais antiga para a mais nova, para a diferença ler "antes → depois".
    const numero = (id: string) => Number(rev.revisions.find((r) => r.id === id)?.label ?? '0');
    const [antes, depois] = numero(outra) <= rev.revision ? [outra, rev.id] : [rev.id, outra];
    try {
      setComparacao((await api.get<BomComparison>(`/api/v1/bom-revisions/${depois}/comparison?with=${antes}`)).data);
    } catch (e) {
      const x = e as ApiError;
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dialogo || conflito !== null || recusa) return;
    if (e.altKey) {
      const alvo: Record<string, Tab> = { l: 'linhas', c: 'categorias', p: 'problemas', e: 'estrutura', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTab(t);
        return;
      }
      const acao: Record<string, () => void> = editavel
        ? { i: () => setDialogo('incluir'), a: () => linhaSel && setDialogo('alterar'), r: () => linhaSel && setDialogo('retirar'), d: () => setDialogo('dados') }
        : {};
      const f = acao[e.key.toLowerCase()];
      if (f) {
        e.preventDefault();
        f();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const fid = (k: string) => `${win.windowId}-${k}`;
  const tabs: [Tab, ReactNode][] = [
    ['linhas', <span><u>L</u>inhas ({rev?.lines.length ?? 0})</span>],
    ['categorias', <span><u>C</u>ategorias</span>],
    ['problemas', <span><u>P</u>roblemas ({rev?.problems.length ?? 0})</span>],
    ['estrutura', <span><u>E</u>strutura</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];
  const diferenca = rev && rev.informedTotalCents !== null ? (BigInt(rev.totalCents) - BigInt(rev.informedTotalCents)).toString() : null;
  const outras = rev ? rev.revisions.filter((r) => r.id !== rev.id) : [];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !rev ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">BOM</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="BOM" value={`${rev.bomCode} — ${rev.bomName}`} />
                <span className="rp-label">Modelo</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Modelo" value={rev.modelName ? `${rev.modelCode} — ${rev.modelName}` : 'Submontagem'} />
                <label className="rp-label" htmlFor={fid('rev')}>Revisão</label>
                <span />
                <Selecao id={fid('rev')} valor={rev.id} onChange={(id) => id !== rev.id && win.open('bom-revision', id)}
                  opcoes={rev.revisions.map((r) => ({ valor: r.id, rotulo: `${r.label} — ${REVISAO_BOM[r.status]}` }))} />
                <span className="rp-label">Observações</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Observações" value={rev.notes ?? ''} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>{seloRevisaoBom(rev.status)}</span>
                <span className="rp-label">Total</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total da revisão" value={reais(rev.totalCents)} />
                <span className="rp-label">Total informado</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total informado" value={reais(rev.informedTotalCents)} placeholder="Não informado" />
                <span className="rp-label">Diferença</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Diferença" value={diferenca === null ? '' : reais(diferenca)} />
                <span className="rp-label">Pendências</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Pendências" value={rev.pending === 0 ? 'Nenhuma' : `${rev.pending} ${rev.pending === 1 ? 'linha' : 'linhas'}`} />
                <span className="rp-label">{rev.approvedAt ? 'Aprovada em' : 'Atualizada em'}</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label={rev.approvedAt ? 'Aprovada em' : 'Atualizada em'}
                  value={rev.approvedAt ? `${dataHora(rev.approvedAt)} por ${rev.approvedBy}` : `${dataHora(rev.updatedAt ?? rev.createdAt)} por ${rev.updatedBy ?? rev.createdBy}`} />
              </div>
            </div>

            {rev.pending > 0 && (
              <p className="rp-tip" role="note">
                Total parcial: {rev.pending} {rev.pending === 1 ? 'linha está' : 'linhas estão'} sem quantidade ou sem custo e {rev.pending === 1 ? 'fica' : 'ficam'} fora da soma até ser {rev.pending === 1 ? 'informada' : 'informadas'}.
              </p>
            )}

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {tab === 'linhas' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Linhas da revisão">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th aria-label="Abrir" />
                        <th>Cód. ref.</th>
                        <th>Descrição</th>
                        <th className="num">Qtd.</th>
                        <th>Un.</th>
                        <th className="num">Custo unit.</th>
                        <th className="num">Total</th>
                        <th>Categoria</th>
                        <th>Fornecedor</th>
                        <th>Material</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rev.lines.map((l, i) => (
                        <tr key={l.id} aria-selected={sel === i} onClick={() => setSel(i)} onDoubleClick={() => editavel && (setSel(i), setDialogo('alterar'))}>
                          <td className="rownum">{l.position}</td>
                          <td>
                            {l.kind === 'SUBASSEMBLY'
                              ? seta(`Abrir submontagem ${l.childBomName} rev. ${l.childRevisionLabel}`, () => win.open('bom-revision', l.childRevisionId!))
                              : seta(`Abrir item ${l.itemCode}`, () => win.open('item', l.itemId!))}
                          </td>
                          <td>{l.referenceCode ?? ''}</td>
                          <td>
                            {l.kind === 'SUBASSEMBLY' ? (
                              <>
                                <b>{l.description}</b> <span className="rp-bom__rev">rev. {l.childRevisionLabel}</span> {seloRevisaoBom(l.childRevisionStatus!)}
                              </>
                            ) : (
                              l.description
                            )}
                          </td>
                          <td className="num">{l.quantity === null ? <span className="rp-badge rp-badge--pendente">Sem quantidade</span> : quantidade(l.quantity)}</td>
                          <td>{l.uom}</td>
                          <td className="num">{l.kind === 'SUBASSEMBLY' ? '' : l.unitCost === null ? <span className="rp-badge rp-badge--pendente">Sem custo</span> : custo(l.unitCost)}</td>
                          <td className="num">{l.lineCents === null ? '' : centavos(l.lineCents)}</td>
                          <td>{l.category ?? ''}</td>
                          <td>{l.supplier ?? ''}</td>
                          <td>{l.material ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7}>{rev.pending > 0 ? 'Total parcial' : 'Total'}</td>
                        <td className="num" aria-label="Total das linhas">{centavos(rev.totalCents)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                  {rev.lines.length === 0 && <p className="rp-jlista__vazio">A revisão ainda não tem linhas. Use Incluir linha.</p>}
                </div>
              ) : tab === 'categorias' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Subtotais por categoria">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Categoria</th>
                        <th className="num">Linhas</th>
                        <th className="num">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rev.categories.map((c, i) => (
                        <tr key={c.category}>
                          <td className="rownum">{i + 1}</td>
                          <td>{c.category}</td>
                          <td className="num">{c.lines}</td>
                          <td className="num">{centavos(c.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total</td>
                        <td className="num">{centavos(rev.totalCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : tab === 'problemas' ? (
                <ListaProblemas problemas={rev.problems} rotulo="Problemas da revisão" />
              ) : tab === 'estrutura' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Estrutura de submontagens">
                    <thead>
                      <tr>
                        <th aria-label="Abrir" />
                        <th>BOM</th>
                        <th>Revisão</th>
                        <th>Situação</th>
                        <th className="num">Linhas</th>
                        <th className="num">Pendências</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(estrutura ?? []).map((n, i) => (
                        <tr key={`${n.rev.id}-${i}`}>
                          <td>{n.nivel > 0 && seta(`Abrir ${n.rev.bomName} rev. ${n.rev.label}`, () => win.open('bom-revision', n.rev.id))}</td>
                          <td className={`rp-bom__nivel-${Math.min(n.nivel, 4)}`}>{n.rev.bomName}</td>
                          <td>{n.rev.label}</td>
                          <td>{seloRevisaoBom(n.rev.status)}</td>
                          <td className="num">{n.rev.lines.length}</td>
                          <td className="num">{n.rev.pending}</td>
                          <td className="num">{centavos(n.rev.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {estrutura === null && <p className="rp-janela-mdi__aviso">Carregando</p>}
                  {rev.usedBy.length > 0 && (
                    <p className="rp-tip" role="note">
                      Usada como submontagem em: {rev.usedBy.map((u) => `${u.bomName} rev. ${u.revisionLabel} (${REVISAO_BOM[u.status]})`).join('; ')}.
                    </p>
                  )}
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico da BOM" />
              )}
            </div>

            {outras.length > 0 && (
              <div className="rp-filtros rp-bom__comparar">
                <label htmlFor={fid('comparar')}>Comparar com</label>
                <Selecao id={fid('comparar')} valor={comparar} onChange={(v) => void fazerComparacao(v)}
                  opcoes={[{ valor: '', rotulo: 'Escolha a revisão' }, ...outras.map((r) => ({ valor: r.id, rotulo: `${r.label} — ${REVISAO_BOM[r.status]} — ${reais(r.totalCents)}` }))]} />
              </div>
            )}
            {comparacao && (
              <div className="rp-tabela">
                <div className="rp-tabela-acoes">
                  <span className="rp-tabela-tit">
                    Rev. {comparacao.from.label} → rev. {comparacao.to.label}: {reais(comparacao.totalBefore)} → {reais(comparacao.totalAfter)} (diferença {reais(comparacao.difference)})
                  </span>
                  <button type="button" className="rp-btn" onClick={() => (setComparacao(null), setComparar(''))}>Fechar comparação</button>
                </div>
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Comparação das revisões">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Mudança</th>
                        <th>Descrição</th>
                        <th className="num">Qtd. antes</th>
                        <th className="num">Qtd. depois</th>
                        <th className="num">Custo antes</th>
                        <th className="num">Custo depois</th>
                        <th className="num">Total antes</th>
                        <th className="num">Total depois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparacao.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="rownum">{i + 1}</td>
                          <td>{r.status === 'ADDED' ? 'Incluída' : r.status === 'REMOVED' ? 'Retirada' : 'Alterada'}</td>
                          <td>
                            {r.description}
                            {r.kind === 'SUBASSEMBLY' && r.revisionBefore !== r.revisionAfter && ` (rev. ${r.revisionBefore ?? '—'} → ${r.revisionAfter ?? '—'})`}
                          </td>
                          <td className="num">{quantidade(r.quantityBefore)}</td>
                          <td className="num">{quantidade(r.quantityAfter)}</td>
                          <td className="num">{custo(r.unitCostBefore)}</td>
                          <td className="num">{custo(r.unitCostAfter)}</td>
                          <td className="num">{centavos(r.centsBefore)}</td>
                          <td className="num">{centavos(r.centsAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {comparacao.rows.length === 0 && <p className="rp-jlista__vazio">As duas revisões têm as mesmas linhas.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>OK</button>
          {editavel && (
            <>
              <button type="button" className="rp-btn" disabled={ocupado} onClick={() => setDialogo('incluir')}><span><u>I</u>ncluir linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado || !linhaSel} onClick={() => setDialogo('alterar')}><span><u>A</u>lterar linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado || !linhaSel} onClick={() => setDialogo('retirar')}><span><u>R</u>etirar linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado} onClick={() => setDialogo('dados')}><span><u>D</u>ados da revisão</span></button>
            </>
          )}
        </div>
        <div className="rp-btn-row">
          {rascunho && can('bom.approve') && (
            <button type="button" className="rp-btn" disabled={ocupado} onClick={() => setDialogo('aprovar')}><span>Apro<u>v</u>ar revisão</span></button>
          )}
          {rev && !rascunho && can('bom.update') && !rev.revisions.some((r) => r.status === 'DRAFT') && (
            <button type="button" className="rp-btn" disabled={ocupado} onClick={() => void novaRevisao()}><span><u>N</u>ova revisão</span></button>
          )}
        </div>
      </div>

      {rev && dialogo === 'incluir' && (
        <DialogoLinha idBase={fid('incluir')} rev={rev} linha={null} onCancelar={() => setDialogo(null)}
          onConfirmar={async (nova) => {
            if (await gravar([...linhasAtuais(), nova], rev.informedTotalCents, rev.notes, `Linha incluída na revisão ${rev.label} da BOM ${rev.bomName}`)) {
              setDialogo(null);
              setSel(rev.lines.length);
            }
          }} />
      )}
      {rev && dialogo === 'alterar' && linhaSel && sel !== null && (
        <DialogoLinha idBase={fid('alterar')} rev={rev} linha={linhaSel} onCancelar={() => setDialogo(null)}
          onConfirmar={async (alterada) => {
            const linhas = linhasAtuais().map((l, i) => (i === sel ? alterada : l));
            if (await gravar(linhas, rev.informedTotalCents, rev.notes, `Linha ${linhaSel.position} da revisão ${rev.label} atualizada com sucesso`)) setDialogo(null);
          }} />
      )}
      {rev && dialogo === 'retirar' && linhaSel && sel !== null && (
        <Dialog icon="aviso" label="Retirar linha" onEscape={() => setDialogo(null)}
          buttons={[
            {
              label: 'Retirar', primary: true, onClick: () => void (async () => {
                if (await gravar(linhasAtuais().filter((_, i) => i !== sel), rev.informedTotalCents, rev.notes, `Linha retirada da revisão ${rev.label}`)) {
                  setDialogo(null);
                  setSel(null);
                }
              })(),
            },
            { label: 'Cancelar', onClick: () => setDialogo(null) },
          ]}>
          A linha {linhaSel.position} — {linhaSel.description} sai do rascunho da revisão {rev.label}.
          <br />
          Deseja retirar a linha?
        </Dialog>
      )}
      {rev && dialogo === 'dados' && (
        <DialogoDados idBase={fid('dados')} rev={rev} onCancelar={() => setDialogo(null)}
          onConfirmar={async (informado, notas) => {
            if (await gravar(linhasAtuais(), informado, notas, `Revisão ${rev.label} da BOM ${rev.bomName} atualizada com sucesso`)) setDialogo(null);
          }} />
      )}
      {rev && dialogo === 'aprovar' && (
        <Dialog icon="aviso" label="Aprovar revisão" onEscape={() => setDialogo(null)}
          buttons={[
            { label: 'Aprovar', primary: true, onClick: () => void aprovar() },
            { label: 'Cancelar', onClick: () => setDialogo(null) },
          ]}>
          A revisão {rev.label} da BOM {rev.bomName} soma {reais(rev.totalCents)}
          {rev.lines.some((l) => l.childRevisionStatus === 'DRAFT') ? ' e as submontagens em rascunho abaixo dela são aprovadas junto' : ''}. Depois de aprovada, a revisão não muda mais.
          <br />
          Deseja aprovar a revisão?
        </Dialog>
      )}
      {recusa && (
        <Dialog icon="erro" label="Revisão com pendências" onEscape={() => setRecusa(null)} buttons={[{ label: 'OK', primary: true, onClick: () => setRecusa(null) }]}>
          {recusa.mensagem}
          <ul className="rp-bom__problemas" aria-label="Pendências da aprovação">
            {recusa.itens.map((t) => (
              <li key={t}>
                <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="Revisão alterada por outra pessoa" objeto="A revisão" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** Incluir ou alterar uma linha do rascunho: item do cadastro (com o custo digitado) ou submontagem (outra BOM). */
function DialogoLinha({ idBase, rev, linha, onConfirmar, onCancelar }: {
  idBase: string;
  rev: BomRevision;
  linha: BomLine | null;
  onConfirmar: (l: BomLineRequest) => Promise<void>;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<'ITEM' | 'SUBASSEMBLY'>(linha?.kind ?? 'ITEM');
  const [busca, setBusca] = useState(linha?.itemCode ?? '');
  const [itens, setItens] = useState<ItemSummary[]>([]);
  const [itemId, setItemId] = useState(linha?.itemId ?? '');
  const [descricao, setDescricao] = useState(linha?.kind === 'ITEM' ? linha.description : '');
  const [qtd, setQtd] = useState(linha ? quantidade(linha.quantity) : '1');
  const [preco, setPreco] = useState(linha ? custo(linha.unitCost) : '');
  const [categoria, setCategoria] = useState(linha?.category ?? '');
  const [fornecedor, setFornecedor] = useState(linha?.supplier ?? '');
  const [material, setMaterial] = useState(linha?.material ?? '');
  const [obs, setObs] = useState(linha?.notes ?? '');
  const [boms, setBoms] = useState<Bom[]>([]);
  const [subBom, setSubBom] = useState(linha?.childBomId ?? '');
  const [subRev, setSubRev] = useState(linha?.childRevisionId ?? '');
  const [revisoesSub, setRevisoesSub] = useState<{ valor: string; rotulo: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (tipo !== 'SUBASSEMBLY') return;
    api.get<Bom[]>('/api/v1/boms').then((r) => setBoms(r.data.filter((b) => !b.modelId && b.id !== rev.bomId))).catch(() => setBoms([]));
  }, [tipo, rev.bomId]);

  useEffect(() => {
    if (!subBom) return setRevisoesSub([]);
    const atual = linha?.childBomId === subBom ? linha.childRevisionId : null;
    api.get<BomRevision>(`/api/v1/bom-revisions/${atual ?? boms.find((b) => b.id === subBom)?.approved?.id ?? boms.find((b) => b.id === subBom)?.draft?.id}`)
      .then((r) => {
        const opcoes = r.data.revisions.map((x) => ({ valor: x.id, rotulo: `${x.label} — ${REVISAO_BOM[x.status]} — ${reais(x.totalCents)}` }));
        setRevisoesSub(opcoes);
        setSubRev((v) => (opcoes.some((o) => o.valor === v) ? v : opcoes[0]?.valor ?? ''));
      })
      .catch(() => setRevisoesSub([]));
  }, [subBom, boms, linha]);

  const buscar = async () => {
    const termo = busca.trim();
    if (!termo) return;
    try {
      const r = (await api.get<ItemSummary[]>(`/api/v1/items?search=${encodeURIComponent(termo)}`)).data.filter((i) => i.status === 'ATIVO');
      setItens(r);
      if (r.length === 1) {
        setItemId(r[0].id);
        setDescricao(r[0].description);
      } else if (r.length === 0) {
        setErro('Nenhum registro correspondente encontrado.');
      }
    } catch (e) {
      setErro((e as ApiError).message);
    }
  };

  const confirmar = async () => {
    if (enviando) return;
    if (tipo === 'ITEM' && !itemId) return setErro('Escolha o produto ou serviço.');
    if (tipo === 'SUBASSEMBLY' && !subRev) return setErro('Escolha a submontagem e a revisão.');
    setEnviando(true);
    const base = linha && linha.kind === tipo ? linhaParaApi(linha) : ({ kind: tipo } as BomLineRequest);
    const nova: BomLineRequest = tipo === 'ITEM'
      ? {
        ...base, kind: 'ITEM', itemId, childRevisionId: null, description: descricao.trim() || null,
        uom: linha?.kind === 'ITEM' && linha.itemId === itemId ? linha.uom : null,
        referenceCode: linha?.kind === 'ITEM' && linha.itemId === itemId ? linha.referenceCode : null,
        quantity: decimalParaApi(qtd), unitCost: decimalParaApi(preco.replace(/R\$\s?/, '')), category: categoria.trim() || null,
        supplier: fornecedor.trim() || null, material: material.trim() || null, notes: obs.trim() || null,
      }
      : {
        ...base, kind: 'SUBASSEMBLY', itemId: null, childRevisionId: subRev, unitCost: null, quantity: decimalParaApi(qtd),
        referenceCode: null, description: null, uom: null, category: categoria.trim() || null, notes: obs.trim() || null,
      };
    try {
      await onConfirmar(nova);
    } finally {
      setEnviando(false);
    }
  };

  const fid = (k: string) => `${idBase}-${k}`;
  return (
    <Dialog icon="info" label={linha ? 'Alterar linha' : 'Incluir linha'} onEscape={onCancelar}
      buttons={[
        { label: linha ? 'Atualizar' : 'Incluir', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      {linha ? `Linha ${linha.position} do rascunho da revisão ${rev.label}.` : `Nova linha no rascunho da revisão ${rev.label}.`} A quantidade e o custo vazios ficam como pendência e impedem a aprovação.
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={fid('tipo')}>Tipo</label>
        <Selecao id={fid('tipo')} valor={tipo} onChange={(v) => (setTipo(v as 'ITEM' | 'SUBASSEMBLY'), setErro(null))} disabled={!!linha}
          opcoes={[{ valor: 'ITEM', rotulo: 'Item do cadastro' }, { valor: 'SUBASSEMBLY', rotulo: 'Submontagem' }]} />
        {tipo === 'ITEM' ? (
          <>
            <label className="rp-label" htmlFor={fid('busca')}>Item</label>
            <span className="rp-campo">
              <input id={fid('busca')} className="rp-field" value={busca} maxLength={100} placeholder="Código ou descrição"
                onChange={(e) => (setBusca(e.target.value), setErro(null))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void buscar())} />
              <button type="button" className="rp-campo-btn" aria-label="Buscar item" title="Buscar item" onClick={() => void buscar()}>
                <i className="rp-ico rp-ico-consulta" aria-hidden="true" />
              </button>
            </span>
            {itens.length > 1 && (
              <>
                <label className="rp-label" htmlFor={fid('item')}>Encontrados</label>
                <Selecao id={fid('item')} valor={itemId} onChange={(v) => (setItemId(v), setDescricao(itens.find((i) => i.id === v)?.description ?? ''))}
                  opcoes={[{ valor: '', rotulo: 'Escolha o item' }, ...itens.map((i) => ({ valor: i.id, rotulo: `${i.code} — ${i.description}` }))]} />
              </>
            )}
            <label className="rp-label" htmlFor={fid('desc')}>Descrição</label>
            <input id={fid('desc')} className="rp-field" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
          </>
        ) : (
          <>
            <label className="rp-label" htmlFor={fid('sub')}>Submontagem</label>
            <Selecao id={fid('sub')} valor={subBom} onChange={(v) => (setSubBom(v), setErro(null))}
              opcoes={[{ valor: '', rotulo: 'Escolha a submontagem' }, ...boms.map((b) => ({ valor: b.id, rotulo: `${b.code} — ${b.name}` })),
                ...(linha?.childBomId && !boms.some((b) => b.id === linha.childBomId) ? [{ valor: linha.childBomId, rotulo: `${linha.childBomCode} — ${linha.childBomName}` }] : [])]} />
            <label className="rp-label" htmlFor={fid('subrev')}>Revisão</label>
            <Selecao id={fid('subrev')} valor={subRev} onChange={setSubRev} opcoes={revisoesSub.length ? revisoesSub : [{ valor: '', rotulo: 'Escolha a submontagem' }]} />
          </>
        )}
        <label className="rp-label" htmlFor={fid('qtd')}>Quantidade</label>
        <input id={fid('qtd')} className="rp-field rp-field--num rp-field--curto" value={qtd} maxLength={20} onChange={(e) => setQtd(e.target.value)} />
        {tipo === 'ITEM' && (
          <>
            <label className="rp-label" htmlFor={fid('custo')}>Custo unitário</label>
            <CampoDinheiro id={fid('custo')} casas={6} className="rp-field rp-field--num rp-field--curto" value={preco} maxLength={24} onChange={(e) => setPreco(e.target.value)} />
            <label className="rp-label" htmlFor={fid('forn')}>Fornecedor</label>
            <input id={fid('forn')} className="rp-field" value={fornecedor} maxLength={120} onChange={(e) => setFornecedor(e.target.value)} />
            <label className="rp-label" htmlFor={fid('mat')}>Material</label>
            <input id={fid('mat')} className="rp-field" value={material} maxLength={120} onChange={(e) => setMaterial(e.target.value)} />
          </>
        )}
        <label className="rp-label" htmlFor={fid('cat')}>Categoria</label>
        <input id={fid('cat')} className="rp-field" value={categoria} maxLength={100} onChange={(e) => setCategoria(e.target.value)} />
        <label className="rp-label" htmlFor={fid('obs')}>Observação</label>
        <input id={fid('obs')} className="rp-field" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}

/** Total informado da origem e observações da revisão. */
function DialogoDados({ idBase, rev, onConfirmar, onCancelar }: {
  idBase: string;
  rev: BomRevision;
  onConfirmar: (informado: string | null, notas: string | null) => Promise<void>;
  onCancelar: () => void;
}) {
  const [informado, setInformado] = useState(centavos(rev.informedTotalCents));
  const [obs, setObs] = useState(rev.notes ?? '');
  const confirmar = () => void onConfirmar(centavosParaApi(informado), obs.trim() || null);
  return (
    <Dialog icon="info" label="Dados da revisão" onEscape={onCancelar}
      buttons={[
        { label: 'Atualizar', primary: true, onClick: confirmar },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      O total informado é o da planilha ou do arquivo de origem; a diferença para a soma das linhas aparece e não é corrigida.
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-inf`}>Total informado</label>
        <CampoDinheiro id={`${idBase}-inf`} className="rp-field rp-field--num rp-field--curto" value={informado} maxLength={20}
          onChange={(e) => setInformado(e.target.value)}
          onBlur={() => {
            const c = centavosParaApi(informado);
            if (c && /^\d+$/.test(c)) setInformado(centavos(c));
          }} />
        <label className="rp-label" htmlFor={`${idBase}-obs`}>Observações</label>
        <input id={`${idBase}-obs`} className="rp-field" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} />
      </div>
    </Dialog>
  );
}
