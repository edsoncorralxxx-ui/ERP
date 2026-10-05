import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Employee, PapelParceiro, Partner, PartnerFichaSummary, PerfilValor, TipoEndereco } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataParaApi, decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CADASTROS_ALTERADOS } from './CadastroListaWindow';
import { novaChave } from './comum/Cadastros';
import { DialogoConflito } from './comum/Dialogos';
import {
  Abas, abaDaTecla, Anexos, BarraEdicao, Campo, comAtalho, comAtual, ConfirmaExclusao, GradeSimples, HistoricoFicha, Indicadores,
  Linha, Marca, Observacoes, Secao, Seta, useApi, useReferencia, type Aba, type Indicador,
} from './comum/Ficha';
import { Selecao } from './comum/Selecao';
import { classeSelo, ICONE_ATIVIDADE, SITUACAO_ATIVIDADE, TIPO_ATIVIDADE, type Atividade } from './comum/CrmMock';

const ROTA: Record<PapelParceiro, string> = { CLIENTE: 'customers', FORNECEDOR: 'suppliers', TRANSPORTADORA: 'carriers' };
const NOME: Record<PapelParceiro, { titulo: string; tipo: string; lista: string; artigo: string }> = {
  CLIENTE: { titulo: 'Dados mestre do cliente', tipo: 'Cliente', lista: 'clientes', artigo: 'o cliente' },
  FORNECEDOR: { titulo: 'Dados mestre do fornecedor', tipo: 'Fornecedor', lista: 'fornecedores', artigo: 'o fornecedor' },
  TRANSPORTADORA: { titulo: 'Dados mestre da transportadora', tipo: 'Transportadora', lista: 'transportadoras', artigo: 'a transportadora' },
};
const FLAG: Record<PapelParceiro, 'customer' | 'supplier' | 'carrier'> = { CLIENTE: 'customer', FORNECEDOR: 'supplier', TRANSPORTADORA: 'carrier' };

/** Título da janela pelo papel e o registro ("novo-CLIENTE-1" ou "CLIENTE:<id>"). */
export const papelDaChave = (recordKey: string): PapelParceiro => {
  const p = recordKey.startsWith('novo-') ? recordKey.split('-')[1] : recordKey.split(':')[0];
  return p === 'FORNECEDOR' || p === 'TRANSPORTADORA' ? p : 'CLIENTE';
};
export const tituloParceiro = (recordKey: string) => NOME[papelDaChave(recordKey)].titulo + (recordKey.startsWith('novo-') ? ' — novo' : '');

const GRUPOS = ['Fecularias', 'Farinheiras', 'Polvilharias', 'Cooperativas', 'Associações'];
const CATEGORIAS_FORNECEDOR = ['Aço inox', 'Componentes elétricos', 'Instrumentação', 'Pneumática', 'Caldeiraria', 'Serviços de pintura', 'Fixadores', 'Calibração RBC'];
const MODAIS = ['Rodoviário', 'Aéreo', 'Ferroviário', 'Aquaviário', 'Multimodal'];
const INDUSTRIAS = ['Fecularia', 'Farinheira', 'Polvilharia', 'Fecularia e farinheira', 'Associação de produtores', 'Indústria'];
const ORIGENS = ['Feira do setor de mandioca', 'Indicação', 'Site', 'Cotação', 'Prospecção ativa'];
const REGIMES = ['Simples Nacional', 'Lucro presumido', 'Lucro real', 'MEI', 'Isento'];
const ICMS = ['Contribuinte', 'Isento', 'Não contribuinte'];
const TIPO_END: Record<TipoEndereco, string> = { COBRANCA: 'Cobrança', ENTREGA: 'Entrega', UNIDADE: 'Unidade', FATURAMENTO: 'Faturamento' };
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const RETENCOES = [['withholdIss', 'ISS'], ['withholdIrrf', 'IRRF'], ['withholdPis', 'PIS'], ['withholdCofins', 'COFINS'], ['withholdCsll', 'CSLL'], ['withholdInss', 'INSS']] as const;

type TabId = 'geral' | 'end' | 'cont' | 'pag' | 'fis' | 'ativ' | 'doc' | 'hist';
const ABAS: Aba<TabId>[] = [
  { id: 'geral', rotulo: 'Geral', tecla: 'G' }, { id: 'end', rotulo: 'Endereços', tecla: 'E' }, { id: 'cont', rotulo: 'Contatos', tecla: 'o' },
  { id: 'pag', rotulo: 'Pagamento', tecla: 'P' }, { id: 'fis', rotulo: 'Fiscal', tecla: 'F' }, { id: 'ativ', rotulo: 'Atividades', tecla: 'A' },
  { id: 'doc', rotulo: 'Documentos', tecla: 'u' }, { id: 'hist', rotulo: 'Histórico', tecla: 'H' },
];

type Endereco = { id: string | null; kind: TipoEndereco; name: string; street: string; number: string; district: string; city: string; state: string; postalCode: string; cnpj: string; isDefault: boolean };
type Contato = { id: string | null; name: string; role: string; phone: string; email: string; primary: boolean; receivesInvoices: boolean };
type Situacao = 'ATIVO' | 'INATIVO' | 'BLOQUEADO';
type Form = {
  code: string; serie: 'AUTO' | 'MANUAL'; legalName: string; tradeName: string; cnpj: string; group: string;
  p: Record<string, string>; units: Endereco[]; contacts: Contato[]; leadTimeDays: string; situacao: Situacao; motivo: string;
};

/** Campos do perfil e como cada um vai e volta da API. */
const DINHEIRO = new Set(['creditLimitCents']);
const DECIMAL = new Set(['defaultDiscountPercent', 'lateInterestPercent']);
const BOOLEANO = new Set(['blocked', 'withholdIss', 'withholdIrrf', 'withholdPis', 'withholdCofins', 'withholdCsll', 'withholdInss']);
const DATA = new Set(['blockedFrom', 'blockedTo']);

