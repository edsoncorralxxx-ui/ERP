import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CustomerSummary } from '../api/types';
import { numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';

/** Avisado pela ficha do cliente depois de gravar, para as listas abertas se atualizarem. */
export const CLIENTES_ALTERADOS = 'renda:clientes-alterados';

type Situacao = 'ATIVO' | 'INATIVO' | 'TODOS';

let novos = 0;
/** Chave de uma janela de cliente novo: cada "Novo" abre uma ficha própria. */
export const novoCliente = () => `novo-${++novos}`;

/**
 * Janela de lista "Clientes e unidades" (componente Janela, variante lista): busca, grade com a seta que abre a
 * ficha, rodapé com Cancelar e Novo à esquerda e o funil de filtro no canto direito.
 */
export function CustomersWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const podeCriar = can('partner.create');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('ATIVO');
  const [local, setLocal] = useState('');
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [linhas, setLinhas] = useState<CustomerSummary[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const carregar = useCallback(async (termo: string, sit: Situacao) => {
    try {
      const q = new URLSearchParams({ status: sit });
      if (termo.trim()) q.set('search', termo.trim());
      const r = await api.get<CustomerSummary[]>(`/api/v1/customers?${q.toString()}`);
      setLinhas(r.data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. A lista volta quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.isNetwork ? 'Sem conexão com o servidor' : x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  // Busca com uma pequena espera enquanto se digita.
  useEffect(() => {
    const t = setTimeout(() => void carregar(busca, situacao), 250);
    return () => clearTimeout(t);
  }, [busca, situacao, carregar]);

  useEffect(() => {
    const recarrega = () => void carregar(busca, situacao);
    window.addEventListener(CLIENTES_ALTERADOS, recarrega);
    return () => window.removeEventListener(CLIENTES_ALTERADOS, recarrega);
  }, [busca, situacao, carregar]);

  const novo = useMemo(() => (podeCriar ? () => winRef.current.open('customer', novoCliente()) : undefined), [podeCriar]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);

  const abrir = (id: string) => win.open('customer', id);
  const visiveis = useMemo(() => {
    const f = local.trim().toLowerCase();
    return (linhas ?? []).filter((l) => !f || `${l.city ?? ''}/${l.state ?? ''}`.toLowerCase().includes(f));
  }, [linhas, local]);
  const filtrado = situacao !== 'ATIVO' || local.trim() !== '';
  const limpar = () => {
    setSituacao('ATIVO');
    setLocal('');
  };

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-jlista">
        {/* Faixa de filtros (componente Barra de filtros): a busca e, à direita, a marca de cada filtro aplicado. */}
        <div className="rp-filtros rp-jlista__filtros">
          <label>
            Localizar
            <input
              className="rp-field rp-jlista__busca"
              type="search"
              placeholder="Código, razão social, nome fantasia ou CNPJ"
              maxLength={200}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
          </label>
          {filtrado && (
            <button type="button" className="rp-btn" onClick={limpar}>
              <u>L</u>impar
            </button>
          )}
          <div className="rp-filtros-dir">
            {situacao !== 'ATIVO' && (
              <span className="rp-chip">
                <b>Situação:</b> {situacao === 'INATIVO' ? 'Inativos' : 'Todos'}
                <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de situação" onClick={() => setSituacao('ATIVO')} onKeyDown={(e) => e.key === 'Enter' && setSituacao('ATIVO')}>
                  &times;
                </i>
              </span>
            )}
            {local.trim() !== '' && (
              <span className="rp-chip">
                <b>Cidade / UF:</b> {local.trim()}
                <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de cidade" onClick={() => setLocal('')} onKeyDown={(e) => e.key === 'Enter' && setLocal('')}>
                  &times;
                </i>
              </span>
            )}
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        ) : (
          <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
            <table className="rp-grid rp-janela-mdi__grade" aria-label="Clientes">
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th aria-label="Abrir" />
                  <th>Código</th>
                  <th>Razão social</th>
                  <th>Nome fantasia</th>
                  <th>CNPJ</th>
                  <th>Cidade / UF</th>
                  <th className="num">Unidades</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c, i) => (
                  <tr
                    key={c.id}
                    aria-selected={sel === c.id}
                    onClick={() => setSel(c.id)}
                    onDoubleClick={() => abrir(c.id)}
                  >
                    <td className="rownum">{i}</td>
                    <td>
                      <span
                        className="rp-link"
                        role="link"
                        tabIndex={0}
                        aria-label={`Abrir ${c.legalName}`}
                        title={`Abrir ${c.legalName}`}
                        onClick={() => abrir(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && abrir(c.id)}
                      />
                    </td>
                    <td>{c.code}</td>
                    <td>{c.legalName}</td>
                    <td>{c.tradeName ?? ''}</td>
                    <td>{c.cnpjFormatted ?? ''}</td>
                    <td>{c.city ? `${c.city}${c.state ? ` / ${c.state}` : ''}` : ''}</td>
                    <td className="num">{c.units}</td>
                    <td>
                      <span className={`rp-badge ${c.status === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>
                        {c.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas !== null && visiveis.length === 0 && (
              <p className="rp-jlista__vazio">
                {busca || filtrado ? 'Nenhum cliente atende à busca e aos filtros.' : 'Nenhum cliente cadastrado ainda.'}
              </p>
            )}
          </div>
        )}
        {!erro && (
          <div className="rp-pag rp-jlista__pag">
            <span className="rp-pag-info" role="status">
              {linhas === null
                ? 'Carregando'
                : visiveis.length === 0
                  ? 'Nenhum registro'
                  : `1 a ${numero(visiveis.length)} de ${numero(visiveis.length)} ${visiveis.length === 1 ? 'registro' : 'registros'}`}
            </span>
          </div>
        )}
      </div>
      <div className="rp-lista-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            Cancelar
          </button>
          {podeCriar && (
            <button type="button" className="rp-btn" onClick={novo}>
              <span><u>N</u>ovo</span>
            </button>
          )}
        </div>
        <button
          type="button"
          className="rp-funil"
          title="Filtrar tabela"
          aria-label="Filtrar tabela"
          aria-haspopup="dialog"
          aria-pressed={filtrado}
          onClick={() => setFiltroAberto((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12l-4.6 5.4V13l-2.8 1.4V8.4z" fill="none" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {filtroAberto && (
        <div className="rp-window rp-jlista__filtro" role="dialog" aria-label="Filtrar tabela">
          <div className="rp-titlebar">
            <span>Filtrar tabela</span>
            <span className="rp-winbtns">
              <span role="button" tabIndex={0} aria-label="Fechar" onClick={() => setFiltroAberto(false)} onKeyDown={(e) => e.key === 'Enter' && setFiltroAberto(false)}>
                ×
              </span>
            </span>
          </div>
          <div className="rp-window-body">
            <div className="rp-form">
              <label className="rp-label" htmlFor={`${win.windowId}-situacao`}>Situação</label>
              <div className="rp-select">
                <select id={`${win.windowId}-situacao`} className="rp-field" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
                  <option value="ATIVO">Ativos</option>
                  <option value="INATIVO">Inativos</option>
                  <option value="TODOS">Todos</option>
                </select>
              </div>
              <label className="rp-label" htmlFor={`${win.windowId}-local`}>Cidade / UF</label>
              <input id={`${win.windowId}-local`} className="rp-field" maxLength={100} value={local} onChange={(e) => setLocal(e.target.value)} />
            </div>
          </div>
          <div className="rp-window-foot">
            <div className="rp-btn-row">
              <button type="button" className="rp-btn rp-btn--default" onClick={() => setFiltroAberto(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
