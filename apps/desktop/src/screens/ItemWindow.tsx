import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { HistoryEntry, Item, ItemCategory, Natureza, UnitOfMeasure } from '../api/types';
import { dataHora, decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito, DialogoInativar } from './comum/Dialogos';
import { GradeHistorico } from './comum/GradeHistorico';
import { ITENS_ALTERADOS } from './ItemsWindow';

type Tab = 'geral' | 'conversoes' | 'historico';
type Conversao = { id: string | null; fromUom: string; factor: string };
type Form = { description: string; nature: Natureza; uom: string; categoryId: string; stockControlled: boolean; referenceCost: string; conversions: Conversao[] };

const VAZIO: Form = { description: '', nature: 'MATERIAL', uom: 'UN', categoryId: '', stockControlled: true, referenceCost: '', conversions: [] };
const CONVERSAO: Conversao = { id: null, fromUom: '', factor: '' };

function toForm(i: Item): Form {
  return {
    description: i.description,
    nature: i.nature,
    uom: i.uom,
    categoryId: i.category.id,
    stockControlled: i.stockControlled,
    referenceCost: decimalDaApi(i.referenceCost),
    conversions: i.conversions.map((c) => ({ id: c.id, fromUom: c.fromUom, factor: decimalDaApi(c.factor, 0) })),
  };
}

function toRequest(f: Form) {
  return {
    description: f.description.trim() || null,
    nature: f.nature,
    uom: f.uom,
    categoryId: f.categoryId || null,
    stockControlled: f.nature === 'SERVICO' ? false : f.stockControlled,
    referenceCost: decimalParaApi(f.referenceCost),
    conversions: f.conversions.map((c) => ({ id: c.id, fromUom: c.fromUom || null, factor: decimalParaApi(c.factor) })),
  };
}

function novaChave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Ficha de material ou serviço (formulário "materiais" do B01): cabeçalho com código do sistema, descrição e natureza;
 * abas Geral (unidade, categoria, estoque, custo de referência), Conversões (1 unidade de compra = fator unidades do
 * item) e Histórico. A natureza fica fixa depois do cadastro, porque o código (M ou S) depende dela.
 */