const deApi = (k: string, v: PerfilValor | undefined): string => {
  if (v === undefined || v === null) return '';
  if (BOOLEANO.has(k)) return v === true ? 'true' : '';
  if (DINHEIRO.has(k)) return centavos(v as number);
  if (DECIMAL.has(k)) return decimalDaApi(String(v), 2);
  if (DATA.has(k)) return dataDaApi(String(v));
  return String(v);
};
const paraApi = (k: string, v: string): PerfilValor | null => {
  if (!v.trim()) return null;
  if (BOOLEANO.has(k)) return v === 'true';
  if (DINHEIRO.has(k)) return centavosParaApi(v);
  if (DECIMAL.has(k)) return decimalParaApi(v);
  if (DATA.has(k)) return dataParaApi(v);
  if (k === 'dailyCapacityTons') return v.replace(/\D/g, '');
  return v.trim();
};

const vazio = (papel: PapelParceiro): Form => ({
  code: '', serie: 'AUTO', legalName: '', tradeName: '', cnpj: '', group: '', p: {}, units: [], contacts: [], leadTimeDays: '',
  situacao: 'ATIVO', motivo: '',
  ...(papel === 'TRANSPORTADORA' ? { p: { modal: 'Rodoviário' } } : {}),
});

const toForm = (x: Partner): Form => ({
  code: x.code, serie: 'AUTO', legalName: x.legalName, tradeName: x.tradeName ?? '', cnpj: x.cnpjFormatted ?? x.cnpj ?? '', group: x.group ?? '',
  p: Object.fromEntries(Object.entries(x.profile ?? {}).map(([k, v]) => [k, deApi(k, v)])),
  units: x.units.map((u) => ({
    id: u.id, kind: u.kind ?? 'UNIDADE', name: u.name ?? '', street: u.street ?? '', number: u.number ?? '', district: u.district ?? '', city: u.city ?? '',
    state: u.state ?? '', postalCode: u.postalCode ?? '', cnpj: u.cnpjFormatted ?? '', isDefault: !!u.isDefault,
  })),
  contacts: x.contacts.map((c) => ({ id: c.id, name: c.name ?? '', role: c.role ?? '', phone: c.phone ?? '', email: c.email ?? '', primary: !!c.primary, receivesInvoices: !!c.receivesInvoices })),
  leadTimeDays: x.leadTimeDays === null ? '' : String(x.leadTimeDays),
  situacao: x.status === 'INATIVO' ? 'INATIVO' : x.profile?.blocked === true ? 'BLOQUEADO' : 'ATIVO',
  motivo: x.profile?.blockedReason ? String(x.profile.blockedReason) : '',
});

const cep = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 5)}-${v.slice(5)}` : v);
const nulo = (s: string) => (s.trim() ? s.trim() : null);

function toRequest(f: Form, papel: PapelParceiro, x: Partner | null) {
  const p = { ...f.p };
  p.blocked = f.situacao === 'BLOQUEADO' ? 'true' : '';
  p.blockedReason = f.situacao === 'BLOQUEADO' ? f.motivo : '';
  if (f.situacao !== 'BLOQUEADO') { p.blockedFrom = ''; p.blockedTo = ''; }
  const profile: Record<string, PerfilValor> = {};
  Object.entries(p).forEach(([k, v]) => {
    const a = paraApi(k, v ?? '');
    if (a !== null && a !== '') profile[k] = a;
  });
  return {
    code: f.serie === 'MANUAL' ? nulo(f.code) : null,
    legalName: f.legalName.trim(), tradeName: nulo(f.tradeName), cnpj: nulo(f.cnpj.replace(/\D/g, '')), group: papel === 'CLIENTE' ? nulo(f.group) : x?.group ?? null,
    units: f.units.map((u) => ({
      id: u.id, name: nulo(u.name), street: nulo(u.street), number: nulo(u.number), district: nulo(u.district), city: nulo(u.city), state: nulo(u.state),
      postalCode: nulo(u.postalCode), cnpj: nulo(u.cnpj.replace(/\D/g, '')), kind: u.kind, isDefault: u.isDefault,
    })),
    contacts: f.contacts.map((c) => ({ id: c.id, name: c.name.trim(), role: nulo(c.role), phone: nulo(c.phone), email: nulo(c.email), primary: c.primary, receivesInvoices: c.receivesInvoices })),
    leadTimeDays: papel === 'FORNECEDOR' && f.leadTimeDays.trim() ? Number(f.leadTimeDays) : null,
    paymentTerms: x?.paymentTerms ?? null,
    suppliedCategoryIds: x?.suppliedCategories.map((c) => c.id) ?? [],
    profile,
  };
}

/** CNPJ com dígitos verificadores válidos (o servidor confere de novo ao gravar). */
export function cnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
const mascaraCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.length < 14 ? v : `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};


/**
 * Ficha do parceiro do mock (Cadastros-Parceiro): uma janela para cliente, fornecedor e transportadora. Cabeçalho com
 * código e série, papel, razão social, CNPJ validado, inscrição estadual e o grupo do papel; à direita, os quatro
 * indicadores com a seta e a análise. Abas Geral, Endereços, Contatos, Pagamento, Fiscal, Atividades, Documentos e
 * Histórico. Abre em consulta: a ferramenta Editar liga o modo de edição (barra amarela com Excluir, Cancelar e Salvar).
 */
