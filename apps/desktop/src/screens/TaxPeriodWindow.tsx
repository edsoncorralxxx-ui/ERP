import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Annex, BankAccount, TaxPeriod, TaxPeriodSummary, TaxSetup } from '../api/types';
import { Chart } from '../charts/Chart';
import { centavosParaApi, dataDaApi, dataHora, dataParaApi, hojeIso, percentual, reais, somarMeses } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import {
  ANEXO, IMPOSTOS_ALTERADOS, Progresso, avisarFiscal, faixa, mesCurto, mesLongo, seloCompetencia, seloGuia, seta,
} from './comum/Fiscal';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';
import { DOCUMENTOS_ALTERADOS } from './DocumentsWindow';

type Tab = 'rec' | 'calc' | 'rbt' | 'guia' | 'fech' | 'hist';

const TRIBUTOS = ['IRPJ', 'CSLL', 'COFINS', 'PIS/Pasep', 'CPP', 'IPI', 'ICMS', 'ISS'];
const ORIGEM_RBT12 = { CALCULADO: 'histórico e notas', INFORMADO: 'informado' } as const;

/** Competência padrão da apuração: o mês anterior ao corrente (o que está sendo apurado). */
export const competenciaPadrao = () => somarMeses(`${hojeIso().slice(0, 7)}-01`, -1).slice(0, 7);

/** Percentual de uma razão em centavos, com uma casa: "72,7%". */
const razao = (parte: string | null | undefined, todo: string | null | undefined) => {
  const p = Number(parte ?? 0);
  const t = Number(todo ?? 0);
  return t > 0 ? (p / t) * 100 : 0;
};

const modeloNota = (kind: string, number: string) => `${kind === 'SERVICO' ? 'NFS-e' : 'NF-e'} ${number}`;

/**
 * Apuração do Simples Nacional (mock "Apuração do Simples Nacional", Sprint 12): uma competência por vez, com a receita
 * por anexo e as notas, o cálculo do DAS por anexo e por tributo (o gravado ou a prévia), o RBT12 mês a mês, a guia DAS
 * com o pagamento, as 7 etapas do fechamento e o histórico de competências. O cálculo do Renda+ não substitui o valor
 * declarado na guia (ADR-011): a diferença aparece.
 */
