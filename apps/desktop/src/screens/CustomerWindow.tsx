import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Customer, CustomerContact, CustomerUnit, HistoryEntry } from '../api/types';
import { dataHora as formatarDataHora } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito, DialogoInativar, DialogoOutroPapel } from './comum/Dialogos';
import { GradeContatos } from './comum/GradeContatos';
import { GradeHistorico } from './comum/GradeHistorico';
import { CLIENTES_ALTERADOS } from './CustomersWindow';
import { FORNECEDORES_ALTERADOS } from './SuppliersWindow';

type Tab = 'geral' | 'unidades' | 'contatos' | 'historico';
type Unit = { id: string | null; name: string; street: string; number: string; district: string; city: string; state: string; postalCode: string };
type Contact = { id: string | null; name: string; role: string; phone: string; email: string };
type Form = { legalName: string; tradeName: string; cnpj: string; group: string; units: Unit[]; contacts: Contact[] };

const VAZIO: Form = { legalName: '', tradeName: '', cnpj: '', group: '', units: [], contacts: [] };
const UNIDADE: Unit = { id: null, name: '', street: '', number: '', district: '', city: '', state: '', postalCode: '' };

const s = (v: string | null | undefined) => v ?? '';
const n = (v: string) => (v.trim() === '' ? null : v.trim());
const cep = (v: string | null) => (v && /^\d{8}$/.test(v) ? `${v.slice(0, 5)}-${v.slice(5)}` : s(v));
const dataHora = (iso: string | null) => formatarDataHora(iso);

