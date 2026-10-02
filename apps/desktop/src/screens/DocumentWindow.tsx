import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { BusinessDocument, DocumentLineKind, HistoryEntry, OperationNature, OrderInvoicing, TitleInvoicing } from '../api/types';
import { centavos, centavosParaApi, competenciaDaApi, competenciaParaApi, dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { FATURAMENTO_ALTERADO } from './comum/Faturamento';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { DOCUMENTOS_ALTERADOS, seloDocumento } from './DocumentsWindow';
import { TITULOS_ALTERADOS } from './ReceivablesWindow';
import { CampoDinheiro } from './comum/CampoDinheiro';

type Tab = 'linhas' | 'parcelas' | 'vinculos' | 'classificacao' | 'historico';
type Form = {
  orderId: string;
  kind: DocumentLineKind | '';
  series: string;
  number: string;
  issueDate: string;
  competence: string;
  amount: string;
  notes: string;
};

export const NATUREZA: Record<OperationNature, string> = {
  VENDA_PRODUCAO: 'Venda de produção própria',
  VENDA_MERCADORIA: 'Venda de mercadoria',
  PRESTACAO_SERVICO: 'Prestação de serviço',
  REMESSA: 'Remessa',
};

const TIPO: Record<DocumentLineKind, string> = { PRODUTO: 'Produto', SERVICO: 'Serviço' };

/** Tipo da nota (notas separadas, decisão do PO na Sprint 7): produto sai em NF-e, serviço em NFS-e. */
export const TIPO_NOTA: Record<DocumentLineKind | 'MISTO', string> = {
  PRODUTO: 'Produto (NF-e)',
  SERVICO: 'Serviço (NFS-e)',
  MISTO: 'Produto e serviço',
};

/** A emitir do tipo escolhido na nota proposta. */
const aEmitirDoTipo = (o: OrderInvoicing, kind: DocumentLineKind) => (kind === 'SERVICO' ? o.service : o.product).toIssueCents;

/** A chave `novo-3:<pedido>` abre a nota nova já com o pedido escolhido (seta da lista Notas a emitir e do pedido). */
const pedidoDaChave = (recordKey: string) => (recordKey.startsWith('novo-') && recordKey.includes(':') ? recordKey.slice(recordKey.indexOf(':') + 1) : '');

const vazio = (orderId = ''): Form => {
  const hoje = hojeIso();
  return { orderId, kind: '', series: '1', number: '', issueDate: dataDaApi(hoje), competence: competenciaDaApi(hoje), amount: '', notes: '' };
};

const toRequest = (f: Form) => ({
  direction: 'SAIDA',
  orderId: f.orderId || null,
  kind: f.kind || null,
  series: f.series.trim(),
  number: f.number.trim(),
  issueDate: dataParaApi(f.issueDate),
  competence: competenciaParaApi(f.competence),
  amountCents: centavosParaApi(f.amount),
  notes: f.notes.trim() || null,
});

const seta = (rotulo: string, fn: () => void) => (
  <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
);

/** Avisa as outras janelas: listas de documentos e de notas a emitir, parcelas e o faturado dos pedidos, projetos e títulos. */
const avisar = () => {
  window.dispatchEvent(new Event(DOCUMENTOS_ALTERADOS));
  window.dispatchEvent(new Event(FATURAMENTO_ALTERADO));
  window.dispatchEvent(new Event(TITULOS_ALTERADOS));
};

/**
 * Ficha do documento de faturamento (formulário "documentos"), no regime de caixa decidido na Review da Sprint 6: a nota
 * nova parte do pedido. O sistema mostra o recebido que ainda não tem nota (a emitir), monta as linhas proporcionais
 * às do pedido (produto e serviço) e reparte o valor entre as parcelas recebidas, da mais antiga para a mais nova; o
 * usuário emite a nota no portal da SEFAZ ou da prefeitura e registra aqui o número, a série e a emissão. Depois de
 * adicionada: Linhas, Vínculos, Classificação e Histórico; Cancelar documento devolve o valor ao a emitir.
 */
export function DocumentWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [doc, setDoc] = useState<BusinessDocument | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(() => vazio(pedidoDaChave(recordKey)));
  const [tab, setTab] = useState<Tab>('linhas');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [pedidos, setPedidos] = useState<OrderInvoicing[]>([]);
  const [proposta, setProposta] = useState<OrderInvoicing | null>(null);
  const chave = useRef(novaChave());
  // A competência acompanha a emissão até o usuário mudá-la.
  const competenciaManual = useRef(false);

  const adicao = doc === null;
  const somenteLeitura = !adicao || !can('document.register') || !can('document.link');
  const ativo = doc?.status === 'ATIVO';
  const original = useMemo(() => vazio(pedidoDaChave(recordKey)), [recordKey]);
  const alterado = useMemo(() => adicao && !somenteLeitura && JSON.stringify({ ...form, amount: '', kind: '' }) !== JSON.stringify(original),
    [form, original, adicao, somenteLeitura]);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((d: BusinessDocument, etagLido?: string) => {
    setDoc(d);
    setId(d.id);
    setEtag(etagLido ?? `"${d.version}"`);
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

  // Nota nova: os pedidos com recebimento sem nota, para escolher.
  useEffect(() => {
    if (!adicao || somenteLeitura) return;
    api
      .get<OrderInvoicing[]>('/api/v1/invoicing/orders?status=A_EMITIR')
      .then((r) => setPedidos(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [adicao, somenteLeitura]);

  /**
   * Proposta do servidor para o pedido, o tipo (vazio = o servidor escolhe: produto, se houver produto a emitir) e o
   * valor (vazio = todo o a emitir do tipo); o tipo e o valor voltam preenchidos.
   */
  // Só a resposta da consulta mais recente vale: abrir a nota consulta sem valor e de novo quando o tipo chega; se essa
  // resposta chegasse depois da validação do valor digitado, apagaria o aviso de "acima do a emitir".
  const ultimaProposta = useRef(0);
  const propor = useCallback(async (orderId: string, kind: DocumentLineKind | '', valor?: string) => {
    const vez = ++ultimaProposta.current;
    if (!orderId) {
      setProposta(null);
      return;
    }
    const cents = valor ? centavosParaApi(valor) : null;
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    if (cents && /^\d+$/.test(cents)) q.set('amountCents', cents);
    try {
      const r = await api.get<OrderInvoicing>(`/api/v1/invoicing/orders/${orderId}${q.size ? `?${q.toString()}` : ''}`);
      if (vez !== ultimaProposta.current) return;
      setProposta(r.data);
      setForm((f) => (f.orderId === orderId ? { ...f, kind: r.data.kind, amount: centavos(r.data.proposedCents) } : f));
      setErros((m) => {
        const { amountCents: _a, orderId: _o, ...resto } = m;
        return resto;
      });
    } catch (e) {
      if (vez !== ultimaProposta.current) return;
      const x = e as ApiError;
      const campo = x.details.find((d) => d.field === 'amountCents')?.message;
      if (campo) setErros((m) => ({ ...m, amountCents: campo }));
      else winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  useEffect(() => {
    if (adicao && form.orderId) void propor(form.orderId, form.kind);
  }, [form.orderId, form.kind]); // eslint-disable-line react-hooks/exhaustive-deps

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
    tratarFalha(e, { objeto: 'O documento', notify: winRef.current.notify, setErros, setConflito });
  }, []);

  /** Registra a nota; a mesma chave vai de novo se a rede cair antes da resposta, para não registrar duas vezes. */
  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const r = await api.post<BusinessDocument>('/api/v1/documents', toRequest(formRef.current), { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      aplicar(r.data, r.etag);
      setTab('vinculos');
      winRef.current.notify({
        tone: 'sucesso',
        text: `Documento ${r.data.code} (nota de ${r.data.kind === 'SERVICO' ? 'serviço' : 'produto'} nº ${r.data.number}) adicionado com sucesso: ${reais(r.data.totalCents)} faturados no pedido ${r.data.orderCode}`,
      });
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

  const cancelarDocumento = async (motivo: string) => {
    setCancelar(false);
    try {
      const r = await api.post<BusinessDocument>(`/api/v1/documents/${doc!.id}/cancellations`, { reason: motivo }, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: `Documento ${r.data.code} (nota nº ${r.data.number}) cancelado com sucesso; o valor volta às notas a emitir` });
      avisar();
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = adicao && !gravando && !somenteLeitura && !!form.orderId && !!proposta && BigInt(aEmitirDoTipo(proposta, proposta.kind)) > 0n;
  const podeCancelar = !!doc && ativo && can('document.cancel');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setEmissao = (v: string) => {
    const iso = dataParaApi(v);
    setForm((f) => ({ ...f, issueDate: v, competence: !competenciaManual.current && iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? competenciaDaApi(iso) : f.competence }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || cancelar) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { l: 'linhas', p: 'parcelas', v: 'vinculos', a: 'classificacao', h: 'historico' };
      if (alvo[k] && tabs.some(([t, , ok]) => t === alvo[k] && ok)) setTab(alvo[k]);
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
  const opcoesPedidos = pedidos.map((o) => ({ valor: o.id, rotulo: `${o.orderCode} — ${o.customerName} — a emitir ${reais(o.toIssueCents)}` }));
  if (form.orderId && proposta && !opcoesPedidos.some((o) => o.valor === form.orderId)) {
    opcoesPedidos.unshift({ valor: proposta.id, rotulo: `${proposta.orderCode} — ${proposta.customerName} — a emitir ${reais(proposta.toIssueCents)}` });
  }
  const linhas = doc ? doc.lines : proposta?.lines ?? [];
  const total = doc ? doc.totalCents : proposta?.proposedCents ?? '0';
  const semNada = adicao && !!proposta && BigInt(proposta.toIssueCents) === 0n;
  const semNadaDoTipo = adicao && !!proposta && !semNada && BigInt(aEmitirDoTipo(proposta, proposta.kind)) === 0n;
  const tiposDoPedido = proposta
    ? (['PRODUTO', 'SERVICO'] as DocumentLineKind[]).filter((k) => BigInt((k === 'SERVICO' ? proposta.service : proposta.product).orderCents) > 0n)
    : [];

  const tabs: [Tab, ReactNode, boolean][] = adicao
    ? [
        ['linhas', <span><u>L</u>inhas ({linhas.length})</span>, true],
        ['parcelas', <span><u>P</u>arcelas ({proposta?.parcels.filter((p) => BigInt(p.proposedCents) > 0n).length ?? 0})</span>, true],
      ]
    : [
        ['linhas', <span><u>L</u>inhas ({linhas.length})</span>, true],
        ['vinculos', <span><u>V</u>ínculos ({doc?.links.filter((l) => l.status === 'ATIVO').length ?? 0})</span>, true],
        ['classificacao', <span>Cl<u>a</u>ssificação</span>, true],
        ['historico', <span><u>H</u>istórico</span>, true],
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
                <label className="rp-label" htmlFor={fid('pedido')}>Pedido</label>
                <span className="rp-req" aria-hidden="true">*</span>
                {doc ? (
                  <span className="rp-ficha__ref">
                    {doc.orderId && seta(`Abrir pedido ${doc.orderCode}`, () => win.open('order', doc.orderId!))}
                    <input id={fid('pedido')} className="rp-field rp-field--readonly" readOnly value={doc.orderCode ?? ''} />
                  </span>
                ) : (
                  <Selecao id={fid('pedido')} className={classeCampo} valor={form.orderId} disabled={somenteLeitura} aria-invalid={!!erros.orderId}
                    onChange={(v) => set({ orderId: v, kind: '', amount: '' })}
                    opcoes={[{ valor: '', rotulo: pedidos.length || form.orderId ? 'Escolha o pedido' : 'Nenhum pedido com recebimento sem nota' }, ...opcoesPedidos]} />
                )}
                {erroDe('orderId')}
                <label className="rp-label" htmlFor={fid('tipo')}>Tipo da nota</label>
                <span className="rp-req" aria-hidden="true">*</span>
                {doc ? (
                  <input id={fid('tipo')} className="rp-field rp-field--readonly" readOnly value={TIPO_NOTA[doc.kind]} />
                ) : (
                  <Selecao id={fid('tipo')} className={classeCampo} valor={form.kind} disabled={somenteLeitura || !proposta} aria-invalid={!!erros.kind}
                    onChange={(v) => set({ kind: v as DocumentLineKind, amount: '' })}
                    opcoes={proposta ? tiposDoPedido.map((k) => ({ valor: k, rotulo: TIPO_NOTA[k] })) : [{ valor: '', rotulo: 'Escolha o pedido' }]} />
                )}
                {erroDe('kind')}
                <span className="rp-label">Cliente</span>
                <span />
                <span className="rp-ficha__ref">
                  {(doc || proposta) && seta(`Abrir cliente ${(doc ?? proposta)!.customerCode}`, () => win.open('customer', (doc ?? proposta)!.customerId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente"
                    value={doc ? `${doc.customerCode} — ${doc.customerName}` : proposta ? `${proposta.customerCode} — ${proposta.customerName}` : ''} />
                </span>
                <label className="rp-label" htmlFor={fid('numero')}>Nº da nota</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <span className="rp-ficha__ref">
                  <input id={fid('numero')} className={`${classeCampo} rp-field--curto`} value={doc?.number ?? form.number} maxLength={20} inputMode="numeric"
                    readOnly={somenteLeitura} aria-invalid={!!erros.number} onChange={(e) => set({ number: e.target.value })} />
                  <label className="rp-label" htmlFor={fid('serie')}>Série</label>
                  <input id={fid('serie')} className={`${classeCampo} rp-field--curto`} value={doc?.series ?? form.series} maxLength={10} readOnly={somenteLeitura}
                    aria-invalid={!!erros.series} onChange={(e) => set({ series: e.target.value })} />
                </span>
                {erroDe('number')}
                {erroDe('series')}
                <label className="rp-label" htmlFor={fid('emissao')}>Emissão</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <CampoData id={fid('emissao')} rotulo="Emissão" className={`${classeCampo} rp-field--curto`} valor={doc ? dataDaApi(doc.issueDate) : form.issueDate}
                  somenteLeitura={somenteLeitura} invalido={!!erros.issueDate} onChange={setEmissao} />
                {erroDe('issueDate')}
                <label className="rp-label" htmlFor={fid('competencia')}>Competência</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('competencia')} className={`${classeCampo} rp-field--curto`} value={doc ? competenciaDaApi(doc.competence) : form.competence} maxLength={7}
                  placeholder="MM/AAAA" readOnly={somenteLeitura} aria-invalid={!!erros.competence} onChange={(e) => {
                    competenciaManual.current = true;
                    set({ competence: e.target.value });
                  }} />
                {erroDe('competence')}
                <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                <span />
                <input id={fid('obs')} className={classeCampo} value={doc?.notes ?? form.notes} maxLength={500} readOnly={somenteLeitura}
                  onChange={(e) => set({ notes: e.target.value })} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {doc ? seloDocumento(doc.status) : <span className="rp-badge">Nova</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                {adicao ? (
                  <>
                    <span className="rp-label">Recebido</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Recebido do pedido" value={reais(proposta?.receivedCents ?? '0')} />
                    <span className="rp-label">Já faturado</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Já faturado" value={reais(proposta?.invoicedCents ?? '0')} />
                    <span className="rp-label">A emitir</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="A emitir" value={reais(proposta?.toIssueCents ?? '0')} />
                    <span className="rp-label">{proposta?.kind === 'SERVICO' ? 'A emitir de serviço' : 'A emitir de produto'}</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="A emitir do tipo"
                      value={reais(proposta ? aEmitirDoTipo(proposta, proposta.kind) : '0')} />
                    <label className="rp-label" htmlFor={fid('valor')}>Valor da nota</label>
                    <CampoDinheiro id={fid('valor')} className={`${classeCampo} rp-field--num`} value={form.amount} maxLength={20}
                      readOnly={somenteLeitura || !proposta} aria-invalid={!!erros.amountCents} onChange={(e) => set({ amount: e.target.value })}
                      onBlur={() => form.orderId && void propor(form.orderId, form.kind, form.amount)} />
                    {erros.amountCents && (
                      <>
                        <span />
                        <span className="rp-campo-erro">
                          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.amountCents}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="rp-label">Total da nota</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total da nota" value={reais(total)} />
                    <span className="rp-label">Vinculado</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Vinculado" value={reais(doc!.linkedCents)} />
                    <span className="rp-label">Versão</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly value={doc!.version} aria-label="Versão" />
                    {doc!.status === 'CANCELADO' && (
                      <>
                        <span className="rp-label">Motivo</span>
                        <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do cancelamento" value={doc!.cancelReason ?? ''} />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {semNada && (
              <p className="rp-janela-mdi__aviso rp-ficha__nota">
                <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> O pedido {proposta!.orderCode} não tem recebimento sem nota: a nota só fatura o que já foi recebido.
              </p>
            )}
            {semNadaDoTipo && (
              <p className="rp-janela-mdi__aviso rp-ficha__nota">
                <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> O pedido {proposta!.orderCode} não tem recebimento de{' '}
                {proposta!.kind === 'SERVICO' ? 'serviço' : 'produto'} sem nota. Escolha o outro tipo.
              </p>
            )}
            {adicao && proposta && !semNada && !semNadaDoTipo && (
              <p className="rp-janela-mdi__aviso rp-ficha__nota">
                <i className="rp-ico rp-ico-status-info" aria-hidden="true" />{' '}
                {proposta.kind === 'SERVICO'
                  ? `Emita a NFS-e de ${reais(proposta.proposedCents)} no portal da prefeitura`
                  : `Emita a NF-e de ${reais(proposta.proposedCents)} no portal da SEFAZ`}{' '}
                e registre aqui o número, a série e a emissão. A emitir no pedido: produto {reais(proposta.productCents)}, serviço {reais(proposta.serviceCents)}.
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
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'linhas' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Linhas da nota">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Descrição</th>
                        <th className="rp-linhas__tipo">Tipo</th>
                        <th className="num rp-linhas__valor">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.seq}>
                          <td className="rownum">{l.seq}</td>
                          <td>{l.description}</td>
                          <td>{TIPO[l.kind]}</td>
                          <td className="num">{reais(l.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total da nota</td>
                        <td className="num" aria-label="Soma das linhas">{reais(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {adicao && !proposta && <p className="rp-jlista__vazio">Escolha o pedido: as linhas vêm dele, na proporção de cada item.</p>}
                </div>
              ) : tab === 'parcelas' && proposta ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Parcelas do pedido">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Parcela</th>
                        <th>Descrição</th>
                        <th>Vencimento</th>
                        <th className="num">Valor</th>
                        <th className="num">Recebido</th>
                        <th className="num">Faturado</th>
                        <th className="num">A emitir</th>
                        <th className="num">Nesta nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposta.parcels.map((p, i) => (
                        <tr key={p.titleId}>
                          <td className="rownum">{i + 1}</td>
                          <td>{p.titleCode}</td>
                          <td>{p.label}</td>
                          <td>{dataDaApi(p.dueDate)}</td>
                          <td className="num">{reais(p.originalCents)}</td>
                          <td className="num">{reais(p.receivedCents)}</td>
                          <td className="num">{reais(p.invoicedCents)}</td>
                          <td className="num">{reais(p.toIssueCents)}</td>
                          <td className="num">{reais(p.proposedCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={8}>Nesta nota</td>
                        <td className="num" aria-label="Soma das parcelas nesta nota">{reais(proposta.proposedCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : tab === 'vinculos' && doc ? (
                <Vinculos doc={doc} abrir={(t) => win.open('receivable', t)} />
              ) : tab === 'classificacao' && doc ? (
                <Classificacao doc={doc} etag={etag} idBase={fid('cl')} podeClassificar={ativo && can('document.classify')}
                  onClassificado={(d, e) => {
                    aplicar(d, e);
                    winRef.current.notify({ tone: 'sucesso', text: `Documento ${d.code} classificado com sucesso (revisão ${d.classificationRevision})` });
                    avisar();
                  }} falha={falha} />
              ) : tab === 'historico' ? (
                <GradeHistorico historico={historico} rotulo="Histórico do documento" />
              ) : (
                <p className="rp-jlista__vazio">Escolha o pedido para ver as parcelas.</p>
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
          {podeCancelar && (
            <button type="button" className="rp-btn" onClick={() => setCancelar(true)}>
              <span><u>C</u>ancelar documento</span>
            </button>
          )}
        </div>
      </div>

      {cancelar && doc && (
        <DialogoMotivo rotulo="Cancelar documento" idCampo={fid('motivo-cancelar')} botao="Cancelar documento" voltar="Voltar" falta="Informe o motivo do cancelamento."
          texto={`O documento ${doc.code} (nota nº ${doc.number}) fica cancelado e os vínculos são desfeitos: ${reais(doc.linkedCents)} voltam às notas a emitir do pedido ${doc.orderCode ?? ''}. Recebimentos não mudam.`}
          onCancelar={() => setCancelar(false)} onConfirmar={(m) => void cancelarDocumento(m)} />
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

/** Aba Vínculos: as parcelas que a nota fatura, com a seta para o título; vínculos desfeitos ficam com o motivo. */
function Vinculos({ doc, abrir }: { doc: BusinessDocument; abrir: (titleId: string) => void }) {
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
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Vinculado</td>
            <td className="num">{reais(doc.linkedCents)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
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

