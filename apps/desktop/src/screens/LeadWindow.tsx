import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { HistoryEntry, Interaction, Lead, Opportunity } from '../api/types';
import { dataDaApi, dataHora, dataParaApi, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import {
  DialogoInteracao, estrelas, GradeInteracoes, OPORTUNIDADES_ALTERADAS, opcoesOrigem, pct, PROSPECCOES_ALTERADAS, RENDA, useResponsaveis,
} from './comum/Crm';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { seloOportunidade, seloProspeccao } from './comum/Selos';
import { novaOportunidade } from './OpportunitiesWindow';

type Tab = 'interacoes' | 'oportunidades' | 'historico';
type Form = {
  companyName: string; tradeName: string; city: string; state: string; hasRenda: string; rating: string; stage: string; owner: string;
  source: string; contactName: string; contactPhone: string; contactEmail: string; notes: string; nextActionDate: string; nextActionNote: string;
};

const VAZIO: Form = {
  companyName: '', tradeName: '', city: '', state: '', hasRenda: 'DESCONHECIDO', rating: '', stage: 'IDENTIFICADO', owner: '', source: 'PROSPECCAO_ATIVA',
  contactName: '', contactPhone: '', contactEmail: '', notes: '', nextActionDate: '', nextActionNote: '',
};

const toForm = (l: Lead): Form => ({
  companyName: l.companyName, tradeName: l.tradeName ?? '', city: l.city ?? '', state: l.state ?? '', hasRenda: l.hasRenda,
  rating: l.rating === null ? '' : String(l.rating), stage: l.stage, owner: l.owner, source: l.source, contactName: l.contactName ?? '',
  contactPhone: l.contactPhone ?? '', contactEmail: l.contactEmail ?? '', notes: l.notes ?? '', nextActionDate: dataDaApi(l.nextActionDate),
  nextActionNote: l.nextActionNote ?? '',
});

const toRequest = (f: Form) => ({
  companyName: f.companyName.trim() || null, tradeName: f.tradeName.trim() || null, city: f.city.trim() || null, state: f.state.trim() || null,
  hasRenda: f.hasRenda, rating: f.rating ? Number(f.rating) : null, stage: f.stage, owner: f.owner || null, source: f.source,
  contactName: f.contactName.trim() || null, contactPhone: f.contactPhone.trim() || null, contactEmail: f.contactEmail.trim() || null,
  notes: f.notes.trim() || null, nextActionDate: dataParaApi(f.nextActionDate), nextActionNote: f.nextActionNote.trim() || null,
});

/**
 * Ficha da prospecção (CRM, Sprint 11): a empresa-alvo com a classificação, a etapa, o contato e a próxima ação; abas
 * Interações, Oportunidades e Histórico. Registrar interação, Abrir oportunidade, Converter em cliente (como o lead do
 * SAP B1 que passa a cliente) e Descartar com motivo.
 */
export function LeadWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can, user } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [lead, setLead] = useState<Lead | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(() => ({ ...VAZIO, owner: user.username }));
  const [tab, setTab] = useState<Tab>('interacoes');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [interacao, setInteracao] = useState(false);
  const [converter, setConverter] = useState(false);
  const [interacoes, setInteracoes] = useState<Interaction[] | null>(null);
  // Cada recarga da ficha muda a rodada: a aba busca de novo e a resposta de uma rodada antiga é descartada.
  const [rodada, setRodada] = useState(0);
  const [oportunidades, setOportunidades] = useState<Opportunity[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const responsaveis = useResponsaveis();
  const chave = useRef(novaChave());

  const adicao = lead === null;
  const somenteLeitura = adicao ? !can('lead.create') : !can('lead.update');
  const original = useMemo(() => (lead ? toForm(lead) : { ...VAZIO, owner: user.username }), [lead, user.username]);
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original), [form, original, somenteLeitura]);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((l: Lead, etagLido?: string) => {
    setLead(l);
    setId(l.id);
    setEtag(etagLido ?? `"${l.version}"`);
    setForm(toForm(l));
    setErros({});
    setHistorico(null);
    setInteracoes(null);
    setOportunidades(null);
    setRodada((n) => n + 1);
  }, []);

  const carregar = useCallback(async (lid: string) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const r = await api.get<Lead>(`/api/v1/leads/${lid}`);
      aplicar(r.data, r.etag);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setCarregando(false);
    }
  }, [aplicar]);

  useEffect(() => {
    if (id) void carregar(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Oportunidade aberta ou alterada em outra janela: a aba e a contagem acompanham (sem perder o que foi digitado).
  const alteradoRef = useRef(alterado);
  alteradoRef.current = alterado;
  useEffect(() => {
    if (!id) return;
    const r = () => {
      setOportunidades(null);
      if (!alteradoRef.current) void carregar(id);
    };
    window.addEventListener(OPORTUNIDADES_ALTERADAS, r);
    return () => window.removeEventListener(OPORTUNIDADES_ALTERADAS, r);
  }, [id, carregar]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    const falhaAba = (e: ApiError) => vivo && winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` });
    if (tab === 'interacoes' && interacoes === null) {
      api.get<Interaction[]>(`/api/v1/leads/${id}/interactions`).then((r) => vivo && setInteracoes(r.data)).catch(falhaAba);
    } else if (tab === 'oportunidades' && oportunidades === null && can('opportunity.read')) {
      api.get<Opportunity[]>(`/api/v1/leads/${id}/opportunities`).then((r) => vivo && setOportunidades(r.data)).catch(falhaAba);
    } else if (tab === 'historico' && historico === null) {
      api.get<HistoryEntry[]>(`/api/v1/leads/${id}/history`).then((r) => vivo && setHistorico(r.data)).catch(falhaAba);
    }
    return () => {
      vivo = false;
    };
    // `rodada` refaz a busca mesmo quando a aba já estava vazia antes da recarga.
  }, [tab, id, rodada, interacoes === null, oportunidades === null, historico === null, can]); // eslint-disable-line react-hooks/exhaustive-deps

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    tratarFalha(e, { objeto: 'A prospecção', notify: winRef.current.notify, setErros, setConflito });
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = lead
        ? await api.put<Lead>(`/api/v1/leads/${lead.id}`, body, etag)
        : await api.post<Lead>('/api/v1/leads', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Prospecção ${r.data.code} ${lead ? 'atualizada' : 'adicionada'} com sucesso` });
      window.dispatchEvent(new Event(PROSPECCOES_ALTERADAS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [lead, etag, falha, aplicar]);

  const comando = async (caminho: string, corpo: unknown, sucesso: (l: Lead) => string) => {
    if (!lead) return;
    try {
      const r = await api.post<Lead>(`/api/v1/leads/${lead.id}/${caminho}`, corpo, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: sucesso(r.data) });
      window.dispatchEvent(new Event(PROSPECCOES_ALTERADAS));
      window.dispatchEvent(new Event(OPORTUNIDADES_ALTERADAS));
    } catch (e) {
      falha(e);
    }
  };

  const descartada = lead?.stage === 'DESCARTADO';
  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  const podeInteragir = !!lead && !descartada && !alterado && can('lead.update');
  const podeAbrirOportunidade = !!lead && !descartada && !alterado && can('opportunity.create');
  const podeConverter = !!lead && !lead.customerId && !alterado && can('lead.update') && can('partner.create');
  const podeDescartar = !!lead && !descartada && !alterado && can('lead.update');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const abrirOportunidade = () => lead && win.open('opportunity', `${novaOportunidade()}:lead:${lead.id}`);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const dialogo = descartar || interacao || converter || conflito !== null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dialogo) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { i: 'interacoes', o: 'oportunidades', h: 'historico' };
      if (alvo[k] && id) setTab(alvo[k]);
      else if (k === 'r' && podeInteragir) setInteracao(true);
      else if (k === 'b' && podeAbrirOportunidade) abrirOportunidade();
      else if (k === 'c' && podeConverter) setConverter(true);
      else if (k === 'd' && podeDescartar) setDescartar(true);
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
  const erroDireita = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  const emAdicao = adicao && !somenteLeitura;
  const opcoesResponsaveis = responsaveis.map((r) => ({ valor: r.username, rotulo: r.displayName === r.username ? r.username : `${r.displayName} (${r.username})` }));
  if (form.owner && !opcoesResponsaveis.some((o) => o.valor === form.owner)) opcoesResponsaveis.unshift({ valor: form.owner, rotulo: form.owner });
  const etapas = descartada
    ? [{ valor: 'DESCARTADO', rotulo: 'Descartado' }, { valor: 'IDENTIFICADO', rotulo: 'Identificado (reabrir)' }, { valor: 'CONTATADO', rotulo: 'Contatado (reabrir)' }, { valor: 'INTERESSADO', rotulo: 'Interessado (reabrir)' }]
    : [{ valor: 'IDENTIFICADO', rotulo: 'Identificado' }, { valor: 'CONTATADO', rotulo: 'Contatado' }, { valor: 'INTERESSADO', rotulo: 'Interessado' }];

  const tabs: [Tab, ReactNode][] = [
    ['interacoes', <span><u>I</u>nterações</span>],
    ['oportunidades', <span><u>O</u>portunidades ({lead?.openOpportunities ?? 0} abertas)</span>],
    ['historico', <span><u>H</u>istórico</span>],
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
                <span className="rp-label">Código</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly value={lead?.code ?? 'Gerado ao adicionar'} aria-label="Código" />
                <label className="rp-label" htmlFor={fid('empresa')}>Empresa</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('empresa')} className={classeCampo} value={form.companyName} maxLength={200} readOnly={somenteLeitura} aria-invalid={!!erros.companyName}
                  onChange={(e) => set({ companyName: e.target.value })} autoFocus={adicao} />
                {erroDe('companyName')}
                <label className="rp-label" htmlFor={fid('fantasia')}>Nome comercial</label>
                <span />
                <input id={fid('fantasia')} className={classeCampo} value={form.tradeName} maxLength={200} readOnly={somenteLeitura} onChange={(e) => set({ tradeName: e.target.value })} />
                <label className="rp-label" htmlFor={fid('cidade')}>Cidade / UF</label>
                <span />
                <span className="rp-ficha__ref">
                  <input id={fid('cidade')} className={classeCampo} value={form.city} maxLength={120} readOnly={somenteLeitura} onChange={(e) => set({ city: e.target.value })} />
                  <input className={`${classeCampo} rp-ficha__col-uf`} aria-label="UF" value={form.state} maxLength={2} readOnly={somenteLeitura} aria-invalid={!!erros.state}
                    onChange={(e) => set({ state: e.target.value.toUpperCase() })} />
                </span>
                {erroDe('state')}
                <label className="rp-label" htmlFor={fid('renda')}>Possui Renda+</label>
                <span />
                <Selecao id={fid('renda')} className={classeCampo} valor={form.hasRenda} disabled={somenteLeitura} onChange={(v) => set({ hasRenda: v })}
                  opcoes={Object.entries(RENDA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                <label className="rp-label" htmlFor={fid('estrelas')}>Classificação</label>
                <span />
                <Selecao id={fid('estrelas')} className={classeCampo} valor={form.rating} disabled={somenteLeitura} aria-invalid={!!erros.rating} onChange={(v) => set({ rating: v })}
                  opcoes={[{ valor: '', rotulo: 'Sem classificação (desconhecida)' }, ...[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), rotulo: `${estrelas(n)} — ${n} de 5` }))]} />
                {erroDe('rating')}
                <label className="rp-label" htmlFor={fid('origem')}>Origem</label>
                <span />
                <Selecao id={fid('origem')} className={classeCampo} valor={form.source} disabled={somenteLeitura} onChange={(v) => set({ source: v })} opcoes={opcoesOrigem} />
                <label className="rp-label" htmlFor={fid('contato')}>Contato</label>
                <span />
                <input id={fid('contato')} className={classeCampo} value={form.contactName} maxLength={120} readOnly={somenteLeitura} onChange={(e) => set({ contactName: e.target.value })} />
                <label className="rp-label" htmlFor={fid('telefone')}>Telefone / e-mail</label>
                <span />
                <span className="rp-ficha__ref">
                  <input id={fid('telefone')} className={classeCampo} value={form.contactPhone} maxLength={40} readOnly={somenteLeitura} onChange={(e) => set({ contactPhone: e.target.value })} />
                  <input className={classeCampo} aria-label="E-mail" value={form.contactEmail} maxLength={200} readOnly={somenteLeitura} aria-invalid={!!erros.contactEmail}
                    onChange={(e) => set({ contactEmail: e.target.value })} />
                </span>
                {erroDe('contactEmail')}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {lead ? seloProspeccao(lead.stage) : <span className="rp-badge">Nova</span>}
                  {lead?.imported && <span className="rp-badge rp-janela-mdi__selo">Carga da lista</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <label className="rp-label" htmlFor={fid('etapa')}>Etapa</label>
                <Selecao id={fid('etapa')} className={classeCampo} valor={form.stage} disabled={somenteLeitura} onChange={(v) => set({ stage: v })} opcoes={etapas} />
                {lead?.discardReason && descartada && (
                  <>
                    <span className="rp-label">Motivo do descarte</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do descarte" value={lead.discardReason} />
                  </>
                )}
                <label className="rp-label" htmlFor={fid('resp')}>Responsável</label>
                <Selecao id={fid('resp')} className={classeCampo} valor={form.owner} disabled={somenteLeitura} onChange={(v) => set({ owner: v })} opcoes={opcoesResponsaveis} />
                <label className="rp-label" htmlFor={fid('prox-data')}>Próxima ação em</label>
                <CampoData id={fid('prox-data')} rotulo="Próxima ação em" className={`${classeCampo} rp-field--curto`} valor={form.nextActionDate} somenteLeitura={somenteLeitura}
                  invalido={!!erros.nextActionDate} onChange={(v) => set({ nextActionDate: v })} />
                {erroDireita('nextActionDate')}
                <label className="rp-label" htmlFor={fid('prox-nota')}>Próxima ação</label>
                <input id={fid('prox-nota')} className={classeCampo} value={form.nextActionNote} maxLength={300} readOnly={somenteLeitura} aria-invalid={!!erros.nextActionNote}
                  onChange={(e) => set({ nextActionNote: e.target.value })} />
                {erroDireita('nextActionNote')}
                <span className="rp-label">Última interação</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Última interação" value={dataDaApi(lead?.lastInteraction)} />
                <span className="rp-label">Cliente</span>
                <span className="rp-ficha__ref">
                  {lead?.customerId && (
                    <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir cliente" title="Abrir cliente"
                      onClick={() => win.open('customer', lead.customerId!)} onKeyDown={(e) => e.key === 'Enter' && win.open('customer', lead.customerId!)} />
                  )}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente" value={lead?.customerId ? `${lead.customerCode} — ${lead.customerName}` : 'Ainda não é cliente'} />
                </span>
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={lead?.version ?? ''} aria-label="Versão" />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={id ? 0 : -1} aria-selected={tab === t} aria-disabled={!id || undefined}
                  title={id ? undefined : 'Disponível depois de adicionar a prospecção'} onClick={() => id && setTab(t)} onKeyDown={(e) => e.key === 'Enter' && id && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : !id ? (
                <p className="rp-janela-mdi__aviso">
                  <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Adicione a prospecção para registrar interações e abrir oportunidades.
                </p>
              ) : tab === 'interacoes' ? (
                <GradeInteracoes interacoes={interacoes} rotulo="Interações da prospecção" />
              ) : tab === 'oportunidades' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  {!can('opportunity.read') ? (
                    <p className="rp-janela-mdi__aviso">Seu perfil não vê oportunidades (opportunity.read).</p>
                  ) : (
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Oportunidades da prospecção">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th aria-label="Abrir" />
                          <th>Nº</th>
                          <th>Nome</th>
                          <th>Etapa</th>
                          <th className="num">Potencial</th>
                          <th className="num">%</th>
                          <th className="num">Ponderado</th>
                          <th>Próxima ação</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(oportunidades ?? []).map((o, i) => (
                          <tr key={o.id} onDoubleClick={() => win.open('opportunity', o.id)}>
                            <td className="rownum">{i + 1}</td>
                            <td>
                              <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir oportunidade ${o.code}`} title={`Abrir oportunidade ${o.code}`}
                                onClick={() => win.open('opportunity', o.id)} onKeyDown={(e) => e.key === 'Enter' && win.open('opportunity', o.id)} />
                            </td>
                            <td>{o.code}</td>
                            <td>{o.name}</td>
                            <td>{o.stageName}</td>
                            <td className="num">{reais(o.potentialCents)}</td>
                            <td className="num">{pct(o.closePercent)}</td>
                            <td className="num">{reais(o.weightedCents)}</td>
                            <td>{o.nextActionDate ? `${dataDaApi(o.nextActionDate)} — ${o.nextActionNote ?? ''}` : ''}</td>
                            <td>{seloOportunidade(o.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico da prospecção" />
              )}
            </div>
            <div className="rp-ficha__rodape">
              <div className="rp-form rp-ficha__obs">
                <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                <textarea id={fid('obs')} className={`${classeCampo} rp-field--note`} rows={2} maxLength={2000} readOnly={somenteLeitura} value={form.notes}
                  onChange={(e) => set({ notes: e.target.value })} />
              </div>
              {lead && <span className="rp-ficha__antes">Cadastrada em {dataHora(lead.createdAt)} por {lead.createdBy}</span>}
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
          {podeInteragir && (
            <button type="button" className="rp-btn" onClick={() => setInteracao(true)}>
              <span><u>R</u>egistrar interação</span>
            </button>
          )}
          {podeAbrirOportunidade && (
            <button type="button" className="rp-btn" onClick={abrirOportunidade}>
              <span>A<u>b</u>rir oportunidade</span>
            </button>
          )}
          {podeConverter && (
            <button type="button" className="rp-btn" onClick={() => setConverter(true)}>
              <span><u>C</u>onverter em cliente</span>
            </button>
          )}
          {podeDescartar && (
            <button type="button" className="rp-btn" onClick={() => setDescartar(true)}>
              <span><u>D</u>escartar</span>
            </button>
          )}
        </div>
      </div>

      {interacao && lead && (
        <DialogoInteracao caminho={`/api/v1/leads/${lead.id}/interactions`} idBase={fid('int')} contato={lead.contactName} proximaObrigatoria={false}
          onCancelar={() => setInteracao(false)}
          onRegistrada={(i) => {
            setInteracao(false);
            winRef.current.notify({ tone: 'sucesso', text: `Interação de ${dataDaApi(i.occurredOn)} registrada com sucesso na prospecção ${lead.code}` });
            window.dispatchEvent(new Event(PROSPECCOES_ALTERADAS));
            setTab('interacoes');
            void carregar(lead.id);
          }}
          onFalha={(e) => {
            setInteracao(false);
            falha(e);
          }} />
      )}

      {converter && lead && (
        <Dialog icon="info" label="Converter em cliente" onEscape={() => setConverter(false)}
          buttons={[
            {
              label: 'Converter', primary: true, onClick: () => {
                setConverter(false);
                void comando('customer', null, (l) => `Cliente ${l.customerCode} adicionado com sucesso a partir da prospecção ${l.code}`);
              },
            },
            { label: 'Cancelar', onClick: () => setConverter(false) },
          ]}>
          {lead.companyName} vira cliente, com a unidade {lead.city ?? 'Matriz'}{lead.state ? `/${lead.state}` : ''}
          {lead.contactName ? ` e o contato ${lead.contactName}` : ''}. As oportunidades da prospecção passam a ter o cliente.
          <br />
          Confira em Clientes e unidades se a empresa já não está cadastrada: o sistema não une cadastros sozinho.
        </Dialog>
      )}

      {descartar && lead && (
        <DialogoMotivo rotulo="Descartar prospecção" texto={`A prospecção ${lead.code} sai da agenda; ela pode ser reaberta depois pela etapa.`} idCampo={fid('motivo')}
          botao="Descartar" falta="Informe o motivo do descarte." onCancelar={() => setDescartar(false)}
          onConfirmar={(m) => {
            setDescartar(false);
            void comando('discard', { reason: m }, (l) => `Prospecção ${l.code} descartada com sucesso`);
          }} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Prospecção alterada por outra pessoa" objeto="A prospecção" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
