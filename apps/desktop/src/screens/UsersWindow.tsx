import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { UserAccount } from '../api/types';
import { Dialog } from '../shell/Dialog';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';

type Form = { username: string; displayName: string; profile: 'ADMINISTRADOR' | 'CONSULTA'; active: boolean; password: string };
const VAZIO: Form = { username: '', displayName: '', profile: 'CONSULTA', active: true, password: '' };
const PERFIL = { ADMINISTRADOR: 'Administrador', CONSULTA: 'Consulta' } as const;

/**
 * Usuários e permissões (Administração, S2-04): lista à esquerda, ficha do usuário à direita. Só o perfil
 * Administrador abre esta janela; o servidor confere de novo (user.admin).
 */
export function UsersWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { user: eu, can } = useSession();
  const [lista, setLista] = useState<UserAccount[] | null>(null);
  const [sel, setSel] = useState<UserAccount | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);
  const [senha, setSenha] = useState<{ valor: string; erro: string | null } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<UserAccount[]>('/api/v1/users');
      setLista(r.data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code})` });
    }
  }, []);

  useEffect(() => {
    if (can('user.admin')) void carregar();
  }, [can, carregar]);

  const escolher = (u: UserAccount | null) => {
    setSel(u);
    setForm(u ? { username: u.username, displayName: u.displayName, profile: u.profile, active: u.active, password: '' } : VAZIO);
    setErros({});
  };

  const original = useMemo<Form>(
    () => (sel ? { username: sel.username, displayName: sel.displayName, profile: sel.profile, active: sel.active, password: '' } : VAZIO),
    [sel],
  );
  const alterado = JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const falha = (e: unknown) => {
    const x = e as ApiError;
    if (x.status === 422) {
      const m: Record<string, string> = {};
      x.details.forEach((d) => d.field && (m[d.field] = d.message));
      setErros(m);
    }
    winRef.current.notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const r = sel
        ? await api.put<UserAccount>(`/api/v1/users/${sel.id}`, { displayName: form.displayName, profile: form.profile, active: form.active }, `"${sel.version}"`)
        : await api.post<UserAccount>('/api/v1/users', form);
      winRef.current.notify({ tone: 'sucesso', text: `Usuário ${r.data.username} ${sel ? 'atualizado' : 'adicionado'} com sucesso` });
      await carregar();
      escolher(r.data);
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [sel, form, carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const redefinir = async () => {
    if (!sel || !senha) return;
    try {
      await api.post<UserAccount>(`/api/v1/users/${sel.id}/password`, { password: senha.valor });
      setSenha(null);
      winRef.current.notify({ tone: 'sucesso', text: `Senha de ${sel.username} redefinida; as sessões dele foram encerradas` });
      await carregar();
    } catch (e) {
      const x = e as ApiError;
      setSenha({ ...senha, erro: x.details[0]?.message ?? x.message });
    }
  };

  const podeGravar = alterado && !gravando;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, novo: () => escolher(null) }), [podeGravar, gravar, win]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('user.admin')) {
    return (
      <div className="rp-window-body rp-janela-mdi__corpo">
        <p className="rp-janela-mdi__aviso">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Seu perfil não permite administrar usuários.
        </p>
      </div>
    );
  }

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

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-usuarios">
        <div className="rp-grid-rolagem rp-rolagem rp-usuarios__lista">
          <table className="rp-grid rp-janela-mdi__grade" aria-label="Usuários">
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>Usuário</th>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {(lista ?? []).map((u, i) => (
                <tr key={u.id} aria-selected={sel?.id === u.id} onClick={() => escolher(u)}>
                  <td className="rownum">{i}</td>
                  <td>{u.username}</td>
                  <td>{u.displayName}</td>
                  <td>{PERFIL[u.profile]}</td>
                  <td>
                    <span className={`rp-badge ${!u.active ? 'rp-badge--cancelado' : u.locked ? 'rp-badge--pendente' : 'rp-badge--aprovado'}`}>
                      {!u.active ? 'Inativo' : u.locked ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <fieldset className="rp-grupo rp-usuarios__ficha">
          <legend>{sel ? `Usuário ${sel.username}` : 'Novo usuário'}</legend>
          <div className={`rp-grupo-corpo rp-form rp-form--req rp-janela-mdi__form${sel ? '' : ' rp-form--adicao'}`}>
            <label className="rp-label" htmlFor={fid('username')}>Usuário</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <input
              id={fid('username')}
              className={`rp-field${sel ? ' rp-field--readonly' : ''}`}
              readOnly={!!sel}
              maxLength={60}
              value={form.username}
              aria-invalid={!!erros.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            {erro('username')}
            <label className="rp-label" htmlFor={fid('displayName')}>Nome</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <input id={fid('displayName')} className="rp-field" maxLength={120} value={form.displayName} aria-invalid={!!erros.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            {erro('displayName')}
            <label className="rp-label" htmlFor={fid('profile')}>Perfil</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <div className="rp-select">
              <select id={fid('profile')} className="rp-field" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value as Form['profile'] })}>
                <option value="ADMINISTRADOR">Administrador — todas as operações</option>
                <option value="CONSULTA">Consulta — só leitura</option>
              </select>
            </div>
            {erro('profile')}
            {!sel && (
              <>
                <label className="rp-label" htmlFor={fid('password')}>Senha inicial</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input id={fid('password')} className="rp-field" type="password" autoComplete="new-password" value={form.password} aria-invalid={!!erros.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                {erro('password')}
              </>
            )}
          </div>
          <p className="rp-tip rp-usuarios__nota" role="note">
            Senha com pelo menos 10 caracteres. Mudar o perfil ou desativar encerra as sessões do usuário.
          </p>
          {/* Estado do registro: rádios empilhados, embaixo à esquerda (componente Opções). */}
          {sel && (
            <div className="rp-usuarios__situacao" role="radiogroup" aria-label="Situação">
              <label className="rp-choice">
                <input type="radio" name={fid('situacao')} checked={form.active} disabled={sel.id === eu.id} onChange={() => setForm({ ...form, active: true })} /> Ativo
              </label>
              <label className="rp-choice">
                <input type="radio" name={fid('situacao')} checked={!form.active} disabled={sel.id === eu.id} onChange={() => setForm({ ...form, active: false })} /> Inativo
              </label>
              {erros.active && (
                <span className="rp-campo-erro">
                  <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.active}
                </span>
              )}
            </div>
          )}
        </fieldset>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
            {sel ? 'Atualizar' : 'Adicionar'}
          </button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={() => escolher(null)}>
            <span><u>N</u>ovo</span>
          </button>
          {sel && (
            <button type="button" className="rp-btn" onClick={() => setSenha({ valor: '', erro: null })}>
              <span><u>R</u>edefinir senha</span>
            </button>
          )}
        </div>
      </div>
      {senha && sel && (
        <Dialog
          icon="info"
          label="Redefinir senha"
          onEscape={() => setSenha(null)}
          buttons={[
            { label: 'Redefinir', primary: true, onClick: () => void redefinir() },
            { label: 'Cancelar', onClick: () => setSenha(null) },
          ]}
        >
          Nova senha para {sel.username}. O bloqueio por tentativas é liberado e as sessões dele são encerradas.
          <br />
          <div className="rp-form rp-msgbox__form">
            <label className="rp-label" htmlFor={fid('nova-senha')}>Nova senha</label>
            <input id={fid('nova-senha')} className="rp-field" type="password" autoComplete="new-password" value={senha.valor} aria-invalid={!!senha.erro} onChange={(e) => setSenha({ valor: e.target.value, erro: null })} />
          </div>
          {senha.erro && (
            <span className="rp-campo-erro">
              <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {senha.erro}
            </span>
          )}
        </Dialog>
      )}
    </>
  );
}
