import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Item, ItemCategory, PerfilValor, TipoItem, UnitOfMeasure } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CADASTROS_ALTERADOS } from './CadastroListaWindow';
import { novaChave } from './comum/Cadastros';
import { DialogoConflito } from './comum/Dialogos';
import {
  Abas, abaDaTecla, Anexos, BarraEdicao, BotaoAnalise, Campo, comAtalho, comAtual, ConfirmaExclusao, GradeSimples, HistoricoFicha,
  Linha, Marca, Observacoes, Secao, Seta, useApi, useReferencia, type Aba,
} from './comum/Ficha';
import { Selecao } from './comum/Selecao';
import { ORIGEM } from './FiscalClassificationWindow';

import { ITENS_ALTERADOS } from './ItemsWindow';

const TIPO: Record<TipoItem, string> = { PRODUTO: 'Produto', MATERIAL: 'Material', SERVICO: 'Serviço' };
const RASTREIO = ['Nenhuma', 'Lote', 'Número de série'];
const AVALIACAO = ['Custo médio ponderado', 'PEPS', 'Custo padrão'];
const SPED = ['00 — Mercadoria para revenda', '01 — Matéria-prima', '02 — Embalagem', '03 — Produto em processo', '04 — Produto acabado',
  '05 — Subproduto', '06 — Produto intermediário', '07 — Material de uso e consumo', '08 — Ativo imobilizado', '09 — Serviços',
  '10 — Outros insumos', '99 — Outras'];
const EXIGIBILIDADE = ['Exigível', 'Não incidência', 'Isenção', 'Exportação', 'Imunidade', 'Suspensa por decisão judicial', 'Suspensa por processo administrativo'];
const INCIDENCIA = ['Município do prestador', 'Município do tomador'];

type TabId = 'geral' | 'vendas' | 'compras' | 'estoque' | 'engenharia' | 'fiscal' | 'doc' | 'hist';
const ABAS_MATERIAL: Aba<TabId>[] = [
  { id: 'geral', rotulo: 'Geral', tecla: 'G' }, { id: 'vendas', rotulo: 'Vendas', tecla: 'V' }, { id: 'compras', rotulo: 'Compras', tecla: 'C' },
  { id: 'estoque', rotulo: 'Estoque', tecla: 't' }, { id: 'engenharia', rotulo: 'Engenharia', tecla: 'n' }, { id: 'fiscal', rotulo: 'Fiscal', tecla: 'F' },
  { id: 'doc', rotulo: 'Documentos', tecla: 'u' }, { id: 'hist', rotulo: 'Histórico', tecla: 'H' },
];
const ABAS_SERVICO: Aba<TabId>[] = [
  { id: 'geral', rotulo: 'Geral', tecla: 'G' }, { id: 'vendas', rotulo: 'Vendas', tecla: 'V' }, { id: 'fiscal', rotulo: 'Fiscal', tecla: 'F' },
  { id: 'doc', rotulo: 'Documentos', tecla: 'u' }, { id: 'hist', rotulo: 'Histórico', tecla: 'H' },
];

/** Título de abertura pela chave ("novo-PRODUTO-1" ou o id). */
export const tituloItem = (recordKey: string) => (recordKey.startsWith('novo-') ? 'Dados mestre do item — novo' : 'Dados mestre do item');

type Situacao = 'ATIVO' | 'INATIVO' | 'BLOQUEADO';
type Form = {
  code: string; serie: 'AUTO' | 'MANUAL'; type: TipoItem; description: string; uom: string; categoryId: string; referenceCost: string;
  ncm: string; serviceCode: string; p: Record<string, string>; situacao: Situacao; origin: string; nbs: string;
  precos: Record<string, string>;
};

const DINHEIRO = new Set(['salePriceCents']);
const DECIMAIS: Record<string, number> = {
  grossWeightKg: 3, netWeightKg: 3, commissionPercent: 2, maxDiscountPercent: 2, conversionFactor: 3, minLot: 0, minStock: 0, maxStock: 0,
  standardHours: 1, ipiRate: 2, issRate: 2,
};
const BOOLEANO = new Set(['stockItem', 'salesItem', 'purchaseItem', 'manufactured', 'blockedForPurchase']);
const INTEIRO = new Set(['warrantyMonths', 'unitsPerPackage', 'leadTimeDays']);

const deApi = (k: string, v: PerfilValor | undefined): string => {
  if (v === undefined || v === null) return '';
  if (BOOLEANO.has(k)) return v === true ? 'true' : '';
  if (DINHEIRO.has(k)) return centavos(v as number);
  if (k in DECIMAIS) return decimalDaApi(String(v), DECIMAIS[k]);
  return String(v);
};
const paraApi = (k: string, v: string): PerfilValor | null => {
  if (!v.trim()) return null;
  if (BOOLEANO.has(k)) return v === 'true';
  if (DINHEIRO.has(k)) return centavosParaApi(v);
  if (k in DECIMAIS) return decimalParaApi(v);
  if (INTEIRO.has(k)) return v.replace(/\D/g, '');
  return v.trim();
};
const ncmFormatado = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : v;
};

const tipoDaChave = (recordKey: string): TipoItem => {
  const t = recordKey.startsWith('novo-') ? recordKey.split('-')[1] : '';
  return t === 'SERVICO' || t === 'MATERIAL' ? t : 'PRODUTO';
};

const vazio = (type: TipoItem): Form => ({
  code: '', serie: 'AUTO', type, description: '', uom: type === 'SERVICO' ? 'SV' : 'UN', categoryId: '', referenceCost: '', ncm: '', serviceCode: '',
  p: type === 'SERVICO' ? { salesItem: 'true' } : type === 'PRODUTO' ? { stockItem: 'true', salesItem: 'true', manufactured: 'true' } : { stockItem: 'true', purchaseItem: 'true' },
  situacao: 'ATIVO', origin: '', nbs: '', precos: {},
});

