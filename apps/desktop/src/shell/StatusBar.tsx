import type { Connection } from './useConnection';

type Props = { connection: Connection; activeTitle: string | null; message: string | null };

/** Rodapé: estado da conexão, versão do servidor, janela ativa e última mensagem. */
export function StatusBar({ connection, activeTitle, message }: Props) {
  const label =
    connection.state === 'checking'
      ? 'Verificando servidor…'
      : connection.state === 'offline'
        ? 'Sem conexão com o servidor'
        : connection.status.database === 'UP'
          ? `Conectado · servidor ${connection.status.serverVersion}`
          : 'Servidor sem acesso ao banco de dados';
  const tone = connection.state === 'online' && connection.status.database === 'UP' ? 'ok' : connection.state === 'checking' ? 'wait' : 'bad';
  return (
    <footer className="rp-statusbar" role="status" aria-live="polite">
      <span className={`rp-statusbar__conn rp-statusbar__conn--${tone}`}>
        <span className="rp-statusbar__dot" aria-hidden="true" /> {label}
      </span>
      <span className="rp-statusbar__item">{message ?? 'Pronto'}</span>
      <span className="rp-statusbar__spacer" />
      <span className="rp-statusbar__item">{activeTitle ?? 'Nenhuma janela ativa'}</span>
      <span className="rp-statusbar__item">Fourtech · usuário local (sem login)</span>
      <span className="rp-statusbar__brand">Renda+ ERP</span>
    </footer>
  );
}
