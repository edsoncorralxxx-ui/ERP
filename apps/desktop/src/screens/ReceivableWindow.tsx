import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { BankAccount, HistoryEntry, Receivable, Settlement } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import type { StatusMessage } from '../shell/StatusBar';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { novaChave } from './comum/Cadastros';
import { DialogoMotivo } from './comum/Dialogos';
import { useFaturamento } from './comum/Faturamento';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { CONTAS_ALTERADAS } from './BankAccountsWindow';
import { seloReceber, TITULOS_ALTERADOS } from './ReceivablesWindow';

type Tab = 'geral' | 'recebimentos' | 'faturamento' | 'historico';

const seloRecebimento = (s: Settlement['status']) => (
  <span className={`rp-badge ${s === 'POSTED' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{s === 'POSTED' ? 'Registrado' : 'Estornado'}</span>
);

/**
 * Ficha do título a receber (formulário "receber"): valor, recebido e saldo derivados das baixas; aba Recebimentos
 * com cada baixa e o estorno. Receber abre a caixa com conta, data e valor (o saldo já vem preenchido); a mesma chave
 * de idempotência é reenviada até o servidor responder, para uma queda de rede não baixar duas vezes.
 */
export function ReceivableWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [titulo, setTitulo] = useState<Receivable | null>(null);
  const [baixas, setBaixas] = useState<Settlement[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [tab, setTab] = useState<Tab>('geral');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [recebendo, setRecebendo] = useState(false);
  const [estornar, setEstornar] = useState<Settlement | null>(null);
  const faturamento = useFaturamento([recordKey])?.get(recordKey) ?? null;

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const [t, s] = await Promise.all([
        api.get<Receivable>(`/api/v1/receivables/${recordKey}`),
        api.get<Settlement[]>(`/api/v1/settlements?titleId=${recordKey}`),
      ]);
      setTitulo(t.data);
      setBaixas(s.data);
      setHistorico(null);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [recordKey]);

  useEffect(() => void carregar(), [carregar]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/receivables/${recordKey}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, recordKey, historico]);

  const podeReceber = !!titulo && can('financial_title.settle') && (titulo.status === 'OPEN' || titulo.status === 'PARTIAL');
  const podeEstornar = can('settlement.reverse');

  const alterado = async (texto: string) => {
    winRef.current.notify({ tone: 'sucesso', text: texto });
    window.dispatchEvent(new Event(TITULOS_ALTERADOS));
    window.dispatchEvent(new Event(CONTAS_ALTERADAS));
    await carregar();
  };

  const confirmarEstorno = async (s: Settlement, motivo: string) => {
    setEstornar(null);
    try {
      const r = await api.post<Settlement>(`/api/v1/settlements/${s.id}/reversals`, { reason: motivo });
      await alterado(`Recebimento ${r.data.code} estornado com sucesso: ${reais(r.data.amountCents)} voltaram ao saldo`);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (recebendo || estornar) return;
    if (e.altKey) {
      const alvo: Record<string, Tab> = { g: 'geral', r: 'recebimentos', f: 'faturamento', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTab(t);
      } else if (e.key.toLowerCase() === 'b' && podeReceber) {
        e.preventDefault();
        setRecebendo(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const campo = (rotulo: string, valor: string, extra?: string) => (
    <>
      <span className="rp-label">{rotulo}</span>
      <span />
      <input className={`rp-field rp-field--readonly${extra ? ` ${extra}` : ''}`} readOnly aria-label={rotulo} value={valor} />
    </>
  );
  const tabs: [Tab, ReactNode][] = [
    ['geral', <span><u>G</u>eral</span>],
    ['recebimentos', <span><u>R</u>ecebimentos</span>],
    ...(faturamento ? [['faturamento', <span><u>F</u>aturamento ({faturamento.documents.length})</span>] as [Tab, ReactNode]] : []),
    ['historico', <span><u>H</u>istórico</span>],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !titulo ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                {campo('Título', titulo.code)}
                <span className="rp-label">Cliente</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta(`Abrir cliente ${titulo.customerCode}`, () => win.open('customer', titulo.customerId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente" value={`${titulo.customerCode} — ${titulo.customerName}`} />
                </span>
                {campo('Descrição', titulo.origin)}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>{seloReceber(titulo)}</span>
                <span className="rp-label">Saldo a receber</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Saldo a receber" value={reais(titulo.balanceCents)} />
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
              {tab === 'geral' ? (
                <div className="rp-form rp-janela-mdi__form">
                  {campo('Vencimento', dataDaApi(titulo.dueDate), 'rp-field--curto')}
                  {campo('Competência', `${titulo.competence.slice(5)}/${titulo.competence.slice(0, 4)}`, 'rp-field--curto')}
                  {campo('Emissão', dataDaApi(titulo.issueDate), 'rp-field--curto')}
                  {campo('Valor original', reais(titulo.originalCents), 'rp-field--num rp-field--curto')}
                  {campo('Recebido', reais(titulo.receivedCents), 'rp-field--num rp-field--curto')}
                  {campo('Saldo', reais(titulo.balanceCents), 'rp-field--num rp-field--curto')}
                  {faturamento && campo('Faturado', reais(faturamento.invoicedCents), 'rp-field--num rp-field--curto')}
                  {faturamento && campo('A emitir', reais(faturamento.toIssueCents), 'rp-field--num rp-field--curto')}
                  {campo('Categoria', titulo.category === 'RECEITA_VENDA' ? 'Receita de venda' : titulo.category)}
                  {titulo.projectId && (
                    <>
                      <span className="rp-label">Pedido</span>
                      <span />
                      <span className="rp-ficha__ref">
                        {seta('Abrir o projeto do pedido', () => win.open('project', titulo.projectId!))}
                        <input className="rp-field rp-field--readonly" readOnly aria-label="Pedido" value={titulo.origin.split(' — ')[0].replace(/^Pedido /, '')} />
                      </span>
                    </>
                  )}
                  {campo('Criado em', `${dataHora(titulo.createdAt)} por ${titulo.createdBy}`)}
                  {titulo.status === 'CANCELLED' && (
                    <>
                      <span className="rp-label">Cancelamento</span>
                      <span />
                      <span className="rp-janela-mdi__aviso">
                        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {titulo.cancelReason ?? 'Cancelado com o pedido'}
                      </span>
                    </>
                  )}
                </div>
              ) : tab === 'recebimentos' ? (
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
                        <th>Situação</th>
                        <th>Estorno</th>
                        <th aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {(baixas ?? []).map((s, i) => (
                        <tr key={s.id}>
                          <td className="rownum">{i + 1}</td>
                          <td>{s.code}</td>
                          <td>{dataDaApi(s.effectiveDate)}</td>
                          <td>{`${s.accountCode} — ${s.accountName}`}</td>
                          <td className="num">{reais(s.allocations.find((a) => a.titleId === titulo.id)?.amountCents ?? '0')}</td>
                          <td className="num">{reais(s.amountCents)}</td>
                          <td>{seloRecebimento(s.status)}</td>
                          <td>{s.status === 'REVERSED' ? `${dataDaApi(s.reversalDate)} por ${s.reversedBy}: ${s.reversalReason}` : ''}</td>
                          <td>
                            {s.status === 'POSTED' && podeEstornar && (
                              <button type="button" className="rp-btn" aria-label={`Estornar recebimento ${s.code}`} onClick={() => setEstornar(s)}>
                                Estornar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {baixas?.length === 0 && <p className="rp-jlista__vazio">Nenhum recebimento registrado neste título.</p>}
                </div>
              ) : tab === 'faturamento' && faturamento ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Notas vinculadas ao título">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th aria-label="Abrir" />
                        <th>Documento</th>
                        <th>Nota</th>
                        <th>Emissão</th>
                        <th className="num">Valor vinculado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faturamento.documents.map((d, i) => (
                        <tr key={d.documentId} onDoubleClick={() => win.open('document', d.documentId)}>
                          <td className="rownum">{i + 1}</td>
                          <td>{seta(`Abrir documento ${d.documentCode}`, () => win.open('document', d.documentId))}</td>
                          <td>{d.documentCode}</td>
                          <td>{`Nº ${d.number} / série ${d.series}`}</td>
                          <td>{dataDaApi(d.issueDate)}</td>
                          <td className="num">{reais(d.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Faturado</td>
                        <td className="num">{reais(faturamento.invoicedCents)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {faturamento.documents.length === 0 && <p className="rp-jlista__vazio">Nenhuma nota vinculada a este título.</p>}
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
          <button type="button" className={`rp-btn${podeReceber ? '' : ' rp-btn--default'}`} onClick={win.requestClose}>
            OK
          </button>
        </div>
        <div className="rp-btn-row">
          {podeReceber && (
            <button type="button" className="rp-btn rp-btn--default" onClick={() => setRecebendo(true)}>
              <span>Rece<u>b</u>er</span>
            </button>
          )}
        </div>
      </div>
      {recebendo && titulo && (
        <DialogoRecebimento
          titulo={titulo}
          idBase={win.windowId}
          onCancelar={() => setRecebendo(false)}
          onRecebido={(s) => {
            setRecebendo(false);
            void alterado(`Recebimento ${s.code} de ${reais(s.amountCents)} registrado com sucesso no título ${titulo.code}`);
          }}
          notify={win.notify}
        />
      )}
      {estornar && (
        <DialogoMotivo
          rotulo="Estornar recebimento"
          texto={`O recebimento ${estornar.code} de ${reais(estornar.amountCents)} será estornado por inteiro: o valor volta ao saldo dos títulos e sai da conta ${estornar.accountCode}. O registro original continua consultável.`}
          idCampo={`${win.windowId}-motivo-estorno`}
          botao="Estornar"
          voltar="Voltar"
          falta="Informe o motivo do estorno."
          onConfirmar={(m) => void confirmarEstorno(estornar, m)}
          onCancelar={() => setEstornar(null)}
        />
      )}
    </>
  );
}

/** Caixa "Receber": conta ativa, data (hoje) e valor (o saldo); a chave só muda depois de o servidor responder. */
function DialogoRecebimento({ titulo, idBase, onCancelar, onRecebido, notify }: {
  titulo: Receivable;
  idBase: string;
  onCancelar: () => void;
  onRecebido: (s: Settlement) => void;
  notify: (m: StatusMessage) => void;
}) {
  const [contas, setContas] = useState<BankAccount[] | null>(null);
  const [conta, setConta] = useState('');
  const [data, setData] = useState(dataDaApi(hojeIso()));
  const [valor, setValor] = useState(centavos(titulo.balanceCents));
  const [obs, setObs] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const chave = useRef(novaChave());

  useEffect(() => {
    api
      .get<BankAccount[]>('/api/v1/bank-accounts')
      .then((r) => {
        setContas(r.data);
        if (r.data.length > 0) setConta((c) => c || r.data[0].id);
      })
      .catch((e: ApiError) => notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [notify]);

  const confirmar = async () => {
    if (enviando) return;
    const cents = centavosParaApi(valor) ?? '';
    const falta: Record<string, string> = {};
    if (!conta) falta.accountId = 'Escolha a conta.';
    if (!/^\d+$/.test(cents) || BigInt(cents) <= 0n) falta.amountCents = 'Informe um valor maior que zero.';
    if (!dataParaApi(data)) falta.effectiveDate = 'Informe a data do recebimento.';
    if (Object.keys(falta).length > 0) return setErros(falta);
    setEnviando(true);
    try {
      const r = await api.post<Settlement>(
        '/api/v1/settlements',
        {
          direction: 'RECEIVABLE',
          accountId: conta,
          effectiveDate: dataParaApi(data),
          amountCents: cents,
          currency: 'BRL',
          allocations: [{ titleId: titulo.id, amountCents: cents, expectedTitleVersion: titulo.version }],
          notes: obs.trim() || null,
        },
        { 'Idempotency-Key': chave.current },
      );
      chave.current = novaChave();
      onRecebido(r.data);
    } catch (e) {
      const x = e as ApiError;
      if (x.isNetwork) {
        notify({ tone: 'aviso', text: `Sem conexão com o servidor; confirme de novo para reenviar o mesmo recebimento (${x.code})` });
      } else {
        // O servidor respondeu e nada foi gravado: a próxima tentativa é outro comando.
        chave.current = novaChave();
        const m: Record<string, string> = {};
        x.details.forEach((d) => {
          if (!d.field) return;
          const campo = d.field.startsWith('allocations') || d.field.startsWith('titles.') ? 'amountCents' : d.field;
          m[campo] = d.message;
        });
        setErros(Object.keys(m).length > 0 ? m : { geral: x.message });
        notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
    } finally {
      setEnviando(false);
    }
  };

  const erro = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const fid = (k: string) => `${idBase}-receber-${k}`;

  return (
    <Dialog
      icon="info"
      label="Receber"
      onEscape={onCancelar}
      buttons={[
        { label: 'Receber', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}
    >
      Título {titulo.code} — saldo de {reais(titulo.balanceCents)}. O valor não pode passar do saldo; para receber menos, a baixa fica parcial.
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={fid('conta')}>Conta</label>
        <Selecao id={fid('conta')} valor={conta} onChange={setConta} aria-invalid={!!erros.accountId}
          opcoes={(contas ?? []).map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))} />
        {erro('accountId')}
        <label className="rp-label" htmlFor={fid('data')}>Data</label>
        <CampoData id={fid('data')} rotulo="Data do recebimento" valor={data} onChange={setData} invalido={!!erros.effectiveDate} className="rp-field rp-field--curto" />
        {erro('effectiveDate')}
        <label className="rp-label" htmlFor={fid('valor')}>Valor</label>
        <input id={fid('valor')} className="rp-field rp-field--num rp-field--curto" value={valor} maxLength={20} inputMode="decimal" aria-invalid={!!erros.amountCents}
          onChange={(e) => (setValor(e.target.value), setErros({}))}
          onBlur={() => {
            const c = centavosParaApi(valor);
            if (c && /^\d+$/.test(c)) setValor(centavos(c));
          }}
          onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
        {erro('amountCents')}
        <label className="rp-label" htmlFor={fid('obs')}>Observação</label>
        <input id={fid('obs')} className="rp-field" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} />
        {erro('notes')}
      </div>
      {erros.geral && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.geral}
        </span>
      )}
    </Dialog>
  );
}
