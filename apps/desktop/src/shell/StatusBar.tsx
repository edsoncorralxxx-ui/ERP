import { useEffect, useState } from 'react';
import type { Connection } from './useConnection';

export type StatusMessage = { tone: 'erro' | 'aviso' | 'sucesso' | 'info'; text: string };

type Props = { connection: Connection; activeTitle: string | null; company: string | null; message: StatusMessage | null; onDismiss: () => void };

/** Linha de mensagem do sistema + Barra de status do sistema (usuário, empresa, conexão, contexto, data, hora, marca). */
export function StatusBar({ connection, activeTitle, company, message, onDismiss }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const online = connection.state === 'online' && connection.status.database === 'UP';
  const connText =
    connection.state === 'checking'
      ? 'Verificando servidor'
      : connection.state === 'offline'
        ? 'Sem conexão — tentando novamente'
        : connection.status.database === 'UP'
          ? `Servidor conectado · ${connection.status.serverVersion}`
          : 'Servidor sem acesso ao banco de dados';

  return (
    <footer className="rp-rodape">
      {message && (
        <div className={`rp-status-msg${message.tone === 'erro' ? '' : ` rp-status-msg--${message.tone}`}`} role={message.tone === 'erro' ? 'alert' : 'status'}>
          {message.text}
          <span className="rp-status-acao" role="button" tabIndex={0} onClick={onDismiss} onKeyDown={(e) => e.key === 'Enter' && onDismiss()}>
            Fechar mensagem
          </span>
        </div>
      )}
      <div className="rp-sysbar" role="status" aria-live="polite">
        <span className="rp-sysbar-slot"><i className="rp-ico rp-ico-usuario" />Usuário local (sem login)</span>
        <span className="rp-sysbar-slot"><i className="rp-ico rp-ico-bancos" />{company ?? 'Empresa não configurada'}</span>
        <span className="rp-sysbar-slot" data-conexao={online ? 'on' : 'off'}>
          {connection.state === 'checking' ? <i className="rp-ico rp-ico-status-processando" /> : <span className={`rp-sysbar-led${online ? '' : ' rp-sysbar-led--off'}`} />}
          {connText}
        </span>
        <span className="rp-sysbar-slot rp-sysbar-slot--grow">{activeTitle ?? ''}</span>
        <span className="rp-sysbar-slot"><i className="rp-ico rp-ico-calendario" />{now.toLocaleDateString('pt-BR')}</span>
        <span className="rp-sysbar-slot">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="rp-logo rp-logo--rodape rp-rodape-marca" aria-label="Renda+ ERP">Renda<b>+</b><i>ERP</i></span>
      </div>
    </footer>
  );
}
