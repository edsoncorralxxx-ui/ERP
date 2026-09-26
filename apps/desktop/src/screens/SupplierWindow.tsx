import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { HistoryEntry, ItemCategory, Supplier } from '../api/types';
import { dataHora } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CLIENTES_ALTERADOS } from './CustomersWindow';
import { DialogoConflito, DialogoInativar, DialogoOutroPapel } from './comum/Dialogos';
import { GradeContatos, type Contato } from './comum/GradeContatos';
import { GradeHistorico } from './comum/GradeHistorico';
import { ListaDupla } from './comum/ListaDupla';
import { FORNECEDORES_ALTERADOS } from './SuppliersWindow';

type Tab = 'geral' | 'contatos' | 'historico';
type Form = { legalName: string; tradeName: string; cnpj: string; group: string; leadTimeDays: string; paymentTerms: string; categorias: string[]; contacts: Contato[] };

const VAZIO: Form = { legalName: '', tradeName: '', cnpj: '', group: '', leadTimeDays: '', paymentTerms: '', categorias: [], contacts: [] };
const MAX = { legalName: 200, tradeName: 200, cnpj: 18, group: 100, leadTimeDays: 3, paymentTerms: 200 } as const;

const s = (v: string | null | undefined) => v ?? '';
const n = (v: string) => (v.trim() === '' ? null : v.trim());

function toForm(f: Supplier): Form {
  return {
    legalName: f.legalName,
    tradeName: s(f.tradeName),
    cnpj: s(f.cnpjFormatted ?? f.cnpj),
    group: s(f.group),
    leadTimeDays: f.leadTimeDays === null ? '' : String(f.leadTimeDays),
    paymentTerms: s(f.paymentTerms),
    categorias: f.suppliedCategories.map((c) => c.id),
    contacts: f.contacts.map((c) => ({ id: c.id, name: s(c.name), role: s(c.role), phone: s(c.phone), email: s(c.email) })),
  };
}

