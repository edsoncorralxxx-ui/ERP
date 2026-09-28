import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { HistoryEntry, SalesOrder } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataHora, dataParaApi, dividirEmParcelas, hojeIso, reais, somarMeses } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave, useClientes, useItens, useUnidades } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { GradeLinhas, linhaDaApi, linhaParaApi, totalDasLinhas, type LinhaForm } from './comum/GradeLinhas';
import { Selecao } from './comum/Selecao';
import { ESTAGIO, seloEquipamento, seloPedido, seloTitulo } from './comum/Selos';
import { PEDIDOS_ALTERADOS } from './SalesOrdersWindow';

type Tab = 'linhas' | 'parcelas' | 'gerado' | 'historico';
type Parcela = { dueDate: string; amount: string; milestone: string };
type Form = { customerId: string; unitId: string; contractDate: string; promisedDate: string; notes: string; lines: LinhaForm[]; installments: Parcela[] };

const vazio = (): Form => ({ customerId: '', unitId: '', contractDate: dataDaApi(hojeIso()), promisedDate: '', notes: '', lines: [], installments: [] });

const toForm = (o: SalesOrder): Form => ({
  customerId: o.customerId,
  unitId: o.unitId,
  contractDate: dataDaApi(o.contractDate),
  promisedDate: dataDaApi(o.promisedDate),
  notes: o.notes ?? '',
  lines: o.lines.map(linhaDaApi),
  installments: o.installments.map((i) => ({ dueDate: dataDaApi(i.dueDate), amount: centavos(i.amountCents), milestone: i.milestone ?? '' })),
});

const toRequest = (f: Form) => ({
  customerId: f.customerId || null,
  unitId: f.unitId || null,
  contractDate: dataParaApi(f.contractDate),
  promisedDate: dataParaApi(f.promisedDate),
  notes: f.notes.trim() || null,
  lines: f.lines.map(linhaParaApi),
  installments: f.installments.map((p) => ({ dueDate: dataParaApi(p.dueDate), amountCents: centavosParaApi(p.amount), milestone: p.milestone.trim() || null })),
});

/** Soma das parcelas digitadas em centavos (as inválidas ficam de fora; o servidor aponta o erro). */
const somaParcelas = (ps: Parcela[]) => ps.reduce((t, p) => {
  const c = centavosParaApi(p.amount);
  return t + (c && /^\d+$/.test(c) ? BigInt(c) : 0n);
}, 0n);

/**
 * Ficha do pedido (formulário "pedidos"): cabeçalho com número, cliente, unidade, proposta de origem, contratação e
 * prazo; abas Linhas, Parcelas (com a soma conferida contra o total), Projeto e títulos (o que a confirmação gerou) e
 * Histórico. Em rascunho tudo muda; "Confirmar pedido" cria projeto, equipamentos e parcelas a receber uma única vez.
 */
