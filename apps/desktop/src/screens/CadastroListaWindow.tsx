import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { centavos, decimalDaApi, numero, data as dataBr } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import type { WindowKind } from '../windows/windowManager';
import { Selecao } from './comum/Selecao';

/** Avisado pelas fichas de cadastro depois de gravar, para as listas abertas se atualizarem. */
export const CADASTROS_ALTERADOS = 'renda:cadastros-alterados';

type Linha = Record<string, unknown> & { id: string; status: string };
type Tipo = 'T' | 'R' | 'N' | 'S';
/** Coluna da grade: rótulo, largura (CSS grid), chave na linha, tipo (texto, reais, número, situação). */
type Coluna = { rotulo: string; largura: string; chave: string; tipo?: Tipo; valor?: (l: Linha) => string };

type Cadastro = {
  titulo: string;
  grupo: string;
  grupoChave: string;
  busca: string;
  colunas: Coluna[];
  permissao: string;
  criar?: string;
  /** Janela da ficha e a chave do registro (ou de um novo). */
  abrir: (l: Linha) => [WindowKind, string];
  novo?: () => [WindowKind, string];
};

let novos = 0;
const sit = (l: Linha) => (l.status === 'ATIVO' ? 'Ativo' : 'Inativo');
const qtd = (v: unknown) => (v === null || v === undefined ? '' : decimalDaApi(String(v), 0));
const ROLE_CADASTRO: Record<string, string> = { CLIENTE: 'CLIENTE', FORNECEDOR: 'FORNECEDOR', TRANSPORTADORA: 'TRANSPORTADORA' };

