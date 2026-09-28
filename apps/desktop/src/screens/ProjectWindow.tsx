import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type ApiError } from '../api/client';
import type { Equipment, HistoryEntry, Project, Receivable } from '../api/types';
import { dataDaApi, dataHora, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { GradeHistorico } from './comum/GradeHistorico';
import { ESTAGIO, seloEquipamento, seloEstagio, seloTitulo } from './comum/Selos';

type Tab = 'equipamentos' | 'receber' | 'historico';

/**
 * Detalhe do projeto (formulário "projeto"): o vínculo central entre pedido, cliente, unidade, equipamentos e
 * parcelas a receber. Nesta fase é consulta; responsáveis, estágios e cronograma entram com engenharia (B07).
 */
export function ProjectWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const [projeto, setProjeto] = useState<Project | null>(null);
  const [equipamentos, setEquipamentos] = useState<Equipment[] | null>(null);
  const [titulos, setTitulos] = useState<Receivable[] | null>(null);
  const [historico, setHistorico] = useState<HistoryEntry[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('equipamentos');

  useEffect(() => {
    const falhou = (e: ApiError) => {
      setErro(e.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${e.message} (${e.code})`);
      winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code}) [${e.correlationId ?? '—'}]` });
    };
    api.get<Project>(`/api/v1/projects/${recordKey}`).then((r) => setProjeto(r.data)).catch(falhou);
    api.get<Equipment[]>(`/api/v1/projects/${recordKey}/equipment`).then((r) => setEquipamentos(r.data)).catch(falhou);
    api.get<Receivable[]>(`/api/v1/receivables?includeCancelled=true&projectId=${recordKey}`).then((r) => setTitulos(r.data)).catch(() => setTitulos([]));
  }, [recordKey]);

  useEffect(() => {
    if (tab !== 'historico' || historico !== null) return;
    api
      .get<HistoryEntry[]>(`/api/v1/projects/${recordKey}/history`)
      .then((r) => setHistorico(r.data))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code})` }));
  }, [tab, recordKey, historico]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) {
      const alvo: Record<string, Tab> = { e: 'equipamentos', r: 'receber', h: 'historico' };
      const t = alvo[e.key.toLowerCase()];
      if (!t) return;
      e.preventDefault();
      setTab(t);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );
  const ativos = (titulos ?? []).filter((t) => t.status !== 'CANCELLED');
  const tabs: [Tab, ReactNode][] = [
    ['equipamentos', <span><u>E</u>quipamentos ({equipamentos?.length ?? 0})</span>],
    ['receber', <span>Parcelas a <u>r</u>eceber ({ativos.length})</span>],
    ['historico', <span><u>H</u>istórico</span>],
  ];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        {erro ? (
          <p className="rp-janela-mdi__aviso">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        ) : !projeto ? (
          <p className="rp-janela-mdi__aviso">Carregando</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Projeto</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Projeto" value={projeto.code} />
                <span className="rp-label">Nome</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Nome" value={projeto.name} />
                <span className="rp-label">Cliente</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta(`Abrir cliente ${projeto.customerCode}`, () => win.open('customer', projeto.customerId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Cliente" value={`${projeto.customerCode} — ${projeto.customerName}`} />
                </span>
                <span className="rp-label">Unidade</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Unidade" value={projeto.unitName} />
                <span className="rp-label">Pedido</span>
                <span />
                <span className="rp-ficha__ref">
                  {seta(`Abrir pedido ${projeto.orderCode}`, () => win.open('order', projeto.orderId))}
                  <input className="rp-field rp-field--readonly" readOnly aria-label="Pedido" value={projeto.orderCode} />
                </span>
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Estágio</span>
                <span>{seloEstagio(projeto.stage)}</span>
                <span className="rp-label">Entrega contratual</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Entrega contratual" value={dataDaApi(projeto.contractDelivery)} />
                <span className="rp-label">Valor contratado</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Valor contratado" value={reais(projeto.contractCents)} />
                <span className="rp-label">Criado em</span>
                <input className="rp-field rp-field--readonly" readOnly aria-label="Criado em" value={`${dataHora(projeto.createdAt)} por ${projeto.createdBy}`} />
                {projeto.closedReason && (
                  <>
                    <span className="rp-label">Motivo</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Motivo do encerramento" value={projeto.closedReason} />
                  </>
                )}
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
              {tab === 'equipamentos' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Equipamentos do projeto">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th aria-label="Abrir" />
                        <th>Equipamento</th>
                        <th>Modelo</th>
                        <th>Nº de série</th>
                        <th>Aceite</th>
                        <th>Início da garantia</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(equipamentos ?? []).map((e, i) => (
                        <tr key={e.id} onDoubleClick={() => win.open('equipment', e.id)}>
                          <td className="rownum">{i + 1}</td>
                          <td>{seta(`Abrir equipamento ${e.code}`, () => win.open('equipment', e.id))}</td>
                          <td>{e.code}</td>
                          <td>{e.model}</td>
                          <td>{e.serialNumber ?? ''}</td>
                          <td>{dataDaApi(e.acceptedOn)}</td>
                          <td>{dataDaApi(e.warrantyStart)}</td>
                          <td>{seloEquipamento(e.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {equipamentos?.length === 0 && <p className="rp-jlista__vazio">O pedido deste projeto não tem linhas de equipamento.</p>}
                </div>
              ) : tab === 'receber' ? (
                <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
                  <table className="rp-grid rp-janela-mdi__grade" aria-label="Parcelas a receber do projeto">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        <th aria-label="Abrir" />
                        <th>Título</th>
                        <th>Descrição</th>
                        <th>Vencimento</th>
                        <th className="num">Valor</th>
                        <th className="num">Recebido</th>
                        <th className="num">Saldo</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(titulos ?? []).map((t, i) => (
                        <tr key={t.id} onDoubleClick={() => win.open('receivable', t.id)}>
                          <td className="rownum">{i + 1}</td>
                          <td>{seta(`Abrir título ${t.code}`, () => win.open('receivable', t.id))}</td>
                          <td>{t.code}</td>
                          <td>{t.origin}</td>
                          <td>
                            {dataDaApi(t.dueDate)}
                            {t.overdue && <span className="rp-badge rp-badge--pendente rp-janela-mdi__selo">Vencido</span>}
                          </td>
                          <td className="num">{reais(t.originalCents)}</td>
                          <td className="num">{reais(t.receivedCents)}</td>
                          <td className="num">{reais(t.balanceCents)}</td>
                          <td>{seloTitulo(t.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Total em aberto</td>
                        <td className="num">{reais(ativos.reduce((s, t) => s + BigInt(t.originalCents), 0n).toString())}</td>
                        <td className="num">{reais(ativos.reduce((s, t) => s + BigInt(t.receivedCents), 0n).toString())}</td>
                        <td className="num">{reais(ativos.reduce((s, t) => s + BigInt(t.balanceCents), 0n).toString())}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <GradeHistorico historico={historico} rotulo="Histórico do projeto" />
              )}
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            OK
          </button>
        </div>
        <span className="rp-janela-mdi__aviso">{projeto ? `Estágio ${ESTAGIO[projeto.stage].toLowerCase()}; estágios e cronograma entram com a engenharia.` : ''}</span>
      </div>
    </>
  );
}
