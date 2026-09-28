import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { BusinessDocument, DocumentLineKind, DocumentLink, HistoryEntry, OperationNature, TitleInvoicing } from '../api/types';
import { centavos, centavosParaApi, competenciaDaApi, competenciaParaApi, dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import type { StatusMessage } from '../shell/StatusBar';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave, useClientes } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { FATURAMENTO_ALTERADO } from './comum/Faturamento';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { DOCUMENTOS_ALTERADOS, numeroDaNota, seloDocumento } from './DocumentsWindow';
import { TITULOS_ALTERADOS } from './ReceivablesWindow';

type Tab = 'linhas' | 'vinculos' | 'classificacao' | 'historico';
type Linha = { description: string; kind: DocumentLineKind | ''; amount: string };
type Form = { customerId: string; series: string; number: string; issueDate: string; competence: string; notes: string; lines: Linha[] };

export const NATUREZA: Record<OperationNature, string> = {
  VENDA_PRODUCAO: 'Venda de produção própria',
  VENDA_MERCADORIA: 'Venda de mercadoria',
  PRESTACAO_SERVICO: 'Prestação de serviço',
  REMESSA: 'Remessa',
};

const TIPO: Record<DocumentLineKind, string> = { PRODUTO: 'Produto', SERVICO: 'Serviço' };

const vazio = (): Form => {
  const hoje = hojeIso();
  return { customerId: '', series: '1', number: '', issueDate: dataDaApi(hoje), competence: competenciaDaApi(hoje), notes: '', lines: [] };
};

const toForm = (d: BusinessDocument): Form => ({
  customerId: d.customerId,
  series: d.series,
  number: d.number,
  issueDate: dataDaApi(d.issueDate),
  competence: competenciaDaApi(d.competence),
  notes: d.notes ?? '',
  lines: d.lines.map((l) => ({ description: l.description, kind: l.kind, amount: centavos(l.amountCents) })),
});

const toRequest = (f: Form) => ({
  direction: 'SAIDA',
  customerId: f.customerId || null,
  series: f.series.trim(),
  number: f.number.trim(),
  issueDate: dataParaApi(f.issueDate),
  competence: competenciaParaApi(f.competence),
  lines: f.lines.map((l) => ({ description: l.description.trim(), kind: l.kind || null, amountCents: centavosParaApi(l.amount) })),
  notes: f.notes.trim() || null,
});

const somaLinhas = (ls: Linha[]) => ls.reduce((t, l) => {
  const c = centavosParaApi(l.amount);
  return t + (c && /^\d+$/.test(c) ? BigInt(c) : 0n);
}, 0n);

const seta = (rotulo: string, fn: () => void) => (
  <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
);

/** Avisa as outras janelas: listas de documentos, parcelas e o faturado dos pedidos, projetos e títulos. */
const avisar = () => {
  window.dispatchEvent(new Event(DOCUMENTOS_ALTERADOS));
  window.dispatchEvent(new Event(FATURAMENTO_ALTERADO));
  window.dispatchEvent(new Event(TITULOS_ALTERADOS));
};

/**
 * Ficha do documento de faturamento (formulário "documentos"): a nota emitida fora do Renda+ — cliente, série, número,
 * emissão e competência (sugerida pelo mês da emissão) — com as abas Linhas, Vínculos (as parcelas que a nota fatura,
 * com Desfazer), Classificação e Histórico. A nota não cria cobrança: "Vincular parcelas" reparte o valor dela entre
 * as parcelas do cliente, sem passar do que falta faturar em cada uma (PD-023).
 */
