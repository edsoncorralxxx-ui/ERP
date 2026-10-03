import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { AgendaItem } from '../api/types';
import { dataDaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { ETAPAS_ALTERADAS, OPORTUNIDADES_ALTERADAS, PROSPECCOES_ALTERADAS, useEtapas, useResponsaveis } from './comum/Crm';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';
import { ETAPA_PROSPECCAO } from './comum/Selos';

const GRUPOS: { bucket: AgendaItem['bucket']; titulo: string; icone: string }[] = [
  { bucket: 'VENCIDA', titulo: 'Vencidas', icone: 'erro' },
  { bucket: 'HOJE', titulo: 'Hoje', icone: 'aviso' },
  { bucket: 'SEMANA', titulo: 'Próximos 7 dias', icone: 'info' },
  { bucket: 'DEPOIS', titulo: 'Depois', icone: 'info' },
  { bucket: 'SEM_ACAO', titulo: 'Oportunidade aberta sem próxima ação', icone: 'aviso' },
];

/**
 * Agenda do CRM (Sprint 11): as próximas ações das prospecções e das oportunidades abertas, agrupadas em vencidas, hoje,
 * próximos 7 dias e depois; oportunidade aberta sem próxima ação (só as criadas pela migração) aparece como pendência.
 * A seta abre a ficha; o filtro de responsável mostra a agenda de cada um.
 */
export function CrmAgendaWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { user } = useSession();
  const [responsavel, setResponsavel] = useState(user.username);
  const [itens, setItens] = useState<AgendaItem[] | null>(null);
  const responsaveis = useResponsaveis();
  const etapas = useEtapas();

  const recarregar = useCallback(async () => {
    try {
      const q = responsavel ? `?owner=${encodeURIComponent(responsavel)}` : '';
      setItens((await api.get<AgendaItem[]>(`/api/v1/crm/agenda${q}`)).data);
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, [responsavel]);
  useEffect(() => {
    void recarregar();
    const r = () => void recarregar();
    [PROSPECCOES_ALTERADAS, OPORTUNIDADES_ALTERADAS, ETAPAS_ALTERADAS].forEach((n) => window.addEventListener(n, r));
    return () => [PROSPECCOES_ALTERADAS, OPORTUNIDADES_ALTERADAS, ETAPAS_ALTERADAS].forEach((n) => window.removeEventListener(n, r));
  }, [recarregar]);

  const abrir = (i: AgendaItem) => win.open(i.kind === 'PROSPECCAO' ? 'lead' : 'opportunity', i.id);
  const etapa = (i: AgendaItem) =>
    i.kind === 'PROSPECCAO' ? ETAPA_PROSPECCAO[i.stage as keyof typeof ETAPA_PROSPECCAO] ?? i.stage : etapas.find((e) => e.code === i.stage)?.name ?? i.stage;
  const fid = `${win.windowId}-resp`;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-jlista" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), win.requestClose())}>
        <div className="rp-filtros rp-jlista__filtros">
          <label htmlFor={fid}>Responsável</label>
          <Selecao id={fid} valor={responsavel} onChange={setResponsavel}
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...responsaveis.map((r) => ({ valor: r.username, rotulo: r.displayName }))]} />
        </div>
        <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
          <table className="rp-grid rp-grid--resumo rp-janela-mdi__grade" aria-label="Agenda do CRM">
            <thead>
              <tr>
                <th aria-label="Abrir" />
                <th>Data</th>
                <th>Próxima ação</th>
                <th>Tipo</th>
                <th>Código</th>
                <th>Nome</th>
                <th>Empresa</th>
                <th>Etapa</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {itens === null ? (
                <tr>
                  <td colSpan={9}>Carregando</td>
                </tr>
              ) : (
                GRUPOS.flatMap((g) => {
                  const doGrupo = itens.filter((i) => i.bucket === g.bucket);
                  if (doGrupo.length === 0) return [];
                  return [
                    <tr key={g.bucket} className="grupo" data-aberto="sim">
                      <td colSpan={9}>
                        <i className={`rp-ico rp-ico-status-${g.icone}`} aria-hidden="true" /> {g.titulo} ({doGrupo.length})
                      </td>
                    </tr>,
                    ...doGrupo.map((i) => (
                      <tr key={`${i.kind}-${i.id}`} onDoubleClick={() => abrir(i)}>
                        <td className="rec">
                          <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir ${i.code}`} title={`Abrir ${i.code}`}
                            onClick={() => abrir(i)} onKeyDown={(e) => e.key === 'Enter' && abrir(i)} />
                        </td>
                        <td>{dataDaApi(i.nextActionDate)}</td>
                        <td>{i.nextActionNote ?? 'Defina a próxima ação'}</td>
                        <td>{i.kind === 'PROSPECCAO' ? 'Prospecção' : 'Oportunidade'}</td>
                        <td>{i.code}</td>
                        <td>{i.name}</td>
                        <td>{i.party}</td>
                        <td>{etapa(i)}</td>
                        <td>{i.owner}</td>
                      </tr>
                    )),
                  ];
                })
              )}
              <LinhaResto colunas={9} numerada={false} />
            </tbody>
          </table>
          {itens !== null && itens.length === 0 && <p className="rp-jlista__vazio">Nenhuma próxima ação {responsavel ? 'deste responsável' : ''}.</p>}
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={win.requestClose}>
            Cancelar
          </button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={() => void recarregar()}>
            Atualizar
          </button>
        </div>
      </div>
    </>
  );
}
