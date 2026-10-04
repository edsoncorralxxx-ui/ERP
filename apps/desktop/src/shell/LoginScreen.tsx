import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { LoginResponse, SessionUser } from '../api/types';

const KEY = 'renda.usuario';

function lembrado(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Ilustração da tela de abertura, como no mock: secretária com fone e microfone trabalhando no computador, só com cores dos tokens. */
function Ilustracao() {
  return (
    <svg className="rp-login__arte" viewBox="0 0 232 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustração de uma secretária usando fone com microfone, trabalhando no computador em sua mesa">
      <rect className="a-fundo" x="0" y="0" width="232" height="300" />
      <rect className="a-janela" x="14" y="18" width="204" height="104" />
      <path className="a-caixilho" d="M82 18v104 M150 18v104 M14 70h204" />
      <rect className="a-cadeira" x="104" y="128" width="72" height="104" rx="14" />
      <rect className="a-cadeira-luz" x="104" y="128" width="72" height="10" rx="5" />
      <circle className="a-cabelo" cx="140" cy="84" r="11" />
      <circle className="a-cabelo" cx="140" cy="113" r="26" />
      <rect className="a-pescoco" x="133" y="134" width="14" height="18" />
      <path className="a-roupa" d="M98 232C98 182 112 156 140 152C168 156 182 182 182 232Z" />
      <path className="a-gola" d="M129 152L140 170L151 152Z" />
      <path className="a-dobra" d="M140 170v58" />
      <ellipse className="a-pele" cx="140" cy="118" rx="20" ry="23" />
      <path className="a-cabelo" d="M120 116C119 92 161 92 160 116C153 104 133 101 120 116Z" />
      <circle className="a-olho" cx="133" cy="120" r="1.8" />
      <circle className="a-olho" cx="147" cy="120" r="1.8" />
      <path className="a-sobrancelha" d="M130 115.5q3-2 6 0 M144 115.5q3-2 6 0" />
      <path className="a-boca" d="M134 130Q140 135 146 130" />
      <path className="a-arco" d="M117 116C117 86 163 86 163 116" />
      <rect className="a-fone" x="113" y="110" width="8" height="14" rx="3" />
      <rect className="a-fone" x="159" y="110" width="8" height="14" rx="3" />
      <path className="a-haste" d="M118 124Q120 135 131 135" />
      <circle className="a-microfone" cx="132" cy="135" r="2.6" />
      <rect className="a-mesa" x="0" y="222" width="232" height="78" />
      <rect className="a-tampo" x="0" y="222" width="232" height="10" />
      <path className="a-borda-mesa" d="M0 232h232" />
      <path className="a-roupa" d="M102 182C94 204 100 222 122 226L124 217C113 215 110 204 114 190Z" />
      <path className="a-roupa" d="M178 182C186 204 180 222 158 226L156 217C167 215 170 204 166 190Z" />
      <rect className="a-teclado" x="116" y="222" width="48" height="7" rx="1.5" />
      <ellipse className="a-pele" cx="127" cy="222" rx="6.5" ry="4" />
      <ellipse className="a-pele" cx="153" cy="222" rx="6.5" ry="4" />
      <rect className="a-moldura" x="16" y="146" width="80" height="58" rx="3" />
      <rect className="a-tela" x="20" y="150" width="72" height="50" />
      <rect className="a-titulo" x="20" y="150" width="72" height="7" />
      <rect className="a-faixa" x="20" y="157" width="72" height="1.5" />
      <rect className="a-cadeira" x="20" y="158.5" width="16" height="41.5" />
      <rect className="a-rotulo" x="40" y="163" width="16" height="3" />
      <rect className="a-campo-ativo" x="60" y="162" width="28" height="5" />
      <rect className="a-rotulo" x="40" y="171" width="12" height="3" />
      <rect className="a-campo" x="60" y="170" width="28" height="5" />
      <rect className="a-linha1" x="40" y="180" width="48" height="4" />
      <rect className="a-linha2" x="40" y="184" width="48" height="4" />
      <rect className="a-linha1" x="40" y="188" width="48" height="4" />
      <rect className="a-pe" x="51" y="204" width="10" height="14" />
      <rect className="a-base" x="38" y="216" width="36" height="6" rx="2" />
      <rect className="a-caneca" x="190" y="204" width="16" height="18" rx="2" />
      <path className="a-alca" d="M206 208a4 4 0 0 1 0 9" />
    </svg>
  );
}

type Props = {
  onEnter: (user: SessionUser) => void;
  /** Tela bloqueada ou sessão expirada: o usuário fica fixo e as janelas continuam abertas por trás. */
  lockedUser?: string;
  notice?: string;
};

/**
 * Tela de abertura (Janela de login do design system): barra de título com a faixa dourada, ilustração à esquerda,
 * a marca e os campos à direita, e OK / Sair / Trocar empresa embaixo. Autentica no servidor (ADR-005); a senha
 * não é guardada e o token da sessão fica no processo principal do app.
 */
export function LoginScreen({ onEnter, lockedUser, notice }: Props) {
  const [usuario, setUsuario] = useState(() => lockedUser ?? lembrado());
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(() => lembrado() !== '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoUsuario = useRef<HTMLInputElement>(null);
  const campoSenha = useRef<HTMLInputElement>(null);

  useEffect(() => (usuario ? campoSenha.current : campoUsuario.current)?.focus(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enviando) return;
    const nome = usuario.trim();
    if (!nome || !senha) {
      setErro(!nome ? 'Informe o usuário para entrar (LOGIN-001)' : 'Informe a senha para entrar (LOGIN-002)');
      (!nome ? campoUsuario : campoSenha).current?.focus();
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<LoginResponse>('/api/v1/session', { username: nome, password: senha });
      setSenha('');
      try {
        if (lembrar) localStorage.setItem(KEY, r.data.user.username);
        else localStorage.removeItem(KEY);
      } catch {
        // armazenamento indisponível: segue sem lembrar
      }
      onEnter(r.data.user);
    } catch (err) {
      const x = err as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Confira se ele está ligado e tente de novo (NET-001)' : `${x.message} (${x.code})`);
      setSenha('');
      campoSenha.current?.focus();
    } finally {
      setEnviando(false);
    }
  };

  const sair = () => window.close();

  return (
    <div
      className={`rp rp-login${lockedUser ? ' rp-login--bloqueio' : ''}`}
      onKeyDown={(e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          sair();
        }
      }}
    >
      <div className="rp-window rp-window--login rp-login__janela" role="dialog" aria-modal={lockedUser ? true : undefined} aria-labelledby="login-titulo">
        <div className="rp-titlebar">
          <h1 id="login-titulo" className="rp-login__titulo">Renda+ ERP</h1>
        </div>
        <div className="rp-login__corpo">
          <div className="rp-login__ilustracao">
            <Ilustracao />
          </div>
          <form className="rp-login__form" onSubmit={entrar} noValidate>
            <span className="rp-logo rp-login__marca" aria-label="Renda+ ERP">
              Renda<b>+</b>
              <i>ERP</i>
            </span>
            {notice && (
              <p className="rp-login__nota" role="status">
                <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> {notice}
              </p>
            )}
            <div className="rp-form rp-form--req rp-login__campos">
              <label className="rp-label" htmlFor="login-usuario">Usuário</label>
              <span className="rp-req" aria-hidden="true">*</span>
              <input
                id="login-usuario"
                ref={campoUsuario}
                className={`rp-field${lockedUser ? ' rp-field--readonly' : ''}`}
                autoComplete="username"
                maxLength={60}
                required
                readOnly={!!lockedUser}
                aria-describedby={erro ? 'login-erro' : undefined}
                value={usuario}
                onChange={(e) => (setUsuario(e.target.value), setErro(null))}
              />
              <label className="rp-label" htmlFor="login-senha">Senha</label>
              <span className="rp-req" aria-hidden="true">*</span>
              <input
                id="login-senha"
                ref={campoSenha}
                className="rp-field"
                type="password"
                autoComplete="current-password"
                required
                aria-describedby={erro ? 'login-erro' : undefined}
                value={senha}
                onChange={(e) => (setSenha(e.target.value), setErro(null))}
              />
              {!lockedUser && (
                <>
                  <span />
                  <span />
                  <label className="rp-choice" htmlFor="login-lembrar">
                    <input id="login-lembrar" type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                    Lembrar meu usuário
                  </label>
                </>
              )}
            </div>
            {/* Enter no formulário aciona o OK. */}
            <button type="submit" hidden tabIndex={-1} />
          </form>
        </div>
        {erro && (
          <div id="login-erro" className="rp-status-msg" role="alert">
            {erro}
          </div>
        )}
        <div className="rp-window-foot">
          <span className="rp-login__obrigatorio">
            <span className="rp-req">*</span> Campo obrigatório
          </span>
          <div className="rp-btn-row">
            <button type="button" className="rp-btn rp-btn--default" disabled={enviando} onClick={() => void entrar()}>
              OK
            </button>
            <button type="button" className="rp-btn" onClick={sair}>
              <span><u>S</u>air</span>
            </button>
            <button type="button" className="rp-btn" title="Trocar de empresa" onClick={() => setErro('Só há uma empresa cadastrada neste servidor (LOGIN-003)')}>
              <span><u>T</u>rocar empresa</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
