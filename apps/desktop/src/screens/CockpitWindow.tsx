import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ChartSpec } from '../charts/Chart';
import { hojeIso } from '../format';
import type { WindowKind } from '../windows/windowManager';
import { useWindow } from '../windows/WindowContext';
import { CRM_ALTERADO, classeSelo, reaisInteiros } from './comum/CrmMock';
import { CartaoGrafico } from './comum/Fiscal';
import { Faisca } from './CrmDashboardWindow';
import { Selecao } from './comum/Selecao';

type Kpi = { value: number | null; previous: number | null; series: number[] | null; note: string | null };
type Serie = { name: string; values: number[] };
type Grafico = { categories: string[]; series: Serie[] };
type Alerta = { area: string; icon: string; text: string; due: string; level: string; kind: string; key: string | null };
type Entrega = { date: string; customer: string; equipment: string; stage: string; projectId: string };
type Cockpit = {
  period: string; periodLabel: string; compare: string; compareLabel: string; referenceDate: string;
  billing: Kpi | null; backlog: Kpi | null; backlogEquipment: number | null; funnel: Kpi | null; funnelOpen: number | null; cash: Kpi | null;
  production: Kpi | null; installations: Kpi | null; tickets: Kpi | null; stockBelowMin: Kpi | null; stockBelowMinNames: string[];
  billingVsTarget: Grafico | null; revenueMix: { name: string; value: number }[] | null; backlogByMonth: Grafico | null; cashFlow: Grafico | null;
  funnelByStage: Grafico | null; alerts: Alerta[]; deliveries: Entrega[];
};

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TRI = ['Primeiro', 'Segundo', 'Terceiro', 'Quarto'];
const COMPARA = [{ valor: 'ANTERIOR', rotulo: 'Mês anterior' }, { valor: 'ANO_ANTERIOR', rotulo: 'Mesmo período de 2025' }, { valor: 'META', rotulo: 'Meta' }];
const SELO_NIVEL: Record<string, string> = { Atrasada: 'rp-badge rp-badge--cancelado', Crítico: 'rp-badge rp-badge--cancelado', Atenção: 'rp-badge rp-badge--pendente',
  Informativo: 'rp-badge rp-badge--aberto' };
const ABRE_ALERTA: Record<string, WindowKind> = { project: 'projects', item: 'item', receivables: 'receivables', payables: 'payables', opportunity: 'opportunity',
  'tax-obligations': 'tax-obligations' };

const mil = (cents: number) => Math.round(cents / 100000);
const pctBr = (n: number) => `${Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const serie = (g: Grafico) => g.series.map((s) => ({ nome: s.name, valores: s.values.map(mil) }));

/** Opções de período: os 12 últimos meses, os trimestres e o ano corrente. */
function periodos(hoje: string) {
  const y = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return { valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MES[d.getMonth()]} de ${d.getFullYear()}` };
  });
  const tris = Array.from({ length: Math.ceil(m / 3) }, (_, i) => Math.ceil(m / 3) - i).map((t) => ({ valor: `${y}-T${t}`, rotulo: `${TRI[t - 1]} trimestre de ${y}` }));
  return [...meses.slice(0, 1), ...tris, { valor: String(y), rotulo: `Ano de ${y}` }, ...meses.slice(1)];
}

/**
 * Meu cockpit do mock (Cockpit-Meu): período e comparação; oito indicadores com a linha dos últimos meses (cada um
 * abre os seus dados); faturamento × meta, receita por linha de produto, carteira por mês de entrega, fluxo de caixa,
 * produção e funil por etapa; o que precisa de atenção, as próximas entregas e a leitura dos números. Tudo vem do
 * servidor (GET /api/v1/cockpit); o que ainda não tem módulo (produção, pós-venda) aparece como tal, sem número inventado.
 */
