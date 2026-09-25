import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { CompanyProfile } from '../api/types';
import { Dialog } from '../shell/Dialog';
import { useWindow } from '../windows/WindowContext';

const PATH = '/api/v1/company-profile';

type Form = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
};

const EMPTY: Form = { legalName: '', tradeName: '', cnpj: '', street: '', number: '', complement: '', district: '', city: '', state: '', postalCode: '', phone: '', email: '' };

function toForm(p: CompanyProfile): Form {
  const a = p.address;
  return {
    legalName: p.legalName ?? '',
    tradeName: p.tradeName ?? '',
    cnpj: p.cnpjFormatted ?? p.cnpj ?? '',
    street: a.street ?? '',
    number: a.number ?? '',
    complement: a.complement ?? '',
    district: a.district ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    postalCode: a.postalCode ? a.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
    phone: p.phone ?? '',
    email: p.email ?? '',
  };
}

function toRequest(f: Form) {
  const v = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    legalName: v(f.legalName),
    tradeName: v(f.tradeName),
    cnpj: v(f.cnpj),
    address: { street: v(f.street), number: v(f.number), complement: v(f.complement), district: v(f.district), city: v(f.city), state: v(f.state), postalCode: v(f.postalCode) },
    phone: v(f.phone),
    email: v(f.email),
  };
}

// Campo do formulário ↔ campo retornado pela API nos detalhes de erro.
const API_FIELD: Record<keyof Form, string> = {
  legalName: 'legalName', tradeName: 'tradeName', cnpj: 'cnpj', street: 'address.street', number: 'address.number',
  complement: 'address.complement', district: 'address.district', city: 'address.city', state: 'address.state',
  postalCode: 'address.postalCode', phone: 'phone', email: 'email',
};

type Tab = 'geral' | 'endereco';

const GERAL: [keyof Form, string, boolean][] = [
  ['legalName', 'Razão social', true],
  ['tradeName', 'Nome fantasia', false],
  ['cnpj', 'CNPJ', false],
  ['phone', 'Telefone', false],
  ['email', 'E-mail', false],
];
const ENDERECO: [keyof Form, string, boolean][] = [
  ['street', 'Logradouro', false],
  ['number', 'Nº', false],
  ['complement', 'Complemento', false],
  ['district', 'Bairro', false],
  ['city', 'Cidade', false],
  ['state', 'UF', false],
  ['postalCode', 'CEP', false],
];