/** Os nove cadastros da lista do mock, com as colunas, larguras e o filtro de grupo de cada um. */
export const CADASTROS: Record<string, Cadastro> = {
  clientes: {
    titulo: 'Clientes', grupo: 'Grupo de clientes', grupoChave: 'group', busca: 'Código, nome, documento ou cidade', permissao: 'partner.read', criar: 'partner.create',
    colunas: [
      { rotulo: 'Código', largura: '90px', chave: 'code' }, { rotulo: 'Razão social', largura: 'minmax(0,1.7fr)', chave: 'legalName' },
      { rotulo: 'Nome fantasia', largura: 'minmax(0,1fr)', chave: 'tradeName' }, { rotulo: 'CNPJ / CPF', largura: '150px', chave: 'cnpj' },
      { rotulo: 'Cidade / UF', largura: 'minmax(0,1fr)', chave: 'cityUf' }, { rotulo: 'Grupo', largura: '130px', chave: 'group' },
      { rotulo: 'Saldo em aberto', largura: '130px', chave: 'balanceCents', tipo: 'R' }, { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['partner', `CLIENTE:${l.id}`], novo: () => ['partner', `novo-CLIENTE-${++novos}`],
  },
  fornecedores: {
    titulo: 'Fornecedores', grupo: 'Categoria', grupoChave: 'category', busca: 'Código, nome, documento ou cidade', permissao: 'partner.read', criar: 'partner.create',
    colunas: [
      { rotulo: 'Código', largura: '90px', chave: 'code' }, { rotulo: 'Razão social', largura: 'minmax(0,1.7fr)', chave: 'legalName' },
      { rotulo: 'CNPJ', largura: '150px', chave: 'cnpj' }, { rotulo: 'Cidade / UF', largura: 'minmax(0,1fr)', chave: 'cityUf' },
      { rotulo: 'Categoria', largura: '150px', chave: 'category' },
      { rotulo: 'Prazo médio', largura: '100px', chave: 'leadTimeDays', tipo: 'N', valor: (l) => (l.leadTimeDays == null ? '' : `${l.leadTimeDays} dias`) },
      { rotulo: 'Saldo a pagar', largura: '130px', chave: 'balanceCents', tipo: 'R' }, { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['partner', `FORNECEDOR:${l.id}`], novo: () => ['partner', `novo-FORNECEDOR-${++novos}`],
  },
  contatos: {
    titulo: 'Contatos', grupo: 'Empresa', grupoChave: 'company', busca: 'Nome, empresa ou e-mail', permissao: 'partner.read',
    colunas: [
      { rotulo: 'Nome', largura: 'minmax(0,1.2fr)', chave: 'name' }, { rotulo: 'Empresa', largura: 'minmax(0,1.4fr)', chave: 'company' },
      { rotulo: 'Cargo', largura: 'minmax(0,1fr)', chave: 'role' }, { rotulo: 'Telefone', largura: '140px', chave: 'phone' },
      { rotulo: 'E-mail', largura: 'minmax(0,1.4fr)', chave: 'email' },
      { rotulo: 'Principal', largura: '80px', chave: 'primary', valor: (l) => (l.primary ? 'Sim' : 'Não') },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['partner', `${ROLE_CADASTRO[String(l.partnerRole)] ?? 'CLIENTE'}:${l.id}`],
  },
  transportadoras: {
    titulo: 'Transportadoras', grupo: 'Modal', grupoChave: 'modal', busca: 'Código, nome, documento ou cidade', permissao: 'partner.read', criar: 'partner.create',
    colunas: [
      { rotulo: 'Código', largura: '90px', chave: 'code' }, { rotulo: 'Razão social', largura: 'minmax(0,1.7fr)', chave: 'legalName' },
      { rotulo: 'CNPJ', largura: '150px', chave: 'cnpj' }, { rotulo: 'Modal', largura: '110px', chave: 'modal' },
      { rotulo: 'Cidade / UF', largura: 'minmax(0,1fr)', chave: 'cityUf' },
      { rotulo: 'Fretes no ano', largura: '110px', chave: 'freightsYear', tipo: 'N', valor: (l) => (l.freightsYear == null ? '—' : String(l.freightsYear)) },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['partner', `TRANSPORTADORA:${l.id}`], novo: () => ['partner', `novo-TRANSPORTADORA-${++novos}`],
  },
  colaboradores: {
    titulo: 'Colaboradores', grupo: 'Departamento', grupoChave: 'department', busca: 'Matrícula, nome, departamento ou função', permissao: 'employee.read',
    criar: 'employee.admin',
    colunas: [
      { rotulo: 'Matrícula', largura: '90px', chave: 'code' }, { rotulo: 'Nome', largura: 'minmax(0,1.5fr)', chave: 'name' },
      { rotulo: 'Departamento', largura: 'minmax(0,1fr)', chave: 'department' }, { rotulo: 'Função', largura: 'minmax(0,1.2fr)', chave: 'jobTitle' },
      { rotulo: 'Centro de custo', largura: '140px', chave: 'costCenter' },
      { rotulo: 'Admissão', largura: '100px', chave: 'admissionDate', tipo: 'N', valor: (l) => (l.admissionDate ? dataBr(`${l.admissionDate}T12:00:00`) : '') },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['employee', l.id], novo: () => ['employee', `novo-${++novos}`],
  },
  produtos: {
    titulo: 'Produtos', grupo: 'Categoria', grupoChave: 'category', busca: 'Código, descrição ou categoria', permissao: 'item.read', criar: 'item.create',
    colunas: [
      { rotulo: 'Código', largura: '100px', chave: 'code' }, { rotulo: 'Descrição', largura: 'minmax(0,2fr)', chave: 'description' },
      { rotulo: 'Categoria', largura: 'minmax(0,1fr)', chave: 'category' }, { rotulo: 'Marca', largura: '110px', chave: 'brand' },
      { rotulo: 'UM', largura: '50px', chave: 'uom' }, { rotulo: 'Em estoque', largura: '100px', chave: 'onHand', tipo: 'N', valor: (l) => qtd(l.onHand) || '0' },
      { rotulo: 'Preço de venda', largura: '130px', chave: 'salePriceCents', tipo: 'R' }, { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['item', l.id], novo: () => ['item', `novo-PRODUTO-${++novos}`],
  },
  servicos: {
    titulo: 'Serviços', grupo: 'Categoria', grupoChave: 'category', busca: 'Código, descrição ou categoria', permissao: 'item.read', criar: 'item.create',
    colunas: [
      { rotulo: 'Código', largura: '100px', chave: 'code' }, { rotulo: 'Descrição', largura: 'minmax(0,2fr)', chave: 'description' },
      { rotulo: 'Categoria', largura: 'minmax(0,1fr)', chave: 'category' }, { rotulo: 'UM', largura: '50px', chave: 'uom' },
      { rotulo: 'Cód. serviço', largura: '110px', chave: 'serviceCode' }, { rotulo: 'Preço', largura: '130px', chave: 'salePriceCents', tipo: 'R' },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['item', l.id], novo: () => ['item', `novo-SERVICO-${++novos}`],
  },
  materiais: {
    titulo: 'Materiais e componentes', grupo: 'Categoria', grupoChave: 'category', busca: 'Código, descrição ou categoria', permissao: 'item.read', criar: 'item.create',
    colunas: [
      { rotulo: 'Código', largura: '100px', chave: 'code' }, { rotulo: 'Descrição', largura: 'minmax(0,2fr)', chave: 'description' },
      { rotulo: 'Categoria', largura: 'minmax(0,1fr)', chave: 'category' }, { rotulo: 'UM', largura: '50px', chave: 'uom' },
      { rotulo: 'Em estoque', largura: '100px', chave: 'onHand', tipo: 'N', valor: (l) => qtd(l.onHand) || '0' },
      { rotulo: 'Mínimo', largura: '90px', chave: 'minStock', tipo: 'N', valor: (l) => qtd(l.minStock) },
      { rotulo: 'Custo médio', largura: '120px', chave: 'averageCost', tipo: 'R', valor: (l) => decimalDaApi(l.averageCost as string, 2) },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['item', l.id], novo: () => ['item', `novo-MATERIAL-${++novos}`],
  },
  depositos: {
    titulo: 'Depósitos', grupo: 'Tipo', grupoChave: 'kind', busca: 'Código ou nome', permissao: 'stock.read', criar: 'stock.admin',
    colunas: [
      { rotulo: 'Código', largura: '80px', chave: 'code' }, { rotulo: 'Nome', largura: 'minmax(0,1.4fr)', chave: 'name' },
      { rotulo: 'Tipo', largura: '140px', chave: 'kind', valor: (l) => TIPO_DEPOSITO[String(l.kind)] ?? String(l.kind) },
      { rotulo: 'Endereço', largura: 'minmax(0,1.8fr)', chave: 'address', valor: (l) => (l.address as string) || '—' },
      { rotulo: 'Responsável', largura: 'minmax(0,1fr)', chave: 'responsible', valor: (l) => (l.responsible as string) || '—' },
      { rotulo: 'Posições', largura: '90px', chave: 'positions', tipo: 'N', valor: (l) => (l.positions ? numero(Number(l.positions)) : '—') },
      { rotulo: 'Situação', largura: '90px', chave: 'status', tipo: 'S' },
    ],
    abrir: (l) => ['locations', l.id], novo: () => ['locations', 'novo-deposito'],
  },
};

export const TIPO_DEPOSITO: Record<string, string> = { PROPRIO: 'Próprio', TERCEIROS: 'Terceiros', VIRTUAL: 'Virtual' };

const REGRAS = ['—', 'Igual', 'Contém', 'Entre', 'Maior que', 'Menor que'];
type Regra = { regra: string; de: string; ate: string };

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function texto(c: Coluna, l: Linha): string {
  if (c.valor) return c.valor(l);
  const v = l[c.chave];
  if (c.tipo === 'S') return sit(l);
  if (c.tipo === 'R') return v === null || v === undefined ? '' : centavos(v as number);
  return v === null || v === undefined ? '' : String(v);
}

/** Número de uma célula para as regras Entre, Maior e Menor que ("1.234,50" → 1234.5). */
const comoNumero = (t: string) => Number(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

function aplica(r: Regra, valor: string): boolean {
  const v = semAcento(valor);
  const de = semAcento(r.de.trim());
  const ate = semAcento(r.ate.trim());
  switch (r.regra) {
    case 'Igual': return !de || v === de;
    case 'Contém': return !de || v.includes(de);
    case 'Entre': return (!de || comoNumero(valor) >= comoNumero(r.de)) && (!ate || comoNumero(valor) <= comoNumero(r.ate));
    case 'Maior que': return !de || comoNumero(valor) > comoNumero(r.de);
    case 'Menor que': return !de || comoNumero(valor) < comoNumero(r.de);
    default: return true;
  }
}

/**
 * Lista de cadastro do mock (Cadastros-Lista): Localizar, Situação e o grupo de cada cadastro no topo; a grade com a
 * seta que abre a ficha, a coluna Situação com o ponto colorido e o total do resultado filtrado no pé; Novo, a
 * contagem "N registros de M" e o funil (Filtrar tabela) embaixo. Os números vêm de GET /cadastros/{cadastro}.
 */
export function CadastroListaWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const cad = CADASTROS[recordKey] ?? CADASTROS.clientes;
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('TODOS');
  const [grupo, setGrupo] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [regras, setRegras] = useState<Record<number, Regra>>({});
  const [rascunho, setRascunho] = useState<Record<number, Regra>>({});

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<Linha[]>(`/api/v1/cadastros/${recordKey in CADASTROS ? recordKey : 'clientes'}?status=TODOS`);
      setLinhas(r.data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. A lista volta quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [recordKey]);

  useEffect(() => {
    void carregar();
    const r = () => void carregar();
    window.addEventListener(CADASTROS_ALTERADOS, r);
    return () => window.removeEventListener(CADASTROS_ALTERADOS, r);
  }, [carregar]);

  const podeCriar = !!cad.novo && (!cad.criar || can(cad.criar));
  const novo = useMemo(() => (podeCriar ? () => { const [k, key] = cad.novo!(); win.open(k, key); } : undefined), [podeCriar, cad, win]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);

  const grupos = useMemo(() => {
    const s = new Set<string>();
    (linhas ?? []).forEach((l) => l[cad.grupoChave] && s.add(texto({ rotulo: '', largura: '', chave: cad.grupoChave, valor: cad.colunas.find((c) => c.chave === cad.grupoChave)?.valor }, l)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas, cad]);

  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    return (linhas ?? []).filter((l) => {
      if (situacao !== 'TODOS' && l.status !== situacao) return false;
      const colGrupo = cad.colunas.find((c) => c.chave === cad.grupoChave);
      if (grupo && texto(colGrupo ?? { rotulo: '', largura: '', chave: cad.grupoChave }, l) !== grupo) return false;
      if (t && !cad.colunas.some((c) => semAcento(texto(c, l)).includes(t))) return false;
      return Object.entries(regras).every(([k, r]) => aplica(r, texto(cad.colunas[Number(k)], l)));
    });
  }, [linhas, busca, situacao, grupo, regras, cad]);

  const colunas = `44px 26px ${cad.colunas.map((c) => c.largura).join(' ')}`;
  const sequencia = filtradas.map((l) => l.id);
  const abrir = (l: Linha) => {
    const [k, key] = cad.abrir(l);
    win.open(k, key, k === 'locations' ? undefined : filtradas.map((x) => cad.abrir(x)[1]));
  };
  const totalReais = cad.colunas.map((c) => (c.tipo === 'R' && c.chave !== 'averageCost'
    ? centavos(filtradas.reduce((s, l) => s + (Number(l[c.chave]) || 0), 0))
    : ''));
  const total = linhas?.length ?? 0;
  void sequencia;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-cadlista">
        <div className="rp-cadlista__filtros">
          <div className="rp-cadlista__campo">
            <label htmlFor={`${win.windowId}-busca`}>Localizar</label>
            <input id={`${win.windowId}-busca`} className="rp-field rp-cadlista__busca" type="search" placeholder={cad.busca} maxLength={200}
              value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          </div>
          <div className="rp-cadlista__campo">
            <label htmlFor={`${win.windowId}-situacao`}>Situação</label>
            <Selecao id={`${win.windowId}-situacao`} largura="140px" valor={situacao} onChange={setSituacao}
              opcoes={[{ valor: 'TODOS', rotulo: 'Todos' }, { valor: 'ATIVO', rotulo: 'Ativos' }, { valor: 'INATIVO', rotulo: 'Inativos' }]} />
          </div>
          <div className="rp-cadlista__campo">
            <label htmlFor={`${win.windowId}-grupo`}>{cad.grupo}</label>
            <Selecao id={`${win.windowId}-grupo`} largura="180px" valor={grupo} onChange={setGrupo}
              opcoes={[{ valor: '', rotulo: 'Todos' }, ...grupos.map((g) => ({ valor: g, rotulo: g }))]} />
          </div>
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : (
          <div role="grid" aria-label={cad.titulo} aria-rowcount={filtradas.length} className="rp-cadlista__grade">
            <div role="row" className="rp-cadlista__cab" style={{ gridTemplateColumns: colunas }}>
              <div role="columnheader">#</div>
              <div role="columnheader" aria-label="Abrir" />
              {cad.colunas.map((c, i) => (
                <div key={c.rotulo} role="columnheader" aria-sort={i === 0 ? 'ascending' : 'none'} className={c.tipo === 'R' || c.tipo === 'N' ? 'num' : undefined}>
                  {c.rotulo}
                  {i === 0 && <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 2.5h6L4 6.5z" className="rp-cadlista__ordem" /></svg>}
                </div>
              ))}
            </div>
            <div className="rp-cadlista__linhas rp-rolagem">
              {filtradas.map((l, i) => (
                <div key={`${l.id}-${(l.contactId as string) ?? ''}`} role="row" aria-selected={sel === l.id} className="rp-cadlista__linha"
                  style={{ gridTemplateColumns: colunas }} onClick={() => setSel(l.id)} onDoubleClick={() => abrir(l)}>
                  <div role="gridcell" className="rp-cadlista__n">{i + 1}</div>
                  <div role="gridcell" className="rp-cadlista__seta">
                    <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir ${texto(cad.colunas[1], l)}`} title={`Abrir ${texto(cad.colunas[1], l)}`}
                      onClick={(e) => (e.stopPropagation(), abrir(l))} onKeyDown={(e) => e.key === 'Enter' && abrir(l)} />
                  </div>
                  {cad.colunas.map((c) => (
                    <Celula key={c.rotulo} coluna={c} linha={l} />
                  ))}
                </div>
              ))}
              {linhas !== null && filtradas.length === 0 && (
                <p className="rp-cadlista__vazio">Nenhum registro atende aos filtros. Limpe a busca ou altere a situação.</p>
              )}
            </div>
            <div className="rp-cadlista__pe" style={{ gridTemplateColumns: colunas }}>
              <div />
              <div />
              {cad.colunas.map((c, i) => (
                <div key={c.rotulo} className={i === 0 ? 'rp-cadlista__pe-rotulo' : c.tipo === 'R' ? 'num' : undefined}>
                  {i === 0 ? 'Total do resultado filtrado' : totalReais[i]}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="rp-window-foot rp-cadlista__foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" disabled={!novo} onClick={novo}>
            <span><u>N</u>ovo</span>
          </button>
          <span className="rp-cadlista__resumo" role="status">
            {linhas === null ? 'Carregando' : `${filtradas.length} ${filtradas.length === 1 ? 'registro' : 'registros'} de ${total}`}
          </span>
        </div>
        <button type="button" className="rp-funil" title="Filtrar tabela" aria-label="Filtrar tabela" aria-haspopup="dialog"
          aria-pressed={Object.keys(regras).length > 0} onClick={() => (setRascunho(regras), setFiltroAberto(true))}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12l-4.6 5.4V13l-2.8 1.4V8.4z" fill="none" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {filtroAberto && (
        <div className="rp-cadlista__modal">
          <div className="rp-window rp-cadlista__filtro" role="dialog" aria-modal="true" aria-label="Filtrar tabela">
            <div className="rp-titlebar">
              <span>Filtrar tabela</span>
              <span className="rp-winbtns">
                <span role="button" tabIndex={0} aria-label="Fechar" onClick={() => setFiltroAberto(false)} onKeyDown={(e) => e.key === 'Enter' && setFiltroAberto(false)}>×</span>
              </span>
            </div>
            <div className="rp-window-body">
              <div className="rp-cadlista__regras">
                <div className="rp-cadlista__regras-cab"><span>#</span><span>Campo</span><span>Regra</span><span>Valor de</span><span>Valor até</span></div>
                {cad.colunas.map((c, k) => {
                  const r = rascunho[k] ?? { regra: '—', de: '', ate: '' };
                  const muda = (p: Partial<Regra>) => setRascunho((x) => ({ ...x, [k]: { ...r, ...p } }));
                  return (
                    <div key={c.rotulo} className="rp-cadlista__regra">
                      <span className="rp-cadlista__n">{k + 1}</span>
                      <span>{c.rotulo}</span>
                      <Selecao aria-label={`Regra para ${c.rotulo}`} valor={r.regra} onChange={(v) => muda({ regra: v })} opcoes={REGRAS.map((x) => ({ valor: x, rotulo: x }))} />
                      <input className="rp-field" aria-label={`Valor de ${c.rotulo}`} value={r.de} onChange={(e) => muda({ de: e.target.value })} />
                      <input className="rp-field" aria-label={`Valor até ${c.rotulo}`} value={r.ate} onChange={(e) => muda({ ate: e.target.value })} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rp-window-foot">
              <div className="rp-btn-row">
                <button type="button" className="rp-btn rp-btn--default" onClick={() => {
                  setRegras(Object.fromEntries(Object.entries(rascunho).filter(([, r]) => r.regra !== '—')));
                  setFiltroAberto(false);
                }}>OK</button>
                <button type="button" className="rp-btn" onClick={() => setFiltroAberto(false)}>Cancelar</button>
              </div>
              <button type="button" className="rp-btn" onClick={() => setRascunho({})}><span><u>L</u>impar</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Celula({ coluna, linha }: { coluna: Coluna; linha: Linha }): ReactNode {
  const t = texto(coluna, linha);
  if (coluna.tipo === 'S') {
    return (
      <div role="gridcell" className={`rp-cadlista__sit${linha.status === 'ATIVO' ? ' rp-cadlista__sit--ativo' : ''}`}>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" /></svg>
        <span>{t}</span>
      </div>
    );
  }
  return (
    <div role="gridcell" className={coluna.tipo === 'R' || coluna.tipo === 'N' ? 'num' : undefined} title={t}>
      <span>{t}</span>
    </div>
  );
}
