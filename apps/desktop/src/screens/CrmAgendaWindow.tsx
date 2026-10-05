import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { dataDaApi, dataParaApi, hojeIso } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { novaChave } from './comum/Cadastros';
import {
  avisarCrm, classeSelo, COR_ATIVIDADE, CRM_ALTERADO, ICONE_ATIVIDADE, SITUACAO_ATIVIDADE, TIPO_ATIVIDADE, type Atividade, type OportunidadeLinha,
} from './comum/CrmMock';
import { Seta, useApi } from './comum/Ficha';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

const HPX = 46;
const HORA_INICIO = 8;
const HORAS = 10;
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const segunda = (s: string) => {
  const d = dia(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};
const somar = (s: string, n: number) => {
  const d = dia(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const minutos = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Faixas lado a lado para as atividades do dia que se sobrepõem no horário. */
const faixas = (eventos: Atividade[]) => {
  const fim = (e: Atividade) => minutos(e.startTime) + Math.max(e.durationMin, 34);
  const ordem = [...eventos].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const lugar = new Map<string, { faixa: number; de: number }>();
  let grupo: Atividade[] = [];
  let ate = -1;
  const fechar = () => {
    const ocupadas: number[] = [];
    const daFaixa = grupo.map((e) => {
      let f = ocupadas.findIndex((t) => t <= minutos(e.startTime));
      if (f < 0) f = ocupadas.length;
      ocupadas[f] = fim(e);
      return f;
    });
    grupo.forEach((e, i) => lugar.set(e.id, { faixa: daFaixa[i], de: ocupadas.length }));
  };
  for (const e of ordem) {
    if (grupo.length && minutos(e.startTime) >= ate) (fechar(), (grupo = []));
    grupo.push(e);
    ate = Math.max(grupo.length > 1 ? ate : 0, fim(e));
  }
  if (grupo.length) fechar();
  return lugar;
};

const tituloSemana = (ini: string) => {
  const fim = somar(ini, 4);
  const [d1, m1] = [Number(ini.slice(8, 10)), Number(ini.slice(5, 7)) - 1];
  const [d2, m2] = [Number(fim.slice(8, 10)), Number(fim.slice(5, 7)) - 1];
  return m1 === m2 ? `${d1} a ${d2} de ${MES[m2]}` : `${d1} de ${MES[m1]} a ${d2} de ${MES[m2]}`;
};

type Nova = { kind: string; subject: string; day: string; startTime: string; durationMin: string; opportunityId: string; leadId: string; owner: string };

/**
 * Atividades e agenda do mock (CRM-Atividades): semana com as setas e Hoje, Responsável e Tipo; Agenda da semana (dias
 * de segunda a sexta, 8h às 17h, eventos coloridos pelo tipo) ou Lista; à direita a atividade escolhida com as
 * anotações, Concluir e Reagendar. Nova atividade embaixo, com a legenda dos tipos.
 */
export function CrmAgendaWindow({ recordKey = 'singleton' }: { recordKey?: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can, user } = useSession();
  const hoje = hojeIso();
  const [inicio, setInicio] = useState(segunda(hoje));
  const [dono, setDono] = useState('');
  const [tipo, setTipo] = useState('');
  const [visao, setVisao] = useState<'agenda' | 'lista'>('agenda');
  const [linhas, setLinhas] = useState<Atividade[] | null>(null);
  const [sel, setSel] = useState<string | null>(recordKey.startsWith('ativ:') ? recordKey.slice(5) : null);
  const [notas, setNotas] = useState('');
  const [nova, setNova] = useState<Nova | null>(null);
  const [reagendar, setReagendar] = useState<{ day: string; startTime: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const chave = useRef(novaChave());
  const donos = useApi<{ username: string; displayName: string }[]>('/api/v1/crm/owners', []);
  const ops = useApi<OportunidadeLinha[]>('/api/v1/crm/opportunity-board', []);
  const podeEditar = can('opportunity.update');

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ from: inicio, to: somar(inicio, 6), ...(dono ? { owner: dono } : {}), ...(tipo ? { kind: tipo } : {}) });
      const r = await api.get<Atividade[]>(`/api/v1/crm/activities?${q}`);
      setLinhas(r.data);
    } catch (e) {
      const x = e as ApiError;
      setLinhas([]);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [inicio, dono, tipo]);
  useEffect(() => {
    void carregar();
    const f = () => void carregar();
    window.addEventListener(CRM_ALTERADO, f);
    return () => window.removeEventListener(CRM_ALTERADO, f);
  }, [carregar]);

  // Aberta por uma atividade (seta da oportunidade): vai à semana dela. Aberta para registrar: já com a nova atividade.
  useEffect(() => {
    if (recordKey.startsWith('ativ:')) {
      api.get<Atividade>(`/api/v1/crm/activities/${recordKey.slice(5)}`).then((r) => setInicio(segunda(r.data.day))).catch(() => undefined);
    } else if (recordKey.startsWith('novo-opp:') || recordKey.startsWith('lead:')) {
      const opp = recordKey.startsWith('novo-opp:') ? recordKey.slice(9) : '';
      const lead = recordKey.startsWith('lead:') ? recordKey.slice(5) : '';
      setNova({ kind: 'LIGACAO', subject: '', day: dataDaApi(hoje), startTime: '09:00', durationMin: '30', opportunityId: opp, leadId: lead, owner: '' });
    }
  }, [recordKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const atual = (linhas ?? []).find((a) => a.id === sel) ?? (linhas ?? []).find((a) => a.day === hoje) ?? (linhas ?? [])[0] ?? null;
  useEffect(() => setNotas(atual?.notes ?? ''), [atual?.id, atual?.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => win.setDirty(!!atual && notas !== (atual.notes ?? '') && atual.status === 'PLANEJADA'), [notas, atual, win]);

  const falha = (e: unknown) => {
    const x = e as ApiError;
    const map: Record<string, string> = {};
    x.details?.forEach((d) => d.field && (map[d.field] = d.message));
    setErros(map);
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${x.details?.[0] ? ` ${x.details[0].message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
    return false;
  };
  const concluir = async () => {
    if (!atual) return;
    try {
      await api.post(`/api/v1/crm/activities/${atual.id}/completion`, { notes: notas }, { 'If-Match': `"${atual.version}"` });
      win.notify({ tone: 'sucesso', text: `Atividade concluída: ${atual.subject}` });
      avisarCrm();
    } catch (e) {
      falha(e);
    }
  };
  const salvarReagendamento = async () => {
    if (!atual || !reagendar) return;
    try {
      await api.put(`/api/v1/crm/activities/${atual.id}`, {
        kind: atual.kind, subject: atual.subject, day: dataParaApi(reagendar.day), startTime: reagendar.startTime, durationMin: atual.durationMin,
        partnerId: atual.partnerId, leadId: atual.leadId, opportunityId: atual.opportunityId, owner: atual.owner, notes: notas || null,
      }, `"${atual.version}"`);
      setReagendar(null);
      setErros({});
      win.notify({ tone: 'sucesso', text: `Atividade reagendada para ${reagendar.day} às ${reagendar.startTime}` });
      const d = dataParaApi(reagendar.day);
      if (d) setInicio(segunda(d));
      avisarCrm();
    } catch (e) {
      falha(e);
    }
  };
  const registrar = async () => {
    if (!nova) return;
    try {
      const r = await api.post<Atividade>('/api/v1/crm/activities', {
        kind: nova.kind, subject: nova.subject, day: dataParaApi(nova.day), startTime: nova.startTime, durationMin: Number(nova.durationMin) || 60,
        opportunityId: nova.opportunityId || null, leadId: nova.leadId || null, partnerId: null, owner: nova.owner || null, notes: null,
      }, { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      setNova(null);
      setErros({});
      setInicio(segunda(r.data.day));
      setSel(r.data.id);
      win.notify({ tone: 'sucesso', text: `Atividade registrada: ${r.data.subject}` });
      avisarCrm();
    } catch (e) {
      falha(e);
    }
  };
  const abrirNova = useCallback(() => setNova({ kind: 'REUNIAO', subject: '', day: dataDaApi(hoje), startTime: '09:00', durationMin: '60', opportunityId: '', leadId: '', owner: '' }), [hoje]);
  const novo = useMemo(() => (podeEditar ? abrirNova : undefined), [podeEditar, abrirNova]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);

  const dias = SEMANA.map((rot, i) => {
    const d = somar(inicio, i);
    return { d, rot: `${rot} ${d.slice(8, 10)}/${d.slice(5, 7)}${d === hoje ? ' · hoje' : ''}`, hoje: d === hoje, eventos: (linhas ?? []).filter((a) => a.day === d) };
  });
  const listadas = [...(linhas ?? [])].filter((a) => a.day <= somar(inicio, 4));
  const concluidas = listadas.filter((a) => a.status === 'CONCLUIDA').length;
  const atrasadas = listadas.filter((a) => a.situation === 'ATRASADA').length;
  const fid = (k: string) => `${win.windowId}-${k}`;
  const nomeDono = (u: string) => donos.find((d) => d.username === u)?.displayName ?? u;
  const opsAbertas = ops.filter((o) => o.status === 'ABERTA');

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-agenda">
        <div className="rp-agenda__topo">
          <div className="rp-agenda__semana" role="group" aria-label="Semana">
            <button type="button" className="rp-tool" aria-label="Semana anterior" title="Semana anterior" onClick={() => setInicio(somar(inicio, -7))}><i className="rp-ico rp-ico-anterior" aria-hidden="true" /></button>
            <span aria-live="polite">{tituloSemana(inicio)}</span>
            <button type="button" className="rp-tool" aria-label="Próxima semana" title="Próxima semana" onClick={() => setInicio(somar(inicio, 7))}><i className="rp-ico rp-ico-proximo" aria-hidden="true" /></button>
            <button type="button" className="rp-btn rp-agenda__hoje" onClick={() => setInicio(segunda(hoje))}>Hoje</button>
          </div>
          <label className="rp-agenda__par"><span className="rp-cal__rot">Responsável</span>
            <Selecao aria-label="Responsável" valor={dono} onChange={setDono} largura="180px" opcoes={[{ valor: '', rotulo: 'Todos' }, ...donos.map((d) => ({ valor: d.username, rotulo: d.displayName }))]} />
          </label>
          <label className="rp-agenda__par"><span className="rp-cal__rot">Tipo</span>
            <Selecao aria-label="Tipo" valor={tipo} onChange={setTipo} largura="140px" opcoes={[{ valor: '', rotulo: 'Todos' }, ...Object.entries(TIPO_ATIVIDADE).map(([valor, rotulo]) => ({ valor, rotulo }))]} />
          </label>
          <div className="rp-agenda__modos" role="group" aria-label="Modo de exibição">
            <button type="button" className="rp-tab rp-agenda__modo" aria-pressed={visao === 'agenda'} onClick={() => setVisao('agenda')}><i className="rp-ico rp-ico-calendario" aria-hidden="true" />Agenda da semana</button>
            <button type="button" className="rp-tab rp-agenda__modo" aria-pressed={visao === 'lista'} onClick={() => setVisao('lista')}><i className="rp-ico rp-ico-relatorio-lista" aria-hidden="true" />Lista</button>
          </div>
        </div>
        <div className="rp-agenda__corpo">
          {visao === 'agenda' ? (
            <div className="rp-agenda__grade">
              <div className="rp-agenda__cab">
                <div />
                {dias.map((d) => <div key={d.d} className={d.hoje ? 'rp-agenda__dia--hoje' : undefined}>{d.rot}</div>)}
              </div>
              <div className="rp-agenda__rolagem rp-rolagem">
                <div className="rp-agenda__horas">
                  <div>{Array.from({ length: HORAS }, (_, h) => <div key={h} className="rp-agenda__hora">{String(HORA_INICIO + h).padStart(2, '0')}:00</div>)}</div>
                  {dias.map((d) => (
                    <div key={d.d} className={`rp-agenda__col${d.hoje ? ' rp-agenda__col--hoje' : ''}`}>
                      {Array.from({ length: HORAS }, (_, h) => <div key={h} className="rp-agenda__faixa" />)}
                      {(() => { const lugar = faixas(d.eventos); return d.eventos.map((e) => {
                        const { faixa, de } = lugar.get(e.id) ?? { faixa: 0, de: 1 };
                        const ini = minutos(e.startTime) - HORA_INICIO * 60;
                        const top = Math.max(0, (ini / 60) * HPX) + 1;
                        const alt = Math.max(26, (e.durationMin / 60) * HPX - 3);
                        return (
                          <button key={e.id} type="button" className={`rp-agenda__evento rp-agenda__evento--${COR_ATIVIDADE[e.kind]}`} aria-pressed={atual?.id === e.id}
                            style={{ top: `${top}px`, height: `${alt}px`, ...(de > 1 ? { left: `calc(${(faixa / de) * 100}% + 3px)`, right: 'auto', width: `calc(${100 / de}% - 6px)` } : {}) }} title={`${e.startTime.slice(0, 5)} · ${TIPO_ATIVIDADE[e.kind]} · ${e.subject}`} onClick={() => setSel(e.id)}>
                            <span className="rp-agenda__evento-hora"><i className={`rp-ico ${ICONE_ATIVIDADE[e.kind]}`} aria-hidden="true" />{e.startTime.slice(0, 5)}
                              {e.status === 'CONCLUIDA' && <span className="rp-agenda__feita">✓</span>}</span>
                            {alt >= 40 && <span>{e.subject}</span>}
                            {alt >= 56 && <span className="rp-agenda__evento-cli">{e.partnerName ?? e.leadName ?? ''}</span>}
                          </button>
                        );
                      }); })()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rp-grid-rolagem rp-rolagem rp-agenda__lista">
              <table className="rp-grid rp-crmops__tabela" aria-label="Atividades da semana">
                <thead><tr><th style={{ width: '34px' }}>#</th><th style={{ width: '86px' }}>Data</th><th style={{ width: '52px' }}>Hora</th><th style={{ width: '116px' }}>Tipo</th><th>Assunto</th>
                  <th>Cliente</th><th style={{ width: '108px' }}>Oportunidade</th><th style={{ width: '124px' }}>Responsável</th><th style={{ width: '100px' }}>Situação</th></tr></thead>
                <tbody>
                  {listadas.map((a, i) => (
                    <tr key={a.id} aria-selected={atual?.id === a.id} onClick={() => setSel(a.id)}>
                      <td className="rownum">{i}</td><td>{dataDaApi(a.day)}</td><td>{a.startTime.slice(0, 5)}</td>
                      <td><i className={`rp-ico ${ICONE_ATIVIDADE[a.kind]}`} aria-hidden="true" /> {TIPO_ATIVIDADE[a.kind]}</td>
                      <td title={a.subject}>{a.subject}</td><td title={a.partnerName ?? ''}>{a.partnerName ?? a.leadName}</td>
                      <td>{a.opportunityId && <><Seta titulo={`Abrir ${a.opportunityCode}`} abrir={() => win.open('opportunity', a.opportunityId!)} /> {a.opportunityCode}</>}</td>
                      <td>{nomeDono(a.owner)}</td><td><span className={classeSelo(SITUACAO_ATIVIDADE[a.situation])}>{SITUACAO_ATIVIDADE[a.situation]}</span></td>
                    </tr>
                  ))}
                  <LinhaResto colunas={9} />
                </tbody>
                <tfoot><tr><td colSpan={9}>{`${listadas.length} ${listadas.length === 1 ? 'atividade' : 'atividades'} · ${concluidas} ${concluidas === 1 ? 'concluída' : 'concluídas'} · ${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}`}</td></tr></tfoot>
              </table>
            </div>
          )}
          <aside className="rp-agenda__lado rp-rolagem" aria-label="Atividade selecionada">
            {atual ? (
              <>
                <fieldset className="rp-grupo rp-agenda__ficha">
                  <legend><i className={`rp-ico ${ICONE_ATIVIDADE[atual.kind]}`} aria-hidden="true" /> {TIPO_ATIVIDADE[atual.kind]}</legend>
                  <div className="rp-grupo-corpo">
                    <div className="rp-form rp-agenda__form">
                      <span className="rp-label">Assunto</span><input className="rp-field rp-field--readonly" aria-label="Assunto" value={atual.subject} readOnly title={atual.subject} />
                      <span className="rp-label">Data</span><input className="rp-field rp-field--readonly" aria-label="Data" value={dataDaApi(atual.day)} readOnly />
                      <span className="rp-label">Horário</span><input className="rp-field rp-field--readonly" aria-label="Horário" value={`${atual.startTime.slice(0, 5)} às ${atual.endTime.slice(0, 5)}`} readOnly />
                      <span className="rp-label rp-link-field"><Seta titulo="Abrir cliente" abrir={() => atual.partnerId && win.open('partner', `CLIENTE:${atual.partnerId}`)} />Cliente</span>
                      <input className="rp-field rp-field--readonly" aria-label="Cliente" value={atual.partnerName ?? atual.leadName ?? ''} readOnly />
                      <span className="rp-label rp-link-field"><Seta titulo="Abrir oportunidade" abrir={() => atual.opportunityId && win.open('opportunity', atual.opportunityId)} />Oportunidade</span>
                      <input className="rp-field rp-field--readonly" aria-label="Oportunidade" value={atual.opportunityCode ?? ''} readOnly />
                      <span className="rp-label">Responsável</span><input className="rp-field rp-field--readonly" aria-label="Responsável" value={nomeDono(atual.owner)} readOnly />
                      <span className="rp-label">Situação</span><span className={`${classeSelo(SITUACAO_ATIVIDADE[atual.situation])} rp-crmleads__selo`}>{SITUACAO_ATIVIDADE[atual.situation]}</span>
                    </div>
                  </div>
                </fieldset>
                <div className="rp-form rp-agenda__form">
                  <span className="rp-label">Anotações</span>
                  <textarea className="rp-field rp-field--note rp-agenda__notas" aria-label="Anotações" value={notas} maxLength={2000}
                    readOnly={!podeEditar || atual.status !== 'PLANEJADA'} onChange={(e) => setNotas(e.target.value)} />
                </div>
                <div className="rp-btn-row">
                  <button type="button" className="rp-btn rp-btn--default" disabled={!podeEditar || atual.status !== 'PLANEJADA'} onClick={() => void concluir()}>Concluir</button>
                  <button type="button" className="rp-btn" disabled={!podeEditar || atual.status !== 'PLANEJADA'}
                    onClick={() => setReagendar({ day: dataDaApi(atual.day), startTime: atual.startTime.slice(0, 5) })}>Reagendar</button>
                </div>
                <span className="rp-ficha-nota rp-agenda__nota">Atividades concluídas formam o histórico de contatos do cliente e da oportunidade.</span>
              </>
            ) : (
              <span className="rp-ficha-nota">Nenhuma atividade nesta semana.</span>
            )}
          </aside>
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div><button type="button" className="rp-btn rp-btn--default" disabled={!novo} onClick={novo}><span>Nova <u>a</u>tividade</span></button></div>
        <div className="rp-agenda__legenda">
          {Object.entries(TIPO_ATIVIDADE).map(([k, r]) => <span key={k}><span className={`rp-agenda__amostra rp-agenda__evento--${COR_ATIVIDADE[k]}`} />{r}</span>)}
        </div>
      </div>
      {nova && (
        <Dialog icon="info" label="Nova atividade" onEscape={() => setNova(null)}
          buttons={[{ label: 'Registrar', primary: true, onClick: () => void registrar() }, { label: 'Cancelar', onClick: () => (setNova(null), setErros({})) }]}>
          <div className="rp-form rp-msgbox__form rp-agenda__nova">
            <label className="rp-label" htmlFor={fid('n-tipo')}>Tipo</label>
            <Selecao id={fid('n-tipo')} valor={nova.kind} onChange={(v) => setNova({ ...nova, kind: v })} opcoes={Object.entries(TIPO_ATIVIDADE).map(([valor, rotulo]) => ({ valor, rotulo }))} />
            <label className="rp-label" htmlFor={fid('n-assunto')}>Assunto</label>
            <input id={fid('n-assunto')} className="rp-field" maxLength={200} value={nova.subject} aria-invalid={!!erros.subject} onChange={(e) => setNova({ ...nova, subject: e.target.value })} autoFocus />
            <label className="rp-label" htmlFor={fid('n-dia')}>Data</label>
            <CampoData id={fid('n-dia')} valor={nova.day} onChange={(v) => setNova({ ...nova, day: v })} invalido={!!erros.day} rotulo="Data" />
            <label className="rp-label" htmlFor={fid('n-hora')}>Hora</label>
            <input id={fid('n-hora')} className="rp-field" maxLength={5} value={nova.startTime} aria-invalid={!!erros.startTime} onChange={(e) => setNova({ ...nova, startTime: e.target.value })} />
            <label className="rp-label" htmlFor={fid('n-dur')}>Duração (min)</label>
            <input id={fid('n-dur')} className="rp-field rp-field--num" maxLength={4} value={nova.durationMin} onChange={(e) => setNova({ ...nova, durationMin: e.target.value.replace(/\D/g, '') })} />
            <label className="rp-label" htmlFor={fid('n-op')}>Oportunidade</label>
            <Selecao id={fid('n-op')} valor={nova.opportunityId} onChange={(v) => setNova({ ...nova, opportunityId: v })}
              opcoes={[{ valor: '', rotulo: nova.leadId ? 'Lead (sem oportunidade)' : 'Nenhuma' }, ...opsAbertas.map((o) => ({ valor: o.id, rotulo: `${o.code} — ${o.customerName ?? o.leadName ?? ''}` }))]} />
            <label className="rp-label" htmlFor={fid('n-resp')}>Responsável</label>
            <Selecao id={fid('n-resp')} valor={nova.owner} onChange={(v) => setNova({ ...nova, owner: v })}
              opcoes={[{ valor: '', rotulo: user.displayName }, ...donos.map((d) => ({ valor: d.username, rotulo: d.displayName }))]} />
          </div>
          {Object.keys(erros).length > 0 && <span className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {Object.values(erros)[0]}</span>}
        </Dialog>
      )}
      {reagendar && atual && (
        <Dialog icon="info" label="Reagendar atividade" onEscape={() => setReagendar(null)}
          buttons={[{ label: 'Reagendar', primary: true, onClick: () => void salvarReagendamento() }, { label: 'Cancelar', onClick: () => (setReagendar(null), setErros({})) }]}>
          Nova data e hora para "{atual.subject}".
          <div className="rp-form rp-msgbox__form">
            <label className="rp-label" htmlFor={fid('r-dia')}>Data</label>
            <CampoData id={fid('r-dia')} valor={reagendar.day} onChange={(v) => setReagendar({ ...reagendar, day: v })} invalido={!!erros.day} rotulo="Data" />
            <label className="rp-label" htmlFor={fid('r-hora')}>Hora</label>
            <input id={fid('r-hora')} className="rp-field" maxLength={5} value={reagendar.startTime} aria-invalid={!!erros.startTime} onChange={(e) => setReagendar({ ...reagendar, startTime: e.target.value })} />
          </div>
          {Object.keys(erros).length > 0 && <span className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {Object.values(erros)[0]}</span>}
        </Dialog>
      )}
    </>
  );
}
