import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Annex, CompanyProfile, HistoryEntry, TaxAnnexTable, TaxParameters, TaxPeriod, TaxRevenueHistory, TaxRevenueImport, TaxSetup } from '../api/types';
import {
  centavos, centavosParaApi, competenciaDaApi, dataDaApi, dataHora, dataParaApi, percentual, percentualParaFracao, reais,
} from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { DialogoConflito } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { ANEXO, IMPOSTOS_ALTERADOS, ORDINAL, avisarFiscal, faixa, seta } from './comum/Fiscal';
import { GradeHistorico } from './comum/GradeHistorico';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';
import { competenciaPadrao } from './TaxPeriodWindow';

type Aba = 'param' | 'faixas' | 'ativ' | 'hist';
const ANEXOS: Annex[] = ['I', 'II', 'III', 'IV', 'V'];
const AVISOS = [{ valor: '0.8', rotulo: '80% do sublimite' }, { valor: '0.9', rotulo: '90% do sublimite' }, { valor: '0.95', rotulo: '95% do sublimite' }];

/** Valor em centavos para o campo de dinheiro (sem o símbolo). */
const paraCampo = (cents: string | null | undefined) => centavos(cents);

/** Alíquota efetiva no início da faixa: (início × nominal − parcela a deduzir) ÷ início; na 1ª faixa, a nominal. */
const efetivaNoInicio = (inicioCents: number, rate: string, deductionCents: string) =>
  inicioCents <= 0 ? rate : String((inicioCents * Number(rate) - Number(deductionCents)) / inicioCents);

type Perfil = { optedSince: string; cnaeMain: string; cnaeSecondary: string; nfseIssuer: string; annualLimit: string; sublimit: string; tolerance: string; alert: string };
type Atividade = { id: string | null; version: string; name: string; framing: string; annex: string; taxes: string; active: boolean };
type Historico = { competencia: string; valores: Record<Annex, string>; por: string; obs: string; versao: string };

/**
 * Tabelas e parâmetros do Simples Nacional (mock "Tabelas e parâmetros do Simples Nacional", Sprint 12): os dados da
 * empresa no Simples e os limites, a opção por IBS e CBS de 2027, os anexos I a V com as faixas e a repartição dos
 * tributos (revisões com vigência), as atividades e o anexo de cada uma, e o histórico de receita anterior ao Renda+.
 */