export function CockpitWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const atual = hojeIso().slice(0, 7);
  const opcoes = useMemo(() => periodos(hojeIso()), []);
  const [periodo, setPeriodo] = useState(atual);
  const [compara, setCompara] = useState('ANTERIOR');
  const [aplicado, setAplicado] = useState({ periodo: atual, compara: 'ANTERIOR' });
  const [c, setC] = useState<Cockpit | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<Cockpit>(`/api/v1/cockpit?${new URLSearchParams({ period: aplicado.periodo, compare: aplicado.compara })}`);
      setC(r.data);
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

  const dados = (indicador: string) => win.open('cockpit-dados', `${indicador}@${aplicado.periodo}`);
  const delta = (k: Kpi | null, inverso = false) => {
    if (!k || k.value == null || !k.previous) return null;
    const d = ((k.value - k.previous) / k.previous) * 100;
    const bom = inverso ? d <= 0 : d >= 0;
    return { cls: bom ? ' rp-kpi-delta--up' : ' rp-kpi-delta--down', texto: `${d >= 0 ? '▲' : '▼'} ${pctBr(d)} vs. ${c?.compareLabel}` };
  };

  const specs = useMemo(() => {
    if (!c) return null;
    const s = (g: Grafico | null, tipo: 'Barras3D' | 'Empilhadas3D' | 'Linha'): ChartSpec | null =>
      g && g.categories.length && g.series.some((x) => x.values.some((v) => v)) ? { tipo, categorias: g.categories, series: serie(g), unidade: 'mil R$' } : null;
    const totalMix = (c.revenueMix ?? []).reduce((a, f) => a + f.value, 0);
    return {
      fat: s(c.billingVsTarget, 'Barras3D'),
      mix: totalMix ? ({ tipo: 'Rosca3D', furo: 0.55, fatias: (c.revenueMix ?? []).map((f) => ({ nome: f.name, valor: mil(f.value) })),
        centro: { valor: `R$ ${(totalMix / 100000000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`, titulo: 'Receita em 12 meses' } } as ChartSpec) : null,
      carteira: s(c.backlogByMonth, 'Empilhadas3D'),
      caixa: s(c.cashFlow, 'Linha'),
      funil: s(c.funnelByStage, 'Barras3D'),
    };
  }, [c]);

  // Leitura dos números: frases calculadas pelas regras a partir do que veio do servidor (sem IA, ADR-014).
  const leituras = useMemo(() => {
    if (!c) return [];
    const l: { icone: string; titulo: string; texto: string }[] = [];
    const fm = c.billingVsTarget;
    if (fm && c.billing?.value != null) {
      const meta = fm.series[1]?.values[fm.series[1].values.length - 1] ?? 0;
      if (meta > 0 && c.period.length === 7) {
        const d = ((c.billing.value - meta) / meta) * 100;
        l.push({ icone: 'rp-ico-ia-previsao', titulo: 'Meta do mês', texto: `${c.periodLabel} soma ${reaisInteiros(c.billing.value)} faturados, ${pctBr(d)} ${d >= 0 ? 'acima' : 'abaixo'} da meta de ${reaisInteiros(meta)}.` });
      }
    }
    const cx = c.cashFlow;
    if (cx && cx.series.length === 2) {
      const meses = cx.categories.filter((_, i) => cx.series[1].values[i] > cx.series[0].values[i]);
      if (meses.length) l.push({ icone: 'rp-ico-ia-risco', titulo: 'Caixa', texto: `As saídas superaram as entradas em ${meses.length} dos últimos 12 meses (${meses.join(', ')}).` });
    }
    if (c.backlog?.value && fm) {
      const fat = fm.series[0].values.filter((v) => v > 0);
      const media = fat.length ? fat.reduce((a, v) => a + v, 0) / fat.length : 0;
      if (media > 0) l.push({ icone: 'rp-ico-ia-anomalia', titulo: 'Carteira', texto: `A carteira de ${reaisInteiros(c.backlog.value)} equivale a ${(c.backlog.value / media).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses do faturamento médio dos últimos 12 meses.` });
    }
    return l;
  }, [c]);

  const alertas = (c?.alerts ?? []).filter((a) => !ignorados.has(a.text));
  const abrirAlerta = (a: Alerta) => {
    const k = ABRE_ALERTA[a.kind];
    if (k) win.open(k, a.key ?? undefined);
  };
  const semModulo = (titulo: string, icone: string, modulo: string) => (
    <div className="rp-kpi rp-cockpit__kpi rp-cockpit__kpi--vazio" title={`${modulo} ainda não tem módulo no Renda+`}>
      <div className="rp-kpi-head"><i className={`rp-ico rp-ico-${icone}`} aria-hidden="true" />{titulo}</div>
      <div className="rp-kpi-valor">—</div>
      <div className="rp-kpi-delta">Módulo de {modulo.toLowerCase()} ainda não implantado</div>
      <Faisca valores={[0, 0]} />
    </div>
  );
  const kpi = (k: Kpi | null, titulo: string, icone: string, valor: string, sub: { cls: string; texto: string } | null, abrir: () => void, ouro = false) => (
    <div className="rp-kpi rp-cockpit__kpi" role="button" tabIndex={0} title="Abrir detalhes" onClick={abrir} onKeyDown={(e) => e.key === 'Enter' && abrir()}>
      <div className="rp-kpi-head"><i className={`rp-ico rp-ico-${icone}`} aria-hidden="true" />{titulo}</div>
      <div className="rp-kpi-valor">{k ? valor : '—'}</div>
      <div className={`rp-kpi-delta${sub?.cls ?? ''}`}>{k ? sub?.texto : 'Sem permissão para ver este indicador'}</div>
      <Faisca valores={k?.series?.length ? k.series : [0, 0]} ouro={ouro} />
    </div>
  );
  const rotuloPeriodo = opcoes.find((o) => o.valor === aplicado.periodo)?.rotulo ?? aplicado.periodo;
  const nomes = c?.stockBelowMinNames ?? [];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-cockpit rp-rolagem">
        <div className="rp-filtros">
          <label>Período <Selecao aria-label="Período" valor={periodo} onChange={setPeriodo} opcoes={opcoes} largura="200px" /></label>
          <label>Comparar com <Selecao aria-label="Comparar com" valor={compara} onChange={setCompara} opcoes={COMPARA} largura="180px" /></label>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setAplicado({ periodo, compara })}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setPeriodo(atual), setCompara('ANTERIOR'), setAplicado({ periodo: atual, compara: 'ANTERIOR' }))}>Limpar</button>
          <div className="rp-filtros-dir">
            <span className="rp-chip"><b>Período:</b> {rotuloPeriodo}
              {aplicado.periodo !== atual && <i className="x" role="button" tabIndex={0} title="Remover" onClick={() => (setPeriodo(atual), setAplicado({ ...aplicado, periodo: atual }))}>×</i>}
            </span>
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : !c || !specs ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <div className="rp-dash rp-cockpit__dash">
            <div className="rp-dash-kpis">
              {kpi(c.billing, c.period.length === 7 ? 'Faturamento do mês' : 'Faturamento do período', 'faturamento', reaisInteiros(c.billing?.value ?? 0),
                delta(c.billing), () => dados('faturamento'))}
              {kpi(c.backlog, 'Carteira de pedidos', 'vendas', reaisInteiros(c.backlog?.value ?? 0),
                { cls: '', texto: `${c.backlogEquipment ?? 0} ${c.backlogEquipment === 1 ? 'balança' : 'balanças'} a entregar` }, () => dados('carteira'))}
              {kpi(c.funnel, 'Funil comercial ponderado', 'oportunidades', reaisInteiros(c.funnel?.value ?? 0),
                { cls: '', texto: `${c.funnelOpen ?? 0} ${c.funnelOpen === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}` }, () => win.open('opportunities'))}
              {kpi(c.cash, 'Saldo em caixa e bancos', 'financas', reaisInteiros(c.cash?.value ?? 0), delta(c.cash), () => dados('caixa'), true)}
            </div>
            <div className="rp-dash-kpis">
              {semModulo('Ordens de produção em andamento', 'producao', 'Produção')}
              {kpi(c.installations, 'Instalações nos próximos 30 dias', 'instalacoes', String(c.installations?.value ?? 0),
                c.installations && c.installations.previous != null
                  ? { cls: (c.installations.value ?? 0) >= c.installations.previous ? ' rp-kpi-delta--up' : ' rp-kpi-delta--down',
                      texto: `${(c.installations.value ?? 0) >= c.installations.previous ? '▲' : '▼'} ${Math.abs((c.installations.value ?? 0) - c.installations.previous)} vs. 30 dias anteriores` }
                  : null, () => dados('instalacoes'))}
              {semModulo('Chamados de pós-venda abertos', 'posvenda', 'Pós-venda')}
              {kpi(c.stockBelowMin, 'Itens abaixo do estoque mínimo', 'estoque', String(c.stockBelowMin?.value ?? 0),
                nomes.length ? { cls: ' rp-kpi-delta--down', texto: nomes.length > 2 ? `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}` : nomes.join(' e ') }
                  : { cls: ' rp-kpi-delta--up', texto: 'Nenhum item abaixo do mínimo' }, () => dados('estoque'), true)}
            </div>
            <div className="rp-dash-row rp-cockpit__linha rp-cockpit__linha--larga">
              <CartaoGrafico icone="relatorios" titulo="Faturamento × meta — 12 meses (mil R$)" spec={specs.fat} altura={240} vazio="Nenhuma nota de saída nos últimos 12 meses."
                arquivo={`faturamento-meta-${c.period}.csv`} />
              <CartaoGrafico icone="bi" titulo="Receita do ano por linha de produto" spec={specs.mix} altura={240} vazio="Nenhuma nota de saída nos últimos 12 meses."
                arquivo={`receita-por-linha-${c.period}.csv`} />
            </div>
            <div className="rp-dash-row rp-cockpit__linha">
              <CartaoGrafico icone="vendas" titulo="Carteira de pedidos por mês de entrega (mil R$)" spec={specs.carteira} altura={240} vazio="Nenhum pedido em aberto com entrega prometida."
                arquivo={`carteira-por-mes-${c.period}.csv`} />
              <CartaoGrafico icone="financas" titulo="Fluxo de caixa — 12 meses (mil R$)" spec={specs.caixa} altura={240} vazio="Nenhum recebimento ou pagamento nos últimos 12 meses."
                arquivo={`fluxo-de-caixa-${c.period}.csv`} />
            </div>
            <div className="rp-dash-row rp-cockpit__linha">
              <CartaoGrafico icone="producao" titulo="Produção — balanças concluídas por semana" spec={null} altura={220}
                vazio="As ordens de produção ainda não têm módulo no Renda+; o gráfico entra com ele." arquivo="producao.csv" />
              <CartaoGrafico icone="oportunidades" titulo="Funil comercial por etapa (mil R$)" spec={specs.funil} altura={220} vazio="Nenhuma oportunidade aberta."
                arquivo={`funil-por-etapa-${c.period}.csv`} />
            </div>
            <div className="rp-dash-row rp-cockpit__fim">
              <div className="rp-chart">
                <div className="rp-chart-head"><i className="rp-ico rp-ico-alerta" aria-hidden="true" />O que precisa de atenção</div>
                <div className="rp-grid-rolagem rp-rolagem rp-cockpit__lista">
                  <table className="rp-grid rp-cockpit__tabela-fixa" aria-label="O que precisa de atenção">
                    <thead><tr><th style={{ width: '22px' }} aria-label="Abrir" /><th style={{ width: '86px' }}>Área</th><th>Situação</th><th style={{ width: '76px' }}>Prazo</th><th style={{ width: '82px' }}>Nível</th></tr></thead>
                    <tbody>
                      {alertas.map((a) => (
                        <tr key={a.text}>
                          <td>{ABRE_ALERTA[a.kind] && <span className="rp-link" role="link" tabIndex={0} title="Abrir" aria-label={`Abrir — ${a.text}`} onClick={() => abrirAlerta(a)}
                            onKeyDown={(e) => e.key === 'Enter' && abrirAlerta(a)} />}</td>
                          <td><i className={`rp-ico ${a.icon}`} aria-hidden="true" /> {a.area}</td>
                          <td title={a.text}>{a.text}</td><td>{a.due}</td><td><span className={SELO_NIVEL[a.level] ?? 'rp-badge'}>{a.level}</span></td>
                        </tr>
                      ))}
                      {alertas.length === 0 && <tr><td /><td colSpan={4}>Nada pendente: tudo em dia.</td></tr>}
                      <tr className="rp-grid-resto" aria-hidden="true"><td /><td /><td /><td /><td /></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rp-chart">
                <div className="rp-chart-head"><i className="rp-ico rp-ico-calendario" aria-hidden="true" />Próximas entregas e instalações</div>
                <div className="rp-grid-rolagem rp-rolagem rp-cockpit__lista">
                  <table className="rp-grid rp-cockpit__tabela-fixa" aria-label="Próximas entregas e instalações">
                    <thead><tr><th style={{ width: '76px' }}>Data</th><th>Cliente</th><th>Equipamento</th><th style={{ width: '124px' }}>Etapa</th></tr></thead>
                    <tbody>
                      {c.deliveries.map((e, i) => (
                        <tr key={i} onDoubleClick={() => win.open('project', e.projectId)}>
                          <td>{e.date}</td><td title={e.customer}>{e.customer}</td><td title={e.equipment}>{e.equipment}</td>
                          <td><span className={classeSelo(e.stage)}>{e.stage}</span></td>
                        </tr>
                      ))}
                      {c.deliveries.length === 0 && <tr><td colSpan={4}>Nenhuma entrega programada.</td></tr>}
                      <tr className="rp-grid-resto" aria-hidden="true"><td /><td /><td /><td /></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rp-ai" role="region" aria-label="Leitura dos números">
                <div className="rp-ai-head"><i className="rp-ico rp-ico-ia-insight" aria-hidden="true" />Leitura dos números</div>
                {leituras.length === 0 && <div className="rp-ai-item"><div><p>Sem dados suficientes no período.</p></div></div>}
                {leituras.map((l) => (
                  <div key={l.titulo} className="rp-ai-item">
                    <i className={`rp-ico ${l.icone}`} aria-hidden="true" />
                    <div><b>{l.titulo}</b><p>{l.texto}</p></div>
                  </div>
                ))}
                {alertas.length > 0 && (
                  <div className="rp-ai-item">
                    <i className="rp-ico rp-ico-ia-risco" aria-hidden="true" />
                    <div><b>Primeiro da fila</b><p>{alertas[0].area}: {alertas[0].text}.</p></div>
                    <div className="rp-ai-acoes">
                      {ABRE_ALERTA[alertas[0].kind] && <button type="button" className="rp-btn" onClick={() => abrirAlerta(alertas[0])}>Abrir</button>}
                      <button type="button" className="rp-btn" onClick={() => setIgnorados((s) => new Set([...s, alertas[0].text]))}>Ignorar</button>
                    </div>
                  </div>
                )}
                <div className="rp-ai-foot">Calculado pelas regras do Renda+ a partir de faturamento, carteira, funil, caixa e estoque.</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div><button type="button" className="rp-btn rp-btn--default" onClick={() => void carregar()}><span><u>A</u>tualizar</span></button></div>
        <div>
          <button type="button" className="rp-btn" onClick={() => win.open('cockpit-dados', `faturamento@${aplicado.periodo}`)}><span><u>D</u>ados do faturamento</span></button>
          <button type="button" className="rp-btn" onClick={() => window.print()}><span><u>E</u>xportar</span></button>
        </div>
      </div>
    </>
  );
}
