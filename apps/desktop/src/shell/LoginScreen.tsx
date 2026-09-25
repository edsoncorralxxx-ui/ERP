import { useEffect, useRef, useState, type FormEvent } from 'react';

const KEY = 'renda.usuario';

function lembrado(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Ilustração da tela de abertura: estação de trabalho com o Renda+ ERP no monitor, só com cores dos tokens. */
function Ilustracao() {
  return (
    <svg className="rp-login__arte" viewBox="0 0 232 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Estação de trabalho com o Renda+ ERP aberto no monitor">
      <rect className="a-fundo" x="0" y="0" width="232" height="300" />
      <rect className="a-janela" x="14" y="18" width="204" height="104" />
      <path className="a-caixilho" d="M82 18v104 M150 18v104 M14 70h204" />
      <rect className="a-mesa" x="0" y="214" width="232" height="86" />
      <rect className="a-tampo" x="0" y="206" width="232" height="10" />
      <rect className="a-moldura" x="36" y="112" width="160" height="98" rx="4" />
      <rect className="a-tela" x="42" y="118" width="148" height="84" />
      <rect className="a-titulo" x="42" y="118" width="148" height="10" />
      <rect className="a-faixa" x="42" y="128" width="148" height="2" />
      <rect className="a-menu" x="42" y="130" width="30" height="72" />
      <path className="a-menu-linhas" d="M42 140h30 M42 150h30 M42 160h30 M42 170h30" />
      <rect className="a-rotulo" x="80" y="138" width="26" height="4" />
      <rect className="a-campo-ativo" x="112" y="136" width="66" height="8" />
      <rect className="a-rotulo" x="80" y="150" width="20" height="4" />
      <rect className="a-campo" x="112" y="148" width="66" height="8" />
      <rect className="a-grade" x="80" y="162" width="98" height="30" />
      <path className="a-grade-linhas" d="M80 172h98 M80 182h98 M110 162v30" />
      <rect className="a-botao" x="80" y="195" width="20" height="5" />
      <rect className="a-pe" x="106" y="210" width="20" height="10" />
      <rect className="a-base" x="92" y="218" width="48" height="5" rx="2" />
      <rect className="a-teclado" x="70" y="232" width="92" height="12" rx="2" />
      <rect className="a-caneca" x="184" y="222" width="18" height="20" rx="2" />
      <path className="a-alca" d="M202 226a5 5 0 0 1 0 11" />
      <rect className="a-vaso" x="22" y="224" width="22" height="20" rx="2" />
      <path className="a-folhas" d="M33 224c-10-14-4-26 0-30c4 4 10 16 0 30z M33 224c-14-4-18-14-16-20c6 0 16 6 16 20z M33 224c14-4 18-14 16-20c-6 0-16 6-16 20z" />
    </svg>
  );
}

type Props = { onEnter: (user: string) => void };

/**
 * Tela de abertura (Janela de login do design system): barra de título com a faixa dourada, ilustração à esquerda,
 * a marca e os campos à direita, e OK / Sair / Trocar empresa embaixo.
 * A autenticação no servidor entra com o módulo de usuários; por enquanto o nome informado identifica a sessão local.
 */
export function LoginScreen({ onEnter }: Props) {
  const [usuario, setUsuario] = useState(lembrado);
  const [lembrar, setLembrar] = useState(() => lembrado() !== '');
  const [erro, setErro] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  const entrar = (e?: FormEvent) => {
    e?.preventDefault();
    const nome = usuario.trim();
    if (!nome) {
      setErro(true);
      campo.current?.focus();
      return;
    }
    try {
      if (lembrar) localStorage.setItem(KEY, nome);
      else localStorage.removeItem(KEY);
    } catch {
      // armazenamento indisponível: segue sem lembrar
    }
    onEnter(nome);
  };

  return (
    <div className="rp rp-login">
      <div className="rp-window rp-window--login rp-login__janela" role="dialog" aria-labelledby="login-titulo">
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
            <div className="rp-form rp-form--req rp-login__campos">
              <label className="rp-label" htmlFor="login-usuario">Usuário</label>
              <span className="rp-req" aria-hidden="true">*</span>
              <input
                id="login-usuario"
                ref={campo}
                className="rp-field"
                autoComplete="username"
                required
                aria-invalid={erro}
                aria-describedby={erro ? 'login-erro' : 'login-nota'}
                value={usuario}
                onChange={(e) => (setUsuario(e.target.value), setErro(false))}
              />
              <label className="rp-label" htmlFor="login-senha">Senha</label>
              <span className="rp-req" aria-hidden="true">*</span>
              <input id="login-senha" className="rp-field rp-field--readonly" type="password" autoComplete="current-password" disabled title="A senha passa a ser exigida com o módulo de usuários" />
              <span />
              <span />
              <label className="rp-login__lembrar" htmlFor="login-lembrar">
                <input id="login-lembrar" type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                Lembrar meu usuário
              </label>
            </div>
            <p id="login-nota" className="rp-login__nota">
              <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> Sessão local: a autenticação no servidor entra com o módulo de usuários.
            </p>
            {/* Enter no formulário aciona o OK. */}
            <button type="submit" hidden tabIndex={-1} />
          </form>
        </div>
        {erro && (
          <div id="login-erro" className="rp-status-msg" role="alert">
            Informe o usuário para entrar (LOGIN-001)
          </div>
        )}
        <div className="rp-window-foot">
          <span className="rp-login__obrigatorio">
            <span className="rp-req">*</span> Campo obrigatório
          </span>
          <div className="rp-btn-row">
            <button type="button" className="rp-btn rp-btn--default" onClick={() => entrar()}>
              OK
            </button>
            <button type="button" className="rp-btn" onClick={() => window.close()}>
              <u>S</u>air
            </button>
            <button type="button" className="rp-btn" disabled title="Disponível quando houver mais de uma empresa cadastrada">
              <u>T</u>rocar empresa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