export function TaxTablesWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const admin = can('tax_profile.admin');
  const [aba, setAba] = useState<Aba>((['param', 'faixas', 'ativ', 'hist'] as Aba[]).includes(recordKey as Aba) ? (recordKey as Aba) : 'param');
  const [setup, setSetup] = useState<TaxSetup | null>(null);
  const [etag, setEtag] = useState('"1"');
  const [revisoes, setRevisoes] = useState<TaxParameters[]>([]);
  const [empresa, setEmpresa] = useState<CompanyProfile | null>(null);
  const [rbtAtual, setRbtAtual] = useState<string | null>(null);
  const [historico, setHistorico] = useState<TaxRevenueHistory[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [escolha, setEscolha] = useState<'DENTRO_DAS' | 'FORA_DAS' | ''>('');
  const [anexo, setAnexo] = useState<Annex>('II');
  const [revisao, setRevisao] = useState<number | null>(null);
  const [edicaoRev, setEdicaoRev] = useState<{ vigencia: string; fonte: string; annexes: TaxAnnexTable[] } | null>(null);
  const [atividade, setAtividade] = useState<Atividade | null>(null);
  const [hist, setHist] = useState<Historico | null>(null);
  const [carga, setCarga] = useState<{ nome: string; conteudo: string; previa: TaxRevenueImport } | null>(null);
  const [alteracoes, setAlteracoes] = useState<HistoryEntry[] | null | false>(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef(novaChave());
  const arquivo = useRef<HTMLInputElement>(null);

  const aplicarPerfil = (s: TaxSetup) => setPerfil({
    optedSince: dataDaApi(s.profile.optedSince), cnaeMain: s.profile.cnaeMain ?? '', cnaeSecondary: s.profile.cnaeSecondary ?? '',
    nfseIssuer: s.profile.nfseIssuer ?? '', annualLimit: paraCampo(s.profile.annualLimitCents), sublimit: paraCampo(s.profile.sublimitCents),
    tolerance: percentual(s.profile.tolerance).replace(/,00%$/, '%'), alert: s.profile.alertThreshold,
  });

  const carregar = useCallback(async () => {
    try {
      const [s, r, h] = await Promise.all([
        api.get<TaxSetup>('/api/v1/tax-setup'), api.get<TaxParameters[]>('/api/v1/tax-parameters'), api.get<TaxRevenueHistory[]>('/api/v1/tax-revenue-history'),
      ]);
      setSetup(s.data);
      setEtag(s.etag ?? `"${s.data.profile.version}"`);
      aplicarPerfil(s.data);
      setRevisoes(r.data);
      setHistorico(h.data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);
  useEffect(() => {
    api.get<CompanyProfile>('/api/v1/company-profile').then((r) => setEmpresa(r.data)).catch(() => undefined);
    api.get<TaxPeriod>(`/api/v1/tax-periods/${competenciaPadrao()}`).then((r) => setRbtAtual(r.data.rbt12.usedCents)).catch(() => undefined);
  }, []);
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(IMPOSTOS_ALTERADOS, r);
    return () => window.removeEventListener(IMPOSTOS_ALTERADOS, r);
  }, [carregar]);

  const falha = (e: unknown, objeto = 'O parâmetro') => tratarFalha(e, { objeto, notify: winRef.current.notify, setErros, setConflito });
  const sucesso = (texto: string) => {
    winRef.current.notify({ tone: 'sucesso', text: texto });
    avisarFiscal();
  };

  /** Revisão vigente hoje: a de maior vigência até a competência atual. */
  const vigente = useMemo(() => {
    const hoje = competenciaPadrao();
    return [...revisoes].filter((r) => r.validFrom <= hoje).sort((a, b) => (b.validFrom.localeCompare(a.validFrom) || b.revision - a.revision))[0] ?? revisoes[0];
  }, [revisoes]);
  const rev = revisoes.find((r) => r.revision === revisao) ?? vigente;
  const tabela = edicaoRev ? edicaoRev.annexes.find((a) => a.annex === anexo) : rev?.annexes.find((a) => a.annex === anexo);
  const faixaAtual = useMemo(() => {
    if (!tabela || !rbtAtual) return null;
    const i = tabela.brackets.findIndex((b) => Number(rbtAtual) <= Number(b.upToCents));
    return i < 0 ? null : i;
  }, [tabela, rbtAtual]);

  const gravarPerfil = async () => {
    if (!perfil) return;
    setOcupado(true);
    try {
      const r = await api.put<TaxSetup>('/api/v1/tax-setup/profile', {
        optedSince: dataParaApi(perfil.optedSince), cnaeMain: perfil.cnaeMain.trim() || null, cnaeSecondary: perfil.cnaeSecondary.trim() || null,
        nfseIssuer: perfil.nfseIssuer.trim() || null, annualLimitCents: centavosParaApi(perfil.annualLimit), sublimitCents: centavosParaApi(perfil.sublimit),
        tolerance: percentualParaFracao(perfil.tolerance), alertThreshold: perfil.alert,
      }, etag);
      setSetup(r.data);
      setEtag(r.etag ?? `"${r.data.profile.version}"`);
      aplicarPerfil(r.data);
      setErros({});
      sucesso('Dados da empresa no Simples gravados com sucesso');
    } catch (e) {
      falha(e, 'Os dados da empresa');
    } finally {
      setOcupado(false);
    }
  };

  const registrarOpcao = async () => {
    setOcupado(true);
    try {
      const r = await api.post<TaxSetup>('/api/v1/tax-ibs-cbs-options', { choice: escolha }, { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      setSetup(r.data);
      setEscolha('');
      sucesso('Opção por IBS e CBS registrada com sucesso. Confirme no Portal do Simples Nacional.');
    } catch (e) {
      falha(e, 'A opção');
    } finally {
      setOcupado(false);
    }
  };

  // Na edição, as faixas guardam o texto digitado (R$ e %); a conversão para centavos e frações é feita ao gravar.
  const novaRevisao = () => rev && setEdicaoRev({
    vigencia: '', fonte: '', annexes: rev.annexes.map((a) => ({
      ...a, taxes: [...a.taxes],
      brackets: a.brackets.map((b) => ({ upToCents: centavos(b.upToCents), rate: percentual(b.rate).replace('%', ''), deductionCents: centavos(b.deductionCents),
        shares: b.shares.map((x) => percentual(x).replace('%', '')) })),
    })),
  });
  const mudarFaixa = (i: number, campo: 'upToCents' | 'rate' | 'deductionCents', valor: string) => setEdicaoRev((e) => e && {
    ...e, annexes: e.annexes.map((a) => (a.annex !== anexo ? a : { ...a, brackets: a.brackets.map((b, j) => (j === i ? { ...b, [campo]: valor } : b)) })),
  });
  const mudarParte = (i: number, k: number, valor: string) => setEdicaoRev((e) => e && {
    ...e, annexes: e.annexes.map((a) => (a.annex !== anexo ? a : { ...a, brackets: a.brackets.map((b, j) => (j === i ? { ...b, shares: b.shares.map((s, q) => (q === k ? valor : s)) } : b)) })),
  });
  const gravarRevisao = async () => {
    if (!edicaoRev) return;
    setOcupado(true);
    try {
      const annexes: Record<string, { taxes: string[]; brackets: { upToCents: string; rate: string; deductionCents: string; shares: string[] }[] }> = {};
      edicaoRev.annexes.forEach((a) => (annexes[a.annex] = {
        taxes: a.taxes,
        brackets: a.brackets.map((b) => ({ upToCents: centavosParaApi(b.upToCents) ?? '', rate: percentualParaFracao(b.rate), deductionCents: centavosParaApi(b.deductionCents) ?? '',
          shares: b.shares.map((x) => percentualParaFracao(x)) })),
      }));
      const r = await api.post<TaxParameters>('/api/v1/tax-parameters', {
        validFrom: edicaoRev.vigencia.includes('/') ? `${edicaoRev.vigencia.slice(3)}-${edicaoRev.vigencia.slice(0, 2)}` : edicaoRev.vigencia.trim(),
        source: edicaoRev.fonte.trim(), annexes,
      }, { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      setEdicaoRev(null);
      setRevisao(r.data.revision);
      setErros({});
      sucesso(`Revisão ${r.data.revision} dos parâmetros adicionada com sucesso, vigente a partir de ${competenciaDaApi(r.data.validFrom)}`);
      await carregar();
    } catch (e) {
      falha(e, 'A revisão');
    } finally {
      setOcupado(false);
    }
  };

  const gravarAtividade = async () => {
    if (!atividade) return;
    setOcupado(true);
    try {
      const body = { name: atividade.name.trim(), framing: atividade.framing.trim(), annex: atividade.annex, taxes: atividade.taxes.trim(), active: atividade.active };
      const r = atividade.id
        ? await api.put<TaxSetup>(`/api/v1/tax-activities/${atividade.id}`, body, `"${atividade.version}"`)
        : await api.post<TaxSetup>('/api/v1/tax-activities', body, { 'Idempotency-Key': chave.current });
      if (!atividade.id) chave.current = novaChave();
      setSetup(r.data);
      setAtividade(null);
      setErros({});
      sucesso(`Atividade "${body.name}" gravada com sucesso`);
    } catch (e) {
      falha(e, 'A atividade');
    } finally {
      setOcupado(false);
    }
  };

  const gravarHistorico = async () => {
    if (!hist) return;
    setOcupado(true);
    try {
      const comp = hist.competencia.includes('/') ? `${hist.competencia.slice(3)}-${hist.competencia.slice(0, 2)}` : hist.competencia.trim();
      const v = (a: Annex) => centavosParaApi(hist.valores[a]) ?? '0';
      await api.put<TaxRevenueHistory>(`/api/v1/tax-revenue-history/${comp}`, {
        annexICents: v('I'), annexIICents: v('II'), annexIIICents: v('III'), annexIVCents: v('IV'), annexVCents: v('V'), informedBy: hist.por.trim(), notes: hist.obs.trim() || null,
      }, `"${hist.versao}"`);
      setHist(null);
      setErros({});
      sucesso(`Receita de ${competenciaDaApi(comp)} gravada com sucesso no histórico`);
      await carregar();
    } catch (e) {
      falha(e, 'A competência do histórico');
    } finally {
      setOcupado(false);
    }
  };

  const lerArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const conteudo = await f.text();
    try {
      const r = await api.post<TaxRevenueImport>('/api/v1/tax-revenue-history/imports', { fileName: f.name, content: conteudo, confirm: false }, { 'Idempotency-Key': novaChave() });
      setCarga({ nome: f.name, conteudo, previa: r.data });
    } catch (x) {
      falha(x, 'O arquivo');
    }
  };

  const confirmarCarga = async () => {
    if (!carga) return;
    setOcupado(true);
    try {
      const r = await api.post<TaxRevenueImport>('/api/v1/tax-revenue-history/imports', { fileName: carga.nome, content: carga.conteudo, confirm: true }, { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      setCarga(null);
      sucesso(r.data.alreadyLoaded ? `O arquivo ${carga.nome} já tinha sido carregado; nada mudou` : `Histórico de receita carregado com sucesso: ${r.data.months} ${r.data.months === 1 ? 'competência' : 'competências'}`);
      await carregar();
    } catch (e) {
      falha(e, 'O arquivo');
    } finally {
      setOcupado(false);
    }
  };

  const abrirAlteracoes = async () => {
    setAlteracoes(null);
    try {
      setAlteracoes((await api.get<HistoryEntry[]>('/api/v1/tax-setup/history')).data);
    } catch (e) {
      setAlteracoes(false);
      falha(e);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito || atividade || hist || carga || alteracoes !== false) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Aba> = { p: 'param', a: 'faixas', t: 'ativ', r: 'hist' };
      if (alvo[k]) setAba(alvo[k]);
      else if (k === 'h') void abrirAlteracoes();
      else if (k === 'o' && escolha && admin) void registrarOpcao();
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) => erros[k] && <span className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}</span>;
  const leitura = (rotulo: string, valor: string, num = false, link?: () => void) => (
    <>
      <span className={`rp-label${link ? ' rp-link-field' : ''}`}>{link && seta(`Ver ${rotulo}`, link)}{rotulo}</span>
      <input className={`rp-field rp-field--readonly${num ? ' rp-field--num' : ''}`} readOnly aria-label={rotulo} value={valor} />
    </>
  );
  const editavel = (k: keyof Perfil, rotulo: string, filho?: ReactNode) => (
    <>
      <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
      <span>
        {filho ?? (
          <input id={fid(k)} className={`rp-field${admin ? '' : ' rp-field--readonly'}`} readOnly={!admin} maxLength={150} value={perfil?.[k] ?? ''}
            onChange={(e) => setPerfil((p) => (p ? { ...p, [k]: e.target.value } : p))} />
        )}
        {erroDe(k === 'annualLimit' ? 'annualLimitCents' : k === 'sublimit' ? 'sublimitCents' : k === 'alert' ? 'alertThreshold' : k)}
      </span>
    </>
  );

  const opcao = setup?.ibsCbs.current ?? null;
  const tabs: [Aba, ReactNode][] = [
    ['param', <span><u>P</u>arâmetros</span>],
    ['faixas', <span><u>A</u>nexos e faixas</span>],
    ['ativ', <span>A<u>t</u>ividades e anexos</span>],
    ['hist', <span>Histórico de <u>r</u>eceita</span>],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-fiscal rp-rolagem" onKeyDown={onKeyDown}>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : !setup || !perfil ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, r]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === t} onClick={() => setAba(t)} onKeyDown={(e) => e.key === 'Enter' && setAba(t)}>{r}</div>
              ))}
            </div>
            <div className="rp-tabpanel rp-fiscal__painel" role="tabpanel">
              {aba === 'param' ? (
                <div className="rp-fiscal__aba">
                  <div className="rp-fiscal__duas">
                    <fieldset className="rp-grupo">
                      <legend>Empresa no Simples Nacional</legend>
                      <div className="rp-grupo-corpo">
                        <div className="rp-form rp-fiscal__parametros">
                          {leitura('Regime tributário', 'Simples Nacional — ME/EPP')}
                          {editavel('optedSince', 'Optante desde', (
                            <CampoData id={fid('optedSince')} rotulo="Optante desde" className="rp-field rp-field--curto" valor={perfil.optedSince} somenteLeitura={!admin}
                              onChange={(v) => setPerfil((p) => (p ? { ...p, optedSince: v } : p))} />
                          ))}
                          <span className="rp-label rp-link-field">{seta('Ver as atividades', () => setAba('ativ'))}CNAE principal</span>
                          <input className={`rp-field${admin ? '' : ' rp-field--readonly'}`} readOnly={!admin} maxLength={150} aria-label="CNAE principal" value={perfil.cnaeMain}
                            onChange={(e) => setPerfil((p) => (p ? { ...p, cnaeMain: e.target.value } : p))} />
                          {editavel('cnaeSecondary', 'CNAE secundário')}
                          {leitura('Município / UF', empresa?.address.city ? `${empresa.address.city} / ${empresa.address.state ?? ''}` : 'Preencha em Dados da empresa')}
                          {leitura('Receita reconhecida por', 'Competência (data de emissão)')}
                          {editavel('nfseIssuer', 'Emissor de NFS-e')}
                        </div>
                      </div>
                    </fieldset>
                    <fieldset className="rp-grupo">
                      <legend>Limites</legend>
                      <div className="rp-grupo-corpo">
                        <div className="rp-form rp-fiscal__parametros">
                          {editavel('annualLimit', 'Limite anual', (
                            <CampoDinheiro className={`rp-field rp-field--num${admin ? '' : ' rp-field--readonly'}`} readOnly={!admin} aria-label="Limite anual" maxLength={20}
                              value={perfil.annualLimit} onChange={(e) => setPerfil((p) => (p ? { ...p, annualLimit: e.target.value } : p))} />
                          ))}
                          {editavel('sublimit', 'Sublimite ICMS e ISS', (
                            <CampoDinheiro className={`rp-field rp-field--num${admin ? '' : ' rp-field--readonly'}`} readOnly={!admin} aria-label="Sublimite ICMS e ISS" maxLength={20}
                              value={perfil.sublimit} onChange={(e) => setPerfil((p) => (p ? { ...p, sublimit: e.target.value } : p))} />
                          ))}
                          {editavel('tolerance', 'Excesso tolerado')}
                          {editavel('alert', 'Avisar ao atingir', (
                            <Selecao className="rp-field" valor={perfil.alert} opcoes={AVISOS} disabled={!admin} aria-label="Avisar ao atingir"
                              onChange={(v) => setPerfil((p) => (p ? { ...p, alert: v } : p))} />
                          ))}
                          {leitura('Fator R', 'Não se aplica — anexos I, II e III')}
                        </div>
                        {admin && (
                          <div className="rp-btn-row">
                            <button type="button" className="rp-btn rp-btn--default" disabled={ocupado} onClick={() => void gravarPerfil()}>Gravar</button>
                          </div>
                        )}
                      </div>
                    </fieldset>
                  </div>
                  <fieldset className="rp-grupo">
                    <legend>IBS e CBS no 1º semestre de 2027</legend>
                    <div className="rp-grupo-corpo">
                      <label className="rp-choice">
                        <input type="radio" name={fid('ibs')} checked={escolha === 'DENTRO_DAS'} disabled={!admin} onChange={() => setEscolha('DENTRO_DAS')} /> Recolher IBS e CBS dentro do DAS
                      </label>
                      <label className="rp-choice">
                        <input type="radio" name={fid('ibs')} checked={escolha === 'FORA_DAS'} disabled={!admin} onChange={() => setEscolha('FORA_DAS')} /> Recolher IBS e CBS fora do DAS (regime regular), com crédito integral para o cliente
                      </label>
                      <div className="rp-form rp-fiscal__parametros">
                        {leitura('Prazo da opção', dataDaApi(setup.ibsCbs.deadline))}
                        {leitura('Vigência', `${dataDaApi(setup.ibsCbs.validFrom)} a ${dataDaApi(setup.ibsCbs.validTo)}`)}
                        {leitura('Desistência até', dataDaApi(setup.ibsCbs.withdrawalUntil))}
                        <span className="rp-label">Situação</span>
                        <span>
                          {opcao ? <span className="rp-badge rp-badge--aprovado">Concluída</span> : <span className="rp-badge rp-badge--pendente">Decisão pendente</span>}
                          {opcao && <span className="rp-fiscal__dica">{opcao.choice === 'FORA_DAS' ? 'Fora do DAS' : 'Dentro do DAS'} — registrada em {dataHora(opcao.createdAt)} por {opcao.createdBy}</span>}
                        </span>
                      </div>
                      <span className="rp-fiscal__nota">
                        Recolher fora do DAS dá crédito integral ao cliente que toma crédito; simule os dois cenários com a contabilidade antes de decidir.
                      </span>
                      {admin && (
                        <div className="rp-btn-row">
                          <button type="button" className="rp-btn rp-btn--default" disabled={!escolha || ocupado} onClick={() => void registrarOpcao()}><span>Registrar <u>o</u>pção</span></button>
                        </div>
                      )}
                    </div>
                  </fieldset>
                </div>
              ) : aba === 'faixas' ? (
                <div className="rp-fiscal__aba">
                  <div className="rp-filtros">
                    <label>
                      Anexo <Selecao className="rp-field rp-field--curto" valor={anexo} onChange={(v) => setAnexo(v as Annex)} aria-label="Anexo"
                        opcoes={ANEXOS.map((a) => ({ valor: a, rotulo: a }))} />
                    </label>
                    <b>{ANEXO[anexo]}</b>
                    <label>
                      Revisão <Selecao className="rp-field" valor={String(rev?.revision ?? '')} onChange={(v) => setRevisao(Number(v))} aria-label="Revisão" disabled={!!edicaoRev}
                        opcoes={revisoes.map((r) => ({ valor: String(r.revision), rotulo: `${r.revision} — desde ${competenciaDaApi(r.validFrom)}${r === vigente ? ' (vigente)' : ''}` }))} />
                    </label>
                    {rbtAtual && (
                      <span className="rp-fiscal__dica">
                        <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> <b>RBT12 atual:</b> {reais(rbtAtual)}{faixaAtual !== null ? ` · ${faixa(faixaAtual + 1)}` : ''}
                      </span>
                    )}
                  </div>
                  {edicaoRev && (
                    <div className="rp-form rp-fiscal__parametros" aria-label="Nova revisão">
                      <label className="rp-label rp-label--req" htmlFor={fid('vig')}>Vigência a partir de</label>
                      <span>
                        <input id={fid('vig')} className="rp-field rp-field--curto" maxLength={7} placeholder="MM/AAAA" value={edicaoRev.vigencia} aria-invalid={!!erros.validFrom}
                          onChange={(e) => setEdicaoRev({ ...edicaoRev, vigencia: e.target.value })} />
                        {erroDe('validFrom')}
                      </span>
                      <label className="rp-label rp-label--req" htmlFor={fid('fonte')}>Fonte das tabelas</label>
                      <span>
                        <input id={fid('fonte')} className="rp-field" maxLength={300} value={edicaoRev.fonte} aria-invalid={!!erros.source} onChange={(e) => setEdicaoRev({ ...edicaoRev, fonte: e.target.value })} />
                        {erroDe('source')}
                      </span>
                    </div>
                  )}
                  {tabela ? (
                    <>
                      <div className="rp-grid-rolagem rp-rolagem">
                        <table className="rp-grid rp-janela-mdi__grade" aria-label={`Faixas do ${ANEXO[anexo]}`}>
                          <thead>
                            <tr>
                              <th>Faixa</th>
                              <th>Receita bruta em 12 meses</th>
                              <th className="num">Alíquota nominal</th>
                              <th className="num">Parcela a deduzir</th>
                              <th className="num">Alíquota efetiva no início da faixa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabela.brackets.map((b, i) => {
                              const limiteAnterior = i === 0 ? '0' : tabela.brackets[i - 1].upToCents;
                              const inicio = i === 0 ? 0 : Number(edicaoRev ? centavosParaApi(limiteAnterior) : limiteAnterior) + 1;
                              const taxa = edicaoRev ? percentualParaFracao(b.rate) : b.rate;
                              const deducao = edicaoRev ? centavosParaApi(b.deductionCents) ?? '0' : b.deductionCents;
                              return (
                                <tr key={i} aria-selected={i === faixaAtual}>
                                  <td>{ORDINAL[i]}</td>
                                  <td>
                                    {edicaoRev ? (
                                      <CampoDinheiro className="rp-field rp-field--num" aria-label={`Limite da ${ORDINAL[i]} faixa`} value={b.upToCents}
                                        onChange={(e) => mudarFaixa(i, 'upToCents', e.target.value)} />
                                    ) : `${i === 0 ? 'Até ' : `De ${centavos(String(inicio))} até `}${centavos(b.upToCents)}`}
                                  </td>
                                  <td className="num">
                                    {edicaoRev ? (
                                      <input className="rp-field rp-field--num" aria-label={`Alíquota da ${ORDINAL[i]} faixa`} value={b.rate}
                                        onChange={(e) => mudarFaixa(i, 'rate', e.target.value)} />
                                    ) : percentual(b.rate)}
                                  </td>
                                  <td className="num">
                                    {edicaoRev ? (
                                      <CampoDinheiro className="rp-field rp-field--num" aria-label={`Parcela a deduzir da ${ORDINAL[i]} faixa`} value={b.deductionCents}
                                        onChange={(e) => mudarFaixa(i, 'deductionCents', e.target.value)} />
                                    ) : centavos(b.deductionCents)}
                                  </td>
                                  <td className="num">{/^\d+(\.\d+)?$/.test(taxa) ? percentual(efetivaNoInicio(inicio, taxa, deducao).slice(0, 10)) : ''}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="rp-tabela-acoes">
                        <span className="rp-tabela-tit">Repartição dos tributos por faixa (%)</span>
                        <span>Fonte: {rev?.source}</span>
                      </div>
                      {tabela.taxes.length ? (
                        <div className="rp-grid-rolagem rp-rolagem">
                          <table className="rp-grid rp-janela-mdi__grade" aria-label={`Repartição do ${ANEXO[anexo]}`}>
                            <thead>
                              <tr>
                                <th>Faixa</th>
                                {tabela.taxes.map((t) => <th key={t} className="num">{t}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {tabela.brackets.map((b, i) => (
                                <tr key={i} aria-selected={i === faixaAtual}>
                                  <td>{ORDINAL[i]}</td>
                                  {b.shares.map((s, k) => (
                                    <td key={k} className="num">
                                      {edicaoRev ? (
                                        <input className="rp-field rp-field--num" aria-label={`${tabela.taxes[k]} na ${ORDINAL[i]} faixa`} value={s}
                                          onChange={(e) => mudarParte(i, k, e.target.value)} />
                                      ) : Number(s) ? percentual(s) : '—'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="rp-status-msg rp-status-msg--info" role="status"><span>A empresa não tem receita neste anexo. A repartição dos tributos não foi cadastrada.</span></div>
                      )}
                      {Object.entries(erros).filter(([k]) => k.startsWith('annexes')).map(([k, m]) => (
                        <p key={k} className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}</p>
                      ))}
                    </>
                  ) : (
                    <div className="rp-status-msg rp-status-msg--info" role="status"><span>A revisão {rev?.revision} não tem as faixas do {ANEXO[anexo]}.</span></div>
                  )}
                  {can('tax_parameter.admin') && (
                    <div className="rp-btn-row">
                      {edicaoRev ? (
                        <>
                          <button type="button" className="rp-btn rp-btn--default" disabled={ocupado} onClick={() => void gravarRevisao()}>Gravar revisão</button>
                          <button type="button" className="rp-btn" onClick={() => { setEdicaoRev(null); setErros({}); }}>Descartar</button>
                        </>
                      ) : (
                        <button type="button" className="rp-btn" disabled={!rev} onClick={novaRevisao}>Nova revisão</button>
                      )}
                    </div>
                  )}
                </div>
              ) : aba === 'ativ' ? (
                <div className="rp-fiscal__aba">
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Atividades e anexos">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th />
                          <th>Atividade</th>
                          <th>Enquadramento</th>
                          <th>Anexo</th>
                          <th>Tributos no DAS</th>
                          <th className="num">Itens</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setup.activities.map((a, i) => (
                          <tr key={a.id} onDoubleClick={() => admin && setAtividade({ id: a.id, version: a.version, name: a.name, framing: a.framing, annex: a.annex, taxes: a.taxes, active: a.status === 'ATIVO' })}>
                            <td className="rownum">{i + 1}</td>
                            <td>{seta(`Abrir a classificação fiscal (${a.name})`, () => win.open('fiscal-classification', a.framing.startsWith('LC 116') ? 'serv' : 'prod'))}</td>
                            <td>{a.name}</td>
                            <td>{a.framing}</td>
                            <td>{a.annexLabel}</td>
                            <td>{a.taxes}</td>
                            <td className="num">{a.items}</td>
                            <td>{a.status === 'ATIVO' ? <span className="rp-badge rp-badge--aprovado">Ativa</span> : <span className="rp-badge rp-badge--cancelado">Inativa</span>}</td>
                          </tr>
                        ))}
                        <LinhaResto colunas={8} />
                      </tbody>
                    </table>
                  </div>
                  <p className="rp-fiscal__nota">
                    A segregação da receita por anexo vem do item de cada linha de nota: produto fabricado, peça revendida ou serviço. Ajuste a classificação de cada
                    item em Classificação fiscal; a atividade escolhida no item dá o anexo.
                  </p>
                  {admin && (
                    <div className="rp-btn-row">
                      <button type="button" className="rp-btn" onClick={() => setAtividade({ id: null, version: '0', name: '', framing: '', annex: 'III', taxes: '', active: true })}>Nova atividade</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rp-fiscal__aba">
                  <p className="rp-fiscal__nota">
                    Receita das competências anteriores a {competenciaDaApi(setup.revenueStart)} (o início da receita no Renda+), como declarada no PGDAS-D. A partir dela,
                    a receita vem das notas. O RBT12 soma os 12 meses anteriores de cada competência.
                  </p>
                  <div className="rp-grid-rolagem rp-rolagem">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Histórico de receita">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th>Competência</th>
                          {ANEXOS.map((a) => <th key={a} className="num">Anexo {a}</th>)}
                          <th className="num">Total</th>
                          <th>Origem</th>
                          <th>Informado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map((h, i) => (
                          <tr key={h.competence} onDoubleClick={() => admin && setHist({
                            competencia: competenciaDaApi(h.competence), por: h.informedBy, obs: h.notes ?? '', versao: h.version,
                            valores: { I: centavos(h.annexICents), II: centavos(h.annexIICents), III: centavos(h.annexIIICents), IV: centavos(h.annexIVCents), V: centavos(h.annexVCents) },
                          })}>
                            <td className="rownum">{i + 1}</td>
                            <td>{competenciaDaApi(h.competence)}</td>
                            <td className="num">{centavos(h.annexICents)}</td>
                            <td className="num">{centavos(h.annexIICents)}</td>
                            <td className="num">{centavos(h.annexIIICents)}</td>
                            <td className="num">{centavos(h.annexIVCents)}</td>
                            <td className="num">{centavos(h.annexVCents)}</td>
                            <td className="num"><b>{centavos(h.totalCents)}</b></td>
                            <td>{h.source === 'ARQUIVO' ? 'Arquivo' : 'Digitado'}</td>
                            <td>{h.informedBy}</td>
                          </tr>
                        ))}
                        <LinhaResto colunas={10} />
                      </tbody>
                    </table>
                  </div>
                  {admin && (
                    <div className="rp-btn-row">
                      <button type="button" className="rp-btn" onClick={() => arquivo.current?.click()}>Carregar arquivo</button>
                      <button type="button" className="rp-btn" onClick={() => setHist({ competencia: '', por: '', obs: '', versao: '0', valores: { I: '', II: '', III: '', IV: '', V: '' } })}>Digitar competência</button>
                      <input ref={arquivo} type="file" accept=".json,application/json" hidden aria-label="Arquivo do histórico" onChange={(e) => void lerArquivo(e)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>OK</button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>Cancelar</button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={() => void abrirAlteracoes()}><span><u>H</u>istórico de alterações</span></button>
        </div>
      </div>

      {atividade && (
        <Dialog icon="info" label={atividade.id ? 'Alterar atividade' : 'Nova atividade'} onEscape={() => setAtividade(null)}
          buttons={[{ label: 'OK', primary: true, onClick: () => void gravarAtividade() }, { label: 'Cancelar', onClick: () => setAtividade(null) }]}>
          <div className="rp-form">
            <label className="rp-label rp-label--req" htmlFor={fid('anome')}>Atividade</label>
            <span><input id={fid('anome')} className="rp-field" maxLength={150} value={atividade.name} onChange={(e) => setAtividade({ ...atividade, name: e.target.value })} />{erroDe('name')}</span>
            <label className="rp-label rp-label--req" htmlFor={fid('aenq')}>Enquadramento</label>
            <span><input id={fid('aenq')} className="rp-field" maxLength={60} placeholder="CNAE 0000-0/00 ou LC 116, item 14.01" value={atividade.framing} onChange={(e) => setAtividade({ ...atividade, framing: e.target.value })} />{erroDe('framing')}</span>
            <label className="rp-label rp-label--req" htmlFor={fid('aanexo')}>Anexo</label>
            <Selecao id={fid('aanexo')} className="rp-field" valor={atividade.annex} onChange={(v) => setAtividade({ ...atividade, annex: v })} aria-label="Anexo"
              opcoes={ANEXOS.map((a) => ({ valor: a, rotulo: ANEXO[a] }))} />
            <label className="rp-label rp-label--req" htmlFor={fid('atrib')}>Tributos no DAS</label>
            <span><input id={fid('atrib')} className="rp-field" maxLength={150} value={atividade.taxes} onChange={(e) => setAtividade({ ...atividade, taxes: e.target.value })} />{erroDe('taxes')}</span>
            <span className="rp-label">Situação</span>
            <label className="rp-choice"><input type="checkbox" checked={atividade.active} onChange={(e) => setAtividade({ ...atividade, active: e.target.checked })} /> Ativa</label>
          </div>
        </Dialog>
      )}
      {hist && (
        <Dialog icon="info" label="Receita da competência" onEscape={() => setHist(null)}
          buttons={[{ label: 'OK', primary: true, onClick: () => void gravarHistorico() }, { label: 'Cancelar', onClick: () => setHist(null) }]}>
          <div className="rp-form">
            <label className="rp-label rp-label--req" htmlFor={fid('hcomp')}>Competência</label>
            <span>
              <input id={fid('hcomp')} className="rp-field rp-field--curto" maxLength={7} placeholder="MM/AAAA" value={hist.competencia} readOnly={hist.versao !== '0'}
                onChange={(e) => setHist({ ...hist, competencia: e.target.value })} />
              {erroDe('competence')}
            </span>
            {ANEXOS.map((a) => (
              <Fragmento key={a}>
                <label className="rp-label" htmlFor={fid(`h${a}`)}>{ANEXO[a]}</label>
                <CampoDinheiro id={fid(`h${a}`)} className="rp-field rp-field--num" maxLength={20} value={hist.valores[a]}
                  onChange={(e) => setHist({ ...hist, valores: { ...hist.valores, [a]: e.target.value } })} />
              </Fragmento>
            ))}
            <label className="rp-label rp-label--req" htmlFor={fid('hpor')}>Informado por</label>
            <span><input id={fid('hpor')} className="rp-field" maxLength={100} value={hist.por} onChange={(e) => setHist({ ...hist, por: e.target.value })} />{erroDe('informedBy')}</span>
            <label className="rp-label" htmlFor={fid('hobs')}>Observações</label>
            <input id={fid('hobs')} className="rp-field" maxLength={500} value={hist.obs} onChange={(e) => setHist({ ...hist, obs: e.target.value })} />
          </div>
        </Dialog>
      )}
      {carga && (
        <Dialog icon={carga.previa.lines.some((l) => l.problem) ? 'aviso' : 'info'} label="Carregar histórico de receita" onEscape={() => setCarga(null)}
          buttons={[
            ...(carga.previa.alreadyLoaded || carga.previa.months === 0 ? [] : [{ label: 'Confirmar', primary: true, onClick: () => void confirmarCarga() }]),
            { label: 'Cancelar', onClick: () => setCarga(null) },
          ]}>
          <p>
            {carga.previa.alreadyLoaded ? `O arquivo ${carga.nome} já foi carregado.` : `${carga.nome}: ${carga.previa.months} ${carga.previa.months === 1 ? 'competência será carregada' : 'competências serão carregadas'}.`}
            {carga.previa.lines.some((l) => l.problem) && ' As linhas com problema ficam de fora.'}
          </p>
          {carga.previa.problems.map((x) => <p key={x} className="rp-campo-erro">{x}</p>)}
          <div className="rp-grid-rolagem rp-rolagem rp-fiscal__previa">
            <table className="rp-grid rp-janela-mdi__grade" aria-label="Prévia do histórico">
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>Competência</th>
                  <th className="num">Total</th>
                  <th>Problema ou aviso</th>
                </tr>
              </thead>
              <tbody>
                {carga.previa.lines.map((l) => (
                  <tr key={l.line}>
                    <td className="rownum">{l.line}</td>
                    <td>{/^\d{4}-\d{2}$/.test(l.competence) ? competenciaDaApi(l.competence) : l.competence}</td>
                    <td className="num">{centavos(l.totalCents)}</td>
                    <td>{l.problem ? <span className="rp-badge rp-badge--cancelado">{l.problem}</span> : l.warning ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}
      {alteracoes !== false && (
        <Dialog icon="info" label="Histórico de alterações" onEscape={() => setAlteracoes(false)} buttons={[{ label: 'OK', primary: true, onClick: () => setAlteracoes(false) }]}>
          <b>Revisões dos parâmetros</b>
          <div className="rp-grid-rolagem rp-rolagem rp-fiscal__previa">
            <table className="rp-grid rp-janela-mdi__grade" aria-label="Revisões dos parâmetros">
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>Vigência</th>
                  <th>Anexos</th>
                  <th>Fonte</th>
                  <th>Em</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {revisoes.map((r) => (
                  <tr key={r.id}>
                    <td className="rownum">{r.revision}</td>
                    <td>{competenciaDaApi(r.validFrom)}</td>
                    <td>{r.annexes.map((a) => a.annex).join(', ')}</td>
                    <td>{r.source}</td>
                    <td>{dataHora(r.createdAt)}</td>
                    <td>{r.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <b>Dados da empresa, atividades e opção IBS/CBS</b>
          <GradeHistorico historico={alteracoes} rotulo="Histórico dos dados da empresa no Simples" />
        </Dialog>
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="Parâmetros alterados" objeto="O registro" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

function Fragmento({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
