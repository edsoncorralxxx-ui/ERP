import { useEffect, useState } from 'react';
import type { Connection } from '../shell/useConnection';

type Info = { version: string; serverUrl: string; platform: string };

/** Informações do aplicativo e do servidor conectado. */
export function ServerStatusWindow({ connection }: { connection: Connection }) {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    void window.renda?.info().then(setInfo);
  }, []);
  const rows: [string, string][] = [
    ['Aplicativo', info ? `Renda+ ERP ${info.version} (${info.platform})` : 'Renda+ ERP (modo navegador de desenvolvimento)'],
    ['Servidor', info?.serverUrl ?? 'mesma origem (proxy de desenvolvimento)'],
    ['Conexão', connection.state === 'online' ? 'Conectado' : connection.state === 'offline' ? 'Sem conexão' : 'Verificando…'],
  ];
  if (connection.state === 'online') {
    rows.push(['Versão do servidor', connection.status.serverVersion]);
    rows.push(['Versão da API', connection.status.apiVersion]);
    rows.push(['Banco de dados', connection.status.database === 'UP' ? 'Disponível' : 'Indisponível']);
    rows.push(['Horário do servidor', new Date(connection.status.serverTime).toLocaleString('pt-BR')]);
  }
  if (connection.state !== 'checking') rows.push(['Última verificação', connection.checkedAt.toLocaleTimeString('pt-BR')]);
  return (
    <div className="rp-form">
      <div className="rp-form__body">
        <table className="rp-table rp-table--kv">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
