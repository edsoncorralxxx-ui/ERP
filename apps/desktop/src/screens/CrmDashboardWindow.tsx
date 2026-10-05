import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ChartSpec } from '../charts/Chart';
import { centavos, dataDaApi, hojeIso } from '../format';
import { useWindow } from '../windows/WindowContext';
import { CartaoGrafico } from './comum/Fiscal';
import { CRM_ALTERADO, classeSelo, etapaVisivel, nomeCliente, ORIGEM_MOCK, reaisInteiros, type OportunidadeLinha } from './comum/CrmMock';
import { Seta, useApi } from './comum/Ficha';
import { Selecao } from './comum/Selecao';

type Kpi = { value: number; previous: number | null; series: number[] };
type Painel = {
  month: string; owner: string | null; openFunnel: Kpi; openCount: number; weighted: Kpi; conversionPercent: Kpi; targetCents: number | null; wonCents: number;
  wonSeries: number[]; stages: { code: string; name: string; closePercent: number; potentialCents: number; weightedCents: number; count: number }[];
  sources: { source: string; potentialCents: number; count: number }[]; forecast: OportunidadeLinha[];
  alerts: { kind: string; title: string; text: string; opportunityId: string | null }[];
};

const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const Maiusc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ICONE_ALERTA: Record<string, string> = { PARADA: 'rp-ico-ia-risco', PREVISAO: 'rp-ico-ia-previsao', ATRASADA: 'rp-ico-status-aviso' };

/** Linha fina dos indicadores (como no mock): a série dos últimos meses, sem eixo. */
export function Faisca({ valores, ouro }: { valores: number[]; ouro?: boolean }) {
  const max = Math.max(...valores, 1), min = Math.min(...valores, 0);
  const pts = valores.map((v, i) => `${(i * 176) / Math.max(1, valores.length - 1)},${24 - ((v - min) / (max - min || 1)) * 20}`).join(' ');
  return (
    <svg width="100%" height="24" viewBox="0 0 176 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" style={{ stroke: ouro ? 'var(--gold)' : 'var(--nav-selected)' }} strokeWidth="2" />
    </svg>
  );
}

/**
 * Painel comercial do mock (CRM-Painel): período e vendedor; quatro indicadores (funil em aberto, previsão ponderada,
 * conversão em 12 meses e meta do mês) com a linha dos últimos meses; o funil por etapa (valor e ponderado) e o funil
 * por origem; os fechamentos previstos por mês, agrupados; e os alertas do funil, calculados por regra.
 */
