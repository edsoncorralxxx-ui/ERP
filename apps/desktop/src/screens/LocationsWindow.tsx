import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import { decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CADASTROS_ALTERADOS, TIPO_DEPOSITO } from './CadastroListaWindow';
import { novaChave } from './comum/Cadastros';
import { Campo, ConfirmaExclusao, GradeSimples, Linha, Marca, Secao, Seta } from './comum/Ficha';
import { Selecao } from './comum/Selecao';

type Deposito = { id: string; code: string; name: string; kind: string; address: string | null; responsible: string | null; status: string; capacityKg: string | null; volumeM3: string | null; occupancyPercent: string | null; positions: number; items: number; version: string };
type Local = { id: string; warehouseId: string; parentId: string | null; code: string; name: string; level: Nivel; capacityKg: string | null; volumeM3: string | null; occupancyPercent: string | null; blockedEntry: boolean; blockedExit: boolean; quarantineOnly: boolean; children: number; balances: number; version: string };
type Saldo = { id: string; itemId: string; itemCode: string; itemDescription: string; uom: string; warehouseId: string; locationId: string | null; lot: string | null; onHand: string };
type Nivel = 'AREA' | 'RUA' | 'ESTANTE' | 'POSICAO';

const NIVEL: Record<Nivel, string> = { AREA: 'Área', RUA: 'Rua', ESTANTE: 'Estante', POSICAO: 'Posição' };
const PROXIMO: Record<string, Nivel | null> = { DEPOSITO: 'AREA', AREA: 'RUA', RUA: 'ESTANTE', ESTANTE: 'POSICAO', POSICAO: null };

/** Nó da árvore: depósito (raiz) ou localização; "novo" é o nó ainda não gravado. */
type No = { chave: string; tipo: 'DEPOSITO' | Nivel; id: string | null; depositoId: string; paiChave: string | null; code: string; name: string };
type Form = { code: string; name: string; kind: string; level: Nivel; address: string; responsible: string; capacityKg: string; volumeM3: string; occupancyPercent: string; blockedEntry: boolean; blockedExit: boolean; quarantineOnly: boolean };

const formDe = (n: No | null, d: Deposito | undefined, l: Local | undefined): Form => ({
  code: n?.code ?? '', name: n?.name ?? '', kind: d?.kind ?? 'PROPRIO', level: (l?.level ?? (n && n.tipo !== 'DEPOSITO' ? n.tipo : 'AREA')) as Nivel,
  address: d?.address ?? '', responsible: d?.responsible ?? '',
  capacityKg: decimalDaApi((l ?? d)?.capacityKg ?? null, 0), volumeM3: decimalDaApi((l ?? d)?.volumeM3 ?? null, 0), occupancyPercent: decimalDaApi((l ?? d)?.occupancyPercent ?? null, 0),
  blockedEntry: !!l?.blockedEntry, blockedExit: !!l?.blockedExit, quarantineOnly: !!l?.quarantineOnly,
});

/**
 * Localizações de estoque do mock (Cadastros-Localizacoes): à esquerda a estrutura em árvore (depósito › área › rua ›
 * estante › posição) com Expandir e Recolher tudo; à direita o caminho, os dados do nó escolhido (capacidade, volume,
 * ocupação e bloqueios) e os itens guardados nele ou nos subníveis. Adicionar subnível, Remover e Imprimir etiquetas.
 */
