import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Customer, CustomerSummary, Item, ItemSummary, LossReason, Opportunity, OpportunityStageChange } from '../api/types';
import { centavos, centavosParaApi, dataDaApi, dataHora, dataParaApi, decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { DialogoPerda, OPORTUNIDADES_ALTERADAS } from './comum/Crm';
import {
  avisarCrm, classeSelo, ICONE_ATIVIDADE, ORIGEM_MOCK, SITUACAO_ATIVIDADE, TIPO_ATIVIDADE, type Atividade,
} from './comum/CrmMock';
import { novaChave } from './comum/Cadastros';
import { DialogoConflito } from './comum/Dialogos';
import { Abas, abaDaTecla, comAtual, Seta, useApi, type Aba } from './comum/Ficha';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

type TabId = 'geral' | 'ativ' | 'prop' | 'hist' | 'obs';
const ABAS: Aba<TabId>[] = [
  { id: 'geral', rotulo: 'Geral', tecla: 'G' }, { id: 'ativ', rotulo: 'Atividades', tecla: 'A' }, { id: 'prop', rotulo: 'Propostas e pedidos', tecla: 'P' },
  { id: 'hist', rotulo: 'Histórico de etapas', tecla: 'H' }, { id: 'obs', rotulo: 'Observações', tecla: 'b' },
];
const INDUSTRIAS = ['Fecularia', 'Farinheira', 'Polvilharia', 'Fecularia e farinheira', 'Associação de produtores', 'Indústria'];
const LOCAIS = ['Moega de recebimento', 'Pátio de descarga', 'Laboratório de amostras', 'Balança rodoviária'];
const ENERGIA = ['220 V monofásica', '220 V trifásica', '380 V trifásica', '440 V trifásica'];
const CONCORRENTES = ['[CONCORRENTE A]', '[CONCORRENTE B]', 'Balança hidrostática manual', 'Nenhum'];

type Linha = { itemId: string | null; itemCode: string | null; description: string; uom: string; quantity: string; unitPrice: string };
type Need = { industry: string; dailyCapacityTons: string; receivingPits: string; installationSite: string; power: string; desiredStart: string; mainCompetitor: string };
type Form = {
  customerId: string; contactName: string; name: string; source: string; owner: string; stage: string; potential: string; expectedClose: string;
  notes: string; itens: Linha[]; need: Need;
};
type Detalhes = {
  contactName: string | null; need: Record<string, string | number>; items: { itemId: string | null; itemCode: string | null; description: string; uom: string; quantity: string; unitPrice: string; totalCents: number }[];
  documents: { kind: string; id: string; code: string; date: string | null; revision: number | null; totalCents: number; status: string }[];
  historicalWinPercent: number | null; historicalSample: number; version: number;
};

const NEED_VAZIA: Need = { industry: '', dailyCapacityTons: '', receivingPits: '', installationSite: '', power: '', desiredStart: '', mainCompetitor: '' };
const DOC_SITUACAO: Record<string, string> = { SUBSTITUIDA: 'Substituída', ENVIADA: 'Enviada ao cliente', RASCUNHO: 'Rascunho', GANHA: 'Aceita', PERDIDA: 'Perdida',
  DRAFT: 'Rascunho', CONFIRMED: 'Confirmado', IN_EXECUTION: 'Em execução', CANCELLED: 'Cancelado', COMPLETED: 'Concluído' };

const totalLinha = (l: Linha) => {
  const q = Number(decimalParaApi(l.quantity) ?? 0), p = Number(decimalParaApi(l.unitPrice) ?? 0);
  return Math.round(q * p * 100);
};

const toForm = (o: Opportunity | null, d: Detalhes | null, chave: { lead?: string; cliente?: string }): Form => ({
  customerId: o?.customerId ?? chave.cliente ?? '', contactName: d?.contactName ?? '', name: o?.name ?? '', source: o?.source ?? (chave.lead ? 'LISTA' : 'INDICACAO'),
  owner: o?.owner ?? '', stage: o?.stage ?? 'PROSPECCAO', potential: o ? centavos(o.potentialCents) : '', expectedClose: dataDaApi(o?.expectedClose ?? null), notes: o?.notes ?? '',
  itens: (d?.items ?? []).map((i) => ({ itemId: i.itemId, itemCode: i.itemCode, description: i.description, uom: i.uom, quantity: decimalDaApi(i.quantity, i.uom === 'H' || i.uom === 'KG' ? 3 : 3),
    unitPrice: decimalDaApi(i.unitPrice, 2) })),
  need: { ...NEED_VAZIA, ...Object.fromEntries(Object.entries(d?.need ?? {}).map(([k, v]) => [k, k === 'desiredStart' ? dataDaApi(String(v)) : String(v)])) },
});

/**
 * Oportunidade de venda do mock (CRM-Oportunidade): cliente (código com busca e o nome), contato, título, origem e
 * responsável; número com o selo da etapa, etapa, probabilidade com o histórico real de fechamento da etapa, valor
 * potencial e ponderado e a previsão; a barra de avanço no funil. Abas Geral (itens de interesse e necessidade do
 * cliente), Atividades, Propostas e pedidos, Histórico de etapas e Observações.
 */
export function OpportunityWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const m = /^novo-\d+:(lead|cliente):(.+)$/.exec(recordKey);
  const chave = { lead: m?.[1] === 'lead' ? m[2] : undefined, cliente: m?.[1] === 'cliente' ? m[2] : undefined };
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [reg, setReg] = useState<Opportunity | null>(null);
  const [det, setDet] = useState<Detalhes | null>(null);
  const [form, setForm] = useState<Form>(() => toForm(null, null, chave));
  const [tab, setTab] = useState<TabId>('geral');
  const [carregando, setCarregando] = useState(id !== null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [perder, setPerder] = useState(false);
  const [ativs, setAtivs] = useState<Atividade[] | null>(null);
  const [etapasHist, setEtapasHist] = useState<OpportunityStageChange[] | null>(null);
  const [contatos, setContatos] = useState<string[]>([]);
  const [busca, setBusca] = useState<string | null>(null);
  const [selItem, setSelItem] = useState<number | null>(null);
  const chaveIdem = useRef(novaChave());
  const clientes = useApi<CustomerSummary[]>('/api/v1/customers?status=TODOS', []);
  const itens = useApi<ItemSummary[]>('/api/v1/items?status=ATIVO', []);
  const donos = useApi<{ username: string; displayName: string }[]>('/api/v1/crm/owners', []);
  const etapas = useApi<{ code: string; name: string; position: number; closePercent: string }[]>('/api/v1/opportunity-stages', []);
  const lead = useApi<{ id: string; code: string; companyName: string; partnerId: string | null; contactName: string | null; owner: string } | null>(chave.lead ? `/api/v1/leads/${chave.lead}` : null, null);

  const adicao = reg === null;
  const aberta = !reg || reg.status === 'ABERTA';
  const podeEditar = (adicao ? can('opportunity.create') : can('opportunity.update')) && aberta;
  const original = useMemo(() => toForm(reg, det, chave), [reg, det]); // eslint-disable-line react-hooks/exhaustive-deps
  const alterado = JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado && podeEditar), [alterado, podeEditar, win]);
  useEffect(() => win.setTitle?.(`Oportunidade de venda${reg ? ` — ${reg.code}` : ' — nova'}`), [reg, win]);

  // Nova a partir do lead: o cliente ligado ao lead, o contato e o responsável.
  useEffect(() => {
    if (!lead || reg) return;
    setForm((f) => ({ ...f, customerId: f.customerId || lead.partnerId || '', contactName: f.contactName || lead.contactName || '', owner: f.owner || lead.owner,
      name: f.name || `Renda+ para ${lead.companyName}` }));
  }, [lead, reg]);

  const carregar = useCallback(async (oid: string) => {
    setCarregando(true);
    try {
      const [o, d] = await Promise.all([api.get<Opportunity>(`/api/v1/opportunities/${oid}`), api.get<Detalhes>(`/api/v1/opportunities/${oid}/details`)]);
      setReg(o.data);
      setDet(d.data);
      setForm(toForm(o.data, d.data, {}));
      setId(oid);
      setErros({});
      setAtivs(null);
      setEtapasHist(null);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    if (id) void carregar(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.customerId) return setContatos([]);
    api.get<Customer>(`/api/v1/customers/${form.customerId}`).then((r) => setContatos(r.data.contacts.map((c) => c.name ?? '').filter(Boolean))).catch(() => setContatos([]));
  }, [form.customerId]);
  useEffect(() => {
    if (!id) return;
    if (tab === 'ativ' && ativs === null) api.get<Atividade[]>(`/api/v1/crm/activities?opportunityId=${id}`).then((r) => setAtivs(r.data)).catch(() => setAtivs([]));
    if (tab === 'hist' && etapasHist === null) api.get<OpportunityStageChange[]>(`/api/v1/opportunities/${id}/stages`).then((r) => setEtapasHist(r.data)).catch(() => setEtapasHist([]));
  }, [tab, id, ativs, etapasHist]);

  const formRef = useRef(form);
  formRef.current = form;
  const falha = useCallback((e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) {
      setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
      return;
    }
    const map: Record<string, string> = {};
    x.details?.forEach((d) => d.field && (map[d.field] = d.message));
    setErros(map);
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${x.details?.[0] ? ` ${x.details[0].message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    const f = formRef.current;
    setGravando(true);
    try {
      const total = f.itens.reduce((a, l) => a + totalLinha(l), 0);
      const body = {
        name: f.name.trim() || null, leadId: reg?.leadId ?? chave.lead ?? null, customerId: f.customerId || null, unitId: reg?.unitId ?? null, owner: f.owner || null,
        source: f.source, interest: reg?.interest ?? 'MEDIO', potentialCents: f.itens.length ? String(total) : centavosParaApi(f.potential) ?? '0',
        expectedClose: f.expectedClose ? dataParaApi(f.expectedClose) : null, notes: f.notes.trim() || null,
        nextActionDate: reg?.nextActionDate ?? null, nextActionNote: reg?.nextActionNote ?? null, competitors: reg?.competitors ?? [],
      };
      let r = reg
        ? await api.put<Opportunity>(`/api/v1/opportunities/${reg.id}`, body, `"${reg.version}"`)
        : await api.post<Opportunity>('/api/v1/opportunities', body, { 'Idempotency-Key': chaveIdem.current });
      if (f.stage !== r.data.stage) {
        r = await api.post<Opportunity>(`/api/v1/opportunities/${r.data.id}/stage`, { stage: f.stage, note: 'Etapa alterada na ficha' }, { 'If-Match': r.etag ?? `"${r.data.version}"` });
      }
      const need = Object.fromEntries(Object.entries(f.need).filter(([, v]) => v.trim()).map(([k, v]) => [k, k === 'desiredStart' ? dataParaApi(v) : v.trim()]));
      await api.put(`/api/v1/opportunities/${r.data.id}/details`, {
        contactName: f.contactName || null, need,
        items: f.itens.map((l) => ({ itemId: l.itemId, description: l.description, uom: l.uom, quantity: decimalParaApi(l.quantity), unitPrice: decimalParaApi(l.unitPrice) })),
      }, r.etag ?? `"${r.data.version}"`);
      const novo = !reg;
      chaveIdem.current = novaChave();
      await carregar(r.data.id);
      winRef.current.notify({ tone: 'sucesso', text: `Oportunidade ${r.data.code} ${novo ? 'aberta' : 'atualizada'} com sucesso` });
      avisarCrm();
      window.dispatchEvent(new Event(OPORTUNIDADES_ALTERADAS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [reg, chave.lead, carregar, falha]);

  const confirmarPerda = async (motivo: LossReason, detalhe: string) => {
    setPerder(false);
    if (!reg) return;
    try {
      await api.post(`/api/v1/opportunities/${reg.id}/loss`, { lossReason: motivo, lossNote: detalhe || null }, { 'If-Match': `"${reg.version}"` });
      await carregar(reg.id);
      winRef.current.notify({ tone: 'aviso', text: `Oportunidade ${reg.code} marcada como perdida` });
      avisarCrm();
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && podeEditar && !gravando && !carregando;
  const novo = useMemo(() => (can('opportunity.create') ? () => win.open('opportunity', `novo-${Date.now()}`) : undefined), [can, win]);
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, novo }), [podeGravar, gravar, novo, win]);

  const set = (p: Partial<Form>) => podeEditar && setForm((f) => ({ ...f, ...p }));
  const setNeed = (k: keyof Need, v: string) => podeEditar && setForm((f) => ({ ...f, need: { ...f.need, [k]: v } }));
  const setLinha = (i: number, p: Partial<Linha>) => podeEditar && setForm((f) => ({ ...f, itens: f.itens.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const escolherItem = async (i: number, itemId: string) => {
    const s = itens.find((x) => x.id === itemId);
    if (!s) return;
    let preco = '';
    try {
      const r = await api.get<Item>(`/api/v1/items/${itemId}`);
      const c = r.data.profile?.salePriceCents;
      preco = c === undefined ? '' : centavos(c as number);
    } catch { /* sem preço de venda: fica em branco */ }
    setLinha(i, { itemId, itemCode: s.code, description: s.description, uom: s.uom, unitPrice: preco, quantity: form.itens[i]?.quantity || '1' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) {
      const a = abaDaTecla(ABAS, e.key);
      if (a) (e.preventDefault(), setTab(a));
    }
  };

  const cliente = clientes.find((c) => c.id === form.customerId);
  const etapaAtual = etapas.find((e) => e.code === form.stage);
  const status = reg?.status ?? 'ABERTA';
  const rotEtapa = status === 'GANHA' ? 'Ganha' : status === 'PERDIDA' ? 'Perdida' : etapaAtual?.name ?? '';
  const prob = status === 'GANHA' ? 100 : status === 'PERDIDA' ? 0 : Number(etapaAtual?.closePercent ?? 0);
  const totalItens = form.itens.reduce((a, l) => a + totalLinha(l), 0);
  const potencialCents = form.itens.length ? totalItens : Number(centavosParaApi(form.potential) ?? 0);
  const ponderado = Math.round((potencialCents * prob) / 100);
  const posicao = etapas.findIndex((e) => e.code === form.stage);
  const avanco = status === 'GANHA' ? 100 : etapas.length ? Math.round(((posicao + 1) / etapas.length) * 100) : 0;
  const fid = (k: string) => `${win.windowId}-${k}`;
  const candidatos = busca === null ? [] : clientes.filter((c) => c.status === 'ATIVO' && `${c.code} ${c.legalName}`.toLowerCase().includes(busca.toLowerCase())).slice(0, 8);

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-crmop rp-rolagem" onKeyDown={onKeyDown} aria-busy={carregando}>
        <div className="rp-crmop__cab">
          <div className={`rp-form${adicao ? ' rp-form--adicao' : ''} rp-crmop__esq`}>
            <span className="rp-label rp-label--req rp-link-field">
              <Seta titulo="Abrir cliente" abrir={() => form.customerId && win.open('partner', `CLIENTE:${form.customerId}`)} />Cliente
            </span>
            <div className="rp-crmop__cliente">
              <span className="rp-campo rp-crmop__busca">
                <input className="rp-field" id={fid('cli')} aria-label="Código do cliente" value={busca ?? cliente?.code ?? ''} readOnly={!podeEditar}
                  aria-invalid={!!erros.customerId} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTimeout(() => setBusca(null), 200)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && candidatos[0]) (set({ customerId: candidatos[0].id, contactName: '' }), setBusca(null)); }} />
                <button type="button" className="rp-campo-btn" title="Procurar cliente" aria-label="Procurar cliente" disabled={!podeEditar} onClick={() => setBusca(busca === null ? '' : null)}>
                  <i className="rp-ico rp-ico-consulta" aria-hidden="true" />
                </button>
                {candidatos.length > 0 && (
                  <div role="listbox" className="rp-search-list rp-crmop__lista">
                    {candidatos.map((c) => (
                      <div key={c.id} role="option" aria-selected={false} tabIndex={0} onMouseDown={() => (set({ customerId: c.id, contactName: '' }), setBusca(null))}>
                        {c.code} — {c.legalName}
                      </div>
                    ))}
                  </div>
                )}
              </span>
              <input className="rp-field rp-field--readonly" aria-label="Nome do cliente" value={cliente?.legalName ?? reg?.leadName ?? lead?.companyName ?? ''} readOnly />
            </div>
            <span className="rp-label">Contato</span>
            <Selecao aria-label="Contato" valor={form.contactName} onChange={(v) => set({ contactName: v })} disabled={!podeEditar}
              opcoes={comAtual(contatos.map((c) => ({ valor: c, rotulo: c })), form.contactName)} />
            <span className="rp-label rp-label--req">Título</span>
            <input className="rp-field" aria-label="Título" value={form.name} maxLength={200} readOnly={!podeEditar} aria-invalid={!!erros.name} onChange={(e) => set({ name: e.target.value })} />
            <span className="rp-label rp-link-field">
              <Seta titulo="Abrir lead" abrir={() => (reg?.leadId || chave.lead ? win.open('leads') : undefined)} />Origem
            </span>
            <Selecao aria-label="Origem" valor={form.source} onChange={(v) => set({ source: v })} disabled={!podeEditar}
              opcoes={Object.entries(ORIGEM_MOCK).map(([valor, rotulo]) => ({ valor, rotulo }))} />
            <span className="rp-label">Responsável</span>
            <Selecao aria-label="Responsável" valor={form.owner} onChange={(v) => set({ owner: v })} disabled={!podeEditar}
              opcoes={comAtual(donos.map((d) => ({ valor: d.username, rotulo: d.displayName })), form.owner)} />
          </div>
          <div className={`rp-form${adicao ? ' rp-form--adicao' : ''} rp-crmop__dir`}>
            <span className="rp-label">Número</span>
            <div className="rp-crmop__linha">
              <input className="rp-field rp-field--readonly rp-crmop__num" aria-label="Número" value={reg?.code ?? 'Automático'} readOnly />
              <span className={classeSelo(rotEtapa)}>{rotEtapa}</span>
            </div>
            <span className="rp-label rp-label--req">Etapa</span>
            <Selecao aria-label="Etapa" valor={form.stage} onChange={(v) => set({ stage: v })} disabled={!podeEditar} opcoes={etapas.map((e) => ({ valor: e.code, rotulo: e.name }))} />
            <span className="rp-label">Probabilidade %</span>
            <div className="rp-crmop__linha">
              <input className="rp-field rp-field--readonly rp-field--num rp-crmop__pct" aria-label="Probabilidade" value={prob} readOnly />
              {det?.historicalWinPercent != null && status === 'ABERTA' && (
                <span className="rp-ai-hint" title={`${det.historicalSample} oportunidades fechadas passaram por esta etapa`}>
                  <i className="rp-ico rp-ico-ia-previsao" aria-hidden="true" />Histórico: {det.historicalWinPercent}% fecham
                </span>
              )}
            </div>
            <span className="rp-label">Valor potencial</span>
            <CampoDinheiro aria-label="Valor potencial" value={form.itens.length ? centavos(totalItens) : form.potential} readOnly={!podeEditar || form.itens.length > 0}
              title={form.itens.length ? 'Soma dos itens de interesse' : undefined} onChange={(e) => set({ potential: e.target.value })} />
            <span className="rp-label">Valor ponderado (R$)</span>
            <input className="rp-field rp-field--readonly rp-field--num" aria-label="Valor ponderado" value={centavos(ponderado)} readOnly />
            <span className="rp-label rp-label--req">Previsão de fechamento</span>
            <CampoData id={fid('prev')} valor={form.expectedClose} onChange={(v) => set({ expectedClose: v })} somenteLeitura={!podeEditar} invalido={!!erros.expectedClose} rotulo="Previsão de fechamento" />
          </div>
        </div>
        <div className="rp-progress-row rp-crmop__avanco">
          <span>Avanço no funil</span>
          <div className={`rp-progress${status === 'GANHA' ? ' rp-progress--ok' : ''}`} role="progressbar" aria-valuenow={avanco} aria-valuemin={0} aria-valuemax={100} aria-label="Avanço no funil">
            <span style={{ width: `${avanco}%` }} />
          </div>
          <b>{status === 'ABERTA' ? `Etapa ${posicao + 1} de ${etapas.length} · ${etapaAtual?.name ?? ''}` : rotEtapa}</b>
        </div>
        <Abas abas={ABAS.map((a) => (a.id !== 'geral' && a.id !== 'obs' && !id ? { ...a, desabilitada: true } : a))} atual={tab} onTroca={setTab} rotulo="Abas da oportunidade" />
        <div className="rp-tabpanel rp-crmop__painel">
          {tab === 'geral' && (
            <div className="rp-crmop__geral">
              <div className="rp-tabela">
                <div className="rp-tabela-acoes">
                  <span className="rp-tabela-tit">Itens de interesse</span>
                  <button type="button" className="rp-btn" disabled={!podeEditar} onClick={() => set({ itens: [...form.itens, { itemId: null, itemCode: null, description: '', uom: 'UN', quantity: '1', unitPrice: '' }] })}>Adicionar linha</button>
                  <button type="button" className="rp-btn" disabled={!podeEditar || selItem === null} onClick={() => (set({ itens: form.itens.filter((_, j) => j !== selItem) }), setSelItem(null))}>Remover</button>
                  <button type="button" className="rp-btn rp-btn--menu" disabled title="Copiar de outra oportunidade ou proposta: entra com o módulo Vendas">Copiar de</button>
                </div>
                <table className="rp-grid rp-grid--edicao rp-crmop__itens" aria-label="Itens de interesse">
                  <thead>
                    <tr><th style={{ width: '26px' }}>#</th><th style={{ width: '110px' }}>Nº do item</th><th>Descrição</th><th style={{ width: '40px' }}>UM</th>
                      <th className="num" style={{ width: '70px' }}>Qtd.</th><th className="num" style={{ width: '100px' }}>Preço unit.</th><th className="num" style={{ width: '110px' }}>Total da linha</th><th style={{ width: '18px' }} /></tr>
                  </thead>
                  <tbody>
                    {form.itens.map((l, i) => (
                      <tr key={i} aria-selected={selItem === i} onClick={() => setSelItem(i)}>
                        <td className="rownum">{i + 1}</td>
                        <td>
                          {l.itemId ? <><Seta titulo={`Abrir ${l.itemCode}`} abrir={() => win.open('item', l.itemId!)} /> {l.itemCode}</> : podeEditar ? (
                            <Selecao aria-label={`Item da linha ${i + 1}`} valor="" onChange={(v) => void escolherItem(i, v)}
                              opcoes={[{ valor: '', rotulo: '' }, ...itens.map((x) => ({ valor: x.id, rotulo: `${x.code} — ${x.description}` }))]} />
                          ) : ''}
                        </td>
                        <td title={l.description}>{l.itemId || !podeEditar ? l.description
                          : <input className="rp-field" aria-label={`Descrição da linha ${i + 1}`} value={l.description} maxLength={200} onChange={(e) => setLinha(i, { description: e.target.value })} />}</td>
                        <td>{l.uom}</td>
                        <td><input className="rp-field rp-field--num" aria-label={`Quantidade da linha ${i + 1}`} value={l.quantity} readOnly={!podeEditar} maxLength={14}
                          aria-invalid={!!erros[`items[${i}].quantity`]} onChange={(e) => setLinha(i, { quantity: e.target.value })} /></td>
                        <td><input className="rp-field rp-field--num" aria-label={`Preço unitário da linha ${i + 1}`} value={l.unitPrice} readOnly={!podeEditar} maxLength={18}
                          aria-invalid={!!erros[`items[${i}].unitPrice`]} onChange={(e) => setLinha(i, { unitPrice: e.target.value })} /></td>
                        <td className="calc">{centavos(totalLinha(l))}</td>
                        <td className="rp-linha-x" title="Remover linha" role="button" tabIndex={podeEditar ? 0 : -1}
                          onClick={(e) => (e.stopPropagation(), set({ itens: form.itens.filter((_, j) => j !== i) }))}>×</td>
                      </tr>
                    ))}
                    {podeEditar && (
                      <tr className="nova" onClick={() => set({ itens: [...form.itens, { itemId: null, itemCode: null, description: '', uom: 'UN', quantity: '1', unitPrice: '' }] })}>
                        <td className="rownum">{form.itens.length + 1}</td><td colSpan={7}>Clique para adicionar um item…</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot><tr><td colSpan={6}>Total dos itens</td><td className="num">{centavos(totalItens)}</td><td /></tr></tfoot>
                </table>
              </div>
              <fieldset className="rp-grupo rp-crmop__need">
                <legend>Necessidade do cliente</legend>
                <div className="rp-grupo-corpo">
                  <div className={`rp-form${adicao ? ' rp-form--adicao' : ''} rp-crmop__needform`}>
                    <span className="rp-label">Tipo de indústria</span>
                    <Selecao aria-label="Tipo de indústria" valor={form.need.industry} onChange={(v) => setNeed('industry', v)} disabled={!podeEditar} opcoes={comAtual(INDUSTRIAS.map((x) => ({ valor: x, rotulo: x })), form.need.industry)} />
                    <span className="rp-label">Moagem (t/dia)</span>
                    <input className="rp-field rp-field--num" aria-label="Moagem (t/dia)" value={form.need.dailyCapacityTons} maxLength={6} readOnly={!podeEditar} onChange={(e) => setNeed('dailyCapacityTons', e.target.value.replace(/\D/g, ''))} />
                    <span className="rp-label">Moegas de recebimento</span>
                    <input className="rp-field rp-field--num" aria-label="Moegas de recebimento" value={form.need.receivingPits} maxLength={3} readOnly={!podeEditar} onChange={(e) => setNeed('receivingPits', e.target.value.replace(/\D/g, ''))} />
                    <span className="rp-label">Local de instalação</span>
                    <Selecao aria-label="Local de instalação" valor={form.need.installationSite} onChange={(v) => setNeed('installationSite', v)} disabled={!podeEditar} opcoes={comAtual(LOCAIS.map((x) => ({ valor: x, rotulo: x })), form.need.installationSite)} />
                    <span className="rp-label">Energia disponível</span>
                    <Selecao aria-label="Energia disponível" valor={form.need.power} onChange={(v) => setNeed('power', v)} disabled={!podeEditar} opcoes={comAtual(ENERGIA.map((x) => ({ valor: x, rotulo: x })), form.need.power)} />
                    <span className="rp-label">Implantação desejada</span>
                    <CampoData id={fid('impl')} valor={form.need.desiredStart} onChange={(v) => setNeed('desiredStart', v)} somenteLeitura={!podeEditar} rotulo="Implantação desejada" />
                    <span className="rp-label">Concorrente principal</span>
                    <Selecao aria-label="Concorrente principal" valor={form.need.mainCompetitor} onChange={(v) => setNeed('mainCompetitor', v)} disabled={!podeEditar} opcoes={comAtual(CONCORRENTES.map((x) => ({ valor: x, rotulo: x })), form.need.mainCompetitor)} />
                  </div>
                </div>
              </fieldset>
            </div>
          )}
          {tab === 'ativ' && (
            <div className="rp-crmop__aba">
              <div className="rp-grid-rolagem rp-rolagem rp-crmop__grade">
                <table className="rp-grid rp-crmops__tabela" aria-label="Atividades da oportunidade">
                  <thead><tr><th style={{ width: '34px' }}>#</th><th style={{ width: '22px' }} /><th style={{ width: '86px' }}>Data</th><th style={{ width: '52px' }}>Hora</th>
                    <th style={{ width: '130px' }}>Tipo</th><th>Assunto</th><th style={{ width: '170px' }}>Responsável</th><th style={{ width: '104px' }}>Situação</th></tr></thead>
                  <tbody>
                    {[...(ativs ?? [])].sort((a, b) => (a.day + a.startTime).localeCompare(b.day + b.startTime)).map((a, i) => (
                      <tr key={a.id}>
                        <td className="rownum">{i + 1}</td><td><Seta titulo="Abrir na agenda" abrir={() => win.open('crm-agenda', `ativ:${a.id}`)} /></td>
                        <td>{dataDaApi(a.day)}</td><td>{a.startTime.slice(0, 5)}</td><td><i className={`rp-ico ${ICONE_ATIVIDADE[a.kind]}`} aria-hidden="true" /> {TIPO_ATIVIDADE[a.kind]}</td>
                        <td title={a.subject}>{a.subject}</td><td>{a.owner}</td><td><span className={classeSelo(SITUACAO_ATIVIDADE[a.situation])}>{SITUACAO_ATIVIDADE[a.situation]}</span></td>
                      </tr>
                    ))}
                    <LinhaResto colunas={8} />
                  </tbody>
                </table>
              </div>
              <div className="rp-btn-row">
                <button type="button" className="rp-btn" disabled={!id} onClick={() => win.open('crm-agenda', `novo-opp:${id}`)}>Registrar atividade</button>
                <button type="button" className="rp-btn" onClick={() => win.open('crm-agenda')}>Abrir agenda</button>
              </div>
            </div>
          )}
          {tab === 'prop' && (
            <div className="rp-crmop__aba">
              <span className="rp-ficha-nota">Propostas e pedidos gerados desta oportunidade. Os documentos ficam no módulo Vendas.</span>
              <div className="rp-grid-rolagem rp-rolagem rp-crmop__grade">
                <table className="rp-grid rp-crmops__tabela" aria-label="Propostas e pedidos">
                  <thead><tr><th style={{ width: '34px' }}>#</th><th style={{ width: '22px' }} /><th style={{ width: '150px' }}>Documento</th><th style={{ width: '150px' }}>Tipo</th>
                    <th style={{ width: '90px' }}>Data</th><th className="num" style={{ width: '70px' }}>Revisão</th><th className="num" style={{ width: '130px' }}>Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {(det?.documents ?? []).map((x, i) => {
                      const st = DOC_SITUACAO[x.status] ?? x.status;
                      return (
                        <tr key={`${x.id}-${i}`}>
                          <td className="rownum">{i + 1}</td><td><Seta titulo={`Abrir ${x.code}`} abrir={() => win.open(x.kind === 'PEDIDO' ? 'order' : 'proposal', x.id)} /></td>
                          <td>{x.code}</td><td>{x.kind === 'PEDIDO' ? 'Pedido de venda' : 'Proposta comercial'}</td><td>{dataDaApi(x.date)}</td>
                          <td className="num">{x.revision ?? ''}</td><td className="num">{centavos(x.totalCents)}</td><td><span className={classeSelo(st)}>{st}</span></td>
                        </tr>
                      );
                    })}
                    <LinhaResto colunas={8} />
                  </tbody>
                </table>
              </div>
              <div className="rp-btn-row">
                <button type="button" className="rp-btn" disabled={!id || !aberta || !can('proposal.create')} onClick={() => win.open('proposal', `novo-${Date.now()}:opp:${id}`)}>Gerar proposta comercial</button>
                <button type="button" className="rp-btn rp-btn--menu" disabled title="Copiar para pedido ou contrato: use a proposta">Copiar para</button>
              </div>
            </div>
          )}
          {tab === 'hist' && (
            <div className="rp-grid-rolagem rp-rolagem rp-crmop__grade">
              <table className="rp-grid rp-crmops__tabela" aria-label="Histórico de etapas">
                <thead><tr><th style={{ width: '130px' }}>Data e hora</th><th style={{ width: '130px' }}>De</th><th style={{ width: '130px' }}>Para</th><th style={{ width: '170px' }}>Usuário</th><th>Observação</th></tr></thead>
                <tbody>
                  {[...(etapasHist ?? [])].reverse().map((h) => (
                    <tr key={h.id}>
                      <td>{dataHora(h.changedAt)}</td><td>{h.fromStageName ?? '—'}</td>
                      <td>{h.status === 'GANHA' ? 'Ganha' : h.status === 'PERDIDA' ? 'Perdida' : h.toStageName}</td><td>{h.changedBy}</td><td title={h.note ?? ''}>{h.note ?? ''}</td>
                    </tr>
                  ))}
                  <LinhaResto colunas={5} numerada={false} />
                </tbody>
              </table>
            </div>
          )}
          {tab === 'obs' && (
            <div className="rp-form rp-crmop__obs">
              <span className="rp-label">Observações</span>
              <textarea className="rp-field rp-field--note" aria-label="Observações" value={form.notes} maxLength={2000} readOnly={!podeEditar} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          )}
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando || carregando} onClick={() => (podeGravar ? void gravar() : win.requestClose())}>
            {adicao ? 'Adicionar' : podeGravar ? 'Atualizar' : 'OK'}
          </button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
        </div>
        <div>
          <button type="button" className="rp-btn" disabled={!id} onClick={() => win.open('crm-agenda', `novo-opp:${id}`)}><span>Ativi<u>d</u>ade</span></button>
          <button type="button" className="rp-btn" disabled={!id || !aberta}
            onClick={() => (setTab('prop'), win.notify({ tone: 'info', text: 'A oportunidade é ganha quando a proposta vira pedido: gere a proposta comercial e confirme o pedido' }))}>
            <span>Marcar como <u>g</u>anha</span>
          </button>
          <button type="button" className="rp-btn" disabled={!id || !aberta || !can('opportunity.update')} onClick={() => setPerder(true)}><span>Marcar como <u>p</u>erdida</span></button>
        </div>
      </div>
      {perder && reg && (
        <DialogoPerda texto={`Marcar ${reg.code} como perdida?`} idBase={`${win.windowId}-perda`} onCancelar={() => setPerder(false)} onConfirmar={(m, d) => void confirmarPerda(m, d)} />
      )}
      {conflito !== null && (
        <DialogoConflito rotulo="Oportunidade alterada por outra pessoa" objeto={`a oportunidade ${reg?.code ?? ''}`} versao={conflito}
          onRecarregar={() => { setConflito(null); if (id) void carregar(id); }} onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