export function CrmDashboardWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const hoje = hojeIso().slice(0, 7);
  const [mes, setMes] = useState(hoje);
  const [vendedor, setVendedor] = useState('');
  const [aplicado, setAplicado] = useState({ mes: hoje, vendedor: '' });
  const [p, setP] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());
  const donos = useApi<{ username: string; displayName: string }[]>('/api/v1/crm/owners', []);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ month: aplicado.mes, ...(aplicado.vendedor ? { owner: aplicado.vendedor } : {}) });
      const r = await api.get<Painel>(`/api/v1/crm/dashboard?${q}`);
      setP(r.data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(`${x.message} (${x.code})`);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [aplicado]);
  useEffect(() => {
    void carregar();
    const f = () => void carregar();
    window.addEventListener(CRM_ALTERADO, f);
    return () => window.removeEventListener(CRM_ALTERADO, f);
  }, [carregar]);

  const meses = useMemo(() => Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - (i - 1), 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { valor: ym, rotulo: Maiusc(nomeMes(ym)) };
  }), [hoje]);

  const specs = useMemo((): { funil: ChartSpec; origem: ChartSpec } | null => {
    if (!p) return null;
    return {
      funil: { tipo: 'Barras3D', categorias: p.stages.map((s) => s.name), unidade: '',
        series: [{ nome: 'Valor', valores: p.stages.map((s) => Math.round(s.potentialCents / 100000)) }, { nome: 'Ponderado', valores: p.stages.map((s) => Math.round(s.weightedCents / 100000)) }] },
      origem: { tipo: 'Rosca3D', fatias: p.sources.map((s) => ({ nome: ORIGEM_MOCK[s.source] ?? s.source, valor: Math.round(s.potentialCents / 100) })),
        centro: { valor: `R$ ${(p.openFunnel.value / 100000000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`, titulo: 'Em aberto' } },
    };
  }, [p]);

  const grupos = useMemo(() => {
    const m = new Map<string, OportunidadeLinha[]>();
    (p?.forecast ?? []).forEach((o) => {
      const k = o.expectedClose!.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), o]);
    });
    return [...m.entries()];
  }, [p]);
  const totalPrev = (p?.forecast ?? []).reduce((a, o) => a + o.potentialCents, 0);
  const totalPond = (p?.forecast ?? []).reduce((a, o) => a + o.weightedCents, 0);

  const delta = (k: Kpi, tipo: 'pct' | 'pp') => {
    if (k.previous == null) return null;
    if (tipo === 'pp') {
      const d = k.value - k.previous;
      return { up: d >= 0, texto: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)} p.p. vs. período anterior` };
    }
    if (!k.previous) return null;
    const d = ((k.value - k.previous) / k.previous) * 100;
    return { up: d >= 0, texto: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. mês anterior` };
  };
  const dPond = p ? delta(p.weighted, 'pct') : null;
  const dConv = p ? delta(p.conversionPercent, 'pp') : null;
  const meta = p?.targetCents ? Math.round((p.wonCents / p.targetCents) * 100) : null;
  const falta = p?.targetCents ? Math.max(0, p.targetCents - p.wonCents) : 0;
  const novo = () => win.open('opportunity', `novo-${Date.now()}`);
  useEffect(() => win.registerCommands({ novo }), [win]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (k: string) => setFechados((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const alertas = (p?.alerts ?? []).filter((a) => !ignorados.has(a.text));

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-crmpainel rp-rolagem">
        <div className="rp-filtros">
          <label>Período <Selecao aria-label="Período" valor={mes} onChange={setMes} opcoes={meses} largura="170px" /></label>
          <label>Vendedor <Selecao aria-label="Vendedor" valor={vendedor} onChange={setVendedor} largura="180px"
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...donos.map((d) => ({ valor: d.username, rotulo: d.displayName }))]} /></label>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setAplicado({ mes, vendedor })}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setMes(hoje), setVendedor(''), setAplicado({ mes: hoje, vendedor: '' }))}>Limpar</button>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : !p || !specs ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <div className="rp-dash rp-crmpainel__dash">
            <div className="rp-dash-kpis">
              <div className="rp-kpi rp-crmpainel__kpi" role="button" tabIndex={0} title="Abrir as oportunidades" onClick={() => win.open('opportunities')}
                onKeyDown={(e) => e.key === 'Enter' && win.open('opportunities')}>
                <div className="rp-kpi-head"><i className="rp-ico rp-ico-oportunidades" aria-hidden="true" />Funil em aberto</div>
                <div className="rp-kpi-valor">{reaisInteiros(p.openFunnel.value)}</div>
                <div className="rp-kpi-delta">{p.openCount} {p.openCount === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}</div>
                <Faisca valores={p.openFunnel.series} />
              </div>
              <div className="rp-kpi rp-crmpainel__kpi" role="button" tabIndex={0} title="Abrir as oportunidades por etapa" onClick={() => win.open('opportunities')}
                onKeyDown={(e) => e.key === 'Enter' && win.open('opportunities')}>
                <div className="rp-kpi-head"><i className="rp-ico rp-ico-lucro-bruto" aria-hidden="true" />Previsão ponderada</div>
                <div className="rp-kpi-valor">{reaisInteiros(p.weighted.value)}</div>
                <div className={`rp-kpi-delta${dPond ? (dPond.up ? ' rp-kpi-delta--up' : ' rp-kpi-delta--down') : ''}`}>{dPond?.texto ?? 'Sem histórico do mês anterior'}</div>
                <Faisca valores={p.weighted.series} />
              </div>
              <div className="rp-kpi rp-crmpainel__kpi" role="button" tabIndex={0} title="Abrir o kanban de vendas" onClick={() => win.open('kanban')}
                onKeyDown={(e) => e.key === 'Enter' && win.open('kanban')}>
                <div className="rp-kpi-head"><i className="rp-ico rp-ico-vendas" aria-hidden="true" />Taxa de conversão (12 meses)</div>
                <div className="rp-kpi-valor">{p.conversionPercent.value}%</div>
                <div className={`rp-kpi-delta${dConv ? (dConv.up ? ' rp-kpi-delta--up' : ' rp-kpi-delta--down') : ''}`}>{dConv?.texto}</div>
                <Faisca valores={p.conversionPercent.series} />
              </div>
              <div className="rp-kpi rp-crmpainel__kpi" role="button" tabIndex={0} title="Abrir os pedidos" onClick={() => win.open('orders')}
                onKeyDown={(e) => e.key === 'Enter' && win.open('orders')}>
                <div className="rp-kpi-head"><i className="rp-ico rp-ico-bi" aria-hidden="true" />Meta de {MES[Number(p.month.slice(5, 7)) - 1]}</div>
                <div className="rp-kpi-valor">{meta === null ? '—' : `${meta}%`}</div>
                <div className={`rp-kpi-delta${meta === null ? '' : falta > 0 ? ' rp-kpi-delta--down' : ' rp-kpi-delta--up'}`}>
                  {meta === null ? 'Sem meta cadastrada para o mês' : falta > 0 ? `▼ ${reaisInteiros(falta)} para a meta` : '▲ Meta atingida'}
                </div>
                <Faisca valores={p.wonSeries} ouro />
              </div>
            </div>
            <div className="rp-dash-row rp-crmpainel__linha">
              <CartaoGrafico icone="relatorios" titulo="Funil por etapa — valor e ponderado (mil R$)" spec={specs.funil} altura={205}
                vazio="Nenhuma oportunidade aberta." arquivo={`funil-por-etapa-${p.month}.csv`} />
              <CartaoGrafico icone="oportunidades" titulo="Funil em aberto por origem" spec={p.sources.length ? specs.origem : null} altura={205}
                vazio="Nenhuma oportunidade aberta." arquivo={`funil-por-origem-${p.month}.csv`} />
            </div>
            <div className="rp-dash-row rp-crmpainel__linha">
              <div className="rp-chart">
                <div className="rp-chart-head"><i className="rp-ico rp-ico-relatorio-lista" aria-hidden="true" />Fechamentos previstos por mês</div>
                <div className="rp-grid-rolagem rp-rolagem rp-crmpainel__prev">
                  <table className="rp-grid rp-grid--resumo rp-crmpainel__tabela" aria-label="Fechamentos previstos por mês">
                    <thead>
                      <tr><th>Mês / oportunidade</th><th style={{ width: '110px' }}>Etapa</th><th style={{ width: '84px' }}>Previsão</th>
                        <th className="num" style={{ width: '100px' }}>Valor</th><th className="num" style={{ width: '100px' }}>Ponderado</th><th style={{ width: '90px' }}>Participação</th></tr>
                    </thead>
                    <tbody>
                      {grupos.map(([k, ops]) => {
                        const v = ops.reduce((a, o) => a + o.potentialCents, 0), w = ops.reduce((a, o) => a + o.weightedCents, 0);
                        const aberto = !fechados.has(k);
                        return (
                          <Fragment key={k}>
                            <tr className="grupo" data-aberto={aberto} onClick={() => alternar(k)}>
                              <td>{Maiusc(nomeMes(k))}</td><td /><td /><td className="num">{centavos(v)}</td><td className="num">{centavos(w)}</td>
                              <td><span className="rp-barra-celula" style={{ width: `${totalPond ? Math.round((w / totalPond) * 100) : 0}%` }} /></td>
                            </tr>
                            {aberto && ops.map((o) => (
                              <tr key={o.id}>
                                <td className="rec"><Seta titulo={`Abrir ${o.code}`} abrir={() => win.open('opportunity', o.id)} /> <span title={o.code}>{nomeCliente(o)}</span></td>
                                <td><span className={classeSelo(etapaVisivel(o))}>{etapaVisivel(o)}</span></td>
                                <td>{dataDaApi(o.expectedClose)}</td><td className="num">{centavos(o.potentialCents)}</td><td className="num">{centavos(o.weightedCents)}</td><td />
                              </tr>
                            ))}
                            {aberto && <tr className="sub"><td>Subtotal — {ops.length} {ops.length === 1 ? 'oportunidade' : 'oportunidades'}</td><td /><td /><td className="num">{centavos(v)}</td><td className="num">{centavos(w)}</td><td /></tr>}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr><td>Total geral — {p.forecast.length} oportunidades</td><td /><td /><td className="num">{centavos(totalPrev)}</td><td className="num">{centavos(totalPond)}</td><td /></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="rp-ai rp-crmpainel__alertas" role="region" aria-label="Alertas do funil">
                <div className="rp-ai-head"><i className="rp-ico rp-ico-ia-insight" aria-hidden="true" />Alertas do funil</div>
                {alertas.length === 0 && <div className="rp-ai-item"><div><p>Nenhum alerta: o funil está em dia.</p></div></div>}
                {alertas.map((a) => (
                  <div key={a.text} className="rp-ai-item">
                    <i className={`rp-ico ${ICONE_ALERTA[a.kind] ?? 'rp-ico-status-aviso'}`} aria-hidden="true" />
                    <div><b>{a.title}</b><p>{a.text}</p></div>
                    {a.opportunityId && (
                      <div className="rp-ai-acoes">
                        <button type="button" className="rp-btn" onClick={() => win.open('opportunity', a.opportunityId!)}>Abrir</button>
                        <button type="button" className="rp-btn" onClick={() => setIgnorados((s) => new Set([...s, a.text]))}>Ignorar</button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="rp-ai-foot">Calculados pelas regras do Renda+ a partir do funil, das metas e das atividades.</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" onClick={novo}><span>Nova <u>o</u>portunidade</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('lead', `novo-${Date.now()}`)}><span>Novo <u>l</u>ead</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('crm-agenda')}><span>Nova <u>a</u>tividade</span></button>
        </div>
        <div>
          <button type="button" className="rp-btn" onClick={() => window.print()}><span><u>R</u>elatório comercial</span></button>
        </div>
      </div>
    </>
  );
}
