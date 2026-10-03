import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Competitor, HistoryEntry, Interaction, Lead, Opportunity, OpportunityStageChange, ProposalSummary } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataHora, dataParaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave, useClientes, useUnidades } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { CampoDinheiro } from './comum/CampoDinheiro';
import {
  AMEACA, DialogoEtapa, DialogoInteracao, DialogoPerda, GradeInteracoes, INTERESSE, MOTIVO_PERDA, OPORTUNIDADES_ALTERADAS, opcoesOrigem, pct,
  PROSPECCOES_ALTERADAS, useEtapas, useResponsaveis,
} from './comum/Crm';
import { DialogoConflito } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { seloOportunidade, seloProposta } from './comum/Selos';
import { novaProposta, PROPOSTAS_ALTERADAS } from './ProposalsWindow';

type Tab = 'potencial' | 'etapas' | 'interacoes' | 'propostas' | 'concorrentes' | 'resumo' | 'historico';
type Concorrente = { name: string; threat: Competitor['threat']; notes: string };
type Form = {
  name: string; customerId: string; unitId: string; owner: string; source: string; interest: string; potential: string; expectedClose: string;
  notes: string; nextActionDate: string; nextActionNote: string; competitors: Concorrente[];
};

const VAZIO: Form = {
  name: '', customerId: '', unitId: '', owner: '', source: 'PROSPECCAO_ATIVA', interest: 'MEDIO', potential: '', expectedClose: '', notes: '',
  nextActionDate: '', nextActionNote: '', competitors: [],
};

const toForm = (o: Opportunity): Form => ({
  name: o.name, customerId: o.customerId ?? '', unitId: o.unitId ?? '', owner: o.owner, source: o.source, interest: o.interest,
  potential: centavos(o.potentialCents), expectedClose: dataDaApi(o.expectedClose), notes: o.notes ?? '', nextActionDate: dataDaApi(o.nextActionDate),
  nextActionNote: o.nextActionNote ?? '', competitors: o.competitors.map((c) => ({ name: c.name, threat: c.threat, notes: c.notes ?? '' })),
});

/** `novo-N:lead:{id}` ou `novo-N:cliente:{id}`: a oportunidade nova já vem da prospecção ou do cliente. */
const origemDaChave = (recordKey: string) => {
  const m = /^novo-\d+:(lead|cliente):(.+)$/.exec(recordKey);
  return m ? { tipo: m[1] as 'lead' | 'cliente', id: m[2] } : null;
};

/**
 * Ficha da oportunidade (CRM, Sprint 11), no desenho da Oportunidade de venda do SAP Business One: no cabeçalho o
 * parceiro (prospecção e cliente), o responsável e, à direita, a situação, a etapa com o percentual de fechamento e a
 * próxima ação, obrigatória enquanto aberta. Abas Potencial (valor, previsão, interesse e ponderado), Etapas, Interações,
 * Propostas, Concorrentes, Resumo (ganha ou perdida) e Histórico.
 */