export function DocumentWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [doc, setDoc] = useState<BusinessDocument | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(vazio);
  const [tab, setTab] = useState<Tab>('linhas');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [desfazer, setDesfazer] = useState<DocumentLink | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const clientes = useClientes();
  const chave = useRef(novaChave());
  // A competência acompanha a emissão até o usuário mudá-la.
  const competenciaManual = useRef(false);

  const adicao = doc === null;
  const somenteLeitura = !adicao || !can('document.register');
  const ativo = doc?.status === 'ATIVO';
  const original = useMemo(() => (doc ? toForm(doc) : vazio()), [doc]);
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original), [form, original, somenteLeitura]);
  const total = adicao ? somaLinhas(form.lines) : BigInt(doc.totalCents);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((d: BusinessDocument, etagLido?: string) => {
    setDoc(d);
    setId(d.id);
    setEtag(etagLido ?? `"${d.version}"`);
    setForm(toForm(d));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(
    async (did: string) => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const r = await api.get<BusinessDocument>(`/api/v1/documents/${did}`);
        aplicar(r.data, r.etag);
      } catch (e) {
        const x = e as ApiError;
        setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
        winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      } finally {
        setCarregando(false);
      }
    },
    [aplicar],
  );

  useEffect(() => {
    if (id) void carregar(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'historico' || !id || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/documents/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const campos = tratarFalha(e, { objeto: 'O documento', notify: winRef.current.notify, setErros, setConflito });
    if (campos && Object.keys(campos).some((c) => c.startsWith('lines'))) setTab('linhas');
  }, []);

  /** Registra a nota; a mesma chave vai de novo se a rede cair antes da resposta, para não registrar duas vezes. */
  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const r = await api.post<BusinessDocument>('/api/v1/documents', toRequest(formRef.current), { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      aplicar(r.data, r.etag);
      setTab('vinculos');
      winRef.current.notify({ tone: 'sucesso', text: `Documento ${r.data.code} (nota nº ${r.data.number}) adicionado com sucesso` });
      avisar();
      return true;
    } catch (e) {
      if (!(e as ApiError).isNetwork) chave.current = novaChave();
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [falha, aplicar]);

  const acao = async (fn: () => Promise<{ data: BusinessDocument; etag?: string }>, texto: (d: BusinessDocument) => string) => {
    try {
      const r = await fn();
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: texto(r.data) });
      avisar();
    } catch (e) {
      falha(e);
    }
  };

  const cancelarDocumento = (motivo: string) => {
    setCancelar(false);
    void acao(() => api.post<BusinessDocument>(`/api/v1/documents/${doc!.id}/cancellations`, { reason: motivo }, { 'If-Match': etag }),
      (d) => `Documento ${d.code} (nota nº ${d.number}) cancelado com sucesso; os vínculos foram desfeitos`);
  };

  const desfazerVinculo = (l: DocumentLink, motivo: string) => {
    setDesfazer(null);
    void acao(() => api.post<BusinessDocument>(`/api/v1/documents/${doc!.id}/links/${l.id}/removals`, { reason: motivo }, { 'If-Match': etag }),
      (d) => `Vínculo com a parcela ${l.titleCode} desfeito com sucesso: ${reais(l.amountCents)} voltaram ao a faturar; restam ${reais(d.unlinkedCents)} sem vínculo na nota`);
  };

  const podeGravar = adicao && alterado && !gravando && !somenteLeitura;
  const podeVincular = !!doc && ativo && BigInt(doc.unlinkedCents) > 0n && can('document.link');
  const podeCancelar = !!doc && ativo && can('document.cancel');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setEmissao = (v: string) => {
    const iso = dataParaApi(v);
    setForm((f) => ({ ...f, issueDate: v, competence: !competenciaManual.current && iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? competenciaDaApi(iso) : f.competence }));
  };
  const setLinha = (i: number, patch: Partial<Linha>) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLinha = () => setForm((f) => ({ ...f, lines: [...f.lines, { description: '', kind: 'PRODUTO', amount: '' }] }));
  const remLinha = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || vinculando || desfazer || cancelar) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { l: 'linhas', v: 'vinculos', a: 'classificacao', h: 'historico' };
      if (alvo[k] && (alvo[k] === 'linhas' || id)) setTab(alvo[k]);
      else if (k === 'p' && podeVincular) setVinculando(true);
      else if (k === 'c' && podeCancelar) setCancelar(true);
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const teclasLinhas = (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') return addLinha();
    const tr = (e.target as HTMLElement).closest('tr');
    const i = tr ? Array.from(tr.parentElement?.children ?? []).indexOf(tr) : -1;
    if (i >= 0 && i < form.lines.length) remLinha(i);
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  const emAdicao = adicao && !somenteLeitura;
  const opcoesClientes = clientes.filter((c) => c.status === 'ATIVO' || c.id === form.customerId).map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.legalName}` }));
  if (doc && !opcoesClientes.some((o) => o.valor === doc.customerId)) opcoesClientes.unshift({ valor: doc.customerId, rotulo: `${doc.customerCode} — ${doc.customerName}` });
  const erroLinhas = Object.entries(erros).filter(([k]) => k.startsWith('lines')).map(([k, v]) => {
    const m = /\[(\d+)\]/.exec(k);
    return m ? `Linha ${Number(m[1]) + 1}: ${v}` : v;
  });
  const ativos = doc?.links.filter((l) => l.status === 'ATIVO') ?? [];

  const tabs: [Tab, ReactNode, boolean][] = [
    ['linhas', <span><u>L</u>inhas ({form.lines.length})</span>, true],
    ['vinculos', <span><u>V</u>ínculos ({ativos.length})</span>, id !== null],
    ['classificacao', <span>Cl<u>a</u>ssificação</span>, id !== null],
    ['historico', <span><u>H</u>istórico</span>, id !== null],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className={`rp-form rp-form--req rp-ficha__principal${emAdicao ? ' rp-form--adicao' : ''}`}>
                <span className="rp-label">Documento</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly value={doc?.code ?? 'Gerado ao adicionar'} aria-label="Documento" />
                <label className="rp-label" htmlFor={fid('cliente')}>Cliente</label>
                <span className="rp-req" aria-hidden="true">*</span>
                {doc ? (
                  <span className="rp-ficha__ref">
                    {seta(`Abrir cliente ${doc.customerCode}`, () => win.open('customer', doc.customerId))}
                    <input id={fid('cliente')} className="rp-field rp-field--readonly" readOnly value={`${doc.customerCode} — ${doc.customerName}`} />
                  </span>
                ) : (
                  <Selecao id={fid('cliente')} className={classeCampo} valor={form.customerId} disabled={somenteLeitura} aria-invalid={!!erros.customerId}
                    onChange={(v) => set({ customerId: v })} opcoes={[{ valor: '', rotulo: 'Escolha o cliente' }, ...opcoesClientes]} />
                )}
                {erroDe('customerId')}
                <label className="rp-label" htmlFor={fid('numero')}>Nº da nota</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <span className="rp-ficha__ref">
                  <input id={fid('numero')} className={`${classeCampo} rp-field--curto`} value={form.number} maxLength={20} inputMode="numeric" readOnly={somenteLeitura}
                    aria-invalid={!!erros.number} onChange={(e) => set({ number: e.target.value })} />
                  <label className="rp-label" htmlFor={fid('serie')}>Série</label>
                  <input id={fid('serie')} className={`${classeCampo} rp-field--curto`} value={form.series} maxLength={10} readOnly={somenteLeitura}
                    aria-invalid={!!erros.series} onChange={(e) => set({ series: e.target.value })} />
                </span>
                {erroDe('number')}
                {erroDe('series')}
                <label className="rp-label" htmlFor={fid('emissao')}>Emissão</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <CampoData id={fid('emissao')} rotulo="Emissão" className={`${classeCampo} rp-field--curto`} valor={form.issueDate} somenteLeitura={somenteLeitura}
                  invalido={!!erros.issueDate} onChange={setEmissao} />
                {erroDe('issueDate')}
                <label className="rp-label" htmlFor={fid('competencia')}>Competência</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('competencia')} className={`${classeCampo} rp-field--curto`} value={form.competence} maxLength={7} placeholder="MM/AAAA" readOnly={somenteLeitura}
                  aria-invalid={!!erros.competence} onChange={(e) => {
                    competenciaManual.current = true;
                    set({ competence: e.target.value });
                  }} />
                {erroDe('competence')}
                <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                <span />
                <input id={fid('obs')} className={classeCampo} value={form.notes} maxLength={500} readOnly={somenteLeitura} onChange={(e) => set({ notes: e.target.value })} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {doc ? seloDocumento(doc.status) : <span className="rp-badge">Novo</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Total da nota</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total da nota" value={reais(total.toString())} />
                <span className="rp-label">Vinculado</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Vinculado" value={reais(doc?.linkedCents ?? '0')} />
                <span className="rp-label">Sem vínculo</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Sem vínculo" value={reais(doc?.unlinkedCents ?? total.toString())} />
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={doc?.version ?? ''} aria-label="Versão" />
                {doc?.status === 'CANCELADO' && (
                  <>
                    <span className="rp-label">Motivo</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do cancelamento" value={doc.cancelReason ?? ''} />
                  </>
                )}
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, disponivel]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={disponivel ? 0 : -1} aria-selected={tab === t} aria-disabled={!disponivel || undefined}
                  title={disponivel ? undefined : 'Disponível depois de adicionar o documento'}
                  onClick={() => disponivel && setTab(t)} onKeyDown={(e) => e.key === 'Enter' && disponivel && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'linhas' ? (
                <div className="rp-tabela">
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className={`rp-grid rp-grid--edicao${emAdicao ? ' rp-form--adicao' : ''}`} aria-label="Linhas da nota" onKeyDown={teclasLinhas}>
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th>Descrição</th>
                          <th className="rp-linhas__tipo">Tipo</th>
                          <th className="num rp-linhas__valor">Valor</th>
                          <th className="rp-ficha__col-x" aria-label="Remover" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="rownum">{i + 1}</td>
                            <td>
                              <input className="rp-field" value={l.description} maxLength={200} readOnly={somenteLeitura} aria-label={`Descrição da linha ${i + 1}`}
                                aria-invalid={!!erros[`lines[${i}].description`]} onChange={(e) => setLinha(i, { description: e.target.value })} />
                            </td>
                            <td>
                              {somenteLeitura ? (
                                <input className="rp-field rp-field--readonly" readOnly aria-label={`Tipo da linha ${i + 1}`} value={l.kind ? TIPO[l.kind] : ''} />
                              ) : (
                                <Selecao className="rp-field" valor={l.kind} aria-label={`Tipo da linha ${i + 1}`} aria-invalid={!!erros[`lines[${i}].kind`]}
                                  onChange={(v) => setLinha(i, { kind: v as DocumentLineKind })} opcoes={[{ valor: 'PRODUTO', rotulo: 'Produto' }, { valor: 'SERVICO', rotulo: 'Serviço' }]} />
                              )}
                            </td>
                            <td>
                              <input className="rp-field rp-field--num" value={l.amount} maxLength={20} inputMode="decimal" readOnly={somenteLeitura}
                                aria-label={`Valor da linha ${i + 1}`} aria-invalid={!!erros[`lines[${i}].amountCents`]}
                                onChange={(e) => setLinha(i, { amount: e.target.value })}
                                onBlur={() => {
                                  const c = centavosParaApi(l.amount);
                                  if (c && /^\d+$/.test(c)) setLinha(i, { amount: centavos(c) });
                                }} />
                            </td>
                            <td className="rp-linha-x" role={somenteLeitura ? undefined : 'button'} tabIndex={somenteLeitura ? -1 : 0} title="Remover linha"
                              aria-label={`Remover linha ${i + 1}`} onClick={() => !somenteLeitura && remLinha(i)} onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remLinha(i)}>
                              {somenteLeitura ? '' : '×'}
                            </td>
                          </tr>
                        ))}
                        {!somenteLeitura && (
                          <tr className="nova">
                            <td className="rownum">{form.lines.length + 1}</td>
                            <td colSpan={4} role="button" tabIndex={0} onClick={addLinha} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addLinha())}>
                              Clique para adicionar uma linha…
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}>Total da nota</td>
                          <td className="num" aria-label="Soma das linhas">{reais(total.toString())}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {erroLinhas.map((m) => (
                    <p key={m} className="rp-campo-erro rp-ficha__erro">
                      <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
                    </p>
                  ))}
                </div>
              ) : tab === 'vinculos' && doc ? (
                <Vinculos doc={doc} podeDesfazer={ativo && can('document.link')} abrir={(t) => win.open('receivable', t)} onDesfazer={setDesfazer} />
              ) : tab === 'classificacao' && doc ? (
                <Classificacao doc={doc} etag={etag} idBase={fid('cl')} podeClassificar={ativo && can('document.classify')}
                  onClassificado={(d, e) => {
                    aplicar(d, e);
                    winRef.current.notify({ tone: 'sucesso', text: `Documento ${d.code} classificado com sucesso (revisão ${d.classificationRevision})` });
                    avisar();
                  }} falha={falha} />
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do documento" />
              )}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {adicao && !somenteLeitura && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              Adicionar
            </button>
          )}
          <button type="button" className={`rp-btn${adicao && !somenteLeitura ? '' : ' rp-btn--default'}`} onClick={win.requestClose}>
            {adicao && !somenteLeitura ? 'Cancelar' : 'OK'}
          </button>
        </div>
        <div className="rp-btn-row">
          {podeVincular && (
            <button type="button" className="rp-btn" onClick={() => setVinculando(true)}>
              <span>Vincular <u>p</u>arcelas</span>
            </button>
          )}
          {podeCancelar && (
            <button type="button" className="rp-btn" onClick={() => setCancelar(true)}>
              <span><u>C</u>ancelar documento</span>
            </button>
          )}
        </div>
      </div>

      {vinculando && doc && (
        <DialogoVincular doc={doc} etag={etag} idBase={fid('vin')} notify={win.notify} onCancelar={() => setVinculando(false)}
          onConflito={() => {
            setVinculando(false);
            setConflito('?');
          }}
          onVinculado={(d, e) => {
            setVinculando(false);
            aplicar(d, e);
            setTab('vinculos');
            win.notify({ tone: 'sucesso', text: `Nota nº ${d.number} vinculada com sucesso: ${reais(d.linkedCents)} faturados nas parcelas; restam ${reais(d.unlinkedCents)} sem vínculo` });
            avisar();
          }} />
      )}

      {desfazer && doc && (
        <DialogoMotivo rotulo="Desfazer vínculo" idCampo={fid('motivo-desfazer')} botao="Desfazer" voltar="Voltar" falta="Informe o motivo para desfazer o vínculo."
          texto={`O vínculo de ${reais(desfazer.amountCents)} com a parcela ${desfazer.titleCode} será desfeito: o valor volta ao a faturar da parcela e fica sem vínculo na nota. O registro continua no histórico.`}
          onCancelar={() => setDesfazer(null)} onConfirmar={(m) => desfazerVinculo(desfazer, m)} />
      )}

      {cancelar && doc && (
        <DialogoMotivo rotulo="Cancelar documento" idCampo={fid('motivo-cancelar')} botao="Cancelar documento" voltar="Voltar" falta="Informe o motivo do cancelamento."
          texto={`O documento ${doc.code} (nota nº ${doc.number}) fica cancelado e os ${ativos.length} vínculo(s) são desfeitos: ${reais(doc.linkedCents)} voltam ao a faturar das parcelas. Recebimentos não mudam.`}
          onCancelar={() => setCancelar(false)} onConfirmar={cancelarDocumento} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Documento alterado por outra pessoa" objeto="O documento" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** Aba Vínculos: as parcelas que a nota fatura, com a seta para o título e Desfazer nos ativos. */
function Vinculos({ doc, podeDesfazer, abrir, onDesfazer }: {
  doc: BusinessDocument;
  podeDesfazer: boolean;
  abrir: (titleId: string) => void;
  onDesfazer: (l: DocumentLink) => void;
}) {
  return (
    <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
      <table className="rp-grid rp-janela-mdi__grade" aria-label="Vínculos da nota com as parcelas">
        <thead>
          <tr>
            <th className="rownum">#</th>
            <th aria-label="Abrir" />
            <th>Parcela</th>
            <th>Descrição</th>
            <th className="num">Valor vinculado</th>
            <th>Situação</th>
            <th>Vinculado em</th>
            <th>Desfeito</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {doc.links.map((l, i) => (
            <tr key={l.id}>
              <td className="rownum">{i + 1}</td>
              <td>{seta(`Abrir parcela ${l.titleCode}`, () => abrir(l.titleId))}</td>
              <td>{l.titleCode}</td>
              <td>{l.titleLabel}</td>
              <td className="num">{reais(l.amountCents)}</td>
              <td>
                <span className={`rp-badge ${l.status === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{l.status === 'ATIVO' ? 'Ativo' : 'Desfeito'}</span>
              </td>
              <td>{`${dataHora(l.createdAt)} por ${l.createdBy}`}</td>
              <td>{l.status === 'DESFEITO' ? `${dataHora(l.removedAt)} por ${l.removedBy}: ${l.removedReason}` : ''}</td>
              <td>
                {l.status === 'ATIVO' && podeDesfazer && (
                  <button type="button" className="rp-btn" aria-label={`Desfazer vínculo com a parcela ${l.titleCode}`} onClick={() => onDesfazer(l)}>
                    Desfazer
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Vinculado</td>
            <td className="num">{reais(doc.linkedCents)}</td>
            <td colSpan={4}>Sem vínculo: {reais(doc.unlinkedCents)}</td>
          </tr>
        </tfoot>
      </table>
      {doc.links.length === 0 && (
        <p className="rp-jlista__vazio">
          Nenhuma parcela vinculada. {doc.status === 'ATIVO' ? 'Use Vincular parcelas para dizer quais parcelas do pedido esta nota fatura.' : ''}
        </p>
      )}
    </div>
  );
}

/** Aba Classificação: natureza da operação e projeto (de uma parcela vinculada); nunca deduzida da descrição. */
function Classificacao({ doc, etag, idBase, podeClassificar, onClassificado, falha }: {
  doc: BusinessDocument;
  etag: string;
  idBase: string;
  podeClassificar: boolean;
  onClassificado: (d: BusinessDocument, etag?: string) => void;
  falha: (e: unknown) => void;
}) {
  const [natureza, setNatureza] = useState<string>(doc.operationNature ?? '');
  const [projeto, setProjeto] = useState<string>(doc.projectId ?? '');
  const [projetos, setProjetos] = useState<{ valor: string; rotulo: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const titulos = doc.links.filter((l) => l.status === 'ATIVO').map((l) => l.titleId);
  const chaveTitulos = titulos.join(',');

  useEffect(() => {
    if (!chaveTitulos) {
      setProjetos([]);
      return;
    }
    const q = chaveTitulos.split(',').map((t) => `titleId=${t}`).join('&');
    api
      .get<TitleInvoicing[]>(`/api/v1/invoicing?${q}`)
      .then((r) => {
        const vistos = new Map<string, string>();
        r.data.forEach((f) => f.projectId && !vistos.has(f.projectId) && vistos.set(f.projectId, `Projeto do ${f.label.split(' — ')[0].replace(/^Pedido/, 'pedido')}`));
        if (doc.projectId && doc.projectCode) vistos.set(doc.projectId, doc.projectCode);
        setProjetos(Array.from(vistos, ([valor, rotulo]) => ({ valor, rotulo })));
      })
      .catch(() => setProjetos([]));
  }, [chaveTitulos, doc.projectId, doc.projectCode]);

  const tipos = Array.from(new Set(doc.lines.map((l) => TIPO[l.kind]))).join(', ');
  const classificar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await api.put<BusinessDocument>(`/api/v1/documents/${doc.id}/classification`, { operationNature: natureza || null, projectId: projeto || null }, etag);
      onClassificado(r.data, r.etag);
    } catch (e) {
      falha(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rp-form rp-janela-mdi__form">
      <label className="rp-label" htmlFor={`${idBase}-natureza`}>Natureza da operação</label>
      <span />
      <Selecao id={`${idBase}-natureza`} className={`rp-field${podeClassificar ? '' : ' rp-field--readonly'}`} valor={natureza} disabled={!podeClassificar}
        onChange={setNatureza} opcoes={[{ valor: '', rotulo: 'Escolha a natureza' }, ...Object.entries(NATUREZA).map(([valor, rotulo]) => ({ valor, rotulo }))]} />
      <label className="rp-label" htmlFor={`${idBase}-projeto`}>Projeto</label>
      <span />
      <Selecao id={`${idBase}-projeto`} className={`rp-field${podeClassificar ? '' : ' rp-field--readonly'}`} valor={projeto} disabled={!podeClassificar}
        onChange={setProjeto} opcoes={[{ valor: '', rotulo: titulos.length ? 'Sem projeto' : 'Vincule parcelas para escolher o projeto' }, ...projetos]} />
      <span className="rp-label">Tipos das linhas</span>
      <span />
      <input className="rp-field rp-field--readonly" readOnly aria-label="Tipos das linhas" value={tipos} />
      <span className="rp-label">Revisão</span>
      <span />
      <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Revisão da classificação"
        value={doc.classificationRevision === 0 ? 'Não classificado' : String(doc.classificationRevision)} />
      {podeClassificar && (
        <>
          <span />
          <span />
          <span>
            <button type="button" className="rp-btn" disabled={!natureza || enviando} onClick={() => void classificar()}>
              <span>Cla<u>s</u>sificar</span>
            </button>
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Caixa "Vincular parcelas": as parcelas do cliente com o que falta faturar; o valor sem vínculo da nota já vem
 * repartido pela ordem de vencimento, e o usuário ajusta. A chave só muda depois de o servidor responder.
 */
function DialogoVincular({ doc, etag, idBase, notify, onCancelar, onVinculado, onConflito }: {
  doc: BusinessDocument;
  etag: string;
  idBase: string;
  notify: (m: StatusMessage) => void;
  onCancelar: () => void;
  onVinculado: (d: BusinessDocument, etag?: string) => void;
  onConflito: () => void;
}) {
  const [parcelas, setParcelas] = useState<TitleInvoicing[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const chave = useRef(novaChave());

  useEffect(() => {
    const ja = new Set(doc.links.filter((l) => l.status === 'ATIVO').map((l) => l.titleId));
    api
      .get<TitleInvoicing[]>(`/api/v1/invoicing?customerId=${doc.customerId}`)
      .then((r) => {
        const livres = r.data.filter((p) => !ja.has(p.titleId) && p.titleStatus !== 'CANCELLED' && BigInt(p.toInvoiceCents) > 0n);
        // Sugestão: o que está sem vínculo na nota, pela ordem de vencimento, até o a faturar de cada parcela.
        let resta = BigInt(doc.unlinkedCents);
        const sugestao: Record<string, string> = {};
        livres.forEach((p) => {
          const v = resta < BigInt(p.toInvoiceCents) ? resta : BigInt(p.toInvoiceCents);
          sugestao[p.titleId] = v > 0n ? centavos(v.toString()) : '';
          resta -= v;
        });
        setParcelas(livres);
        setValores(sugestao);
      })
      .catch((e: ApiError) => notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [doc, notify]);

  const escolhidas = (parcelas ?? []).filter((p) => {
    const c = centavosParaApi(valores[p.titleId] ?? '');
    return !!c && c !== '0' && !/^0+$/.test(c);
  });
  const soma = escolhidas.reduce((t, p) => {
    const c = centavosParaApi(valores[p.titleId] ?? '') ?? '';
    return t + (/^\d+$/.test(c) ? BigInt(c) : 0n);
  }, 0n);

  const confirmar = async () => {
    if (enviando) return;
    const falta: Record<string, string> = {};
    escolhidas.forEach((p) => {
      if (!/^\d+$/.test(centavosParaApi(valores[p.titleId] ?? '') ?? '')) falta[p.titleId] = 'Valor inválido.';
    });
    if (escolhidas.length === 0) falta.geral = 'Informe o valor de ao menos uma parcela.';
    if (Object.keys(falta).length > 0) return setErros(falta);
    setEnviando(true);
    try {
      const r = await api.post<BusinessDocument>(`/api/v1/documents/${doc.id}/links`,
        { links: escolhidas.map((p) => ({ titleId: p.titleId, amountCents: centavosParaApi(valores[p.titleId]) })) },
        { 'If-Match': etag, 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      onVinculado(r.data, r.etag);
    } catch (e) {
      const x = e as ApiError;
      if (x.isNetwork) {
        notify({ tone: 'aviso', text: `Sem conexão com o servidor; confirme de novo para reenviar os mesmos vínculos (${x.code})` });
      } else if (x.isConflict) {
        onConflito();
      } else {
        // O servidor respondeu e nada foi gravado: a próxima tentativa é outro comando.
        chave.current = novaChave();
        const m: Record<string, string> = {};
        x.details.forEach((d) => {
          const i = /^links\[(\d+)\]/.exec(d.field ?? '');
          if (i && escolhidas[Number(i[1])]) m[escolhidas[Number(i[1])].titleId] = d.message;
          else m.geral = d.message;
        });
        setErros(Object.keys(m).length > 0 ? m : { geral: x.message });
        notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog
      icon="info"
      label="Vincular parcelas"
      larga
      onEscape={onCancelar}
      buttons={[
        { label: 'Vincular', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}
    >
      {numeroDaNota(doc)} — {reais(doc.unlinkedCents)} sem vínculo. O vínculo não pode passar do que falta faturar na parcela; a nota
      não cria cobrança nem muda o saldo a receber.
      <div className="rp-grid-rolagem rp-rolagem rp-vincular">
        <table className="rp-grid rp-grid--edicao" aria-label="Parcelas do cliente">
          <thead>
            <tr>
              <th>Parcela</th>
              <th>Descrição</th>
              <th>Vencimento</th>
              <th className="num">Valor</th>
              <th className="num">Faturado</th>
              <th className="num">A faturar</th>
              <th className="num rp-linhas__valor">Vincular</th>
            </tr>
          </thead>
          <tbody>
            {(parcelas ?? []).map((p) => (
              <tr key={p.titleId}>
                <td>{p.titleCode}</td>
                <td>{p.label}</td>
                <td>{dataDaApi(p.dueDate)}</td>
                <td className="num">{reais(p.originalCents)}</td>
                <td className="num">{reais(p.invoicedCents)}</td>
                <td className="num">{reais(p.toInvoiceCents)}</td>
                <td>
                  <input id={`${idBase}-${p.titleCode}`} className="rp-field rp-field--num" value={valores[p.titleId] ?? ''} maxLength={20} inputMode="decimal"
                    aria-label={`Vincular à parcela ${p.titleCode}`} aria-invalid={!!erros[p.titleId]}
                    onChange={(e) => {
                      setValores((v) => ({ ...v, [p.titleId]: e.target.value }));
                      setErros({});
                    }}
                    onBlur={() => {
                      const c = centavosParaApi(valores[p.titleId] ?? '');
                      if (c && /^\d+$/.test(c)) setValores((v) => ({ ...v, [p.titleId]: centavos(c) }));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Soma dos vínculos</td>
              <td className="num" aria-label="Soma dos vínculos">{reais(soma.toString())}</td>
            </tr>
          </tfoot>
        </table>
        {parcelas?.length === 0 && <p className="rp-jlista__vazio">O cliente não tem parcelas com valor a faturar.</p>}
      </div>
      {Object.entries(erros).map(([k, v]) => (
        <span key={k} className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {k === 'geral' ? v : `${parcelas?.find((p) => p.titleId === k)?.titleCode}: ${v}`}
        </span>
      ))}
    </Dialog>
  );
}