type Fiscal = { ncm: string | null; serviceCode: string | null; cfopInternal: string | null; cfopInterstate: string | null; csosn: string | null; origin: string | null; annex: string | null; activityId: string | null; nbs: string | null; issRetention: string | null; review: boolean; reviewNote: string | null; version: string };
type Preco = { priceListId: string; code: string; name: string; validFrom: string; validTo: string | null; priceCents: number; updatedAt: string; updatedBy: string };
type TabelaPreco = { id: string; code: string; name: string; validFrom: string; validTo: string | null; active: boolean };
type Saldo = { id: string; warehouseId: string; warehouseCode: string; warehouseName: string; locationId: string | null; locationCode: string | null; lot: string | null; onHand: string; reserved: string; onOrder: string; averageCost: string | null };
type Componente = { code: string; itemId: string | null; kind: string; description: string; quantity: string; uom: string; totalCost: string | null; revision: number };
type Resumo = {
  onHand?: string; reserved?: string; available?: string; onOrder?: string; averageCost: string | null; salePriceCents: number | null; standardCost: string | null;
  activeContracts: number; executionsYear: number; marginPercent: string | null; bomComponents: Componente[]; whereUsed: { code: string; name: string }[];
};

const toForm = (x: Item, fiscal: Fiscal | null, precos: Preco[]): Form => ({
  code: x.code, serie: 'AUTO', type: x.type ?? (x.nature === 'SERVICO' ? 'SERVICO' : 'MATERIAL'), description: x.description, uom: x.uom,
  categoryId: x.category.id, referenceCost: decimalDaApi(x.referenceCost), ncm: x.ncm ? ncmFormatado(x.ncm) : '', serviceCode: x.serviceCode ?? '',
  p: { ...Object.fromEntries(Object.entries(x.profile ?? {}).map(([k, v]) => [k, deApi(k, v)])), stockItem: x.stockControlled ? 'true' : '' },
  situacao: x.status === 'INATIVO' ? 'INATIVO' : x.profile?.blockedForPurchase === true ? 'BLOQUEADO' : 'ATIVO',
  origin: fiscal?.origin ?? '', nbs: fiscal?.nbs ?? '',
  precos: Object.fromEntries(precos.map((p) => [p.priceListId, centavos(p.priceCents)])),
});

/**
 * Ficha do item do mock (Cadastros-Item): produto, material e serviço. Cabeçalho com código, tipo, descrições, categoria,
 * marca, unidade e GTIN; a foto; os indicadores de estoque e preço (no serviço: preço, custo padrão, contratos,
 * execuções e margem) e as marcas Item de estoque/venda/compra/fabricado. Abas Geral, Vendas, Compras, Estoque,
 * Engenharia, Fiscal e Documentos (serviço: Geral, Vendas, Fiscal e Documentos) e o Histórico.
 */