export function ItemWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [id, setId] = useState<string | null>(recordKey.startsWith('novo-') ? null : recordKey);
  const [item, setItem] = useState<Item | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(VAZIO);
  const [tab, setTab] = useState<Tab>('geral');
  const [carregando, setCarregando] = useState(id !== null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [inativar, setInativar] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [unidades, setUnidades] = useState<UnitOfMeasure[]>([]);
  const [categorias, setCategorias] = useState<ItemCategory[]>([]);
  const chave = useRef(novaChave());

  const adicao = item === null;
  const inativo = item?.status === 'INATIVO';
  const somenteLeitura = adicao ? !can('item.create') : !can('item.update') || inativo;
  const original = useMemo(() => (item ? toForm(item) : VAZIO), [item]);
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  useEffect(() => {
    api.get<UnitOfMeasure[]>('/api/v1/units-of-measure').then((r) => setUnidades(r.data)).catch(() => undefined);
    api.get<ItemCategory[]>('/api/v1/item-categories').then((r) => setCategorias(r.data)).catch(() => undefined);
  }, []);

  const aplicar = useCallback((i: Item, etagLido?: string) => {
    setItem(i);
    setId(i.id);
    setEtag(etagLido ?? `"${i.version}"`);
    setForm(toForm(i));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(
    async (iid: string) => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const r = await api.get<Item>(`/api/v1/items/${iid}`);
        aplicar(r.data, r.etag);
      } catch (e) {
        const x = e as ApiError;
        setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
        winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      } finally {
        setCarregando(false);
      }
    },
    [aplicar],
  );

  useEffect(() => {
    if (id) void carregar(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'historico' || !id || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/items/${id}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, id, historico]);

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
      const campos = Object.keys(map);
      if (campos.length && campos.every((k) => k.startsWith('conversions'))) setTab('conversoes');
      else setTab('geral');
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } else if (x.isNetwork) {
      winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; suas alterações continuam na janela (${x.code})` });
    } else {
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const body = toRequest(formRef.current);
      const r = item ? await api.put<Item>(`/api/v1/items/${item.id}`, body, etag) : await api.post<Item>('/api/v1/items', body, { 'Idempotency-Key': chave.current });
      aplicar(r.data, r.etag);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `${r.data.nature === 'MATERIAL' ? 'Material' : 'Serviço'} ${r.data.code} ${item ? 'atualizado' : 'adicionado'} com sucesso` });
      window.dispatchEvent(new Event(ITENS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [item, etag, falha, aplicar]);

  const confirmarInativacao = async (motivo: string) => {
    if (!item) return;
    setInativar(false);
    try {
      const r = await api.post<Item>(`/api/v1/items/${item.id}/deactivate`, { reason: motivo }, { 'If-Match': etag });
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: `Item ${r.data.code} inativado com sucesso` });
      window.dispatchEvent(new Event(ITENS_ALTERADOS));
    } catch (e) {
      falha(e);
    }
  };

  const podeGravar = alterado && !gravando && !carregando && !somenteLeitura;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setConv = (i: number, patch: Partial<Conversao>) => setForm((f) => ({ ...f, conversions: f.conversions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addConv = () => setForm((f) => ({ ...f, conversions: [...f.conversions, { ...CONVERSAO }] }));
  const remConv = (i: number) => setForm((f) => ({ ...f, conversions: f.conversions.filter((_, j) => j !== i) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null || inativar) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      const alvo: Record<string, Tab> = { g: 'geral', v: 'conversoes', h: 'historico' };
      if (alvo[k] && (alvo[k] !== 'historico' || id)) setTab(alvo[k]);
      else if (k === 'i' && item && !inativo && can('item.deactivate')) setInativar(true);
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  // Tabela de edição das conversões: Ctrl+Insert adiciona e Ctrl+Delete remove a linha em foco.
  const teclasConversoes = (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') return addConv();
    const linha = (e.target as HTMLElement).closest('tr');
    const i = linha ? Array.from(linha.parentElement?.children ?? []).indexOf(linha) : -1;
    if (i >= 0 && i < form.conversions.length) remConv(i);
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span id={`${fid(k)}-erro`} className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  // Unidades e categorias ativas, mais a que o item já usa (mesmo se inativada depois).
  const unidadesUsaveis = (atual: string) => unidades.filter((u) => u.status === 'ATIVO' || u.code === atual);
  const categoriasUsaveis = categorias.filter((c) => c.status === 'ATIVO' || c.id === form.categoryId);
  const errosConversoes = Object.entries(erros)
    .filter(([k]) => k.startsWith('conversions'))
    .map(([k, v]) => {
      const m = /\[(\d+)\]/.exec(k);
      return `Conversão ${m ? Number(m[1]) + 1 : ''}: ${v}`;
    });

  const tabs: [Tab, ReactNode, boolean][] = [
    ['geral', <span><u>G</u>eral</span>, true],
    ['conversoes', <span>Con<u>v</u>ersões ({form.conversions.length})</span>, true],
    ['historico', <span><u>H</u>istórico</span>, id !== null],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className={`rp-form rp-form--req rp-ficha__principal${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                <span className="rp-label">Código</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly value={item?.code ?? 'Gerado ao adicionar'} aria-label="Código" />
                <label className="rp-label" htmlFor={fid('description')}>Descrição</label>
                <span className="rp-req" aria-hidden="true">*</span>
                <input
                  id={fid('description')}
                  className={classeCampo}
                  value={form.description}
                  maxLength={200}
                  readOnly={somenteLeitura}
                  required
                  aria-invalid={!!erros.description}
                  disabled={carregando}
                  onChange={(e) => set({ description: e.target.value })}
                />
                {erroDe('description')}
                <span className="rp-label" id={fid('natureza')}>Natureza</span>
                <span className="rp-req" aria-hidden="true">*</span>
                {/* Opções: rádios lado a lado; fixa depois do cadastro, porque o código (M ou S) depende dela. */}
                <span className="rp-ficha__opcoes" role="radiogroup" aria-labelledby={fid('natureza')}>
                  {(['MATERIAL', 'SERVICO'] as Natureza[]).map((nat) => (
                    <label key={nat} className="rp-choice">
                      <input
                        type="radio"
                        name={fid('natureza')}
                        checked={form.nature === nat}
                        disabled={!adicao || somenteLeitura}
                        onChange={() => set({ nature: nat, stockControlled: nat === 'MATERIAL' })}
                      />{' '}
                      {nat === 'MATERIAL' ? 'Material' : 'Serviço'}
                    </label>
                  ))}
                </span>
                {erroDe('nature')}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  <span className={`rp-badge ${adicao ? '' : inativo ? 'rp-badge--cancelado' : 'rp-badge--aprovado'}`}>{adicao ? 'Novo' : inativo ? 'Inativo' : 'Ativo'}</span>
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly value={item?.version ?? ''} aria-label="Versão" />
                <span className="rp-label">Atualizado em</span>
                <input
                  className="rp-field rp-field--readonly"
                  readOnly
                  value={item ? `${dataHora(item.updatedAt ?? item.createdAt)} por ${item.updatedBy ?? item.createdBy}` : ''}
                  aria-label="Atualizado em"
                />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo, ativo]) => (
                <div
                  key={t}
                  className="rp-tab"
                  role="tab"
                  tabIndex={ativo ? 0 : -1}
                  aria-selected={tab === t}
                  aria-disabled={!ativo || undefined}
                  title={ativo ? undefined : 'Disponível depois de adicionar o item'}
                  onClick={() => ativo && setTab(t)}
                  onKeyDown={(e) => e.key === 'Enter' && ativo && setTab(t)}
                >
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {carregando ? (
                <p className="rp-janela-mdi__aviso">Carregando</p>
              ) : tab === 'geral' ? (
                <div className={`rp-form rp-form--req rp-janela-mdi__form${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`}>
                  <label className="rp-label" htmlFor={fid('uom')}>Unidade de medida</label>
                  <span className="rp-req" aria-hidden="true">*</span>
                  <div className="rp-select">
                    <select id={fid('uom')} className={classeCampo} value={form.uom} disabled={somenteLeitura} aria-invalid={!!erros.uom} onChange={(e) => set({ uom: e.target.value })}>
                      {!unidades.some((u) => u.code === form.uom) && <option value={form.uom}>{form.uom}</option>}
                      {unidadesUsaveis(form.uom).map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code} — {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {erroDe('uom')}
                  <label className="rp-label" htmlFor={fid('categoria')}>Categoria</label>
                  <span className="rp-req" aria-hidden="true">*</span>
                  <div className="rp-select">
                    <select id={fid('categoria')} className={classeCampo} value={form.categoryId} disabled={somenteLeitura} aria-invalid={!!erros.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                      <option value="">{categoriasUsaveis.length ? 'Escolha a categoria' : 'Nenhuma categoria cadastrada'}</option>
                      {categoriasUsaveis.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.status === 'INATIVO' ? ' (inativa)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {erroDe('categoryId')}
                  <label className="rp-label" htmlFor={fid('custo')}>Custo de referência (R$)</label>
                  <span />
                  <input
                    id={fid('custo')}
                    className={`${classeCampo} rp-field--num rp-field--curto`}
                    value={form.referenceCost}
                    maxLength={20}
                    inputMode="decimal"
                    readOnly={somenteLeitura}
                    aria-invalid={!!erros.referenceCost}
                    onChange={(e) => set({ referenceCost: e.target.value })}
                    onBlur={() => {
                      const v = decimalParaApi(form.referenceCost);
                      if (v && /^\d+(\.\d+)?$/.test(v)) set({ referenceCost: decimalDaApi(v) });
                    }}
                  />
                  {erroDe('referenceCost')}
                  <span className="rp-label">Estoque</span>
                  <span />
                  <label className="rp-choice" title={form.nature === 'SERVICO' ? 'Serviço não controla estoque físico' : undefined}>
                    <input
                      type="checkbox"
                      checked={form.nature === 'MATERIAL' && form.stockControlled}
                      disabled={somenteLeitura || form.nature === 'SERVICO'}
                      onChange={(e) => set({ stockControlled: e.target.checked })}
                    />{' '}
                    Controla estoque
                  </label>
                  {erroDe('stockControlled')}
                  <span className="rp-label">Cadastrado em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly value={item ? `${dataHora(item.createdAt)} por ${item.createdBy}` : ''} aria-label="Cadastrado em" />
                  {inativo && (
                    <>
                      <span className="rp-label">Situação</span>
                      <span />
                      <span className="rp-janela-mdi__aviso">
                        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Item inativo: o histórico é preservado e ele não aparece na lista de ativos.
                      </span>
                    </>
                  )}
                </div>
              ) : tab === 'conversoes' ? (
                <div className="rp-tabela">
                  <div className="rp-tabela-acoes">
                    <span className="rp-tabela-tit">Conversões para {form.uom} (unidade do item)</span>
                  </div>
                  <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                    <table className={`rp-grid rp-grid--edicao${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`} onKeyDown={teclasConversoes}>
                      <thead>
                        <tr>
                          <th className="rp-ficha__col-num">#</th>
                          <th>
                            Unidade de compra <span className="rp-req">*</span>
                          </th>
                          <th className="num">
                            Fator <span className="rp-req">*</span>
                          </th>
                          <th>Equivale a</th>
                          <th className="rp-ficha__col-x" aria-label="Remover" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.conversions.map((c, i) => (
                          <tr key={c.id ?? `n${i}`}>
                            <td className="rownum">{i + 1}</td>
                            <td>
                              <div className="rp-select">
                                <select
                                  className="rp-field"
                                  value={c.fromUom}
                                  disabled={somenteLeitura}
                                  aria-label={`Unidade de compra da linha ${i + 1}`}
                                  aria-invalid={!!erros[`conversions[${i}].fromUom`]}
                                  title={erros[`conversions[${i}].fromUom`]}
                                  onChange={(e) => setConv(i, { fromUom: e.target.value })}
                                >
                                  <option value="">Escolha</option>
                                  {unidadesUsaveis(c.fromUom)
                                    .filter((u) => u.code !== form.uom)
                                    .map((u) => (
                                      <option key={u.code} value={u.code}>
                                        {u.code} — {u.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </td>
                            <td>
                              <input
                                className="rp-field rp-field--num"
                                value={c.factor}
                                maxLength={20}
                                inputMode="decimal"
                                readOnly={somenteLeitura}
                                aria-label={`Fator da linha ${i + 1}`}
                                aria-invalid={!!erros[`conversions[${i}].factor`]}
                                title={erros[`conversions[${i}].factor`]}
                                onChange={(e) => setConv(i, { factor: e.target.value })}
                              />
                            </td>
                            <td className="calc">{c.fromUom && c.factor ? `1 ${c.fromUom} = ${c.factor} ${form.uom}` : ''}</td>
                            <td
                              className="rp-linha-x"
                              role={somenteLeitura ? undefined : 'button'}
                              tabIndex={somenteLeitura ? -1 : 0}
                              title="Remover conversão"
                              aria-label={`Remover conversão ${i + 1}`}
                              onClick={() => !somenteLeitura && remConv(i)}
                              onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remConv(i)}
                            >
                              {somenteLeitura ? '' : '×'}
                            </td>
                          </tr>
                        ))}
                        {!somenteLeitura && (
                          <tr className="nova">
                            <td className="rownum">{form.conversions.length + 1}</td>
                            <td colSpan={4} role="button" tabIndex={0} onClick={addConv} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addConv())}>
                              Clique para adicionar uma conversão…
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {errosConversoes.map((m) => (
                    <p key={m} className="rp-campo-erro rp-ficha__erro">
                      <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
                    </p>
                  ))}
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do item" />
              )}
            </div>
          </>
        )}
      </div>

      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {!somenteLeitura && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {adicao ? 'Adicionar' : 'Atualizar'}
            </button>
          )}
          <button type="button" className={`rp-btn${somenteLeitura ? ' rp-btn--default' : ''}`} onClick={win.requestClose}>
            {somenteLeitura ? 'OK' : 'Cancelar'}
          </button>
        </div>
        <div className="rp-btn-row">
          {item && !inativo && can('item.deactivate') && (
            <button type="button" className="rp-btn" onClick={() => setInativar(true)}>
              <span><u>I</u>nativar</span>
            </button>
          )}
        </div>
      </div>

      {inativar && item && (
        <DialogoInativar
          rotulo="Inativar item"
          texto={`O item ${item.code} deixa de aparecer na lista de ativos; o histórico é preservado.`}
          idCampo={fid('motivo')}
          onConfirmar={(m) => void confirmarInativacao(m)}
          onCancelar={() => setInativar(false)}
        />
      )}

      {conflito !== null && (
        <DialogoConflito
          rotulo="Item alterado por outra pessoa"
          objeto="O item"
          versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            if (id) void carregar(id);
          }}
          onContinuar={() => setConflito(null)}
        />
      )}
    </>
  );
}
