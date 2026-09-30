import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { BankAccount, HistoryEntry, Payable, Settlement } from '../api/types';
import { centavos, centavosParaApi, competenciaDaApi, dataDaApi, dataHora, dataParaApi, hojeIso, reais } from '../format';
import { Dialog } from '../shell/Dialog';
import type { StatusMessage } from '../shell/StatusBar';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CONTAS_ALTERADAS } from './BankAccountsWindow';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { nomeCategoria, useCategorias } from './comum/Categorias';
import { DialogoConflito, DialogoMotivo } from './comum/Dialogos';
import { GradeHistorico } from './comum/GradeHistorico';
import { Selecao } from './comum/Selecao';
import { PAGAR_ALTERADOS, seloPagar } from './PayablesWindow';
import { CampoDinheiro } from './comum/CampoDinheiro';

type Tab = 'geral' | 'pagamentos' | 'historico';

const seloPagamento = (s: Settlement['status']) => (
  <span className={`rp-badge ${s === 'POSTED' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{s === 'POSTED' ? 'Registrado' : 'Estornado'}</span>
);

/**
 * Ficha do título a pagar (formulário "pagar"): valor, pago e saldo derivados dos pagamentos; aba Pagamentos com cada
 * pagamento e o estorno. Pagar abre a caixa com conta, data e valor (o saldo já vem preenchido) e avisa quando a conta
 * vai ficar negativa (aceito, decisão do PO). Cancelar só o título manual sem pagamento; o DAS muda pela conferência.
 */
export function PayableWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const categorias = useCategorias();
  const [titulo, setTitulo] = useState<Payable | null>(null);
  const [pagamentos, setPagamentos] = useState<Settlement[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [tab, setTab] = useState<Tab>('geral');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [estornar, setEstornar] = useState<Settlement | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [conflito, setConflito] = useState(false);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const [t, s] = await Promise.all([
        api.get<Payable>(`/api/v1/payables/${recordKey}`),
        api.get<Settlement[]>(`/api/v1/settlements?titleId=${recordKey}`),
      ]);
      setTitulo(t.data);
      setPagamentos(s.data);
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
      .get<HistoryEntry[]>(`/api/v1/payables/${recordKey}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, recordKey, historico]);

  const aberto = !!titulo && (titulo.status === 'OPEN' || titulo.status === 'PARTIAL');
  const manual = titulo?.originType === 'MANUAL';
  const podePagar = aberto && can('financial_title.settle');
  const podeEstornar = can('settlement.reverse');
  const podeCancelar = !!titulo && manual && titulo.status === 'OPEN' && can('financial_title.cancel');

  const alterado = async (texto: string) => {
    winRef.current.notify({ tone: 'sucesso', text: texto });
    window.dispatchEvent(new Event(PAGAR_ALTERADOS));
    window.dispatchEvent(new Event(CONTAS_ALTERADAS));
    await carregar();
  };

  const falha = (e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) setConflito(true);
    winRef.current.notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
  };

  const confirmarEstorno = async (s: Settlement, motivo: string) => {
    setEstornar(null);
    try {
      const r = await api.post<Settlement>(`/api/v1/settlements/${s.id}/reversals`, { reason: motivo });
      await alterado(`Pagamento ${r.data.code} estornado com sucesso: ${reais(r.data.amountCents)} voltaram ao saldo do título e à conta ${r.data.accountCode}`);
    } catch (e) {
      falha(e);
    }
  };

  const confirmarCancelamento = async (motivo: string) => {
    setCancelar(false);
    if (!titulo) return;
    try {
      const r = await api.post<Payable>(`/api/v1/payables/${titulo.id}/cancellation`, { reason: motivo }, { 'If-Match': `"${titulo.version}"` });
      await alterado(`Título ${r.data.code} cancelado com sucesso`);
    } catch (e) {
      falha(e);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (pagando || estornar || cancelar) return;
    if (e.altKey) {
      const alvo: Record<string, Tab> = { g: 'geral', p: 'pagamentos', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTab(t);
      } else if (e.key.toLowerCase() === 'a' && podePagar) {
        e.preventDefault();
        setPagando(true);
      } else if (e.key.toLowerCase() === 'c' && podeCancelar) {
        e.preventDefault();
        setCancelar(true);
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
    ['pagamentos', <span><u>P</u>agamentos ({pagamentos?.length ?? 0})</span>],
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
                <span className="rp-label">Beneficiário</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta(`Abrir fornecedor ${titulo.supplierCode}`, () => win.open('supplier', titulo.supplierId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Beneficiário" value={`${titulo.supplierCode} — ${titulo.supplierName}`} />
                </span>
                {campo('Descrição', titulo.origin)}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>{seloPagar(titulo)}</span>
                <span className="rp-label">Saldo a pagar</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Saldo a pagar" value={reais(titulo.balanceCents)} />
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
                  {campo('Competência', competenciaDaApi(titulo.competence), 'rp-field--curto')}
                  {campo('Emissão', dataDaApi(titulo.issueDate), 'rp-field--curto')}
                  {campo('Valor original', reais(titulo.originalCents), 'rp-field--num rp-field--curto')}
                  {campo('Pago', reais(titulo.paidCents), 'rp-field--num rp-field--curto')}
                  {campo('Saldo', reais(titulo.balanceCents), 'rp-field--num rp-field--curto')}
                  {campo('Categoria', nomeCategoria(categorias, titulo.category))}
                  {campo('Documento', titulo.documentNumber ?? '')}
                  {titulo.originType === 'TAX_PERIOD' && (
                    <>
                      <span className="rp-label">Origem</span>
                      <span />
                      <span className="rp-ficha__ref">
                        {seta(`Abrir competência ${competenciaDaApi(titulo.competence)}`, () => win.open('tax-period', titulo.competence))}
                        <input className="rp-field rp-field--readonly" readOnly aria-label="Origem" value={`Conferência do contador — competência ${competenciaDaApi(titulo.competence)}`} />
                      </span>
                    </>
                  )}
                  {titulo.projectId && (
                    <>
                      <span className="rp-label">Projeto</span>
                      <span />
                      <span className="rp-ficha__ref">
                        {seta('Abrir o projeto', () => win.open('project', titulo.projectId!))}
                        <input className="rp-field rp-field--readonly" readOnly aria-label="Projeto" value="Projeto do título" />
                      </span>
                    </>
                  )}
                  {titulo.notes && campo('Observação', titulo.notes)}
                  {campo('Criado em', `${dataHora(titulo.createdAt)} por ${titulo.createdBy}`)}
                  {titulo.status === 'CANCELLED' && (
                    <>
                      <span className="rp-label">Cancelamento</span>
                      <span />
                      <span className="rp-janela-mdi__aviso">
                        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {titulo.cancelReason ?? 'Cancelado'}
                      </span>
                    </>
                  )}
                </div>
              ) : tab === 'pagamentos' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Pagamentos do título">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th>Pagamento</th>
                        <th>Data</th>
                        <th>Conta</th>
                        <th className="num">Neste título</th>
                        <th className="num">Total pago</th>
                        <th>Situação</th>
                        <th>Estorno</th>
                        <th aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {(pagamentos ?? []).map((s, i) => (
                        <tr key={s.id}>
                          <td className="rownum">{i + 1}</td>
                          <td>{s.code}</td>
                          <td>{dataDaApi(s.effectiveDate)}</td>
                          <td>{`${s.accountCode} — ${s.accountName}`}</td>
                          <td className="num">{reais(s.allocations.find((a) => a.titleId === titulo.id)?.amountCents ?? '0')}</td>
                          <td className="num">{reais(s.amountCents)}</td>
                          <td>{seloPagamento(s.status)}</td>
                          <td>{s.status === 'REVERSED' ? `${dataDaApi(s.reversalDate)} por ${s.reversedBy}: ${s.reversalReason}` : ''}</td>
                          <td>
                            {s.status === 'POSTED' && podeEstornar && (
                              <button type="button" className="rp-btn" aria-label={`Estornar pagamento ${s.code}`} onClick={() => setEstornar(s)}>
                                Estornar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pagamentos?.length === 0 && <p className="rp-jlista__vazio">Nenhum pagamento registrado neste título.</p>}
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
          <button type="button" className={`rp-btn${podePagar ? '' : ' rp-btn--default'}`} onClick={win.requestClose}>
            OK
          </button>
          {podeCancelar && (
            <button type="button" className="rp-btn" onClick={() => setCancelar(true)}>
              <span><u>C</u>ancelar título</span>
            </button>
          )}
        </div>
        <div className="rp-btn-row">
          {podePagar && (
            <button type="button" className="rp-btn rp-btn--default" onClick={() => setPagando(true)}>
              <span>P<u>a</u>gar</span>
            </button>
          )}
        </div>
      </div>
      {pagando && titulo && (
        <DialogoPagamento
          titulo={titulo}
          idBase={win.windowId}
          onCancelar={() => setPagando(false)}
          onPago={(s) => {
            setPagando(false);
            void alterado(`Pagamento ${s.code} de ${reais(s.amountCents)} registrado com sucesso no título ${titulo.code}`);
          }}
          notify={win.notify}
        />
      )}
      {estornar && (
        <DialogoMotivo
          rotulo="Estornar pagamento"
          texto={`O pagamento ${estornar.code} de ${reais(estornar.amountCents)} será estornado por inteiro: o valor volta ao saldo do título e à conta ${estornar.accountCode}. O registro original continua consultável.`}
          idCampo={`${win.windowId}-motivo-estorno`}
          botao="Estornar"
          voltar="Voltar"
          falta="Informe o motivo do estorno."
          onConfirmar={(m) => void confirmarEstorno(estornar, m)}
          onCancelar={() => setEstornar(null)}
        />
      )}
      {cancelar && titulo && (
        <DialogoMotivo
          rotulo="Cancelar título"
          texto={`O título ${titulo.code} de ${reais(titulo.originalCents)} será cancelado e sai do saldo a pagar. O registro continua consultável.`}
          idCampo={`${win.windowId}-motivo-cancelamento`}
          botao="Cancelar título"
          voltar="Voltar"
          falta="Informe o motivo do cancelamento."
          onConfirmar={(m) => void confirmarCancelamento(m)}
          onCancelar={() => setCancelar(false)}
        />
      )}
      {conflito && titulo && (
        <DialogoConflito
          rotulo="Título a pagar"
          objeto={`O título ${titulo.code}`}
          versao={titulo.version}
          onRecarregar={() => (setConflito(false), void carregar())}
          onContinuar={() => setConflito(false)}
        />
      )}
    </>
  );
}

/**
 * Caixa "Pagar": conta ativa, data (hoje) e valor (o saldo); mostra o saldo da conta depois do pagamento e avisa quando
 * ele fica negativo. A chave de idempotência só muda depois de o servidor responder.
 */
export function DialogoPagamento({ titulo, idBase, onCancelar, onPago, notify }: {
  titulo: Payable;
  idBase: string;
  onCancelar: () => void;
  onPago: (s: Settlement) => void;
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

  const escolhida = contas?.find((c) => c.id === conta) ?? null;
  const cents = centavosParaApi(valor) ?? '';
  const valido = /^\d+$/.test(cents);
  const depois = escolhida && valido ? BigInt(escolhida.balanceCents) - BigInt(cents) : null;

  const confirmar = async () => {
    if (enviando) return;
    const falta: Record<string, string> = {};
    if (!conta) falta.accountId = 'Escolha a conta.';
    if (!valido || BigInt(cents) <= 0n) falta.amountCents = 'Informe um valor maior que zero.';
    if (!dataParaApi(data)) falta.effectiveDate = 'Informe a data do pagamento.';
    if (Object.keys(falta).length > 0) return setErros(falta);
    setEnviando(true);
    try {
      const r = await api.post<Settlement>(
        '/api/v1/settlements',
        {
          direction: 'PAYABLE',
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
      onPago(r.data);
    } catch (e) {
      const x = e as ApiError;
      if (x.isNetwork) {
        notify({ tone: 'aviso', text: `Sem conexão com o servidor; confirme de novo para reenviar o mesmo pagamento (${x.code})` });
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
  const fid = (k: string) => `${idBase}-pagar-${k}`;

  return (
    <Dialog
      icon="info"
      label="Pagar"
      onEscape={onCancelar}
      buttons={[
        { label: 'Pagar', primary: true, onClick: () => void confirmar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}
    >
      Título {titulo.code} — saldo de {reais(titulo.balanceCents)}. O valor não pode passar do saldo; para pagar menos, o título fica parcial.
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={fid('conta')}>Conta</label>
        <Selecao id={fid('conta')} valor={conta} onChange={setConta} aria-invalid={!!erros.accountId}
          opcoes={(contas ?? []).map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))} />
        {erro('accountId')}
        <label className="rp-label" htmlFor={fid('data')}>Data</label>
        <CampoData id={fid('data')} rotulo="Data do pagamento" valor={data} onChange={setData} invalido={!!erros.effectiveDate} className="rp-field rp-field--curto" />
        {erro('effectiveDate')}
        <label className="rp-label" htmlFor={fid('valor')}>Valor</label>
        <CampoDinheiro id={fid('valor')} className="rp-field rp-field--num rp-field--curto" value={valor} maxLength={20} aria-invalid={!!erros.amountCents}
          onChange={(e) => (setValor(e.target.value), setErros({}))}
          onBlur={() => {
            const c = centavosParaApi(valor);
            if (c && /^\d+$/.test(c)) setValor(centavos(c));
          }}
          onKeyDown={(e) => e.key === 'Enter' && void confirmar()} />
        {erro('amountCents')}
        <label className="rp-label" htmlFor={fid('saldo')}>Saldo da conta depois</label>
        <input id={fid('saldo')} className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly value={depois === null ? '' : reais(depois.toString())} />
        <label className="rp-label" htmlFor={fid('obs')}>Observação</label>
        <input id={fid('obs')} className="rp-field" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} />
        {erro('notes')}
      </div>
      {depois !== null && depois < 0n && (
        <span className="rp-janela-mdi__aviso" role="status">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> A conta {escolhida!.code} ficará com saldo de {reais(depois.toString())}.
        </span>
      )}
      {erros.geral && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.geral}
        </span>
      )}
    </Dialog>
  );
}