export function LocationsWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [novo, setNovo] = useState<No | null>(recordKey === 'novo-deposito' ? { chave: 'novo', tipo: 'DEPOSITO', id: null, depositoId: '', paiChave: null, code: '', name: '' } : null);
  const [sel, setSel] = useState<string | null>(recordKey === 'novo-deposito' ? 'novo' : recordKey !== 'singleton' ? `d:${recordKey}` : null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set(recordKey !== 'singleton' && recordKey !== 'novo-deposito' ? [`d:${recordKey}`] : []));
  const [form, setForm] = useState<Form>(formDe(null, undefined, undefined));
  const [saldos, setSaldos] = useState<Saldo[] | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [remover, setRemover] = useState(false);
  const chave = useRef(novaChave());
  const podeEditar = can('stock.admin');

  const carregar = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([api.get<Deposito[]>('/api/v1/warehouses?status=TODOS'), api.get<Local[]>('/api/v1/stock-locations')]);
      setDepositos(d.data);
      setLocais(l.data);
      setSel((s) => s ?? (d.data[0] ? `d:${d.data[0].id}` : null));
      setAbertos((a) => (a.size || !d.data[0] ? a : new Set([`d:${d.data[0].id}`])));
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const nos = useMemo(() => {
    const todos: No[] = [];
    depositos.forEach((d) => todos.push({ chave: `d:${d.id}`, tipo: 'DEPOSITO', id: d.id, depositoId: d.id, paiChave: null, code: d.code, name: d.name }));
    locais.forEach((l) => todos.push({ chave: `l:${l.id}`, tipo: l.level, id: l.id, depositoId: l.warehouseId, paiChave: l.parentId ? `l:${l.parentId}` : `d:${l.warehouseId}`, code: l.code, name: l.name }));
    if (novo) todos.push(novo);
    return todos;
  }, [depositos, locais, novo]);
  const filhos = useMemo(() => {
    const m = new Map<string | null, No[]>();
    nos.forEach((n) => m.set(n.paiChave, [...(m.get(n.paiChave) ?? []), n]));
    m.forEach((v) => v.sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true })));
    return m;
  }, [nos]);
  const visiveis = useMemo(() => {
    const out: { no: No; nivel: number }[] = [];
    const anda = (pai: string | null, nivel: number) => (filhos.get(pai) ?? []).forEach((n) => {
      out.push({ no: n, nivel });
      if (abertos.has(n.chave)) anda(n.chave, nivel + 1);
    });
    anda(null, 1);
    return out;
  }, [filhos, abertos]);

  const atual = nos.find((n) => n.chave === sel) ?? null;
  const dep = depositos.find((d) => d.id === atual?.depositoId);
  const loc = locais.find((l) => atual && l.id === atual.id && atual.tipo !== 'DEPOSITO');
  const original = useMemo(() => formDe(atual, atual?.tipo === 'DEPOSITO' ? dep : undefined, loc), [atual, dep, loc]);
  useEffect(() => {
    setForm(original);
    setErros({});
  }, [original]);
  const alterado = !!atual && (atual.id === null || JSON.stringify(form) !== JSON.stringify(original));
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  /** Descendentes do nó (para os itens guardados nos subníveis). */
  const descendentes = useCallback((c: string): Set<string> => {
    const s = new Set<string>();
    const anda = (k: string) => (filhos.get(k) ?? []).forEach((n) => {
      if (n.id) s.add(n.id);
      anda(n.chave);
    });
    anda(c);
    return s;
  }, [filhos]);

  useEffect(() => {
    if (!atual?.id || !can('stock.read')) {
      setSaldos(atual?.id ? null : []);
      return;
    }
    const dId = atual.depositoId;
    api.get<Saldo[]>(`/api/v1/stock-balances?warehouseId=${dId}`).then((r) => {
      if (atual.tipo === 'DEPOSITO') return setSaldos(r.data);
      const ids = descendentes(atual.chave);
      ids.add(atual.id!);
      setSaldos(r.data.filter((s) => s.locationId && ids.has(s.locationId)));
    }).catch(() => setSaldos([]));
  }, [atual?.chave, atual?.id, atual?.depositoId, atual?.tipo, descendentes, can]); // eslint-disable-line react-hooks/exhaustive-deps

  const caminho = useMemo(() => {
    const partes: string[] = [];
    let n = atual;
    while (n) {
      partes.unshift(n.tipo === 'DEPOSITO' ? `${n.code} ${n.name}` : `${n.code} ${n.name}`);
      n = nos.find((x) => x.chave === n!.paiChave) ?? null;
    }
    return partes.join(' › ');
  }, [atual, nos]);

  const falha = (e: unknown) => {
    const x = e as ApiError;
    const map: Record<string, string> = {};
    x.details?.forEach((d) => d.field && (map[d.field] = d.message));
    setErros(map);
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${x.details?.[0] ? ` ${x.details[0].message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    if (!atual) return false;
    setGravando(true);
    try {
      const num = (v: string) => decimalParaApi(v);
      if (atual.tipo === 'DEPOSITO') {
        const body = { code: form.code.trim(), name: form.name.trim(), kind: form.kind, address: form.address.trim() || null, responsible: form.responsible.trim() || null,
          capacityKg: num(form.capacityKg), volumeM3: num(form.volumeM3), occupancyPercent: num(form.occupancyPercent), active: true };
        const r = atual.id
          ? await api.put<Deposito>(`/api/v1/warehouses/${atual.id}`, body, `"${dep?.version}"`)
          : await api.post<Deposito>('/api/v1/warehouses', body, { 'Idempotency-Key': chave.current });
        setNovo(null);
        setSel(`d:${r.data.id}`);
        chave.current = novaChave();
      } else {
        const pai = nos.find((x) => x.chave === atual.paiChave);
        const body = { warehouseId: atual.depositoId, parentId: pai && pai.tipo !== 'DEPOSITO' ? pai.id : null, code: form.code.trim(), name: form.name.trim(), level: form.level,
          capacityKg: num(form.capacityKg), volumeM3: num(form.volumeM3), occupancyPercent: num(form.occupancyPercent),
          blockedEntry: form.blockedEntry, blockedExit: form.blockedExit, quarantineOnly: form.quarantineOnly };
        const r = atual.id
          ? await api.put<Local>(`/api/v1/stock-locations/${atual.id}`, body, `"${loc?.version}"`)
          : await api.post<Local>('/api/v1/stock-locations', body);
        setNovo(null);
        setSel(`l:${r.data.id}`);
      }
      await carregar();
      winRef.current.notify({ tone: 'sucesso', text: `${atual.tipo === 'DEPOSITO' ? 'Depósito' : NIVEL[form.level]} ${form.code} gravado` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [atual, form, dep, loc, nos, carregar]);

  useEffect(() => win.registerCommands({ save: alterado && podeEditar && !gravando ? gravar : undefined,
    novo: podeEditar ? () => (setNovo({ chave: 'novo', tipo: 'DEPOSITO', id: null, depositoId: '', paiChave: null, code: '', name: '' }), setSel('novo')) : undefined }),
  [alterado, podeEditar, gravando, gravar, win]);

  const proximo = atual ? PROXIMO[atual.tipo] : null;
  const adicionarSubnivel = () => {
    if (!atual?.id || !proximo) return;
    const irmaos = filhos.get(atual.chave) ?? [];
    const sufixo = String(irmaos.length + 1).padStart(2, '0');
    const n: No = { chave: 'novo', tipo: proximo, id: null, depositoId: atual.depositoId, paiChave: atual.chave,
      code: atual.tipo === 'DEPOSITO' ? '' : `${atual.code}-${sufixo}`, name: `${NIVEL[proximo]} ${sufixo}` };
    setNovo(n);
    setAbertos((a) => new Set([...a, atual.chave]));
    setSel('novo');
  };
  const confirmarRemocao = async () => {
    setRemover(false);
    if (!atual) return;
    if (!atual.id) {
      setNovo(null);
      setSel(atual.paiChave);
      return;
    }
    try {
      await api.del(`/api/v1/stock-locations/${atual.id}`, { 'If-Match': `"${loc?.version}"` });
      winRef.current.notify({ tone: 'sucesso', text: `${NIVEL[atual.tipo as Nivel]} ${atual.code} removida` });
      setSel(atual.paiChave);
      await carregar();
    } catch (e) {
      falha(e);
    }
  };

  const alternar = (c: string) => setAbertos((a) => {
    const n = new Set(a);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });
  const teclas = (e: KeyboardEvent<HTMLUListElement>) => {
    const i = visiveis.findIndex((v) => v.no.chave === sel);
    if (e.key === 'ArrowDown' && i < visiveis.length - 1) setSel(visiveis[i + 1].no.chave);
    else if (e.key === 'ArrowUp' && i > 0) setSel(visiveis[i - 1].no.chave);
    else if (e.key === 'ArrowRight' && sel) setAbertos((a) => new Set([...a, sel]));
    else if (e.key === 'ArrowLeft' && sel) setAbertos((a) => { const n = new Set(a); n.delete(sel); return n; });
    else return;
    e.preventDefault();
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const set = (p: Partial<Form>) => podeEditar && setForm((f) => ({ ...f, ...p }));
  const folha = atual?.tipo === 'POSICAO';
  const ocup = Math.max(0, Math.min(100, Number(decimalParaApi(form.occupancyPercent) ?? 0)));
  const total = nos.filter((n) => n.id).length;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-locais">
        <div className="rp-locais__esq">
          <div className="rp-btn-row">
            <button type="button" className="rp-btn" onClick={() => setAbertos(new Set(nos.map((n) => n.chave)))}><span>E<u>x</u>pandir tudo</span></button>
            <button type="button" className="rp-btn" onClick={() => setAbertos(new Set())}><span>Reco<u>l</u>her tudo</span></button>
          </div>
          <section className="rp-arvore-painel rp-locais__painel">
            <div className="rp-arvore-painel__tit"><span>Estrutura de localizações</span><span className="rp-arvore-painel__total">{total} localizações</span></div>
            <ul className="rp-arvore rp-rolagem" role="tree" aria-label="Estrutura de localizações" tabIndex={0} onKeyDown={teclas}>
              {visiveis.map(({ no, nivel }) => {
                const temFilhos = (filhos.get(no.chave) ?? []).length > 0;
                const aberto = abertos.has(no.chave);
                const ico = no.tipo === 'DEPOSITO' ? 'rp-ico-estoque' : no.tipo === 'POSICAO' ? 'rp-ico-formulario' : aberto ? 'rp-ico-pasta-aberta' : 'rp-ico-pasta';
                return (
                  <li key={no.chave} className="rp-arvore__no" role="treeitem" aria-level={nivel} aria-expanded={temFilhos ? aberto : undefined}
                    aria-selected={no.chave === sel} onClick={() => setSel(no.chave)} onDoubleClick={() => alternar(no.chave)} style={{ paddingLeft: `${8 + (nivel - 1) * 18}px` }}>
                    <span role="button" tabIndex={-1} className="rp-locais__seta" aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${no.name}`}
                      onClick={(e) => (e.stopPropagation(), alternar(no.chave))}>
                      {temFilhos && (
                        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d={aberto ? 'M1 3h8L5 8z' : 'M3 1l5 4-5 4z'} style={{ fill: 'var(--ink-muted)' }} /></svg>
                      )}
                    </span>
                    <i className={`rp-ico ${ico}`} aria-hidden="true" />
                    <span className="rp-arvore__nome">{no.code ? `${no.code} — ` : ''}{no.name || 'Novo'}</span>
                    <span className="rp-arvore__total">{no.tipo === 'DEPOSITO' ? 'Depósito' : NIVEL[no.tipo]}</span>
                  </li>
                );
              })}
            </ul>
            <p className="rp-arvore-painel__nota">Clique num nó para ver os dados e os itens guardados nele.</p>
          </section>
        </div>
        <div className="rp-locais__dir rp-rolagem">
          {atual ? (
            <>
              <nav aria-label="Caminho" className="rp-locais__caminho">{caminho}</nav>
              <div className="rp-ficha__duas">
                <div className="rp-ficha__coluna">
                  <Linha id={fid('codigo')} rotulo="Código" req erro={erros.code}>
                    <Campo id={fid('codigo')} valor={form.code} largura={160} max={atual.tipo === 'DEPOSITO' ? 10 : 30} ro={!!atual.id || !podeEditar}
                      onChange={atual.id ? undefined : (v) => set({ code: v.toUpperCase() })} erro={erros.code} />
                  </Linha>
                  <Linha id={fid('nome')} rotulo="Descrição" req erro={erros.name}>
                    <Campo id={fid('nome')} valor={form.name} max={100} onChange={podeEditar ? (v) => set({ name: v }) : undefined} erro={erros.name} />
                  </Linha>
                  {atual.tipo === 'DEPOSITO' ? (
                    <>
                      <Linha id={fid('tipo')} rotulo="Tipo">
                        <Selecao id={fid('tipo')} valor={form.kind} onChange={(v) => set({ kind: v })} disabled={!podeEditar} largura="160px"
                          opcoes={Object.entries(TIPO_DEPOSITO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                      </Linha>
                      <Linha id={fid('endereco')} rotulo="Endereço"><Campo id={fid('endereco')} valor={form.address} max={200} onChange={podeEditar ? (v) => set({ address: v }) : undefined} /></Linha>
                      <Linha id={fid('resp')} rotulo="Responsável"><Campo id={fid('resp')} valor={form.responsible} max={120} onChange={podeEditar ? (v) => set({ responsible: v }) : undefined} /></Linha>
                    </>
                  ) : (
                    <>
                      <Linha id={fid('nivel')} rotulo="Tipo de nível">
                        <Selecao id={fid('nivel')} valor={form.level} onChange={(v) => set({ level: v as Nivel })} disabled={!podeEditar} largura="160px"
                          opcoes={Object.entries(NIVEL).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                      </Linha>
                      <Linha id={fid('dep')} rotulo="Depósito" seta={{ titulo: 'Abrir depósito', abrir: () => setSel(`d:${atual.depositoId}`) }}>
                        <Campo id={fid('dep')} valor={dep ? `${dep.code} — ${dep.name}` : ''} ro />
                      </Linha>
                      <Linha id={fid('sup')} rotulo="Nível superior">
                        <Campo id={fid('sup')} valor={(() => { const p = nos.find((x) => x.chave === atual.paiChave); return p && p.tipo !== 'DEPOSITO' ? `${p.code} — ${p.name}` : '—'; })()} ro />
                      </Linha>
                    </>
                  )}
                </div>
                <div className="rp-ficha__coluna">
                  <Linha id={fid('cap')} rotulo="Capacidade (kg)" largura={156} erro={erros.capacityKg}>
                    <Campo id={fid('cap')} valor={form.capacityKg} largura={120} num max={14} onChange={podeEditar ? (v) => set({ capacityKg: v }) : undefined} />
                  </Linha>
                  <Linha id={fid('vol')} rotulo="Volume (m³)" largura={156} erro={erros.volumeM3}>
                    <Campo id={fid('vol')} valor={form.volumeM3} largura={120} num max={14} onChange={podeEditar ? (v) => set({ volumeM3: v }) : undefined} />
                  </Linha>
                  <Linha id={fid('ocup')} rotulo="Ocupação (%)" largura={156} erro={erros.occupancyPercent}>
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ocup} aria-label="Ocupação" className="rp-locais__barra">
                      <div style={{ width: `${ocup}%` }} />
                    </div>
                    <Campo id={fid('ocup')} valor={form.occupancyPercent} largura={50} num max={3} onChange={podeEditar ? (v) => set({ occupancyPercent: v.replace(/\D/g, '') }) : undefined} />
                  </Linha>
                  {atual.tipo !== 'DEPOSITO' && (
                    <div className="rp-locais__marcas">
                      <Marca id={fid('b1')} rotulo="Bloqueada para entrada" marcado={form.blockedEntry} onChange={(v) => set({ blockedEntry: v })} ro={!podeEditar} />
                      <Marca id={fid('b2')} rotulo="Bloqueada para saída" marcado={form.blockedExit} onChange={(v) => set({ blockedExit: v })} ro={!podeEditar} />
                      <Marca id={fid('b3')} rotulo="Uso exclusivo de quarentena" marcado={form.quarantineOnly} onChange={(v) => set({ quarantineOnly: v })} ro={!podeEditar} />
                    </div>
                  )}
                </div>
              </div>
              <Secao>{folha ? 'Itens armazenados nesta posição' : atual.tipo === 'DEPOSITO' ? 'Itens armazenados no depósito' : 'Itens armazenados nos subníveis'}</Secao>
              <div className="rp-locais__grade">
                <GradeSimples rotulo="Itens armazenados" linhas={saldos} chave={(s) => s.id} vazio={atual.id ? 'Nenhum item guardado aqui.' : 'Grave o nó para guardar itens nele.'}
                  colunas={[
                    { rotulo: 'Item', largura: '140px', valor: (s) => <><Seta titulo={`Abrir ${s.itemCode}`} abrir={() => win.open('item', s.itemId)} />{s.itemCode}</> },
                    { rotulo: 'Descrição', largura: 'minmax(0,2fr)', valor: (s) => s.itemDescription },
                    { rotulo: 'Lote / série', largura: '130px', valor: (s) => s.lot ?? '—' },
                    { rotulo: 'Quantidade', largura: '100px', num: true, valor: (s) => decimalDaApi(s.onHand, 0) },
                    { rotulo: 'UM', largura: '50px', valor: (s) => s.uom },
                  ]} />
              </div>
            </>
          ) : (
            <p className="rp-ficha-nota">Nenhum depósito cadastrado. Use Novo na barra de ferramentas para cadastrar o primeiro.</p>
          )}
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando}
            onClick={() => (alterado && podeEditar ? void gravar() : win.requestClose())}>{atual && !atual.id ? 'Adicionar' : alterado ? 'Atualizar' : 'OK'}</button>
        </div>
        <div>
          <button type="button" className="rp-btn" disabled={!podeEditar || !atual?.id || !proximo} onClick={adicionarSubnivel}><span>Adicionar sub<u>n</u>ível</span></button>
          <button type="button" className="rp-btn" disabled={!podeEditar || !atual || atual.tipo === 'DEPOSITO'} onClick={() => setRemover(true)}><span><u>R</u>emover</span></button>
          <button type="button" className="rp-btn" disabled={!atual?.id} onClick={() => window.print()}><span>Imprimir <u>e</u>tiquetas</span></button>
        </div>
      </div>
      {remover && atual && (
        <ConfirmaExclusao registro={`${atual.code} — ${atual.name}`} rotulo="Remover" onSim={() => void confirmarRemocao()} onNao={() => setRemover(false)}
          texto="Só é possível remover uma localização sem subníveis e sem itens guardados." />
      )}
    </>
  );
}
