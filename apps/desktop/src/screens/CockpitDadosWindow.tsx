import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { centavos, hojeIso } from '../format';
import type { WindowKind } from '../windows/windowManager';
import { useWindow } from '../windows/WindowContext';
import { classeSelo } from './comum/CrmMock';
import { Seta } from './comum/Ficha';
import { baixarCsv } from './comum/Fiscal';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

type Coluna = { title: string; width: string | null; type: '' | 'money' | 'num' | 'badge' };
type Linha = { id: string | null; cells: (string | number)[]; badge: string };
type Detalhe = { key: string; title: string; description: string; icon: string; totalLabel: string; totalType: 'money' | 'count'; total: number;
  columns: Coluna[]; rows: Linha[]; openKind: string };

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ABRE: Record<string, (id: string) => [WindowKind, string]> = {
  document: (id) => ['document', id], 'sales-order': (id) => ['order', id], 'bank-account': () => ['bank-accounts', ''],
  project: (id) => ['project', id], item: (id) => ['item', id],
};
const SELO: Record<string, string> = { Autorizada: 'rp-badge rp-badge--aprovado', Pendente: 'rp-badge rp-badge--pendente', Ativa: 'rp-badge rp-badge--aprovado',
  Crítico: 'rp-badge rp-badge--cancelado', 'Em reposição': 'rp-badge rp-badge--pendente' };

/** Título da janela pelo indicador (a chave é "indicador@período"). */
export function tituloDados(recordKey: string) {
  const k = recordKey.split('@')[0];
  return { faturamento: 'Notas fiscais emitidas', carteira: 'Pedidos de venda em aberto', caixa: 'Contas bancárias e caixa',
    instalacoes: 'Instalações programadas', estoque: 'Itens abaixo do estoque mínimo' }[k] ?? 'Dados do indicador';
}

/**
 * Dados do indicador do mock (Cockpit-Dados): o que forma o número do cartão do cockpit — cabeçalho com o total,
 * Localizar e Período, a grade com a seta para o registro, o rodapé com a soma e a paginação; Exportar para planilha
 * e Imprimir embaixo. As linhas vêm de GET /api/v1/cockpit/indicators/{indicador}.
 */
