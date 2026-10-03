import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { TaxObligation } from '../api/types';
import { dataDaApi, dataParaApi, hojeIso } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import {
  ESFERA, IMPOSTOS_ALTERADOS, OBRIGACAO, avisarFiscal, baixarArquivo, competenciaObrigacao, nomeDoMes, prazo, seloObrigacao, seta,
} from './comum/Fiscal';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';
import { competenciaPadrao } from './TaxPeriodWindow';

type FiltroSituacao = 'PENDENTES' | 'TODAS' | 'CONCLUIDAS';
const SITUACOES = [
  { valor: 'PENDENTES', rotulo: 'Pendentes' },
  { valor: 'TODAS', rotulo: 'Todas' },
  { valor: 'CONCLUIDAS', rotulo: 'Entregues e pagas' },
];
const ESFERAS = [{ valor: '', rotulo: 'Todas' }, ...Object.entries(ESFERA).map(([valor, rotulo]) => ({ valor, rotulo }))];
const TRABALHO = (['A_ENTREGAR', 'EM_PREPARACAO', 'EM_APURACAO', 'ABERTO', 'DECISAO_PENDENTE'] as const).map((v) => ({ valor: v, rotulo: OBRIGACAO[v] }));
const feita = (o: TaxObligation) => o.status === 'ENTREGUE' || o.status === 'PAGO';
const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

type Edicao = { modo: 'nova' | 'alterar' | 'entregar'; nome: string; competencia: string; vencimento: string; esfera: string; tipo: string; responsavel: string; detalhe: string; situacao: string; recibo: string; data: string };

/**
 * Obrigações fiscais e acessórias (mock "Obrigações fiscais e acessórias", Sprint 12): a lista com filtros e o prazo em
 * dias, o calendário do mês com os vencimentos e a ficha da obrigação selecionada. Os modelos recorrentes criam as
 * obrigações de cada competência; PGDAS-D e DAS seguem a Apuração do Simples.
 */
