import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { HistoryEntry, OpportunityStage } from '../api/types';
import { dataHora, decimalParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { ETAPAS_ALTERADAS, pct } from './comum/Crm';
import { GradeHistorico } from './comum/GradeHistorico';

type Form = { name: string; closePercent: string };

/**
 * Etapas do funil (CRM, Sprint 11), como a configuração das etapas de venda do SAP Business One: a ordem é fixa e o
 * Administrador muda o nome e o percentual de fechamento, que dá o valor ponderado de cada oportunidade aberta.
 */
export function OpportunityStagesWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const admin = can('crm_stage.admin');
  const [etapas, setEtapas] = useState<OpportunityStage[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: '', closePercent: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [gravando, setGravando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setEtapas((await api.get<OpportunityStage[]>('/api/v1/opportunity-stages')).data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => void recarregar(), [recarregar]);

  const atual = etapas?.find((e) => e.code === sel) ?? null;
  const original = useMemo<Form>(() => (atual ? { name: atual.name, closePercent: atual.closePercent.replace('.', ',') } : { name: '', closePercent: '' }), [atual]);
  const alterado = admin && !!atual && JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const escolher = (e: OpportunityStage) => {
    setSel(e.code);
    setForm({ name: e.name, closePercent: e.closePercent.replace('.', ',') });
    setErros({});
    setHistorico(null);
    api.get<HistoryEntry[]>(`/api/v1/opportunity-stages/${e.code}/history`).then((r) => setHistorico(r.data)).catch(() => setHistorico([]));
  };

  const gravar = useCallback(async (): Promise<boolean> => {
    if (!atual) return false;
    setGravando(true);
    try {
      const r = await api.put<OpportunityStage>(`/api/v1/opportunity-stages/${atual.code}`,
        { name: form.name.trim(), closePercent: decimalParaApi(form.closePercent) ?? form.closePercent }, `"${atual.version}"`);
      winRef.current.notify({ tone: 'sucesso', text: `Etapa ${r.data.name} atualizada com sucesso: ${pct(r.data.closePercent)} de fechamento` });
      window.dispatchEvent(new Event(ETAPAS_ALTERADAS));
      await recarregar();
      escolher(r.data);
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
  }, [atual, form, recarregar]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const editavel = admin && !!atual;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), win.requestClose())}>
        <div className="rp-ficha__cabecalho">
          <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
            <table className="rp-grid rp-janela-mdi__grade" aria-label="Etapas do funil">
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>Etapa</th>
                  <th className="num">% fechamento</th>
                  <th>Alterada em</th>
                </tr>
              </thead>
              <tbody>
                {(etapas ?? []).map((e) => (
                  <tr key={e.code} aria-selected={sel === e.code} onClick={() => escolher(e)}>
                    <td className="rownum">{e.position}</td>
                    <td>{e.name}</td>
                    <td className="num">{pct(e.closePercent)}</td>
                    <td>{e.updatedAt ? `${dataHora(e.updatedAt)} por ${e.updatedBy}` : 'Valor inicial'}</td>
                  </tr>
                ))}
                <tr>
                  <td className="rownum" />
                  <td>Ganha</td>
                  <td className="num">100,00%</td>
                  <td>Fixo</td>
                </tr>
                <tr>
                  <td className="rownum" />
                  <td>Perdida</td>
                  <td className="num">0,00%</td>
                  <td>Fixo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rp-form rp-ficha__situacao" aria-label="Ficha da etapa">
            <label className="rp-label" htmlFor={fid('nome')}>Nome</label>
            <input id={fid('nome')} className={`rp-field${editavel ? '' : ' rp-field--readonly'}`} maxLength={60} value={form.name} readOnly={!editavel}
              aria-invalid={!!erros.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {erroDe('name')}
            <label className="rp-label" htmlFor={fid('pct')}>% de fechamento</label>
            <input id={fid('pct')} className={`rp-field rp-field--num rp-field--curto${editavel ? '' : ' rp-field--readonly'}`} maxLength={6} value={form.closePercent}
              readOnly={!editavel} aria-invalid={!!erros.closePercent} onChange={(e) => setForm((f) => ({ ...f, closePercent: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && podeGravar && void gravar()} />
            {erroDe('closePercent')}
            {erros.geral && erroDe('geral')}
          </div>
        </div>
        <p className="rp-tip" role="note">
          Valor ponderado = potencial × % de fechamento da etapa. {atual ? '' : 'Escolha uma etapa na grade para ver o histórico.'}
        </p>
        {atual && <GradeHistorico historico={historico} rotulo={`Histórico da etapa ${atual.name}`} />}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {admin && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              Atualizar
            </button>
          )}
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
