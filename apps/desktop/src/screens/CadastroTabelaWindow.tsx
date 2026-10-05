import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { decimalDaApi, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito } from './comum/Dialogos';
import { renovarApi, type TabelaReferencia } from './comum/Ficha';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

type Tipo = 'T' | 'N' | 'D' | 'S' | 'C';
/** Coluna da tabela: rótulo, largura, tipo (texto, inteiro, decimal, seleção, caixa), chave em attrs (ou code/description). */
type Coluna = { rotulo: string; largura: string; tipo: Tipo; chave: string; obrig?: boolean; opcoes?: string[]; max?: number; casas?: number };

const COD = (largura = '80px', max = 20): Coluna => ({ rotulo: 'Código', largura, tipo: 'T', chave: 'code', obrig: true, max });
const DESC = (rotulo = 'Descrição', largura = 'minmax(0,1.5fr)', max = 120): Coluna => ({ rotulo, largura, tipo: 'T', chave: 'description', obrig: true, max });

/** As oito tabelas do mock (Cadastros-Tabela), com as colunas de cada uma; as chaves batem com cadastros.domain.TabelaAuxiliar. */
export const TABELAS: Record<string, { titulo: string; colunas: Coluna[] }> = {
  unidades: { titulo: 'Unidades de medida', colunas: [COD('90px', 10), DESC('Descrição', 'minmax(0,1.5fr)', 60),
    { rotulo: 'Grandeza', largura: '150px', tipo: 'S', chave: 'quantityKind', opcoes: ['Quantidade', 'Massa', 'Comprimento', 'Área', 'Volume', 'Tempo'] },
    { rotulo: 'Casas decimais', largura: '120px', tipo: 'N', chave: 'decimals', max: 1 }] },
  categorias: { titulo: 'Categorias', colunas: [COD('90px', 10), DESC('Descrição', 'minmax(0,1.5fr)', 100),
    { rotulo: 'Categoria superior', largura: 'minmax(0,1fr)', tipo: 'S', chave: 'parent' },
    { rotulo: 'Aplica-se a', largura: '140px', tipo: 'S', chave: 'appliesTo', opcoes: ['Produto', 'Material', 'Serviço'] }] },
  marcas: { titulo: 'Marcas', colunas: [COD('90px'), DESC('Marca'),
    { rotulo: 'Fabricante', largura: 'minmax(0,1.5fr)', tipo: 'T', chave: 'manufacturer', max: 120 },
    { rotulo: 'País de origem', largura: '140px', tipo: 'S', chave: 'country', opcoes: ['Brasil', 'Alemanha', 'Japão', 'China', 'Estados Unidos', 'Itália', 'Suíça'] }] },
  bancos: { titulo: 'Bancos', colunas: [COD('80px'), DESC('Banco', 'minmax(0,1.4fr)'),
    { rotulo: 'Agência', largura: '100px', tipo: 'T', chave: 'agency', obrig: true, max: 20 },
    { rotulo: 'Conta corrente', largura: '140px', tipo: 'T', chave: 'account', obrig: true, max: 30 },
    { rotulo: 'Uso', largura: '150px', tipo: 'S', chave: 'usage', opcoes: ['Recebimentos', 'Pagamentos', 'Aplicações', 'Recebimentos e pagamentos'] }] },
  condicoes: { titulo: 'Condições de pagamento', colunas: [COD('80px'), DESC(),
    { rotulo: 'Parcelas', largura: '90px', tipo: 'N', chave: 'installments', obrig: true, max: 2 },
    { rotulo: '1º vencimento (dias)', largura: '150px', tipo: 'N', chave: 'firstDueDays', max: 3 },
    { rotulo: 'Intervalo (dias)', largura: '120px', tipo: 'N', chave: 'intervalDays', max: 3 },
    { rotulo: 'Desconto antecipação (%)', largura: '180px', tipo: 'D', chave: 'earlyDiscountPercent', casas: 2, max: 6 }] },
  formas: { titulo: 'Formas de pagamento', colunas: [COD('80px'), DESC('Descrição', 'minmax(0,1.3fr)'),
    { rotulo: 'Tipo', largura: '150px', tipo: 'S', chave: 'kind', obrig: true, opcoes: ['Boleto', 'Pix', 'Transferência', 'Cartão', 'Dinheiro', 'Cheque', 'Depósito'] },
    { rotulo: 'Conta padrão', largura: 'minmax(0,1fr)', tipo: 'S', chave: 'defaultAccount' },
    { rotulo: 'Gera boleto', largura: '100px', tipo: 'C', chave: 'issuesSlip' }] },
  moedas: { titulo: 'Moedas', colunas: [COD('80px', 5), DESC('Nome'),
    { rotulo: 'Símbolo', largura: '90px', tipo: 'T', chave: 'symbol', max: 5 },
    { rotulo: 'Casas decimais', largura: '120px', tipo: 'N', chave: 'decimals', max: 1 },
    { rotulo: 'Moeda local', largura: '110px', tipo: 'C', chave: 'local' }] },
  'tipos-documento': { titulo: 'Tipos de documento', colunas: [COD('80px', 10), DESC(),
    { rotulo: 'Módulo', largura: '140px', tipo: 'S', chave: 'module', opcoes: ['Vendas', 'Compras', 'Produção', 'Renda+', 'Manutenção', 'Qualidade', 'Financeiro', 'Fiscal', 'Engenharia', 'Projetos', 'Estoque', 'Pós-venda'] },
    { rotulo: 'Série / prefixo', largura: '130px', tipo: 'T', chave: 'prefix', max: 10 },
    { rotulo: 'Próximo número', largura: '130px', tipo: 'T', chave: 'nextNumber', max: 10 },
    { rotulo: 'Exige aprovação', largura: '130px', tipo: 'C', chave: 'requiresApproval' }] },
};

