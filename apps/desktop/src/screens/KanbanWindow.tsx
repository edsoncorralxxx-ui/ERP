import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import { centavos, dataDaApi, hojeIso } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoPerda } from './comum/Crm';
import { avisarCrm, COR_ETAPA, CRM_ALTERADO, fechadaAntiga, iniciais, mil, nomeCliente, type OportunidadeLinha } from './comum/CrmMock';
import { useApi } from './comum/Ficha';
import { Selecao } from './comum/Selecao';

type Coluna = { k: string; nome: string; pct: number };
type Msg = { tom: 'info' | 'sucesso' | 'aviso'; texto: string; desfazer?: { id: string; para: string } };
const INFO: Msg = { tom: 'info', texto: 'Arraste os cartões entre as etapas do funil, ou use as setas ‹ › de cada cartão (Ctrl + ← → pelo teclado). Dois cliques abrem a oportunidade.' };

/**
 * Kanban de vendas do mock (CRM-Kanban): uma coluna por etapa (com quantidade, valor, percentual e a barra do valor) e
 * as colunas Ganha e Perdida; cartões com número, dias sem atividade, título, cliente, valor e o responsável. Arrastar
 * ou usar as setas muda a etapa no servidor; soltar em Perdida pede o motivo; em Ganha leva à ficha (a oportunidade é
 * ganha quando o pedido é gerado).
 */