/** Janela "Dados da empresa" (Administração): primeira fatia de ponta a ponta da Sprint 1. */
export function CompanyProfileWindow() {
  const win = useWindow();
  // A API da janela muda de identidade quando o shell re-renderiza; os efeitos de dados não devem reexecutar por isso.
  const winRef = useRef(win);
  winRef.current = win;
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [tab, setTab] = useState<Tab>('geral');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);

  const original = useMemo(() => (profile ? toForm(profile) : EMPTY), [profile]);
  const dirty = useMemo(() => (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== original[k]), [form, original]);
  const adding = profile !== null && !profile.configured;

  useEffect(() => win.setDirty(dirty), [dirty, win]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api.get<CompanyProfile>(PATH);
      setProfile(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setFieldErrors({});
    } catch (e) {
      const err = e as ApiError;
      setLoadError(err.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : err.message);
      winRef.current.notify({ tone: 'erro', text: `${err.message} (${err.code}) [${err.correlationId ?? '—'}]` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formRef = useRef(form);
  formRef.current = form;
  const etagRef = useRef(etag);
  etagRef.current = etag;

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const wasConfigured = profile?.configured ?? false;
      const r = await api.put<CompanyProfile>(PATH, toRequest(formRef.current), etagRef.current);
      setProfile(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setFieldErrors({});
      winRef.current.notify({ tone: 'sucesso', text: `Dados da empresa ${wasConfigured ? 'atualizados' : 'adicionados'} com sucesso (versão ${r.data.version})` });
      return true;
    } catch (e) {
      const err = e as ApiError;
      if (err.isConflict) {
        setConflict(err.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
        winRef.current.notify({ tone: 'aviso', text: `Os dados foram alterados por outra pessoa; nada foi gravado (${err.code}) [${err.correlationId ?? '—'}]` });
      } else if (err.status === 422) {
        const map: Record<string, string> = {};
        err.details.forEach((d) => d.field && (map[d.field] = d.message));
        setFieldErrors(map);
        const onlyAddress = Object.keys(map).length > 0 && Object.keys(map).every((k) => k.startsWith('address.'));
        setTab(onlyAddress ? 'endereco' : 'geral');
        winRef.current.notify({ tone: 'erro', text: `${err.message} (${err.code}) [${err.correlationId ?? '—'}]` });
      } else if (err.isNetwork) {
        winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${err.code})` });
      } else {
        winRef.current.notify({ tone: 'erro', text: `${err.message} (${err.code}) [${err.correlationId ?? '—'}]` });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile]);

  useEffect(() => win.registerCommands({ save: dirty && !saving ? save : undefined }), [dirty, saving, save, win]);

  // Letras de acesso (Alt), Enter no botão padrão e Esc para cancelar.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflict !== null) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'g') setTab('geral');
      else if (k === 'n') setTab('endereco');
      else if (k === 'r') void load();
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && dirty && !saving) {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fields = (list: [keyof Form, string, boolean][]) => (
    <div className={`rp-form rp-form--req rp-janela-mdi__form${adding ? ' rp-form--adicao' : ''}`}>
      {list.map(([key, label, required]) => {
        const error = fieldErrors[API_FIELD[key]];
        const id = `${win.windowId}-${key}`;
        return (
          <Fragment key={key}>
            <label className="rp-label" htmlFor={id}>{label}</label>
            {required ? <span className="rp-req" aria-hidden="true">*</span> : <span />}
            <input
              id={id}
              className={`rp-field${key === 'state' || key === 'postalCode' || key === 'number' ? ' rp-field--curto' : ''}`}
              value={form[key]}
              required={required}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-erro` : undefined}
              disabled={loading}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
            {error && (
              <>
                <span />
                <span />
                <span id={`${id}-erro`} className="rp-campo-erro">
                  <i className="rp-ico rp-ico-status-erro" /> {error}
                </span>
              </>
            )}
          </Fragment>
        );
      })}
    </div>
  );

  const updated = profile?.updatedAt ? `${new Date(profile.updatedAt).toLocaleString('pt-BR')} por ${profile.updatedBy}` : '';

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {loadError ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" /> {loadError}
          </p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho">
              <div className="rp-form">
                <span className="rp-label">Razão social</span>
                <input className="rp-field rp-field--readonly" readOnly value={profile?.legalName ?? ''} aria-label="Razão social atual" />
                <span className="rp-label">CNPJ</span>
                <input className="rp-field rp-field--readonly" readOnly value={profile?.cnpjFormatted ?? ''} aria-label="CNPJ atual" />
              </div>
              <div className="rp-form">
                <span className="rp-label">Situação</span>
                <span>
                  {profile && <span className={`rp-badge ${profile.configured ? 'rp-badge--aprovado' : 'rp-badge--pendente'}`}>{profile.configured ? 'Configurada' : 'Não configurada'}</span>}
                  {dirty && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={profile?.version ?? ''} aria-label="Versão" />
                <span className="rp-label">Atualizado em</span>
                <input className="rp-field rp-field--readonly" readOnly value={updated} aria-label="Atualizado em" />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              <div className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === 'geral'} onClick={() => setTab('geral')} onKeyDown={(e) => e.key === 'Enter' && setTab('geral')}>
                <u>G</u>eral
              </div>
              <div className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === 'endereco'} onClick={() => setTab('endereco')} onKeyDown={(e) => e.key === 'Enter' && setTab('endereco')}>
                E<u>n</u>dereço
              </div>
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {loading ? <p className="rp-janela-mdi__aviso">Carregando</p> : fields(tab === 'geral' ? GERAL : ENDERECO)}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" disabled={!dirty || saving || loading} onClick={() => void save()}>
            {adding ? 'Adicionar' : 'Atualizar'}
          </button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" disabled={loading || saving} onClick={() => void load()}>
            <u>R</u>ecarregar
          </button>
        </div>
      </div>

      {conflict !== null && (
        <Dialog
          icon="aviso"
          label="Dados alterados por outra pessoa"
          onEscape={() => setConflict(null)}
          buttons={[
            {
              label: 'Recarregar',
              primary: true,
              onClick: () => {
                setConflict(null);
                void load();
              },
            },
            { label: 'Continuar editando', onClick: () => setConflict(null) },
          ]}
        >
          Os dados da empresa foram alterados em outra janela ou estação (versão atual {conflict}) e suas alterações não foram gravadas.
          <br />
          Deseja recarregar a versão do servidor? Isso descarta o que você digitou.
        </Dialog>
      )}
    </>
  );
}