export function OpportunityWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can, user } = useSession();
  const origem = useMemo(() => origemDaChave(recordKey), [recordKey]);
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(() => ({ ...VAZIO, owner: user.username, customerId: origem?.tipo === 'cliente' ? origem.id : '' }));
  const [tab, setTab] = useState<Tab>('potencial');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [mudarEtapa, setMudarEtapa] = useState(false);
  const [errosEtapa, setErrosEtapa] = useState<Record<string, string>>({});
  const [interacao, setInteracao] = useState(false);
  const [perda, setPerda] = useState(false);
  const [etapasHist, setEtapasHist] = useState<OpportunityStageChange[] | null>(null);
  const [interacoes, setInteracoes] = useState<Interaction[] | null>(null);
  const [propostas, setPropostas] = useState<ProposalSummary[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const etapas = useEtapas();
  const responsaveis = useResponsaveis();
  const clientes = useClientes();
  const unidades = useUnidades(form.customerId);
  const chave = useRef(novaChave());

  const adicao = opp === null;
  const aberta = !opp || opp.status === 'ABERTA';
  const somenteLeitura = adicao ? !can('opportunity.create') : !can('opportunity.update') || !aberta;
  const original = useMemo(
    () => (opp ? toForm(opp) : { ...VAZIO, owner: user.username, customerId: origem?.tipo === 'cliente' ? origem.id : lead?.customerId ?? '' }),
    [opp, user.username, origem, lead],
  );
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original), [form, original, somenteLeitura]);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  // Oportunidade nova a partir da prospecção: nome e cliente sugeridos por ela.
  useEffect(() => {
    if (origem?.tipo !== 'lead' || id) return;
    api.get<Lead>(`/api/v1/leads/${origem.id}`).then((r) => {
      setLead(r.data);
      setForm((f) => ({ ...f, customerId: r.data.customerId ?? '', name: f.name || `Balança — ${r.data.companyName}`, source: r.data.source }));
    }).catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [origem, id]);

  const aplicar = useCallback((o: Opportunity, etagLido?: string) => {
    setOpp(o);
    setId(o.id);
    setEtag(etagLido ?? `"${o.version}"`);
    setForm(toForm(o));
    setErros({});
    setEtapasHist(null);
    setInteracoes(null);
    setPropostas(null);
    setHistorico(null);
  }, []);

  const carregar = useCallback(async (oid: string) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const r = await api.get<Opportunity>(`/api/v1/opportunities/${oid}`);
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

  // A proposta emitida, ganha ou perdida em outra janela move a oportunidade: a ficha acompanha se nada foi digitado.
  const alteradoRef = useRef(alterado);
  alteradoRef.current = alterado;
  useEffect(() => {
    if (!id) return;
    const r = () => !alteradoRef.current && void carregar(id);
    window.addEventListener(PROPOSTAS_ALTERADAS, r);
    return () => window.removeEventListener(PROPOSTAS_ALTERADAS, r);
  }, [id, carregar]);

  useEffect(() => {
    if (!id) return;
    const falhaAba = (e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` });
    if (tab === 'etapas' && etapasHist === null) {
      api.get<OpportunityStageChange[]>(`/api/v1/opportunities/${id}/stages`).then((r) => setEtapasHist(r.data)).catch(falhaAba);
    } else if (tab === 'interacoes' && interacoes === null) {
      api.get<Interaction[]>(`/api/v1/opportunities/${id}/interactions`).then((r) => setInteracoes(r.data)).catch(falhaAba);
    } else if (tab === 'propostas' && propostas === null && can('proposal.read')) {
      api.get<ProposalSummary[]>(`/api/v1/opportunities/${id}/proposals`).then((r) => setPropostas(r.data)).catch(falhaAba);
    } else if (tab === 'historico' && historico === null) {
      api.get<HistoryEntry[]>(`/api/v1/opportunities/${id}/history`).then((r) => setHistorico(r.data)).catch(falhaAba);
    }
  }, [tab, id, etapasHist, interacoes, propostas, historico, can]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const campos = tratarFalha(e, { objeto: 'A oportunidade', notify: winRef.current.notify, setErros, setConflito });
    if (campos && Object.keys(campos).some((k) => ['potentialCents', 'expectedClose', 'interest', 'notes'].includes(k))) setTab('potencial');
    else if (campos && Object.keys(campos).some((k) => k.startsWith('competitors'))) setTab('concorrentes');
  }, []);

  const corpo = useCallback((f: Form) => ({
    name: f.name.trim() || null,
    leadId: opp?.leadId ?? (origem?.tipo === 'lead' ? origem.id : null),
    customerId: f.customerId || null,
    unitId: f.unitId || null,
    owner: f.owner || null,
    source: f.source,
    interest: f.interest,
    potentialCents: centavosParaApi(f.potential),
    expectedClose: dataParaApi(f.expectedClose),
    notes: f.notes.trim() || null,
    nextActionDate: dataParaApi(f.nextActionDate),
    nextActionNote: f.nextActionNote.trim() || null,
    competitors: f.competitors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), threat: c.threat, notes: c.notes.trim() || null })),
  }), [opp, origem]);

  const avisar = () => {
    window.dispatchEvent(new Event(OPORTUNIDADES_ALTERADAS));
    window.dispatchEvent(new Event(PROSPECCOES_ALTERADAS));
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = corpo(formRef.current);
      const r = opp
        ? await api.put<Opportunity>(`/api/v1/opportunities/${opp.id}`, body, etag)
        : await api.post<Opportunity>('/api/v1/opportunities', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Oportunidade ${r.data.code} ${opp ? 'atualizada' : 'adicionada'} com sucesso` });
      avisar();
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [opp, etag, falha, aplicar, corpo]);

  const comando = async (caminho: string, body: unknown, sucesso: (o: Opportunity) => string, erroDialogo?: (m: Record<string, string>) => void) => {
    if (!opp) return false;
    try {
      const r = await api.post<Opportunity>(`/api/v1/opportunities/${opp.id}/${caminho}`, body, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: sucesso(r.data) });
      avisar();
      return true;
    } catch (e) {
      const x = e as ApiError;
      if (erroDialogo && x.status === 422) {
        const m: Record<string, string> = {};
        x.details.forEach((d) => d.field && (m[d.field] = d.message));
        erroDialogo(m);
      } else falha(e);
      return false;
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  const podeEtapa = !!opp && aberta && !alterado && can('opportunity.update');
  const podeInteragir = !!opp && !alterado && can('opportunity.update');
  const podeProposta = !!opp && aberta && !!opp.customerId && !alterado && can('proposal.create');
  const podePerder = !!opp && aberta && !alterado && can('opportunity.update');
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const novaPropostaDaOportunidade = () => opp && win.open('proposal', `${novaProposta()}:opp:${opp.id}`);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setConcorrente = (i: number, patch: Partial<Concorrente>) =>
    setForm((f) => ({ ...f, competitors: f.competitors.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const dialogo = mudarEtapa || interacao || perda || conflito !== null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dialogo) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { t: 'potencial', e: 'etapas', n: 'interacoes', o: 'propostas', c: 'concorrentes', u: 'resumo', h: 'historico' };
      if (alvo[k] && (alvo[k] === 'potencial' || alvo[k] === 'concorrentes' || id)) setTab(alvo[k]);
      else if (k === 'm' && podeEtapa) setMudarEtapa(true);
      else if (k === 'r' && podeInteragir) setInteracao(true);
      else if (k === 'p' && podeProposta) novaPropostaDaOportunidade();
      else if (k === 'd' && podePerder) setPerda(true);
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
  const erroDe = (k: string, colunas = 3) =>
    erros[k] && (
      <>
        {Array.from({ length: colunas - 1 }, (_, i) => <span key={i} />)}
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  const emAdicao = adicao && !somenteLeitura;
  const etapaAtual = etapas.find((e) => e.code === opp?.stage) ?? etapas[0];
  const clienteFixo = !!opp?.customerId;
  const opcoesClientes = clientes
    .filter((c) => c.status === 'ATIVO' || c.id === form.customerId)
    .map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.legalName}` }));
  if (opp?.customerId && !opcoesClientes.some((o) => o.valor === opp.customerId)) {
    opcoesClientes.unshift({ valor: opp.customerId, rotulo: `${opp.customerCode} — ${opp.customerName}` });
  }
  const opcoesUnidades = [{ valor: '', rotulo: 'Sem unidade definida' }, ...unidades.map((u) => ({ valor: u.id, rotulo: u.name }))];
  if (opp?.unitId && !unidades.some((u) => u.id === opp.unitId)) opcoesUnidades.push({ valor: opp.unitId, rotulo: opp.unitName ?? '' });
  const opcoesResponsaveis = responsaveis.map((r) => ({ valor: r.username, rotulo: r.displayName === r.username ? r.username : `${r.displayName} (${r.username})` }));
  if (form.owner && !opcoesResponsaveis.some((o) => o.valor === form.owner)) opcoesResponsaveis.unshift({ valor: form.owner, rotulo: form.owner });
  const leadId = opp?.leadId ?? lead?.id ?? null;
  const leadRotulo = opp?.leadCode ? `${opp.leadCode} — ${opp.leadName}` : lead ? `${lead.code} — ${lead.companyName}` : 'Sem prospecção';
  // Ponderado na tela enquanto se digita: potencial × percentual da etapa (o servidor arredonda igual, meio para cima).
  const potencialDigitado = centavosParaApi(form.potential);
  const percentual = opp && !aberta ? opp.closePercent : etapaAtual?.closePercent ?? '0';
  const ponderado = potencialDigitado && /^\d+$/.test(potencialDigitado)
    ? ((BigInt(potencialDigitado) * BigInt(Math.round(Number(percentual) * 100)) + 5000n) / 10000n).toString()
    : null;

  const tabs: [Tab, ReactNode, boolean][] = [
    ['potencial', <span>Po<u>t</u>encial</span>, true],
    ['etapas', <span><u>E</u>tapas</span>, id !== null],
    ['interacoes', <span>I<u>n</u>terações</span>, id !== null],
    ['propostas', <span>Pr<u>o</u>postas</span>, id !== null],
    ['concorrentes', <span>Con<u>c</u>orrentes ({form.competitors.length})</span>, true],
    ['resumo', <span>Res<u>u</u>mo</span>, id !== null],
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
                <input className="rp-field rp-field--readonly" readOnly value={opp?.code ?? 'Gerado ao adicionar'} aria-label="Número" />
                <label className="rp-label" htmlFor={fid('nome')}>Nome</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('nome')} className={classeCampo} value={form.name} maxLength={200} readOnly={somenteLeitura} aria-invalid={!!erros.name}
                  onChange={(e) => set({ name: e.target.value })} />
                {erroDe('name')}
                <span className="rp-label">Prospecção</span>
                <span />
                <span className="rp-ficha__ref">
                  {leadId && (
                    <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir prospecção" title="Abrir prospecção"
                      onClick={() => win.open('lead', leadId)} onKeyDown={(e) => e.key === 'Enter' && win.open('lead', leadId)} />
                  )}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Prospecção" value={leadRotulo} />
                </span>
                <label className="rp-label" htmlFor={fid('cliente')}>Cliente</label>
                <span className={leadId ? undefined : 'rp-req'} aria-hidden="true">{leadId ? '' : '*'}</span>
                <span className="rp-ficha__ref">
                  {opp?.customerId && (
                    <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir cliente" title="Abrir cliente"
                      onClick={() => win.open('customer', opp.customerId!)} onKeyDown={(e) => e.key === 'Enter' && win.open('customer', opp.customerId!)} />
                  )}
                  <Selecao id={fid('cliente')} className={classeCampo} valor={form.customerId} disabled={somenteLeitura || clienteFixo} aria-invalid={!!erros.customerId}
                    onChange={(v) => set({ customerId: v, unitId: '' })}
                    opcoes={[{ valor: '', rotulo: leadId ? 'Ainda não é cliente (converta a prospecção)' : 'Escolha o cliente' }, ...opcoesClientes]} />
                </span>
                {erroDe('customerId')}
                <label className="rp-label" htmlFor={fid('unidade')}>Unidade</label>
                <span />
                <Selecao id={fid('unidade')} className={classeCampo} valor={form.unitId} disabled={somenteLeitura || !form.customerId} aria-invalid={!!erros.unitId}
                  onChange={(v) => set({ unitId: v })} opcoes={opcoesUnidades} />
                {erroDe('unitId')}
                <label className="rp-label" htmlFor={fid('resp')}>Responsável</label>
                <span />
                <Selecao id={fid('resp')} className={classeCampo} valor={form.owner} disabled={somenteLeitura} aria-invalid={!!erros.owner}
                  onChange={(v) => set({ owner: v })} opcoes={opcoesResponsaveis} />
                {erroDe('owner')}
                <label className="rp-label" htmlFor={fid('origem')}>Origem</label>
                <span />
                <Selecao id={fid('origem')} className={classeCampo} valor={form.source} disabled={somenteLeitura} onChange={(v) => set({ source: v })} opcoes={opcoesOrigem} />
              </div>
              <div className={`rp-form rp-ficha__situacao${emAdicao ? ' rp-form--adicao' : ''}`}>
                <span className="rp-label">Situação</span>
                <span>
                  {opp ? seloOportunidade(opp.status) : <span className="rp-badge">Nova</span>}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Etapa</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Etapa" value={opp ? opp.stageName : etapaAtual?.name ?? ''} />
                <span className="rp-label">Fechamento</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Percentual de fechamento" value={pct(percentual)} />
                <label className="rp-label rp-label--req" htmlFor={fid('prox-data')}>Próxima ação em</label>
                <CampoData id={fid('prox-data')} rotulo="Próxima ação em" className={`${classeCampo} rp-field--curto`} valor={form.nextActionDate} somenteLeitura={somenteLeitura}
                  invalido={!!erros.nextActionDate} onChange={(v) => set({ nextActionDate: v })} />
                {erroDe('nextActionDate', 2)}
                <label className="rp-label rp-label--req" htmlFor={fid('prox-nota')}>Próxima ação</label>
                <input id={fid('prox-nota')} className={classeCampo} value={form.nextActionNote} maxLength={300} readOnly={somenteLeitura} aria-invalid={!!erros.nextActionNote}
                  onChange={(e) => set({ nextActionNote: e.target.value })} />
                {erroDe('nextActionNote', 2)}
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={opp?.version ?? ''} aria-label="Versão" />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, ativo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={ativo ? 0 : -1} aria-selected={tab === t} aria-disabled={!ativo || undefined}
                  title={ativo ? undefined : 'Disponível depois de adicionar a oportunidade'} onClick={() => ativo && setTab(t)} onKeyDown={(e) => e.key === 'Enter' && ativo && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'potencial' ? (
                <div className="rp-form rp-ficha__principal" aria-label="Potencial">
                  <label className="rp-label" htmlFor={fid('potencial')}>Valor potencial</label>
                  <span />
                  <CampoDinheiro id={fid('potencial')} className={`${classeCampo} rp-field--num`} value={form.potential} maxLength={20} readOnly={somenteLeitura}
                    aria-invalid={!!erros.potentialCents} onChange={(e) => set({ potential: e.target.value })}
                    onBlur={() => {
                      const c = centavosParaApi(form.potential);
                      if (c && /^\d+$/.test(c)) set({ potential: centavos(c) });
                    }} />
                  {erroDe('potentialCents')}
                  <span className="rp-label">Valor ponderado</span>
                  <span />
                  <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Valor ponderado"
                    value={ponderado === null ? '' : `${reais(ponderado)} (${pct(percentual)} de fechamento)`} />
                  <label className="rp-label" htmlFor={fid('previsao')}>Previsão de fechamento</label>
                  <span />
                  <CampoData id={fid('previsao')} rotulo="Previsão de fechamento" className={`${classeCampo} rp-field--curto`} valor={form.expectedClose} somenteLeitura={somenteLeitura}
                    invalido={!!erros.expectedClose} onChange={(v) => set({ expectedClose: v })} />
                  {erroDe('expectedClose')}
                  <label className="rp-label" htmlFor={fid('interesse')}>Nível de interesse</label>
                  <span />
                  <Selecao id={fid('interesse')} className={classeCampo} valor={form.interest} disabled={somenteLeitura} onChange={(v) => set({ interest: v })}
                    opcoes={Object.entries(INTERESSE).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                  <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                  <span />
                  <textarea id={fid('obs')} className={`${classeCampo} rp-field--note`} rows={3} maxLength={2000} readOnly={somenteLeitura} value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })} />
                </div>
              ) : tab === 'etapas' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Etapas da oportunidade">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Data e hora</th>
                        <th>Etapa</th>
                        <th>Situação</th>
                        <th className="num">% fechamento</th>
                        <th className="num">Potencial</th>
                        <th className="num">Ponderado</th>
                        <th>Usuário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(etapasHist ?? []).map((c, i) => (
                        <tr key={c.id}>
                          <td className="rownum">{i + 1}</td>
                          <td>{dataHora(c.changedAt)}</td>
                          <td>{c.toStageName}</td>
                          <td>{seloOportunidade(c.status)}</td>
                          <td className="num">{pct(c.closePercent)}</td>
                          <td className="num">{reais(c.potentialCents)}</td>
                          <td className="num">{reais(c.weightedCents)}</td>
                          <td>{c.changedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : tab === 'interacoes' ? (
                <GradeInteracoes interacoes={interacoes} rotulo="Interações da oportunidade" />
              ) : tab === 'propostas' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  {!can('proposal.read') ? (
                    <p className="rp-janela-mdi__aviso">Seu perfil não vê propostas (proposal.read).</p>
                  ) : (
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Propostas da oportunidade">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th aria-label="Abrir" />
                          <th>Nº</th>
                          <th>Título</th>
                          <th className="num">Rev.</th>
                          <th>Validade</th>
                          <th className="num">Total</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(propostas ?? []).map((p, i) => (
                          <tr key={p.id} onDoubleClick={() => win.open('proposal', p.id)}>
                            <td className="rownum">{i + 1}</td>
                            <td>
                              <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir proposta ${p.code}`} title={`Abrir proposta ${p.code}`}
                                onClick={() => win.open('proposal', p.id)} onKeyDown={(e) => e.key === 'Enter' && win.open('proposal', p.id)} />
                            </td>
                            <td>{p.code}</td>
                            <td>{p.title}</td>
                            <td className="num">{p.revision}</td>
                            <td>{dataDaApi(p.validUntil)}</td>
                            <td className="num">{reais(p.totalCents)}</td>
                            <td>{seloProposta(p.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : tab === 'concorrentes' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Concorrentes">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Concorrente</th>
                        <th>Ameaça</th>
                        <th>Observação</th>
                        {!somenteLeitura && <th className="rp-ficha__col-x" aria-label="Retirar" />}
                      </tr>
                    </thead>
                    <tbody>
                      {form.competitors.map((c, i) => (
                        <tr key={i}>
                          <td className="rownum">{i + 1}</td>
                          <td>
                            <input className={classeCampo} aria-label={`Concorrente ${i + 1}`} value={c.name} maxLength={120} readOnly={somenteLeitura}
                              aria-invalid={!!erros[`competitors[${i}].name`]} onChange={(e) => setConcorrente(i, { name: e.target.value })} />
                          </td>
                          <td>
                            <Selecao className={classeCampo} aria-label={`Ameaça do concorrente ${i + 1}`} valor={c.threat} disabled={somenteLeitura}
                              onChange={(v) => setConcorrente(i, { threat: v as Concorrente['threat'] })} opcoes={Object.entries(AMEACA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                          </td>
                          <td>
                            <input className={classeCampo} aria-label={`Observação do concorrente ${i + 1}`} value={c.notes} maxLength={300} readOnly={somenteLeitura}
                              onChange={(e) => setConcorrente(i, { notes: e.target.value })} />
                          </td>
                          {!somenteLeitura && (
                            <td>
                              <button type="button" className="rp-btn" aria-label={`Retirar o concorrente ${i + 1}`}
                                onClick={() => set({ competitors: form.competitors.filter((_, j) => j !== i) })}>
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!somenteLeitura && (
                    <button type="button" className="rp-btn rp-ficha__nota" onClick={() => set({ competitors: [...form.competitors, { name: '', threat: 'MEDIA', notes: '' }] })}>
                      Incluir concorrente
                    </button>
                  )}
                </div>
              ) : tab === 'resumo' ? (
                <div className="rp-form rp-ficha__principal" aria-label="Resumo">
                  <span className="rp-label">Situação</span>
                  <span />
                  <span>{opp && seloOportunidade(opp.status)}</span>
                  {opp?.status === 'GANHA' && (
                    <>
                      <span className="rp-label">Pedido</span>
                      <span />
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Pedido ganho" value={opp.wonOrderCode ?? ''} />
                    </>
                  )}
                  {opp?.status === 'PERDIDA' && (
                    <>
                      <span className="rp-label">Motivo da perda</span>
                      <span />
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo da perda" value={opp.lossReason ? MOTIVO_PERDA[opp.lossReason] : ''} />
                      <span className="rp-label">Detalhe</span>
                      <span />
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Detalhe da perda" value={opp.lossNote ?? ''} />
                    </>
                  )}
                  <span className="rp-label">Fechada em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Fechada em" value={opp?.closedAt ? dataHora(opp.closedAt) : 'Aberta'} />
                  <span className="rp-label">Aberta em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Aberta em" value={opp ? `${dataHora(opp.createdAt)} por ${opp.createdBy}` : ''} />
                  <span className="rp-label">Última interação</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Última interação" value={dataDaApi(opp?.lastInteraction)} />
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico da oportunidade" />
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
          {podeEtapa && (
            <button type="button" className="rp-btn" onClick={() => (setErrosEtapa({}), setMudarEtapa(true))}>
              <span><u>M</u>udar etapa</span>
            </button>
          )}
          {podeInteragir && (
            <button type="button" className="rp-btn" onClick={() => setInteracao(true)}>
              <span><u>R</u>egistrar interação</span>
            </button>
          )}
          {podeProposta && (
            <button type="button" className="rp-btn" onClick={novaPropostaDaOportunidade}>
              <span>Nova <u>p</u>roposta</span>
            </button>
          )}
          {podePerder && (
            <button type="button" className="rp-btn" onClick={() => setPerda(true)}>
              <span>Marcar como per<u>d</u>ida</span>
            </button>
          )}
        </div>
      </div>

      {mudarEtapa && opp && (
        <DialogoEtapa etapas={etapas} atual={opp.stage} idBase={fid('etapa')} erros={errosEtapa} onCancelar={() => setMudarEtapa(false)}
          onConfirmar={(etapa, data, nota) =>
            void comando('stage', { stage: etapa, nextActionDate: data, nextActionNote: nota || null },
              (o) => `Oportunidade ${o.code} na etapa ${o.stageName} (${pct(o.closePercent)})`, setErrosEtapa).then((ok) => ok && setMudarEtapa(false))} />
      )}

      {interacao && opp && (
        <DialogoInteracao caminho={`/api/v1/opportunities/${opp.id}/interactions`} idBase={fid('int')} proximaObrigatoria={aberta}
          onCancelar={() => setInteracao(false)}
          onRegistrada={(i) => {
            setInteracao(false);
            winRef.current.notify({ tone: 'sucesso', text: `Interação de ${dataDaApi(i.occurredOn)} registrada com sucesso na oportunidade ${opp.code}` });
            avisar();
            setTab('interacoes');
            void carregar(opp.id);
          }}
          onFalha={(e) => {
            setInteracao(false);
            falha(e);
          }} />
      )}

      {perda && opp && (
        <DialogoPerda texto={`A oportunidade ${opp.code} fica perdida e não muda mais. Se ela tem proposta aberta, registre a perda na proposta.`} idBase={fid('perda')}
          onCancelar={() => setPerda(false)}
          onConfirmar={(motivo, detalhe) => {
            setPerda(false);
            void comando('loss', { lossReason: motivo, lossNote: detalhe || null }, (o) => `Perda da oportunidade ${o.code} registrada com sucesso`);
          }} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Oportunidade alterada por outra pessoa" objeto="A oportunidade" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
