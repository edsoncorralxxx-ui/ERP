import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Equipment, HistoryEntry } from '../api/types';
import { dataDaApi, dataHora } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { GradeHistorico } from './comum/GradeHistorico';
import { seloEquipamento } from './comum/Selos';
import { EQUIPAMENTOS_ALTERADOS } from './EquipmentsWindow';

type Tab = 'geral' | 'historico';
type Form = { serialNumber: string; notes: string };

const toForm = (e: Equipment): Form => ({ serialNumber: e.serialNumber ?? '', notes: e.notes ?? '' });

/**
 * Ficha do equipamento (formulário "equipamentos"): identidade própria, com o projeto, o pedido, o cliente e a unidade
 * de origem. O usuário informa número de série (único por modelo) e observações; aceite e início da garantia vêm do
 * aceite registrado na instalação (PD-015), nunca da previsão.
 */
export function EquipmentWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [eq, setEq] = useState<Equipment | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>({ serialNumber: '', notes: '' });
  const [tab, setTab] = useState<Tab>('geral');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);

  const somenteLeitura = !eq || eq.status === 'CANCELADO' || !can('equipment.update');
  const original = useMemo(() => (eq ? toForm(eq) : { serialNumber: '', notes: '' }), [eq]);
  const alterado = !somenteLeitura && JSON.stringify(form) !== JSON.stringify(original);

  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const aplicar = useCallback((e: Equipment, etagLido?: string) => {
    setEq(e);
    setEtag(etagLido ?? `"${e.version}"`);
    setForm(toForm(e));
    setErros({});
    setHistorico(null);
  }, []);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const r = await api.get<Equipment>(`/api/v1/equipment/${recordKey}`);
      aplicar(r.data, r.etag);
    } catch (e) {
      const x = e as ApiError;
      setErroCarga(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [recordKey, aplicar]);

  useEffect(() => void carregar(), [carregar]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/equipment/${recordKey}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, recordKey, historico]);

  const formRef = useRef(form);
  formRef.current = form;

  const gravar = useCallback(async (): Promise<boolean> => {
    if (!eq) return false;
    setGravando(true);
    try {
      const f = formRef.current;
      const r = await api.put<Equipment>(`/api/v1/equipment/${eq.id}`, { serialNumber: f.serialNumber.trim() || null, notes: f.notes.trim() || null }, etag);
      aplicar(r.data, r.etag);
      winRef.current.notify({ tone: 'sucesso', text: `Equipamento ${r.data.code} atualizado com sucesso` });
      window.dispatchEvent(new Event(EQUIPAMENTOS_ALTERADOS));
      return true;
    } catch (e) {
      tratarFalha(e, { objeto: 'O equipamento', notify: winRef.current.notify, setErros, setConflito });
      return false;
    } finally {
      setGravando(false);
    }
  }, [eq, etag, aplicar]);

  const podeGravar = alterado && !gravando;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito !== null) return;
    if (e.altKey) {
      const alvo: Record<string, Tab> = { g: 'geral', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (!t) return;
      e.preventDefault();
      setTab(t);
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  const tabs: [Tab, ReactNode][] = [
    ['geral', <span><u>G</u>eral</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erroCarga ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !eq ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Equipamento</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Equipamento" value={eq.code} />
                <span className="rp-label">Modelo</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Modelo" value={eq.model} />
                <label className="rp-label" htmlFor={fid('serie')}>Nº de série</label>
                <span />
                <input id={fid('serie')} className={classeCampo} value={form.serialNumber} maxLength={60} readOnly={somenteLeitura} aria-invalid={!!erros.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
                {erroDe('serialNumber')}
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  {seloEquipamento(eq.status)}
                  {alterado && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Alterações não salvas</span>}
                </span>
                <span className="rp-label">Versão</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Versão" value={eq.version} />
                <span className="rp-label">Atualizado em</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Atualizado em" value={`${dataHora(eq.updatedAt ?? eq.createdAt)} por ${eq.updatedBy ?? eq.createdBy}`} />
              </div>
            </div>

            <div className="rp-tabs" role="tablist">
              {tabs.map(([t, rotulo]) => (
                <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={tab === t} onClick={() => setTab(t)} onKeyDown={(e) => e.key === 'Enter' && setTab(t)}>
                  {rotulo}
                </div>
              ))}
            </div>
            <div className="rp-tabpanel" role="tabpanel">
              {tab === 'geral' ? (
                <div className="rp-form rp-janela-mdi__form">
                  <span className="rp-label">Cliente</span>
                  <span />
                  <span className="rp-ficha__ref">
                    {seta(`Abrir cliente ${eq.customerCode}`, () => win.open('customer', eq.customerId))}
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente" value={`${eq.customerCode} — ${eq.customerName}`} />
                  </span>
                  <span className="rp-label">Unidade</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Unidade" value={eq.unitName} />
                  <span className="rp-label">Projeto</span>
                  <span />
                  <span className="rp-ficha__ref">
                    {seta(`Abrir projeto ${eq.projectCode}`, () => win.open('project', eq.projectId))}
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Projeto" value={eq.projectCode} />
                  </span>
                  <span className="rp-label">Pedido</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Pedido" value={eq.orderCode} />
                  <span className="rp-label">Aceite</span>
                  <span />
                  <input className="rp-field rp-field--readonly rp-field--curto" readOnly aria-label="Aceite" value={dataDaApi(eq.acceptedOn)} placeholder="Na instalação" />
                  <span className="rp-label">Início da garantia</span>
                  <span />
                  <input className="rp-field rp-field--readonly rp-field--curto" readOnly aria-label="Início da garantia" value={dataDaApi(eq.warrantyStart)} placeholder="No aceite" />
                  <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
                  <span />
                  <textarea id={fid('obs')} className={`${classeCampo} rp-field--note`} value={form.notes} maxLength={1000} readOnly={somenteLeitura} aria-invalid={!!erros.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  {erroDe('notes')}
                  <span className="rp-label">Criado em</span>
                  <span />
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Criado em" value={`${dataHora(eq.createdAt)} por ${eq.createdBy}`} />
                  {eq.status === 'CANCELADO' && (
                    <>
                      <span className="rp-label">Situação</span>
                      <span />
                      <span className="rp-janela-mdi__aviso">
                        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Cancelado com o pedido {eq.orderCode}; o histórico é preservado.
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do equipamento" />
              )}
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {!somenteLeitura && (
            <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
              Atualizar
            </button>
          )}
          <button type="button" className={`rp-btn${somenteLeitura ? ' rp-btn--default' : ''}`} onClick={win.requestClose}>
            {somenteLeitura ? 'OK' : 'Cancelar'}
          </button>
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Equipamento alterado por outra pessoa" objeto="O equipamento" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
