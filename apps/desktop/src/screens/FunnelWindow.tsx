import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { Funnel, LossReason } from '../api/types';
import { Chart } from '../charts/Chart';
import { dataDaApi, dataParaApi, hojeIso, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { ETAPAS_ALTERADAS, MOTIVO_PERDA, OPORTUNIDADES_ALTERADAS, pct, useResponsaveis } from './comum/Crm';
import { Selecao } from './comum/Selecao';

/** Centavos em reais inteiros para o gráfico (a dica mostra o valor; os números exatos ficam nas grades). */
const emReais = (c: string) => Number(BigInt(c) / 100n);

/**
 * Funil de vendas (CRM, Sprint 11), como o pipeline de oportunidades do SAP Business One: as abertas por etapa com o
 * potencial e o valor ponderado; as ganhas e perdidas no período, com os motivos; e a conversão por etapa (IND-016) —
 * das que entraram na etapa no período, quantas avançaram. Sem ninguém na etapa, "Não calculável", nunca 0%.
 */
export function FunnelWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const hoje = hojeIso();
  const [de, setDe] = useState(dataDaApi(`${hoje.slice(0, 4)}-01-01`));
  const [ate, setAte] = useState(dataDaApi(hoje));
  const [responsavel, setResponsavel] = useState('');
  const [funil, setFunil] = useState<Funnel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const responsaveis = useResponsaveis();

  const recarregar = useCallback(async () => {
    const q = new URLSearchParams();
    const from = dataParaApi(de);
    const to = dataParaApi(ate);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (responsavel) q.set('owner', responsavel);
    try {
      setFunil((await api.get<Funnel>(`/api/v1/crm/funnel?${q.toString()}`)).data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.details[0]?.message ?? x.message);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [de, ate, responsavel]);

  useEffect(() => {
    const t = setTimeout(() => void recarregar(), 250);
    return () => clearTimeout(t);
  }, [recarregar]);
  useEffect(() => {
    const r = () => void recarregar();
    [OPORTUNIDADES_ALTERADAS, ETAPAS_ALTERADAS].forEach((n) => window.addEventListener(n, r));
    return () => [OPORTUNIDADES_ALTERADAS, ETAPAS_ALTERADAS].forEach((n) => window.removeEventListener(n, r));
  }, [recarregar]);

  const fid = (k: string) => `${win.windowId}-${k}`;
  const motivos = funil ? (Object.entries(funil.lostByReason) as [LossReason, { count: number; potentialCents: string }][]) : [];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), win.requestClose())}>
        <div className="rp-filtros rp-jlista__filtros">
          <label htmlFor={fid('de')}>Período de</label>
          <CampoData id={fid('de')} rotulo="Início do período" className="rp-field rp-field--curto" valor={de} onChange={setDe} />
          <label htmlFor={fid('ate')}>até</label>
          <CampoData id={fid('ate')} rotulo="Fim do período" className="rp-field rp-field--curto" valor={ate} onChange={setAte} />
          <label htmlFor={fid('resp')}>Responsável</label>
          <Selecao id={fid('resp')} valor={responsavel} onChange={setResponsavel}
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...responsaveis.map((r) => ({ valor: r.username, rotulo: r.displayName }))]} />
        </div>
        {erro && (
          <p className="rp-janela-mdi__aviso" role="alert">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        )}
        {!funil ? (
          !erro && <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <div className="rp-rolagem rp-funil">
            <div className="rp-funil__kpis">
              <div className="rp-kpi">
                <div className="rp-kpi-head">
                  <i className="rp-ico rp-ico-crm" aria-hidden="true" /> Abertas
                </div>
                <div className="rp-kpi-valor">{funil.openCount}</div>
                <div className="rp-kpi-delta">Potencial {reais(funil.openPotentialCents)}</div>
              </div>
              <div className="rp-kpi">
                <div className="rp-kpi-head">
                  <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Valor ponderado
                </div>
                <div className="rp-kpi-valor">{reais(funil.openWeightedCents)}</div>
                <div className="rp-kpi-delta">potencial × % de fechamento da etapa</div>
              </div>
              <div className="rp-kpi">
                <div className="rp-kpi-head">
                  <i className="rp-ico rp-ico-status-sucesso" aria-hidden="true" /> Ganhas no período
                </div>
                <div className="rp-kpi-valor">{funil.won.count}</div>
                <div className="rp-kpi-delta rp-kpi-delta--up">▲ {reais(funil.won.potentialCents)}</div>
              </div>
              <div className="rp-kpi">
                <div className="rp-kpi-head">
                  <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> Perdidas no período
                </div>
                <div className="rp-kpi-valor">{funil.lost.count}</div>
                <div className="rp-kpi-delta rp-kpi-delta--down">▼ {reais(funil.lost.potentialCents)}</div>
              </div>
            </div>

            <div className="rp-funil__linha">
              <section className="rp-funil__bloco" aria-label="Funil por etapa">
                <h3 className="rp-funil__titulo">Abertas por etapa</h3>
                <Chart altura={220} label="Potencial e ponderado por etapa"
                  spec={{
                    tipo: 'Barras3D', unidade: 'R$', categorias: funil.stages.map((s) => s.name),
                    series: [
                      { nome: 'Potencial', valores: funil.stages.map((s) => emReais(s.potentialCents)) },
                      { nome: 'Ponderado', valores: funil.stages.map((s) => emReais(s.weightedCents)) },
                    ],
                  }} />
                <div className="rp-grid-rolagem rp-rolagem">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Oportunidades abertas por etapa">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th className="num">% fechamento</th>
                        <th className="num">Quantidade</th>
                        <th className="num">Potencial</th>
                        <th className="num">Ponderado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funil.stages.map((s) => (
                        <tr key={s.code}>
                          <td>{s.name}</td>
                          <td className="num">{pct(s.closePercent)}</td>
                          <td className="num">{s.count}</td>
                          <td className="num">{reais(s.potentialCents)}</td>
                          <td className="num">{reais(s.weightedCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td />
                        <td className="num">{funil.openCount}</td>
                        <td className="num">{reais(funil.openPotentialCents)}</td>
                        <td className="num">{reais(funil.openWeightedCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="rp-funil__bloco" aria-label="Conversão e perdas">
                <h3 className="rp-funil__titulo">Conversão por etapa no período</h3>
                <div className="rp-grid-rolagem rp-rolagem">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Conversão por etapa">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th className="num">Entraram</th>
                        <th className="num">Avançaram</th>
                        <th className="num">Conversão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funil.conversion.map((c) => (
                        <tr key={c.code}>
                          <td>{c.name}</td>
                          <td className="num">{c.entered}</td>
                          <td className="num">{c.advanced}</td>
                          <td className="num">{c.rate === null ? 'Não calculável' : pct(c.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="rp-funil__titulo">Perdas por motivo</h3>
                <div className="rp-grid-rolagem rp-rolagem">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Perdas por motivo">
                    <thead>
                      <tr>
                        <th>Motivo</th>
                        <th className="num">Quantidade</th>
                        <th className="num">Potencial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {motivos.length === 0 ? (
                        <tr>
                          <td colSpan={3}>Nenhuma perda no período</td>
                        </tr>
                      ) : (
                        motivos.map(([m, v]) => (
                          <tr key={m}>
                            <td>{MOTIVO_PERDA[m] ?? m}</td>
                            <td className="num">{v.count}</td>
                            <td className="num">{reais(v.potentialCents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={() => win.open('opportunities')}>
            Oportunidades
          </button>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => void recarregar()}>
            Atualizar
          </button>
        </div>
      </div>
    </>
  );
}
