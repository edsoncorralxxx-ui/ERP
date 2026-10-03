import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { FiscalDashboard } from '../api/types';
import type { ChartSpec } from '../charts/Chart';
import { dataDaApi, reais, somarMeses } from '../format';
import { useWindow } from '../windows/WindowContext';
import { DOCUMENTOS_ALTERADOS } from './DocumentsWindow';
import {
  Alertas, CartaoGrafico, IMPOSTOS_ALTERADOS, Progresso, competenciaObrigacao, faixa, mesCurto, milReais, seloGuia, seloObrigacao, seta,
} from './comum/Fiscal';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';
import { competenciaPadrao } from './TaxPeriodWindow';

const pct2 = (fracao: string) => `${(Number(fracao) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Valor sem centavos, como no indicador do design system: R$ 3.340.000. */
const reaisInteiros = (cents: string | null | undefined) => (cents ? `R$ ${Math.round(Number(cents) / 100).toLocaleString('pt-BR')}` : '—');

/**
 * Painel fiscal (mock "Painel fiscal", Sprint 12): os indicadores da competência (DAS a pagar, RBT12, receita do ano contra
 * o sublimite e obrigações dos próximos 7 dias), os gráficos do RBT12 contra os limites, do DAS por tributo e por anexo em
 * 12 competências, as próximas obrigações, as barras de limite e de fechamento, as últimas guias e os alertas por regra.
 */
export function FiscalDashboardWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const padrao = competenciaPadrao();
  const [comp, setComp] = useState(padrao);
  const [d, setD] = useState<FiscalDashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setD((await api.get<FiscalDashboard>(`/api/v1/fiscal/dashboard?competence=${comp}`)).data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [comp]);

  useEffect(() => void carregar(), [carregar]);
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(IMPOSTOS_ALTERADOS, r);
    window.addEventListener(DOCUMENTOS_ALTERADOS, r);
    return () => {
      window.removeEventListener(IMPOSTOS_ALTERADOS, r);
      window.removeEventListener(DOCUMENTOS_ALTERADOS, r);
    };
  }, [carregar]);

  const opcoes = useMemo(() => Array.from({ length: 12 }, (_, i) => somarMeses(`${padrao}-01`, 1 - i).slice(0, 7))
    .map((c) => ({ valor: c, rotulo: `${c.slice(5, 7)}/${c.slice(0, 4)}` })), [padrao]);

  const abrirApuracao = () => win.open('tax-period', comp);
  const rotulo = `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;

  const specs = useMemo(() => {
    if (!d) return null;
    const cats = d.series.map((s) => mesCurto(s.competence));
    const rbt: ChartSpec = {
      tipo: 'Linha', unidade: 'mil R$', categorias: cats,
      series: [
        { nome: 'RBT12', valores: d.series.map((s) => milReais(s.rbt12Cents)) },
        { nome: 'Sublimite ICMS/ISS', valores: cats.map(() => milReais(d.sublimitCents)) },
        { nome: 'Limite do Simples', valores: cats.map(() => milReais(d.limitCents)) },
      ],
    };
    const t = d.taxes;
    const v = (...k: string[]) => k.reduce((a, x) => a + Number(t[x] ?? 0), 0) / 100;
    const fatias = [
      { nome: 'CPP', valor: v('CPP') },
      { nome: 'ICMS', valor: v('ICMS') },
      { nome: 'COFINS e PIS', valor: v('COFINS', 'PIS/Pasep') },
      { nome: 'ISS', valor: v('ISS') },
      { nome: 'IRPJ, CSLL e IPI', valor: v('IRPJ', 'CSLL', 'IPI') },
    ].filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor);
    const total = Number(d.period.calculation.totalTaxCents ?? 0) / 100;
    const trib: ChartSpec | null = fatias.length
      ? { tipo: 'Rosca3D', furo: 0.55, fatias, centro: { valor: `R$ ${(total / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`, titulo: `DAS ${rotulo}` } }
      : null;
    const das: ChartSpec = {
      tipo: 'Empilhadas3D', unidade: 'mil R$', categorias: cats,
      series: ['I', 'II', 'III'].map((an) => ({ nome: `Anexo ${an}`, valores: d.series.map((s) => milReais(s.dasByAnnex[an])) })),
    };
    return { rbt, trib, das };
  }, [d, rotulo]);

  const p = d?.period;
  const falta = d ? Number(d.sublimitCents) - Number(d.yearToDateCents) : 0;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-fiscal rp-rolagem" onKeyDown={(e) => {
        if (!e.altKey) return;
        const acao: Record<string, () => void> = {
          a: abrirApuracao, o: () => win.open('tax-obligations'), c: () => win.open('fiscal-classification'), t: () => win.open('tax-tables'),
        };
        const f = acao[e.key.toLowerCase()];
        if (f) {
          e.preventDefault();
          f();
        }
      }}>
        <div className="rp-filtros">
          <label>
            Competência{' '}
            <Selecao className="rp-field rp-field--curto" valor={comp} opcoes={opcoes} onChange={setComp} aria-label="Competência" />
          </label>
          <label>
            Estabelecimento <input className="rp-field rp-field--readonly" readOnly aria-label="Estabelecimento" value="Matriz" />
          </label>
          <button type="button" className="rp-btn" onClick={() => setComp(padrao)}>Limpar</button>
          <div className="rp-filtros-dir">
            {comp !== padrao && (
              <span className="rp-chip">
                <b>Competência:</b> {rotulo}{' '}
                <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de competência" onClick={() => setComp(padrao)}
                  onKeyDown={(e) => e.key === 'Enter' && setComp(padrao)}>×</i>
              </span>
            )}
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : !d || !p || !specs ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            {!d.ibsCbsChoice && (
              <div className="rp-status-msg rp-status-msg--aviso" role="status">
                <span>
                  {d.daysToIbsDeadline >= 0
                    ? `Opção por IBS e CBS fora do DAS no 1º semestre de 2027: o prazo termina em 30/09/2026, daqui a ${d.daysToIbsDeadline} dias.`
                    : 'Opção por IBS e CBS no 1º semestre de 2027: o prazo terminou em 30/09/2026. Registre a decisão tomada no portal (desistência até 30/11/2026).'}
                </span>
                <span className="rp-status-acao" role="link" tabIndex={0} onClick={() => win.open('tax-tables')} onKeyDown={(e) => e.key === 'Enter' && win.open('tax-tables')}>
                  Ver parâmetros
                </span>
              </div>
            )}
            <div className="rp-dash rp-fiscal__dash">
              <div className="rp-dash-kpis rp-cockpit__kpis">
                <div className="rp-kpi">
                  <div className="rp-kpi-head">
                    {seta('Abrir o cálculo do DAS', abrirApuracao)}
                    <i className="rp-ico rp-ico-fiscal" aria-hidden="true" />
                    DAS a pagar — {rotulo}
                  </div>
                  <div className="rp-kpi-valor">{d.dasCents ? reais(d.dasCents) : '—'}</div>
                  <div className="rp-kpi-delta">
                    {d.effectiveRate ? `Alíquota efetiva ${pct2(d.effectiveRate)} · ` : ''}vence {dataDaApi(d.dasDueDate)}
                  </div>
                </div>
                <div className="rp-kpi">
                  <div className="rp-kpi-head">
                    {seta('Abrir o RBT12', abrirApuracao)}
                    <i className="rp-ico rp-ico-relatorios" aria-hidden="true" />
                    RBT12 — receita em 12 meses
                  </div>
                  <div className="rp-kpi-valor">{reaisInteiros(d.rbt12Cents)}</div>
                  <div className="rp-kpi-delta">
                    {d.rbt12Cents ? `${faixa(d.bracket)} · ${pct1((Number(d.rbt12Cents) / Number(d.limitCents)) * 100)} do limite de R$ 4,8 mi` : 'Desconhecido: registre o histórico de receita'}
                  </div>
                </div>
                <div className="rp-kpi">
                  <div className="rp-kpi-head">
                    {seta('Abrir as receitas', abrirApuracao)}
                    <i className="rp-ico rp-ico-bi" aria-hidden="true" />
                    Receita acumulada no ano
                  </div>
                  <div className="rp-kpi-valor">{reaisInteiros(d.yearToDateCents)}</div>
                  <div className={`rp-kpi-delta ${falta < 0 ? 'rp-kpi-delta--down' : ''}`}>
                    {pct1((Number(d.yearToDateCents) / Number(d.sublimitCents)) * 100)} do sublimite · {falta >= 0 ? `faltam ${reaisInteiros(String(falta))}` : 'acima do sublimite'}
                  </div>
                </div>
                <div className="rp-kpi">
                  <div className="rp-kpi-head">
                    {seta('Abrir as obrigações', () => win.open('tax-obligations'))}
                    <i className="rp-ico rp-ico-calendario" aria-hidden="true" />
                    Obrigações nos próximos 7 dias
                  </div>
                  <div className="rp-kpi-valor">{d.nextWeek.length}</div>
                  <div className={`rp-kpi-delta ${d.nextWeek.length ? 'rp-kpi-delta--down' : ''}`}>
                    {d.nextWeek.length ? d.nextWeek.map((o) => `${o.name.split(' (')[0]} ${dataDaApi(o.dueDate).slice(0, 5)}`).join(' · ') : 'Nenhuma'}
                  </div>
                </div>
              </div>
              <div className="rp-dash-row rp-fiscal__linha">
                <CartaoGrafico icone="relatorios" titulo="RBT12 × sublimite e limite do Simples (mil R$)" spec={specs.rbt} altura={220}
                  vazio="Sem RBT12 conhecido nas últimas 12 competências." arquivo={`rbt12-${comp}.csv`} />
                <CartaoGrafico icone="fiscal" titulo="DAS da competência por tributo (R$)" spec={specs.trib} altura={220}
                  vazio="Sem cálculo do DAS nesta competência." arquivo={`das-por-tributo-${comp}.csv`}
                  nota={p.calculation.memory.warnings.find((w) => w.startsWith('ISS limitado'))} />
              </div>
              <div className="rp-dash-row rp-fiscal__linha">
                <CartaoGrafico icone="fiscal" titulo="DAS por anexo — 12 competências (mil R$)" spec={specs.das} altura={220}
                  vazio="Sem cálculo do DAS nas últimas 12 competências." arquivo={`das-por-anexo-${comp}.csv`} />
                <div className="rp-chart rp-cockpit__cartao">
                  <div className="rp-chart-head">
                    <i className="rp-ico rp-ico-calendario" aria-hidden="true" />
                    <span>Próximas obrigações</span>
                    <span className="rp-cockpit__acoes">{seta('Abrir as obrigações', () => win.open('tax-obligations'))}</span>
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-fiscal__grade-cartao">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Próximas obrigações">
                      <thead>
                        <tr>
                          <th />
                          <th>Vencimento</th>
                          <th>Obrigação</th>
                          <th>Comp.</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.upcoming.map((o) => (
                          <tr key={o.id}>
                            <td>{seta(`Abrir ${o.name}`, () => win.open('tax-obligations', o.id))}</td>
                            <td>{dataDaApi(o.dueDate)}</td>
                            <td>{o.name}</td>
                            <td>{competenciaObrigacao(o.competence)}</td>
                            <td>{seloObrigacao(o)}</td>
                          </tr>
                        ))}
                        <LinhaResto colunas={5} numerada={false} />
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="rp-dash-row rp-fiscal__linha">
                <div className="rp-chart rp-cockpit__cartao">
                  <div className="rp-chart-head">
                    <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" />
                    <span>Limites do Simples e fechamento</span>
                  </div>
                  <div className="rp-fiscal__barras">
                    <Progresso rotulo="Receita do ano × sublimite" valor={(Number(d.yearToDateCents) / Number(d.sublimitCents)) * 100}
                      nota="Acima do sublimite, ICMS e ISS saem do DAS no ano seguinte." />
                    <Progresso rotulo="RBT12 × limite" valor={d.rbt12Cents ? (Number(d.rbt12Cents) / Number(d.limitCents)) * 100 : 0}
                      nota="Define a faixa e a alíquota efetiva de cada anexo." />
                    <Progresso rotulo={`Fechamento de ${mesCurto(comp)}`} valor={(d.stepsDone / d.stepsTotal) * 100} ok={d.stepsDone === d.stepsTotal}
                      nota={d.stepsDone === d.stepsTotal ? 'Competência pronta para encerrar.' : `${d.stepsDone} de ${d.stepsTotal} etapas concluídas.`} />
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Guias DAS">
                      <thead>
                        <tr>
                          <th>Guia DAS</th>
                          <th>Vencimento</th>
                          <th className="num">Valor</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.guides.map((g) => (
                          <tr key={g.competence} onDoubleClick={() => win.open('tax-period', g.competence)}>
                            <td>{seta(`Abrir a apuração de ${g.competence.slice(5, 7)}/${g.competence.slice(0, 4)}`, () => win.open('tax-period', g.competence))} Competência {g.competence.slice(5, 7)}/{g.competence.slice(0, 4)}</td>
                            <td>{dataDaApi(g.dueDate)}</td>
                            <td className="num">{g.totalCents ? reais(g.totalCents) : ''}</td>
                            <td>{seloGuia(g.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <Alertas alertas={d.alerts.filter((a) => !a.startsWith('Opção por IBS'))} />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={abrirApuracao}><span><u>A</u>purar o Simples</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('tax-obligations')}><span><u>O</u>brigações</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('fiscal-classification')}><span><u>C</u>lassificação fiscal</span></button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>Fechar</button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={() => win.open('tax-tables')}><span><u>T</u>abelas e parâmetros</span></button>
        </div>
      </div>
    </>
  );
}
