import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useWindow } from '../windows/WindowContext';

/** Trocar a própria senha: confere a atual; depois todas as sessões do usuário são encerradas, inclusive esta. */
export function ChangePasswordWindow() {
  const win = useWindow();
  const [f, setF] = useState({ atual: '', nova: '', confirma: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);

  const gravar = async () => {
    const e: Record<string, string> = {};
    if (!f.atual) e.currentPassword = 'Informe a senha atual.';
    if (f.nova !== f.confirma) e.confirma = 'A confirmação não confere com a nova senha.';
    setErros(e);
    if (Object.keys(e).length) return;
    setGravando(true);
    try {
      await api.post('/api/v1/session/password', { currentPassword: f.atual, newPassword: f.nova });
      win.notify({ tone: 'sucesso', text: 'Senha alterada com sucesso. Entre de novo com a nova senha' });
      win.requestClose();
      // A troca encerra a sessão atual: a próxima chamada recebe 401 e o app mostra o login por cima.
      void api.get('/api/v1/session').catch(() => undefined);
    } catch (err) {
      const x = err as ApiError;
      const m: Record<string, string> = {};
      x.details.forEach((d) => d.field && (m[d.field] = d.message));
      setErros(m);
      if (!Object.keys(m).length) win.notify({ tone: 'erro', text: `${x.message} (${x.code})` });
    } finally {
      setGravando(false);
    }
  };

  const linha = (k: 'atual' | 'nova' | 'confirma', rotulo: string, erro?: string) => (
    <>
      <label className="rp-label" htmlFor={`${win.windowId}-${k}`}>{rotulo}</label>
      <span className="rp-req" aria-hidden="true">*</span>
      <input
        id={`${win.windowId}-${k}`}
        className="rp-field"
        type="password"
        autoComplete={k === 'atual' ? 'current-password' : 'new-password'}
        value={f[k]}
        aria-invalid={!!erro}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && void gravar()}
      />
      {erro && (
        <>
          <span />
          <span />
          <span className="rp-campo-erro">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </span>
        </>
      )}
    </>
  );

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo">
        <div className="rp-form rp-form--req rp-janela-mdi__form">
          {linha('atual', 'Senha atual', erros.currentPassword)}
          {linha('nova', 'Nova senha', erros.newPassword)}
          {linha('confirma', 'Confirmar nova senha', erros.confirma)}
        </div>
        <p className="rp-tip rp-janela-mdi__nota" role="note">
          A nova senha precisa ter pelo menos 10 caracteres e ser diferente do nome de usuário.
        </p>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando || !f.nova} onClick={() => void gravar()}>
            OK
          </button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
