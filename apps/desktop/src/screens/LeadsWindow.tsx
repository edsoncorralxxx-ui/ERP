import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { numero } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { avisarCrm, classeSelo, CRM_ALTERADO, ORIGEM_MOCK, SITUACAO_LEAD } from './comum/CrmMock';
import { PROSPECCOES_ALTERADAS } from './comum/Crm';
import { DialogoMotivo } from './comum/Dialogos';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

let novas = 0;
export const novaProspeccao = () => `novo-${++novas}`;

type LeadLinha = {
  id: string; code: string; contactName: string | null; companyName: string; city: string | null; state: string | null; dailyCapacityTons: number | null;
  score: number | null; stage: string; source: string; owner: string; phone: string | null; email: string | null; interestItem: string | null;
  lastContact: string | null; daysSinceContact: number | null; partnerId: string | null; version: string;
};

const SITUACOES = ['Abertos', 'Novo', 'Em contato', 'Qualificado', 'Descartado', 'Todos'];

/** Recomendação por regra (não é IA): pela pontuação de qualificação do lead, como os três casos do mock. */
function recomendacao(l: LeadLinha): { titulo: string; texto: string; icone: string } {
  const s = l.score ?? 0;
  const moagem = l.dailyCapacityTons ? `moagem de ${numero(l.dailyCapacityTons)} t/dia` : 'moagem não informada';
  if (s >= 75) return { titulo: 'Pronto para converter', icone: 'rp-ico-ia-classificacao', texto: `Pontuação ${s} (75 ou mais) e ${moagem}: perfil dos clientes que fecharam. Converta em oportunidade.` };
  if (s >= 50) return { titulo: 'Agendar visita técnica', icone: 'rp-ico-ia-classificacao', texto: `Pontuação ${s}: interesse confirmado. Falta validar quantas moegas recebem mandioca e se a compra sai antes da próxima safra.` };
  return { titulo: 'Baixa aderência', icone: 'rp-ico-ia-risco', texto: `Pontuação ${s} e ${moagem}: pequena para a R50. Sugira a R50 Compacta.` };
}

/**
 * Leads do mock (CRM-Leads): Localizar, Situação e Origem; a grade com número, nome, empresa, cidade, moagem, pontuação e
 * situação; à direita a ficha do lead escolhido, a barra de pontuação e a recomendação por regra. Converter em
 * oportunidade, Novo lead, Registrar atividade e Descartar embaixo.
 */
