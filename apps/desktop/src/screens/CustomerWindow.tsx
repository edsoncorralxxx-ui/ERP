import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Customer, CustomerContact, CustomerUnit, HistoryEntry } from '../api/types';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CLIENTES_ALTERADOS } from './CustomersWindow';

type Tab = 'geral' | 'unidades' | 'contatos' | 'historico';
type Unit = { id: string | null; name: string; street: string; number: string; district: string; city: string; state: string; postalCode: string };
type Contact = { id: string | null; name: string; role: string; phone: string; email: string };
type Form = { legalName: string; tradeName: string; cnpj: string; group: string; units: Unit[]; contacts: Contact[] };

const VAZIO: Form = { legalName: '', tradeName: '', cnpj: '', group: '', units: [], contacts: [] };
const UNIDADE: Unit = { id: null, name: '', street: '', number: '', district: '', city: '', state: '', postalCode: '' };
const CONTATO: Contact = { id: null, name: '', role: '', phone: '', email: '' };

const s = (v: string | null | undefined) => v ?? '';
const n = (v: string) => (v.trim() === '' ? null : v.trim());
const cep = (v: string | null) => (v && /^\d{8}$/.test(v) ? `${v.slice(0, 5)}-${v.slice(5)}` : s(v));
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function toForm(c: Customer): Form {
  return {
    legalName: c.legalName,
    tradeName: s(c.tradeName),
    cnpj: s(c.cnpjFormatted ?? c.cnpj),
    group: s(c.group),
    units: c.units.map((u: CustomerUnit) => ({
      id: u.id, name: s(u.name), street: s(u.street), number: s(u.number), district: s(u.district), city: s(u.city), state: s(u.state), postalCode: cep(u.postalCode),
    })),
    contacts: c.contacts.map((x: CustomerContact) => ({ id: x.id, name: s(x.name), role: s(x.role), phone: s(x.phone), email: s(x.email) })),
  };
}

function toRequest(f: Form) {
  return {
    legalName: n(f.legalName),
    tradeName: n(f.tradeName),
    cnpj: n(f.cnpj),
    group: n(f.group),
    units: f.units.map((u) => ({ id: u.id, name: n(u.name), street: n(u.street), number: n(u.number), district: n(u.district), city: n(u.city), state: n(u.state), postalCode: n(u.postalCode) })),
    contacts: f.contacts.map((c) => ({ id: c.id, name: n(c.name), role: n(c.role), phone: n(c.phone), email: n(c.email) })),
  };
}

const ROTULO: Record<string, string> = {
  code: 'Código', legalName: 'Razão social', tradeName: 'Nome fantasia', cnpj: 'CNPJ', group: 'Grupo', status: 'Situação', units: 'Unidades', contacts: 'Contatos',
};
const ACAO: Record<string, string> = { PARTNER_REGISTERED: 'Cadastro', PARTNER_UPDATED: 'Alteração', PARTNER_DEACTIVATED: 'Inativação' };

function novaChave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Ficha do cliente (formulário "clientes" do B01): cabeçalho sempre visível, abas Geral, Unidades, Contatos e
 * Histórico. Em modo de adição os campos ficam amarelo-claros; o cadastro leva uma chave de idempotência que não muda
 * até dar certo, então um reenvio depois de queda de conexão não duplica o cliente.
 */