export function TaxObligationsWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [lista, setLista] = useState<TaxObligation[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<FiltroSituacao>('PENDENTES');
  const [esfera, setEsfera] = useState('');
  const [dia, setDia] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(recordKey || null);
  const hoje = hojeIso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef(novaChave());

  useEffect(() => setSel(recordKey || null), [recordKey]);

  const carregar = useCallback(async () => {
    try {
      setLista((await api.get<TaxObligation[]>('/api/v1/tax-obligations')).data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(IMPOSTOS_ALTERADOS, r);
    return () => window.removeEventListener(IMPOSTOS_ALTERADOS, r);
  }, [carregar]);

  const linhas = useMemo(() => (lista ?? []).filter((o) => {
    if (situacao === 'PENDENTES' && feita(o)) return false;
    if (situacao === 'CONCLUIDAS' && !feita(o)) return false;
    if (esfera && o.sphere !== esfera) return false;
    if (dia && o.dueDate !== dia) return false;
    const t = busca.trim().toLowerCase();
    return !t || `${o.name} ${o.competence} ${competenciaObrigacao(o.competence)}`.toLowerCase().includes(t);
  }), [lista, situacao, esfera, dia, busca]);

  const atual = (lista ?? []).find((o) => o.id === sel) ?? linhas[0] ?? null;
  const semana = linhas.filter((o) => o.dueThisWeek).length;

  const limpar = () => {
    setSituacao('PENDENTES');
    setEsfera('');
    setDia(null);
    setBusca('');
  };

  // Calendário do mês (semana começando na segunda, como o Campo de data do design system).
  const semanas = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    const primeiro = new Date(a, m - 1, 1);
    const inicio = (primeiro.getDay() + 6) % 7;
    const total = new Date(a, m, 0).getDate();
    const celulas: ({ n: number; iso: string } | null)[] = Array.from({ length: inicio }, () => null);
    for (let k = 1; k <= total; k++) celulas.push({ n: k, iso: `${mes}-${String(k).padStart(2, '0')}` });
    while (celulas.length % 7) celulas.push(null);
    const out: ({ n: number; iso: string } | null)[][] = [];
    for (let i = 0; i < celulas.length; i += 7) out.push(celulas.slice(i, i + 7));
    return out;
  }, [mes]);
  const doMes = (lista ?? []).filter((o) => o.dueDate.startsWith(mes));
  const mudarMes = (n: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(a, m - 1 + n, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const falha = (e: unknown) => tratarFalha(e, { objeto: 'A obrigação', notify: winRef.current.notify, setErros, setConflito });

  const salvar = async () => {
    if (!edicao) return;
    setOcupado(true);
    try {
      let r: { data: TaxObligation };
      if (edicao.modo === 'nova') {
        r = await api.post<TaxObligation>('/api/v1/tax-obligations', {
          name: edicao.nome.trim(), competence: edicao.competencia.includes('/') ? `${edicao.competencia.slice(3)}-${edicao.competencia.slice(0, 2)}` : edicao.competencia.trim(),
          dueDate: dataParaApi(edicao.vencimento), sphere: edicao.esfera, kind: edicao.tipo, responsible: edicao.responsavel.trim(),
          detail: edicao.detalhe.trim() || null, status: edicao.situacao,
        }, { 'Idempotency-Key': chave.current });
        chave.current = novaChave();
      } else if (edicao.modo === 'alterar') {
        r = await api.put<TaxObligation>(`/api/v1/tax-obligations/${atual!.id}`, {
          dueDate: dataParaApi(edicao.vencimento), responsible: edicao.responsavel.trim(), detail: edicao.detalhe.trim() || null, status: edicao.situacao,
        }, `"${atual!.version}"`);
      } else {
        r = await api.post<TaxObligation>(`/api/v1/tax-obligations/${atual!.id}/deliveries`, {
          deliveredOn: dataParaApi(edicao.data), receiptNumber: edicao.recibo.trim() || null,
        }, { 'If-Match': `"${atual!.version}"` });
      }
      const o = r.data;
      winRef.current.notify({
        tone: 'sucesso',
        text: edicao.modo === 'nova' ? `Obrigação ${o.code} adicionada com sucesso` : edicao.modo === 'alterar' ? `Obrigação ${o.code} atualizada com sucesso`
          : `${o.name} (${competenciaObrigacao(o.competence)}) marcada como ${OBRIGACAO[o.status].toLowerCase()} com sucesso`,
      });
      setEdicao(null);
      setErros({});
      setSel(o.id);
      avisarFiscal();
      await carregar();
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(false);
    }
  };

  const exportar = async () => {
    try {
      const r = await api.get<unknown>('/api/v1/tax-obligations/calendar.ics');
      baixarArquivo('obrigacoes-fiscais.ics', r.text ?? '', 'text/calendar;charset=utf-8');
      winRef.current.notify({ tone: 'sucesso', text: 'Agenda das obrigações pendentes exportada com sucesso' });
    } catch (e) {
      falha(e);
    }
  };

  const podeAlterar = can('tax_obligation.update');
  const nova = () => setEdicao({ modo: 'nova', nome: '', competencia: competenciaPadrao(), vencimento: '', esfera: 'FEDERAL', tipo: 'DECLARACAO', responsavel: '', detalhe: '', situacao: 'A_ENTREGAR', recibo: '', data: '' });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edicao || conflito) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'n' && podeAlterar) nova();
      else if (k === 'p') win.open('tax-period', competenciaPadrao());
      else if (k === 'x') void exportar();
      else if (k === 'e' && atual && !feita(atual) && !atual.linked && podeAlterar) setEdicao({ ...edicaoDe(atual), modo: 'entregar' });
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const edicaoDe = (o: TaxObligation): Edicao => ({
    modo: 'alterar', nome: o.name, competencia: o.competence, vencimento: dataDaApi(o.dueDate), esfera: o.sphere, tipo: o.kind, responsavel: o.responsible,
    detalhe: o.detail ?? '', situacao: feita(o) ? 'A_ENTREGAR' : o.status, recibo: '', data: dataDaApi(hoje),
  });

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) => erros[k] && <span className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}</span>;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-jlista rp-fiscal" onKeyDown={onKeyDown}>
        <div className="rp-filtros rp-jlista__filtros">
          <label>
            Localizar <input className="rp-field" type="search" placeholder="Obrigação ou competência" maxLength={100} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <label>
            Situação <Selecao className="rp-field" valor={situacao} opcoes={SITUACOES} onChange={(v) => setSituacao(v as FiltroSituacao)} aria-label="Situação" />
          </label>
          <label>
            Esfera <Selecao className="rp-field" valor={esfera} opcoes={ESFERAS} onChange={setEsfera} aria-label="Esfera" />
          </label>
          <button type="button" className="rp-btn" onClick={limpar}>Limpar</button>
          <div className="rp-filtros-dir">
            {situacao !== 'PENDENTES' && <Chip campo="Situação" valor={SITUACOES.find((s) => s.valor === situacao)!.rotulo} remover={() => setSituacao('PENDENTES')} />}
            {esfera && <Chip campo="Esfera" valor={ESFERA[esfera as keyof typeof ESFERA]} remover={() => setEsfera('')} />}
            {dia && <Chip campo="Vencimento" valor={dataDaApi(dia)} remover={() => setDia(null)} />}
            {busca.trim() && <Chip campo="Texto" valor={busca.trim()} remover={() => setBusca('')} />}
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : (
          <div className="rp-fiscal__lista-lado">
            <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Obrigações fiscais e acessórias">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Vencimento</th>
                    <th>Obrigação</th>
                    <th>Comp.</th>
                    <th>Esfera</th>
                    <th>Responsável</th>
                    <th>Prazo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((o, i) => (
                    <tr key={o.id} aria-selected={o.id === atual?.id} onClick={() => setSel(o.id)}>
                      <td className="rownum">{i}</td>
                      <td>{dataDaApi(o.dueDate)}</td>
                      <td>{o.name}</td>
                      <td>{competenciaObrigacao(o.competence)}</td>
                      <td>{ESFERA[o.sphere]}</td>
                      <td>{o.responsible}</td>
                      <td className={!feita(o) && o.daysToDue <= 7 ? 'rp-fiscal__prazo-curto' : undefined}>{prazo(o)}</td>
                      <td>{seloObrigacao(o)}</td>
                    </tr>
                  ))}
                  <LinhaResto colunas={8} />
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td colSpan={7}>
                      {linhas.length} {linhas.length === 1 ? 'obrigação' : 'obrigações'} · {semana} {semana === 1 ? 'vence' : 'vencem'} nos próximos 7 dias
                    </td>
                  </tr>
                </tfoot>
              </table>
              {lista !== null && linhas.length === 0 && <p className="rp-jlista__vazio">Nenhuma obrigação com os filtros aplicados.</p>}
            </div>
            <div className="rp-rolagem rp-fiscal__lado">
              <div className="rp-cal" aria-label="Calendário de vencimentos">
                <div className="rp-cal-head">
                  <button type="button" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>‹</button>
                  <span>{nomeDoMes(Number(mes.slice(5, 7)) - 1)} de {mes.slice(0, 4)}</span>
                  <button type="button" aria-label="Próximo mês" onClick={() => mudarMes(1)}>›</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      {DIAS.map((d, i) => <th key={i}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {semanas.map((s, i) => (
                      <tr key={i}>
                        {s.map((c, j) => {
                          if (!c) return <td key={j} className="fora" />;
                          const os = doMes.filter((o) => o.dueDate === c.iso);
                          const pend = os.some((o) => !feita(o));
                          return (
                            <td key={j} className={c.iso === hoje ? 'hoje' : undefined} aria-selected={dia === c.iso} title={os.map((o) => o.name).join(' · ')}
                              onClick={() => {
                                setDia(dia === c.iso ? null : c.iso);
                                if (dia !== c.iso) setSituacao('TODAS');
                              }}>
                              {os.length ? <b>{c.n}</b> : c.n}
                              {os.length > 0 && <span className={`rp-fiscal__ponto${pend ? '' : ' rp-fiscal__ponto--ok'}`} aria-hidden="true" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="rp-cal-foot">
                  <span>{doMes.length} {doMes.length === 1 ? 'vencimento' : 'vencimentos'} no mês</span>
                  <a role="button" tabIndex={0} onClick={() => { setMes(hoje.slice(0, 7)); setDia(null); }} onKeyDown={(e) => e.key === 'Enter' && setMes(hoje.slice(0, 7))}>Hoje</a>
                </div>
              </div>
              {atual && (
                <fieldset className="rp-grupo">
                  <legend>{atual.name}</legend>
                  <div className="rp-grupo-corpo">
                    <div className="rp-form rp-fiscal__ficha-obrigacao">
                      <span className="rp-label">Competência</span>
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Competência" value={competenciaObrigacao(atual.competence)} />
                      <span className="rp-label">Vencimento</span>
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Vencimento" value={`${dataDaApi(atual.dueDate)}${feita(atual) ? '' : ` · ${prazo(atual)}`}`} />
                      <span className="rp-label">Esfera</span>
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Esfera" value={ESFERA[atual.sphere]} />
                      <span className="rp-label">Responsável</span>
                      <input className="rp-field rp-field--readonly" readOnly aria-label="Responsável" value={atual.responsible} />
                      <span className="rp-label">Situação</span>
                      <span>{seloObrigacao(atual)}</span>
                      {feita(atual) && (
                        <>
                          <span className="rp-label">{atual.status === 'PAGO' ? 'Pago em' : 'Entregue em'}</span>
                          <input className="rp-field rp-field--readonly" readOnly aria-label="Entregue em" value={`${dataDaApi(atual.deliveredOn)}${atual.receiptNumber ? ` · recibo ${atual.receiptNumber}` : ''}`} />
                        </>
                      )}
                    </div>
                    <textarea className="rp-field rp-field--note" rows={3} readOnly aria-label="Detalhe" value={atual.detail ?? ''} />
                    {atual.linked ? (
                      <span className="rp-fiscal__dica">
                        {seta('Abrir a apuração', () => win.open('tax-period', atual.competence))} Segue a Apuração do Simples da competência {competenciaObrigacao(atual.competence)}.
                      </span>
                    ) : podeAlterar && !feita(atual) && (
                      <div className="rp-btn-row">
                        <button type="button" className="rp-btn rp-btn--default" onClick={() => setEdicao({ ...edicaoDe(atual), modo: 'entregar' })}>
                          <span><u>E</u>ntregue</span>
                        </button>
                        <button type="button" className="rp-btn" onClick={() => setEdicao(edicaoDe(atual))}>
                          <span>A<u>l</u>terar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="rp-lista-foot rp-window-foot">
        <div className="rp-btn-row">
          {podeAlterar && <button type="button" className="rp-btn rp-btn--default" onClick={nova}><span><u>N</u>ova obrigação</span></button>}
          <button type="button" className="rp-btn" onClick={() => win.open('tax-period', competenciaPadrao())}><span>Abrir a<u>p</u>uração</span></button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>Fechar</button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={() => void exportar()}><span>E<u>x</u>portar agenda</span></button>
        </div>
      </div>

      {edicao && (
        <Dialog icon="info" label={edicao.modo === 'nova' ? 'Nova obrigação' : edicao.modo === 'alterar' ? 'Alterar obrigação' : 'Obrigação entregue'}
          onEscape={() => setEdicao(null)}
          buttons={[
            { label: edicao.modo === 'entregar' ? 'Registrar' : 'OK', primary: true, onClick: () => void salvar() },
            { label: 'Cancelar', onClick: () => setEdicao(null) },
          ]}>
          {edicao.modo === 'entregar' ? (
            <>
              <p>{edicao.nome} — competência {competenciaObrigacao(edicao.competencia)}. O arquivo do recibo fica para a sprint de arquivos; registre aqui o número.</p>
              <div className="rp-form">
                <label className="rp-label rp-label--req" htmlFor={fid('od')}>{atual?.kind === 'GUIA' ? 'Pago em' : 'Entregue em'}</label>
                <span>
                  <CampoData id={fid('od')} rotulo="Data" className="rp-field rp-field--curto" valor={edicao.data} invalido={!!erros.deliveredOn} onChange={(v) => setEdicao({ ...edicao, data: v })} />
                  {erroDe('deliveredOn')}
                </span>
                <label className="rp-label" htmlFor={fid('orec')}>Nº do recibo</label>
                <input id={fid('orec')} className="rp-field" maxLength={60} value={edicao.recibo} onChange={(e) => setEdicao({ ...edicao, recibo: e.target.value })} />
              </div>
            </>
          ) : (
            <div className="rp-form">
              {edicao.modo === 'nova' && (
                <>
                  <label className="rp-label rp-label--req" htmlFor={fid('onome')}>Obrigação</label>
                  <span>
                    <input id={fid('onome')} className="rp-field" maxLength={150} value={edicao.nome} aria-invalid={!!erros.name} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
                    {erroDe('name')}
                  </span>
                  <label className="rp-label rp-label--req" htmlFor={fid('ocomp')}>Competência</label>
                  <span>
                    <input id={fid('ocomp')} className="rp-field rp-field--curto" maxLength={7} placeholder="AAAA-MM ou AAAA" value={edicao.competencia} aria-invalid={!!erros.competence}
                      onChange={(e) => setEdicao({ ...edicao, competencia: e.target.value })} />
                    {erroDe('competence')}
                  </span>
                  <label className="rp-label rp-label--req" htmlFor={fid('oesf')}>Esfera</label>
                  <Selecao id={fid('oesf')} className="rp-field" valor={edicao.esfera} opcoes={ESFERAS.slice(1)} onChange={(v) => setEdicao({ ...edicao, esfera: v })} aria-label="Esfera" />
                  <label className="rp-label" htmlFor={fid('otipo')}>Tipo</label>
                  <Selecao id={fid('otipo')} className="rp-field" valor={edicao.tipo} onChange={(v) => setEdicao({ ...edicao, tipo: v })} aria-label="Tipo"
                    opcoes={[{ valor: 'DECLARACAO', rotulo: 'Declaração (entregue)' }, { valor: 'GUIA', rotulo: 'Guia (paga)' }]} />
                </>
              )}
              <label className="rp-label rp-label--req" htmlFor={fid('ovenc')}>Vencimento</label>
              <span>
                <CampoData id={fid('ovenc')} rotulo="Vencimento" className="rp-field rp-field--curto" valor={edicao.vencimento} invalido={!!erros.dueDate} onChange={(v) => setEdicao({ ...edicao, vencimento: v })} />
                {erroDe('dueDate')}
              </span>
              <label className="rp-label rp-label--req" htmlFor={fid('oresp')}>Responsável</label>
              <span>
                <input id={fid('oresp')} className="rp-field" maxLength={100} value={edicao.responsavel} aria-invalid={!!erros.responsible} onChange={(e) => setEdicao({ ...edicao, responsavel: e.target.value })} />
                {erroDe('responsible')}
              </span>
              <label className="rp-label" htmlFor={fid('osit')}>Situação</label>
              <Selecao id={fid('osit')} className="rp-field" valor={edicao.situacao} opcoes={TRABALHO} onChange={(v) => setEdicao({ ...edicao, situacao: v })} aria-label="Situação" />
              <label className="rp-label" htmlFor={fid('odet')}>Detalhe</label>
              <input id={fid('odet')} className="rp-field" maxLength={500} value={edicao.detalhe} onChange={(e) => setEdicao({ ...edicao, detalhe: e.target.value })} />
            </div>
          )}
          {ocupado && <p className="rp-janela-mdi__aviso">Gravando</p>}
        </Dialog>
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="Obrigação alterada" objeto="A obrigação" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            setEdicao(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

function Chip({ campo, valor, remover }: { campo: string; valor: string; remover: () => void }) {
  return (
    <span className="rp-chip">
      <b>{campo}:</b> {valor}{' '}
      <i className="x" role="button" tabIndex={0} title="Remover" aria-label={`Remover o filtro de ${campo.toLowerCase()}`} onClick={remover} onKeyDown={(e) => e.key === 'Enter' && remover()}>×</i>
    </span>
  );
}