export function CockpitDadosWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const [chave, per0] = recordKey.split('@');
  const [periodo, setPeriodo] = useState(per0 || hojeIso().slice(0, 7));
  const [aplicado, setAplicado] = useState(periodo);
  const [busca, setBusca] = useState('');
  const [d, setD] = useState<Detalhe | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const opcoes = useMemo(() => {
    const h = hojeIso();
    return Array.from({ length: 13 }, (_, i) => {
      const x = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 1 - i, 1);
      return { valor: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MES[x.getMonth()]} de ${x.getFullYear()}` };
    });
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<Detalhe>(`/api/v1/cockpit/indicators/${chave}?period=${aplicado}`);
      setD(r.data);
      win.setTitle?.(r.data.title);
    } catch (e) {
      const x = e as ApiError;
      setD(null);
      winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [chave, aplicado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void carregar(), [carregar]);

  const t = busca.trim().toLowerCase();
  const linhas = (d?.rows ?? []).filter((r) => !t || `${r.cells.join(' ')} ${r.badge}`.toLowerCase().includes(t));
  const fmt = (c: Coluna, v: string | number) => (c.type === 'money' ? centavos(Number(v)) : String(v));
  const idxSoma = d?.columns.findIndex((c) => c.type === 'money') ?? -1;
  const soma = idxSoma >= 0 ? linhas.reduce((a, r) => a + Number(r.cells[idxSoma]), 0) : linhas.length;
  const abrir = (r: Linha) => {
    const f = d && r.id ? ABRE[d.openKind] : undefined;
    if (f && r.id) {
      const [k, id] = f(r.id);
      win.open(k, id || undefined);
    }
  };
  const exportar = () => d && baixarCsv(`${chave}-${aplicado}.csv`, d.columns.map((c) => c.title),
    linhas.map((r) => d.columns.map((c, j) => (c.type === 'badge' ? r.badge : c.type === 'money' ? (Number(r.cells[j]) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : String(r.cells[j])))));
  const grade = d ? `34px 22px ${d.columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ')}` : '';

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-cockpitdados">
        <div className="rp-cockpitdados__topo">
          <i className={`rp-ico rp-ico-${d?.icon ?? 'relatorios'} rp-cockpitdados__icone`} aria-hidden="true" />
          <div>
            <h2 className="rp-cockpitdados__titulo">{d?.title ?? tituloDados(recordKey)}</h2>
            <span className="rp-cockpitdados__desc">{d?.description}</span>
          </div>
          <div className="rp-cockpitdados__total">
            <span>{d?.totalLabel ?? 'Total'}</span>
            <b>{d ? (d.totalType === 'money' ? `R$ ${centavos(soma)}` : String(soma)) : '—'}</b>
          </div>
        </div>
        <div className="rp-filtros">
          <label>Localizar <input className="rp-field rp-cockpitdados__busca" aria-label="Localizar" placeholder="Digite para filtrar a tabela" value={busca} maxLength={100}
            onChange={(e) => setBusca(e.target.value)} /></label>
          {(chave === 'faturamento' || chave === 'caixa') && (
            <label>Período <Selecao aria-label="Período" valor={periodo} onChange={setPeriodo} opcoes={opcoes} largura="180px" /></label>
          )}
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setAplicado(periodo)}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setBusca(''), setPeriodo(per0 || hojeIso().slice(0, 7)), setAplicado(per0 || hojeIso().slice(0, 7)))}>Limpar</button>
        </div>
        <div className="rp-grid-rolagem rp-rolagem rp-cockpitdados__grade">
          <table className="rp-grid rp-cockpitdados__tabela" aria-label={d?.title ?? 'Dados do indicador'} style={{ ['--colunas' as string]: grade }}>
            <colgroup><col style={{ width: '34px' }} /><col style={{ width: '22px' }} />{d?.columns.map((c) => <col key={c.title} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
            <thead><tr><th>#</th><th aria-label="Abrir" />{d?.columns.map((c) => <th key={c.title} className={c.type === 'money' || c.type === 'num' ? 'num' : undefined}>{c.title}</th>)}</tr></thead>
            <tbody>
              {linhas.map((r, i) => (
                <tr key={`${r.id}-${i}`} aria-selected={sel === i} onClick={() => setSel(i)} onDoubleClick={() => abrir(r)}>
                  <td className="rownum">{i}</td>
                  <td>{r.id && ABRE[d!.openKind] && <Seta titulo="Abrir" abrir={() => abrir(r)} />}</td>
                  {d!.columns.map((c, j) => c.type === 'badge'
                    ? <td key={j}><span className={SELO[r.badge] ?? classeSelo(r.badge)}>{r.badge}</span></td>
                    : <td key={j} className={c.type === 'money' || c.type === 'num' ? 'num' : undefined} title={String(r.cells[j])}>{fmt(c, r.cells[j])}</td>)}
                </tr>
              ))}
              <LinhaResto colunas={(d?.columns.length ?? 0) + 2} />
            </tbody>
            <tfoot>
              <tr><td /><td />{d?.columns.map((_c, j) => (
                <td key={j} className={j === idxSoma ? 'num' : undefined}>{j === 0 ? `${linhas.length} ${linhas.length === 1 ? 'registro' : 'registros'}` : j === idxSoma ? centavos(soma) : ''}</td>
              ))}</tr>
            </tfoot>
          </table>
        </div>
        <div className="rp-pag">
          <button type="button" disabled title="Primeira">«</button><button type="button" disabled title="Anterior">‹</button>
          <button type="button" aria-current="page">1</button><button type="button" disabled title="Próxima">›</button><button type="button" disabled title="Última">»</button>
          <span className="rp-pag-info">{linhas.length ? `1 a ${linhas.length} de ${linhas.length} registros` : 'Nenhum registro'}</span>
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
          <button type="button" className="rp-btn" disabled={!d} onClick={exportar}><span><u>E</u>xportar para planilha</span></button>
          <button type="button" className="rp-btn" onClick={() => window.print()}><span><u>I</u>mprimir</span></button>
        </div>
      </div>
    </>
  );
}
