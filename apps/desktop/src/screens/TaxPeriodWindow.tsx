import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { HistoryEntry, TaxPeriod, TaxSimulation } from '../api/types';
import { centavosParaApi, competenciaDaApi, dataDaApi, dataHora, dataParaApi, reais, percentual } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { DOCUMENTOS_ALTERADOS } from './DocumentsWindow';
import { TIPO_NOTA } from './DocumentWindow';
import { IMPOSTOS_ALTERADOS, seloCompetencia } from './TaxPeriodsWindow';

type Tab = 'receitas' | 'simulacao' | 'rbt12' | 'conferencia' | 'historico';

const ORIGEM: Record<'CALCULADO' | 'INFORMADO', string> = { CALCULADO: 'calculado das notas', INFORMADO: 'informado pelo contador' };
const TIPO_RECEITA = { PRODUTO: 'Produto', SERVICO: 'Serviço' } as const;

const seta = (rotulo: string, fn: () => void) => (
  <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
);

const avisar = () => window.dispatchEvent(new Event(IMPOSTOS_ALTERADOS));

/** Resultado de uma simulação em uma palavra ou valor. */
const resultado = (s: TaxSimulation | undefined) => (!s ? '' : s.result === 'NAO_CALCULAVEL' ? 'Não calculável' : reais(s.totalTaxCents));

/**
 * Ficha da competência fiscal (formulário "impostos", Sprint 7). Mostra, separados: a receita documentada pelas notas
 * (produto e serviço), o RBT12 (calculado das notas, quando o Renda+ tem os 12 meses anteriores, ou informado pelo
 * contador), a simulação gerencial do Simples Nacional com a memória do cálculo e o valor apurado pelo contador, com a
 * diferença. A competência conferida pode ser fechada — as notas dela deixam de poder ser registradas ou canceladas — e
 * reaberta com motivo.
 */
