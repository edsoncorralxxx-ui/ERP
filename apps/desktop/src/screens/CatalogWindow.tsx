import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { ItemCategory, Situacao, UnitOfMeasure } from '../api/types';
import { numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';

type Aba = 'unidades' | 'categorias';
type Form = { code: string; name: string; status: Situacao };
const VAZIO: Form = { code: '', name: '', status: 'ATIVO' };

/**
 * Unidades de medida e categorias de item (S3-03): grade à esquerda e a ficha do registro escolhido à direita, numa
 * aba para cada lista. Só o Administrador inclui, renomeia e inativa (catalog.admin); nada se apaga, porque itens e
 * fornecedores guardam o que usam.
 */
export function CatalogWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const admin = can('catalog.admin');
  const [aba, setAba] = useState<Aba>('unidades');
  const [unidades, setUnidades] = useState<UnitOfMeasure[] | null>(null);
  const [categorias, setCategorias] = useState<ItemCategory[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([api.get<UnitOfMeasure[]>('/api/v1/units-of-measure'), api.get<ItemCategory[]>('/api/v1/item-categories')]);
      setUnidades(u.data);
      setCategorias(c.data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const unidade = aba === 'unidades' ? unidades?.find((u) => u.code === sel) ?? null : null;
  const categoria = aba === 'categorias' ? categorias?.find((c) => c.id === sel) ?? null : null;
  const atual = unidade ?? categoria;
  const original = useMemo<Form>(
    () => (unidade ? { code: unidade.code, name: unidade.name, status: unidade.status } : categoria ? { code: '', name: categoria.name, status: categoria.status } : VAZIO),
    [unidade, categoria],
  );
  const alterado = JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const escolher = (chave: string | null, novaAba: Aba = aba) => {
    setAba(novaAba);
    setSel(chave);
    setErros({});
    const u = novaAba === 'unidades' ? unidades?.find((x) => x.code === chave) : undefined;
    const c = novaAba === 'categorias' ? categorias?.find((x) => x.id === chave) : undefined;
    setForm(u ? { code: u.code, name: u.name, status: u.status } : c ? { code: '', name: c.name, status: c.status } : VAZIO);
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      let texto: string;
      let chave: string;
      if (aba === 'unidades') {
        const r = unidade
          ? await api.put<UnitOfMeasure>(`/api/v1/units-of-measure/${encodeURIComponent(unidade.code)}`, { name: form.name, status: form.status }, `"${unidade.version}"`)
          : await api.post<UnitOfMeasure>('/api/v1/units-of-measure', { code: form.code, name: form.name });
        texto = `Unidade ${r.data.code} ${unidade ? 'atualizada' : 'adicionada'} com sucesso`;
        chave = r.data.code;
      } else {
        const r = categoria
          ? await api.put<ItemCategory>(`/api/v1/item-categories/${categoria.id}`, { name: form.name, status: form.status }, `"${categoria.version}"`)
          : await api.post<ItemCategory>('/api/v1/item-categories', { name: form.name });
        texto = `Categoria ${r.data.name} ${categoria ? 'atualizada' : 'adicionada'} com sucesso`;
        chave = r.data.id;
      }
      winRef.current.notify({ tone: 'sucesso', text: texto });
      await recarregar();
      setSel(chave);
      setErros({});
      return true;
    } catch (e) {
      const x = e as ApiError;
      const m: Record<string, string> = {};
      x.details.forEach((d) => d.field && (m[d.field] = d.message));
      setErros(m);
      winRef.current.notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      if (x.isConflict) await recarregar();
      return false;
    } finally {
      setGravando(false);
    }
  }, [aba, unidade, categoria, form, recarregar]);

  // Depois de recarregar, a ficha mostra a versão nova do registro gravado.
  useEffect(() => {
    if (!gravando) setForm(original);
  }, [original]); // eslint-disable-line react-hooks/exhaustive-deps

  const podeGravar = admin && alterado && !gravando;
  const novo = useMemo(() => (admin ? () => escolher(null) : undefined), [admin, aba, unidades, categorias]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, novo }), [podeGravar, gravar, novo, win]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'u') escolher(null, 'unidades');
      else if (k === 't') escolher(null, 'categorias');
      else if (k === 'n' && admin) escolher(null);
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erro = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const selo = (s: Situacao) => <span className={`rp-badge ${s === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{s === 'ATIVO' ? 'Ativa' : 'Inativa'}</span>;
  const leitura = !admin;
  const titulo = aba === 'unidades' ? (unidade ? `Unidade ${unidade.code}` : 'Nova unidade') : categoria ? `Categoria ${categoria.name}` : 'Nova categoria';

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-tabs" role="tablist">
          <div className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === 'unidades'} onClick={() => escolher(null, 'unidades')} onKeyDown={(e) => e.key === 'Enter' && escolher(null, 'unidades')}>
            <span><u>U</u>nidades de medida</span>
          </div>
          <div className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === 'categorias'} onClick={() => escolher(null, 'categorias')} onKeyDown={(e) => e.key === 'Enter' && escolher(null, 'categorias')}>
            <span>Ca<u>t</u>egorias de item</span>
          </div>
        </div>
        <div className="rp-tabpanel rp-catalogo" role="tabpanel">
          <div className="rp-grid-rolagem rp-rolagem rp-catalogo__lista">
            {aba === 'unidades' ? (
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Unidades de medida">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Código</th>
                    <th>Nome</th>
                    <th className="num">Itens</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {(unidades ?? []).map((u, i) => (
                    <tr key={u.code} aria-selected={sel === u.code} onClick={() => escolher(u.code)}>
                      <td className="rownum">{i}</td>
                      <td>{u.code}</td>
                      <td>{u.name}</td>
                      <td className="num">{numero(u.items)}</td>
                      <td>{selo(u.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Categorias de item">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Nome</th>
                    <th className="num">Itens</th>
                    <th className="num">Fornecedores</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {(categorias ?? []).map((c, i) => (
                    <tr key={c.id} aria-selected={sel === c.id} onClick={() => escolher(c.id)}>
                      <td className="rownum">{i}</td>
                      <td>{c.name}</td>
                      <td className="num">{numero(c.items)}</td>
                      <td className="num">{numero(c.suppliers)}</td>
                      <td>{selo(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {aba === 'categorias' && categorias?.length === 0 && <p className="rp-jlista__vazio">Nenhuma categoria cadastrada ainda.</p>}
          </div>
          <fieldset className="rp-grupo rp-catalogo__ficha">
            <legend>{leitura && !atual ? 'Escolha um registro na lista' : titulo}</legend>
            <div className={`rp-grupo-corpo rp-form rp-form--req rp-catalogo__form${atual || leitura ? '' : ' rp-form--adicao'}`}>
              {aba === 'unidades' && (
                <>
                  <label className="rp-label" htmlFor={fid('code')}>Código</label>
                  <span className="rp-req" aria-hidden="true">*</span>
                  <input
                    id={fid('code')}
                    className={`rp-field rp-field--curto${atual || leitura ? ' rp-field--readonly' : ''}`}
                    readOnly={!!atual || leitura}
                    maxLength={10}
                    value={form.code}
                    aria-invalid={!!erros.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                  {erro('code')}
                </>
              )}
              <label className="rp-label" htmlFor={fid('name')}>Nome</label>
              <span className="rp-req" aria-hidden="true">*</span>
              <input
                id={fid('name')}
                className={`rp-field${leitura ? ' rp-field--readonly' : ''}`}
                readOnly={leitura}
                maxLength={aba === 'unidades' ? 60 : 100}
                value={form.name}
                aria-invalid={!!erros.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {erro('name')}
            </div>
            {atual && (
              <div className="rp-usuarios__situacao" role="radiogroup" aria-label="Situação">
                <label className="rp-choice">
                  <input type="radio" name={fid('situacao')} checked={form.status === 'ATIVO'} disabled={leitura} onChange={() => setForm({ ...form, status: 'ATIVO' })} /> Ativa
                </label>
                <label className="rp-choice">
                  <input type="radio" name={fid('situacao')} checked={form.status === 'INATIVO'} disabled={leitura} onChange={() => setForm({ ...form, status: 'INATIVO' })} /> Inativa
                </label>
              </div>
            )}
            <p className="rp-tip rp-usuarios__nota" role="note">
              {aba === 'unidades'
                ? 'O código não muda depois de incluído, porque os itens o guardam. Unidade inativa não aparece para novos itens, mas continua nos que já a usam.'
                : 'Categoria inativa não aparece para novos itens e fornecedores, mas continua nos que já a usam.'}
            </p>
          </fieldset>
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {admin && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {atual ? 'Atualizar' : 'Adicionar'}
            </button>
          )}
          <button type="button" className={`rp-btn${admin ? '' : ' rp-btn--default'}`} onClick={win.requestClose}>
            {admin ? 'Cancelar' : 'OK'}
          </button>
        </div>
        <div className="rp-btn-row">
          {admin && (
            <button type="button" className="rp-btn" onClick={() => escolher(null)}>
              <span><u>N</u>ovo</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
