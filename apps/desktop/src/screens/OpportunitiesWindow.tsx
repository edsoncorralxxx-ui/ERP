import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { centavos, dataDaApi, hojeIso } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { OPORTUNIDADES_ALTERADAS } from './comum/Crm';
import { classeSelo, CRM_ALTERADO, etapaVisivel, fechadaAntiga, nomeCliente, pct, type OportunidadeLinha } from './comum/CrmMock';
import { Abas, Seta, useApi, type Aba } from './comum/Ficha';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

let novas = 0;
export const novaOportunidade = () => `novo-${++novas}`;

type Modo = 'lista' | 'etapa';
const MODOS: Aba<Modo>[] = [{ id: 'lista', rotulo: 'Lista', tecla: 'L' }, { id: 'etapa', rotulo: 'Por etapa do funil', tecla: 'e' }];

/**
 * Oportunidades de venda do mock (CRM-Oportunidades): Localizar, Responsável e Etapa; aba Lista (número, cliente, título,
 * etapa, valor, %, ponderado, previsão, responsável, com os totais) e aba Por etapa do funil (grupos com subtotal e
 * participação). Nova oportunidade, Kanban de vendas e Painel comercial embaixo.
 */
export function OpportunitiesWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [linhas, setLinhas] = useState<OportunidadeLinha[] | null>(null);
  const [busca, setBusca] = useState('');
  const [dono, setDono] = useState('');
  const [etapa, setEtapa] = useState('');
  const [filtro, setFiltro] = useState({ busca: '', dono: '', etapa: '' });
  const [modo, setModo] = useState<Modo>('lista');
  const [sel, setSel] = useState<string | null>(null);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const donos = useApi<{ username: string; displayName: string }[]>('/api/v1/crm/owners', []);
  const etapas = useApi<{ code: string; name: string; closePercent: string }[]>('/api/v1/opportunity-stages', []);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<OportunidadeLinha[]>('/api/v1/crm/opportunity-board');
      setLinhas(r.data);
    } catch (e) {
      const x = e as ApiError;
      setLinhas([]);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => {
    void carregar();
    const f = () => void carregar();
    window.addEventListener(CRM_ALTERADO, f);
    window.addEventListener(OPORTUNIDADES_ALTERADAS, f);
    return () => (window.removeEventListener(CRM_ALTERADO, f), window.removeEventListener(OPORTUNIDADES_ALTERADAS, f));
  }, [carregar]);

  const filtradas = useMemo(() => {
    const t = filtro.busca.trim().toLowerCase();
    const hoje = hojeIso();
    return (linhas ?? []).filter((o) => (filtro.etapa || !fechadaAntiga(o, hoje)) && (!filtro.dono || o.owner === filtro.dono)
      && (!filtro.etapa || (filtro.etapa === 'GANHA' || filtro.etapa === 'PERDIDA' ? o.status === filtro.etapa : o.status === 'ABERTA' && o.stage === filtro.etapa))
      && (!t || `${o.code} ${nomeCliente(o)} ${o.title}`.toLowerCase().includes(t)));
  }, [linhas, filtro]);
  const totValor = filtradas.reduce((a, o) => a + o.potentialCents, 0);
  const totPond = filtradas.reduce((a, o) => a + o.weightedCents, 0);
  const grupos = useMemo(() => {
    const ordem = [...etapas.map((e) => ({ k: e.code, nome: `${e.name} · ${pct(Number(e.closePercent))}` })), { k: 'GANHA', nome: 'Ganha · 100%' }, { k: 'PERDIDA', nome: 'Perdida · 0%' }];
    return ordem.map((g) => ({ ...g, ops: filtradas.filter((o) => (o.status === 'ABERTA' ? o.stage : o.status) === g.k) })).filter((g) => g.ops.length);
  }, [etapas, filtradas]);
  const abrir = (o: OportunidadeLinha) => win.open('opportunity', o.id, filtradas.map((x) => x.id));
  const novo = useMemo(() => (can('opportunity.create') ? () => win.open('opportunity', novaOportunidade()) : undefined), [can, win]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);
  const alternar = (k: string) => setFechados((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const qtd = (n: number) => `${n} ${n === 1 ? 'oportunidade' : 'oportunidades'}`;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-crmops">
        <div className="rp-filtros">
          <label>Localizar <input className="rp-field rp-crmleads__busca" aria-label="Localizar" placeholder="Cliente, número ou título" value={busca} maxLength={100}
            onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFiltro({ busca, dono, etapa })} /></label>
          <label>Responsável <Selecao aria-label="Responsável" valor={dono} onChange={setDono} largura="170px"
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...donos.map((d) => ({ valor: d.username, rotulo: d.displayName }))]} /></label>
          <label>Etapa <Selecao aria-label="Etapa" valor={etapa} onChange={setEtapa} largura="130px"
            opcoes={[{ valor: '', rotulo: 'Todas' }, ...etapas.map((e) => ({ valor: e.code, rotulo: e.name })), { valor: 'GANHA', rotulo: 'Ganha' }, { valor: 'PERDIDA', rotulo: 'Perdida' }]} /></label>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setFiltro({ busca, dono, etapa })}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setBusca(''), setDono(''), setEtapa(''), setFiltro({ busca: '', dono: '', etapa: '' }))}>Limpar</button>
        </div>
        <Abas abas={MODOS} atual={modo} onTroca={setModo} rotulo="Modo de exibição" />
        <div className="rp-tabpanel rp-crmops__painel">
          <div className="rp-grid-rolagem rp-rolagem rp-crmops__grade">
            {modo === 'lista' ? (
              <table className="rp-grid rp-crmops__tabela" aria-label="Oportunidades">
                <thead>
                  <tr><th style={{ width: '34px' }}>#</th><th style={{ width: '22px' }} aria-label="Abrir" /><th style={{ width: '90px' }}>Número</th><th>Cliente</th><th>Título</th>
                    <th style={{ width: '112px' }}>Etapa</th><th className="num" style={{ width: '112px' }}>Valor</th><th className="num" style={{ width: '46px' }}>%</th>
                    <th className="num" style={{ width: '104px' }}>Ponderado</th><th style={{ width: '84px' }}>Previsão</th><th style={{ width: '150px' }}>Responsável</th></tr>
                </thead>
                <tbody>
                  {filtradas.map((o, i) => (
                    <tr key={o.id} aria-selected={sel === o.id} onClick={() => setSel(o.id)} onDoubleClick={() => abrir(o)}>
                      <td className="rownum">{i}</td><td><Seta titulo={`Abrir ${o.code}`} abrir={() => abrir(o)} /></td><td>{o.code}</td>
                      <td title={nomeCliente(o)}>{nomeCliente(o)}</td><td title={o.title}>{o.title}</td>
                      <td><span className={classeSelo(etapaVisivel(o))}>{etapaVisivel(o)}</span></td><td className="num">{centavos(o.potentialCents)}</td>
                      <td className="num">{pct(o.closePercent)}</td><td className="num">{centavos(o.weightedCents)}</td><td>{dataDaApi(o.expectedClose)}</td><td>{o.owner}</td>
                    </tr>
                  ))}
                  <LinhaResto colunas={11} />
                </tbody>
                <tfoot>
                  <tr><td colSpan={6}>{linhas === null ? 'Carregando' : qtd(filtradas.length)}</td><td className="num">{centavos(totValor)}</td><td /><td className="num">{centavos(totPond)}</td><td colSpan={2} /></tr>
                </tfoot>
              </table>
            ) : (
              <table className="rp-grid rp-grid--resumo rp-crmops__tabela" aria-label="Oportunidades por etapa do funil">
                <thead>
                  <tr><th>Etapa / cliente</th><th>Título</th><th style={{ width: '84px' }}>Previsão</th><th style={{ width: '150px' }}>Responsável</th>
                    <th className="num" style={{ width: '112px' }}>Valor</th><th className="num" style={{ width: '104px' }}>Ponderado</th><th style={{ width: '110px' }}>Participação</th></tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const v = g.ops.reduce((a, o) => a + o.potentialCents, 0), w = g.ops.reduce((a, o) => a + o.weightedCents, 0);
                    const aberto = !fechados.has(g.k);
                    return (
                      <Fragment key={g.k}>
                        <tr className="grupo" data-aberto={aberto} onClick={() => alternar(g.k)}>
                          <td>{g.nome}</td><td /><td /><td /><td className="num">{centavos(v)}</td><td className="num">{centavos(w)}</td>
                          <td><span className="rp-barra-celula" style={{ width: `${totPond ? Math.round((w / totPond) * 100) : 0}%` }} /></td>
                        </tr>
                        {aberto && g.ops.map((o) => (
                          <tr key={o.id} onDoubleClick={() => abrir(o)}>
                            <td className="rec"><Seta titulo={`Abrir ${o.code}`} abrir={() => abrir(o)} /> {nomeCliente(o)}</td><td title={o.title}>{o.title}</td>
                            <td>{dataDaApi(o.expectedClose)}</td><td>{o.owner}</td><td className="num">{centavos(o.potentialCents)}</td><td className="num">{centavos(o.weightedCents)}</td><td />
                          </tr>
                        ))}
                        {aberto && g.k !== 'GANHA' && g.k !== 'PERDIDA' && (
                          <tr className="sub"><td>Subtotal — {qtd(g.ops.length)}</td><td /><td /><td /><td className="num">{centavos(v)}</td><td className="num">{centavos(w)}</td><td /></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td>Total geral — {qtd(filtradas.length)}</td><td /><td /><td /><td className="num">{centavos(totValor)}</td><td className="num">{centavos(totPond)}</td><td /></tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
        <div className="rp-pag">
          <button type="button" disabled title="Primeira">«</button><button type="button" disabled title="Anterior">‹</button>
          <button type="button" aria-current="page">1</button><button type="button" disabled title="Próxima">›</button><button type="button" disabled title="Última">»</button>
          <span className="rp-pag-info">{filtradas.length ? `1 a ${filtradas.length} de ${filtradas.length} registros` : 'Nenhum registro'}</span>
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={!novo} onClick={novo}><span>Nova <u>o</u>portunidade</span></button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
          <button type="button" className="rp-btn" onClick={() => win.open('kanban')}><span><u>K</u>anban de vendas</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('crm-dashboard')}><span><u>P</u>ainel comercial</span></button>
        </div>
      </div>
    </>
  );
}
