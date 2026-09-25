import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Janela "Dados da empresa" (Configurações): primeira fatia de ponta a ponta da Sprint 1. */
export function CompanyProfileWindow() {
  const win = useWindow();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [etag, setEtag] = useState<string>('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [tab, setTab] = useState<Tab>('geral');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'error' | 'ok' | 'warn'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);

  const original = useMemo(() => (profile ? toForm(profile) : EMPTY), [profile]);
  const dirty = useMemo(() => (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== original[k]), [form, original]);

  useEffect(() => win.setDirty(dirty), [dirty, win]);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const r = await api.get<CompanyProfile>(PATH);
      setProfile(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setFieldErrors({});
    } catch (e) {
      const err = e as ApiError;
      setBanner({ tone: 'error', text: err.isNetwork ? 'Sem conexão com o servidor. Tente novamente quando a conexão voltar.' : err.message });
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
    setBanner(null);
    try {
      const r = await api.put<CompanyProfile>(PATH, toRequest(formRef.current), etagRef.current);
      setProfile(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setForm(toForm(r.data));
      setFieldErrors({});
      setBanner({ tone: 'ok', text: `Dados salvos (versão ${r.data.version}).` });
      win.notify('Dados da empresa salvos.');
      return true;
    } catch (e) {
      const err = e as ApiError;
      if (err.isConflict) {
        const current = err.details.find((d) => d.field === 'version')?.message.replace('atual=', '');
        setConflict(current ?? '?');
      } else if (err.status === 422) {
        const map: Record<string, string> = {};
        err.details.forEach((d) => d.field && (map[d.field] = d.message));
        setFieldErrors(map);
        const addressError = Object.keys(map).some((k) => k.startsWith('address.'));
        const generalError = Object.keys(map).some((k) => !k.startsWith('address.'));
        if (addressError && !generalError) setTab('endereco');
        if (generalError) setTab('geral');
        setBanner({ tone: 'error', text: err.message });
      } else if (err.isNetwork) {
        setBanner({ tone: 'warn', text: 'Sem conexão com o servidor. Suas alterações continuam nesta janela; salve quando a conexão voltar.' });
      } else {
        setBanner({ tone: 'error', text: `${err.message} (código de correlação ${err.correlationId ?? '—'})` });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [win]);

  useEffect(() => win.registerCommands({ save: dirty && !saving ? save : undefined }), [dirty, saving, save, win]);

  const field = (key: keyof Form, label: string, opts: { required?: boolean; width?: 'sm' | 'md' | 'lg'; inputMode?: 'numeric' | 'email' | 'tel' } = {}) => {
    const error = fieldErrors[API_FIELD[key]];
    const id = `${win.windowId}-${key}`;
    return (
      <div className={`rp-field rp-field--${opts.width ?? 'md'}`}>
        <label htmlFor={id}>
          {label}
          {opts.required && <span className="rp-field__req" aria-label="obrigatório"> *</span>}
        </label>
        <input
          id={id}
          value={form[key]}
          inputMode={opts.inputMode}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          disabled={loading}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
        {error && (
          <span id={`${id}-err`} className="rp-field__error">
            ⚠ {error}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="rp-form">
      <header className="rp-form__header">
        <div className="rp-form__header-left">
          <div className="rp-form__label">Razão social</div>
          <div className="rp-form__value">{profile?.legalName || 'Não informada'}</div>
          <div className="rp-form__label">CNPJ</div>
          <div className="rp-form__value">{profile?.cnpjFormatted || 'Não informado'}</div>
        </div>
        <div className="rp-form__header-right">
          <div className="rp-form__label">Situação</div>
          <div className="rp-form__value">{profile ? (profile.configured ? 'Configurada' : 'Não configurada') : '—'}</div>
          <div className="rp-form__label">Versão</div>
          <div className="rp-form__value">{profile?.version ?? '—'}</div>
          <div className="rp-form__label">Atualizado em</div>
          <div className="rp-form__value">
            {profile?.updatedAt ? `${new Date(profile.updatedAt).toLocaleString('pt-BR')} por ${profile.updatedBy}` : '—'}
          </div>
        </div>
      </header>

      {banner && (
        <div className={`rp-banner rp-banner--${banner.tone}`} role={banner.tone === 'ok' ? 'status' : 'alert'}>
          {banner.text}
        </div>
      )}

      <div className="rp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'geral'} className={tab === 'geral' ? 'is-active' : ''} onClick={() => setTab('geral')}>
          Geral
        </button>
        <button type="button" role="tab" aria-selected={tab === 'endereco'} className={tab === 'endereco' ? 'is-active' : ''} onClick={() => setTab('endereco')}>
          Endereço
        </button>
      </div>

      <div className="rp-form__body" role="tabpanel">
        {loading ? (
          <p className="rp-muted">Carregando…</p>
        ) : tab === 'geral' ? (
          <div className="rp-grid">
            {field('legalName', 'Razão social', { required: true, width: 'lg' })}
            {field('tradeName', 'Nome fantasia', { width: 'lg' })}
            {field('cnpj', 'CNPJ', { width: 'md' })}
            {field('phone', 'Telefone', { width: 'md', inputMode: 'tel' })}
            {field('email', 'E-mail', { width: 'lg', inputMode: 'email' })}
          </div>
        ) : (
          <div className="rp-grid">
            {field('street', 'Logradouro', { width: 'lg' })}
            {field('number', 'Número', { width: 'sm' })}
            {field('complement', 'Complemento', { width: 'md' })}
            {field('district', 'Bairro', { width: 'md' })}
            {field('city', 'Cidade', { width: 'md' })}
            {field('state', 'UF', { width: 'sm' })}
            {field('postalCode', 'CEP', { width: 'sm', inputMode: 'numeric' })}
          </div>
        )}
      </div>

      <footer className="rp-form__actions">
        <div>
          <button type="button" className="rp-button rp-button--primary" disabled={!dirty || saving || loading} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="rp-button" onClick={win.requestClose}>
            Fechar
          </button>
        </div>
        <div>
          <button type="button" className="rp-button" disabled={loading || saving} onClick={() => void load()}>
            Recarregar
          </button>
        </div>
      </footer>

      {conflict !== null && (
        <Dialog
          title="Dados alterados por outra pessoa"
          onEscape={() => setConflict(null)}
          buttons={[
            { label: 'Continuar editando', onClick: () => setConflict(null) },
            {
              label: 'Recarregar do servidor',
              primary: true,
              onClick: () => {
                setConflict(null);
                void load();
              },
            },
          ]}
        >
          <p>
            Estes dados foram alterados em outra janela ou estação (versão atual {conflict}). Suas alterações <strong>não</strong> foram gravadas.
          </p>
          <p>Recarregar descarta o que você digitou e mostra a versão do servidor.</p>
        </Dialog>
      )}
    </div>
  );
}
