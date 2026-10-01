import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { numero } from '../../format';
import { useWindow } from '../../windows/WindowContext';
import { Selecao } from './Selecao';

/** Situação filtrada no servidor: ATIVO, INATIVO ou TODOS nos cadastros; cada documento tem as suas. */
export type Situacao = string;

export type OpcaoSituacao = { valor: string; rotulo: string };

const SITUACOES_CADASTRO: OpcaoSituacao[] = [
  { valor: 'ATIVO', rotulo: 'Ativos' },
  { valor: 'INATIVO', rotulo: 'Inativos' },
  { valor: 'TODOS', rotulo: 'Todos' },
];

const seloCadastro = (status: string) => (
  <span className={`rp-badge ${status === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{status === 'ATIVO' ? 'Ativo' : 'Inativo'}</span>
);

export type Coluna<T> = { titulo: string; num?: boolean; valor: (linha: T) => ReactNode };

/** Filtro a mais na janela Filtrar tabela, aplicado na lista carregada; aparece como marca na barra de filtros. */
export type FiltroExtra<T> = {
  chave: string;
  rotulo: string;
  /** Opções fixas viram Seleção; sem opções, campo de texto. */
  opcoes?: { valor: string; rotulo: string }[];
  max?: number;
  testa: (linha: T, valor: string) => boolean;
};

type Props<T extends { id: string; status?: string }> = {
  /** Nome no singular e no plural, para a contagem e as mensagens ("cliente", "clientes"). */
  nome: [string, string];
  /** Rótulo acessível da grade. */
  rotulo: string;
  placeholder: string;
  colunas: Coluna<T>[];
  filtros?: FiltroExtra<T>[];
  carregar: (busca: string, situacao: Situacao) => Promise<T[]>;
  /** Evento global que pede para recarregar (as fichas avisam depois de gravar). */
  evento: string;
  /** Outros eventos que também pedem para recarregar (ex.: notas alteradas mudam a receita das competências). */
  eventos?: string[];
  /**
   * Abre a ficha da linha; `sequencia` são os ids da lista como está na tela (busca, situação e filtros aplicados), para
   * a ficha andar pelo registro anterior e pelo próximo.
   */
  abrir: (id: string, sequencia: string[]) => void;
  /** Rótulo acessível da seta de cada linha. */
  rotuloLinha: (linha: T) => string;
  novo?: () => void;
  /** Situações do filtro; a primeira é a padrão. Sem elas, Ativos, Inativos e Todos. */
  situacoes?: OpcaoSituacao[];
  /** Nome do filtro do servidor na janela Filtrar tabela e na barra de filtros (padrão: Situação; ex.: Ano). */
  rotuloSituacao?: string;
  /** Selo da coluna Situação; sem ele, Ativo ou Inativo. */
  selo?: (linha: T) => ReactNode;
  /** Totaliza a lista visível no rodapé (ex.: soma em reais). */
  total?: (linhas: T[]) => ReactNode;
  /** Botões a mais embaixo, depois do Novo (ex.: Importar BOM). */
  acoes?: ReactNode;
};

/**
 * Janela de lista do design system (componente Janela, variante lista): Barra de filtros com a busca e as marcas dos
 * filtros aplicados, grade com a seta que abre a ficha (numeração a partir de 0), a contagem no padrão da Paginação,
 * Cancelar e Novo embaixo à esquerda e o funil de filtro no canto direito.
 */
export function JanelaLista<T extends { id: string; status?: string }>(p: Props<T>) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const carregarRef = useRef(p.carregar);
  carregarRef.current = p.carregar;
  const [busca, setBusca] = useState('');
  const situacoes = p.situacoes ?? SITUACOES_CADASTRO;
  const padrao = situacoes[0].valor;
  const [situacao, setSituacao] = useState<Situacao>(padrao);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [linhas, setLinhas] = useState<T[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const recarregar = useCallback(async (termo: string, sit: Situacao) => {
    try {
      setLinhas(await carregarRef.current(termo.trim(), sit));
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. A lista volta quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.isNetwork ? 'Sem conexão com o servidor' : x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  // Busca com uma pequena espera enquanto se digita.
  useEffect(() => {
    const t = setTimeout(() => void recarregar(busca, situacao), 250);
    return () => clearTimeout(t);
  }, [busca, situacao, recarregar]);

  const eventos = [p.evento, ...(p.eventos ?? [])].join('|');
  useEffect(() => {
    const r = () => void recarregar(busca, situacao);
    const nomes = eventos.split('|');
    nomes.forEach((n) => window.addEventListener(n, r));
    return () => nomes.forEach((n) => window.removeEventListener(n, r));
  }, [busca, situacao, recarregar, eventos]);

  useEffect(() => win.registerCommands({ novo: p.novo }), [p.novo, win]);

  const filtros = p.filtros ?? [];
  const visiveis = useMemo(
    () => (linhas ?? []).filter((l) => filtros.every((f) => !extras[f.chave]?.trim() || f.testa(l, extras[f.chave].trim()))),
    [linhas, extras, filtros],
  );
  const ativos = filtros.filter((f) => extras[f.chave]?.trim());
  const filtrado = situacao !== padrao || ativos.length > 0;
  const limpar = () => {
    setSituacao(padrao);
    setExtras({});
  };
  const valorDoFiltro = (f: FiltroExtra<T>) => f.opcoes?.find((o) => o.valor === extras[f.chave])?.rotulo ?? extras[f.chave].trim();
  const [um, varios] = p.nome;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-jlista">
        {/* Faixa de filtros (componente Barra de filtros): a busca e, à direita, a marca de cada filtro aplicado. */}
        <div className="rp-filtros rp-jlista__filtros">
          <label>
            Localizar
            <input className="rp-field rp-jlista__busca" type="search" placeholder={p.placeholder} maxLength={200} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          </label>
          {filtrado && (
            <button type="button" className="rp-btn" onClick={limpar}>
              <u>L</u>impar
            </button>
          )}
          <div className="rp-filtros-dir">
            {situacao !== padrao && (
              <span className="rp-chip">
                <b>{p.rotuloSituacao ?? 'Situação'}:</b> {situacoes.find((o) => o.valor === situacao)?.rotulo ?? situacao}
                <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de situação" onClick={() => setSituacao(padrao)} onKeyDown={(e) => e.key === 'Enter' && setSituacao(padrao)}>
                  &times;
                </i>
              </span>
            )}
            {ativos.map((f) => (
              <span key={f.chave} className="rp-chip">
                <b>{f.rotulo}:</b> {valorDoFiltro(f)}
                <i
                  className="x"
                  role="button"
                  tabIndex={0}
                  title="Remover"
                  aria-label={`Remover o filtro ${f.rotulo}`}
                  onClick={() => setExtras((x) => ({ ...x, [f.chave]: '' }))}
                  onKeyDown={(e) => e.key === 'Enter' && setExtras((x) => ({ ...x, [f.chave]: '' }))}
                >
                  &times;
                </i>
              </span>
            ))}
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        ) : (
          <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
            <table className="rp-grid rp-janela-mdi__grade" aria-label={p.rotulo}>
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th aria-label="Abrir" />
                  {p.colunas.map((c) => (
                    <th key={c.titulo} className={c.num ? 'num' : undefined}>
                      {c.titulo}
                    </th>
                  ))}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, i) => (
                  <tr key={l.id} aria-selected={sel === l.id} onClick={() => setSel(l.id)} onDoubleClick={() => p.abrir(l.id, visiveis.map((v) => v.id))}>
                    <td className="rownum">{i}</td>
                    <td>
                      <span
                        className="rp-link"
                        role="link"
                        tabIndex={0}
                        aria-label={p.rotuloLinha(l)}
                        title={p.rotuloLinha(l)}
                        onClick={() => p.abrir(l.id, visiveis.map((v) => v.id))}
                        onKeyDown={(e) => e.key === 'Enter' && p.abrir(l.id, visiveis.map((v) => v.id))}
                      />
                    </td>
                    {p.colunas.map((c) => (
                      <td key={c.titulo} className={c.num ? 'num' : undefined}>
                        {c.valor(l)}
                      </td>
                    ))}
                    <td>{p.selo ? p.selo(l) : seloCadastro(l.status ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas !== null && visiveis.length === 0 && (
              <p className="rp-jlista__vazio">{busca || filtrado ? `Nenhum ${um} atende à busca e aos filtros.` : `Nenhum ${um} cadastrado ainda.`}</p>
            )}
          </div>
        )}
        {!erro && (
          <div className="rp-pag rp-jlista__pag">
            <span className="rp-pag-info" role="status" aria-label={`Contagem de ${varios}`}>
              {linhas === null
                ? 'Carregando'
                : visiveis.length === 0
                  ? 'Nenhum registro'
                  : `1 a ${numero(visiveis.length)} de ${numero(visiveis.length)} ${visiveis.length === 1 ? 'registro' : 'registros'}`}
            </span>
            {p.total && visiveis.length > 0 && <span className="rp-pag-info rp-jlista__total">{p.total(visiveis)}</span>}
          </div>
        )}
      </div>
      <div className="rp-lista-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            Cancelar
          </button>
          {p.novo && (
            <button type="button" className="rp-btn" onClick={p.novo}>
              <span><u>N</u>ovo</span>
            </button>
          )}
          {p.acoes}
        </div>
        <button type="button" className="rp-funil" title="Filtrar tabela" aria-label="Filtrar tabela" aria-haspopup="dialog" aria-pressed={filtrado} onClick={() => setFiltroAberto((v) => !v)}>
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
              <label className="rp-label" htmlFor={`${win.windowId}-situacao`}>{p.rotuloSituacao ?? 'Situação'}</label>
              <Selecao id={`${win.windowId}-situacao`} valor={situacao} onChange={setSituacao} opcoes={situacoes} />
              {filtros.map((f) => (
                <Fragment key={f.chave}>
                  <label className="rp-label" htmlFor={`${win.windowId}-${f.chave}`}>{f.rotulo}</label>
                  {f.opcoes ? (
                    <Selecao
                      id={`${win.windowId}-${f.chave}`}
                      valor={extras[f.chave] ?? ''}
                      onChange={(v) => setExtras((x) => ({ ...x, [f.chave]: v }))}
                      opcoes={[{ valor: '', rotulo: 'Todos' }, ...f.opcoes]}
                    />
                  ) : (
                    <input id={`${win.windowId}-${f.chave}`} className="rp-field" maxLength={f.max ?? 100} value={extras[f.chave] ?? ''} onChange={(e) => setExtras((x) => ({ ...x, [f.chave]: e.target.value }))} />
                  )}
                </Fragment>
              ))}
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