export function CustomerWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [cliente, setCliente] = useState<Customer | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(VAZIO);
  const [tab, setTab] = useState<Tab>('geral');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [inativar, setInativar] = useState<{ motivo: string; erro: string | null } | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const chave = useRef(novaChave());

  const adicao = cliente === null;
  const inativo = cliente?.status === 'INATIVO';
  const somenteLeitura = adicao ? !can('partner.create') : !can('partner.update') || inativo;
  const original = useMemo(() => (cliente ? toForm(cliente) : VAZIO), [cliente]);
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const carregar = useCallback(async (cid: string) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const r = await api.get<Customer>(`/api/v1/customers/${cid}`);
      setCliente(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setErros({});
      setHistorico(null);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (id) void carregar(id);
    // Só na abertura: depois a ficha se atualiza pelo que o servidor devolve ao gravar.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'historico' || !id || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/customers/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      winRef.current.notify({ tone: 'aviso', text: `O cliente foi alterado por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.status === 422) {
      const map: Record<string, string> = {};
      x.details.forEach((d) => d.field && (map[d.field] = d.message));
      setErros(map);
      const campos = Object.keys(map);
      if (campos.length && campos.every((k) => k.startsWith('units'))) setTab('unidades');
      else if (campos.length && campos.every((k) => k.startsWith('contacts'))) setTab('contatos');
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.isNetwork) {
      winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${x.code})` });
    } else {
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = cliente
        ? await api.put<Customer>(`/api/v1/customers/${cliente.id}`, body, etag)
        : await api.post<Customer>('/api/v1/customers', body, { 'Idempotency-Key': chave.current });
      setCliente(r.data);
      setId(r.data.id);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setErros({});
      setHistorico(null);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Cliente ${r.data.code} ${cliente ? 'atualizado' : 'adicionado'} com sucesso` });
      window.dispatchEvent(new Event(CLIENTES_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [cliente, etag, falha]);

  const confirmarInativacao = async () => {
    if (!cliente || !inativar) return;
    if (!inativar.motivo.trim()) {
      setInativar({ ...inativar, erro: 'Informe o motivo da inativação.' });
      return;
    }
    try {
      const r = await api.post<Customer>(`/api/v1/customers/${cliente.id}/deactivate`, { reason: inativar.motivo.trim() }, { 'If-Match': etag });
      setCliente(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setHistorico(null);
      setInativar(null);
      winRef.current.notify({ tone: 'sucesso', text: `Cliente ${r.data.code} inativado com sucesso` });
      window.dispatchEvent(new Event(CLIENTES_ALTERADOS));
    } catch (e) {
      setInativar(null);
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setUnit = (i: number, patch: Partial<Unit>) => setForm((f) => ({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));
  const setContact = (i: number, patch: Partial<Contact>) => setForm((f) => ({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || inativar !== null) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { g: 'geral', u: 'unidades', o: 'contatos', h: 'historico' };
      if (alvo[k] && (alvo[k] !== 'historico' || id)) setTab(alvo[k]);
      else if (k === 'i' && cliente && !inativo && can('partner.deactivate')) setInativar({ motivo: '', erro: null });
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const campo = (k: 'legalName' | 'tradeName' | 'cnpj' | 'group', rotulo: string, obrigatorio = false) => {
    const erro = erros[k];
    return (
      <Fragment key={k}>
        <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
        {obrigatorio ? <span className="rp-req" aria-hidden="true">*</span> : <span />}
        <input
          id={fid(k)}
          className={`rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`}
          value={form[k]}
          readOnly={somenteLeitura}
          required={obrigatorio}
          aria-invalid={!!erro}
          aria-describedby={erro ? `${fid(k)}-erro` : undefined}
          disabled={carregando}
          onChange={(e) => set({ [k]: e.target.value })}
        />
        {erro && (
          <>
            <span />
            <span />
            <span id={`${fid(k)}-erro`} className="rp-campo-erro">
              <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
            </span>
          </>
        )}
      </Fragment>
    );
  };

  const celula = (prefixo: string, i: number, chaveCampo: string, valor: string, onChange: (v: string) => void, rotulo: string, extra = '') => {
    const erro = erros[`${prefixo}[${i}].${chaveCampo}`];
    return (
      <td>
        <input
          className={`rp-field${extra}`}
          value={valor}
          readOnly={somenteLeitura}
          aria-label={`${rotulo} da linha ${i + 1}`}
          aria-invalid={!!erro}
          title={erro}
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
    );
  };

  const errosDaLista = (prefixo: string, nome: string) =>
    Object.entries(erros)
      .filter(([k]) => k.startsWith(prefixo))
      .map(([k, v]) => {
        const m = /\[(\d+)\]/.exec(k);
        return `${nome} ${m ? Number(m[1]) + 1 : ''}: ${v}`;
      });

  const tabs: [Tab, ReactNode, boolean][] = [
    ['geral', <span><u>G</u>eral</span>, true],
    ['unidades', <span><u>U</u>nidades ({form.units.length})</span>, true],
    ['contatos', <span>C<u>o</u>ntatos ({form.contacts.length})</span>, true],
    ['historico', <span><u>H</u>istórico</span>, id !== null],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className={`rp-form rp-form--req rp-ficha__principal${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                <span className="rp-label">Código</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly value={cliente?.code ?? 'Gerado ao adicionar'} aria-label="Código" />
                {campo('legalName', 'Razão social', true)}
                {campo('tradeName', 'Nome fantasia')}
                {campo('cnpj', 'CNPJ')}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  <span className={`rp-badge ${adicao ? '' : inativo ? 'rp-badge--cancelado' : 'rp-badge--aprovado'}`}>
                    {adicao ? 'Novo' : inativo ? 'Inativo' : 'Ativo'}
                  </span>
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={cliente?.version ?? ''} aria-label="Versão" />
                <span className="rp-label">Atualizado em</span>
                <input
                  className="rp-field rp-field--readonly"
                  readOnly
                  value={cliente ? `${dataHora(cliente.updatedAt ?? cliente.createdAt)} por ${cliente.updatedBy ?? cliente.createdBy}` : ''}
                  aria-label="Atualizado em"
                />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, ativo]) => (
                <div
                  key={t}
                  className="rp-tab"
                  role="tab"
                  tabIndex={ativo ? 0 : -1}
                  aria-selected={tab === t}
                  aria-disabled={!ativo || undefined}
                  title={ativo ? undefined : 'Disponível depois de adicionar o cliente'}
                  onClick={() => ativo && setTab(t)}
                  onKeyDown={(e) => e.key === 'Enter' && ativo && setTab(t)}
                >
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'geral' ? (
                <div className={`rp-form rp-form--req rp-janela-mdi__form${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                  {campo('group', 'Grupo de clientes')}
                  <span className="rp-label">Cadastrado em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly value={cliente ? `${dataHora(cliente.createdAt)} por ${cliente.createdBy}` : ''} aria-label="Cadastrado em" />
                  {inativo && (
                    <>
                      <span className="rp-label">Situação</span>
                      <span />
                      <span className="rp-janela-mdi__aviso">
                        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Cliente inativo: o histórico é preservado e ele não aparece na lista de ativos.
                      </span>
                    </>
                  )}
                </div>
              ) : tab === 'unidades' ? (
                <div className="rp-tabela">
                  <div className="rp-tabela-acoes">
                    <span className="rp-tabela-tit">Unidades industriais do cliente</span>
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className={`rp-grid rp-grid--edicao${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th>Nome *</th>
                          <th>Logradouro</th>
                          <th className="rp-ficha__col-curta">Nº</th>
                          <th>Bairro</th>
                          <th>Cidade</th>
                          <th className="rp-ficha__col-uf">UF</th>
                          <th className="rp-ficha__col-cep">CEP</th>
                          <th className="rp-ficha__col-x" aria-label="Remover" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.units.map((u, i) => (
                          <tr key={u.id ?? `n${i}`}>
                            <td className="rownum">{i + 1}</td>
                            {celula('units', i, 'name', u.name, (v) => setUnit(i, { name: v }), 'Nome')}
                            {celula('units', i, 'street', u.street, (v) => setUnit(i, { street: v }), 'Logradouro')}
                            {celula('units', i, 'number', u.number, (v) => setUnit(i, { number: v }), 'Número')}
                            {celula('units', i, 'district', u.district, (v) => setUnit(i, { district: v }), 'Bairro')}
                            {celula('units', i, 'city', u.city, (v) => setUnit(i, { city: v }), 'Cidade')}
                            {celula('units', i, 'state', u.state, (v) => setUnit(i, { state: v.toUpperCase() }), 'UF')}
                            {celula('units', i, 'postalCode', u.postalCode, (v) => setUnit(i, { postalCode: v }), 'CEP')}
                            <td
                              className="rp-linha-x"
                              role={somenteLeitura ? undefined : 'button'}
                              tabIndex={somenteLeitura ? -1 : 0}
                              title="Remover unidade"
                              aria-label={`Remover unidade ${i + 1}`}
                              onClick={() => !somenteLeitura && set({ units: form.units.filter((_, j) => j !== i) })}
                              onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && set({ units: form.units.filter((_, j) => j !== i) })}
                            >
                              {somenteLeitura ? '' : '×'}
                            </td>
                          </tr>
                        ))}
                        {!somenteLeitura && (
                          <tr className="nova">
                            <td className="rownum">{form.units.length + 1}</td>
                            <td colSpan={8}>
                              <button type="button" className="rp-ficha__nova" onClick={() => set({ units: [...form.units, { ...UNIDADE }] })}>
                                Clique para adicionar uma unidade…
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {errosDaLista('units', 'Unidade').map((m) => (
                    <p key={m} className="rp-campo-erro rp-ficha__erro">
                      <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
                    </p>
                  ))}
                </div>
              ) : tab === 'contatos' ? (
                <div className="rp-tabela">
                  <div className="rp-tabela-acoes">
                    <span className="rp-tabela-tit">Contatos do cliente</span>
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className="rp-grid rp-grid--edicao">
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th>Nome *</th>
                          <th>Função</th>
                          <th>Telefone</th>
                          <th>E-mail</th>
                          <th className="rp-ficha__col-x" aria-label="Remover" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.contacts.map((c, i) => (
                          <tr key={c.id ?? `n${i}`}>
                            <td className="rownum">{i + 1}</td>
                            {celula('contacts', i, 'name', c.name, (v) => setContact(i, { name: v }), 'Nome')}
                            {celula('contacts', i, 'role', c.role, (v) => setContact(i, { role: v }), 'Função')}
                            {celula('contacts', i, 'phone', c.phone, (v) => setContact(i, { phone: v }), 'Telefone')}
                            {celula('contacts', i, 'email', c.email, (v) => setContact(i, { email: v }), 'E-mail')}
                            <td
                              className="rp-linha-x"
                              role={somenteLeitura ? undefined : 'button'}
                              tabIndex={somenteLeitura ? -1 : 0}
                              title="Remover contato"
                              aria-label={`Remover contato ${i + 1}`}
                              onClick={() => !somenteLeitura && set({ contacts: form.contacts.filter((_, j) => j !== i) })}
                              onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && set({ contacts: form.contacts.filter((_, j) => j !== i) })}
                            >
                              {somenteLeitura ? '' : '×'}
                            </td>
                          </tr>
                        ))}
                        {!somenteLeitura && (
                          <tr className="nova">
                            <td className="rownum">{form.contacts.length + 1}</td>
                            <td colSpan={5}>
                              <button type="button" className="rp-ficha__nova" onClick={() => set({ contacts: [...form.contacts, { ...CONTATO }] })}>
                                Clique para adicionar um contato…
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {errosDaLista('contacts', 'Contato').map((m) => (
                    <p key={m} className="rp-campo-erro rp-ficha__erro">
                      <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  {historico === null ? (
                    <p className="rp-janela-mdi__aviso">Carregando</p>
                  ) : (
                    <table className="rp-grid rp-janela-mdi__grade" aria-label="Histórico do cliente">
                      <thead>
                        <tr>
                          <th>Data e hora</th>
                          <th>Usuário</th>
                          <th>Operação</th>
                          <th className="num">Versão</th>
                          <th>Campo</th>
                          <th>Antes</th>
                          <th>Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.flatMap((h, i) => {
                          const mudancas = Object.entries(h.changes);
                          const linhas: [string, string, string][] = mudancas.length
                            ? mudancas.map(([k, v]) => [ROTULO[k] ?? k, s(v.before), s(v.after)])
                            : [['', '', '']];
                          if (h.reason) linhas.push(['Motivo', '', h.reason]);
                          return linhas.map(([campoH, antes, depois], j) => (
                            <tr key={`${i}-${j}`}>
                              <td>{j === 0 ? dataHora(h.occurredAt) : ''}</td>
                              <td>{j === 0 ? h.actor : ''}</td>
                              <td>{j === 0 ? ACAO[h.action] ?? h.action : ''}</td>
                              <td className="num">{j === 0 ? h.version : ''}</td>
                              <td>{campoH}</td>
                              <td className="rp-ficha__antes">{antes}</td>
                              <td>{depois}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {!somenteLeitura && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {adicao ? 'Adicionar' : 'Atualizar'}
            </button>
          )}
          <button type="button" className={`rp-btn${somenteLeitura ? ' rp-btn--default' : ''}`} onClick={win.requestClose}>
            {somenteLeitura ? 'OK' : 'Cancelar'}
          </button>
        </div>
        <div className="rp-btn-row">
          {cliente && !inativo && can('partner.deactivate') && (
            <button type="button" className="rp-btn" onClick={() => setInativar({ motivo: '', erro: null })}>
              <span><u>I</u>nativar</span>
            </button>
          )}
        </div>
      </div>

      {inativar && (
        <Dialog
          icon="aviso"
          label="Inativar cliente"
          onEscape={() => setInativar(null)}
          buttons={[
            { label: 'Inativar', primary: true, onClick: () => void confirmarInativacao() },
            { label: 'Cancelar', onClick: () => setInativar(null) },
          ]}
        >
          O cliente {cliente?.code} deixa de aparecer na lista de ativos; o histórico é preservado.
          <br />
          <label className="rp-ficha__motivo">
            Motivo da inativação
            <input
              className="rp-field"
              value={inativar.motivo}
              aria-invalid={!!inativar.erro}
              onChange={(e) => setInativar({ motivo: e.target.value, erro: null })}
              onKeyDown={(e) => e.key === 'Enter' && void confirmarInativacao()}
            />
          </label>
          {inativar.erro && <span className="rp-campo-erro">{inativar.erro}</span>}
        </Dialog>
      )}

      {conflito !== null && (
        <Dialog
          icon="aviso"
          label="Cliente alterado por outra pessoa"
          onEscape={() => setConflito(null)}
          buttons={[
            {
              label: 'Recarregar',
              primary: true,
              onClick: () => {
                setConflito(null);
                if (id) void carregar(id);
              },
            },
            { label: 'Continuar editando', onClick: () => setConflito(null) },
          ]}
        >
          O cliente foi alterado em outra janela ou estação (versão atual {conflito}) e suas alterações não foram gravadas.
          <br />
          Deseja recarregar a versão do servidor? Isso descarta o que você digitou.
        </Dialog>
      )}
    </>
  );
}
