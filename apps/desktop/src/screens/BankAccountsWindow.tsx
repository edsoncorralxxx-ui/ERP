import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { BankAccount, BankAccountKind, CashMovement, Situacao } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataParaApi, hojeIso, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { Selecao } from './comum/Selecao';

/** Avisado depois de um recebimento ou estorno, que mudam o saldo das contas. */
export const CONTAS_ALTERADAS = 'renda:contas-alteradas';

type Aba = 'contas' | 'extrato';
type Form = { name: string; kind: BankAccountKind; bank: string; agency: string; accountNumber: string; opening: string; openingOn: string; status: Situacao };
const VAZIO: Form = { name: '', kind: 'BANCO', bank: '', agency: '', accountNumber: '', opening: '0,00', openingOn: dataDaApi(hojeIso()), status: 'ATIVO' };

/** Saldo inicial digitado ("-1.234,50") em centavos com sinal; o que não é valor vai como veio, para o servidor apontar. */
const saldoInicial = (texto: string): string => {
  const negativo = texto.trim().startsWith('-');
  const c = centavosParaApi(texto.trim().replace(/^-\s*/, '')) ?? '0';
  return negativo && /^\d+$/.test(c) && c !== '0' ? `-${c}` : c;
};

const toForm = (c: BankAccount): Form => ({
  name: c.name, kind: c.kind, bank: c.bank ?? '', agency: c.agency ?? '', accountNumber: c.accountNumber ?? '', opening: centavos(c.openingCents),
  openingOn: dataDaApi(c.openingOn), status: c.status,
});

/**
 * Contas financeiras (caixa e bancos): grade com o saldo à esquerda e a ficha da conta à direita; a aba Extrato mostra
 * os movimentos da conta com o saldo acumulado. Só o Administrador cadastra e altera (bank_account.admin); a conta não
 * se apaga, fica inativa. Saldo inicial e data não mudam depois do primeiro movimento.
 */