export function SalesOrderWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [pedido, setPedido] = useState<SalesOrder | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(vazio);
  const [tab, setTab] = useState<Tab>('linhas');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const clientes = useClientes();
  const unidades = useUnidades(form.customerId);
  const itens = useItens();
  const chave = useRef(novaChave());
  const chaveConfirmacao = useRef(novaChave());

  const adicao = pedido === null;
  const rascunho = !pedido || pedido.status === 'DRAFT';
  const somenteLeitura = adicao ? !can('sales_order.create') : !can('sales_order.update') || !rascunho;
  const original = useMemo(() => (pedido ? toForm(pedido) : vazio()), [pedido]);
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original), [form, original, somenteLeitura]);
  const total = totalDasLinhas(form.lines);
  const parcelado = somaParcelas(form.installments);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((o: SalesOrder, etagLido?: string) => {
    setPedido(o);
    setId(o.id);
    setEtag(etagLido ?? `"${o.version}"`);
    setForm(toForm(o));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(
    async (oid: string) => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const r = await api.get<SalesOrder>(`/api/v1/sales-orders/${oid}`);
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
      .get<HistoryEntry[]>(`/api/v1/sales-orders/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const campos = tratarFalha(e, { objeto: 'O pedido', notify: winRef.current.notify, setErros, setConflito });
    if (!campos) return;
    const k = Object.keys(campos);
    if (k.some((c) => c.startsWith('installments'))) setTab('parcelas');
    else if (k.some((c) => c.startsWith('lines'))) setTab('linhas');
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = pedido
        ? await api.put<SalesOrder>(`/api/v1/sales-orders/${pedido.id}`, body, etag)
        : await api.post<SalesOrder>('/api/v1/sales-orders', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Pedido ${r.data.code} ${pedido ? 'atualizado' : 'adicionado'} com sucesso` });
      window.dispatchEvent(new Event(PEDIDOS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [pedido, etag, falha, aplicar]);

  /**
   * Confirma com a mesma chave até receber a resposta: se a rede cair depois de o servidor confirmar, repetir devolve a
   * mesma confirmação, sem gerar outro projeto nem outras parcelas.
   */
  const confirmarPedido = async () => {
    if (!pedido) return;
    setConfirmar(false);
    try {
      const r = await api.post<SalesOrder>(`/api/v1/sales-orders/${pedido.id}/confirmations`, undefined, { 'If-Match': etag, 'Idempotency-Key': chaveConfirmacao.current });
      aplicar(r.data, r.etag);
      chaveConfirmacao.current = novaChave();
      setTab('gerado');
      winRef.current.notify({
        tone: 'sucesso',
        text: `Pedido ${r.data.code} confirmado com sucesso: projeto ${r.data.projectCode}, ${r.data.equipment.length} equipamento(s) e ${r.data.titles.length} parcela(s) a receber`,
      });
      window.dispatchEvent(new Event(PEDIDOS_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  const cancelarPedido = async (motivo: string) => {
    if (!pedido) return;
    setCancelar(false);
    try {
      const r = await api.post<SalesOrder>(`/api/v1/sales-orders/${pedido.id}/cancellations`, { reason: motivo }, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: `Pedido ${r.data.code} cancelado com sucesso` });
      window.dispatchEvent(new Event(PEDIDOS_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  const podeConfirmar = !!pedido && rascunho && !alterado && can('sales_order.confirm');
  const podeCancelar = !!pedido && pedido.status !== 'CANCELLED' && pedido.status !== 'COMPLETED' && !alterado && can('sales_order.cancel');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setParcela = (i: number, patch: Partial<Parcela>) => setForm((f) => ({ ...f, installments: f.installments.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addParcela = () => setForm((f) => ({ ...f, installments: [...f.installments, { dueDate: '', amount: '', milestone: '' }] }));
  const remParcela = (i: number) => setForm((f) => ({ ...f, installments: f.installments.filter((_, j) => j !== i) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || confirmar || cancelar || dividir) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { l: 'linhas', p: 'parcelas', j: 'gerado', h: 'historico' };
      if (alvo[k] && (alvo[k] === 'linhas' || alvo[k] === 'parcelas' || id)) setTab(alvo[k]);
      else if (k === 'f' && podeConfirmar) setConfirmar(true);
      else if (k === 'c' && podeCancelar) setCancelar(true);
      else if (k === 'd' && !somenteLeitura && total > 0n) setDividir(true);
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

  const teclasParcelas = (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') return addParcela();
    const tr = (e.target as HTMLElement).closest('tr');
    const i = tr ? Array.from(tr.parentElement?.children ?? []).indexOf(tr) : -1;
    if (i >= 0 && i < form.installments.length) remParcela(i);
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
  if (pedido && !opcoesClientes.some((o) => o.valor === pedido.customerId)) opcoesClientes.unshift({ valor: pedido.customerId, rotulo: `${pedido.customerCode} — ${pedido.customerName}` });
  const opcoesUnidades = unidades.map((u) => ({ valor: u.id, rotulo: u.name }));
  if (pedido && !opcoesUnidades.some((o) => o.valor === pedido.unitId)) opcoesUnidades.push({ valor: pedido.unitId, rotulo: pedido.unitName });
  const erroParcelas = Object.entries(erros).filter(([k]) => k.startsWith('installments')).map(([k, v]) => {
    const m = /\[(\d+)\]/.exec(k);
    return m ? `Parcela ${Number(m[1]) + 1}: ${v}` : v;
  });
  const diferenca = total - parcelado;

  const tabs: [Tab, ReactNode, boolean][] = [
    ['linhas', <span><u>L</u>inhas ({form.lines.length})</span>, true],
    ['parcelas', <span><u>P</u>arcelas ({form.installments.length})</span>, true],
    ['gerado', <span>Pro<u>j</u>eto e títulos</span>, !!pedido?.projectId],
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
                <span className="rp-label">Nº</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly value={pedido?.code ?? 'Gerado ao adicionar'} aria-label="Número" />
                <label className="rp-label" htmlFor={fid('cliente')}>Cliente</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <Selecao id={fid('cliente')} className={classeCampo} valor={form.customerId} disabled={somenteLeitura || !!pedido?.proposalId} aria-invalid={!!erros.customerId}
                  onChange={(v) => set({ customerId: v, unitId: '' })} opcoes={[{ valor: '', rotulo: 'Escolha o cliente' }, ...opcoesClientes]} />
                {erroDe('customerId')}
                <label className="rp-label" htmlFor={fid('unidade')}>Unidade</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <Selecao id={fid('unidade')} className={classeCampo} valor={form.unitId} disabled={somenteLeitura || !form.customerId} aria-invalid={!!erros.unitId}
                  onChange={(v) => set({ unitId: v })} opcoes={[{ valor: '', rotulo: 'Escolha a unidade' }, ...opcoesUnidades]} />
                {erroDe('unitId')}
                <label className="rp-label" htmlFor={fid('contratacao')}>Contratação</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <CampoData id={fid('contratacao')} rotulo="Contratação" className={`${classeCampo} rp-field--curto`} valor={form.contractDate} somenteLeitura={somenteLeitura}
                  invalido={!!erros.contractDate} onChange={(v) => set({ contractDate: v })} />
                {erroDe('contractDate')}
                <label className="rp-label" htmlFor={fid('prazo')}>Prazo prometido</label>
                <span />
                <CampoData id={fid('prazo')} rotulo="Prazo prometido" className={`${classeCampo} rp-field--curto`} valor={form.promisedDate} somenteLeitura={somenteLeitura}
                  invalido={!!erros.promisedDate} onChange={(v) => set({ promisedDate: v })} />
                {erroDe('promisedDate')}
                <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                <span />
                <input id={fid('obs')} className={classeCampo} value={form.notes} maxLength={1000} readOnly={somenteLeitura} onChange={(e) => set({ notes: e.target.value })} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {pedido ? seloPedido(pedido.status) : <span className="rp-badge">Novo</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Proposta</span>
                <span className="rp-ficha__ref">
                  {pedido?.proposalId && (
                    <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir proposta ${pedido.proposalCode}`} title={`Abrir proposta ${pedido.proposalCode}`}
                      onClick={() => win.open('proposal', pedido.proposalId!)} onKeyDown={(e) => e.key === 'Enter' && win.open('proposal', pedido.proposalId!)} />
                  )}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Proposta" value={pedido?.proposalCode ? `${pedido.proposalCode} rev. ${pedido.proposalRevision}` : ''} />
                </span>
                <span className="rp-label">Total</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total do pedido" value={reais(total.toString())} />
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={pedido?.version ?? ''} aria-label="Versão" />
                {pedido?.status === 'CANCELLED' && (
                  <>
                    <span className="rp-label">Motivo</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do cancelamento" value={pedido.cancelReason ?? ''} />
                  </>
                )}
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, ativo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={ativo ? 0 : -1} aria-selected={tab === t} aria-disabled={!ativo || undefined}
                  title={ativo ? undefined : t === 'gerado' ? 'Disponível depois de confirmar o pedido' : 'Disponível depois de adicionar o pedido'}
                  onClick={() => ativo && setTab(t)} onKeyDown={(e) => e.key === 'Enter' && ativo && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'linhas' ? (
                <>
                  {pedido && !rascunho && (
                    <p className="rp-janela-mdi__aviso rp-ficha__nota">
                      <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Pedido {pedido.status === 'CANCELLED' ? 'cancelado' : 'confirmado'}: linhas, preços e parcelas não mudam
                      {pedido.status === 'CANCELLED' ? '.' : ' (mudança só por aditivo).'}
                    </p>
                  )}
                  <GradeLinhas linhas={form.lines} onChange={(lines) => set({ lines })} itens={itens} somenteLeitura={somenteLeitura} adicao={emAdicao}
                    erros={erros} rotulo="Linhas do pedido" />
                </>
              ) : tab === 'parcelas' ? (
                <div className="rp-tabela">
                  <div className="rp-tabela-acoes">
                    <span className="rp-tabela-tit">Parcelas a receber</span>
                    {!somenteLeitura && (
                      <button type="button" className="rp-btn" onClick={() => setDividir(true)} disabled={total <= 0n}>
                        <span><u>D</u>ividir o total</span>
                      </button>
                    )}
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className={`rp-grid rp-grid--edicao${emAdicao ? ' rp-form--adicao' : ''}`} aria-label="Parcelas do pedido" onKeyDown={teclasParcelas}>
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th className="rp-parcelas__data">Vencimento</th>
                          <th className="num rp-linhas__valor">Valor</th>
                          <th>Marco</th>
                          <th className="rp-ficha__col-x" aria-label="Remover" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.installments.map((p, i) => (
                          <tr key={i}>
                            <td className="rownum">{i + 1}</td>
                            <td>
                              <CampoData id={fid(`venc-${i}`)} rotulo={`vencimento da parcela ${i + 1}`} valor={p.dueDate} somenteLeitura={somenteLeitura}
                                invalido={!!erros[`installments[${i}].dueDate`]} onChange={(v) => setParcela(i, { dueDate: v })} />
                            </td>
                            <td>
                              <input className="rp-field rp-field--num" value={p.amount} maxLength={20} inputMode="decimal" readOnly={somenteLeitura}
                                aria-label={`Valor da parcela ${i + 1}`} aria-invalid={!!erros[`installments[${i}].amountCents`]}
                                onChange={(e) => setParcela(i, { amount: e.target.value })}
                                onBlur={() => {
                                  const c = centavosParaApi(p.amount);
                                  if (c && /^\d+$/.test(c)) setParcela(i, { amount: centavos(c) });
                                }} />
                            </td>
                            <td>
                              <input className="rp-field" value={p.milestone} maxLength={200} readOnly={somenteLeitura} placeholder="Ex.: Sinal, Embarque, Aceite"
                                aria-label={`Marco da parcela ${i + 1}`} onChange={(e) => setParcela(i, { milestone: e.target.value })} />
                            </td>
                            <td className="rp-linha-x" role={somenteLeitura ? undefined : 'button'} tabIndex={somenteLeitura ? -1 : 0} title="Remover parcela"
                              aria-label={`Remover parcela ${i + 1}`} onClick={() => !somenteLeitura && remParcela(i)} onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remParcela(i)}>
                              {somenteLeitura ? '' : '×'}
                            </td>
                          </tr>
                        ))}
                        {!somenteLeitura && (
                          <tr className="nova">
                            <td className="rownum">{form.installments.length + 1}</td>
                            <td colSpan={4} role="button" tabIndex={0} onClick={addParcela} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addParcela())}>
                              Clique para adicionar uma parcela…
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>Soma das parcelas</td>
                          <td className="num" aria-label="Soma das parcelas">{reais(parcelado.toString())}</td>
                          <td colSpan={2} className={diferenca === 0n ? '' : 'rp-parcelas__diferenca'}>
                            {diferenca === 0n ? (
                              <><i className="rp-ico rp-ico-status-sucesso" aria-hidden="true" /> Confere com o total do pedido</>
                            ) : (
                              <><i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Diferença de {reais(diferenca.toString())} para o total de {reais(total.toString())}</>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {erroParcelas.map((m) => (
                    <p key={m} className="rp-campo-erro rp-ficha__erro">
                      <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
                    </p>
                  ))}
                </div>
              ) : tab === 'gerado' && pedido ? (
                <Gerado pedido={pedido} abrir={win.open} />
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do pedido" />
              )}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {!somenteLeitura && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {adicao ? 'Adicionar' : 'Atualizar'}
            </button>
          )}
          <button type="button" className={`rp-btn${somenteLeitura ? ' rp-btn--default' : ''}`} onClick={win.requestClose}>
            {somenteLeitura ? 'OK' : 'Cancelar'}
          </button>
        </div>
        <div className="rp-btn-row">
          {podeConfirmar && (
            <button type="button" className="rp-btn" onClick={() => setConfirmar(true)}>
              <span>Con<u>f</u>irmar pedido</span>
            </button>
          )}
          {podeCancelar && (
            <button type="button" className="rp-btn" onClick={() => setCancelar(true)}>
              <span><u>C</u>ancelar pedido</span>
            </button>
          )}
        </div>
      </div>

      {confirmar && pedido && (
        <Dialog icon="aviso" label="Confirmar pedido" onEscape={() => setConfirmar(false)}
          buttons={[
            { label: 'Confirmar', primary: true, onClick: () => void confirmarPedido() },
            { label: 'Voltar', onClick: () => setConfirmar(false) },
          ]}>
          Confirmar o pedido {pedido.code} ({reais(pedido.totalCents)}) cria o projeto, {pedido.lines.filter((l) => l.kind === 'EQUIPAMENTO').reduce((t, l) => t + Number(l.quantity), 0)} equipamento(s)
          e {pedido.installments.length} parcela(s) a receber. Depois disso, linhas, preços e parcelas só mudam por aditivo.
          <br />
          Deseja confirmar?
        </Dialog>
      )}

      {cancelar && pedido && (
        <DialogoMotivo rotulo="Cancelar pedido" idCampo={fid('motivo')} botao="Cancelar pedido" voltar="Voltar" falta="Informe o motivo do cancelamento."
          texto={pedido.status === 'DRAFT'
            ? `O pedido ${pedido.code} fica cancelado; o histórico é preservado.`
            : `O pedido ${pedido.code} fica cancelado: as parcelas a receber são canceladas, o projeto ${pedido.projectCode} é encerrado e os equipamentos são cancelados.`}
          onCancelar={() => setCancelar(false)} onConfirmar={(m) => void cancelarPedido(m)} />
      )}

      {dividir && (
        <DialogoDividir total={total} inicio={dataParaApi(form.contractDate) ?? hojeIso()} idBase={fid('div')} onCancelar={() => setDividir(false)}
          onDividir={(parcelas) => {
            setDividir(false);
            set({ installments: parcelas });
          }} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Pedido alterado por outra pessoa" objeto="O pedido" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** O que a confirmação gerou: projeto, equipamentos e parcelas a receber, cada um com a seta para a sua ficha. */
function Gerado({ pedido, abrir }: { pedido: SalesOrder; abrir: (kind: 'project' | 'equipment' | 'receivable', id: string) => void }) {
  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  return (
    <div className="rp-ficha__geral">
      <div className="rp-form rp-janela-mdi__form">
        <span className="rp-label">Projeto</span>
        <span />
        <span className="rp-ficha__ref">
          {seta(`Abrir projeto ${pedido.projectCode}`, () => abrir('project', pedido.projectId!))}
          <input className="rp-field rp-field--readonly" readOnly aria-label="Projeto" value={`${pedido.projectCode} — ${ESTAGIO[pedido.projectStage as keyof typeof ESTAGIO] ?? pedido.projectStage}`} />
        </span>
        <span className="rp-label">Confirmado em</span>
        <span />
        <input className="rp-field rp-field--readonly" readOnly aria-label="Confirmado em" value={pedido.confirmedAt ? `${dataHora(pedido.confirmedAt)} por ${pedido.confirmedBy}` : ''} />
      </div>
      <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
        <table className="rp-grid rp-janela-mdi__grade" aria-label="Equipamentos do pedido">
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th aria-label="Abrir" />
              <th>Equipamento</th>
              <th>Modelo</th>
              <th>Nº de série</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {pedido.equipment.map((e, i) => (
              <tr key={e.id}>
                <td className="rownum">{i + 1}</td>
                <td>{seta(`Abrir equipamento ${e.code}`, () => abrir('equipment', e.id))}</td>
                <td>{e.code}</td>
                <td>{e.model}</td>
                <td>{e.serialNumber ?? ''}</td>
                <td>{seloEquipamento(e.status as 'ATIVO' | 'CANCELADO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pedido.equipment.length === 0 && <p className="rp-jlista__vazio">O pedido não tem linhas de equipamento.</p>}
      </div>
      <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
        <table className="rp-grid rp-janela-mdi__grade" aria-label="Parcelas a receber do pedido">
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th aria-label="Abrir" />
              <th>Título</th>
              <th>Descrição</th>
              <th>Vencimento</th>
              <th>Competência</th>
              <th className="num">Valor</th>
              <th className="num">Saldo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {pedido.titles.map((t, i) => (
              <tr key={t.id}>
                <td className="rownum">{i + 1}</td>
                <td>{seta(`Abrir título ${t.code}`, () => abrir('receivable', t.id))}</td>
                <td>{t.code}</td>
                <td>{t.label}</td>
                <td>{dataDaApi(t.dueDate)}</td>
                <td>{t.competence.slice(5)}/{t.competence.slice(0, 4)}</td>
                <td className="num">{reais(t.originalCents)}</td>
                <td className="num">{reais(t.balanceCents)}</td>
                <td>{seloTitulo(t.status)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total</td>
              <td className="num">{reais(pedido.titles.reduce((s, t) => s + BigInt(t.originalCents), 0n).toString())}</td>
              <td className="num">{reais(pedido.titles.reduce((s, t) => s + BigInt(t.balanceCents), 0n).toString())}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Dividir o total em parcelas mensais iguais, com o resíduo de centavos na primeira (premissa PD-002). */
function DialogoDividir({ total, inicio, idBase, onCancelar, onDividir }: {
  total: bigint;
  inicio: string;
  idBase: string;
  onCancelar: () => void;
  onDividir: (p: Parcela[]) => void;
}) {
  const [n, setN] = useState('3');
  const [primeira, setPrimeira] = useState(dataDaApi(inicio));
  const [erro, setErro] = useState<string | null>(null);
  const dividir = () => {
    const q = Number(n);
    const d = dataParaApi(primeira);
    if (!Number.isInteger(q) || q < 1 || q > 120) return setErro('Informe de 1 a 120 parcelas.');
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return setErro('Informe o primeiro vencimento em DD/MM/AAAA.');
    onDividir(dividirEmParcelas(total, q).map((v, i) => ({ dueDate: dataDaApi(somarMeses(d, i)), amount: centavos(v.toString()), milestone: '' })));
  };
  return (
    <Dialog icon="info" label="Dividir o total" onEscape={onCancelar}
      buttons={[
        { label: 'Dividir', primary: true, onClick: dividir },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      Divide {reais(total.toString())} em parcelas mensais; os centavos que sobram vão para a primeira parcela. As parcelas atuais são substituídas.
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-n`}>Parcelas</label>
        <input id={`${idBase}-n`} className="rp-field rp-field--num rp-field--curto" value={n} maxLength={3} inputMode="numeric" onChange={(e) => (setN(e.target.value), setErro(null))} />
        <label className="rp-label" htmlFor={`${idBase}-d`}>1º vencimento</label>
        <CampoData id={`${idBase}-d`} rotulo="primeiro vencimento" valor={primeira} onChange={(v) => (setPrimeira(v), setErro(null))} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}