export function TaxPeriodWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [comp, setComp] = useState(recordKey || competenciaPadrao());
  useEffect(() => setComp(recordKey || competenciaPadrao()), [recordKey]);
  const [p, setP] = useState<TaxPeriod | null>(null);
  const [etag, setEtag] = useState('"0"');
  const [tab, setTab] = useState<Tab>('calc');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [reabrir, setReabrir] = useState(false);
  const [transmitir, setTransmitir] = useState<{ data: string; recibo: string } | null>(null);
  const [historico, setHistorico] = useState<TaxPeriodSummary[] | null>(null);
  const [setup, setSetup] = useState<TaxSetup | null>(null);
  const [contas, setContas] = useState<BankAccount[]>([]);
  const [grupos, setGrupos] = useState<Record<string, boolean>>({});
  const [guia, setGuia] = useState({ numero: '', vencimento: '', principal: '', multa: '', juros: '', obs: '' });
  const [conta, setConta] = useState('');
  const [rbt12, setRbt12] = useState({ valor: '', por: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());
  const chavePagamento = useRef(novaChave());

  useEffect(() => win.setTitle?.(`Apuração do Simples Nacional — ${mesLongo(comp)}`), [comp, win]);

  const aplicar = useCallback((d: TaxPeriod, etagLido?: string) => {
    setP(d);
    setEtag(etagLido ?? `"${d.version}"`);
    setErros({});
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<TaxPeriod>(`/api/v1/tax-periods/${comp}`);
      aplicar(r.data, r.etag);
      setErroCarga(null);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [comp, aplicar]);

  const carregarHistorico = useCallback(async () => {
    try {
      const anos = [Number(comp.slice(0, 4)), Number(comp.slice(0, 4)) - 1];
      const listas = await Promise.all(anos.map((a) => api.get<TaxPeriodSummary[]>(`/api/v1/tax-periods?year=${a}`)));
      setHistorico(listas.flatMap((l) => l.data));
    } catch (e) {
      winRef.current.notify({ tone: 'erro', text: `${(e as ApiError).message} (${(e as ApiError).code})` });
    }
  }, [comp]);

  useEffect(() => {
    setP(null);
    void carregar();
    void carregarHistorico();
  }, [carregar, carregarHistorico]);

  useEffect(() => {
    api.get<TaxSetup>('/api/v1/tax-setup').then((r) => setSetup(r.data)).catch(() => undefined);
    api.get<BankAccount[]>('/api/v1/bank-accounts').then((r) => {
      const ativas = r.data.filter((c) => c.status === 'ATIVO');
      setContas(ativas);
      setConta((c) => c || ativas[0]?.id || '');
    }).catch(() => undefined);
  }, []);

  // Notas registradas, autorizadas ou canceladas e pagamentos em outras janelas mudam a apuração.
  useEffect(() => {
    const r = () => {
      void carregar();
      void carregarHistorico();
    };
    window.addEventListener(DOCUMENTOS_ALTERADOS, r);
    window.addEventListener(IMPOSTOS_ALTERADOS, r);
    return () => {
      window.removeEventListener(DOCUMENTOS_ALTERADOS, r);
      window.removeEventListener(IMPOSTOS_ALTERADOS, r);
    };
  }, [carregar, carregarHistorico]);

  // Valor principal sugerido = o cálculo; vencimento = dia 20 do mês seguinte.
  useEffect(() => {
    if (!p) return;
    setGuia((g) => ({
      ...g,
      vencimento: g.vencimento || dataDaApi(p.dasDueDate),
      principal: g.principal || (p.calculation.totalTaxCents ? reais(p.calculation.totalTaxCents).replace('R$ ', '') : ''),
    }));
  }, [p]);

  const falha = useCallback((e: unknown) => {
    tratarFalha(e, { objeto: 'A competência', notify: winRef.current.notify, setErros, setConflito });
  }, []);

  const rotulo = `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;

  const executar = useCallback(
    async (fn: () => Promise<{ data: TaxPeriod; etag?: string }>, ok: (d: TaxPeriod) => string): Promise<boolean> => {
      setOcupado(true);
      try {
        const r = await fn();
        aplicar(r.data, r.etag);
        const texto = ok(r.data);
        setMsg(texto);
        winRef.current.notify({ tone: 'sucesso', text: texto });
        avisarFiscal();
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

  const aberta = p?.status === 'EM_APURACAO';
  const guiaAtual = p?.guides.find((g) => g.status !== 'SUBSTITUIDA') ?? null;

  /** Calcula; a mesma chave vai de novo se a rede cair antes da resposta, para não gravar dois cálculos. */
  const calcular = async () => {
    const ok = await executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${comp}/simulations`, null, { 'Idempotency-Key': chave.current }),
      (d) => d.calculation.result === 'CALCULADA'
        ? `Cálculo ${d.calculation.seq} da competência ${rotulo} registrado com sucesso: ${reais(d.calculation.totalTaxCents)}`
        : `Cálculo ${d.calculation.seq ?? ''} da competência ${rotulo} registrado: não calculável`,
    );
    if (ok) {
      chave.current = novaChave();
      setTab('calc');
    }
  };

  const confirmarTransmissao = async () => {
    if (!transmitir) return;
    const ok = await executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${comp}/declarations`,
        { transmittedOn: dataParaApi(transmitir.data), receiptNumber: transmitir.recibo.trim() }, { 'If-Match': etag }),
      (d) => `PGDAS-D de ${rotulo} registrado com sucesso: recibo ${d.declarations[0]?.receiptNumber}`,
    );
    if (ok) {
      setTransmitir(null);
      setTab('fech');
    }
  };

  const gerarGuia = async () => {
    const ok = await executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${comp}/das-guides`, {
        documentNumber: guia.numero.trim() || null,
        dueDate: dataParaApi(guia.vencimento),
        principalCents: centavosParaApi(guia.principal),
        fineCents: centavosParaApi(guia.multa) ?? '0',
        interestCents: centavosParaApi(guia.juros) ?? '0',
        notes: guia.obs.trim() || null,
      }, { 'If-Match': etag }),
      (d) => `DAS de ${rotulo} gerado com sucesso: ${reais(d.guides[0]?.totalCents)} com vencimento em ${dataDaApi(d.guides[0]?.dueDate)}`
        + (d.differenceCents && d.differenceCents !== '0' ? `; diferença para o cálculo ${reais(d.differenceCents)}` : ''),
    );
    if (ok) setGuia({ numero: '', vencimento: '', principal: '', multa: '', juros: '', obs: '' });
  };

  /** Pagamento da guia pela conta escolhida: é o pagamento de Contas a pagar (saída na conta; estorno lá mesmo). */
  const pagar = async () => {
    if (!guiaAtual?.titleId || !guiaAtual.titleBalanceCents) return;
    setOcupado(true);
    try {
      await api.post('/api/v1/settlements', {
        direction: 'PAYABLE', accountId: conta, effectiveDate: hojeIso(), amountCents: guiaAtual.titleBalanceCents, currency: 'BRL',
        allocations: [{ titleId: guiaAtual.titleId, amountCents: guiaAtual.titleBalanceCents }], notes: `DAS ${rotulo}`,
      }, { 'Idempotency-Key': chavePagamento.current });
      chavePagamento.current = novaChave();
      const texto = `Pagamento do DAS de ${rotulo} registrado com sucesso: ${reais(guiaAtual.titleBalanceCents)}`;
      setMsg(texto);
      winRef.current.notify({ tone: 'sucesso', text: texto });
      avisarFiscal();
      await carregar();
      setTab('fech');
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(false);
    }
  };

  const etapa = (codigo: string, feita: boolean) =>
    void executar(
      () => api.put<TaxPeriod>(`/api/v1/tax-periods/${comp}/closing-steps/${codigo}`, { done: feita }, etag),
      (d) => `Etapa "${d.steps.find((s) => s.code === codigo)?.name}" ${feita ? 'concluída' : 'reaberta'} com sucesso`,
    );

  const encerrar = () =>
    void executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${comp}/closures`, null, { 'If-Match': etag }),
      () => `Competência ${rotulo} encerrada com sucesso; as notas dela não podem mais ser registradas nem canceladas`,
    );

  const reabrirCompetencia = (motivo: string) => {
    setReabrir(false);
    void executar(
      () => api.post<TaxPeriod>(`/api/v1/tax-periods/${comp}/reopenings`, { reason: motivo }, { 'If-Match': etag }),
      () => `Competência ${rotulo} reaberta com sucesso`,
    );
  };

  const informarRbt12 = async () => {
    const ok = await executar(
      () => api.put<TaxPeriod>(`/api/v1/tax-periods/${comp}/rbt12`, { amountCents: centavosParaApi(rbt12.valor), informedBy: rbt12.por.trim() }, etag),
      (d) => `RBT12 da competência ${rotulo} informado com sucesso: ${reais(d.rbt12.informedCents)}`,
    );
    if (ok) setRbt12({ valor: '', por: '' });
  };

  const autorizar = async (documentId: string, versao: string) => {
    setOcupado(true);
    try {
      await api.put(`/api/v1/documents/${documentId}/authorization`, { status: 'AUTORIZADA' }, `"${versao}"`);
      winRef.current.notify({ tone: 'sucesso', text: 'Nota marcada como autorizada com sucesso' });
      window.dispatchEvent(new Event(DOCUMENTOS_ALTERADOS));
      await carregar();
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(false);
    }
  };

  const imprimirMemoria = () => {
    if (!p) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    const linhas = (p.calculation.memory.annexes ?? []).map((a) => `<tr><td>${a.label}</td><td>${reais(a.revenueCents)}</td><td>${faixa(a.bracket)}</td>`
      + `<td>${percentual(a.nominalRate)}</td><td>${reais(a.deductionCents)}</td><td>${percentual(a.effectiveRate)}</td><td>${reais(a.taxCents)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Memória do cálculo — ${rotulo}</title></head>`
      + `<body style="font: 12px Tahoma, sans-serif"><h1 style="font-size:16px">Apuração do Simples Nacional — ${mesLongo(comp)}</h1>`
      + `<p>Receita: ${reais(p.revenueCents)} · RBT12: ${reais(p.calculation.rbt12Cents)} · Revisão ${p.calculation.parameterRevision ?? '—'} dos parâmetros · `
      + `${p.calculation.source === 'GRAVADO' ? `Cálculo ${p.calculation.seq} de ${dataHora(p.calculation.createdAt)}` : 'Prévia (não gravada)'}</p>`
      + `<table border="1" cellspacing="0" cellpadding="4"><tr><th>Anexo</th><th>Receita</th><th>Faixa</th><th>Alíquota nominal</th><th>Parcela a deduzir</th>`
      + `<th>Alíquota efetiva</th><th>DAS</th></tr>${linhas}<tr><td colspan="6">Total</td><td>${reais(p.calculation.totalTaxCents)}</td></tr></table>`
      + `<p>Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12.</p>`
      + `${p.calculation.memory.warnings.map((x) => `<p>${x}</p>`).join('')}</body></html>`);
    w.document.close();
    w.print();
  };

  const podeCalcular = !!p && aberta && !ocupado && can('tax_period.simulate');
  const podeTransmitir = !!p && aberta && !ocupado && can('tax_period.declare');
  const podeGerar = !!p && aberta && !ocupado && can('tax_das.issue');
  const podePagar = !!guiaAtual && guiaAtual.status === 'ABERTO' && !!conta && !ocupado && can('financial_title.settle');
  const podeEtapa = !!p && aberta && !ocupado && can('tax_period.close_step');
  const pendentes = p?.steps.filter((s) => !s.done).length ?? 0;
  const podeEncerrar = !!p && aberta && !ocupado && pendentes === 0 && can('tax_period.close');
  const podeReabrir = !!p && !aberta && !ocupado && can('tax_period.reopen');

  const irPara = (t: Tab) => setTab(t);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || reabrir || transmitir) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { r: 'rec', c: 'calc', b: 'rbt', g: 'guia', f: 'fech', h: 'hist' };
      if (alvo[k]) setTab(alvo[k]);
      else if (k === 'l' && podeCalcular) void calcular();
      else if (k === 'p' && podeTransmitir) setTransmitir({ data: dataDaApi(hojeIso()), recibo: '' });
      else if (k === 'd' && podeGerar) setTab('guia');
      else if (k === 'i' && p) imprimirMemoria();
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const opcoesCompetencia = useMemo(() => {
    const base = competenciaPadrao();
    const lista = Array.from({ length: 18 }, (_, i) => somarMeses(`${base}-01`, 1 - i).slice(0, 7));
    if (!lista.includes(comp)) lista.unshift(comp);
    return lista.map((c) => ({ valor: c, rotulo: `${c.slice(5, 7)}/${c.slice(0, 4)}` }));
  }, [comp]);

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <span className="rp-campo-erro">
        <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
      </span>
    );
  const leitura = (rot: string, valor: string, num = false, link?: () => void) => (
    <>
      <span className={`rp-label${link ? ' rp-link-field' : ''}`}>
        {link && seta(`Ver ${rot}`, link)}
        {rot}
      </span>
      <input className={`rp-field rp-field--readonly${num ? ' rp-field--num' : ''}`} readOnly aria-label={rot} value={valor} />
    </>
  );

  const atividades = (an: string) => setup?.activities.filter((a) => a.annex === an && a.status === 'ATIVO').map((a) => a.name).join(', ') ?? '';
  const memoria = p?.calculation.memory;
  const anexos = memoria?.annexes ?? [];
  const totalDas = p?.calculation.totalTaxCents ?? null;
  const naoCalculavel = p?.calculation.result === 'NAO_CALCULAVEL';

  const tabs: [Tab, ReactNode][] = [
    ['rec', <span><u>R</u>eceitas</span>],
    ['calc', <span><u>C</u>álculo do DAS</span>],
    ['rbt', <span>R<u>B</u>T12</span>],
    ['guia', <span><u>G</u>uia DAS</span>],
    ['fech', <span><u>F</u>echamento</span>],
    ['hist', <span><u>H</u>istórico de competências</span>],
  ];

  const passosFeitos = p ? p.steps.filter((s) => s.done).length : 0;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-fiscal rp-rolagem" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !p ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-fiscal__cab">
                <label className="rp-label rp-label--req" htmlFor={fid('comp')}>Competência</label>
                <Selecao id={fid('comp')} className="rp-field rp-field--curto" valor={comp} opcoes={opcoesCompetencia} onChange={setComp} aria-label="Competência" />
                <span className="rp-label">Estabelecimento</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Estabelecimento" value="Matriz" />
                <span className="rp-label">Reconhecimento da receita</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Reconhecimento da receita" value="Competência (data de emissão)" />
                {leitura('Vencimento do DAS', dataDaApi(guiaAtual?.dueDate ?? p.dasDueDate))}
              </div>
              <div className="rp-form rp-fiscal__cab">
                {leitura('RBT12', p.rbt12.usedCents ? reais(p.rbt12.usedCents) : 'Desconhecido', true, () => irPara('rbt'))}
                {leitura('Receita do período', reais(p.revenueCents), true, () => irPara('rec'))}
                {leitura('DAS apurado', totalDas ? reais(totalDas) : naoCalculavel ? 'Não calculável' : '', true, () => irPara('calc'))}
                <span className="rp-label">Situação</span>
                <span>
                  {seloCompetencia(p.status)}
                  {p.alerts[0] && (
                    <span className="rp-fiscal__dica">
                      <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {p.alerts[0]}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, r]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                  {r}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel rp-rolagem rp-fiscal__painel" role="tabpanel">
              {tab === 'rec' ? (
                <div className="rp-grid-rolagem rp-rolagem">
                  <table className="rp-grid rp-grid--resumo rp-janela-mdi__grade" aria-label="Receitas da competência por anexo">
                    <thead>
                      <tr>
                        <th>Anexo / documento</th>
                        <th>Emissão</th>
                        <th>Cliente / atividade</th>
                        <th className="num">Receita</th>
                        <th>Situação</th>
                        <th>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(p.revenueByAnnex).map(([an, cents]) => {
                        const docs = p.documents.filter((d) => d.annex === an);
                        const aberto = grupos[an] !== false;
                        const part = razao(cents, p.revenueCents);
                        return (
                          <Fragment key={an}>
                            <tr className="grupo" data-aberto={aberto ? 'sim' : 'nao'} onClick={() => setGrupos((g) => ({ ...g, [an]: !aberto }))}>
                              <td>{ANEXO[an]}</td>
                              <td />
                              <td>{atividades(an)}</td>
                              <td className="num">{reais(cents)}</td>
                              <td />
                              <td><span className="rp-fiscal__participacao"><span className="rp-barra-celula" style={{ width: `${part}%` }} /> {Math.round(part)}%</span></td>
                            </tr>
                            {aberto && docs.map((d) => (
                              <tr key={`${d.documentId}-${an}`}>
                                <td className="rec">{seta(`Abrir documento ${d.code}`, () => win.open('document', d.documentId))} {modeloNota(d.kind, d.number)}</td>
                                <td>{dataDaApi(d.issueDate)}</td>
                                <td>{d.customerName} — {d.description}{d.defaultLines > 0 ? ' (item sem classificação: anexo padrão)' : ''}</td>
                                <td className="num">{reais(d.cents)}</td>
                                <td>
                                  {d.authorization === 'AUTORIZADA' ? <span className="rp-badge rp-badge--aprovado">Autorizada</span> : (
                                    <>
                                      <span className="rp-badge rp-badge--pendente">Pendente</span>{' '}
                                      {can('document.classify') && (
                                        <button type="button" className="rp-btn" disabled={ocupado} onClick={() => void autorizar(d.documentId, d.version)}>Autorizar</button>
                                      )}
                                    </>
                                  )}
                                </td>
                                <td />
                              </tr>
                            ))}
                            {aberto && (
                              <tr className="sub">
                                <td>Subtotal — {docs.length ? `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}` : 'sem notas'}</td>
                                <td />
                                <td />
                                <td className="num">{reais(cents)}</td>
                                <td />
                                <td />
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Receita bruta da competência</td>
                        <td />
                        <td />
                        <td className="num" aria-label="Receita bruta da competência">{reais(p.revenueCents)}</td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : tab === 'calc' ? (
                <div className="rp-fiscal__aba">
                  <p className="rp-janela-mdi__aviso">
                    <i className="rp-ico rp-ico-status-info" aria-hidden="true" />
                    {p.calculation.source === 'GRAVADO'
                      ? `Cálculo ${p.calculation.seq} de ${dataHora(p.calculation.createdAt)} por ${p.calculation.createdBy}`
                      : 'Prévia com os dados de agora (ainda não calculado)'}
                    {p.calculation.parameterRevision ? ` · revisão ${p.calculation.parameterRevision} dos parâmetros` : ''}
                    {p.calculation.rbt12Cents ? ` · RBT12 ${reais(p.calculation.rbt12Cents)} (${ORIGEM_RBT12[p.calculation.rbt12Origin!]})` : ''}
                  </p>
                  {naoCalculavel ? (
                    <div className="rp-status-msg rp-status-msg--aviso" role="status">
                      <span>Não calculável: {memoria?.reasons.join(' ')}</span>
                    </div>
                  ) : (
                    <>
                      <div className="rp-tabela-acoes">
                        <span className="rp-tabela-tit">Alíquota efetiva por anexo</span>
                        <span>Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12</span>
                      </div>
                      <div className="rp-grid-rolagem rp-rolagem">
                        <table className="rp-grid rp-janela-mdi__grade" aria-label="Alíquota efetiva por anexo">
                          <thead>
                            <tr>
                              <th className="rownum">#</th>
                              <th>Anexo</th>
                              <th className="num">Receita</th>
                              <th>Faixa</th>
                              <th className="num">Alíquota nominal</th>
                              <th className="num">Parcela a deduzir</th>
                              <th className="num">Alíquota efetiva</th>
                              <th className="num">Valor do DAS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {anexos.map((a, i) => (
                              <tr key={a.annex}>
                                <td className="rownum">{i + 1}</td>
                                <td>{a.label}</td>
                                <td className="num">{reais(a.revenueCents)}</td>
                                <td>{faixa(a.bracket)}</td>
                                <td className="num">{percentual(a.nominalRate)}</td>
                                <td className="num">{reais(a.deductionCents)}</td>
                                <td className="num"><b>{percentual(a.effectiveRate)}</b></td>
                                <td className="num">{reais(a.taxCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td />
                              <td>Total</td>
                              <td className="num">{reais(p.calculation.revenueCents)}</td>
                              <td />
                              <td />
                              <td />
                              <td className="num">{totalDas && Number(p.calculation.revenueCents) > 0 ? percentual(String(Number(totalDas) / Number(p.calculation.revenueCents))) : ''}</td>
                              <td className="num" aria-label="Total do DAS">{reais(totalDas)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="rp-tabela-acoes">
                        <span className="rp-tabela-tit">Repartição do DAS por tributo</span>
                      </div>
                      <div className="rp-grid-rolagem rp-rolagem">
                        <table className="rp-grid rp-janela-mdi__grade" aria-label="Repartição do DAS por tributo">
                          <thead>
                            <tr>
                              <th className="rownum">#</th>
                              <th>Tributo</th>
                              {anexos.map((a) => (
                                <th key={a.annex} className="num">Anexo {a.annex}</th>
                              ))}
                              <th className="num">Total</th>
                              <th>Participação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {TRIBUTOS.filter((t) => memoria?.taxes?.[t] !== undefined).map((t, i) => {
                              const total = memoria?.taxes?.[t] ?? '0';
                              const part = razao(total, totalDas);
                              return (
                                <tr key={t}>
                                  <td className="rownum">{i + 1}</td>
                                  <td>{t}</td>
                                  {anexos.map((a) => {
                                    const x = a.taxes.find((y) => y.tax === t);
                                    return <td key={a.annex} className="num">{x ? reais(x.cents) : '—'}</td>;
                                  })}
                                  <td className="num"><b>{reais(total)}</b></td>
                                  <td><span className="rp-fiscal__participacao"><span className="rp-barra-celula" style={{ width: `${part}%` }} /> {Math.round(part)}%</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td />
                              <td>Total do DAS</td>
                              {anexos.map((a) => (
                                <td key={a.annex} className="num">{reais(a.taxCents)}</td>
                              ))}
                              <td className="num">{reais(totalDas)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {memoria?.warnings.map((w) => (
                        <div key={w} className="rp-status-msg rp-status-msg--info" role="status"><span>{w}</span></div>
                      ))}
                      {p.differenceCents && (
                        <p className="rp-janela-mdi__aviso">
                          <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Guia DAS − cálculo do Renda+: {reais(p.differenceCents)}. O valor da guia é o declarado no PGDAS-D.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : tab === 'rbt' ? (
                <div className="rp-fiscal__aba rp-fiscal__duas">
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="RBT12 por competência">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th>Competência</th>
                          <th className="num">Receita do mês</th>
                          <th className="num">RBT12 usado</th>
                          <th>Faixa</th>
                          <th className="num">Alíq. efetiva</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rbt12Months.map((m, i) => (
                          <tr key={m.competence}>
                            <td className="rownum">{i + 1}</td>
                            <td>{mesLongo(m.competence)}</td>
                            <td className="num">{m.revenueCents ? reais(m.revenueCents) : 'Desconhecida'}</td>
                            <td className="num">{m.rbt12Cents ? reais(m.rbt12Cents) : 'Desconhecido'}</td>
                            <td>{faixa(m.bracket)}</td>
                            <td className="num">{percentual(m.effectiveRate)}</td>
                          </tr>
                        ))}
                        <LinhaResto colunas={6} />
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="rp-chart">
                      <div className="rp-chart-head">
                        <i className="rp-ico rp-ico-relatorios" aria-hidden="true" />
                        <span>Receita mensal e RBT12 ÷ 12 (mil R$)</span>
                      </div>
                      <Chart altura={200} label="Receita mensal e RBT12 ÷ 12"
                        spec={{
                          tipo: 'Barras3D',
                          unidade: 'mil R$',
                          categorias: [...p.rbt12Months].reverse().map((m) => mesCurto(m.competence)),
                          series: [
                            { nome: 'Receita do mês', valores: [...p.rbt12Months].reverse().map((m) => Math.round(Number(m.revenueCents ?? 0) / 100000)) },
                            { nome: 'RBT12 ÷ 12', valores: [...p.rbt12Months].reverse().map((m) => Math.round(Number(m.rbt12Cents ?? 0) / 1200000)) },
                          ],
                        }} />
                    </div>
                    <Progresso rotulo="RBT12 × sublimite" valor={razao(p.rbt12.usedCents, p.limits.sublimitCents)} />
                    <Progresso rotulo="RBT12 × limite" valor={razao(p.rbt12.usedCents, p.limits.annualLimitCents)} />
                    <p className="rp-fiscal__nota">
                      O RBT12 é a soma da receita dos 12 meses anteriores à competência — histórico de receita antes do Renda+, notas depois. Ele
                      define a faixa de cada anexo. A receita da própria competência entra só no cálculo do mês seguinte.
                    </p>
                    {p.rbt12.missing.length > 0 && (
                      <div className="rp-status-msg rp-status-msg--aviso" role="status">
                        <span>
                          Faltam {p.rbt12.missing.length} {p.rbt12.missing.length === 1 ? 'mês' : 'meses'} ({p.rbt12.missing.map((m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`).join(', ')}):
                          registre o histórico de receita em Tabelas e parâmetros{p.rbt12.informedCents ? `; vale o RBT12 informado (${reais(p.rbt12.informedCents)})` : ' ou informe o RBT12 abaixo'}.
                        </span>
                        <span className="rp-status-acao" role="link" tabIndex={0} onClick={() => win.open('tax-tables')} onKeyDown={(e) => e.key === 'Enter' && win.open('tax-tables')}>
                          Abrir histórico
                        </span>
                      </div>
                    )}
                    {p.rbt12.missing.length > 0 && aberta && can('tax_period.declare') && (
                      <div className="rp-form rp-form--adicao" aria-label="Informar RBT12">
                        <label className="rp-label rp-label--req" htmlFor={fid('rbt12')}>RBT12 do PGDAS-D</label>
                        <CampoDinheiro id={fid('rbt12')} className="rp-field rp-field--num" maxLength={20} value={rbt12.valor} aria-invalid={!!erros.amountCents}
                          onChange={(e) => setRbt12((r) => ({ ...r, valor: e.target.value }))} />
                        <label className="rp-label rp-label--req" htmlFor={fid('rbt12por')}>Informado por</label>
                        <input id={fid('rbt12por')} className="rp-field" maxLength={100} value={rbt12.por} aria-invalid={!!erros.informedBy}
                          onChange={(e) => setRbt12((r) => ({ ...r, por: e.target.value }))} />
                        <span />
                        <span className="rp-btn-row">
                          <button type="button" className="rp-btn" disabled={ocupado || !rbt12.valor.trim()} onClick={() => void informarRbt12()}>Informar RBT12</button>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : tab === 'guia' ? (
                <div className="rp-fiscal__aba">
                  <fieldset className="rp-grupo">
                    <legend>Documento de arrecadação</legend>
                    <div className="rp-grupo-corpo">
                      {guiaAtual && (
                        <div className="rp-form rp-fiscal__guia">
                          {leitura('Número do documento', guiaAtual.documentNumber ?? 'Sem número')}
                          {leitura('Período de apuração', mesLongo(comp))}
                          {leitura('Vencimento', dataDaApi(guiaAtual.dueDate))}
                          {leitura('Valor principal', reais(guiaAtual.principalCents), true)}
                          {leitura('Multa', reais(guiaAtual.fineCents), true)}
                          {leitura('Juros', reais(guiaAtual.interestCents), true)}
                          {leitura('Total a pagar', reais(guiaAtual.totalCents), true)}
                          <span className="rp-label">Situação</span>
                          <span>
                            {seloGuia(guiaAtual.status)}
                            {guiaAtual.titleId && (
                              <span className="rp-fiscal__dica">
                                {seta(`Abrir título ${guiaAtual.titleCode}`, () => win.open('payable', guiaAtual.titleId!))} Título {guiaAtual.titleCode}
                                {guiaAtual.paidOn ? ` · pago em ${dataDaApi(guiaAtual.paidOn)}` : ''}
                              </span>
                            )}
                          </span>
                          {guiaAtual.status === 'ABERTO' && (
                            <>
                              <label className="rp-label" htmlFor={fid('conta')}>Conta de pagamento</label>
                              <Selecao id={fid('conta')} className="rp-field" valor={conta} onChange={setConta} aria-label="Conta de pagamento"
                                opcoes={contas.map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))} />
                            </>
                          )}
                        </div>
                      )}
                      {aberta && can('tax_das.issue') && (
                        <div className="rp-form rp-fiscal__guia" aria-label={guiaAtual ? 'Gerar nova guia' : 'Gerar DAS'}>
                          {guiaAtual && <span className="rp-fiscal__subtitulo">Gerar nova guia (substitui a atual sem pagamento)</span>}
                          <label className="rp-label" htmlFor={fid('num')}>Número do documento</label>
                          <input id={fid('num')} className="rp-field" maxLength={30} value={guia.numero} onChange={(e) => setGuia((g) => ({ ...g, numero: e.target.value }))} />
                          <label className="rp-label rp-label--req" htmlFor={fid('venc')}>Vencimento</label>
                          <span>
                            <CampoData id={fid('venc')} rotulo="Vencimento" className="rp-field rp-field--curto" valor={guia.vencimento} invalido={!!erros.dueDate}
                              onChange={(v) => setGuia((g) => ({ ...g, vencimento: v }))} />
                            {erroDe('dueDate')}
                          </span>
                          <label className="rp-label rp-label--req" htmlFor={fid('princ')}>Valor principal</label>
                          <span>
                            <CampoDinheiro id={fid('princ')} className="rp-field rp-field--num" maxLength={20} value={guia.principal} aria-invalid={!!erros.principalCents}
                              onChange={(e) => setGuia((g) => ({ ...g, principal: e.target.value }))} />
                            {erroDe('principalCents')}
                          </span>
                          <label className="rp-label" htmlFor={fid('multa')}>Multa</label>
                          <CampoDinheiro id={fid('multa')} className="rp-field rp-field--num" maxLength={20} value={guia.multa} onChange={(e) => setGuia((g) => ({ ...g, multa: e.target.value }))} />
                          <label className="rp-label" htmlFor={fid('juros')}>Juros</label>
                          <CampoDinheiro id={fid('juros')} className="rp-field rp-field--num" maxLength={20} value={guia.juros} onChange={(e) => setGuia((g) => ({ ...g, juros: e.target.value }))} />
                          <label className="rp-label" htmlFor={fid('gobs')}>Observações</label>
                          <input id={fid('gobs')} className="rp-field" maxLength={500} value={guia.obs} onChange={(e) => setGuia((g) => ({ ...g, obs: e.target.value }))} />
                        </div>
                      )}
                      <div className="rp-btn-row">
                        {aberta && can('tax_das.issue') && (
                          <button type="button" className="rp-btn rp-btn--default" disabled={!podeGerar || !guia.principal.trim()} onClick={() => void gerarGuia()}>
                            <span>Gerar <u>D</u>AS</span>
                          </button>
                        )}
                        {can('financial_title.settle') && (
                          <button type="button" className="rp-btn" disabled={!podePagar} onClick={() => void pagar()}>
                            <span>Registrar paga<u>m</u>ento</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </fieldset>
                  <b>Guias anteriores</b>
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Guias anteriores">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th>Competência</th>
                          <th>Documento</th>
                          <th>Vencimento</th>
                          <th className="num">Valor</th>
                          <th>Pago em</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...p.guides.filter((g) => g.id !== guiaAtual?.id).map((g) => ({ comp, g })),
                          ...(historico ?? []).filter((h) => h.competence !== comp && h.guide).map((h) => ({ comp: h.competence, g: h.guide! })),
                        ].map(({ comp: c, g }, i) => (
                          <tr key={g.id} onDoubleClick={() => setComp(c)}>
                            <td className="rownum">{i + 1}</td>
                            <td>{mesLongo(c)}</td>
                            <td>{g.documentNumber ?? ''}</td>
                            <td>{dataDaApi(g.dueDate)}</td>
                            <td className="num">{reais(g.totalCents)}</td>
                            <td>{dataDaApi(g.paidOn)}</td>
                            <td>{seloGuia(g.status)}</td>
                          </tr>
                        ))}
                        <LinhaResto colunas={7} />
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : tab === 'fech' ? (
                <div className="rp-fiscal__aba">
                  <Progresso rotulo="Fechamento da competência" valor={(passosFeitos / Math.max(1, p.steps.length)) * 100} ok={passosFeitos === p.steps.length}
                    nota={`${passosFeitos} de ${p.steps.length} etapas concluídas.`} />
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Etapas do fechamento">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th />
                          <th>Etapa</th>
                          <th>Responsável</th>
                          <th>Concluída em</th>
                          <th>Situação</th>
                          <th>Detalhe</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {p.steps.map((s, i) => {
                          const destino: Record<string, () => void> = {
                            NOTAS_CONFERIDAS: () => win.open('documents'),
                            NOTAS_AUTORIZADAS: () => irPara('rec'),
                            CANCELAMENTOS_CONFERIDOS: () => win.open('documents'),
                            RECEITA_SEGREGADA: () => win.open('fiscal-classification'),
                            RBT12_CONFERIDO: () => irPara('rbt'),
                            PGDAS_TRANSMITIDO: () => irPara('calc'),
                            DAS_PAGO: () => irPara('guia'),
                          };
                          return (
                            <tr key={s.code}>
                              <td className="rownum">{i + 1}</td>
                              <td>{seta(`Ir para ${s.name}`, destino[s.code] ?? (() => undefined))}</td>
                              <td>{s.name}</td>
                              <td>{s.responsible}</td>
                              <td>{s.doneAt ? dataHora(s.doneAt) : s.done ? 'Pelos dados' : ''}</td>
                              <td>{s.done ? <span className="rp-badge rp-badge--aprovado">Concluída</span> : <span className="rp-badge rp-badge--pendente">Pendente</span>}</td>
                              <td>{s.detail ?? (s.automatic ? 'Concluída pelos dados' : '')}</td>
                              <td>
                                {!s.automatic && aberta && can('tax_period.close_step') && (
                                  <button type="button" className="rp-btn" disabled={!podeEtapa} onClick={() => etapa(s.code, !s.done)}>
                                    {s.done ? 'Desfazer' : 'Concluir'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <LinhaResto colunas={8} />
                      </tbody>
                    </table>
                  </div>
                  <div className="rp-btn-row">
                    {aberta && can('tax_period.close') && (
                      <button type="button" className="rp-btn" disabled={!podeEncerrar} title={pendentes ? 'Conclua as etapas antes de encerrar' : undefined} onClick={encerrar}>
                        <span><u>E</u>ncerrar competência</span>
                      </button>
                    )}
                    {podeReabrir && (
                      <button type="button" className="rp-btn" onClick={() => setReabrir(true)}>
                        <span>Re<u>a</u>brir competência</span>
                      </button>
                    )}
                  </div>
                  {p.closures.length > 0 && (
                    <p className="rp-fiscal__nota">
                      {p.closures.map((c) => `${c.action === 'FECHAMENTO' ? 'Encerrada' : 'Reaberta'} em ${dataHora(c.occurredAt)} por ${c.actor}${c.reason ? ` (${c.reason})` : ''}`).join(' · ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rp-grid-rolagem rp-rolagem">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Histórico de competências">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th />
                        <th>Competência</th>
                        <th className="num">Receita</th>
                        <th className="num">RBT12</th>
                        <th className="num">Alíquota efetiva</th>
                        <th className="num">DAS</th>
                        <th>Pago em</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(historico ?? []).map((h, i) => (
                        <tr key={h.competence} aria-selected={h.competence === comp} onDoubleClick={() => setComp(h.competence)}>
                          <td className="rownum">{i + 1}</td>
                          <td>{seta(`Abrir competência ${h.competence.slice(5, 7)}/${h.competence.slice(0, 4)}`, () => setComp(h.competence))}</td>
                          <td>{mesLongo(h.competence)}</td>
                          <td className="num">{reais(h.revenueCents)}</td>
                          <td className="num">{h.rbt12Cents ? reais(h.rbt12Cents) : ''}</td>
                          <td className="num">{percentual(h.effectiveRate)}</td>
                          <td className="num">{h.guide ? reais(h.guide.totalCents) : h.calculatedCents ? reais(h.calculatedCents) : ''}</td>
                          <td>{dataDaApi(h.guide?.paidOn)}</td>
                          <td>{seloCompetencia(h.status)}</td>
                        </tr>
                      ))}
                      <LinhaResto colunas={9} />
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {msg && (
              <p className="rp-janela-mdi__aviso rp-fiscal__msg">
                <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> {msg}
              </p>
            )}
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {p && aberta && can('tax_period.simulate') && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeCalcular} onClick={() => void calcular()}>
              <span>Ca<u>l</u>cular</span>
            </button>
          )}
          {p && aberta && can('tax_period.declare') && (
            <button type="button" className="rp-btn" disabled={!podeTransmitir} onClick={() => setTransmitir({ data: dataDaApi(hojeIso()), recibo: '' })}>
              <span>Transmitir <u>P</u>GDAS-D</span>
            </button>
          )}
          {p && aberta && can('tax_das.issue') && (
            <button type="button" className="rp-btn" disabled={!podeGerar} onClick={() => setTab('guia')}>
              <span>Gerar <u>D</u>AS</span>
            </button>
          )}
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Fechar
          </button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" disabled={!p} onClick={imprimirMemoria}>
            <span><u>I</u>mprimir memória</span>
          </button>
        </div>
      </div>

      {transmitir && (
        <Dialog icon="info" label="Transmitir PGDAS-D" onEscape={() => setTransmitir(null)}
          buttons={[
            { label: 'Registrar', primary: true, onClick: () => void confirmarTransmissao() },
            { label: 'Cancelar', onClick: () => setTransmitir(null) },
          ]}>
          <p>O Renda+ não transmite à Receita: registre a transmissão feita no Portal do Simples Nacional.</p>
          <div className="rp-form">
            <label className="rp-label rp-label--req" htmlFor={fid('pgdata')}>Data da transmissão</label>
            <CampoData id={fid('pgdata')} rotulo="Data da transmissão" className="rp-field rp-field--curto" valor={transmitir.data} invalido={!!erros.transmittedOn}
              onChange={(v) => setTransmitir((t) => (t ? { ...t, data: v } : t))} />
            <label className="rp-label rp-label--req" htmlFor={fid('pgrecibo')}>Número do recibo</label>
            <input id={fid('pgrecibo')} className="rp-field" maxLength={40} value={transmitir.recibo} aria-invalid={!!erros.receiptNumber}
              onChange={(e) => setTransmitir((t) => (t ? { ...t, recibo: e.target.value } : t))} />
          </div>
          {(erros.transmittedOn || erros.receiptNumber) && <p className="rp-campo-erro">{erros.transmittedOn ?? erros.receiptNumber}</p>}
        </Dialog>
      )}
      {reabrir && (
        <DialogoMotivo rotulo="Reabrir competência" idCampo={fid('motivo')} botao="Reabrir" falta="Informe o motivo da reabertura."
          texto={`A competência ${rotulo} volta a aceitar notas, cálculos, transmissão e guia.`}
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

export type { Annex };