export function ItemWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [reg, setReg] = useState<Item | null>(null);
  const [etag, setEtag] = useState('');
  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [form, setForm] = useState<Form>(() => vazio(tipoDaChave(recordKey)));
  const [tab, setTab] = useState<TabId>('geral');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [saldos, setSaldos] = useState<Saldo[] | null>(null);
  const [foto, setFoto] = useState<{ id: string; url: string } | null>(null);
  const chave = useRef(novaChave());
  const inputFoto = useRef<HTMLInputElement>(null);

  const unidades = useApi<UnitOfMeasure[]>('/api/v1/units-of-measure', []);
  const categorias = useApi<ItemCategory[]>('/api/v1/item-categories', []);
  const marcas = useReferencia('marcas');
  const tabelas = useApi<TabelaPreco[]>(can('price_list.read') ? '/api/v1/price-lists' : null, []);
  const depositos = useApi<{ id: string; code: string; name: string }[]>(can('stock.read') ? '/api/v1/warehouses' : null, []);
  const fornecedores = useApi<{ id: string; legalName: string; status: string }[]>(can('partner.read') ? '/api/v1/suppliers' : null, []);

  const servico = form.type === 'SERVICO';
  const adicao = reg === null;
  const inativo = reg?.status === 'INATIVO';
  const podeEditar = adicao ? can('item.create') : can('item.update');
  const ro = !podeEditar || (!adicao && !editando);
  const original = useMemo(() => (reg ? toForm(reg, fiscal, precos) : vazio(tipoDaChave(recordKey))), [reg, fiscal, precos, recordKey]);
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);
  const registro = reg ? `o item ${reg.code}` : 'o item novo';
  const abas = (servico ? ABAS_SERVICO : ABAS_MATERIAL).map((a) => ((a.id === 'doc' || a.id === 'hist') && adicao ? { ...a, desabilitada: true } : a));

  useEffect(() => win.setDirty(alterado), [alterado, win]);
  useEffect(() => win.setTitle?.(`Dados mestre do item — ${reg ? reg.code : 'novo'}`), [reg, win]);

  const carregarExtras = useCallback((iid: string) => {
    api.get<Resumo>(`/api/v1/cadastros/items/${iid}/summary`).then((r) => setResumo(r.data)).catch(() => setResumo(null));
    if (can('stock.read')) api.get<Saldo[]>(`/api/v1/stock-balances?itemId=${iid}`).then((r) => setSaldos(r.data)).catch(() => setSaldos([]));
    if (can('attachment.read')) {
      api.get<{ id: string; kind: string }[]>(`/api/v1/attachments?ownerEntity=item&ownerId=${iid}`).then(async (r) => {
        const f = [...r.data].reverse().find((a) => a.kind === 'Foto');
        if (!f) return setFoto(null);
        const c = await api.get<{ contentType: string; contentBase64: string }>(`/api/v1/attachments/${f.id}/content`);
        setFoto({ id: f.id, url: `data:${c.data.contentType};base64,${c.data.contentBase64}` });
      }).catch(() => setFoto(null));
    }
  }, [can]);

  const carregar = useCallback(async (iid: string) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const [r, f, p] = await Promise.all([
        api.get<Item>(`/api/v1/items/${iid}`),
        can('tax.read') ? api.get<Fiscal>(`/api/v1/fiscal-classification/${iid}`).catch(() => null) : Promise.resolve(null),
        can('price_list.read') ? api.get<Preco[]>(`/api/v1/price-lists/items/${iid}`).catch(() => null) : Promise.resolve(null),
      ]);
      const fis = f ? { ...f.data, version: (f.etag ?? `"${f.data.version}"`) } : null;
      setReg(r.data);
      setId(r.data.id);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setFiscal(fis);
      setPrecos(p?.data ?? []);
      setForm(toForm(r.data, fis, p?.data ?? []));
      setErros({});
      carregarExtras(iid);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setCarregando(false);
    }
  }, [can, carregarExtras]);

  useEffect(() => {
    if (id) void carregar(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formRef = useRef(form);
  formRef.current = form;

  const falha = useCallback((e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      winRef.current.notify({ tone: 'aviso', text: `O item foi alterado por outra pessoa; nada foi gravado (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.status === 422) {
      const map: Record<string, string> = {};
      x.details.forEach((d) => d.field && (map[d.field] = d.message));
      setErros(map);
      const k = Object.keys(map)[0] ?? '';
      const aba: TabId = /salesUom|unitsPerPackage|commission|maxDiscount|salePrice/.test(k) ? 'vendas'
        : /preferredSupplier|supplierItemCode|purchaseUom|conversionFactor|leadTime|minLot/.test(k) ? 'compras'
          : /valuation|defaultWarehouse|minStock|maxStock/.test(k) ? 'estoque'
            : /engineering|bom|drawing|routing|standardHours/.test(k) ? 'engenharia'
              : /ncm|serviceCode|cest|sped|ipi|taxBenefit|iss|origin|nbs/.test(k) ? 'fiscal' : 'geral';
      if (k) setTab(aba);
      const detalhe = x.details[0]?.message;
      winRef.current.notify({ tone: 'erro', text: `${x.message}${detalhe && detalhe !== x.message ? ` ${detalhe}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
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
      const p = { ...f.p, blockedForPurchase: f.situacao === 'BLOQUEADO' ? 'true' : '' };
      const profile: Record<string, PerfilValor> = {};
      Object.entries(p).forEach(([k, v]) => {
        if (k === 'stockItem') return;
        const a = paraApi(k, v ?? '');
        if (a !== null && a !== '') profile[k] = a;
      });
      if (f.p.stockItem === 'true' && f.type !== 'SERVICO') profile.stockItem = true;
      const body = {
        code: adicao && f.serie === 'MANUAL' ? f.code.trim() || null : null,
        description: f.description.trim() || null,
        nature: f.type === 'SERVICO' ? 'SERVICO' : 'MATERIAL',
        type: f.type,
        uom: f.uom,
        categoryId: f.categoryId || null,
        stockControlled: f.type !== 'SERVICO' && f.p.stockItem === 'true',
        referenceCost: decimalParaApi(f.referenceCost),
        ncm: f.type === 'SERVICO' ? null : f.ncm.replace(/\D/g, '') || null,
        serviceCode: f.type === 'SERVICO' ? f.serviceCode.trim() || null : null,
        conversions: reg?.conversions ?? [],
        profile,
      };
      let r = reg
        ? await api.put<Item>(`/api/v1/items/${reg.id}`, body, etag)
        : await api.post<Item>('/api/v1/items', body, { 'Idempotency-Key': chave.current });
      if (f.situacao === 'INATIVO' && r.data.status === 'ATIVO') {
        r = await api.post<Item>(`/api/v1/items/${r.data.id}/deactivate`, { reason: 'Inativado na ficha' }, { 'If-Match': r.etag ?? `"${r.data.version}"` });
      } else if (f.situacao !== 'INATIVO' && r.data.status === 'INATIVO') {
        r = await api.post<Item>(`/api/v1/items/${r.data.id}/reactivate`, undefined, { 'If-Match': r.etag ?? `"${r.data.version}"` });
      }
      const iid = r.data.id;
      // Origem e NBS ficam na classificação fiscal do item.
      if (can('tax_classification.update') && (f.origin !== (fiscal?.origin ?? '') || f.nbs !== (fiscal?.nbs ?? ''))) {
        // Relido depois de gravar o item: a versão da classificação acompanha a do item.
        const atual = await api.get<Fiscal>(`/api/v1/fiscal-classification/${iid}`).then((x) => ({ ...x.data, version: x.etag ?? `"${x.data.version}"` }));
        await api.put(`/api/v1/fiscal-classification/${iid}`, {
          ncm: body.ncm, serviceCode: body.serviceCode, cfopInternal: atual.cfopInternal, cfopInterstate: atual.cfopInterstate, csosn: atual.csosn,
          origin: f.origin || null, annex: atual.annex, activityId: atual.activityId, nbs: f.nbs.trim() || null, issRetention: atual.issRetention,
          review: atual.review, reviewNote: atual.reviewNote,
        }, atual.version);
      }
      // Preços por tabela (comercial).
      const precosAntes = reg ? original.precos : {};
      if (can('price_list.admin') && JSON.stringify(f.precos) !== JSON.stringify(precosAntes)) {
        await api.put(`/api/v1/price-lists/items/${iid}`, {
          rows: Object.entries(f.precos).filter(([, v]) => v.trim()).map(([priceListId, v]) => ({ priceListId, priceCents: Number(centavosParaApi(v)) })),
        }, '*');
      }
      const novo = !reg;
      setEditando(false);
      chave.current = novaChave();
      await carregar(iid);
      winRef.current.notify({ tone: 'sucesso', text: `Item ${r.data.code} ${novo ? 'adicionado' : 'atualizado'} com sucesso` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
      window.dispatchEvent(new Event(ITENS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [adicao, reg, etag, fiscal, can, original.precos, carregar, falha]);

  const confirmarExclusao = async () => {
    setExcluir(false);
    if (!reg) return;
    try {
      await api.post<Item>(`/api/v1/items/${reg.id}/deactivate`, { reason: 'Excluído na ficha (modo de edição)' }, { 'If-Match': etag });
      setEditando(false);
      await carregar(reg.id);
      winRef.current.notify({ tone: 'sucesso', text: `Item ${reg.code} inativado: sai das listas de ativos e o histórico continua guardado` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  const trocarFoto = async (arquivo: File | undefined) => {
    if (!arquivo || !id) return;
    if (arquivo.size > 10 * 1024 * 1024) {
      winRef.current.notify({ tone: 'erro', text: `${arquivo.name} tem mais de 10 MB; escolha uma foto menor (ANEXO-001)` });
      return;
    }
    const base64 = await new Promise<string>((ok, nok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => nok(r.error);
      r.readAsDataURL(arquivo);
    });
    try {
      await api.post('/api/v1/attachments', { ownerEntity: 'item', ownerId: id, kind: 'Foto', fileName: arquivo.name, contentType: arquivo.type || 'image/png', contentBase64: base64 });
      if (foto) await api.del(`/api/v1/attachments/${foto.id}`).catch(() => undefined);
      winRef.current.notify({ tone: 'sucesso', text: 'Foto do item atualizada' });
      carregarExtras(id);
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
  const excluirCmd = useMemo(() => (!adicao && can('item.deactivate') && !inativo ? () => setExcluir(true) : undefined), [adicao, can, inativo]);
  const novo = useMemo(() => (can('item.create') ? () => win.open('item', `novo-${form.type}-${Date.now()}`) : undefined), [can, form.type, win]);
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, editar, excluir: excluirCmd, novo }), [podeGravar, gravar, editar, excluirCmd, novo, win]);

  const set = (patch: Partial<Form>) => !ro && setForm((f) => ({ ...f, ...patch }));
  const setP = (k: string, v: string) => !ro && setForm((f) => ({ ...f, p: { ...f.p, [k]: v } }));
  const pv = (k: string) => form.p[k] ?? '';

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || excluir) return;
    if (e.altKey) {
      const a = abaDaTecla(abas, e.key);
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
  const op = (lista: string[]) => lista.map((x) => ({ valor: x, rotulo: x }));
  const sel = (k: string, opcoes: { valor: string; rotulo: string }[], largura = '100%') => (
    <Selecao id={fid(k)} valor={pv(k)} onChange={(v) => setP(k, v)} opcoes={comAtual(opcoes, pv(k))} disabled={!podeEditar} largura={largura}
      aria-invalid={!!erros[`profile.${k}`]} />
  );
  const txt = (k: string, largura: number | string = '100%', extra: { num?: boolean; max?: number } = {}) => (
    <Campo id={fid(k)} valor={pv(k) || (ro ? '—' : '')} onChange={ro ? undefined : (v) => setP(k, v)} largura={largura} erro={erros[`profile.${k}`]} {...extra} />
  );
  const qtd = (v: string | null | undefined, casas = 0) => (v === null || v === undefined ? '—' : decimalDaApi(v, casas));
  const r = resumo;
  const uom = form.uom || 'UN';
  const indicadores = servico ? [
    { rotulo: 'Preço de venda', valor: r?.salePriceCents == null ? '—' : centavos(r.salePriceCents) },
    { rotulo: 'Custo padrão', valor: r?.standardCost ? decimalDaApi(r.standardCost, 2) : '—' },
    { rotulo: 'Contratos ativos', valor: r ? String(r.activeContracts) : '—' },
    { rotulo: 'Execuções no ano', valor: r ? String(r.executionsYear) : '—' },
    { rotulo: 'Margem estimada (%)', valor: r?.marginPercent ? decimalDaApi(r.marginPercent, 2) : '—' },
  ] : [
    { rotulo: 'Em estoque', valor: qtd(r?.onHand) },
    { rotulo: 'Reservado', valor: qtd(r?.reserved) },
    { rotulo: 'Disponível', valor: qtd(r?.available) },
    { rotulo: 'Custo médio', valor: r?.averageCost ? decimalDaApi(r.averageCost, 2) : '—' },
    { rotulo: 'Preço de venda', valor: r?.salePriceCents == null ? '—' : centavos(r.salePriceCents) },
  ];
  const totais = (saldos ?? []).reduce((a, s) => ({
    onHand: a.onHand + Number(s.onHand), reserved: a.reserved + Number(s.reserved), onOrder: a.onOrder + Number(s.onOrder),
  }), { onHand: 0, reserved: 0, onOrder: 0 });
  const opcoesCategoria = categorias.filter((c) => c.status === 'ATIVO' || c.id === form.categoryId).map((c) => ({ valor: c.id, rotulo: c.name }));
  const opcoesUnidade = unidades.filter((u) => u.status === 'ATIVO' || u.code === form.uom).map((u) => ({ valor: u.code, rotulo: u.code }));
  const linhasPreco = tabelas.filter((t) => t.active || form.precos[t.id]).map((t) => ({ t, p: precos.find((x) => x.priceListId === t.id) }));

  if (erroCarga) {
    return (
      <div className="rp-window-body rp-janela-mdi__corpo">
        <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}</p>
        <button type="button" className="rp-btn" onClick={() => id && void carregar(id)}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <>
      {editando && !adicao && (
        <BarraEdicao registro={registro} gravando={gravando} onCancelar={cancelarEdicao} onSalvar={() => void gravar()} onExcluir={excluirCmd} />
      )}
      <div className={`rp-window-body rp-janela-mdi__corpo rp-ficha${ro && !adicao ? ' rp-ficha--consulta' : ''}${editando ? ' rp-ficha--editando' : ''}`} onKeyDown={onKeyDown} aria-busy={carregando}>
        <div className="rp-ficha__cab rp-ficha__cab--item">
          <div className="rp-ficha__coluna">
            <Linha id={fid('codigo')} rotulo="Código" req erro={erros.code}>
              <Campo id={fid('codigo')} valor={form.code} largura={120} max={30} ro={!(adicao && form.serie === 'MANUAL')} erro={erros.code}
                placeholder={adicao && form.serie === 'AUTO' ? 'Automático' : undefined} onChange={adicao && form.serie === 'MANUAL' ? (v) => set({ code: v.toUpperCase() }) : undefined} />
              <Selecao aria-label="Tipo do item" valor={form.type} disabled={!podeEditar} largura="120px"
                onChange={(v) => (adicao || (v !== 'SERVICO' && form.type !== 'SERVICO')) && set({ type: v as TipoItem })}
                opcoes={Object.entries(TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
              {adicao && (
                <Selecao aria-label="Série" valor={form.serie} disabled={!podeEditar} largura="110px" onChange={(v) => set({ serie: v as Form['serie'], code: '' })}
                  opcoes={[{ valor: 'AUTO', rotulo: 'Automática' }, { valor: 'MANUAL', rotulo: 'Manual' }]} />
              )}
            </Linha>
            <Linha id={fid('descricao')} rotulo="Descrição" req erro={erros.description}>
              <Campo id={fid('descricao')} valor={form.description} max={200} onChange={ro ? undefined : (v) => set({ description: v })} erro={erros.description} />
            </Linha>
            <Linha id={fid('complement')} rotulo="Descrição complementar">{txt('complement', '100%', { max: 200 })}</Linha>
            <Linha id={fid('categoria')} rotulo="Categoria" erro={erros.categoryId} seta={{ titulo: 'Abrir categorias', abrir: () => win.open('cadastro-tabela', 'categorias') }}>
              <Selecao id={fid('categoria')} valor={form.categoryId} onChange={(v) => set({ categoryId: v })} disabled={!podeEditar} largura="100%"
                opcoes={comAtual(opcoesCategoria, form.categoryId)} aria-invalid={!!erros.categoryId} />
            </Linha>
            <Linha id={fid('brand')} rotulo="Marca" seta={{ titulo: 'Abrir marcas', abrir: () => win.open('cadastro-tabela', 'marcas') }}>
              {sel('brand', marcas)}
            </Linha>
            <Linha id={fid('uom')} rotulo="Unidade de medida" req erro={erros.uom} seta={{ titulo: 'Abrir unidades de medida', abrir: () => win.open('cadastro-tabela', 'unidades') }}>
              <Selecao id={fid('uom')} valor={form.uom} onChange={(v) => set({ uom: v })} disabled={!podeEditar} largura="120px" opcoes={comAtual(opcoesUnidade, form.uom)} />
            </Linha>
            <Linha id={fid('gtin')} rotulo="Código de barras (GTIN)" erro={erros['profile.gtin']}>{txt('gtin', 180, { max: 14 })}</Linha>
            <div className="rp-ficha-item__marcas">
              <Marca id={fid('stockItem')} rotulo="Item de estoque" marcado={pv('stockItem') === 'true'} onChange={(v) => setP('stockItem', v ? 'true' : '')} />
              <Marca id={fid('salesItem')} rotulo="Item de venda" marcado={pv('salesItem') === 'true'} onChange={(v) => setP('salesItem', v ? 'true' : '')} />
              <Marca id={fid('purchaseItem')} rotulo="Item de compra" marcado={pv('purchaseItem') === 'true'} onChange={(v) => setP('purchaseItem', v ? 'true' : '')} />
              <Marca id={fid('manufactured')} rotulo="Item fabricado" marcado={pv('manufactured') === 'true'} onChange={(v) => setP('manufactured', v ? 'true' : '')} />
            </div>
          </div>
          <div className="rp-ficha-item__foto">
            <div className="rp-ficha-item__moldura">{foto ? <img src={foto.url} alt={`Foto de ${form.description}`} /> : <span>[FOTO DO ITEM]</span>}</div>
            <input ref={inputFoto} type="file" accept="image/*" hidden onChange={(e) => (void trocarFoto(e.target.files?.[0]), (e.target.value = ''))} />
            <button type="button" className="rp-btn" disabled={adicao || !can('attachment.update')} title={adicao ? 'Grave o item para incluir a foto' : undefined}
              onClick={() => inputFoto.current?.click()}>Alterar foto</button>
          </div>
          <div className="rp-ficha-kpis">
            <div className="rp-ficha-kpis__nota">{servico ? 'Valores em R$' : `Quantidades em ${uom} · valores em R$`}</div>
            {indicadores.map((k) => (
              <Linha key={k.rotulo} rotulo={k.rotulo} largura={150}>
                <input className="rp-field rp-field--readonly rp-field--num" style={{ width: '130px' }} value={adicao ? '' : k.valor} readOnly aria-label={k.rotulo} />
                <BotaoAnalise titulo={`Análise de ${k.rotulo}`} onClick={adicao ? undefined : () => setTab(servico ? 'vendas' : k.rotulo === 'Preço de venda' ? 'vendas' : 'estoque')} />
              </Linha>
            ))}
          </div>
        </div>

        <Abas abas={abas} atual={tab} onTroca={setTab} rotulo="Abas da ficha do item" />
        <div role="tabpanel" className="rp-ficha__painel rp-rolagem">
          {tab === 'geral' && (
            <div className="rp-ficha__duas">
              <div className="rp-ficha__coluna">
                <Secao>Identificação</Secao>
                <Linha id={fid('manufacturer')} rotulo="Fabricante" largura={170}>{txt('manufacturer', '100%', { max: 120 })}</Linha>
                <Linha id={fid('manufacturerPartNumber')} rotulo="Nº de peça do fabricante" largura={170}>{txt('manufacturerPartNumber', 180, { max: 60 })}</Linha>
                <Linha id={fid('warrantyMonths')} rotulo="Garantia (meses)" largura={170} erro={erros['profile.warrantyMonths']}>{txt('warrantyMonths', 80, { num: true, max: 3 })}</Linha>
                <Linha id={fid('traceability')} rotulo="Rastreabilidade" largura={170}>{sel('traceability', op(RASTREIO))}</Linha>
                {!servico && (
                  <Linha id={fid('referenceCost')} rotulo="Custo de referência (R$)" largura={170} erro={erros.referenceCost}>
                    <Campo id={fid('referenceCost')} valor={form.referenceCost} largura={130} num max={20} onChange={ro ? undefined : (v) => set({ referenceCost: v })} erro={erros.referenceCost} />
                  </Linha>
                )}
                <fieldset className="rp-ficha-situacao">
                  <legend>Situação</legend>
                  {(['ATIVO', 'INATIVO', 'BLOQUEADO'] as Situacao[]).map((s) => (
                    <label key={s} htmlFor={fid(`sit-${s}`)}>
                      <input id={fid(`sit-${s}`)} name={fid('sit')} type="radio" checked={form.situacao === s} onChange={() => set({ situacao: s })} />
                      {s === 'ATIVO' ? 'Ativo' : s === 'INATIVO' ? 'Inativo' : 'Bloqueado para compra'}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="rp-ficha__coluna">
                <Secao>Dimensões e peso</Secao>
                <Linha id={fid('grossWeightKg')} rotulo="Peso bruto (kg)" largura={200} erro={erros['profile.grossWeightKg']}>{txt('grossWeightKg', 110, { num: true, max: 12 })}</Linha>
                <Linha id={fid('netWeightKg')} rotulo="Peso líquido (kg)" largura={200} erro={erros['profile.netWeightKg']}>{txt('netWeightKg', 110, { num: true, max: 12 })}</Linha>
                <Linha id={fid('dimensions')} rotulo="Comprimento × largura × altura" largura={200}>{txt('dimensions', 180, { max: 60 })}</Linha>
                <Linha id={fid('notes')} rotulo="Observações" largura={170} alto>
                  <Observacoes id={fid('notes')} valor={pv('notes')} onChange={ro ? undefined : (v) => setP('notes', v)} />
                </Linha>
              </div>
            </div>
          )}

          {tab === 'vendas' && (
            <div className="rp-ficha__aba">
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('salesUom')} rotulo="UM de venda" largura={170}>{sel('salesUom', opcoesUnidade, '120px')}</Linha>
                  <Linha id={fid('unitsPerPackage')} rotulo="Itens por embalagem" largura={170} erro={erros['profile.unitsPerPackage']}>{txt('unitsPerPackage', 80, { num: true, max: 6 })}</Linha>
                  <Linha id={fid('salePriceCents')} rotulo="Preço de venda (R$)" largura={170} erro={erros['profile.salePriceCents']}>{txt('salePriceCents', 130, { num: true, max: 20 })}</Linha>
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('commissionPercent')} rotulo="Comissão (%)" largura={170} erro={erros['profile.commissionPercent']}>{txt('commissionPercent', 80, { num: true, max: 6 })}</Linha>
                  <Linha id={fid('maxDiscountPercent')} rotulo="Desconto máximo (%)" largura={170} erro={erros['profile.maxDiscountPercent']}>{txt('maxDiscountPercent', 80, { num: true, max: 6 })}</Linha>
                </div>
              </div>
              <Secao>Preços por tabela</Secao>
              <GradeSimples rotulo="Preços por tabela" linhas={linhasPreco} chave={(l) => l.t.id}
                vazio={can('price_list.read') ? 'Nenhuma tabela de preços cadastrada.' : 'Sem permissão para ver as tabelas de preço.'}
                colunas={[
                  { rotulo: 'Tabela de preços', largura: 'minmax(0,2fr)', valor: (l) => <><Seta titulo={`Abrir ${l.t.name}`} abrir={() => win.open('cadastro-tabela', 'condicoes')} />{l.t.name}</> },
                  { rotulo: 'Preço (R$)', largura: '140px', num: true, valor: (l) => (ro || !can('price_list.admin') ? form.precos[l.t.id] ?? '' : (
                    <input className="rp-field rp-field--num" aria-label={`Preço em ${l.t.name}`} value={form.precos[l.t.id] ?? ''} maxLength={20}
                      onChange={(e) => set({ precos: { ...form.precos, [l.t.id]: e.target.value } })} />)) },
                  { rotulo: 'Vigência', largura: '200px', valor: (l) => `${dataDaApi(l.t.validFrom)}${l.t.validTo ? ` a ${dataDaApi(l.t.validTo)}` : ''}` },
                  { rotulo: 'Atualizado por', largura: 'minmax(0,1fr)', valor: (l) => l.p?.updatedBy ?? '' },
                ]} />
            </div>
          )}

          {tab === 'compras' && (
            <div className="rp-ficha__aba">
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('preferredSupplier')} rotulo="Fornecedor preferencial" largura={180}
                    seta={{ titulo: 'Abrir fornecedor', abrir: () => {
                      const f = fornecedores.find((x) => x.legalName === pv('preferredSupplier'));
                      if (f) win.open('partner', `FORNECEDOR:${f.id}`);
                      else win.open('cadastro-lista', 'fornecedores');
                    } }}>
                    {sel('preferredSupplier', fornecedores.filter((x) => x.status === 'ATIVO').map((x) => ({ valor: x.legalName, rotulo: x.legalName })))}
                  </Linha>
                  <Linha id={fid('supplierItemCode')} rotulo="Código no fornecedor" largura={180}>{txt('supplierItemCode', 180, { max: 60 })}</Linha>
                  <Linha id={fid('purchaseUom')} rotulo="UM de compra" largura={180}>{sel('purchaseUom', opcoesUnidade, '120px')}</Linha>
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('conversionFactor')} rotulo="Fator de conversão" largura={170} erro={erros['profile.conversionFactor']}>{txt('conversionFactor', 100, { num: true, max: 12 })}</Linha>
                  <Linha id={fid('leadTimeDays')} rotulo="Prazo de entrega (dias)" largura={170} erro={erros['profile.leadTimeDays']}>{txt('leadTimeDays', 80, { num: true, max: 3 })}</Linha>
                  <Linha id={fid('minLot')} rotulo="Lote mínimo" largura={170} erro={erros['profile.minLot']}>{txt('minLot', 100, { num: true, max: 10 })}</Linha>
                </div>
              </div>
              <Secao>Últimas compras</Secao>
              <GradeSimples rotulo="Últimas compras" linhas={[]} vazio="As compras deste item aparecem aqui quando o módulo de compras entrar em operação."
                colunas={[
                  { rotulo: 'Data', largura: '100px', valor: () => '' }, { rotulo: 'Pedido', largura: '120px', valor: () => '' },
                  { rotulo: 'Fornecedor', largura: 'minmax(0,1fr)', valor: () => '' }, { rotulo: 'Quantidade', largura: '110px', num: true, valor: () => '' },
                  { rotulo: 'Preço unitário (R$)', largura: '150px', num: true, valor: () => '' },
                ]} />
            </div>
          )}

          {tab === 'estoque' && (
            <div className="rp-ficha__aba">
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('valuationMethod')} rotulo="Método de avaliação" largura={170}>{sel('valuationMethod', op(AVALIACAO))}</Linha>
                  <Linha id={fid('defaultWarehouse')} rotulo="Depósito padrão" largura={170} seta={{ titulo: 'Abrir depósitos', abrir: () => win.open('cadastro-lista', 'depositos') }}>
                    {sel('defaultWarehouse', depositos.map((d) => ({ valor: d.code, rotulo: `${d.code} — ${d.name}` })))}
                  </Linha>
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('minStock')} rotulo="Estoque mínimo" largura={170} erro={erros['profile.minStock']}>{txt('minStock', 110, { num: true, max: 10 })}</Linha>
                  <Linha id={fid('maxStock')} rotulo="Estoque máximo" largura={170} erro={erros['profile.maxStock']}>{txt('maxStock', 110, { num: true, max: 10 })}</Linha>
                </div>
              </div>
              <Secao>Saldos por depósito</Secao>
              <GradeSimples rotulo="Saldos por depósito" linhas={saldos === null ? null : [...saldos, null]} chave={(s, i) => s?.id ?? `total-${i}`}
                vazio="Sem saldo informado para este item."
                colunas={[
                  { rotulo: 'Depósito', largura: 'minmax(0,2fr)', valor: (s) => (s
                    ? <><Seta titulo="Abrir depósito" abrir={() => win.open('locations', s.warehouseId)} />{s.warehouseCode} — {s.warehouseName}</>
                    : <b>Total</b>) },
                  { rotulo: 'Localização', largura: '140px', valor: (s) => (s ? (s.locationCode ?? '—') : '') },
                  { rotulo: 'Em estoque', largura: '110px', num: true, valor: (s) => (s ? decimalDaApi(s.onHand, 0) : <b>{decimalDaApi(String(totais.onHand), 0)}</b>) },
                  { rotulo: 'Reservado', largura: '110px', num: true, valor: (s) => (s ? decimalDaApi(s.reserved, 0) : <b>{decimalDaApi(String(totais.reserved), 0)}</b>) },
                  { rotulo: 'Em pedido', largura: '110px', num: true, valor: (s) => (s ? decimalDaApi(s.onOrder, 0) : <b>{decimalDaApi(String(totais.onOrder), 0)}</b>) },
                  { rotulo: 'Disponível', largura: '110px', num: true, valor: (s) => <b>{decimalDaApi(String(s ? Number(s.onHand) - Number(s.reserved) : totais.onHand - totais.reserved), 0)}</b> },
                ]} />
            </div>
          )}

          {tab === 'engenharia' && (
            <div className="rp-ficha__aba">
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('engineeringProduct')} rotulo="Produto de engenharia" largura={170} seta={{ titulo: 'Abrir modelos de equipamento', abrir: () => win.open('equipment-models') }}>
                    {txt('engineeringProduct', '100%', { max: 30 })}
                  </Linha>
                  <Linha id={fid('bomReference')} rotulo="Estrutura (BOM)" largura={170} seta={{ titulo: 'Abrir BOMs', abrir: () => win.open('boms') }}>
                    <Campo id={fid('bomReference')} valor={pv('bomReference') || '—'} ro={!editando || !podeEditar} onChange={editando ? (v) => setP('bomReference', v) : undefined} />
                  </Linha>
                  <Linha id={fid('bomRevision')} rotulo="Revisão vigente" largura={170}>
                    <Campo id={fid('bomRevision')} valor={pv('bomRevision') || '—'} largura={80} ro={!editando || !podeEditar} onChange={editando ? (v) => setP('bomRevision', v) : undefined} />
                  </Linha>
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('drawing')} rotulo="Desenho" largura={170} seta={{ titulo: 'Abrir documentos do item', abrir: () => setTab('doc') }}>{txt('drawing', '100%', { max: 60 })}</Linha>
                  <Linha id={fid('routing')} rotulo="Roteiro de fabricação" largura={170}>{txt('routing', '100%', { max: 120 })}</Linha>
                  <Linha id={fid('standardHours')} rotulo="Tempo padrão (h)" largura={170} erro={erros['profile.standardHours']}>{txt('standardHours', 80, { num: true, max: 8 })}</Linha>
                </div>
              </div>
              <Secao>Componentes do primeiro nível</Secao>
              <GradeSimples rotulo="Componentes do primeiro nível" linhas={r?.bomComponents ?? (id ? null : [])} chave={(c, i) => `${c.code}-${i}`}
                vazio={pv('bomReference') ? `A BOM ${pv('bomReference')} ainda não tem revisão com componentes.` : 'Informe a estrutura (BOM) para ver os componentes.'}
                colunas={[
                  { rotulo: 'Componente', largura: '150px', valor: (c) => (c.itemId ? <><Seta titulo={`Abrir ${c.code}`} abrir={() => win.open('item', c.itemId!)} />{c.code}</> : c.code) },
                  { rotulo: 'Descrição', largura: 'minmax(0,2fr)', valor: (c) => c.description },
                  { rotulo: 'Quantidade', largura: '110px', num: true, valor: (c) => decimalDaApi(c.quantity, c.uom === 'KG' || c.uom === 'M' ? 3 : 0) },
                  { rotulo: 'UM', largura: '60px', valor: (c) => c.uom },
                  { rotulo: 'Custo (R$)', largura: '130px', num: true, valor: (c) => (c.totalCost ? decimalDaApi(c.totalCost, 2) : '—') },
                ]} />
            </div>
          )}

          {tab === 'fiscal' && (
            <div className="rp-ficha__duas">
              {servico ? (
                <>
                  <div className="rp-ficha__coluna">
                    <Linha id={fid('serviceCode')} rotulo="Código de serviço (LC 116)" largura={190} erro={erros.serviceCode}>
                      <Campo id={fid('serviceCode')} valor={form.serviceCode} largura={140} max={10} onChange={ro ? undefined : (v) => set({ serviceCode: v })} erro={erros.serviceCode} />
                    </Linha>
                    <Linha id={fid('nbs')} rotulo="NBS" largura={190} erro={erros.nbs}>
                      <Campo id={fid('nbs')} valor={form.nbs} largura={140} max={12} onChange={ro || !can('tax_classification.update') ? undefined : (v) => set({ nbs: v })} erro={erros.nbs} />
                    </Linha>
                    <Linha id={fid('issExigibility')} rotulo="Exigibilidade do ISS" largura={190}>{sel('issExigibility', op(EXIGIBILIDADE))}</Linha>
                  </div>
                  <div className="rp-ficha__coluna">
                    <Linha id={fid('issIncidence')} rotulo="Local de incidência" largura={190}>{sel('issIncidence', op(INCIDENCIA))}</Linha>
                    <Linha id={fid('issRate')} rotulo="Alíquota de ISS (%)" largura={190} erro={erros['profile.issRate']}>{txt('issRate', 100, { num: true, max: 5 })}</Linha>
                    <Linha id={fid('taxBenefitCode')} rotulo="Código de benefício fiscal" largura={190}>{txt('taxBenefitCode', 140, { max: 10 })}</Linha>
                  </div>
                </>
              ) : (
                <>
                  <div className="rp-ficha__coluna">
                    <Linha id={fid('ncm')} rotulo="NCM" largura={190} erro={erros.ncm}>
                      <Campo id={fid('ncm')} valor={form.ncm} largura={140} max={10} onChange={ro ? undefined : (v) => set({ ncm: ncmFormatado(v) })} erro={erros.ncm} />
                    </Linha>
                    <Linha id={fid('cest')} rotulo="CEST" largura={190} erro={erros['profile.cest']}>{txt('cest', 140, { max: 9 })}</Linha>
                    <Linha id={fid('origin')} rotulo="Origem da mercadoria" largura={190}>
                      <Selecao id={fid('origin')} valor={form.origin} onChange={(v) => can('tax_classification.update') && set({ origin: v })} disabled={!podeEditar} largura="100%"
                        opcoes={comAtual(Object.entries(ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo })), form.origin)} />
                    </Linha>
                  </div>
                  <div className="rp-ficha__coluna">
                    <Linha id={fid('spedType')} rotulo="Tipo do item (SPED)" largura={190}>{sel('spedType', op(SPED))}</Linha>
                    <Linha id={fid('ipiRate')} rotulo="Alíquota de IPI (%)" largura={190} erro={erros['profile.ipiRate']}>{txt('ipiRate', 100, { num: true, max: 6 })}</Linha>
                    <Linha id={fid('taxBenefitCode')} rotulo="Código de benefício fiscal" largura={190}>{txt('taxBenefitCode', 140, { max: 10 })}</Linha>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'doc' && <Anexos dono="item" donoId={id} ro={!can('attachment.update')} />}
          {tab === 'hist' && <HistoricoFicha caminho={id ? `/api/v1/items/${id}/history` : null} />}
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
          {!servico && <button type="button" className="rp-btn" disabled={adicao || !can('bom.read')} onClick={() => win.open('boms')}>{comAtalho('Estrutura (BOM)', 'E')}</button>}
          <button type="button" className="rp-btn" disabled={adicao || !can('sales_order.read')} onClick={() => win.open('orders')}>{comAtalho('Relatório de vendas', 'v')}</button>
          {servico
            ? <button type="button" className="rp-btn" disabled={adicao || !can('sales_order.read')} onClick={() => win.open('orders')}>{comAtalho('Contratos relacionados', 'r')}</button>
            : <button type="button" className="rp-btn" disabled={adicao} onClick={() => setTab('estoque')} title="Os movimentos entram com o módulo de estoque; por enquanto, os saldos informados">{comAtalho('Movimentos de estoque', 'e')}</button>}
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Item alterado por outra pessoa" objeto={`o item ${reg?.code ?? ''}`} versao={conflito}
          onRecarregar={() => { setConflito(null); if (id) void carregar(id); }} onContinuar={() => setConflito(null)} />
      )}
      {excluir && reg && (
        <ConfirmaExclusao registro={registro} onSim={() => void confirmarExclusao()} onNao={() => setExcluir(false)}
          texto="O item fica inativo: sai das listas de ativos e da navegação, e o histórico continua guardado." />
      )}
    </>
  );
}