export function TaxPeriodWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const competencia = recordKey;
  const [p, setP] = useState<TaxPeriod | null>(null);
  const [etag, setEtag] = useState('"0"');
  const [tab, setTab] = useState<Tab>('receitas');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [reabrir, setReabrir] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [rbt12, setRbt12] = useState({ valor: '', por: '', obs: '' });
  const [conf, setConf] = useState({ valor: '', vencimento: '', obs: '' });
  const chave = useRef(novaChave());

  const aberta = p?.status === 'ABERTA';
  const alterado = !!(rbt12.valor || rbt12.por || rbt12.obs || conf.valor || conf.vencimento || conf.obs);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((d: TaxPeriod, etagLido?: string) => {
    setP(d);
    setEtag(etagLido ?? `"${d.version}"`);
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<TaxPeriod>(`/api/v1/tax-periods/${competencia}`);
      aplicar(r.data, r.etag);
      setErroCarga(null);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [competencia, aplicar]);

  useEffect(() => void carregar(), [carregar]);

  // Nota registrada ou cancelada em outra janela muda a receita da competência.
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(DOCUMENTOS_ALTERADOS, r);
    return () => window.removeEventListener(DOCUMENTOS_ALTERADOS, r);
  }, [carregar]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/tax-periods/${competencia}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, competencia, historico]);

  const falha = useCallback((e: unknown) => {
    tratarFalha(e, { objeto: 'A competência', notify: winRef.current.notify, setErros, setConflito });
  }, []);

  const rotulo = competenciaDaApi(competencia);

  /** Executa um comando que devolve a competência atualizada; `ok` monta a mensagem de sucesso. */
  const executar = useCallback(
    async (fn: () => Promise<{ data: TaxPeriod; etag?: string }>, ok: (d: TaxPeriod) => string): Promise<boolean> => {
      setOcupado(true);
      try {
        const r = await fn();
        aplicar(r.data, r.etag);
        winRef.current.notify({ tone: 'sucesso', text: ok(r.data) });
        avisar();
        return true;
      } catch (e) {
        falha(e);
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [aplicar, falha],
  );

  /** Simula; a mesma chave vai de novo se a rede cair antes da resposta, para não gravar duas simulações. */
  const simular = async () => {
    const ok = await executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${competencia}/simulations`, null, { 'Idempotency-Key': chave.current }),
      (d) => {
        const s = d.simulations[0];
        return s?.result === 'CALCULADA'
          ? `Simulação ${s.seq} da competência ${rotulo} registrada com sucesso: ${reais(s.totalTaxCents)}`
          : `Simulação ${s?.seq ?? ''} da competência ${rotulo} registrada: não calculável`;
      },
    );
    if (ok) {
      chave.current = novaChave();
      setTab('simulacao');
    }
  };

  const informar = async () => {
    const ok = await executar(
      () => api.put<TaxPeriod>(`/api/v1/tax-periods/${competencia}/rbt12`,
        { amountCents: centavosParaApi(rbt12.valor), informedBy: rbt12.por.trim(), notes: rbt12.obs.trim() || null }, etag),
      (d) => `RBT12 da competência ${rotulo} informado com sucesso: ${reais(d.rbt12.informedCents)}`,
    );
    if (ok) setRbt12({ valor: '', por: '', obs: '' });
  };

  const conferir = async () => {
    const ok = await executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${competencia}/confirmations`,
        { amountCents: centavosParaApi(conf.valor), dueDate: dataParaApi(conf.vencimento), notes: conf.obs.trim() || null }, { 'If-Match': etag }),
      (d) => `Conferência do contador da competência ${rotulo} registrada com sucesso: ${reais(d.confirmations[0]?.amountCents)}`
        + (d.differenceCents ? `; diferença ${reais(d.differenceCents)}` : ''),
    );
    if (ok) setConf({ valor: '', vencimento: '', obs: '' });
  };

  const fechar = () =>
    void executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${competencia}/closures`, null, { 'If-Match': etag }),
      () => `Competência ${rotulo} fechada com sucesso; as notas dela não podem mais ser registradas nem canceladas`,
    );

  const reabrirCompetencia = (motivo: string) => {
    setReabrir(false);
    void executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${competencia}/reopenings`, { reason: motivo }, { 'If-Match': etag }),
      () => `Competência ${rotulo} reaberta com sucesso`,
    );
  };

  const ultima = p?.simulations[0];
  const conferencia = p?.confirmations[0];
  const podeSimular = !!p && aberta && !ocupado && can('tax_period.simulate');
  const podeConferir = !!p && aberta && can('tax_period.confirm');
  const podeFechar = !!p && aberta && !ocupado && !!conferencia && can('tax_period.close');
  const podeReabrir = !!p && !aberta && !ocupado && can('tax_period.reopen');

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || reabrir) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { r: 'receitas', m: 'simulacao', b: 'rbt12', o: 'conferencia', h: 'historico' };
      if (alvo[k]) setTab(alvo[k]);
      else if (k === 's' && podeSimular) void simular();
      else if (k === 'f' && podeFechar) fechar();
      else if (k === 'i' && podeReabrir) setReabrir(true);
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const campoLeitura = (rot: string, valor: string, num = true) => (
    <>
      <span className="rp-label">{rot}</span>
      <input className={`rp-field rp-field--readonly${num ? ' rp-field--num' : ''}`} readOnly aria-label={rot} value={valor} />
    </>
  );

  const tabs: [Tab, ReactNode][] = [
    ['receitas', <span><u>R</u>eceitas ({p?.documents.length ?? 0})</span>],
    ['simulacao', <span>Si<u>m</u>ulação ({p?.simulations.length ?? 0})</span>],
    ['rbt12', <span>R<u>B</u>T12</span>],
    ['conferencia', <span>C<u>o</u>nferência ({p?.confirmations.length ?? 0})</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !p ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Competência</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--curto" readOnly aria-label="Competência" value={rotulo} />
                <span className="rp-label">Receita de produto</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Receita de produto" value={reais(p.productRevenueCents)} />
                <span className="rp-label">Receita de serviço</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Receita de serviço" value={reais(p.serviceRevenueCents)} />
                <span className="rp-label">Receita total</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Receita documentada" value={reais(p.revenueCents)} />
                <span className="rp-label">Parâmetros</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta('Abrir parâmetros fiscais', () => win.open('tax-parameters'))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Parâmetros vigentes"
                    value={p.parameters
                      ? `Revisão ${p.parameters.revision} — Anexo ${p.parameters.productAnnex} (produto), ${p.parameters.serviceAnnex} (serviço)`
                      : 'Sem parâmetros vigentes nesta competência'} />
                </span>
                <span className="rp-label">RBT12</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="RBT12 usado"
                  value={p.rbt12.usedCents ? `${reais(p.rbt12.usedCents)} (${ORIGEM[p.rbt12.usedOrigin!]})` : 'Desconhecido: informe o RBT12 do PGDAS-D'} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {seloCompetencia(p.status)}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                {campoLeitura('Simulação', resultado(ultima))}
                {campoLeitura('Contador', conferencia ? reais(conferencia.amountCents) : '')}
                {campoLeitura('Diferença', p.differenceCents ? reais(p.differenceCents) : '')}
                {campoLeitura('Vencimento', conferencia ? dataDaApi(conferencia.dueDate) : '', false)}
                {campoLeitura('Versão', p.version)}
              </div>
            </div>

            {!p.revenueKnown && (
              <p className="rp-janela-mdi__aviso rp-ficha__nota">
                <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Competência anterior ao início do Renda+: a receita aqui é só a das notas registradas nele.
              </p>
            )}
            {p.status === 'FECHADA' && (
              <p className="rp-janela-mdi__aviso rp-ficha__nota">
                <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Competência fechada: notas de {rotulo} não podem ser registradas nem canceladas até a reabertura.
              </p>
            )}

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, r]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                  {r}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {tab === 'receitas' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Notas da competência">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th />
                        <th>Documento</th>
                        <th>Nota</th>
                        <th>Tipo</th>
                        <th>Emissão</th>
                        <th>Cliente</th>
                        <th>Pedido</th>
                        <th className="num">Produto</th>
                        <th className="num">Serviço</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.documents.map((d, i) => (
                        <tr key={d.id} onDoubleClick={() => win.open('document', d.id)}>
                          <td className="rownum">{i + 1}</td>
                          <td>{seta(`Abrir documento ${d.code}`, () => win.open('document', d.id))}</td>
                          <td>{d.code}</td>
                          <td>Nº {d.number} / série {d.series}</td>
                          <td>{TIPO_NOTA[d.kind]}</td>
                          <td>{dataDaApi(d.issueDate)}</td>
                          <td>{d.customerCode} — {d.customerName}</td>
                          <td>{d.orderCode ?? ''}</td>
                          <td className="num">{reais(d.productCents)}</td>
                          <td className="num">{reais(d.serviceCents)}</td>
                          <td className="num">{reais(d.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={8}>Receita documentada</td>
                        <td className="num">{reais(p.productRevenueCents)}</td>
                        <td className="num">{reais(p.serviceRevenueCents)}</td>
                        <td className="num" aria-label="Soma das notas">{reais(p.revenueCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {p.documents.length === 0 && <p className="rp-jlista__vazio">Nenhuma nota ativa nesta competência.</p>}
                </div>
              ) : tab === 'simulacao' ? (
                <Simulacao simulacoes={p.simulations} />
              ) : tab === 'rbt12' ? (
                <div className="rp-ficha__grade">
                  <div className="rp-form">
                    {campoLeitura('RBT12 calculado', p.rbt12.calculatedCents ? reais(p.rbt12.calculatedCents) : 'Sem os 12 meses no Renda+')}
                    {campoLeitura('RBT12 informado', p.rbt12.informedCents ? `${reais(p.rbt12.informedCents)} — ${p.rbt12.informedBy}` : '')}
                    {p.rbt12.missing.length > 0 && campoLeitura('Meses sem receita no Renda+',
                      p.rbt12.missing.length === 1 ? competenciaDaApi(p.rbt12.missing[0]) : `${competenciaDaApi(p.rbt12.missing[0])} a ${competenciaDaApi(p.rbt12.missing.at(-1))}`, false)}
                  </div>
                  {podeConferir && !p.rbt12.calculatedCents && (
                    <div className="rp-form rp-form--adicao" aria-label="Informar RBT12">
                      <label className="rp-label rp-label--req" htmlFor={fid('rbt12')}>RBT12 do PGDAS-D</label>
                      <input id={fid('rbt12')} className="rp-field rp-field--num" inputMode="decimal" maxLength={20} value={rbt12.valor} aria-invalid={!!erros.amountCents}
                        onChange={(e) => setRbt12((r) => ({ ...r, valor: e.target.value }))} />
                      {erroDe('amountCents')}
                      <label className="rp-label rp-label--req" htmlFor={fid('rbt12por')}>Informado por</label>
                      <input id={fid('rbt12por')} className="rp-field" maxLength={100} value={rbt12.por} aria-invalid={!!erros.informedBy}
                        onChange={(e) => setRbt12((r) => ({ ...r, por: e.target.value }))} />
                      {erroDe('informedBy')}
                      <label className="rp-label" htmlFor={fid('rbt12obs')}>Observações</label>
                      <input id={fid('rbt12obs')} className="rp-field" maxLength={500} value={rbt12.obs} onChange={(e) => setRbt12((r) => ({ ...r, obs: e.target.value }))} />
                      <span />
                      <span className="rp-btn-row">
                        <button type="button" className="rp-btn" disabled={ocupado || !rbt12.valor.trim()} onClick={() => void informar()}>
                          Informar RBT12
                        </button>
                      </span>
                    </div>
                  )}
                  {p.rbt12.calculatedCents && (
                    <p className="rp-janela-mdi__aviso">
                      <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> O Renda+ tem a receita dos 12 meses anteriores: o RBT12 é calculado das notas.
                    </p>
                  )}
                </div>
              ) : tab === 'conferencia' ? (
                <div className="rp-ficha__grade">
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Conferências do contador">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th className="num">Valor do contador</th>
                          <th>Vencimento</th>
                          <th>Sobre a simulação</th>
                          <th>Observações</th>
                          <th>Registrada em</th>
                          <th>Por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.confirmations.map((c) => (
                          <tr key={c.id}>
                            <td className="rownum">{c.seq}</td>
                            <td className="num">{reais(c.amountCents)}</td>
                            <td>{dataDaApi(c.dueDate)}</td>
                            <td>{c.simulationSeq ? `Simulação ${c.simulationSeq}` : 'Sem simulação'}</td>
                            <td>{c.notes ?? ''}</td>
                            <td>{dataHora(c.createdAt)}</td>
                            <td>{c.createdBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {podeConferir && (
                    <div className="rp-form rp-form--adicao" aria-label="Registrar conferência">
                      <label className="rp-label rp-label--req" htmlFor={fid('confvalor')}>Valor do contador</label>
                      <input id={fid('confvalor')} className="rp-field rp-field--num" inputMode="decimal" maxLength={20} value={conf.valor}
                        aria-invalid={!!erros.amountCents} onChange={(e) => setConf((c) => ({ ...c, valor: e.target.value }))} />
                      {erroDe('amountCents')}
                      <label className="rp-label rp-label--req" htmlFor={fid('confvenc')}>Vencimento</label>
                      <CampoData id={fid('confvenc')} rotulo="Vencimento" className="rp-field rp-field--curto" valor={conf.vencimento} invalido={!!erros.dueDate}
                        onChange={(v) => setConf((c) => ({ ...c, vencimento: v }))} />
                      {erroDe('dueDate')}
                      <label className="rp-label" htmlFor={fid('confobs')}>Observações</label>
                      <input id={fid('confobs')} className="rp-field" maxLength={500} value={conf.obs} onChange={(e) => setConf((c) => ({ ...c, obs: e.target.value }))} />
                      <span />
                      <span className="rp-btn-row">
                        <button type="button" className="rp-btn" disabled={ocupado || !conf.valor.trim()} onClick={() => void conferir()}>
                          Registrar conferência
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico da competência" />
              )}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            OK
          </button>
          {p && aberta && can('tax_period.simulate') && (
            <button type="button" className="rp-btn" disabled={!podeSimular} onClick={() => void simular()}>
              <span><u>S</u>imular</span>
            </button>
          )}
        </div>
        <div className="rp-btn-row">
          {p && aberta && can('tax_period.close') && (
            <button type="button" className="rp-btn" disabled={!podeFechar} title={conferencia ? undefined : 'Registre a conferência do contador antes de fechar'}
              onClick={fechar}>
              <span><u>F</u>echar competência</span>
            </button>
          )}
          {podeReabrir && (
            <button type="button" className="rp-btn" onClick={() => setReabrir(true)}>
              <span>Reabr<u>i</u>r competência</span>
            </button>
          )}
        </div>
      </div>

      {reabrir && (
        <DialogoMotivo rotulo="Reabrir competência" idCampo={fid('motivo')} botao="Reabrir" falta="Informe o motivo da reabertura."
          texto={`A competência ${rotulo} volta a aceitar notas, simulações e conferências.`}
          onConfirmar={reabrirCompetencia} onCancelar={() => setReabrir(false)} />
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="Competência alterada" objeto={`A competência ${rotulo}`} versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/** Aba Simulação: a última simulação com a memória do cálculo e, abaixo, as anteriores. */
function Simulacao({ simulacoes }: { simulacoes: TaxSimulation[] }) {
  const s = simulacoes[0];
  if (!s) return <p className="rp-jlista__vazio">Nenhuma simulação ainda. Use Simular: o Renda+ calcula com os parâmetros vigentes e o RBT12 conhecido.</p>;
  const m = s.memory;
  return (
    <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
      {s.result === 'NAO_CALCULAVEL' ? (
        <div className="rp-janela-mdi__aviso">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Simulação {s.seq}: não calculável.
          <ul aria-label="Motivos">
            {m.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Simulação gerencial {s.seq} — revisão {s.parameterRevision} dos parâmetros; RBT12{' '}
            {reais(s.rbt12Cents)} ({ORIGEM[s.rbt12Origin!]}). Não substitui o valor apurado pelo contador.
          </p>
          <table className="rp-grid rp-janela-mdi__grade" aria-label="Memória do cálculo">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Anexo</th>
                <th className="num">Faixa</th>
                <th className="num">Alíquota nominal</th>
                <th className="num">Parcela a deduzir</th>
                <th className="num">Alíquota efetiva</th>
                <th className="num">Receita do mês</th>
                <th className="num">Imposto</th>
              </tr>
            </thead>
            <tbody>
              {m.kinds.map((k) => (
                <tr key={k.kind}>
                  <td>{TIPO_RECEITA[k.kind]}</td>
                  <td>{k.annex}</td>
                  <td className="num">{k.bracket}ª</td>
                  <td className="num">{percentual(k.nominalRate)}</td>
                  <td className="num">{reais(k.deductionCents)}</td>
                  <td className="num">{percentual(k.effectiveRate)}</td>
                  <td className="num">{reais(k.revenueCents)}</td>
                  <td className="num">{reais(k.taxCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Simulação da competência</td>
                <td className="num" aria-label="Total simulado">{reais(s.totalTaxCents)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="rp-jlista__vazio">Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12; imposto = receita do mês × alíquota efetiva.</p>
          {m.warnings.map((w) => (
            <p key={w} className="rp-janela-mdi__aviso">
              <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {w}
            </p>
          ))}
        </>
      )}
      {simulacoes.length > 1 && (
        <table className="rp-grid rp-janela-mdi__grade" aria-label="Simulações anteriores">
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>Resultado</th>
              <th className="num">RBT12</th>
              <th className="num">Receita</th>
              <th>Em</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            {simulacoes.slice(1).map((x) => (
              <tr key={x.id}>
                <td className="rownum">{x.seq}</td>
                <td>{resultado(x)}</td>
                <td className="num">{x.rbt12Cents ? reais(x.rbt12Cents) : ''}</td>
                <td className="num">{reais((BigInt(x.productRevenueCents) + BigInt(x.serviceRevenueCents)).toString())}</td>
                <td>{dataHora(x.createdAt)}</td>
                <td>{x.createdBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
