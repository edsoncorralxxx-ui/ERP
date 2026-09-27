import { Fragment, useEffect, useState } from 'react';
import { dataHora, hora } from '../format';
import type { Connection } from '../shell/useConnection';
import { useWindow } from '../windows/WindowContext';

type Info = { version: string; serverUrl: string; platform: string };

/** Informações do aplicativo e do servidor conectado. */
export function ServerStatusWindow({ connection }: { connection: Connection }) {
  const win = useWindow();
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    void window.renda?.info().then(setInfo);
  }, []);
  const rows: [string, string][] = [
    ['Aplicativo', info ? `Renda+ ERP ${info.version} (${info.platform})` : 'Renda+ ERP (navegador de desenvolvimento)'],
    ['Servidor', info?.serverUrl ?? 'Mesma origem (proxy de desenvolvimento)'],
    ['Conexão', connection.state === 'online' ? 'Conectado' : connection.state === 'offline' ? 'Sem conexão' : 'Verificando'],
  ];
  if (connection.state === 'online') {
    rows.push(['Versão do servidor', connection.status.serverVersion]);
    rows.push(['Versão da API', connection.status.apiVersion]);
    rows.push(['Banco de dados', connection.status.database === 'UP' ? 'Disponível' : 'Indisponível']);
    rows.push(['Horário do servidor', dataHora(connection.status.serverTime, true)]);
  }
  if (connection.state !== 'checking') rows.push(['Última verificação', hora(connection.checkedAt, true)]);
  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo">
        {/* Valores só de consulta: rótulo à esquerda e campo somente leitura (componente Campo de texto). */}
        <div className="rp-form rp-janela-mdi__form rp-status-servidor">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <label className="rp-label" htmlFor={`${win.windowId}-${k}`}>{k}</label>
              <input id={`${win.windowId}-${k}`} className="rp-field rp-field--readonly" readOnly value={v} />
            </Fragment>
          ))}
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            OK
          </button>
        </div>
      </div>
    </>
  );
}