export function BankAccountsWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const admin = can('bank_account.admin');
  const [aba, setAba] = useState<Aba>('contas');
  const [contas, setContas] = useState<BankAccount[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);
  const [movimentos, setMovimentos] = useState<CashMovement[] | null>(null);
  const [contaExtrato, setContaExtrato] = useState('');

  const recarregar = useCallback(async () => {
    try {
      setContas((await api.get<BankAccount[]>('/api/v1/bank-accounts?includeInactive=true')).data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const r = () => void recarregar();
    window.addEventListener(CONTAS_ALTERADAS, r);
    return () => window.removeEventListener(CONTAS_ALTERADAS, r);
  }, [recarregar]);

  const atual = contas?.find((c) => c.id === sel) ?? null;
  const original = useMemo<Form>(() => (atual ? toForm(atual) : VAZIO), [atual]);
  const alterado = admin && JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  // Extrato da conta escolhida (a da ficha, ou a primeira).
  const extrato = contaExtrato || sel || contas?.[0]?.id || '';
  useEffect(() => {
    if (aba !== 'extrato' || !extrato) return;
    setMovimentos(null);
    api
      .get<CashMovement[]>(`/api/v1/bank-accounts/${extrato}/movements`)
      .then((r) => setMovimentos(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [aba, extrato, contas]);

  const escolher = (id: string | null) => {
    setSel(id);
    setErros({});
    const c = contas?.find((x) => x.id === id);
    setForm(c ? toForm(c) : VAZIO);
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = {
        name: form.name, kind: form.kind, bank: form.bank.trim() || null, agency: form.agency.trim() || null,
        accountNumber: form.accountNumber.trim() || null, openingCents: saldoInicial(form.opening),
        openingOn: dataParaApi(form.openingOn), status: form.status,
      };
      const r = atual
        ? await api.put<BankAccount>(`/api/v1/bank-accounts/${atual.id}`, body, `"${atual.version}"`)
        : await api.post<BankAccount>('/api/v1/bank-accounts', body);
      winRef.current.notify({ tone: 'sucesso', text: `Conta ${r.data.code} — ${r.data.name} ${atual ? 'atualizada' : 'adicionada'} com sucesso` });
      await recarregar();
      setSel(r.data.id);
      setErros({});
      return true;
    } catch (e) {
      const x = e as ApiError;
      const m: Record<string, string> = {};
      x.details.forEach((d) => d.field && (m[d.field] = d.message));
      setErros(m);
      winRef.current.notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      if (x.isConflict) await recarregar();
      return false;
    } finally {
      setGravando(false);
    }
  }, [atual, form, recarregar]);

  // Depois de recarregar, a ficha mostra a versão nova da conta gravada.
  useEffect(() => {
    if (!gravando) setForm(original);
  }, [original]); // eslint-disable-line react-hooks/exhaustive-deps

  const podeGravar = alterado && !gravando;
  const novo = useMemo(() => (admin ? () => (setAba('contas'), escolher(null)) : undefined), [admin, contas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, novo }), [podeGravar, gravar, novo, win]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') setAba('contas');
      else if (k === 'e') setAba('extrato');
      else if (k === 'n' && admin) novo?.();
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erro = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const selo = (s: Situacao) => <span className={`rp-badge ${s === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{s === 'ATIVO' ? 'Ativa' : 'Inativa'}</span>;
  const leitura = !admin;
  const saldoFixo = leitura || (atual?.movements ?? 0) > 0;
  const texto = (k: keyof Form, rotulo: string, max: number, req = false, somente = leitura) => (
    <>
      <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
      {req ? <span className="rp-req" aria-hidden="true">*</span> : <span />}
      <input id={fid(k)} className={`rp-field${somente ? ' rp-field--readonly' : ''}`} readOnly={somente} maxLength={max} value={form[k]}
        aria-invalid={!!erros[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {erro(k)}
    </>
  );

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-tabs" role="tablist">
          <div className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === 'contas'} onClick={() => setAba('contas')} onKeyDown={(e) => e.key === 'Enter' && setAba('contas')}>
            <span><u>C</u>ontas</span>
          </div>
          <div className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === 'extrato'} onClick={() => setAba('extrato')} onKeyDown={(e) => e.key === 'Enter' && setAba('extrato')}>
            <span><u>E</u>xtrato</span>
          </div>
        </div>
        {aba === 'contas' ? (
          <div className="rp-tabpanel rp-catalogo" role="tabpanel">
            <div className="rp-grid-rolagem rp-rolagem rp-catalogo__lista">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Contas financeiras">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th className="num">Saldo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {(contas ?? []).map((c, i) => (
                    <tr key={c.id} aria-selected={sel === c.id} onClick={() => escolher(c.id)}>
                      <td className="rownum">{i}</td>
                      <td>{c.code}</td>
                      <td>{c.name}</td>
                      <td>{c.kind === 'CAIXA' ? 'Caixa' : 'Banco'}</td>
                      <td className="num">{reais(c.balanceCents)}</td>
                      <td>{selo(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset className="rp-grupo rp-catalogo__ficha">
              <legend>{leitura && !atual ? 'Escolha uma conta na lista' : atual ? `Conta ${atual.code}` : 'Nova conta'}</legend>
              <div className={`rp-grupo-corpo rp-form rp-form--req rp-catalogo__form${atual || leitura ? '' : ' rp-form--adicao'}`}>
                {texto('name', 'Nome', 100, true)}
                <span className="rp-label">Tipo</span>
                <span />
                <span role="radiogroup" aria-label="Tipo">
                  <label className="rp-choice">
                    <input type="radio" name={fid('tipo')} checked={form.kind === 'BANCO'} disabled={leitura} onChange={() => setForm({ ...form, kind: 'BANCO' })} /> Conta bancária
                  </label>
                  <label className="rp-choice">
                    <input type="radio" name={fid('tipo')} checked={form.kind === 'CAIXA'} disabled={leitura} onChange={() => setForm({ ...form, kind: 'CAIXA' })} /> Caixa
                  </label>
                </span>
                {texto('bank', 'Banco', 100, form.kind === 'BANCO')}
                {texto('agency', 'Agência', 20)}
                {texto('accountNumber', 'Conta', 30)}
                <label className="rp-label" htmlFor={fid('opening')}>Saldo inicial</label>
                <span />
                <input id={fid('opening')} className={`rp-field rp-field--num rp-field--curto${saldoFixo ? ' rp-field--readonly' : ''}`} readOnly={saldoFixo} maxLength={20}
                  inputMode="decimal" value={form.opening} aria-invalid={!!erros.openingCents} onChange={(e) => setForm({ ...form, opening: e.target.value })}
                  onBlur={() => {
                    const negativo = form.opening.trim().startsWith('-');
                    const c = centavosParaApi(form.opening.replace(/^-\s*/, ''));
                    if (c && /^\d+$/.test(c)) setForm((f) => ({ ...f, opening: `${negativo ? '-' : ''}${centavos(c)}` }));
                  }} />
                {erro('openingCents')}
                <label className="rp-label" htmlFor={fid('openingOn')}>Saldo em</label>
                <span />
                <CampoData id={fid('openingOn')} rotulo="Saldo em" valor={form.openingOn} onChange={(v) => setForm({ ...form, openingOn: v })} somenteLeitura={saldoFixo}
                  invalido={!!erros.openingOn} className={`rp-field rp-field--curto${saldoFixo ? ' rp-field--readonly' : ''}`} />
                {erro('openingOn')}
                {atual && (
                  <>
                    <span className="rp-label">Saldo atual</span>
                    <span />
                    <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Saldo atual" value={reais(atual.balanceCents)} />
                  </>
                )}
              </div>
              {atual && (
                <div className="rp-usuarios__situacao" role="radiogroup" aria-label="Situação">
                  <label className="rp-choice">
                    <input type="radio" name={fid('situacao')} checked={form.status === 'ATIVO'} disabled={leitura} onChange={() => setForm({ ...form, status: 'ATIVO' })} /> Ativa
                  </label>
                  <label className="rp-choice">
                    <input type="radio" name={fid('situacao')} checked={form.status === 'INATIVO'} disabled={leitura} onChange={() => setForm({ ...form, status: 'INATIVO' })} /> Inativa
                  </label>
                </div>
              )}
              <p className="rp-tip rp-usuarios__nota" role="note">
                O saldo é o saldo inicial mais os recebimentos e estornos. Depois do primeiro movimento, o saldo inicial e a data não mudam; conta inativa não recebe lançamentos.
              </p>
            </fieldset>
          </div>
        ) : (
          <div className="rp-tabpanel" role="tabpanel">
            <div className="rp-filtros rp-jlista__filtros">
              <label htmlFor={fid('extrato')}>Conta</label>
              <Selecao id={fid('extrato')} className="rp-field rp-contas__extrato" valor={extrato} onChange={setContaExtrato} opcoes={(contas ?? []).map((c) => ({ valor: c.id, rotulo: `${c.code} — ${c.name}` }))} />
            </div>
            <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Extrato da conta">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th className="num">Entrada</th>
                    <th className="num">Saída</th>
                    <th className="num">Saldo</th>
                    <th>Lançado por</th>
                  </tr>
                </thead>
                <tbody>
                  {(movimentos ?? []).map((m, i) => (
                    <tr key={m.id}>
                      <td className="rownum">{i + 1}</td>
                      <td>{dataDaApi(m.effectiveDate)}</td>
                      <td>{m.description}</td>
                      <td className="num">{m.amountCents.startsWith('-') ? '' : reais(m.amountCents)}</td>
                      <td className="num">{m.amountCents.startsWith('-') ? reais(m.amountCents.slice(1)) : ''}</td>
                      <td className="num">{reais(m.balanceCents)}</td>
                      <td>{m.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {movimentos?.length === 0 && <p className="rp-jlista__vazio">Nenhum movimento nesta conta.</p>}
            </div>
          </div>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {admin && aba === 'contas' && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {atual ? 'Atualizar' : 'Adicionar'}
            </button>
          )}
          <button type="button" className={`rp-btn${admin && aba === 'contas' ? '' : ' rp-btn--default'}`} onClick={win.requestClose}>
            {admin ? 'Cancelar' : 'OK'}
          </button>
        </div>
        <div className="rp-btn-row">
          {admin && (
            <button type="button" className="rp-btn" onClick={() => novo?.()}>
              <span><u>N</u>ovo</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
