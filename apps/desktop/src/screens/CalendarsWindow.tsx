import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { hojeIso, numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito } from './comum/Dialogos';
import { Campo, GradeSimples, Linha, Marca, Secao } from './comum/Ficha';
import { Selecao } from './comum/Selecao';

type Calendario = { id: string; name: string; state: string | null; city: string | null; workdays: string; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null; version: number };
type Feriado = { day: string; description: string; kind: string };
type Jornada = { state: string; city: string; workdays: string; startTime: string; endTime: string; breakStart: string; breakEnd: string };

const TIPO: Record<string, string> = { NACIONAL: 'Nacional', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal', PONTO_FACULTATIVO: 'Ponto facultativo', EMPRESA: 'Empresa' };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
/** Ordem das caixas da jornada (Seg…Dom) e o índice no texto `workdays` do servidor (segunda a domingo). */
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const hh = (t: string | null) => (t ? t.slice(0, 5) : '');
const minutos = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN);
const iso = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const jornadaDe = (c: Calendario | undefined): Jornada => ({
  state: c?.state ?? '', city: c?.city ?? '', workdays: c?.workdays ?? 'SSSSSNN', startTime: hh(c?.startTime ?? '07:30'), endTime: hh(c?.endTime ?? '17:18'),
  breakStart: hh(c?.breakStart ?? null), breakEnd: hh(c?.breakEnd ?? null),
});

/**
 * Calendários e feriados do mock (Cadastros-Calendario): o calendário, o ano e a UF/município no topo com a legenda;
 * os doze meses com os dias úteis de cada um; à direita os feriados e datas especiais do ano (Adicionar data, Importar
 * nacionais) e a jornada de trabalho (dias, entrada/saída, intervalo, horas por dia e dias úteis no ano).
 */
