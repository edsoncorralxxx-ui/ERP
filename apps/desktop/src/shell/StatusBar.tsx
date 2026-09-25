import { useEffect, useState } from 'react';
import type { Connection } from './useConnection';

export type StatusMessage = { tone: 'erro' | 'aviso' | 'sucesso' | 'info'; text: string };
export type LoggedMessage = StatusMessage & { at: Date };

type Props = {
  connection: Connection;
  user: string;
  activeTitle: string | null;
  company: string | null;
  message: StatusMessage | null;
  log: LoggedMessage[];
  onDismiss: () => void;
};

const TONE: Record<StatusMessage['tone'], string> = { erro: 'Erro', aviso: 'Aviso', sucesso: 'Sucesso', info: 'Informação' };
const ICON: Record<StatusMessage['tone'], string> = { erro: 'status-erro', aviso: 'status-aviso', sucesso: 'status-sucesso', info: 'status-info' };

/**
 * Rodapé do aplicativo (componente Rodapé): linha de mensagem, aba do Log de mensagens do sistema com a contagem
 * e oito compartimentos em duas linhas, com a data em cima e a hora embaixo na segunda coluna, e a marca à direita.
 * Clicar na aba abre o log acima dela; o botão de maximizar o faz crescer e o fechar o recolhe.
 */
export function StatusBar({ connection, user, activeTitle, company, message, log, onDismiss }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [logMode, setLogMode] = useState<'fechado' | 'aberto' | 'max'>('fechado');
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sucesso e informação somem após 5 s; erro e aviso ficam até a próxima ação (componente Barra de status).
  useEffect(() => {
    if (!message || message.tone === 'erro' || message.tone === 'aviso') return;
    const t = setTimeout(onDismiss, 5_000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  const online = connection.state === 'online' && connection.status.database === 'UP';
  const connText =
    connection.state === 'checking'
      ? 'Verificando servidor'
      : connection.state === 'offline'
        ? 'Sem conexão'
        : connection.status.database === 'UP'
          ? 'Servidor conectado'
          : 'Servidor sem banco de dados';

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
      <div className="rp-appfoot">
        {logMode !== 'fechado' && (
          <div className={`rp-log rp-rolagem${logMode === 'max' ? ' rp-log--max' : ''}`} role="log" aria-label="Log de mensagens do sistema">
            {log.length === 0 ? (
              <p className="rp-log__vazio">Nenhuma mensagem nesta sessão.</p>
            ) : (
              <table className="rp-grid rp-log__grade">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Tipo</th>
                    <th>Hora</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {[...log].reverse().map((m, i) => (
                    <tr key={`${m.at.getTime()}-${i}`}>
                      <td className="rownum">{log.length - i}</td>
                      <td>
                        <span className="rp-log__tipo">
                          <i className={`rp-ico rp-ico-${ICON[m.tone]}`} aria-hidden="true" />
                          {TONE[m.tone]}
                        </span>
                      </td>
                      <td>{m.at.toLocaleTimeString('pt-BR')}</td>
                      <td>{m.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <div className="rp-logbar">
          <span
            className="rp-status-tab"
            role="button"
            tabIndex={0}
            aria-expanded={logMode !== 'fechado'}
            onClick={() => setLogMode((m) => (m === 'fechado' ? 'aberto' : 'fechado'))}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setLogMode((m) => (m === 'fechado' ? 'aberto' : 'fechado')))}
          >
            Log de mensagens do sistema ({log.length})
          </span>
          <span className="rp-winctl">
            <button type="button" aria-label="Minimizar log" title="Minimizar log" onClick={() => setLogMode('fechado')}>
              &#8211;
            </button>
            <button
              type="button"
              aria-label={logMode === 'max' ? 'Restaurar log' : 'Maximizar log'}
              title={logMode === 'max' ? 'Restaurar log' : 'Maximizar log'}
              onClick={() => setLogMode((m) => (m === 'max' ? 'aberto' : 'max'))}
            >
              &#9633;
            </button>
            <button type="button" aria-label="Fechar log" title="Fechar log" onClick={() => setLogMode('fechado')}>
              &#215;
            </button>
          </span>
        </div>
        <div className="rp-slots rp-slots--marca" role="status" aria-live="polite">
          <span className="rp-slot" title="Usuário">
            <i className="rp-ico rp-ico-usuario" aria-hidden="true" />
            {user}
          </span>
          <span className="rp-slot rp-slot--centro">{now.toLocaleDateString('pt-BR')}</span>
          <span className="rp-slot" title="Empresa">
            <i className="rp-ico rp-ico-bancos" aria-hidden="true" />
            {company ?? 'Empresa não configurada'}
          </span>
          <span className="rp-slot" data-conexao={online ? 'on' : 'off'} title="Conexão com o servidor">
            {connection.state === 'checking' ? <i className="rp-ico rp-ico-status-processando" aria-hidden="true" /> : <span className={`rp-sysbar-led${online ? '' : ' rp-sysbar-led--off'}`} />}
            {connText}
          </span>
          <span className="rp-slot" title="Janela ativa">{activeTitle ?? ''}</span>
          <span className="rp-slot rp-slot--centro">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="rp-slot" title="Versão do servidor">{connection.state === 'online' ? `Servidor ${connection.status.serverVersion}` : ''}</span>
          <span className="rp-slot" title="Versão da API">{connection.state === 'online' ? `API ${connection.status.apiVersion}` : ''}</span>
          <span className="rp-logo rp-logo--rodape rp-rodape-marca" aria-label="Renda+ ERP">
            Renda<b>+</b>
            <i>ERP</i>
          </span>
        </div>
      </div>
    </footer>
  );
}