export function PartnerWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [papel, setPapel] = useState<PapelParceiro>(papelDaChave(recordKey));
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey.split(':')[1] ?? null);
  const [reg, setReg] = useState<Partner | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(() => vazio(papel));
  const [tab, setTab] = useState<TabId>('geral');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [outroPapel, setOutroPapel] = useState<PapelParceiro | null>(null);
  const [resumo, setResumo] = useState<PartnerFichaSummary | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [selCont, setSelCont] = useState(0);
  const [atividades, setAtividades] = useState<Atividade[] | null>(null);
  const chave = useRef(novaChave());
  const nome = NOME[papel];
  const rota = ROTA[papel];

  const condicoes = useReferencia('condicoes');
  const formas = useReferencia('formas');
  const tabelas = useApi<{ id: string; code: string; name: string; active: boolean }[]>(can('price_list.read') ? '/api/v1/price-lists' : null, []);
  const colaboradores = useApi<Employee[]>(can('employee.read') ? '/api/v1/employees?status=ATIVO' : null, []);
  const transportadoras = useApi<{ id: string; legalName: string; status: string }[]>('/api/v1/carriers', []);

  const adicao = reg === null;
  const inativo = reg?.status === 'INATIVO';
  const podeEditar = adicao ? can('partner.create') : can('partner.update');
  const ro = !podeEditar || (!adicao && !editando);
  const original = useMemo(() => (reg ? toForm(reg) : vazio(papel)), [reg, papel]);
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);
  const registro = reg ? `${nome.artigo} ${reg.code}` : `${nome.artigo} novo`;

  useEffect(() => win.setDirty(alterado), [alterado, win]);
  useEffect(() => win.setTitle?.(`${nome.titulo} — ${reg ? reg.code : 'novo'}`), [nome.titulo, reg, win]);

  const aplicar = useCallback((x: Partner, e?: string) => {
    setReg(x);
    setId(x.id);
    setEtag(e ?? `"${x.version}"`);
    setForm(toForm(x));
    setErros({});
  }, []);

  const carregarResumo = useCallback((pid: string, p: PapelParceiro) => {
    api.get<PartnerFichaSummary>(`/api/v1/cadastros/partners/${pid}/summary?role=${p}`).then((r) => setResumo(r.data)).catch(() => setResumo(null));
  }, []);

  const carregar = useCallback(async (pid: string, p: PapelParceiro) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const r = await api.get<Partner>(`/api/v1/${ROTA[p]}/${pid}`);
      aplicar(r.data, r.etag);
      carregarResumo(pid, p);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setCarregando(false);
    }
  }, [aplicar, carregarResumo]);

  useEffect(() => {
    if (id) void carregar(id, papel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'ativ' || !id || atividades !== null) return;
    api.get<Atividade[]>(`/api/v1/crm/activities?partnerId=${id}`).then((r) => setAtividades(r.data)).catch(() => setAtividades([]));
  }, [tab, id, atividades]);

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      winRef.current.notify({ tone: 'aviso', text: `O cadastro foi alterado por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.status === 422) {
      const map: Record<string, string> = {};
      x.details.forEach((d) => d.field && (map[d.field] = d.message));
      setErros(map);
      const campos = Object.keys(map);
      const aba = (k: string): TabId => (k.startsWith('units') ? 'end' : k.startsWith('contacts') ? 'cont'
        : /profile\.(payment|priceList|default|late|credit|pix|bank)/.test(k) ? 'pag'
          : /profile\.(tax|icms|municipal|cnae|nfe|withhold)/.test(k) ? 'fis' : 'geral');
      if (campos.length) setTab(aba(campos[0]));
      const detalhe = x.details[0]?.message;
      winRef.current.notify({ tone: 'erro', text: `${x.message}${detalhe && detalhe !== x.message ? ` ${detalhe}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.code === 'PARTNER_OTHER_ROLE') {
      winRef.current.notify({ tone: 'aviso', text: `${x.message} Abra o cadastro existente e troque o tipo para dar o novo papel. (${x.code})` });
    } else if (x.isNetwork) {
      winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${x.code})` });
    } else {
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    const f = formRef.current;
    setGravando(true);
    try {
      const body = toRequest(f, papel, reg);
      let r = reg
        ? await api.put<Partner>(`/api/v1/${rota}/${reg.id}`, body, etag)
        : await api.post<Partner>(`/api/v1/${rota}`, body, { 'Idempotency-Key': chave.current });
      // Situação: inativar pede motivo; reativar devolve o papel.
      if (f.situacao === 'INATIVO' && r.data.status === 'ATIVO') {
        r = await api.post<Partner>(`/api/v1/${rota}/${r.data.id}/deactivate`, { reason: f.motivo.trim() || 'Inativado na ficha' }, { 'If-Match': r.etag ?? `"${r.data.version}"` });
      } else if (f.situacao !== 'INATIVO' && r.data.status === 'INATIVO') {
        r = await api.post<Partner>(`/api/v1/${rota}/${r.data.id}/enable`, undefined, { 'If-Match': r.etag ?? `"${r.data.version}"` });
      }
      const novo = !reg;
      aplicar(r.data, r.etag);
      carregarResumo(r.data.id, papel);
      chave.current = novaChave();
      setEditando(false);
      winRef.current.notify({ tone: 'sucesso', text: `${nome.tipo} ${r.data.code} ${novo ? 'adicionado' : 'atualizado'} com sucesso` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [papel, reg, rota, etag, aplicar, carregarResumo, falha, nome.tipo]);

  const confirmarExclusao = async () => {
    setExcluir(false);
    if (!reg) return;
    try {
      const r = await api.post<Partner>(`/api/v1/${rota}/${reg.id}/deactivate`, { reason: 'Excluído na ficha (modo de edição)' }, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      setEditando(false);
      winRef.current.notify({ tone: 'sucesso', text: `${nome.tipo} ${r.data.code} inativado: sai das listas de ativos e o histórico continua guardado` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  /** Troca de tipo: num cadastro novo muda o papel; num existente abre (ou dá) o outro papel do mesmo parceiro. */
  const trocarTipo = (p: string) => {
    const novoPapel = p as PapelParceiro;
    if (novoPapel === papel) return;
    if (adicao) {
      setPapel(novoPapel);
      return;
    }
    if (reg && reg[FLAG[novoPapel]]) win.open('partner', `${novoPapel}:${reg.id}`);
    else setOutroPapel(novoPapel);
  };
  const darPapel = async () => {
    const p = outroPapel;
    setOutroPapel(null);
    if (!p || !reg) return;
    try {
      await api.post<Partner>(`/api/v1/${ROTA[p]}/${reg.id}/enable`, undefined, { 'If-Match': etag });
      winRef.current.notify({ tone: 'sucesso', text: `Parceiro ${reg.code} agora também é ${NOME[p].tipo.toLowerCase()}` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
      void carregar(reg.id, papel);
      win.open('partner', `${p}:${reg.id}`);
    } catch (e) {
      falha(e);
    }
  };

  const cancelarEdicao = () => {
    setForm(original);
    setErros({});
    setEditando(false);
    winRef.current.notify({ tone: 'info', text: 'Edição cancelada. Nenhuma alteração foi gravada.' });
  };

  const podeGravar = alterado && !gravando && !carregando && podeEditar && (adicao || editando);
  const editar = useMemo(() => (!adicao && podeEditar && !carregando ? () => (editando ? cancelarEdicao() : setEditando(true)) : undefined),
    [adicao, podeEditar, carregando, editando]); // eslint-disable-line react-hooks/exhaustive-deps
  const excluirCmd = useMemo(() => (!adicao && can('partner.deactivate') && !inativo ? () => setExcluir(true) : undefined), [adicao, can, inativo]);
  const novo = useMemo(() => (can('partner.create') ? () => win.open('partner', `novo-${papel}-${Date.now()}`) : undefined), [can, papel, win]);
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, editar, excluir: excluirCmd, novo }), [podeGravar, gravar, editar, excluirCmd, novo, win]);

  // Em consulta nada muda (seleções e marcas seguem com a aparência do mock, mas sem efeito).
  const set = (patch: Partial<Form>) => !ro && setForm((f) => ({ ...f, ...patch }));
  const setP = (k: string, v: string) => !ro && setForm((f) => ({ ...f, p: { ...f.p, [k]: v } }));
  const pv = (k: string) => form.p[k] ?? '';
  const setEnd = (i: number, patch: Partial<Endereco>) => setForm((f) => ({
    ...f,
    units: f.units.map((u, j) => {
      if (j === i) return { ...u, ...patch };
      // Um endereço padrão por tipo.
      if (patch.isDefault && u.kind === (patch.kind ?? f.units[i].kind)) return { ...u, isDefault: false };
      return u;
    }),
  }));
  const setCont = (i: number, patch: Partial<Contato>) => setForm((f) => ({
    ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, ...patch } : patch.primary ? { ...c, primary: false } : c)),
  }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || excluir || outroPapel) return;
    if (e.altKey) {
      const a = abaDaTecla(ABAS, e.key);
      if (a) {
        e.preventDefault();
        setTab(a);
      }
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const lista = (cad: string) => () => win.open('cadastro-lista', cad);
  const r = resumo;
  const dinheiro = (v: number | null | undefined) => (v === null || v === undefined ? '—' : centavos(v));
  const qtd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
  const indicadores: Indicador[] = adicao ? [] : papel === 'CLIENTE' ? [
    { rotulo: 'Saldo em aberto', valor: dinheiro(r?.openReceivableCents), abrir: () => win.open('receivables'), analise: () => win.open('receivables') },
    { rotulo: 'Pedidos em aberto', valor: dinheiro(r?.openOrdersCents), abrir: () => win.open('orders'), analise: () => win.open('orders') },
    { rotulo: 'Equipamentos instalados', valor: qtd(r?.equipmentCount), abrir: () => win.open('equipments'), analise: () => win.open('equipments') },
    { rotulo: 'Oportunidades', valor: qtd(r?.openOpportunities), abrir: () => win.open('opportunities'), analise: () => win.open('opportunities') },
  ] : papel === 'FORNECEDOR' ? [
    { rotulo: 'Saldo a pagar', valor: dinheiro(r?.openPayableCents), abrir: () => win.open('payables'), analise: () => win.open('payables') },
    { rotulo: 'Pedidos de compra', valor: dinheiro(r?.purchaseOrdersCents) },
    { rotulo: 'Recebimentos pendentes', valor: dinheiro(r?.pendingReceiptsCents) },
    { rotulo: 'Cotações abertas', valor: qtd(r?.openQuotations) },
  ] : [
    { rotulo: 'Fretes no ano', valor: qtd(r?.freightsYear) },
    { rotulo: 'Frete a pagar', valor: dinheiro(r?.openPayableCents), abrir: () => win.open('payables'), analise: () => win.open('payables') },
    { rotulo: 'Entregas em trânsito', valor: qtd(r?.inTransit) },
    { rotulo: 'Ocorrências', valor: qtd(r?.occurrences) },
  ];

  const principal = form.contacts.find((c) => c.primary) ?? form.contacts[0];
  const rotuloGrupo = papel === 'CLIENTE' ? 'Grupo de clientes' : papel === 'FORNECEDOR' ? 'Categoria' : 'Modal';
  const grupo = papel === 'CLIENTE' ? form.group : papel === 'FORNECEDOR' ? pv('supplierCategory') : pv('modal');
  const setGrupo = (v: string) => (papel === 'CLIENTE' ? set({ group: v }) : setP(papel === 'FORNECEDOR' ? 'supplierCategory' : 'modal', v));
  const opcoesGrupo = papel === 'CLIENTE' ? GRUPOS : papel === 'FORNECEDOR' ? CATEGORIAS_FORNECEDOR : MODAIS;
  const op = (lista: string[]) => lista.map((x) => ({ valor: x, rotulo: x }));
  const rotuloResp = papel === 'CLIENTE' ? 'Vendedor responsável' : papel === 'FORNECEDOR' ? 'Comprador responsável' : 'Responsável interno';
  const cnpjOk = cnpjValido(form.cnpj);
  const contato = form.contacts[selCont];
  const transpSel = transportadoras.find((t) => t.legalName === pv('defaultCarrier'));

  const abas = ABAS.map((a) => ((a.id === 'ativ' || a.id === 'doc' || a.id === 'hist') && adicao ? { ...a, desabilitada: true } : a));
  const sel = (k: string, opcoes: { valor: string; rotulo: string }[], largura = '100%') => (
    <Selecao id={fid(k)} valor={pv(k)} onChange={(v) => setP(k, v)} opcoes={comAtual(opcoes, pv(k))} disabled={!podeEditar}
      aria-invalid={!!erros[`profile.${k}`]} largura={largura} />
  );
  const txt = (k: string, largura: number | string = '100%', extra: { num?: boolean; max?: number } = {}) => (
    <Campo id={fid(k)} valor={pv(k)} onChange={ro ? undefined : (v) => setP(k, v)} largura={largura} erro={erros[`profile.${k}`]} {...extra} />
  );

  if (erroCarga) {
    return (
      <div className="rp-window-body rp-janela-mdi__corpo">
        <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}</p>
        <button type="button" className="rp-btn" onClick={() => id && void carregar(id, papel)}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <>
      {editando && !adicao && (
        <BarraEdicao registro={registro} gravando={gravando} onCancelar={cancelarEdicao} onSalvar={() => void gravar()}
          onExcluir={excluirCmd} />
      )}
      <div className={`rp-window-body rp-janela-mdi__corpo rp-ficha${ro && !adicao ? ' rp-ficha--consulta' : ''}${editando ? ' rp-ficha--editando' : ''}`} onKeyDown={onKeyDown} aria-busy={carregando}>
        <div className="rp-ficha__cab">
          <div className="rp-ficha__coluna">
            <Linha id={fid('codigo')} rotulo="Código" req erro={erros.code}>
              <Campo id={fid('codigo')} valor={form.code} largura={110} max={20} ro={!(adicao && form.serie === 'MANUAL')} onChange={adicao && form.serie === 'MANUAL' ? (v) => set({ code: v.toUpperCase() }) : undefined}
                placeholder={adicao && form.serie === 'AUTO' ? 'Automático' : undefined} erro={erros.code} />
              <Selecao aria-label="Série" valor={form.serie} disabled={!podeEditar} onChange={(v) => adicao && set({ serie: v as Form['serie'], code: '' })}
                opcoes={[{ valor: 'AUTO', rotulo: 'Automática' }, { valor: 'MANUAL', rotulo: 'Manual' }]} largura={'110px'} />
              <Selecao aria-label="Tipo de parceiro" valor={papel} disabled={!podeEditar} onChange={trocarTipo}
                opcoes={[{ valor: 'CLIENTE', rotulo: 'Cliente' }, { valor: 'FORNECEDOR', rotulo: 'Fornecedor' }, { valor: 'TRANSPORTADORA', rotulo: 'Transportadora' }]} largura={'120px'} />
            </Linha>
            <Linha id={fid('razao')} rotulo="Razão social" req erro={erros.legalName}>
              <Campo id={fid('razao')} valor={form.legalName} max={200} onChange={ro ? undefined : (v) => set({ legalName: v })} erro={erros.legalName} />
            </Linha>
            <Linha id={fid('fantasia')} rotulo="Nome fantasia" erro={erros.tradeName}>
              <Campo id={fid('fantasia')} valor={form.tradeName} max={120} onChange={ro ? undefined : (v) => set({ tradeName: v })} erro={erros.tradeName} />
            </Linha>
            <Linha id={fid('cnpj')} rotulo="CNPJ / CPF" req erro={erros.cnpj}>
              <Campo id={fid('cnpj')} valor={form.cnpj} largura={180} max={18} onChange={ro ? undefined : (v) => set({ cnpj: mascaraCnpj(v) })} erro={erros.cnpj} />
              <span className="rp-ficha-nota">{!form.cnpj ? '' : cnpjOk ? 'Validado' : 'CNPJ inválido: confira os dígitos'}</span>
            </Linha>
            <Linha id={fid('stateRegistration')} rotulo="Inscrição estadual" erro={erros['profile.stateRegistration']}>{txt('stateRegistration', 180, { max: 20 })}</Linha>
            <Linha id={fid('grupo')} rotulo={rotuloGrupo} erro={erros.group}>
              <Selecao id={fid('grupo')} valor={grupo} onChange={setGrupo} opcoes={comAtual(op(opcoesGrupo), grupo)} disabled={!podeEditar} largura={'100%'} />
            </Linha>
          </div>
          <div className="rp-ficha__coluna">{!adicao && <Indicadores itens={indicadores} />}</div>
        </div>

        <Abas abas={abas} atual={tab} onTroca={setTab} rotulo="Abas da ficha" />
        <div role="tabpanel" className="rp-ficha__painel rp-rolagem">
          {tab === 'geral' && (
            <>
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('phone1')} rotulo="Telefone 1">{txt('phone1', 180, { max: 30 })}</Linha>
                  <Linha id={fid('phone2')} rotulo="Telefone 2">{txt('phone2', 180, { max: 30 })}</Linha>
                  <Linha id={fid('mobile')} rotulo="Celular">{txt('mobile', 180, { max: 30 })}</Linha>
                  <Linha id={fid('email')} rotulo="E-mail" erro={erros['profile.email']}>{txt('email', '100%', { max: 200 })}</Linha>
                  <Linha id={fid('site')} rotulo="Site">{txt('site', '100%', { max: 200 })}</Linha>
                  <Linha id={fid('industry')} rotulo="Tipo de indústria">{sel('industry', op(INDUSTRIAS))}</Linha>
                  <Linha id={fid('dailyCapacityTons')} rotulo="Moagem (t/dia)" erro={erros['profile.dailyCapacityTons']}>
                    <Campo id={fid('dailyCapacityTons')} valor={pv('dailyCapacityTons') || (ro ? '—' : '')} largura={90} num max={6}
                      onChange={ro ? undefined : (v) => setP('dailyCapacityTons', v.replace(/\D/g, ''))} />
                  </Linha>
                  <Linha id={fid('responsible')} rotulo={rotuloResp} seta={{ titulo: 'Abrir colaboradores', abrir: lista('colaboradores') }}>
                    {sel('responsible', colaboradores.map((c) => ({ valor: c.name, rotulo: c.name })))}
                  </Linha>
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('principal')} rotulo="Contato principal" largura={146} seta={{ titulo: 'Abrir contatos', abrir: () => setTab('cont') }}>
                    <Campo id={fid('principal')} valor={principal?.name ?? ''} ro />
                  </Linha>
                  <Linha id={fid('defaultCarrier')} rotulo="Transportadora padrão" largura={146}
                    seta={{ titulo: 'Abrir transportadora', abrir: () => (transpSel ? win.open('partner', `TRANSPORTADORA:${transpSel.id}`) : win.open('cadastro-lista', 'transportadoras')) }}>
                    {sel('defaultCarrier', transportadoras.filter((t) => t.status === 'ATIVO').map((t) => ({ valor: t.legalName, rotulo: t.legalName })))}
                  </Linha>
                  <Linha id={fid('territory')} rotulo="Território" largura={146}>{txt('territory', '100%', { max: 100 })}</Linha>
                  <Linha id={fid('origin')} rotulo="Origem" largura={146}>{sel('origin', op(ORIGENS))}</Linha>
                  <Linha id={fid('notes')} rotulo="Observações" largura={146} alto>
                    <Observacoes id={fid('notes')} valor={pv('notes')} onChange={ro ? undefined : (v) => setP('notes', v)} />
                  </Linha>
                </div>
              </div>
              <fieldset className="rp-ficha-situacao">
                <legend>Situação</legend>
                {(['ATIVO', 'INATIVO', 'BLOQUEADO'] as Situacao[]).map((s) => (
                  <label key={s} htmlFor={fid(`sit-${s}`)}>
                    <input id={fid(`sit-${s}`)} name={fid('sit')} type="radio" checked={form.situacao === s} onChange={() => set({ situacao: s })} />
                    {s === 'ATIVO' ? 'Ativo' : s === 'INATIVO' ? 'Inativo' : 'Bloqueado'}
                  </label>
                ))}
                <span className="rp-ficha-situacao__par">
                  <label htmlFor={fid('blockedFrom')}>De</label>
                  <Campo id={fid('blockedFrom')} valor={pv('blockedFrom')} largura={96} max={10} placeholder="DD/MM/AAAA" erro={erros['profile.blockedFrom']}
                    onChange={ro || form.situacao !== 'BLOQUEADO' ? undefined : (v) => setP('blockedFrom', v)} />
                  <label htmlFor={fid('blockedTo')}>Até</label>
                  <Campo id={fid('blockedTo')} valor={pv('blockedTo')} largura={96} max={10} placeholder="DD/MM/AAAA" erro={erros['profile.blockedTo']}
                    onChange={ro || form.situacao !== 'BLOQUEADO' ? undefined : (v) => setP('blockedTo', v)} />
                </span>
                <span className="rp-ficha-situacao__motivo">
                  <label htmlFor={fid('motivo')}>Motivo</label>
                  <Campo id={fid('motivo')} valor={form.motivo} max={300} onChange={ro || form.situacao === 'ATIVO' ? undefined : (v) => set({ motivo: v })} />
                </span>
              </fieldset>
            </>
          )}

          {tab === 'end' && (
            <div className="rp-ficha__aba">
              <GradeSimples rotulo="Endereços" linhas={form.units} sel={selEnd} onSel={setSelEnd} chave={(u, i) => u.id ?? `n${i}`}
                vazio="Nenhum endereço. Use Adicionar endereço."
                colunas={[
                  { rotulo: 'Tipo', largura: '110px', valor: (u, i) => (ro ? TIPO_END[u.kind] : (
                    <Selecao aria-label={`Tipo do endereço ${i + 1}`} valor={u.kind} onChange={(v) => setEnd(i, { kind: v as TipoEndereco })}
                      opcoes={Object.entries(TIPO_END).map(([valor, rotulo]) => ({ valor, rotulo }))} />)) },
                  { rotulo: 'Logradouro', largura: 'minmax(0,2fr)', valor: (u, i) => celula(u.street, (v) => setEnd(i, { street: v }), `Logradouro ${i + 1}`, 200, erros[`units[${i}].street`]) },
                  { rotulo: 'Nº', largura: '60px', num: true, valor: (u, i) => celula(u.number, (v) => setEnd(i, { number: v }), `Número ${i + 1}`, 20) },
                  { rotulo: 'Bairro', largura: 'minmax(0,1fr)', valor: (u, i) => celula(u.district, (v) => setEnd(i, { district: v }), `Bairro ${i + 1}`, 100) },
                  { rotulo: 'Cidade', largura: 'minmax(0,1fr)', valor: (u, i) => celula(u.city, (v) => setEnd(i, { city: v }), `Cidade ${i + 1}`, 100, erros[`units[${i}].city`]) },
                  { rotulo: 'UF', largura: '50px', valor: (u, i) => (ro ? u.state : (
                    <Selecao aria-label={`UF ${i + 1}`} valor={u.state} onChange={(v) => setEnd(i, { state: v })} opcoes={[{ valor: '', rotulo: '' }, ...UFS.map((x) => ({ valor: x, rotulo: x }))]} />)) },
                  { rotulo: 'CEP', largura: '90px', valor: (u, i) => celula(ro ? cep(u.postalCode) : u.postalCode, (v) => setEnd(i, { postalCode: v }), `CEP ${i + 1}`, 9, erros[`units[${i}].postalCode`]) },
                  { rotulo: 'Padrão', largura: '70px', valor: (u, i) => (ro ? (u.isDefault ? 'Sim' : 'Não') : (
                    <Marca id={fid(`padrao-${i}`)} rotulo={u.isDefault ? 'Sim' : 'Não'} marcado={u.isDefault} onChange={(v) => setEnd(i, { isDefault: v })} />)) },
                ]} />
              <div className="rp-ficha__botoes">
                <button type="button" className="rp-btn" disabled={ro} onClick={() => {
                  set({ units: [...form.units, { id: null, kind: form.units.length ? 'ENTREGA' : 'COBRANCA', name: '', street: '', number: '', district: '', city: '', state: '', postalCode: '', cnpj: '', isDefault: !form.units.length }] });
                  setSelEnd(form.units.length);
                }}>Adicionar endereço</button>
                <button type="button" className="rp-btn" disabled={ro || selEnd === null} onClick={() => {
                  set({ units: form.units.filter((_, j) => j !== selEnd) });
                  setSelEnd(null);
                }}>Remover</button>
              </div>
            </div>
          )}

          {tab === 'cont' && (
            <div className="rp-ficha-contatos">
              <div role="listbox" aria-label="Contatos" className="rp-ficha-contatos__lista rp-rolagem">
                {form.contacts.map((c, i) => (
                  <div key={c.id ?? `n${i}`} role="option" tabIndex={0} aria-selected={i === selCont} onClick={() => setSelCont(i)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelCont(i)}>
                    <span>{c.name || 'Novo contato'}</span><span>{c.role}</span>
                  </div>
                ))}
              </div>
              <div className="rp-ficha__coluna">
                {contato ? (
                  <>
                    <Linha id={fid('c-nome')} rotulo="Nome" req erro={erros[`contacts[${selCont}].name`]}>
                      <Campo id={fid('c-nome')} valor={contato.name} max={120} onChange={ro ? undefined : (v) => setCont(selCont, { name: v })} erro={erros[`contacts[${selCont}].name`]} />
                    </Linha>
                    <Linha id={fid('c-cargo')} rotulo="Cargo">
                      <Campo id={fid('c-cargo')} valor={contato.role} max={100} onChange={ro ? undefined : (v) => setCont(selCont, { role: v })} />
                    </Linha>
                    <Linha id={fid('c-tel')} rotulo="Telefone">
                      <Campo id={fid('c-tel')} valor={contato.phone} largura={180} max={30} onChange={ro ? undefined : (v) => setCont(selCont, { phone: v })} />
                    </Linha>
                    <Linha id={fid('c-email')} rotulo="E-mail" erro={erros[`contacts[${selCont}].email`]}>
                      <Campo id={fid('c-email')} valor={contato.email} max={200} onChange={ro ? undefined : (v) => setCont(selCont, { email: v })} erro={erros[`contacts[${selCont}].email`]} />
                    </Linha>
                    <div className="rp-ficha-contatos__marcas">
                      <Marca id={fid('c-princ')} rotulo="Contato principal" marcado={contato.primary} onChange={(v) => setCont(selCont, { primary: v })} />
                      <Marca id={fid('c-nfe')} rotulo="Recebe NF-e e boletos" marcado={contato.receivesInvoices} onChange={(v) => setCont(selCont, { receivesInvoices: v })} />
                    </div>
                  </>
                ) : (
                  <p className="rp-ficha-nota">Nenhum contato. Use Adicionar contato.</p>
                )}
                <div className="rp-ficha__botoes">
                  <button type="button" className="rp-btn" disabled={ro} onClick={() => {
                    set({ contacts: [...form.contacts, { id: null, name: '', role: '', phone: '', email: '', primary: form.contacts.length === 0, receivesInvoices: false }] });
                    setSelCont(form.contacts.length);
                  }}>Adicionar contato</button>
                  <button type="button" className="rp-btn" disabled={ro || !contato} onClick={() => {
                    set({ contacts: form.contacts.filter((_, j) => j !== selCont) });
                    setSelCont(0);
                  }}>Remover</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'pag' && (
            <div className="rp-ficha__duas">
              <div className="rp-ficha__coluna">
                <Secao>Condições</Secao>
                <Linha id={fid('paymentCondition')} rotulo="Condição de pagamento" largura={180} seta={{ titulo: 'Abrir condições de pagamento', abrir: () => win.open('cadastro-tabela', 'condicoes') }}>
                  {sel('paymentCondition', condicoes)}
                </Linha>
                <Linha id={fid('paymentMethod')} rotulo="Forma de pagamento" largura={180} seta={{ titulo: 'Abrir formas de pagamento', abrir: () => win.open('cadastro-tabela', 'formas') }}>
                  {sel('paymentMethod', formas)}
                </Linha>
                {papel === 'CLIENTE' && (
                  <>
                    <Linha id={fid('priceList')} rotulo="Tabela de preços" largura={180}>
                      {sel('priceList', tabelas.filter((t) => t.active).map((t) => ({ valor: t.code, rotulo: t.name })))}
                    </Linha>
                    <Linha id={fid('defaultDiscountPercent')} rotulo="Desconto padrão (%)" largura={180} erro={erros['profile.defaultDiscountPercent']}>
                      {txt('defaultDiscountPercent', 90, { num: true, max: 6 })}
                    </Linha>
                    <Linha id={fid('lateInterestPercent')} rotulo="Juros de mora (% a.m.)" largura={180} erro={erros['profile.lateInterestPercent']}>
                      {txt('lateInterestPercent', 90, { num: true, max: 6 })}
                    </Linha>
                  </>
                )}
              </div>
              <div className="rp-ficha__coluna">
                {papel === 'CLIENTE' ? (
                  <>
                    <Secao>Crédito</Secao>
                    <Linha id={fid('creditLimitCents')} rotulo="Limite de crédito" largura={180} erro={erros['profile.creditLimitCents']}>
                      {txt('creditLimitCents', 150, { num: true, max: 20 })}
                    </Linha>
                    <Linha id={fid('creditUsed')} rotulo="Crédito utilizado" largura={180}>
                      <Campo id={fid('creditUsed')} valor={dinheiro(r?.creditUsedCents)} largura={150} num ro />
                    </Linha>
                    <Linha id={fid('creditFree')} rotulo="Crédito disponível" largura={180}>
                      <Campo id={fid('creditFree')} valor={(() => {
                        const lim = centavosParaApi(pv('creditLimitCents'));
                        return lim === null || !r ? '—' : centavos(Number(lim) - r.creditUsedCents);
                      })()} largura={150} num ro />
                    </Linha>
                  </>
                ) : (
                  <>
                    <Secao>Dados bancários</Secao>
                    <Linha id={fid('bankAgency')} rotulo="Banco / agência" largura={180}>{txt('bankAgency', '100%', { max: 60 })}</Linha>
                    <Linha id={fid('bankAccount')} rotulo="Conta corrente" largura={180}>{txt('bankAccount', 180, { max: 40 })}</Linha>
                    <Linha id={fid('leadTime')} rotulo="Prazo médio (dias)" largura={180} erro={erros.leadTimeDays}>
                      <Campo id={fid('leadTime')} valor={form.leadTimeDays} largura={90} num max={3}
                        onChange={ro || papel !== 'FORNECEDOR' ? undefined : (v) => set({ leadTimeDays: v.replace(/\D/g, '') })} />
                    </Linha>
                  </>
                )}
                <Linha id={fid('pixKey')} rotulo="Chave Pix" largura={180}>{txt('pixKey', '100%', { max: 120 })}</Linha>
              </div>
            </div>
          )}

          {tab === 'fis' && (
            <div className="rp-ficha__duas">
              <div className="rp-ficha__coluna">
                <Linha id={fid('taxRegime')} rotulo="Regime tributário" largura={180}>{sel('taxRegime', op(REGIMES))}</Linha>
                <Linha id={fid('icmsTaxpayer')} rotulo="Contribuinte do ICMS" largura={180}>{sel('icmsTaxpayer', op(ICMS))}</Linha>
                <Linha id={fid('municipalRegistration')} rotulo="Inscrição municipal" largura={180}>{txt('municipalRegistration', 180, { max: 30 })}</Linha>
                <Linha id={fid('cnae')} rotulo="CNAE principal" largura={180} erro={erros['profile.cnae']}>
                  {txt('cnae', 120, { max: 10 })}
                  <span className="rp-ficha-nota" title={pv('cnaeDescription')}>{pv('cnaeDescription')}</span>
                </Linha>
                <Linha id={fid('nfeEmail')} rotulo="E-mail para NF-e" largura={180} erro={erros['profile.nfeEmail']}>{txt('nfeEmail', '100%', { max: 200 })}</Linha>
              </div>
              <div className="rp-ficha__coluna">
                <Secao>Retenções na fonte</Secao>
                <div className="rp-ficha__tres">
                  {RETENCOES.map(([k, rotulo]) => (
                    <Marca key={k} id={fid(k)} rotulo={rotulo} marcado={pv(k) === 'true'} onChange={(v) => setP(k, v ? 'true' : '')} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'ativ' && (
            <div className="rp-ficha__aba">
              <p>Histórico de contatos: atividades do CRM ligadas a este parceiro. As concluídas ficam aqui como registro.</p>
              <GradeSimples rotulo="Atividades" linhas={atividades} chave={(a) => a.id} vazio="Nenhuma atividade registrada para este parceiro."
                colunas={[
                  { rotulo: 'Data', largura: '124px', valor: (a) => `${dataDaApi(a.day)} ${a.startTime.slice(0, 5)}` },
                  { rotulo: 'Tipo', largura: '130px', valor: (a) => <><i className={`rp-ico ${ICONE_ATIVIDADE[a.kind]}`} aria-hidden="true" />{TIPO_ATIVIDADE[a.kind]}</> },
                  { rotulo: 'Assunto', largura: 'minmax(0,2fr)', valor: (a) => a.subject, titulo: (a) => a.subject },
                  { rotulo: 'Oportunidade', largura: '130px', valor: (a) => (a.opportunityId
                    ? <><Seta titulo="Abrir oportunidade" abrir={() => win.open('opportunity', a.opportunityId!)} />{a.opportunityCode}</> : '—') },
                  { rotulo: 'Responsável', largura: 'minmax(0,1fr)', valor: (a) => a.owner || '—' },
                  { rotulo: 'Situação', largura: '100px', valor: (a) => <span className={classeSelo(SITUACAO_ATIVIDADE[a.situation])}>{SITUACAO_ATIVIDADE[a.situation]}</span> },
                ]} />
              <div className="rp-ficha__botoes">
                <button type="button" className="rp-btn" onClick={() => win.open('crm-agenda')}>Agenda de atividades</button>
                {papel === 'CLIENTE' && <button type="button" className="rp-btn" onClick={() => win.open('opportunities')}>Oportunidades do cliente</button>}
              </div>
            </div>
          )}

          {tab === 'doc' && <Anexos dono="partner" donoId={id} ro={!can('attachment.update')} />}
          {tab === 'hist' && <HistoricoFicha caminho={id ? `/api/v1/${rota}/${id}/history` : null} />}
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando || carregando}
            onClick={() => (podeGravar ? void gravar() : !alterado || !podeEditar ? win.requestClose() : undefined)}>
            {adicao ? 'Adicionar' : alterado ? 'Atualizar' : 'OK'}
          </button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
        </div>
        <div>
          <button type="button" className="rp-btn" disabled={adicao} onClick={() => win.open('crm-agenda')}>{comAtalho('Atividade', 'd')}</button>
          {papel === 'CLIENTE' && (
            <>
              <button type="button" className="rp-btn" disabled title="Os chamados entram com o módulo de pós-venda">{comAtalho('Chamados relacionados', 'm')}</button>
              <button type="button" className="rp-btn" disabled={adicao || inativo || !can('sales_order.create')}
                onClick={() => reg && win.open('order', `novo-${Date.now()}@${reg.id}`)}>{comAtalho('Criar pedido de venda', 'r')}</button>
            </>
          )}
          {papel === 'FORNECEDOR' && (
            <button type="button" className="rp-btn" disabled title="Os pedidos de compra entram com o módulo de compras">{comAtalho('Criar pedido de compra', 'r')}</button>
          )}
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Cadastro alterado por outra pessoa" objeto={`${nome.artigo} ${reg?.code ?? ''}`} versao={conflito}
          onRecarregar={() => { setConflito(null); if (id) void carregar(id, papel); }} onContinuar={() => setConflito(null)} />
      )}
      {excluir && reg && (
        <ConfirmaExclusao registro={registro} onSim={() => void confirmarExclusao()} onNao={() => setExcluir(false)}
          texto="O registro fica inativo: sai das listas de ativos e da navegação, e o histórico continua guardado." />
      )}
      {outroPapel && reg && (
        <div className="rp-modal rp-ficha-modal">
          <div className="rp rp-window rp-msgbox" role="alertdialog" aria-label="Novo papel do parceiro">
            <div className="rp-titlebar"><span>Novo papel do parceiro</span></div>
            <div className="rp-window-body">
              <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" />
              <div><b>{reg.legalName} ainda não é {NOME[outroPapel].tipo.toLowerCase()}.</b><br />Deseja dar esse papel ao mesmo cadastro (sem duplicar o CNPJ)?</div>
            </div>
            <div className="rp-window-foot">
              <button type="button" className="rp-btn rp-btn--default" onClick={() => void darPapel()}>Sim</button>
              <button type="button" className="rp-btn" onClick={() => setOutroPapel(null)}>Não</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function celula(valor: string, onChange: (v: string) => void, rotulo: string, max: number, erro?: string) {
    if (ro) return <span title={valor}>{valor}</span>;
    return <input className="rp-field" aria-label={rotulo} value={valor} maxLength={max} aria-invalid={!!erro} title={erro} onChange={(e) => onChange(e.target.value)} />;
  }
}