export function CalendarsWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const podeEditar = can('calendar.admin');
  const [calendarios, setCalendarios] = useState<Calendario[]>([]);
  const [calId, setCalId] = useState('');
  const [ano, setAno] = useState(Number(hojeIso().slice(0, 4)));
  const [feriados, setFeriados] = useState<Feriado[] | null>(null);
  const [orig, setOrig] = useState<Feriado[]>([]);
  const [jornada, setJornada] = useState<Jornada>(jornadaDe(undefined));
  const [selDia, setSelDia] = useState<string | null>(null);
  const [selFer, setSelFer] = useState<number | null>(null);
  const [gravando, setGravando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const cal = calendarios.find((c) => c.id === calId);
  const falha = (e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      return;
    }
    const map: Record<string, string> = {};
    x.details?.forEach((d) => d.field && (map[d.field] = d.message));
    setErros(map);
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${x.details?.[0] ? ` ${x.details[0].message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
  };

  const carregarCalendarios = useCallback(async () => {
    try {
      const r = await api.get<Calendario[]>('/api/v1/calendars');
      setCalendarios(r.data);
      setCalId((id) => (id && r.data.some((c) => c.id === id) ? id : r.data[0]?.id ?? ''));
    } catch (e) {
      falha(e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void carregarCalendarios(), [carregarCalendarios]);
  useEffect(() => setJornada(jornadaDe(cal)), [cal]);

  const carregarFeriados = useCallback(async () => {
    if (!calId) return;
    setFeriados(null);
    try {
      const r = await api.get<Feriado[]>(`/api/v1/calendars/${calId}/holidays?year=${ano}`);
      const lista = [...r.data].sort((a, b) => a.day.localeCompare(b.day));
      setFeriados(lista);
      setOrig(lista);
      setSelFer(null);
    } catch (e) {
      setFeriados([]);
      falha(e);
    }
  }, [calId, ano]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void carregarFeriados(), [carregarFeriados]);

  const jornadaOrig = useMemo(() => jornadaDe(cal), [cal]);
  const mudouJornada = JSON.stringify(jornada) !== JSON.stringify(jornadaOrig);
  const mudouFeriados = feriados !== null && JSON.stringify(feriados) !== JSON.stringify(orig);
  const alterado = mudouJornada || mudouFeriados;
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const versao = useRef(0);
  versao.current = cal?.version ?? 0;
  const gravar = useCallback(async (): Promise<boolean> => {
    if (!cal) return false;
    setGravando(true);
    try {
      let v = versao.current;
      if (mudouJornada) {
        const r = await api.put<Calendario>(`/api/v1/calendars/${cal.id}`, {
          name: cal.name, state: jornada.state.trim().toUpperCase() || null, city: jornada.city.trim() || null, workdays: jornada.workdays,
          startTime: jornada.startTime, endTime: jornada.endTime, breakStart: jornada.breakStart || null, breakEnd: jornada.breakEnd || null,
        }, `"${v}"`);
        v = r.data.version;
      }
      if (mudouFeriados && feriados) {
        const r = await api.put<Calendario>(`/api/v1/calendars/${cal.id}/holidays/${ano}`, { rows: feriados }, `"${v}"`);
        v = r.data.version;
      }
      setErros({});
      await carregarCalendarios();
      await carregarFeriados();
      winRef.current.notify({ tone: 'sucesso', text: `Calendário ${cal.name} gravado` });
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [cal, mudouJornada, mudouFeriados, jornada, feriados, ano, carregarCalendarios, carregarFeriados]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => win.registerCommands({ save: alterado && podeEditar && !gravando ? gravar : undefined }), [alterado, podeEditar, gravando, gravar, win]);

  const importar = async () => {
    if (!cal) return;
    if (mudouFeriados) {
      win.notify({ tone: 'aviso', text: 'Grave ou descarte as datas alteradas antes de importar os feriados nacionais (CAL-001)' });
      return;
    }
    try {
      await api.post(`/api/v1/calendars/${cal.id}/holidays/${ano}/national`, undefined, { 'If-Match': `"${cal.version}"` });
      await carregarCalendarios();
      await carregarFeriados();
      win.notify({ tone: 'sucesso', text: `Feriados nacionais de ${ano} importados (Páscoa, Carnaval e Corpus Christi calculados)` });
    } catch (e) {
      falha(e);
    }
  };
  const copiar = async () => {
    if (!cal) return;
    try {
      await api.post(`/api/v1/calendars/${cal.id}/copy`, { from: ano, to: ano + 1 }, { 'If-Match': `"${cal.version}"` });
      await carregarCalendarios();
      setAno(ano + 1);
      win.notify({ tone: 'sucesso', text: `Datas de ${ano} copiadas para ${ano + 1}; confira os feriados móveis` });
    } catch (e) {
      falha(e);
    }
  };

  const mapa = useMemo(() => new Map((feriados ?? []).map((f) => [f.day, f])), [feriados]);
  const trabalha = (dow: number) => jornada.workdays[(dow + 6) % 7] === 'S';
  const meses = useMemo(() => MESES.map((nome, m) => {
    const ini = new Date(ano, m, 1).getDay();
    const total = new Date(ano, m + 1, 0).getDate();
    let uteis = 0;
    const dias = Array.from({ length: total }, (_, i) => {
      const d = i + 1;
      const k = iso(ano, m, d);
      const dow = new Date(ano, m, d).getDay();
      const fer = mapa.get(k);
      if (trabalha(dow) && !fer) uteis++;
      return { d, k, fer, folga: !trabalha(dow) };
    });
    return { nome, ini, dias, uteis };
  }), [ano, mapa, jornada.workdays]); // eslint-disable-line react-hooks/exhaustive-deps
  const uteisAno = meses.reduce((a, m) => a + m.uteis, 0);
  const horas = (() => {
    const t = minutos(jornada.endTime) - minutos(jornada.startTime) - (jornada.breakStart && jornada.breakEnd ? minutos(jornada.breakEnd) - minutos(jornada.breakStart) : 0);
    return Number.isNaN(t) || t <= 0 ? '—' : numero(t / 60, 2);
  })();

  const escolherDia = (k: string) => {
    setSelDia(k);
    const i = (feriados ?? []).findIndex((f) => f.day === k);
    setSelFer(i >= 0 ? i : null);
  };
  const adicionar = () => {
    if (!feriados || !podeEditar) return;
    const dia = selDia && selDia.startsWith(String(ano)) && !mapa.has(selDia) ? selDia : null;
    if (!dia) {
      win.notify({ tone: 'info', text: 'Clique num dia do calendário sem data especial e use Adicionar data' });
      return;
    }
    const lista = [...feriados, { day: dia, description: 'Nova data', kind: 'EMPRESA' }].sort((a, b) => a.day.localeCompare(b.day));
    setFeriados(lista);
    setSelFer(lista.findIndex((f) => f.day === dia));
  };
  const setFer = (i: number, p: Partial<Feriado>) => setFeriados((fs) => (fs ?? []).map((f, j) => (j === i ? { ...f, ...p } : f)));
  const fid = (k: string) => `${win.windowId}-${k}`;
  const setJ = (p: Partial<Jornada>) => podeEditar && setJornada((j) => ({ ...j, ...p }));

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-calend">
        <div className="rp-calend__topo">
          <div className="rp-calend__par">
            <label htmlFor={fid('cal')} className="rp-calend__rot">Calendário</label>
            <Selecao id={fid('cal')} valor={calId} onChange={(v) => (alterado ? win.notify({ tone: 'aviso', text: 'Grave ou descarte as alterações antes de trocar de calendário (CAL-002)' }) : setCalId(v))}
              opcoes={calendarios.map((c) => ({ valor: c.id, rotulo: c.name }))} largura="200px" />
          </div>
          <div className="rp-calend__ano" role="group" aria-label="Ano">
            <button type="button" className="rp-tool" aria-label="Ano anterior" onClick={() => (alterado ? win.notify({ tone: 'aviso', text: 'Grave ou descarte as alterações antes de mudar de ano (CAL-002)' }) : setAno(ano - 1))}>
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M6 0v8L1 4z" style={{ fill: 'var(--ink)' }} /></svg>
            </button>
            <span aria-live="polite">{ano}</span>
            <button type="button" className="rp-tool" aria-label="Próximo ano" onClick={() => (alterado ? win.notify({ tone: 'aviso', text: 'Grave ou descarte as alterações antes de mudar de ano (CAL-002)' }) : setAno(ano + 1))}>
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2 0v8l5-4z" style={{ fill: 'var(--ink)' }} /></svg>
            </button>
          </div>
          <div className="rp-calend__par">
            <label htmlFor={fid('uf')} className="rp-calend__rot">UF / município</label>
            <Campo id={fid('uf')} valor={jornada.state} largura={50} max={2} placeholder="UF" onChange={podeEditar ? (v) => setJ({ state: v.toUpperCase() }) : undefined} erro={erros.state} />
            <Campo id={fid('mun')} valor={jornada.city} largura={160} max={100} placeholder="Município" rotulo="Município" onChange={podeEditar ? (v) => setJ({ city: v }) : undefined} />
          </div>
          <div className="rp-calend__legenda">
            <span><span className="rp-calend__amostra rp-calend__amostra--feriado" />Feriado</span>
            <span><span className="rp-calend__amostra rp-calend__amostra--facultativo" />Ponto facultativo</span>
            <span><span className="rp-calend__amostra rp-calend__amostra--folga" />Sem expediente</span>
          </div>
        </div>
        <div className="rp-calend__corpo">
          <div className="rp-calend__meses rp-rolagem">
            {meses.map((m) => (
              <div key={m.nome} className="rp-calend__mes">
                <div className="rp-calend__mes-cab"><span>{m.nome}</span><span>{m.uteis} dias úteis</span></div>
                <div role="grid" aria-label={m.nome} className="rp-calend__dias">
                  {SEMANA.map((w, i) => <div key={i} role="columnheader">{w}</div>)}
                  {Array.from({ length: m.ini }, (_, i) => <span key={`v${i}`} />)}
                  {m.dias.map((d) => {
                    const cls = d.fer ? (d.fer.kind === 'PONTO_FACULTATIVO' ? ' rp-calend__dia--facultativo' : ' rp-calend__dia--feriado') : d.folga ? ' rp-calend__dia--folga' : '';
                    const rotulo = `${d.d} de ${m.nome.toLowerCase()}${d.fer ? ` — ${d.fer.description}` : ''}${d.folga ? ' (sem expediente)' : ''}`;
                    return (
                      <button key={d.k} type="button" className={`rp-calend__dia${cls}`} aria-pressed={selDia === d.k} aria-label={rotulo} title={rotulo} onClick={() => escolherDia(d.k)}>
                        {d.d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="rp-calend__lado">
            <Secao>Feriados e datas especiais</Secao>
            <div className="rp-calend__feriados">
              <GradeSimples rotulo="Feriados" linhas={feriados} sel={selFer} onSel={(i) => (setSelFer(i), setSelDia(feriados?.[i]?.day ?? null))} chave={(f) => f.day}
                vazio={`Nenhuma data especial em ${ano}. Use Importar nacionais.`}
                colunas={[
                  { rotulo: 'Data', largura: '64px', valor: (f) => `${f.day.slice(8, 10)}/${f.day.slice(5, 7)}` },
                  { rotulo: 'Descrição', largura: 'minmax(0,1fr)', titulo: (f) => f.description, valor: (f, i) => (podeEditar && selFer === i
                    ? <input className="rp-field" aria-label="Descrição da data" value={f.description} maxLength={120} onChange={(e) => setFer(i, { description: e.target.value })} />
                    : f.description) },
                  { rotulo: 'Tipo', largura: '130px', valor: (f, i) => (podeEditar && selFer === i
                    ? <Selecao aria-label="Tipo da data" valor={f.kind} onChange={(v) => setFer(i, { kind: v })} opcoes={Object.entries(TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                    : TIPO[f.kind] ?? f.kind) },
                ]} />
            </div>
            <div className="rp-ficha__botoes">
              <button type="button" className="rp-btn" disabled={!podeEditar} onClick={adicionar}>Adicionar data</button>
              <button type="button" className="rp-btn" disabled={!podeEditar || selFer === null} onClick={() => (setFeriados((fs) => (fs ?? []).filter((_, j) => j !== selFer)), setSelFer(null))}>Remover</button>
              <button type="button" className="rp-btn" disabled={!podeEditar} onClick={() => void importar()}>Importar nacionais</button>
            </div>
            <Secao>Jornada de trabalho</Secao>
            <div className="rp-calend__semana">
              {DIAS.map((d, i) => (
                <Marca key={d} id={fid(`dia-${i}`)} rotulo={d} marcado={jornada.workdays[i] === 'S'}
                  onChange={(v) => setJ({ workdays: jornada.workdays.slice(0, i) + (v ? 'S' : 'N') + jornada.workdays.slice(i + 1) })} />
              ))}
            </div>
            <div className="rp-ficha__coluna">
            <Linha id={fid('entrada')} rotulo="Entrada / saída" largura={150} erro={erros.startTime ?? erros.endTime}>
              <Campo id={fid('entrada')} valor={jornada.startTime} largura={70} max={5} onChange={podeEditar ? (v) => setJ({ startTime: v }) : undefined} />
              <span>às</span>
              <Campo id={fid('saida')} valor={jornada.endTime} largura={70} max={5} rotulo="Saída" onChange={podeEditar ? (v) => setJ({ endTime: v }) : undefined} />
            </Linha>
            <Linha id={fid('intervalo')} rotulo="Intervalo" largura={150} erro={erros.breakStart ?? erros.breakEnd}>
              <Campo id={fid('intervalo')} valor={jornada.breakStart} largura={70} max={5} onChange={podeEditar ? (v) => setJ({ breakStart: v }) : undefined} />
              <span>às</span>
              <Campo id={fid('intervalo-fim')} valor={jornada.breakEnd} largura={70} max={5} rotulo="Fim do intervalo" onChange={podeEditar ? (v) => setJ({ breakEnd: v }) : undefined} />
            </Linha>
            <Linha id={fid('horas')} rotulo="Horas por dia útil" largura={150}><Campo id={fid('horas')} valor={horas} largura={70} num ro /></Linha>
            <Linha id={fid('uteis')} rotulo="Dias úteis no ano" largura={150}><Campo id={fid('uteis')} valor={String(uteisAno)} largura={70} num ro /></Linha>
            </div>
          </div>
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando}
            onClick={() => (alterado && podeEditar ? void gravar() : win.requestClose())}>{alterado ? 'Atualizar' : 'OK'}</button>
        </div>
        <div>
          <button type="button" className="rp-btn" disabled={!podeEditar || !cal || alterado} onClick={() => void copiar()}><span><u>C</u>opiar para outro ano</span></button>
          <button type="button" className="rp-btn" disabled={!cal}
            onClick={() => win.notify({ tone: 'info', text: `${cal?.name}: calendário de referência dos prazos de engenharia e produção; ainda não há projetos ou máquinas com calendário próprio` })}>
            <span><u>U</u>sado em</span>
          </button>
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Calendário alterado por outra pessoa" objeto={`o calendário ${cal?.name ?? ''}`} versao={conflito}
          onRecarregar={() => { setConflito(null); void carregarCalendarios().then(carregarFeriados); }} onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