export function LeadsWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [linhas, setLinhas] = useState<LeadLinha[] | null>(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('Abertos');
  const [origem, setOrigem] = useState('');
  const [filtro, setFiltro] = useState({ busca: '', situacao: 'Abertos', origem: '' });
  const [sel, setSel] = useState<string | null>(null);
  const [descartar, setDescartar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<LeadLinha[]>('/api/v1/crm/lead-board');
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
    window.addEventListener(PROSPECCOES_ALTERADAS, f);
    return () => (window.removeEventListener(CRM_ALTERADO, f), window.removeEventListener(PROSPECCOES_ALTERADAS, f));
  }, [carregar]);

  const filtradas = useMemo(() => {
    const t = filtro.busca.trim().toLowerCase();
    return (linhas ?? []).filter((l) => {
      const st = SITUACAO_LEAD[l.stage];
      if (filtro.situacao === 'Abertos' ? st === 'Descartado' : filtro.situacao !== 'Todos' && st !== filtro.situacao) return false;
      if (filtro.origem && l.source !== filtro.origem) return false;
      return !t || `${l.contactName ?? ''} ${l.companyName} ${l.city ?? ''}`.toLowerCase().includes(t);
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [linhas, filtro]);
  const atual = filtradas.find((l) => l.id === sel) ?? filtradas[0] ?? null;
  const novos = (linhas ?? []).filter((l) => l.stage === 'IDENTIFICADO' && l.lastContact === null).length
    || filtradas.filter((l) => l.stage === 'IDENTIFICADO').length;
  const aberto = !!atual && atual.stage !== 'DESCARTADO';
  const rec = atual ? recomendacao(atual) : null;
  const novo = useMemo(() => (can('lead.create') ? () => win.open('lead', novaProspeccao()) : undefined), [can, win]);
  useEffect(() => win.registerCommands({ novo }), [novo, win]);

  const converter = () => atual && win.open('opportunity', `novo-${Date.now()}:lead:${atual.id}`);
  const confirmarDescarte = async (motivo: string) => {
    setDescartar(false);
    if (!atual) return;
    try {
      await api.post(`/api/v1/leads/${atual.id}/discard`, { reason: motivo }, { 'If-Match': `"${atual.version}"` });
      win.notify({ tone: 'sucesso', text: `Lead ${atual.code} descartado` });
      avisarCrm();
    } catch (e) {
      const x = e as ApiError;
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  };
  const ultimo = (l: LeadLinha) => (l.daysSinceContact === null ? 'Sem contato' : l.daysSinceContact === 0 ? 'Hoje' : `Há ${l.daysSinceContact} ${l.daysSinceContact === 1 ? 'dia' : 'dias'}`);
  const origens = [...new Set((linhas ?? []).map((l) => l.source))];

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-crmleads">
        <div className="rp-filtros">
          <label>Localizar <input className="rp-field rp-crmleads__busca" aria-label="Localizar" placeholder="Nome, empresa ou cidade" value={busca} maxLength={100}
            onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFiltro({ busca, situacao, origem })} /></label>
          <label>Situação <Selecao aria-label="Situação" valor={situacao} onChange={setSituacao} largura="130px" opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: s }))} /></label>
          <label>Origem <Selecao aria-label="Origem" valor={origem} onChange={setOrigem} largura="190px"
            opcoes={[{ valor: '', rotulo: 'Todas' }, ...origens.map((o) => ({ valor: o, rotulo: ORIGEM_MOCK[o] ?? o }))]} /></label>
          <button type="button" className="rp-btn rp-btn--default" onClick={() => setFiltro({ busca, situacao, origem })}>Aplicar</button>
          <button type="button" className="rp-btn" onClick={() => (setBusca(''), setSituacao('Abertos'), setOrigem(''), setFiltro({ busca: '', situacao: 'Abertos', origem: '' }))}>Limpar</button>
        </div>
        <div className="rp-crmleads__corpo">
          <div className="rp-grid-rolagem rp-rolagem rp-crmleads__grade">
            <table className="rp-grid rp-crmleads__tabela" aria-label="Leads">
              <thead>
                <tr><th style={{ width: '34px' }}>#</th><th style={{ width: '64px' }}>Nº</th><th>Nome</th><th>Empresa</th><th style={{ width: '150px' }}>Cidade / UF</th>
                  <th className="num" style={{ width: '96px' }}>Moagem t/dia</th><th className="num" style={{ width: '82px' }}>Pontuação</th><th style={{ width: '112px' }}>Situação</th></tr>
              </thead>
              <tbody>
                {filtradas.map((l, i) => (
                  <tr key={l.id} aria-selected={atual?.id === l.id} onClick={() => setSel(l.id)} onDoubleClick={() => win.open('lead', l.id)}>
                    <td className="rownum">{i}</td><td>{l.code}</td><td title={l.contactName ?? ''}>{l.contactName}</td><td title={l.companyName}>{l.companyName}</td>
                    <td>{[l.city, l.state].filter(Boolean).join(' / ')}</td><td className="num">{l.dailyCapacityTons ?? ''}</td><td className="num">{l.score ?? ''}</td>
                    <td><span className={classeSelo(SITUACAO_LEAD[l.stage])}>{SITUACAO_LEAD[l.stage]}</span></td>
                  </tr>
                ))}
                <LinhaResto colunas={8} />
              </tbody>
              <tfoot>
                <tr><td colSpan={8}>{linhas === null ? 'Carregando' : `${filtradas.length} ${filtradas.length === 1 ? 'lead' : 'leads'} · ${novos} ${novos === 1 ? 'novo' : 'novos'} sem primeiro contato`}</td></tr>
              </tfoot>
            </table>
          </div>
          <div className="rp-crmleads__lado rp-rolagem">
            {atual && (
              <>
                <fieldset className="rp-grupo">
                  <legend>Lead {atual.code}</legend>
                  <div className="rp-grupo-corpo">
                    <div className="rp-form rp-crmleads__ficha">
                      {([['Nome', atual.contactName], ['Empresa', atual.companyName], ['Cidade / UF', [atual.city, atual.state].filter(Boolean).join(' / ')],
                        ['Telefone', atual.phone], ['E-mail', atual.email], ['Interesse', atual.interestItem]] as [string, string | null][]).map(([r, v]) => (
                        <Campo key={r} rotulo={r} valor={v ?? ''} />
                      ))}
                      <span className="rp-label">Moagem (t/dia)</span>
                      <input className="rp-field rp-field--readonly rp-field--num" aria-label="Moagem (t/dia)" value={atual.dailyCapacityTons ?? ''} readOnly />
                      <Campo rotulo="Origem" valor={ORIGEM_MOCK[atual.source] ?? atual.source} />
                      <Campo rotulo="Responsável" valor={atual.owner} />
                      <Campo rotulo="Último contato" valor={ultimo(atual)} />
                      <span className="rp-label">Situação</span>
                      <span className={`${classeSelo(SITUACAO_LEAD[atual.stage])} rp-crmleads__selo`}>{SITUACAO_LEAD[atual.stage]}</span>
                    </div>
                  </div>
                </fieldset>
                <div className="rp-progress-row rp-crmleads__pontos">
                  <span>Pontuação</span>
                  <div className="rp-progress" role="progressbar" aria-valuenow={atual.score ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Pontuação de qualificação">
                    <span style={{ width: `${atual.score ?? 0}%` }} />
                  </div>
                  <b>{atual.score ?? '—'}</b>
                </div>
                {rec && (
                  <div className="rp-ai" role="region" aria-label="Recomendação">
                    <div className="rp-ai-item rp-crmleads__rec">
                      <i className={`rp-ico ${rec.icone}`} aria-hidden="true" />
                      <div><b>{rec.titulo}</b><p>{rec.texto}</p></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={!aberto || !can('opportunity.create')} onClick={converter}><span>Converter em <u>o</u>portunidade</span></button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
          <button type="button" className="rp-btn" disabled={!novo} onClick={novo}><span>Novo <u>l</u>ead</span></button>
          <button type="button" className="rp-btn" disabled={!atual} onClick={() => atual && win.open('crm-agenda', `lead:${atual.id}`)}><span>Registrar ativi<u>d</u>ade</span></button>
          <button type="button" className="rp-btn" disabled={!aberto || !can('lead.update')} onClick={() => setDescartar(true)}><span>Descar<u>t</u>ar</span></button>
        </div>
      </div>
      {descartar && atual && (
        <DialogoMotivo rotulo="Descartar lead" texto={`Descartar o lead ${atual.code} (${atual.companyName})? Informe o motivo.`} idCampo={`${win.windowId}-motivo`}
          botao="Descartar" falta="Informe o motivo do descarte." onConfirmar={(m) => void confirmarDescarte(m)} onCancelar={() => setDescartar(false)} />
      )}
    </>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <span className="rp-label">{rotulo}</span>
      <input className="rp-field rp-field--readonly" aria-label={rotulo} value={valor} readOnly title={valor} />
    </>
  );
}
