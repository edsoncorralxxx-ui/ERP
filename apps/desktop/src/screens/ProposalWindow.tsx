import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { HistoryEntry, Proposal, SalesOrder } from '../api/types';
import { dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
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
import { seloProposta, seloRevisao } from './comum/Selos';
import { PROPOSTAS_ALTERADAS } from './ProposalsWindow';
import { PEDIDOS_ALTERADOS } from './SalesOrdersWindow';

type Tab = 'linhas' | 'revisoes' | 'historico';
type Form = { customerId: string; unitId: string; title: string; validUntil: string; paymentTerms: string; lines: LinhaForm[] };

const VAZIO: Form = { customerId: '', unitId: '', title: '', validUntil: '', paymentTerms: '', lines: [] };

function toForm(p: Proposal, revisao: number): Form {
  const r = p.revisions.find((x) => x.revision === revisao) ?? p.revisions[p.revisions.length - 1];
  return {
    customerId: p.customerId,
    unitId: p.unitId ?? '',
    title: p.title,
    validUntil: dataDaApi(r.validUntil),
    paymentTerms: r.paymentTerms ?? '',
    lines: r.lines.map(linhaDaApi),
  };
}

const toRequest = (f: Form) => ({
  customerId: f.customerId || null,
  unitId: f.unitId || null,
  title: f.title.trim() || null,
  validUntil: dataParaApi(f.validUntil),
  paymentTerms: f.paymentTerms.trim() || null,
  lines: f.lines.map(linhaParaApi),
});

/**
 * Ficha da proposta (formulário "propostas"): cabeçalho com número, cliente, unidade, título, validade e condições;
 * abas Linhas (Tabela de edição), Revisões e Histórico. A revisão em rascunho é editável; emitida, fica imutável e
 * "Nova revisão" cria a próxima. "Converter em pedido" abre o pedido em rascunho e registra a proposta como ganha.
 */
export function ProposalWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [proposta, setProposta] = useState<Proposal | null>(null);
  const [etag, setEtag] = useState('');
  const [revisao, setRevisao] = useState(1);
  const [form, setForm] = useState<Form>(() => ({ ...VAZIO, validUntil: dataDaApi(hojeIso()) }));
  const [tab, setTab] = useState<Tab>('linhas');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [perda, setPerda] = useState(false);
  const [converter, setConverter] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const clientes = useClientes();
  const unidades = useUnidades(form.customerId);
  const itens = useItens();
  const chave = useRef(novaChave());

  const adicao = proposta === null;
  const vigente = proposta?.revisions[proposta.revisions.length - 1];
  const vendoVigente = !proposta || revisao === proposta.currentRevision;
  const aberta = !proposta || proposta.status === 'ABERTA';
  const rascunho = !vigente || vigente.status === 'RASCUNHO';
  const somenteLeitura = adicao ? !can('proposal.create') : !can('proposal.update') || !aberta || !rascunho || !vendoVigente;
  const original = useMemo(() => (proposta ? toForm(proposta, revisao) : { ...VAZIO, validUntil: dataDaApi(hojeIso()) }), [proposta, revisao]);
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original), [form, original, somenteLeitura]);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((p: Proposal, etagLido?: string) => {
    setProposta(p);
    setId(p.id);
    setEtag(etagLido ?? `"${p.version}"`);
    setRevisao(p.currentRevision);
    setForm(toForm(p, p.currentRevision));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(
    async (pid: string) => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const r = await api.get<Proposal>(`/api/v1/proposals/${pid}`);
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
      .get<HistoryEntry[]>(`/api/v1/proposals/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const campos = tratarFalha(e, { objeto: 'A proposta', notify: winRef.current.notify, setErros, setConflito });
    if (campos) setTab('linhas');
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = proposta
        ? await api.put<Proposal>(`/api/v1/proposals/${proposta.id}`, body, etag)
        : await api.post<Proposal>('/api/v1/proposals', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Proposta ${r.data.code} ${proposta ? 'atualizada' : 'adicionada'} com sucesso` });
      window.dispatchEvent(new Event(PROPOSTAS_ALTERADAS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [proposta, etag, falha, aplicar]);

  /** Emitir, nova revisão e perda: comandos com a versão lida. */
  const comando = async (caminho: string, corpo: unknown, sucesso: (p: Proposal) => string) => {
    if (!proposta) return;
    try {
      const r = await api.post<Proposal>(`/api/v1/proposals/${proposta.id}/${caminho}`, corpo, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: sucesso(r.data) });
      window.dispatchEvent(new Event(PROPOSTAS_ALTERADAS));
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  const podeEmitir = !!proposta && aberta && rascunho && !alterado && can('proposal.issue');
  const podeRevisar = !!proposta && aberta && !rascunho && can('proposal.update');
  const podeConverter = !!proposta && aberta && !rascunho && can('sales_order.create');
  const podePerder = !!proposta && aberta && can('proposal.update');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || perda || converter) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { l: 'linhas', s: 'revisoes', h: 'historico' };
      if (alvo[k] && (alvo[k] === 'linhas' || id)) setTab(alvo[k]);
      else if (k === 'e' && podeEmitir) void comando('issue', undefined, (p) => `Revisão ${p.currentRevision} da proposta ${p.code} emitida com sucesso`);
      else if (k === 'v' && podeRevisar) void comando('revisions', undefined, (p) => `Revisão ${p.currentRevision} da proposta ${p.code} criada com sucesso`);
      else if (k === 'p' && podeConverter) setConverter(true);
      else if (k === 'r' && podePerder) setPerda(true);
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
  const clienteFixo = !!proposta && proposta.revisions.length > 1;
  const opcoesClientes = clientes
    .filter((c) => c.status === 'ATIVO' || c.id === form.customerId)
    .map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.legalName}` }));
  if (proposta && !opcoesClientes.some((o) => o.valor === proposta.customerId)) {
    opcoesClientes.unshift({ valor: proposta.customerId, rotulo: `${proposta.customerCode} — ${proposta.customerName}` });
  }
  const opcoesUnidades = [{ valor: '', rotulo: 'Sem unidade definida' }, ...unidades.map((u) => ({ valor: u.id, rotulo: u.name }))];
  if (proposta?.unitId && !unidades.some((u) => u.id === proposta.unitId)) opcoesUnidades.push({ valor: proposta.unitId, rotulo: proposta.unitName ?? '' });

  const tabs: [Tab, ReactNode, boolean][] = [
    ['linhas', <span><u>L</u>inhas ({form.lines.length})</span>, true],
    ['revisoes', <span>Revi<u>s</u>ões ({proposta?.revisions.length ?? 0})</span>, id !== null],
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
                <input className="rp-field rp-field--readonly" readOnly value={proposta?.code ?? 'Gerado ao adicionar'} aria-label="Número" />
                <label className="rp-label" htmlFor={fid('cliente')}>Cliente</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <Selecao id={fid('cliente')} className={classeCampo} valor={form.customerId} disabled={somenteLeitura || clienteFixo} aria-invalid={!!erros.customerId}
                  onChange={(v) => set({ customerId: v, unitId: '' })} opcoes={[{ valor: '', rotulo: 'Escolha o cliente' }, ...opcoesClientes]} />
                {erroDe('customerId')}
                <label className="rp-label" htmlFor={fid('unidade')}>Unidade</label>
                <span />
                <Selecao id={fid('unidade')} className={classeCampo} valor={form.unitId} disabled={somenteLeitura || !form.customerId} aria-invalid={!!erros.unitId}
                  onChange={(v) => set({ unitId: v })} opcoes={opcoesUnidades} />
                {erroDe('unitId')}
                <label className="rp-label" htmlFor={fid('titulo')}>Título</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('titulo')} className={classeCampo} value={form.title} maxLength={200} readOnly={somenteLeitura} aria-invalid={!!erros.title}
                  onChange={(e) => set({ title: e.target.value })} />
                {erroDe('title')}
                <label className="rp-label" htmlFor={fid('validade')}>Validade</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <CampoData id={fid('validade')} rotulo="Validade" className={`${classeCampo} rp-field--curto`} valor={form.validUntil} somenteLeitura={somenteLeitura}
                  invalido={!!erros.validUntil} onChange={(v) => set({ validUntil: v })} />
                {erroDe('validUntil')}
                <label className="rp-label" htmlFor={fid('condicoes')}>Cond. de pagamento</label>
                <span />
                <input id={fid('condicoes')} className={classeCampo} value={form.paymentTerms} maxLength={500} readOnly={somenteLeitura}
                  onChange={(e) => set({ paymentTerms: e.target.value })} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {proposta ? seloProposta(proposta.status) : <span className="rp-badge">Nova</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <label className="rp-label" htmlFor={fid('revisao')}>Revisão</label>
                {proposta ? (
                  <Selecao id={fid('revisao')} valor={String(revisao)} disabled={alterado}
                    title={alterado ? 'Grave ou descarte as alterações antes de ver outra revisão' : undefined}
                    onChange={(v) => {
                      setRevisao(Number(v));
                      setForm(toForm(proposta, Number(v)));
                      setErros({});
                    }}
                    opcoes={proposta.revisions.map((r) => ({ valor: String(r.revision), rotulo: `${r.revision} — ${r.status === 'EMITIDA' ? 'emitida' : 'rascunho'}${r.revision === proposta.currentRevision ? ' (vigente)' : ''}` }))} />
                ) : (
                  <input id={fid('revisao')} className="rp-field rp-field--readonly" readOnly value="1 — rascunho" />
                )}
                <span className="rp-label">Total</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total" value={reais(totalDasLinhas(form.lines).toString())} />
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={proposta?.version ?? ''} aria-label="Versão" />
                {proposta?.status === 'PERDIDA' && (
                  <>
                    <span className="rp-label">Motivo da perda</span>
                    <input className="rp-field rp-field--readonly" readOnly value={proposta.outcomeReason ?? ''} aria-label="Motivo da perda" />
                  </>
                )}
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, ativo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={ativo ? 0 : -1} aria-selected={tab === t} aria-disabled={!ativo || undefined}
                  title={ativo ? undefined : 'Disponível depois de adicionar a proposta'} onClick={() => ativo && setTab(t)} onKeyDown={(e) => e.key === 'Enter' && ativo && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'linhas' ? (
                <>
                  {!somenteLeitura || !proposta ? null : (
                    <p className="rp-janela-mdi__aviso rp-ficha__nota">
                      <i className="rp-ico rp-ico-status-info" aria-hidden="true" />{' '}
                      {!vendoVigente
                        ? `Revisão ${revisao} preservada como foi emitida.`
                        : !aberta
                          ? `Proposta ${proposta.status === 'GANHA' ? 'ganha' : 'perdida'}: não muda mais.`
                          : `Revisão ${revisao} emitida: para alterar, crie uma nova revisão.`}
                    </p>
                  )}
                  <GradeLinhas linhas={form.lines} onChange={(lines) => set({ lines })} itens={itens} somenteLeitura={somenteLeitura} adicao={emAdicao}
                    erros={erros} rotulo="Linhas da proposta" />
                </>
              ) : tab === 'revisoes' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Revisões da proposta">
                    <thead>
                      <tr>
                        <th className="rownum">Rev.</th>
                        <th>Situação</th>
                        <th>Validade</th>
                        <th>Condições de pagamento</th>
                        <th className="num">Linhas</th>
                        <th className="num">Total</th>
                        <th>Emitida em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposta?.revisions.map((r) => (
                        <tr key={r.id} aria-selected={r.revision === revisao} onClick={() => !alterado && (setRevisao(r.revision), setForm(toForm(proposta, r.revision)))}>
                          <td className="rownum">{r.revision}</td>
                          <td>{seloRevisao(r.status)}</td>
                          <td>{dataDaApi(r.validUntil)}</td>
                          <td>{r.paymentTerms}</td>
                          <td className="num">{r.lines.length}</td>
                          <td className="num">{reais(r.totalCents)}</td>
                          <td>{r.issuedAt ? `${dataHora(r.issuedAt)} por ${r.issuedBy}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico da proposta" />
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
          {podeEmitir && (
            <button type="button" className="rp-btn" onClick={() => void comando('issue', undefined, (p) => `Revisão ${p.currentRevision} da proposta ${p.code} emitida com sucesso`)}>
              <span><u>E</u>mitir revisão</span>
            </button>
          )}
          {podeRevisar && (
            <button type="button" className="rp-btn" onClick={() => void comando('revisions', undefined, (p) => `Revisão ${p.currentRevision} da proposta ${p.code} criada com sucesso`)}>
              <span>Nova re<u>v</u>isão</span>
            </button>
          )}
          {podeConverter && (
            <button type="button" className="rp-btn" onClick={() => setConverter(true)}>
              <span>Converter em <u>p</u>edido</span>
            </button>
          )}
          {podePerder && (
            <button type="button" className="rp-btn" onClick={() => setPerda(true)}>
              <span>Registrar pe<u>r</u>da</span>
            </button>
          )}
        </div>
      </div>

      {perda && proposta && (
        <DialogoMotivo rotulo="Registrar perda" texto={`A proposta ${proposta.code} fica perdida e não muda mais; as revisões são preservadas.`} idCampo={fid('motivo')}
          botao="Registrar perda" falta="Informe o motivo da perda." onCancelar={() => setPerda(false)}
          onConfirmar={(m) => {
            setPerda(false);
            void comando('outcome', { outcome: 'PERDIDA', reason: m }, (p) => `Perda da proposta ${p.code} registrada com sucesso`);
          }} />
      )}

      {converter && proposta && (
        <DialogoConverter proposta={proposta} unidades={opcoesUnidades.filter((o) => o.valor)} idBase={fid('conv')} onCancelar={() => setConverter(false)}
          onConvertido={(o) => {
            setConverter(false);
            winRef.current.notify({ tone: 'sucesso', text: `Pedido ${o.code} adicionado com sucesso a partir da proposta ${proposta.code}` });
            window.dispatchEvent(new Event(PROPOSTAS_ALTERADAS));
            window.dispatchEvent(new Event(PEDIDOS_ALTERADOS));
            void carregar(proposta.id);
            winRef.current.open('order', o.id);
          }}
          onFalha={(e) => {
            setConverter(false);
            falha(e);
          }} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Proposta alterada por outra pessoa" objeto="A proposta" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** Converter em pedido: a unidade (se a proposta não tem) e a data de contratação, numa Caixa de mensagem. */
function DialogoConverter({ proposta, unidades, idBase, onCancelar, onConvertido, onFalha }: {
  proposta: Proposal;
  unidades: { valor: string; rotulo: string }[];
  idBase: string;
  onCancelar: () => void;
  onConvertido: (o: SalesOrder) => void;
  onFalha: (e: unknown) => void;
}) {
  const [unidade, setUnidade] = useState(proposta.unitId ?? '');
  const [data, setData] = useState(dataDaApi(hojeIso()));
  const chave = useRef(novaChave());
  const converter = async () => {
    try {
      const r = await api.post<SalesOrder>(`/api/v1/proposals/${proposta.id}/orders`, { unitId: unidade || null, contractDate: dataParaApi(data) },
        { 'Idempotency-Key': chave.current });
      onConvertido(r.data);
    } catch (e) {
      onFalha(e);
    }
  };
  return (
    <Dialog icon="info" label="Converter em pedido" onEscape={onCancelar}
      buttons={[
        { label: 'Converter', primary: true, onClick: () => void converter() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      A revisão {proposta.currentRevision} da proposta {proposta.code} vira um pedido em rascunho, com as mesmas linhas; a proposta fica ganha.
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-unidade`}>Unidade</label>
        <Selecao id={`${idBase}-unidade`} valor={unidade} onChange={setUnidade} opcoes={[{ valor: '', rotulo: 'Escolha a unidade' }, ...unidades]} />
        <label className="rp-label" htmlFor={`${idBase}-data`}>Contratação</label>
        <CampoData id={`${idBase}-data`} rotulo="Contratação" valor={data} onChange={setData} />
      </div>
    </Dialog>
  );
}
