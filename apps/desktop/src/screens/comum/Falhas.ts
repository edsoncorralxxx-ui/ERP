import type { ApiError } from '../../api/client';
import type { StatusMessage } from '../../shell/StatusBar';

/**
 * Tratamento comum das falhas de gravação nas fichas: conflito de versão abre o diálogo; 422 marca os campos; 409
 * (situação não permite) e demais erros vão para a barra de status com código e id; sem conexão, o que foi digitado fica.
 */
export function tratarFalha(e: unknown, o: {
  objeto: string;
  notify: (m: StatusMessage) => void;
  setErros: (m: Record<string, string>) => void;
  setConflito: (versao: string) => void;
}): Record<string, string> | null {
  const x = e as ApiError;
  if (x.isConflict) {
    o.setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
    o.notify({ tone: 'aviso', text: `${o.objeto} foi alterado por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
    return null;
  }
  if (x.isNetwork) {
    o.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${x.code})` });
    return null;
  }
  if (x.status === 422) {
    const map: Record<string, string> = {};
    x.details.forEach((d) => d.field && (map[d.field] = d.message));
    o.setErros(map);
    const detalhe = x.details.find((d) => d.field === 'installments' || d.field === 'effects' || d.field === 'unitId')?.message;
    o.notify({ tone: 'erro', text: `${detalhe && x.message !== detalhe ? `${x.message} ${detalhe}` : x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    return map;
  }
  o.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
  return null;
}
