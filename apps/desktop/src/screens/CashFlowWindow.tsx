import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { BankAccount, CashFlow, CashFlowColumn, CashFlowComposition, CashFlowMonth } from '../api/types';
import { competenciaDaApi, competenciaParaApi, dataDaApi, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { CONTAS_ALTERADAS } from './BankAccountsWindow';
import { useCategorias } from './comum/Categorias';
import { Selecao } from './comum/Selecao';
import { PAGAR_ALTERADOS } from './PayablesWindow';
import { TITULOS_ALTERADOS } from './ReceivablesWindow';
import { IMPOSTOS_ALTERADOS } from './TaxPeriodsWindow';

const PERIODO: Record<CashFlowMonth['period'], string> = { REALIZADO: 'Realizado', CORRENTE: 'Corrente', PREVISTO: 'Previsto' };

type Linha = { rotulo: string; coluna?: CashFlowColumn; valor: (m: CashFlowMonth) => string; atraso?: (m: CashFlowMonth) => string; atrasoColuna?: CashFlowColumn };

const LINHAS: Linha[] = [
  { rotulo: 'Saldo inicial', coluna: 'OPENING', valor: (m) => m.openingCents },
  { rotulo: 'Entradas realizadas', coluna: 'REALIZED_IN', valor: (m) => m.realizedInCents },
  { rotulo: 'Saídas realizadas', coluna: 'REALIZED_OUT', valor: (m) => m.realizedOutCents },
  { rotulo: 'Entradas previstas', coluna: 'FORECAST_IN', valor: (m) => m.forecastInCents, atraso: (m) => m.overdueInCents, atrasoColuna: 'OVERDUE_IN' },
  { rotulo: 'Saídas previstas', coluna: 'FORECAST_OUT', valor: (m) => m.forecastOutCents, atraso: (m) => m.overdueOutCents, atrasoColuna: 'OVERDUE_OUT' },
  { rotulo: 'Saldo final', valor: (m) => m.closingCents },
];

const NOME_COLUNA: Record<CashFlowColumn, string> = {
  OPENING: 'Saldo inicial', REALIZED_IN: 'Entradas realizadas', REALIZED_OUT: 'Saídas realizadas', OVERDUE_IN: 'Entradas em atraso',
  OVERDUE_OUT: 'Saídas em atraso', FORECAST_IN: 'Entradas previstas', FORECAST_OUT: 'Saídas previstas',
};

/**
 * Fluxo de caixa (formulário "caixa", IND-009 e IND-010): grade com um mês por coluna — realizado nos meses passados,
 * realizado até hoje, em atraso e previsto no mês corrente, previsto nos futuros — e o saldo final de cada mês levado ao
 * seguinte. Clicar num valor abre a composição dele, com a seta para cada registro; a soma confere com o valor.
 * Pendências (obrigações ainda sem título) aparecem embaixo, sem valor.
 */
export function CashFlowWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const categorias = useCategorias();
  const [contas, setContas] = useState<BankAccount[]>([]);
  const [conta, setConta] = useState('');
  const [categoria, setCategoria] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [fluxo, setFluxo] = useState<CashFlow | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [composicao, setComposicao] = useState<CashFlowComposition | null>(null);

  useEffect(() => {
    api.get<BankAccount[]>('/api/v1/bank-accounts?includeInactive=true').then((r) => setContas(r.data)).catch(() => undefined);
  }, []);

  const filtros = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(extra);
    if (conta) q.set('accountId', conta);
    if (categoria) q.set('category', categoria);
    return q;
  }, [conta, categoria]);

  const carregar = useCallback(async (inicio: string, fim: string) => {
    const q = filtros();
    if (inicio) q.set('from', competenciaParaApi(inicio));
    if (fim) q.set('to', competenciaParaApi(fim));
    try {
      const r = await api.get<CashFlow>(`/api/v1/cash-flow?${q.toString()}`);
      setFluxo(r.data);
      setDe(competenciaDaApi(r.data.from));
      setAte(competenciaDaApi(r.data.to));
      setErro(null);
      setComposicao(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. O fluxo volta quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [filtros]);

  // Recarrega ao mudar conta ou categoria (o período muda pelo botão Atualizar ou Enter).
  const periodo = useRef({ de, ate });
  periodo.current = { de, ate };
  useEffect(() => void carregar(periodo.current.de, periodo.current.ate), [carregar]);
  useEffect(() => {
    const r = () => void carregar(periodo.current.de, periodo.current.ate);
    const eventos = [CONTAS_ALTERADAS, PAGAR_ALTERADOS, TITULOS_ALTERADOS, IMPOSTOS_ALTERADOS];
    eventos.forEach((n) => window.addEventListener(n, r));
    return () => eventos.forEach((n) => window.removeEventListener(n, r));
  }, [carregar]);

  const abrirComposicao = async (mes: string, coluna: CashFlowColumn) => {
    try {
      const r = await api.get<CashFlowComposition>(`/api/v1/cash-flow/composition?${filtros({ month: mes, column: coluna }).toString()}`);
      setComposicao(r.data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      void carregar(de, ate);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (composicao) setComposicao(null);
      else win.requestClose();
    } else if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      void carregar(de, ate);
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const meses = fluxo?.months ?? [];
  const valor = (texto: string, rotulo: string, coluna?: CashFlowColumn, mes?: string) =>
    coluna && mes ? (
      <span className="rp-fluxo__valor" role="button" tabIndex={0} aria-label={`${rotulo}: ${reais(texto)}`} title="Abrir a composição"
        onClick={() => void abrirComposicao(mes, coluna)} onKeyDown={(e) => e.key === 'Enter' && void abrirComposicao(mes, coluna)}>
        {reais(texto)}
      </span>
    ) : (
      reais(texto)
    );
  const clicavel = (l: Linha, m: CashFlowMonth, i: number) =>
    !l.coluna ? undefined
      : l.coluna === 'OPENING' ? (i === 0 || m.period === 'CORRENTE' ? l.coluna : undefined)
        : (l.coluna.startsWith('REALIZED') && m.period === 'PREVISTO') || (l.coluna.startsWith('FORECAST') && m.period === 'REALIZADO') ? undefined
          : l.coluna;
  const destino = (kind: string) => (kind === 'bank-account' ? 'bank-accounts' : kind) as 'receivable' | 'payable' | 'bank-accounts';

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-filtros rp-jlista__filtros">
          <label htmlFor={fid('conta')}>Conta</label>
          <Selecao id={fid('conta')} className="rp-field" valor={conta} onChange={setConta}
            opcoes={[{ valor: '', rotulo: 'Todas as contas' }, ...contas.map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))]} />
          <label htmlFor={fid('categoria')}>Categoria</label>
          <Selecao id={fid('categoria')} className="rp-field" valor={categoria} onChange={setCategoria}
            opcoes={[{ valor: '', rotulo: 'Todas as categorias' }, ...categorias.map((c) => ({ valor: c.code, rotulo: c.name }))]} />
          <label htmlFor={fid('de')}>De</label>
          <input id={fid('de')} className="rp-field rp-field--curto" value={de} maxLength={7} placeholder="MM/AAAA" onChange={(e) => setDe(e.target.value)} />
          <label htmlFor={fid('ate')}>Até</label>
          <input id={fid('ate')} className="rp-field rp-field--curto" value={ate} maxLength={7} placeholder="MM/AAAA" onChange={(e) => setAte(e.target.value)} />
          <button type="button" className="rp-btn" onClick={() => void carregar(de, ate)}>
            <span><u>A</u>tualizar</span>
          </button>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        ) : !fluxo ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            {fluxo.category && (
              <p className="rp-tip" role="note">Com a categoria escolhida, o saldo inicial é zero: a grade mostra só o fluxo da categoria.</p>
            )}
            {fluxo.accountId && (
              <p className="rp-tip" role="note">Com a conta escolhida, o saldo inicial e o realizado são os da conta; o previsto (títulos) é o da empresa.</p>
            )}
            <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Fluxo de caixa">
                <thead>
                  <tr>
                    <th>Mês</th>
                    {meses.map((m) => (
                      <Fragment key={m.month}>
                        {m.period === 'CORRENTE' && <th className="num">Em atraso</th>}
                        <th className="num">
                          {competenciaDaApi(m.month)}
                          <br />
                          <small>{PERIODO[m.period]}</small>
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LINHAS.map((l) => (
                    <tr key={l.rotulo}>
                      <th scope="row">{l.rotulo}</th>
                      {meses.map((m, i) => (
                        <Fragment key={m.month}>
                          {m.period === 'CORRENTE' && (
                            <td className="num">
                              {l.atraso ? valor(l.atraso(m), `${NOME_COLUNA[l.atrasoColuna!]} até ${dataDaApi(fluxo.today)}`, l.atrasoColuna, m.month) : ''}
                            </td>
                          )}
                          <td className="num">{valor(l.valor(m), `${l.rotulo} de ${competenciaDaApi(m.month)}`, clicavel(l, m, i), m.month)}</td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fluxo.pendings.length > 0 && (
              <ul className="rp-janela-mdi__aviso rp-fluxo__pendencias" aria-label="Pendências do fluxo">
                {fluxo.pendings.map((p) => (
                  <li key={`${p.month}-${p.reference}`}>
                    <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {competenciaDaApi(p.month)}: {p.message}
                  </li>
                ))}
              </ul>
            )}
            {composicao && (
              <div className="rp-tabela">
                <div className="rp-tabela-acoes">
                  <span className="rp-tabela-tit">{NOME_COLUNA[composicao.column]} — {competenciaDaApi(composicao.month)}</span>
                  <button type="button" className="rp-btn" onClick={() => setComposicao(null)}>Fechar composição</button>
                </div>
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Composição do valor">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th aria-label="Abrir" />
                        <th>Registro</th>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Parceiro ou conta</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {composicao.lines.map((l, i) => (
                        <tr key={`${l.targetId}-${i}`}>
                          <td className="rownum">{i + 1}</td>
                          <td>
                            <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir ${l.code}`} title={`Abrir ${l.code}`}
                              onClick={() => (l.targetKind === 'bank-account' ? win.open('bank-accounts') : win.open(destino(l.targetKind), l.targetId))}
                              onKeyDown={(e) => e.key === 'Enter' && (l.targetKind === 'bank-account' ? win.open('bank-accounts') : win.open(destino(l.targetKind), l.targetId))} />
                          </td>
                          <td>{l.code}</td>
                          <td>{dataDaApi(l.date)}</td>
                          <td>{l.description}</td>
                          <td>{l.party ?? ''}</td>
                          <td className="num">{reais(l.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6}>Total</td>
                        <td className="num" aria-label="Total da composição">{reais(composicao.totalCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {composicao.lines.length === 0 && <p className="rp-jlista__vazio">Nenhum registro compõe este valor.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            OK
          </button>
        </div>
      </div>
    </>
  );
}
