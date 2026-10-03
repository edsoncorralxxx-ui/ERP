import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Bom, BomLine, BomLineRequest, BomSummary, HistoryEntry, ItemSummary } from '../api/types';
import { centavos, centavosParaApi, dataHora, decimalParaApi, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { BOM_ALTERADA, custo, ListaProblemas, quantidade } from './comum/Bom';
import { ArvoreBom, caminhosComFilhos, DiagramaBom, noDoCaminho } from './comum/BomArvore';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { DialogoConflito } from './comum/Dialogos';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';

type Tab = 'linhas' | 'diagrama' | 'categorias' | 'problemas' | 'historico';

/** Linha como o PUT espera, a partir da linha lida. */
export const linhaParaApi = (l: BomLine): BomLineRequest => ({
  kind: l.kind,
  itemId: l.itemId,
  childBomId: l.childBomId,
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

const erroDe = (x: ApiError) => `${x.message} (${x.code}) [${x.correlationId ?? '—'}]`;

/**
 * BOM (formulário "bom", Sprint 10, ajustado na Review de 02/10/2026): uma BOM só, editada direto. À esquerda a árvore
 * da estrutura (modelo → submontagens); à direita a BOM escolhida na árvore, com as linhas, o diagrama em árvore da
 * estrutura, os subtotais por categoria, os problemas e o histórico. Incluir, alterar e retirar linhas gravam na hora
 * (com a versão lida) e valem para as BOMs que usam esta; os equipamentos só mudam quando a BOM é reaplicada.
 */
export function BomWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [raiz, setRaiz] = useState<Bom | null>(null);
  const [caminho, setCaminho] = useState('0');
  const [atual, setAtual] = useState<Bom | null>(null);
  const [etag, setEtag] = useState('');
  const [abertos, setAbertos] = useState<Set<string> | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('linhas');
  const [sel, setSel] = useState<number | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<'incluir' | 'alterar' | 'retirar' | 'dados' | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const editavel = can('bom.update');
  const noSel = raiz ? noDoCaminho(raiz.tree, caminho) : null;
  const bomSel = noSel?.bomId ?? recordKey;

  const carregarRaiz = useCallback(async () => {
    setErroCarga(null);
    try {
      const r = await api.get<Bom>(`/api/v1/boms/${recordKey}`);
      setRaiz(r.data);
      setAbertos((a) => a ?? new Set(caminhosComFilhos(r.data.tree)));
      return r;
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: erroDe(x) });
      return null;
    }
  }, [recordKey]);

  useEffect(() => void carregarRaiz(), [carregarRaiz]);

  // A BOM escolhida na árvore: a própria raiz, ou a submontagem lida à parte.
  const carregarAtual = useCallback(async (id: string) => {
    try {
      const r = await api.get<Bom>(`/api/v1/boms/${id}`);
      setAtual(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setHistorico(null);
    } catch (e) {
      winRef.current.notify({ tone: 'erro', text: erroDe(e as ApiError) });
    }
  }, []);

  useEffect(() => {
    if (!raiz) return;
    if (!noSel) return setCaminho('0');
    if (atual?.id !== noSel.bomId) {
      setSel(null);
      void carregarAtual(noSel.bomId);
    }
  }, [raiz, noSel, atual?.id, carregarAtual]);

  // Gravada aqui ou em outra janela: a árvore e a BOM escolhida se atualizam (os totais de cima mudam junto).
  useEffect(() => {
    const r = () => {
      void carregarRaiz();
      void carregarAtual(bomSel);
    };
    window.addEventListener(BOM_ALTERADA, r);
    return () => window.removeEventListener(BOM_ALTERADA, r);
  }, [carregarRaiz, carregarAtual, bomSel]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null || !atual) return;
    api
      .get<HistoryEntry[]>(`/api/v1/boms/${atual.id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: erroDe(e) }));
  }, [tab, atual, historico]);

  /** Grava a BOM escolhida inteira com as linhas e os dados dados; devolve verdadeiro se gravou. */
  const gravar = async (linhas: BomLineRequest[], informado: string | null, notas: string | null, sucesso: string): Promise<boolean> => {
    if (!atual) return false;
    setOcupado(true);
    try {
      const r = await api.put<Bom>(`/api/v1/boms/${atual.id}`, { informedTotalCents: informado, notes: notas, lines: linhas }, etag);
      setAtual(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setHistorico(null);
      win.notify({ tone: 'sucesso', text: sucesso });
      window.dispatchEvent(new Event(BOM_ALTERADA));
      return true;
    } catch (e) {
      const x = e as ApiError;
      if (x.isConflict) {
        setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
        win.notify({ tone: 'aviso', text: `A BOM foi alterada por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
      } else {
        const detalhe = x.details.map((d) => d.message).filter((m) => m !== x.message)[0];
        win.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${detalhe ? ` ${detalhe}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const linhasAtuais = () => (atual ? atual.lines.map(linhaParaApi) : []);
  const linhaSel = atual && sel !== null ? atual.lines[sel] ?? null : null;

  const selecionar = (c: string) => {
    if (c !== caminho) setSel(null);
    setCaminho(c);
  };
  const alternar = (c: string) =>
    setAbertos((a) => {
      const n = new Set(a ?? []);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  /** Submontagem da linha: o nó filho na árvore (os filhos seguem a ordem das linhas de submontagem). */
  const abrirSubmontagem = (i: number) => {
    if (!atual || !noSel) return;
    const k = atual.lines.slice(0, i).filter((l) => l.kind === 'SUBASSEMBLY').length;
    if (!noSel.children[k]) return;
    setAbertos((a) => new Set([...(a ?? []), caminho]));
    selecionar(`${caminho}.${k}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dialogo || conflito !== null) return;
    if (e.altKey) {
      const alvo: Record<string, Tab> = { l: 'linhas', g: 'diagrama', c: 'categorias', p: 'problemas', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTab(t);
        return;
      }
      const acao: Record<string, () => void> = editavel && atual
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
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={(e) => (e.stopPropagation(), fn())}
      onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const fid = (k: string) => `${win.windowId}-${k}`;
  const tabs: [Tab, ReactNode][] = [
    ['linhas', <span><u>L</u>inhas ({atual?.lines.length ?? 0})</span>],
    ['diagrama', <span>Dia<u>g</u>rama</span>],
    ['categorias', <span><u>C</u>ategorias</span>],
    ['problemas', <span><u>P</u>roblemas ({atual?.problems.length ?? 0})</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];
  const diferenca = atual && atual.informedTotalCents !== null ? (BigInt(atual.totalCents) - BigInt(atual.informedTotalCents)).toString() : null;

  if (erroCarga) {
    return (
      <div className="rp-window-body rp-janela-mdi__corpo">
        <p className="rp-janela-mdi__aviso">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
        </p>
      </div>
    );
  }
  if (!raiz || !abertos) {
    return (
      <div className="rp-window-body rp-janela-mdi__corpo">
        <p className="rp-janela-mdi__aviso">Carregando</p>
      </div>
    );
  }

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-bom" onKeyDown={onKeyDown}>
        <section className="rp-arvore-painel" aria-label="Estrutura">
          <div className="rp-arvore-painel__tit">
            <span>Estrutura</span>
            <span className="rp-arvore-painel__total">{reais(raiz.totalCents)}</span>
          </div>
          <ArvoreBom raiz={raiz.tree} selecionado={caminho} abertos={abertos} onSelecionar={selecionar} onAlternar={alternar} rotulo="Estrutura da BOM" />
          <p className="rp-arvore-painel__nota">
            {raiz.pending > 0
              ? `${raiz.pending} ${raiz.pending === 1 ? 'linha sem quantidade ou custo' : 'linhas sem quantidade ou custo'} na estrutura: a BOM ainda não se aplica a equipamento.`
              : 'Estrutura completa: pode ser aplicada aos equipamentos.'}
          </p>
        </section>

        <section className="rp-bom__principal" aria-label="BOM escolhida">
          {!atual ? (
            <p className="rp-janela-mdi__aviso">Carregando</p>
          ) : (
            <>
              <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
                <div className="rp-form rp-ficha__principal">
                  <span className="rp-label">BOM</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="BOM" value={`${atual.code} — ${atual.name}`} />
                  <span className="rp-label">Modelo</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Modelo"
                    value={atual.modelName ? `${atual.modelCode} — ${atual.modelName}` : 'Submontagem'} />
                  <span className="rp-label">Usada em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Usada em"
                    value={atual.usedBy.length ? atual.usedBy.map((u) => u.bomName).join('; ') : atual.modelId ? 'Equipamentos do modelo' : 'Nenhuma BOM'} />
                  <span className="rp-label">Observações</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Observações" value={atual.notes ?? ''} />
                </div>
                <div className="rp-form rp-ficha__situacao">
                  <span className="rp-label">Total</span>
                  <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total da BOM" value={reais(atual.totalCents)} />
                  <span className="rp-label">Total informado</span>
                  <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total informado" value={reais(atual.informedTotalCents)} placeholder="Não informado" />
                  <span className="rp-label">Diferença</span>
                  <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Diferença" value={diferenca === null ? '' : reais(diferenca)} />
                  <span className="rp-label">Pendências</span>
                  <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Pendências"
                    value={atual.pending === 0 ? 'Nenhuma' : `${atual.pending} ${atual.pending === 1 ? 'linha' : 'linhas'}`} />
                  <span className="rp-label">Atualizada em</span>
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Atualizada em"
                    value={`${dataHora(atual.updatedAt ?? atual.createdAt)} por ${atual.updatedBy ?? atual.createdBy}`} />
                </div>
              </div>

              {atual.pending > 0 && (
                <p className="rp-tip" role="note">
                  Total parcial: {atual.pending} {atual.pending === 1 ? 'linha está' : 'linhas estão'} sem quantidade ou sem custo e {atual.pending === 1 ? 'fica' : 'ficam'} fora da soma; enquanto isso a BOM não se aplica a equipamento.
                </p>
              )}

              <div className="rp-tabs" role="tablist">
                {tabs.map(([t, rotulo]) => (
                  <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                    {rotulo}
                  </div>
                ))}
              </div>
              <div className="rp-tabpanel rp-bom__painel" role="tabpanel">
                {tab === 'linhas' ? (
                  <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Linhas da BOM">
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
                        {atual.lines.map((l, i) => (
                          <tr key={l.id} aria-selected={sel === i} onClick={() => setSel(i)}
                            onDoubleClick={() => (l.kind === 'SUBASSEMBLY' ? abrirSubmontagem(i) : editavel && (setSel(i), setDialogo('alterar')))}>
                            <td className="rownum">{l.position}</td>
                            <td>
                              {l.kind === 'SUBASSEMBLY'
                                ? seta(`Mostrar a submontagem ${l.childBomName}`, () => abrirSubmontagem(i))
                                : seta(`Abrir item ${l.itemCode}`, () => win.open('item', l.itemId!))}
                            </td>
                            <td>{l.referenceCode ?? ''}</td>
                            <td>
                              {l.kind === 'SUBASSEMBLY' ? (
                                <span className="rp-bom__sub">
                                  <i className="rp-ico rp-ico-pasta" aria-hidden="true" /> <b>{l.description}</b>
                                  {l.pending > 0 && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">{l.pending} {l.pending === 1 ? 'pendência' : 'pendências'}</span>}
                                </span>
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
                          <td colSpan={7}>{atual.pending > 0 ? 'Total parcial' : 'Total'}</td>
                          <td className="num" aria-label="Total das linhas">{centavos(atual.totalCents)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                    {atual.lines.length === 0 && <p className="rp-jlista__vazio">A BOM ainda não tem linhas. Use Incluir linha.</p>}
                  </div>
                ) : tab === 'diagrama' ? (
                  <>
                    <DiagramaBom raiz={raiz.tree} selecionado={caminho} onSelecionar={selecionar} onAbrir={(c) => (selecionar(c), setTab('linhas'))} />
                    <p className="rp-bom__legenda">
                      Total de uma unidade de cada BOM; a quantidade é a da linha na BOM de cima. Clique para escolher a BOM; duas vezes (ou Enter) para ver as linhas.
                    </p>
                  </>
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
                        {atual.categories.map((c, i) => (
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
                          <td className="num">{centavos(atual.totalCents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : tab === 'problemas' ? (
                  <ListaProblemas problemas={atual.problems} rotulo="Problemas da BOM" />
                ) : (
                  <GradeHistorico historico={historico} rotulo="Histórico da BOM" />
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>OK</button>
          {editavel && atual && (
            <>
              <button type="button" className="rp-btn" disabled={ocupado} onClick={() => setDialogo('incluir')}><span><u>I</u>ncluir linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado || !linhaSel} onClick={() => setDialogo('alterar')}><span><u>A</u>lterar linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado || !linhaSel} onClick={() => setDialogo('retirar')}><span><u>R</u>etirar linha</span></button>
              <button type="button" className="rp-btn" disabled={ocupado} onClick={() => setDialogo('dados')}><span><u>D</u>ados da BOM</span></button>
            </>
          )}
        </div>
      </div>

      {atual && dialogo === 'incluir' && (
        <DialogoLinha idBase={fid('incluir')} bom={atual} linha={null} onCancelar={() => setDialogo(null)}
          onConfirmar={async (nova) => {
            if (await gravar([...linhasAtuais(), nova], atual.informedTotalCents, atual.notes, `Linha incluída na BOM ${atual.name}`)) {
              setDialogo(null);
              setSel(atual.lines.length);
            }
          }} />
      )}
      {atual && dialogo === 'alterar' && linhaSel && sel !== null && (
        <DialogoLinha idBase={fid('alterar')} bom={atual} linha={linhaSel} onCancelar={() => setDialogo(null)}
          onConfirmar={async (alterada) => {
            const linhas = linhasAtuais().map((l, i) => (i === sel ? alterada : l));
            if (await gravar(linhas, atual.informedTotalCents, atual.notes, `Linha ${linhaSel.position} da BOM ${atual.name} atualizada com sucesso`)) setDialogo(null);
          }} />
      )}
      {atual && dialogo === 'retirar' && linhaSel && sel !== null && (
        <Dialog icon="aviso" label="Retirar linha" onEscape={() => setDialogo(null)}
          buttons={[
            {
              label: 'Retirar', primary: true, onClick: () => void (async () => {
                if (await gravar(linhasAtuais().filter((_, i) => i !== sel), atual.informedTotalCents, atual.notes, `Linha retirada da BOM ${atual.name}`)) {
                  setDialogo(null);
                  setSel(null);
                }
              })(),
            },
            { label: 'Cancelar', onClick: () => setDialogo(null) },
          ]}>
          A linha {linhaSel.position} — {linhaSel.description} sai da BOM {atual.name}. Os equipamentos que já têm a BOM aplicada não mudam.
          <br />
          Deseja retirar a linha?
        </Dialog>
      )}
      {atual && dialogo === 'dados' && (
        <DialogoDados idBase={fid('dados')} bom={atual} onCancelar={() => setDialogo(null)}
          onConfirmar={async (informado, notas) => {
            if (await gravar(linhasAtuais(), informado, notas, `BOM ${atual.name} atualizada com sucesso`)) setDialogo(null);
          }} />
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="BOM alterada por outra pessoa" objeto="A BOM" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregarRaiz();
            void carregarAtual(bomSel);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** Incluir ou alterar uma linha: item do cadastro (com o custo digitado) ou submontagem (outra BOM). */
function DialogoLinha({ idBase, bom, linha, onConfirmar, onCancelar }: {
  idBase: string;
  bom: Bom;
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
  const [boms, setBoms] = useState<BomSummary[]>([]);
  const [subBom, setSubBom] = useState(linha?.childBomId ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (tipo !== 'SUBASSEMBLY') return;
    api.get<BomSummary[]>('/api/v1/boms').then((r) => setBoms(r.data.filter((b) => !b.modelId && b.id !== bom.id))).catch(() => setBoms([]));
  }, [tipo, bom.id]);

  const buscar = async () => {
    const termo = busca.trim();
    if (!termo) return;
    try {
      const r = (await api.get<ItemSummary[]>(`/api/v1/items?search=${encodeURIComponent(termo)}`)).data.filter((i) => i.status === 'ATIVO');
      setItens(r);
      if (r.length === 1) {
        setItemId(r[0].id);
        setDescricao(r[0].description);
        if (!preco.trim() && r[0].referenceCost) setPreco(custo(r[0].referenceCost));
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
    if (tipo === 'SUBASSEMBLY' && !subBom) return setErro('Escolha a submontagem.');
    setEnviando(true);
    const base = linha && linha.kind === tipo ? linhaParaApi(linha) : ({ kind: tipo } as BomLineRequest);
    const nova: BomLineRequest = tipo === 'ITEM'
      ? {
        ...base, kind: 'ITEM', itemId, childBomId: null, description: descricao.trim() || null,
        uom: linha?.kind === 'ITEM' && linha.itemId === itemId ? linha.uom : null,
        referenceCode: linha?.kind === 'ITEM' && linha.itemId === itemId ? linha.referenceCode : null,
        quantity: decimalParaApi(qtd), unitCost: decimalParaApi(preco.replace(/R\$\s?/, '')), category: categoria.trim() || null,
        supplier: fornecedor.trim() || null, material: material.trim() || null, notes: obs.trim() || null,
      }
      : {
        ...base, kind: 'SUBASSEMBLY', itemId: null, childBomId: subBom, unitCost: null, quantity: decimalParaApi(qtd),
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
      {linha ? `Linha ${linha.position} da BOM ${bom.name}.` : `Nova linha na BOM ${bom.name}.`} A quantidade e o custo vazios ficam como pendência e impedem aplicar a BOM ao equipamento.
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
                <Selecao id={fid('item')} valor={itemId}
                  onChange={(v) => {
                    const it = itens.find((i) => i.id === v);
                    setItemId(v);
                    setDescricao(it?.description ?? '');
                    if (!preco.trim() && it?.referenceCost) setPreco(custo(it.referenceCost));
                  }}
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
              opcoes={[{ valor: '', rotulo: 'Escolha a submontagem' }, ...boms.map((b) => ({ valor: b.id, rotulo: `${b.code} — ${b.name} — ${reais(b.totalCents)}` })),
                ...(linha?.childBomId && !boms.some((b) => b.id === linha.childBomId) ? [{ valor: linha.childBomId, rotulo: `${linha.childBomCode} — ${linha.childBomName}` }] : [])]} />
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

/** Total informado da origem e observações da BOM. */
function DialogoDados({ idBase, bom, onConfirmar, onCancelar }: {
  idBase: string;
  bom: Bom;
  onConfirmar: (informado: string | null, notas: string | null) => Promise<void>;
  onCancelar: () => void;
}) {
  const [informado, setInformado] = useState(centavos(bom.informedTotalCents));
  const [obs, setObs] = useState(bom.notes ?? '');
  const confirmar = () => void onConfirmar(centavosParaApi(informado), obs.trim() || null);
  return (
    <Dialog icon="info" label="Dados da BOM" onEscape={onCancelar}
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