/** Prazo digitado: número inteiro vai como número; outro texto vai como está, para o servidor recusar no campo. */
function prazo(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

function toRequest(f: Form) {
  return {
    legalName: n(f.legalName),
    tradeName: n(f.tradeName),
    cnpj: n(f.cnpj),
    group: n(f.group),
    leadTimeDays: prazo(f.leadTimeDays),
    paymentTerms: n(f.paymentTerms),
    suppliedCategoryIds: f.categorias,
    contacts: f.contacts.map((c) => ({ id: c.id, name: n(c.name), role: n(c.role), phone: n(c.phone), email: n(c.email) })),
  };
}

function novaChave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Ficha do fornecedor (formulário "fornecedores" do B01): o mesmo parceiro do cliente, no papel de fornecedor.
 * Cabeçalho sempre visível e abas Geral (prazo, condições, categorias fornecidas), Contatos e Histórico. CNPJ de um
 * cliente já cadastrado não duplica o parceiro: o diálogo oferece torná-lo também fornecedor.
 */
export function SupplierWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [fornecedor, setFornecedor] = useState<Supplier | null>(null);
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
  const [categorias, setCategorias] = useState<ItemCategory[]>([]);
  const chave = useRef(novaChave());

  const adicao = fornecedor === null;
  const inativo = fornecedor?.status === 'INATIVO';
  const somenteLeitura = adicao ? !can('partner.create') : !can('partner.update') || inativo;
  const original = useMemo(() => (fornecedor ? toForm(fornecedor) : VAZIO), [fornecedor]);
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  useEffect(() => {
    api
      .get<ItemCategory[]>('/api/v1/item-categories')
      .then((r) => setCategorias(r.data))
      .catch(() => undefined);
  }, []);

  const aplicar = useCallback((f: Supplier, etagLido?: string) => {
    setFornecedor(f);
    setId(f.id);
    setEtag(etagLido ?? `"${f.version}"`);
    setForm(toForm(f));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(
    async (fid: string) => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const r = await api.get<Supplier>(`/api/v1/suppliers/${fid}`);
        aplicar(r.data, r.etag);
      } catch (e) {
        const x = e as ApiError;
        setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
        winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      } finally {
        setCarregando(false);
      }
    },
    [aplicar],
  );

  useEffect(() => {
    if (id) void carregar(id);
    // Só na abertura: depois a ficha se atualiza pelo que o servidor devolve ao gravar.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'historico' || !id || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/suppliers/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const x = e as ApiError;
    if (x.code === 'PARTNER_OTHER_ROLE') {
      const d = (f: string) => x.details.find((i) => i.field === f)?.message ?? '';
      setOutroPapel({ mensagem: x.message, id: d('partnerId'), versao: d('version') });
      winRef.current.notify({ tone: 'aviso', text: `${x.message} (${x.code})` });
    } else if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      winRef.current.notify({ tone: 'aviso', text: `O fornecedor foi alterado por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.status === 422) {
      const map: Record<string, string> = {};
      x.details.forEach((d) => d.field && (map[d.field] = d.message));
      setErros(map);
      const campos = Object.keys(map);
      if (campos.length && campos.every((k) => k.startsWith('contacts'))) setTab('contatos');
      else setTab('geral');
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.isNetwork) {
      winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${x.code})` });
    } else {
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  const avisarListas = () => {
    window.dispatchEvent(new Event(FORNECEDORES_ALTERADOS));
    window.dispatchEvent(new Event(CLIENTES_ALTERADOS));
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = fornecedor
        ? await api.put<Supplier>(`/api/v1/suppliers/${fornecedor.id}`, body, etag)
        : await api.post<Supplier>('/api/v1/suppliers', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Fornecedor ${r.data.code} ${fornecedor ? 'atualizado' : 'adicionado'} com sucesso` });
      avisarListas();
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [fornecedor, etag, falha, aplicar]);

  const confirmarInativacao = async (motivo: string) => {
    if (!fornecedor) return;
    setInativar(false);
    try {
      const r = await api.post<Supplier>(`/api/v1/suppliers/${fornecedor.id}/deactivate`, { reason: motivo }, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: `Fornecedor ${r.data.code} inativado com sucesso` });
      avisarListas();
    } catch (e) {
      falha(e);
    }
  };

  /** Dá o papel de fornecedor ao parceiro existente (ou o reativa) e mostra a ficha dele nesta janela. */
  const tornarFornecedor = async (alvo: { id: string; versao: string }, mensagem: string) => {
    setOutroPapel(null);
    try {
      const r = await api.post<Supplier>(`/api/v1/suppliers/${alvo.id}/enable`, undefined, { 'If-Match': `"${alvo.versao}"` });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: mensagem.replace('{codigo}', r.data.code) });
      avisarListas();
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || inativar || outroPapel !== null) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { g: 'geral', o: 'contatos', h: 'historico' };
      if (alvo[k] && (alvo[k] !== 'historico' || id)) setTab(alvo[k]);
      else if (k === 'i' && fornecedor && !inativo && can('partner.deactivate')) setInativar(true);
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
  const campo = (k: keyof typeof MAX, rotulo: string, obrigatorio = false, extra = '') => {
    const erro = erros[k];
    return (
      <Fragment key={k}>
        <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
        {obrigatorio ? <span className="rp-req" aria-hidden="true">*</span> : <span />}
        <input
          id={fid(k)}
          className={`rp-field${somenteLeitura ? ' rp-field--readonly' : ''}${extra}`}
          value={form[k]}
          maxLength={MAX[k]}
          inputMode={k === 'leadTimeDays' ? 'numeric' : undefined}
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

  const tabs: [Tab, ReactNode, boolean][] = [
    ['geral', <span><u>G</u>eral</span>, true],
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
                <input className="rp-field rp-field--readonly" readOnly value={fornecedor?.code ?? 'Gerado ao adicionar'} aria-label="Código" />
                {campo('legalName', 'Razão social', true)}
                {campo('tradeName', 'Nome fantasia')}
                {campo('cnpj', 'CNPJ')}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  <span className={`rp-badge ${adicao ? '' : inativo ? 'rp-badge--cancelado' : 'rp-badge--aprovado'}`}>{adicao ? 'Novo' : inativo ? 'Inativo' : 'Ativo'}</span>
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                {fornecedor?.customer && (
                  <>
                    <span className="rp-label rp-link-field">
                      <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir a ficha de cliente" title="Abrir a ficha de cliente" onClick={() => win.open('customer', fornecedor.id)} onKeyDown={(e) => e.key === 'Enter' && win.open('customer', fornecedor.id)} />
                      Cliente
                    </span>
                    <input className="rp-field rp-field--readonly" readOnly value="Também é cliente ativo" aria-label="Cliente" />
                  </>
                )}
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={fornecedor?.version ?? ''} aria-label="Versão" />
                <span className="rp-label">Atualizado em</span>
                <input
                  className="rp-field rp-field--readonly"
                  readOnly
                  value={fornecedor ? `${dataHora(fornecedor.updatedAt ?? fornecedor.createdAt)} por ${fornecedor.updatedBy ?? fornecedor.createdBy}` : ''}
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
                  title={ativo ? undefined : 'Disponível depois de adicionar o fornecedor'}
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
                <div className="rp-ficha__geral">
                  <div className={`rp-form rp-form--req rp-janela-mdi__form${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                    {campo('group', 'Grupo')}
                    {campo('leadTimeDays', 'Prazo de referência (dias)', false, ' rp-field--num rp-field--curto')}
                    {campo('paymentTerms', 'Condições de pagamento')}
                    <span className="rp-label">Cadastrado em</span>
                    <span />
                    <input className="rp-field rp-field--readonly" readOnly value={fornecedor ? `${dataHora(fornecedor.createdAt)} por ${fornecedor.createdBy}` : ''} aria-label="Cadastrado em" />
                    {inativo && (
                      <>
                        <span className="rp-label">Situação</span>
                        <span />
                        <span className="rp-janela-mdi__aviso">
                          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Fornecedor inativo: o histórico é preservado{fornecedor?.customer ? ' e ele continua cliente' : ''}.
                        </span>
                      </>
                    )}
                  </div>
                  <fieldset className="rp-grupo rp-ficha__categorias">
                    <legend>Categorias fornecidas</legend>
                    <div className="rp-grupo-corpo">
                      <ListaDupla
                        disponiveis={categorias.map((c) => ({ id: c.id, nome: c.name, inativa: c.status === 'INATIVO' }))}
                        escolhidas={form.categorias}
                        onChange={(ids) => set({ categorias: ids })}
                        rotulos={['Categorias disponíveis', 'Fornece (na ordem)']}
                        somenteLeitura={somenteLeitura}
                      />
                      {erros.suppliedCategories && (
                        <span className="rp-campo-erro">
                          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.suppliedCategories}
                        </span>
                      )}
                      {categorias.length === 0 && (
                        <p className="rp-janela-mdi__aviso">
                          <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Nenhuma categoria cadastrada. O Administrador inclui categorias em Cadastros → Unidades e categorias.
                        </p>
                      )}
                    </div>
                  </fieldset>
                </div>
              ) : tab === 'contatos' ? (
                <GradeContatos contatos={form.contacts} onChange={(contacts) => set({ contacts })} somenteLeitura={somenteLeitura} adicao={adicao} erros={erros} titulo="Contatos do fornecedor" />
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do fornecedor" />
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
          {fornecedor && inativo && can('partner.update') && (
            <button type="button" className="rp-btn" onClick={() => void tornarFornecedor({ id: fornecedor.id, versao: fornecedor.version }, 'Fornecedor {codigo} reativado com sucesso')}>
              <span><u>R</u>eativar</span>
            </button>
          )}
          {fornecedor && !inativo && can('partner.deactivate') && (
            <button type="button" className="rp-btn" onClick={() => setInativar(true)}>
              <span><u>I</u>nativar</span>
            </button>
          )}
        </div>
      </div>

      {inativar && fornecedor && (
        <DialogoInativar
          rotulo="Inativar fornecedor"
          texto={`O fornecedor ${fornecedor.code} deixa de aparecer na lista de ativos; o histórico é preservado${fornecedor.customer ? ' e ele continua cliente' : ''}.`}
          idCampo={fid('motivo')}
          onConfirmar={(m) => void confirmarInativacao(m)}
          onCancelar={() => setInativar(false)}
        />
      )}

      {conflito !== null && (
        <DialogoConflito
          rotulo="Fornecedor alterado por outra pessoa"
          objeto="O fornecedor"
          versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)}
        />
      )}

      {outroPapel && (
        <DialogoOutroPapel
          mensagem={outroPapel.mensagem}
          papel="fornecedor"
          onSim={() => void tornarFornecedor(outroPapel, 'Parceiro {codigo} agora também é fornecedor')}
          onNao={() => setOutroPapel(null)}
        />
      )}
    </>
  );
}
