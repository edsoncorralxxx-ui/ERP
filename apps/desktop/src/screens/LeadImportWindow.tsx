import { useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { LeadImport } from '../api/types';
import { dataHora } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { estrelas, PROSPECCOES_ALTERADAS, RENDA } from './comum/Crm';

/**
 * Importar lista de prospecção (CRM, Sprint 11), como a Lista de Fecularias: o arquivo JSON vai ao servidor, que devolve a
 * prévia — linhas, erros (a linha não entra) e avisos de nomes repetidos ou parecidos (entram separadas) — sem cadastrar
 * nada. Confirmar cadastra as prospecções; o mesmo arquivo não carrega duas vezes.
 */
export function LeadImportWindow() {
  const win = useWindow();
  const { can } = useSession();
  const [previa, setPrevia] = useState<LeadImport | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const enviar = async (f: File) => {
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<LeadImport>('/api/v1/lead-imports', { fileName: f.name, content: await f.text() });
      setPrevia(r.data);
      chave.current = novaChave();
      win.notify({ tone: 'info', text: `Prévia da lista ${r.data.fileName}: ${r.data.toLoad} de ${r.data.lineCount} linhas serão carregadas` });
    } catch (e) {
      const x = e as ApiError;
      setErro(x.message);
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!previa || enviando) return;
    setEnviando(true);
    try {
      const r = await api.post<LeadImport>(`/api/v1/lead-imports/${previa.id}/confirmation`, null, { 'Idempotency-Key': chave.current });
      setPrevia(r.data);
      win.notify({ tone: 'sucesso', text: `Lista ${r.data.fileName} carregada com sucesso: ${r.data.createdCodes.length} prospecções adicionadas` });
      window.dispatchEvent(new Event(PROSPECCOES_ALTERADAS));
    } catch (e) {
      const x = e as ApiError;
      if (!x.isNetwork) chave.current = novaChave();
      win.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: x.isNetwork ? `Sem conexão com o servidor; confirme de novo para reenviar a mesma carga (${x.code})` : `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const confirmada = previa?.status === 'CONFIRMADA';
  const fid = `${win.windowId}-arquivo`;
  const problemasDa = (linha: number) => previa?.problems.filter((p) => p.line === linha) ?? [];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-filtros rp-jlista__filtros">
          <label htmlFor={fid}>Lista de prospecção (JSON)</label>
          <input id={fid} className="rp-field" type="file" accept=".json,application/json" disabled={enviando || !can('lead.create')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviar(f);
            }} />
        </div>
        {erro && (
          <p className="rp-janela-mdi__aviso" role="alert">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        )}
        {!previa ? (
          !erro && (
            <p className="rp-tip" role="note">
              Escolha o arquivo com a lista "prospeccoes" (empresa, cidade, uf, possuiRendaMais, estrelas, contato, telefone, email, observacao). Nada é
              cadastrado antes de você confirmar, e empresas com nome parecido nunca são unidas sozinhas.
            </p>
          )
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Arquivo</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Arquivo" value={previa.fileName} />
                <span className="rp-label">Origem</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Origem da lista" value={previa.source ?? ''} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  <span className={`rp-badge${confirmada ? ' rp-badge--aprovado' : ' rp-badge--pendente'}`}>{confirmada ? 'Carregada' : 'Prévia'}</span>
                </span>
                <span className="rp-label">Linhas</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Linhas do arquivo" value={previa.lineCount} />
                <span className="rp-label">Serão carregadas</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Linhas que serão carregadas" value={previa.toLoad} />
                <span className="rp-label">Com erro</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Linhas com erro" value={previa.blocked} />
                <span className="rp-label">Avisos</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Avisos" value={previa.warnings} />
                {confirmada && (
                  <>
                    <span className="rp-label">Carregada em</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Carregada em" value={`${dataHora(previa.confirmedAt)} por ${previa.confirmedBy}`} />
                  </>
                )}
              </div>
            </div>
            <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Linhas da lista">
                <thead>
                  <tr>
                    <th className="rownum">Linha</th>
                    <th>Empresa</th>
                    <th>Cidade / UF</th>
                    <th>Renda+</th>
                    <th>Estrelas</th>
                    <th>Contato</th>
                    <th>Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.lines.map((l) => (
                    <tr key={l.line}>
                      <td className="rownum">{l.line}</td>
                      <td>{l.companyName}</td>
                      <td>{[l.city, l.state].filter(Boolean).join(' / ')}</td>
                      <td>{l.hasRenda ? RENDA[l.hasRenda] : ''}</td>
                      <td>{l.blocked ? '' : estrelas(l.rating)}</td>
                      <td>{[l.contactName, l.contactPhone, l.contactEmail].filter(Boolean).join(' · ')}</td>
                      <td>
                        {problemasDa(l.line).map((p, i) => (
                          <span key={i} className="rp-ficha__ref">
                            <i className={`rp-ico rp-ico-status-${p.severity === 'ERRO' ? 'erro' : 'aviso'}`} aria-hidden="true" />
                            {p.severity === 'ERRO' ? 'Erro' : 'Aviso'}: {p.message}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {previa && !confirmada && can('lead.create') && (
            <button type="button" className="rp-btn rp-btn--default" disabled={enviando || previa.toLoad === 0} onClick={() => void confirmar()}>
              Confirmar carga
            </button>
          )}
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            {confirmada ? 'OK' : 'Cancelar'}
          </button>
        </div>
        {confirmada && (
          <div className="rp-btn-row">
            <button type="button" className="rp-btn" onClick={() => win.open('leads')}>
              Prospecção
            </button>
          </div>
        )}
      </div>
    </>
  );
}