type Linha = { id: string | null; code: string; description: string; attrs: Record<string, string>; active: boolean; usage: number };

const doServidor = (t: TabelaReferencia, colunas: Coluna[]): Linha[] =>
  t.rows.map((r) => ({
    id: r.id, code: r.code, description: r.description, active: r.active !== false, usage: Number((r as { usage?: number }).usage ?? 0),
    attrs: Object.fromEntries(colunas.filter((c) => c.chave !== 'code' && c.chave !== 'description').map((c) => {
      const v = r.attrs?.[c.chave];
      if (v === undefined || v === null) return [c.chave, c.tipo === 'C' ? '' : ''];
      if (c.tipo === 'C') return [c.chave, v === true ? 'true' : ''];
      if (c.tipo === 'D') return [c.chave, decimalDaApi(String(v), c.casas ?? 2)];
      return [c.chave, String(v)];
    })),
  }));

/**
 * Tabela editável do mock (Cadastros-Tabela): "Edite direto na grade. Clique na última linha para adicionar um registro."
 * Adicionar linha e Remover linha no título da tabela, a linha nova em itálico no fim, caixas centralizadas e listas nas
 * colunas de opção. OK grava a tabela inteira de uma vez (PUT com If-Match); a contagem fica no pé.
 */
export function CadastroTabelaWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const chave = recordKey in TABELAS ? recordKey : 'unidades';
  const def = TABELAS[chave];
  const [tabela, setTabela] = useState<TabelaReferencia | null>(null);
  const [etag, setEtag] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [bancos, setBancos] = useState<string[]>([]);
  const podeEditar = can('catalog.admin');

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<TabelaReferencia>(`/api/v1/reference-tables/${chave}`);
      setTabela(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setLinhas(doServidor(r.data, def.colunas));
      setErros({});
      setErroCarga(null);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [chave, def.colunas]);

  useEffect(() => {
    void carregar();
    if (chave === 'formas') {
      api.get<TabelaReferencia>('/api/v1/reference-tables/bancos').then((r) => setBancos(r.data.rows.map((b) => b.description))).catch(() => undefined);
    }
  }, [carregar, chave]);

  const original = useMemo(() => (tabela ? doServidor(tabela, def.colunas) : []), [tabela, def.colunas]);
  const alterado = JSON.stringify(linhas) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);
  useEffect(() => win.setTitle?.(def.titulo), [def.titulo, win]);

  const linhasRef = useRef(linhas);
  linhasRef.current = linhas;
  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const rows = linhasRef.current.map((l) => ({
        id: l.id, code: l.code.trim(), description: l.description.trim(), active: l.active,
        attrs: Object.fromEntries(def.colunas.filter((c) => c.chave !== 'code' && c.chave !== 'description').map((c) => {
          const v = l.attrs[c.chave] ?? '';
          if (c.tipo === 'C') return [c.chave, v === 'true'];
          if (c.tipo === 'D') return [c.chave, decimalParaApi(v)];
          if (c.tipo === 'N') return [c.chave, v.trim() === '' ? null : Number(v)];
          return [c.chave, v.trim() || null];
        })),
      }));
      const r = await api.put<TabelaReferencia>(`/api/v1/reference-tables/${chave}`, { rows }, etag);
      setTabela(r.data);
      setEtag(r.etag ?? `"${r.data.version}"`);
      setLinhas(doServidor(r.data, def.colunas));
      setErros({});
      renovarApi('/api/v1/reference-tables');
      renovarApi('/api/v1/units-of-measure');
      renovarApi('/api/v1/item-categories');
      winRef.current.notify({ tone: 'sucesso', text: `${def.titulo}: ${r.data.rows.length} registros gravados` });
      return true;
    } catch (e) {
      const x = e as ApiError;
      if (x.isConflict) {
        setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
        winRef.current.notify({ tone: 'aviso', text: `A tabela foi alterada por outra pessoa; nada foi gravado (${x.code})` });
      } else {
        const map: Record<string, string> = {};
        x.details.forEach((d) => d.field && (map[d.field] = d.message));
        setErros(map);
        const det = x.details[0];
        winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${det ? ` ${det.message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
      return false;
    } finally {
      setGravando(false);
    }
  }, [chave, etag, def]);

  useEffect(() => win.registerCommands({ save: alterado && podeEditar && !gravando ? gravar : undefined }), [alterado, podeEditar, gravando, gravar, win]);

  const adicionar = () => {
    if (!podeEditar) return;
    setLinhas((ls) => [...ls, { id: null, code: '', description: '', active: true, usage: 0, attrs: Object.fromEntries(def.colunas.map((c) => [c.chave, ''])) }]);
    setSel(linhas.length);
  };
  const remover = () => {
    if (sel === null) return;
    const l = linhas[sel];
    if (l.usage > 0) {
      win.notify({ tone: 'aviso', text: `${l.code} está em uso em ${l.usage} cadastro(s): desmarque Ativo em vez de remover (TAB-001)` });
      return;
    }
    setLinhas((ls) => ls.filter((_, i) => i !== sel));
    setSel(null);
  };
  const setCampo = (i: number, c: Coluna, v: string) => setLinhas((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    if (c.chave === 'code') return { ...l, code: v };
    if (c.chave === 'description') return { ...l, description: v };
    return { ...l, attrs: { ...l.attrs, [c.chave]: v } };
  }));

  /** Opções de uma coluna de seleção: as fixas, ou (categoria superior, conta padrão) as da própria tabela e dos bancos. */
  const opcoesDe = (c: Coluna, l: Linha) => {
    const base = c.chave === 'parent' ? linhas.filter((x) => x !== l && x.description).map((x) => x.description)
      : c.chave === 'defaultAccount' ? ['Caixa', ...bancos] : c.opcoes ?? [];
    const atual = l.attrs[c.chave] ?? '';
    const lista = atual && !base.includes(atual) ? [...base, atual] : base;
    return [{ valor: '', rotulo: '—' }, ...lista.map((x) => ({ valor: x, rotulo: x }))];
  };

  const colunas = [...def.colunas, { rotulo: 'Ativo', largura: '70px', tipo: 'C' as Tipo, chave: 'active' }];
  const larg = (w: string) => (w.startsWith('minmax') ? undefined : w);

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-cadtab">
        <div className="rp-cadtab__instrucao">
          <span>{podeEditar ? 'Edite direto na grade. Clique na última linha para adicionar um registro.' : 'Somente consulta: seu perfil não altera as tabelas de cadastro.'}</span>
        </div>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}</p>
        ) : (
          <div className="rp-tabela rp-cadtab__tabela">
            <div className="rp-tabela-acoes">
              <span className="rp-tabela-tit">{def.titulo}</span>
              <button type="button" className="rp-btn" disabled={!podeEditar} onClick={adicionar}><span><u>A</u>dicionar linha</span></button>
              <button type="button" className="rp-btn" disabled={!podeEditar || sel === null} onClick={remover}><span><u>R</u>emover linha</span></button>
            </div>
            <div className="rp-grid-rolagem rp-rolagem rp-cadtab__rolagem">
              <table className="rp-grid rp-grid--edicao rp-cadtab__grade" aria-label={def.titulo}>
                <thead>
                  <tr>
                    <th style={{ width: '34px' }}>#</th>
                    {colunas.map((c) => (
                      <th key={c.chave} className={c.tipo === 'N' || c.tipo === 'D' ? 'num' : undefined} style={{ width: larg(c.largura) }}>
                        {c.rotulo}{'obrig' in c && c.obrig && <span className="rp-req" aria-label="obrigatório"> *</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={l.id ?? `n${i}`} aria-selected={sel === i}>
                      <td className="rownum" onClick={() => setSel(i)} title={`Selecionar linha ${i + 1}`}>{i + 1}</td>
                      {colunas.map((c) => {
                        const erro = erros[`rows[${i}].${c.chave === 'code' || c.chave === 'description' ? c.chave : `attrs.${c.chave}`}`];
                        const rot = `${c.rotulo}, linha ${i + 1}`;
                        if (c.chave === 'active') {
                          return (
                            <td key={c.chave} className="rp-cadtab__caixa">
                              <input type="checkbox" aria-label={rot} checked={l.active} disabled={!podeEditar}
                                onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} onFocus={() => setSel(i)} />
                            </td>
                          );
                        }
                        const valor = c.chave === 'code' ? l.code : c.chave === 'description' ? l.description : l.attrs[c.chave] ?? '';
                        return (
                          <td key={c.chave} className={`${c.tipo === 'N' || c.tipo === 'D' ? 'num' : ''}${c.tipo === 'C' ? ' rp-cadtab__caixa' : ''}`} title={erro}>
                            {c.tipo === 'C' ? (
                              <input type="checkbox" aria-label={rot} checked={valor === 'true'} disabled={!podeEditar}
                                onChange={(e) => setCampo(i, c, e.target.checked ? 'true' : '')} onFocus={() => setSel(i)} />
                            ) : c.tipo === 'S' ? (
                              <Selecao aria-label={rot} valor={valor} onChange={(v) => setCampo(i, c, v)} opcoes={opcoesDe(c, l)} disabled={!podeEditar} aria-invalid={!!erro} />
                            ) : (
                              <input className={`rp-field${c.tipo === 'N' || c.tipo === 'D' ? ' rp-field--num' : ''}`} aria-label={rot} value={valor} maxLength={c.max}
                                readOnly={!podeEditar} aria-invalid={!!erro} onFocus={() => setSel(i)}
                                onChange={(e) => setCampo(i, c, c.tipo === 'N' ? e.target.value.replace(/\D/g, '') : c.chave === 'code' && (chave === 'unidades' || chave === 'categorias') ? e.target.value.toUpperCase() : e.target.value)} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {podeEditar && (
                    <tr className="nova" onClick={adicionar}>
                      <td className="rownum">{linhas.length + 1}</td>
                      <td colSpan={colunas.length}>Clique para adicionar um registro…</td>
                    </tr>
                  )}
                  <LinhaResto colunas={colunas.length + 1} />
                </tbody>
              </table>
            </div>
          </div>
        )}
        {Object.keys(erros).length > 0 && (
          <ul className="rp-cadtab__erros">
            {Object.entries(erros).slice(0, 6).map(([k, m]) => {
              const n = /rows\[(\d+)\]/.exec(k)?.[1];
              return <li key={k} className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" />{n !== undefined ? `Linha ${Number(n) + 1}: ` : ''}{m}</li>;
            })}
          </ul>
        )}
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando}
            onClick={() => (alterado && podeEditar ? void gravar() : win.requestClose())}>{alterado ? 'Atualizar' : 'OK'}</button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
        </div>
        <span className="rp-cadtab__resumo">{tabela ? `${linhas.length} ${linhas.length === 1 ? 'registro' : 'registros'}` : 'Carregando'}</span>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Tabela alterada por outra pessoa" objeto={`a tabela ${def.titulo}`} versao={conflito}
          onRecarregar={() => { setConflito(null); void carregar(); }} onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