export function KanbanWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [linhas, setLinhas] = useState<OportunidadeLinha[] | null>(null);
  const [busca, setBusca] = useState('');
  const [dono, setDono] = useState('');
  const [filtro, setFiltro] = useState({ busca: '', dono: '' });
  const [sel, setSel] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(INFO);
  const [perder, setPerder] = useState<OportunidadeLinha | null>(null);
  const donos = useApi<{ username: string; displayName: string }[]>('/api/v1/crm/owners', []);
  const etapas = useApi<{ code: string; name: string; closePercent: string }[]>('/api/v1/opportunity-stages', []);
  const podeMover = can('opportunity.update');

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<OportunidadeLinha[]>('/api/v1/crm/opportunity-board');
      setLinhas(r.data);
    } catch (e) {
      const x = e as ApiError;
      setLinhas([]);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => {
    void carregar();
    const f = () => void carregar();
    window.addEventListener(CRM_ALTERADO, f);
    return () => window.removeEventListener(CRM_ALTERADO, f);
  }, [carregar]);

  const colunas: Coluna[] = useMemo(() => [...etapas.map((e) => ({ k: e.code, nome: e.name, pct: Number(e.closePercent) })),
    { k: 'GANHA', nome: 'Ganha', pct: 100 }, { k: 'PERDIDA', nome: 'Perdida', pct: 0 }], [etapas]);
  const hoje = hojeIso();
  const visiveis = useMemo(() => {
    const t = filtro.busca.trim().toLowerCase();
    return (linhas ?? []).filter((o) => !fechadaAntiga(o, hoje) && (!filtro.dono || o.owner === filtro.dono)
      && (!t || `${o.code} ${nomeCliente(o)} ${o.title}`.toLowerCase().includes(t)));
  }, [linhas, filtro, hoje]);
  const colunaDe = (o: OportunidadeLinha) => (o.status === 'ABERTA' ? o.stage : o.status);
  const porColuna = colunas.map((c) => ({ ...c, ops: visiveis.filter((o) => colunaDe(o) === c.k) }));
  const vmax = Math.max(1, ...porColuna.map((c) => c.ops.reduce((a, o) => a + o.potentialCents, 0)));
  const abertas = visiveis.filter((o) => o.status === 'ABERTA');
  const resumo = `${abertas.length} em aberto · R$ ${mil(abertas.reduce((a, o) => a + o.potentialCents, 0))} no funil · ponderado R$ ${mil(abertas.reduce((a, o) => a + o.weightedCents, 0))}`;

  const mover = async (id: string, para: string, desfazendo = false) => {
    const o = linhas?.find((x) => x.id === id);
    if (!o || colunaDe(o) === para || !podeMover) return;
    if (o.status !== 'ABERTA') {
      setMsg({ tom: 'aviso', texto: `${o.code} está ${o.status === 'GANHA' ? 'ganha' : 'perdida'} e não muda mais de etapa.` });
      return;
    }
    if (para === 'PERDIDA') return setPerder(o);
    if (para === 'GANHA') {
      setMsg({ tom: 'info', texto: `${o.code} é ganha quando o pedido de venda é gerado: confirme a proposta na ficha da oportunidade.` });
      win.open('opportunity', o.id);
      return;
    }
    const de = o.stage;
    try {
      await api.post(`/api/v1/opportunities/${o.id}/stage`, { stage: para, note: desfazendo ? 'Movimento desfeito no kanban' : 'Movida no kanban' }, { 'If-Match': `"${o.version}"` });
      const nomePara = colunas.find((c) => c.k === para)?.nome, nomeDe = colunas.find((c) => c.k === de)?.nome;
      setMsg(desfazendo ? { tom: 'sucesso', texto: `${o.code} voltou para ${nomePara}.` }
        : { tom: 'sucesso', texto: `${o.code} · ${nomeCliente(o)}: movida de ${nomeDe} para ${nomePara}.`, desfazer: { id: o.id, para: de } });
      avisarCrm();
    } catch (e) {
      const x = e as ApiError;
      setMsg({ tom: 'aviso', texto: `${x.message} (${x.code})` });
      void carregar();
    }
  };
  const perda = async (motivo: string, detalhe: string) => {
    const o = perder;
    setPerder(null);
    if (!o) return;
    try {
      await api.post(`/api/v1/opportunities/${o.id}/loss`, { lossReason: motivo, lossNote: detalhe || null }, { 'If-Match': `"${o.version}"` });
      setMsg({ tom: 'aviso', texto: `${o.code} marcada como perdida.` });
      avisarCrm();
    } catch (e) {
      const x = e as ApiError;
      setMsg({ tom: 'aviso', texto: `${x.message} (${x.code})` });
    }
  };
  const novo = useMemo(() => (can('opportunity.create') ? () => win.open('opportunity', `novo-${Date.now()}`) : undefined), [can, win]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);

  const soltar = (e: DragEvent, k: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || arrastando;
    setAlvo(null);
    setArrastando(null);
    if (id) void mover(id, k);
  };

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-kanban">
        <div className="rp-filtros">
          <label>Localizar <input className="rp-field rp-crmleads__busca" aria-label="Localizar" placeholder="Cliente, número ou título" value={busca} maxLength={100}
            onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFiltro({ busca, dono })} /></label>
          <label>Responsável <Selecao aria-label="Responsável" valor={dono} onChange={setDono} largura="170px"
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...donos.map((d) => ({ valor: d.username, rotulo: d.displayName }))]} /></label>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setFiltro({ busca, dono })}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setBusca(''), setDono(''), setFiltro({ busca: '', dono: '' }))}>Limpar</button>
        </div>
        <div className={`rp-status-msg rp-status-msg--${msg.tom} rp-kanban__msg`} role="status">
          <span>{msg.texto}</span>
          {msg.desfazer && (
            <span className="rp-status-acao" role="link" tabIndex={0} onClick={() => void mover(msg.desfazer!.id, msg.desfazer!.para, true)}
              onKeyDown={(e) => e.key === 'Enter' && void mover(msg.desfazer!.id, msg.desfazer!.para, true)}>Desfazer</span>
          )}
        </div>
        <div className="rp-kanban__quadro rp-rolagem" role="list" aria-label="Funil de vendas">
          {porColuna.map((c, ci) => {
            const v = c.ops.reduce((a, o) => a + o.potentialCents, 0);
            const fim = c.k === 'GANHA' || c.k === 'PERDIDA';
            return (
              <section key={c.k} className={`rp-kanban__col${fim ? ' rp-kanban__col--fim' : ''}`} role="listitem" aria-label={c.nome} data-alvo={alvo === c.k}
                onDragOver={(e) => (e.preventDefault(), alvo !== c.k && setAlvo(c.k))} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setAlvo(null)}
                onDrop={(e) => soltar(e, c.k)}>
                <div className="rp-kanban__cab">
                  <b>{c.nome}<span>{c.ops.length}</span></b>
                  <div><span>R$ {mil(v)}</span><span>{c.pct}%</span></div>
                  <div className="rp-kanban__barra"><i style={{ width: `${Math.round((v / vmax) * 100)}%` }} /></div>
                </div>
                <div className="rp-kanban__lista rp-rolagem">
                  {c.ops.map((o) => {
                    const ant = fim ? colunas[colunas.length - 3] : colunas[ci - 1];
                    const prox = fim ? undefined : colunas[ci + 1];
                    const dias = o.daysWithoutActivity;
                    const rotDias = fim ? (o.status === 'GANHA' ? 'ganha' : 'perdida') : dias === null ? '' : dias === 0 ? 'hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
                    const tecla = (e: KeyboardEvent) => {
                      if (e.ctrlKey && e.key === 'ArrowRight' && prox) (e.preventDefault(), void mover(o.id, prox.k));
                      else if (e.ctrlKey && e.key === 'ArrowLeft' && ant) (e.preventDefault(), void mover(o.id, ant.k));
                      else if (e.key === 'Enter') win.open('opportunity', o.id);
                    };
                    return (
                      <article key={o.id} className={`rp-kanban__card rp-kanban__card--${COR_ETAPA[c.k]}`} draggable={podeMover && !fim} tabIndex={0}
                        aria-selected={sel === o.id} data-arrastando={arrastando === o.id}
                        onDragStart={(e) => (e.dataTransfer.setData('text/plain', o.id), (e.dataTransfer.effectAllowed = 'move'), setArrastando(o.id), setSel(o.id))}
                        onDragEnd={() => (setArrastando(null), setAlvo(null))} onClick={() => setSel(o.id)} onDoubleClick={() => win.open('opportunity', o.id)} onKeyDown={tecla}
                        title={`${o.code} — ${o.title}\n${nomeCliente(o)}\nR$ ${centavos(o.potentialCents)} · previsão ${dataDaApi(o.expectedClose)} · ${o.owner}\nArraste para outra etapa ou use as setas. Dois cliques abrem a oportunidade.`}>
                        <div className="rp-kanban__num"><span>{o.code}</span><span className={!fim && (dias ?? 0) >= 10 ? 'rp-kanban__alerta' : undefined}>{rotDias}</span></div>
                        <div className="rp-kanban__tit">{o.title}</div>
                        <div className="rp-kanban__cli">{nomeCliente(o)}</div>
                        <div className="rp-kanban__rod">
                          <span className="rp-kanban__val" title={`R$ ${centavos(o.potentialCents)}`}><small>R$</small> {Math.round(o.potentialCents / 100000).toLocaleString('pt-BR')} mil</span>
                          <span className="rp-kanban__mov">
                            <button type="button" title={ant ? `Voltar para ${ant.nome}` : undefined} aria-label={ant ? `Voltar para ${ant.nome}` : 'Sem etapa anterior'}
                              disabled={!ant || fim || !podeMover} onClick={(e) => (e.stopPropagation(), ant && void mover(o.id, ant.k))}>
                              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M5.5 1L2.5 4l3 3" fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth="1.4" /></svg>
                            </button>
                            <button type="button" title={prox ? `Avançar para ${prox.nome}` : undefined} aria-label={prox ? `Avançar para ${prox.nome}` : 'Sem próxima etapa'}
                              disabled={!prox || !podeMover} onClick={(e) => (e.stopPropagation(), prox && void mover(o.id, prox.k))}>
                              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1l3 3-3 3" fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth="1.4" /></svg>
                            </button>
                          </span>
                          <span className="rp-kanban__ini" title={o.owner}>{iniciais(o.owner)}</span>
                        </div>
                      </article>
                    );
                  })}
                  {c.ops.length === 0 && <div className="rp-kanban__vazio">Arraste uma oportunidade para cá</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={!novo} onClick={novo}><span>Nova <u>o</u>portunidade</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('opportunities')}><span><u>L</u>ista de oportunidades</span></button>
          <button type="button" className="rp-btn" onClick={() => win.open('crm-dashboard')}><span><u>P</u>ainel comercial</span></button>
        </div>
        <div><span className="rp-kanban__resumo">{linhas === null ? 'Carregando' : resumo}</span></div>
      </div>
      {perder && (
        <DialogoPerda texto={`Marcar ${perder.code} (${nomeCliente(perder)}) como perdida?`} idBase={`${win.windowId}-perda`}
          onCancelar={() => setPerder(null)} onConfirmar={(m, d) => void perda(m, d)} />
      )}
    </>
  );
}
