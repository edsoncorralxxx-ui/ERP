import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { FinancialCategory, Situacao } from '../api/types';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CATEGORIAS_ALTERADAS } from './comum/Categorias';
import { Selecao } from './comum/Selecao';

type Form = { name: string; direction: FinancialCategory['direction']; status: Situacao };
const VAZIO: Form = { name: '', direction: 'DESPESA', status: 'ATIVO' };
const TIPO: Record<FinancialCategory['direction'], string> = { RECEITA: 'Receita', DESPESA: 'Despesa' };

/**
 * Categorias financeiras (PD-010): grade com as categorias de despesa e receita à esquerda e a ficha à direita. Só o
 * Administrador cadastra, renomeia e inativa (financial_category.admin); o tipo e o código não mudam; a categoria do
 * sistema (receita dos pedidos, DAS) não é inativada.
 */
export function FinancialCategoriesWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const admin = can('financial_category.admin');
  const [categorias, setCategorias] = useState<FinancialCategory[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setCategorias((await api.get<FinancialCategory[]>('/api/v1/financial-categories?includeInactive=true')).data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => void recarregar(), [recarregar]);

  const atual = categorias?.find((c) => c.id === sel) ?? null;
  const original = useMemo<Form>(() => (atual ? { name: atual.name, direction: atual.direction, status: atual.status } : VAZIO), [atual]);
  const alterado = admin && JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const escolher = (c: FinancialCategory | null) => {
    setSel(c?.id ?? null);
    setForm(c ? { name: c.name, direction: c.direction, status: c.status } : VAZIO);
    setErros({});
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    setGravando(true);
    try {
      const r = atual
        ? await api.put<FinancialCategory>(`/api/v1/financial-categories/${atual.id}`, { name: form.name, status: form.status }, `"${atual.version}"`)
        : await api.post<FinancialCategory>('/api/v1/financial-categories', { name: form.name, direction: form.direction });
      winRef.current.notify({ tone: 'sucesso', text: `Categoria ${r.data.name} ${atual ? 'atualizada' : 'adicionada'} com sucesso` });
      window.dispatchEvent(new Event(CATEGORIAS_ALTERADAS));
      await recarregar();
      setSel(r.data.id);
      setForm({ name: r.data.name, direction: r.data.direction, status: r.data.status });
      setErros({});
      return true;
    } catch (e) {
      const x = e as ApiError;
      const m: Record<string, string> = {};
      x.details.forEach((d) => d.field && (m[d.field] = d.message));
      setErros(Object.keys(m).length > 0 ? m : { geral: x.message });
      winRef.current.notify({ tone: x.isConflict ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      if (x.isConflict) await recarregar();
      return false;
    } finally {
      setGravando(false);
    }
  }, [atual, form, recarregar]);

  const podeGravar = alterado && !gravando;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const adicao = admin && !atual;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-ficha__cabecalho" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), win.requestClose())}>
        <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
          <table className="rp-grid rp-janela-mdi__grade" aria-label="Categorias financeiras">
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Código</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {(categorias ?? []).map((c, i) => (
                <tr key={c.id} aria-selected={sel === c.id} onClick={() => escolher(c)}>
                  <td className="rownum">{i}</td>
                  <td>{c.name}{c.system && <span className="rp-badge rp-janela-mdi__selo">Sistema</span>}</td>
                  <td>{TIPO[c.direction]}</td>
                  <td>{c.code}</td>
                  <td><span className={`rp-badge ${c.status === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{c.status === 'ATIVO' ? 'Ativa' : 'Inativa'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`rp-form rp-ficha__situacao${adicao ? ' rp-form--adicao' : ''}`} aria-label="Ficha da categoria">
          <label className="rp-label" htmlFor={fid('nome')}>Nome</label>
          <input id={fid('nome')} className={`rp-field${admin ? '' : ' rp-field--readonly'}`} maxLength={100} value={form.name} readOnly={!admin}
            aria-invalid={!!erros.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          {erroDe('name')}
          <label className="rp-label" htmlFor={fid('tipo')}>Tipo</label>
          <Selecao id={fid('tipo')} className={`rp-field${adicao ? '' : ' rp-field--readonly'}`} valor={form.direction} disabled={!adicao}
            onChange={(v) => setForm((f) => ({ ...f, direction: v as Form['direction'] }))} opcoes={[{ valor: 'DESPESA', rotulo: 'Despesa' }, { valor: 'RECEITA', rotulo: 'Receita' }]} />
          <label className="rp-label" htmlFor={fid('situacao')}>Situação</label>
          <Selecao id={fid('situacao')} className={`rp-field${admin && atual && !atual.system ? '' : ' rp-field--readonly'}`} valor={form.status}
            disabled={!admin || !atual || atual.system} onChange={(v) => setForm((f) => ({ ...f, status: v as Situacao }))}
            opcoes={[{ valor: 'ATIVO', rotulo: 'Ativa' }, { valor: 'INATIVO', rotulo: 'Inativa' }]} />
          {erroDe('status')}
          {erros.geral && erroDe('geral')}
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {admin && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              {atual ? 'Atualizar' : 'Adicionar'}
            </button>
          )}
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
        {admin && (
          <div className="rp-btn-row">
            <button type="button" className="rp-btn" onClick={() => escolher(null)}>
              <span><u>N</u>ova categoria</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