// Tamanho máximo de cada campo (colunas de cadastros.partner, partner_unit e partner_contact); o rodapé mostra o
// limite quando o campo está em foco.
const MAX = { legalName: 200, tradeName: 200, cnpj: 18, group: 100, name: 120, street: 200, number: 20, district: 100, city: 100, state: 2, postalCode: 9, role: 100, phone: 30, email: 200 } as const;

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
  const [inativar, setInativar] = useState(false);
  const [outroPapel, setOutroPapel] = useState<{ mensagem: string; id: string; versao: string } | null>(null);
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
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
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
    if (x.code === 'PARTNER_OTHER_ROLE') {
      // CNPJ de um fornecedor: em vez de duplicar o parceiro, oferece torná-lo também cliente.
      const d = (f: string) => x.details.find((i) => i.field === f)?.message ?? '';
      setOutroPapel({ mensagem: x.message, id: d('partnerId'), versao: d('version') });
      winRef.current.notify({ tone: 'aviso', text: `${x.message} (${x.code})` });
    } else if (x.isConflict) {
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

  const confirmarInativacao = async (motivo: string) => {
    if (!cliente) return;
    setInativar(false);
    try {
      const r = await api.post<Customer>(`/api/v1/customers/${cliente.id}/deactivate`, { reason: motivo }, { 'If-Match': etag });
      setCliente(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setHistorico(null);
      winRef.current.notify({ tone: 'sucesso', text: `Cliente ${r.data.code} inativado com sucesso` });
      window.dispatchEvent(new Event(CLIENTES_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  /** Dá o papel de cliente ao parceiro existente e abre a ficha dele nesta janela (o digitado aqui não é gravado). */
  const tornarCliente = async () => {
    if (!outroPapel) return;
    const alvo = outroPapel;
    setOutroPapel(null);
    try {
      const r = await api.post<Customer>(`/api/v1/customers/${alvo.id}/enable`, undefined, { 'If-Match': `"${alvo.versao}"` });
      setCliente(r.data);
      setId(r.data.id);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setErros({});
      setHistorico(null);
      winRef.current.notify({ tone: 'sucesso', text: `Parceiro ${r.data.code} agora também é cliente` });
      window.dispatchEvent(new Event(CLIENTES_ALTERADOS));
      window.dispatchEvent(new Event(FORNECEDORES_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setUnit = (i: number, patch: Partial<Unit>) => setForm((f) => ({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || inativar || outroPapel !== null) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { g: 'geral', u: 'unidades', o: 'contatos', h: 'historico' };
      if (alvo[k] && (alvo[k] !== 'historico' || id)) setTab(alvo[k]);
      else if (k === 'i' && cliente && !inativo && can('partner.deactivate')) setInativar(true);
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
          maxLength={MAX[k]}
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

  const celula = (prefixo: string, i: number, chaveCampo: keyof typeof MAX, valor: string, onChange: (v: string) => void, rotulo: string, extra = '') => {
    const erro = erros[`${prefixo}[${i}].${chaveCampo}`];
    return (
      <td>
        <input
          className={`rp-field${extra}`}
          value={valor}
          maxLength={MAX[chaveCampo]}
          readOnly={somenteLeitura}
          aria-label={`${rotulo} da linha ${i + 1}`}
          aria-invalid={!!erro}
          title={erro}
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
    );
  };

  // Tabela de edição: Ctrl+Insert adiciona uma linha e Ctrl+Delete remove a linha em foco.
  const teclasDaTabela = (lista: 'units', vazia: Unit) => (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') {
      setForm((f) => ({ ...f, [lista]: [...f[lista], { ...vazia }] }));
      return;
    }
    const linha = (e.target as HTMLElement).closest('tr');
    const i = linha ? Array.from(linha.parentElement?.children ?? []).indexOf(linha) : -1;
    setForm((f) => (i >= 0 && i < f[lista].length ? { ...f, [lista]: f[lista].filter((_, j) => j !== i) } : f));
  };

  // Última linha da tabela de edição: clicar (ou Enter) nela cria o item, sem botão "+" no meio da grade.
  const linhaNova = (numero: number, colunas: number, texto: string, criar: () => void) => (
    <tr className="nova">
      <td className="rownum">{numero}</td>
      <td colSpan={colunas} role="button" tabIndex={0} onClick={criar} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), criar())}>
        {texto}
      </td>
    </tr>
  );

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
                {cliente?.supplier && (
                  <>
                    <span className="rp-label rp-link-field">
                      <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir a ficha de fornecedor" title="Abrir a ficha de fornecedor" onClick={() => win.open('supplier', cliente.id)} onKeyDown={(e) => e.key === 'Enter' && win.open('supplier', cliente.id)} />
                      Fornecedor
                    </span>
                    <input className="rp-field rp-field--readonly" readOnly value="Também é fornecedor ativo" aria-label="Fornecedor" />
                  </>
                )}
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
                    <table className={`rp-grid rp-grid--edicao${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`} onKeyDown={teclasDaTabela('units', UNIDADE)}>
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th>
                            Nome <span className="rp-req">*</span>
                          </th>
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
                        {!somenteLeitura && linhaNova(form.units.length + 1, 8, 'Clique para adicionar uma unidade…', () => set({ units: [...form.units, { ...UNIDADE }] }))}
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
                <GradeContatos
                  contatos={form.contacts}
                  onChange={(contacts) => set({ contacts })}
                  somenteLeitura={somenteLeitura}
                  adicao={adicao}
                  erros={erros}
                  titulo="Contatos do cliente"
                />
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do cliente" />
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
            <button type="button" className="rp-btn" onClick={() => setInativar(true)}>
              <span><u>I</u>nativar</span>
            </button>
          )}
        </div>
      </div>

      {inativar && cliente && (
        <DialogoInativar
          rotulo="Inativar cliente"
          texto={`O cliente ${cliente.code} deixa de aparecer na lista de ativos; o histórico é preservado${cliente.supplier ? ' e ele continua fornecedor' : ''}.`}
          idCampo={fid('motivo')}
          onConfirmar={(m) => void confirmarInativacao(m)}
          onCancelar={() => setInativar(false)}
        />
      )}

      {conflito !== null && (
        <DialogoConflito
          rotulo="Cliente alterado por outra pessoa"
          objeto="O cliente"
          versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)}
        />
      )}

      {outroPapel && <DialogoOutroPapel mensagem={outroPapel.mensagem} papel="cliente" onSim={() => void tornarCliente()} onNao={() => setOutroPapel(null)} />}
    </>
  );
}
