import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { BankAccount, HistoryEntry, Receivable, Settlement } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { seloRecebimento, seloTitulo } from './comum/Selos';
import { RECEBER_ALTERADOS } from './ReceivablesWindow';

type Tab = 'recebimentos' | 'historico';

/** Recebimento como a tela digita: conta, data `DD/MM/AAAA`, valor em reais e observações. */
export type FormRecebimento = { accountId: string; effectiveDate: string; amount: string; notes: string };

/**
 * Título a receber (formulário "receber"): cliente, origem, vencimento, valor, recebido e saldo; aba Recebimentos com
 * cada liquidação (registrada ou estornada) e aba Histórico. "Registrar recebimento" baixa o título total ou
 * parcialmente; "Estornar recebimento" desfaz a liquidação inteira, com motivo (premissa PD-005).
 */
export function ReceivableWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [titulo, setTitulo] = useState<Receivable | null>(null);
  const [etag, setEtag] = useState('');
  const [recebimentos, setRecebimentos] = useState<Settlement[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('recebimentos');
  const [sel, setSel] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [estornar, setEstornar] = useState<Settlement | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  // A chave acompanha o corpo: reenviar o mesmo recebimento (resposta perdida) repete a chave; mudar o valor gera outra.
  const chave = useRef<{ k: string; corpo: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api.get<Receivable>(`/api/v1/receivables/${recordKey}`),
        api.get<Settlement[]>(`/api/v1/settlements?titleId=${recordKey}`),
      ]);
      setTitulo(t.data);
      setEtag(t.etag ?? `"${t.data.version}"`);
      setRecebimentos(s.data);
      setHistorico(null);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [recordKey]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/receivables/${recordKey}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, recordKey, historico]);

  const falha = (e: unknown) => tratarFalha(e, { objeto: 'O título', notify: winRef.current.notify, setErros, setConflito });

  const registrarRecebimento = async (f: FormRecebimento) => {
    if (!titulo) return;
    const valor = centavosParaApi(f.amount);
    const corpo = {
      direction: 'RECEIVABLE',
      accountId: f.accountId || null,
      effectiveDate: dataParaApi(f.effectiveDate),
      amountCents: valor,
      allocations: [{ titleId: titulo.id, amountCents: valor, expectedTitleVersion: etag.replace(/"/g, '') }],
      notes: f.notes.trim() || null,
    };
    const texto = JSON.stringify(corpo);
    if (!chave.current || chave.current.corpo !== texto) chave.current = { k: novaChave(), corpo: texto };
    try {
      const r = await api.post<Settlement>('/api/v1/settlements', corpo, { 'Idempotency-Key': chave.current.k });
      chave.current = null;
      setRegistrar(false);
      setErros({});
      setSel(r.data.id);
      setTab('recebimentos');
      winRef.current.notify({ tone: 'sucesso', text: `Recebimento ${r.data.code} de ${reais(r.data.totalCents)} registrado com sucesso no título ${titulo.code}` });
      window.dispatchEvent(new Event(RECEBER_ALTERADOS));
      await carregar();
    } catch (e) {
      const campos = falha(e);
      // Conflito de versão: o título mudou (outro recebimento); o diálogo de conflito recarrega.
      if (!campos) setRegistrar((aberto) => aberto && !(e as ApiError).isConflict);
    }
  };

  const estornarRecebimento = async (s: Settlement, motivo: string) => {
    setEstornar(null);
    try {
      const r = await api.post<Settlement>(`/api/v1/settlements/${s.id}/reversals`, { reason: motivo });
      winRef.current.notify({ tone: 'sucesso', text: `Recebimento ${r.data.code} estornado com sucesso` });
      window.dispatchEvent(new Event(RECEBER_ALTERADOS));
      await carregar();
    } catch (e) {
      falha(e);
    }
  };

  const selecionado = recebimentos?.find((s) => s.id === sel) ?? null;
  const podeRegistrar = !!titulo && (titulo.status === 'OPEN' || titulo.status === 'PARTIAL') && can('financial_title.settle');
  const podeEstornar = !!selecionado && selecionado.status === 'POSTED' && can('settlement.reverse');

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (registrar || estornar || conflito !== null) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') setTab('recebimentos');
      else if (k === 'h') setTab('historico');
      else if (k === 'r' && podeRegistrar) setRegistrar(true);
      else if (k === 'e' && podeEstornar) setEstornar(selecionado);
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const tabs: [Tab, ReactNode][] = [
    ['recebimentos', <span>Rece<u>b</u>imentos ({recebimentos?.length ?? 0})</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];
  const noTitulo = (s: Settlement) => s.allocations.find((a) => a.titleId === recordKey)?.amountCents ?? '0';

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erro ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        ) : !titulo ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Título</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Título" value={titulo.code} />
                <span className="rp-label">Cliente</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta(`Abrir cliente ${titulo.customerCode}`, () => win.open('customer', titulo.customerId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente" value={`${titulo.customerCode} — ${titulo.customerName}`} />
                </span>
                <span className="rp-label">Descrição</span>
                <span />
                <span className="rp-ficha__ref">
                  {titulo.projectId && seta('Abrir projeto do título', () => win.open('project', titulo.projectId!))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Descrição" value={titulo.origin} />
                </span>
                <span className="rp-label">Vencimento</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--curto" readOnly aria-label="Vencimento" value={dataDaApi(titulo.dueDate)} />
                <span className="rp-label">Competência</span>
                <span />
                <input className="rp-field rp-field--readonly rp-field--curto" readOnly aria-label="Competência" value={`${titulo.competence.slice(5)}/${titulo.competence.slice(0, 4)}`} />
                {titulo.cancelReason && (
                  <>
                    <span className="rp-label">Motivo</span>
                    <span />
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do cancelamento" value={titulo.cancelReason} />
                  </>
                )}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {seloTitulo(titulo.status)}
                  {titulo.overdue && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Vencido</span>}
                </span>
                <span className="rp-label">Valor</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Valor" value={reais(titulo.originalCents)} />
                <span className="rp-label">Recebido</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Recebido" value={reais(titulo.receivedCents)} />
                <span className="rp-label">Saldo</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Saldo" value={reais(titulo.balanceCents)} />
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Versão" value={titulo.version} />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {tab === 'recebimentos' ? (
                <div className="rp-tabela">
                  <div className="rp-tabela-acoes">
                    <span className="rp-tabela-tit">Recebimentos do título</span>
                    {can('settlement.reverse') && (
                      <button type="button" className="rp-btn" disabled={!podeEstornar} onClick={() => setEstornar(selecionado)}
                        title={podeEstornar ? undefined : 'Selecione um recebimento registrado'}>
                        <span><u>E</u>stornar recebimento</span>
                      </button>
                    )}
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Recebimentos do título">
                      <thead>
                        <tr>
                          <th className="rownum">#</th>
                          <th>Recebimento</th>
                          <th>Data</th>
                          <th>Conta</th>
                          <th className="num">Neste título</th>
                          <th className="num">Total recebido</th>
                          <th>Registrado por</th>
                          <th>Situação</th>
                          <th>Motivo do estorno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recebimentos ?? []).map((s, i) => (
                          <tr key={s.id} aria-selected={sel === s.id} onClick={() => setSel(s.id)}>
                            <td className="rownum">{i + 1}</td>
                            <td>{s.code}</td>
                            <td>{dataDaApi(s.effectiveDate)}</td>
                            <td>{s.accountName}</td>
                            <td className="num">{reais(noTitulo(s))}</td>
                            <td className="num">{reais(s.totalCents)}</td>
                            <td>{`${s.createdBy} em ${dataHora(s.createdAt)}`}</td>
                            <td>{seloRecebimento(s.status)}</td>
                            <td>{s.reversalReason ? `${s.reversalReason} (${s.reversedBy} em ${dataHora(s.reversedAt)})` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {recebimentos?.length === 0 && <p className="rp-jlista__vazio">Nenhum recebimento registrado neste título.</p>}
                  </div>
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do título" />
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
        </div>
        <div className="rp-btn-row">
          {podeRegistrar && (
            <button type="button" className="rp-btn" onClick={() => (setErros({}), setRegistrar(true))}>
              <span><u>R</u>egistrar recebimento</span>
            </button>
          )}
        </div>
      </div>

      {registrar && titulo && (
        <DialogoRecebimento titulo={titulo} idBase={`${win.windowId}-rec`} erros={erros} onCancelar={() => setRegistrar(false)}
          onRegistrar={(f) => void registrarRecebimento(f)} />
      )}

      {estornar && (
        <DialogoMotivo rotulo="Estornar recebimento" idCampo={`${win.windowId}-motivo`} botao="Estornar" voltar="Voltar" falta="Informe o motivo do estorno."
          texto={`O recebimento ${estornar.code} de ${reais(estornar.totalCents)} fica estornado por inteiro: ${estornar.allocations.length === 1 ? 'o título volta' : `os ${estornar.allocations.length} títulos voltam`} ao saldo anterior e a conta ${estornar.accountName} recebe o lançamento inverso. O recebimento continua no histórico.`}
          onCancelar={() => setEstornar(null)} onConfirmar={(m) => void estornarRecebimento(estornar, m)} />
      )}

      {conflito !== null && (
        <DialogoConflito rotulo="Título alterado por outra pessoa" objeto="O título" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            setRegistrar(false);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}

/**
 * Registrar recebimento (Caixa de mensagem com os campos): conta, data (hoje), valor (o saldo, para quitar; menos para
 * baixa parcial) e observações. Os erros do servidor aparecem no campo; nada é gravado até o OK do servidor.
 */
export function DialogoRecebimento({ titulo, idBase, erros, onCancelar, onRegistrar }: {
  titulo: Receivable;
  idBase: string;
  erros: Record<string, string>;
  onCancelar: () => void;
  onRegistrar: (f: FormRecebimento) => void;
}) {
  const [contas, setContas] = useState<BankAccount[]>([]);
  const [f, setF] = useState<FormRecebimento>({ accountId: '', effectiveDate: dataDaApi(hojeIso()), amount: centavos(titulo.balanceCents), notes: '' });
  const [falta, setFalta] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<BankAccount[]>('/api/v1/bank-accounts')
      .then((r) => {
        setContas(r.data);
        setF((x) => (x.accountId || r.data.length === 0 ? x : { ...x, accountId: r.data[0].id }));
      })
      .catch(() => setContas([]));
  }, []);
  const set = (patch: Partial<FormRecebimento>) => (setF((x) => ({ ...x, ...patch })), setFalta(null));
  const registrar = () => {
    if (!f.accountId) return setFalta('Escolha a conta onde o valor entrou.');
    if (!f.amount.trim()) return setFalta('Informe o valor recebido.');
    onRegistrar(f);
  };
  const erroValor = erros.amountCents ?? erros['allocations[0].amountCents'];
  const mensagem = falta ?? erros.accountId ?? erros.effectiveDate ?? erroValor ?? erros.notes ?? erros['allocations[0].titleId'];
  return (
    <Dialog icon="info" label="Registrar recebimento" onEscape={onCancelar}
      buttons={[
        { label: 'Registrar', primary: true, onClick: registrar },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      Título {titulo.code} — {titulo.customerName}: saldo de {reais(titulo.balanceCents)}. Informe menos que o saldo para uma baixa parcial.
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-conta`}>Conta</label>
        <Selecao id={`${idBase}-conta`} valor={f.accountId} aria-invalid={!!erros.accountId} onChange={(v) => set({ accountId: v })}
          opcoes={[{ valor: '', rotulo: 'Escolha a conta' }, ...contas.map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))]} />
        <label className="rp-label" htmlFor={`${idBase}-data`}>Data</label>
        <CampoData id={`${idBase}-data`} rotulo="Data do recebimento" valor={f.effectiveDate} invalido={!!erros.effectiveDate} onChange={(v) => set({ effectiveDate: v })} />
        <label className="rp-label" htmlFor={`${idBase}-valor`}>Valor</label>
        <input id={`${idBase}-valor`} className="rp-field rp-field--num rp-field--curto" value={f.amount} maxLength={20} inputMode="decimal"
          aria-invalid={!!erroValor} onChange={(e) => set({ amount: e.target.value })}
          onBlur={() => {
            const c = centavosParaApi(f.amount);
            if (c && /^\d+$/.test(c)) set({ amount: centavos(c) });
          }}
          onKeyDown={(e) => e.key === 'Enter' && registrar()} />
        <label className="rp-label" htmlFor={`${idBase}-obs`}>Observações</label>
        <input id={`${idBase}-obs`} className="rp-field" value={f.notes} maxLength={500} placeholder="Ex.: TED, cheque, Pix" onChange={(e) => set({ notes: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && registrar()} />
      </div>
      {mensagem && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {mensagem}
        </span>
      )}
    </Dialog>
  );
}
