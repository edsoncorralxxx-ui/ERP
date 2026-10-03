import { useEffect, useRef, useState } from 'react';
import { api, type ApiError } from '../../api/client';
import type { CrmOwner, CrmSource, Interaction, InteractionKind, LossReason, OpportunityStage } from '../../api/types';
import { dataDaApi, dataParaApi, hojeIso } from '../../format';
import { Dialog } from '../../shell/Dialog';
import { novaChave } from './Cadastros';
import { CampoData } from './CampoData';
import { Selecao } from './Selecao';

/** Avisados pelas fichas do CRM depois de gravar, para as listas, a agenda e o funil abertos se atualizarem. */
export const PROSPECCOES_ALTERADAS = 'renda:prospeccoes-alteradas';
export const OPORTUNIDADES_ALTERADAS = 'renda:oportunidades-alteradas';
export const ETAPAS_ALTERADAS = 'renda:etapas-alteradas';

export const ORIGEM: Record<CrmSource, string> = {
  INDICACAO: 'Indicação', FEIRA: 'Feira', SITE: 'Site', LISTA: 'Lista de prospecção', PROSPECCAO_ATIVA: 'Prospecção ativa',
  CLIENTE_ATUAL: 'Cliente atual', OUTRO: 'Outro',
};
export const opcoesOrigem = Object.entries(ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo }));

export const TIPO_INTERACAO: Record<InteractionKind, string> = {
  LIGACAO: 'Ligação', EMAIL: 'E-mail', WHATSAPP: 'WhatsApp', VISITA: 'Visita', REUNIAO: 'Reunião', NOTA: 'Nota',
};

export const MOTIVO_PERDA: Record<LossReason, string> = {
  PRECO: 'Preço', PRAZO: 'Prazo', CONCORRENTE: 'Concorrente', SEM_ORCAMENTO: 'Sem orçamento', DESISTIU: 'Desistiu', OUTRO: 'Outro',
};
export const opcoesMotivo = Object.entries(MOTIVO_PERDA).map(([valor, rotulo]) => ({ valor, rotulo }));

export const INTERESSE = { BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto' } as const;
export const AMEACA = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' } as const;
export const RENDA = { SIM: 'Sim', NAO: 'Não', DESCONHECIDO: 'Desconhecido' } as const;

/** Estrelas de 1 a 5; vazio é desconhecido, nunca zero (formulário "prospeccao" do B01). */
export const estrelas = (n: number | null) => (n === null ? 'Sem classificação' : `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`);

/** Percentual da API ("25.00") no padrão brasileiro: "25,00%". */
export const pct = (v: string | null | undefined) => (v === null || v === undefined ? '' : `${v.replace('.', ',')}%`);

/** Usuários ativos, para o responsável. */
export function useResponsaveis(): CrmOwner[] {
  const [lista, setLista] = useState<CrmOwner[]>([]);
  useEffect(() => {
    api.get<CrmOwner[]>('/api/v1/crm/owners').then((r) => setLista(r.data)).catch(() => undefined);
  }, []);
  return lista;
}

/** Etapas do funil com o percentual de fechamento; recarrega quando alguém muda a configuração. */
export function useEtapas(): OpportunityStage[] {
  const [lista, setLista] = useState<OpportunityStage[]>([]);
  useEffect(() => {
    const ler = () => api.get<OpportunityStage[]>('/api/v1/opportunity-stages').then((r) => setLista(r.data)).catch(() => undefined);
    void ler();
    window.addEventListener(ETAPAS_ALTERADAS, ler);
    return () => window.removeEventListener(ETAPAS_ALTERADAS, ler);
  }, []);
  return lista;
}

/** Aba Interações: a mais recente primeiro, com a próxima ação combinada em cada uma. */
export function GradeInteracoes({ interacoes, rotulo }: { interacoes: Interaction[] | null; rotulo: string }) {
  return (
    <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
      {interacoes === null ? (
        <p className="rp-janela-mdi__aviso">Carregando</p>
      ) : (
        <table className="rp-grid rp-janela-mdi__grade" aria-label={rotulo}>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Contato</th>
              <th>Resumo</th>
              <th>Próxima ação</th>
              <th>Registrada por</th>
            </tr>
          </thead>
          <tbody>
            {interacoes.map((i, n) => (
              <tr key={i.id}>
                <td className="rownum">{n + 1}</td>
                <td>{dataDaApi(i.occurredOn)}</td>
                <td>{TIPO_INTERACAO[i.kind]}</td>
                <td>{i.contactName}</td>
                <td>{i.summary}</td>
                <td>{i.nextActionDate ? `${dataDaApi(i.nextActionDate)} — ${i.nextActionNote ?? ''}` : ''}</td>
                <td>{i.createdBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Registrar interação (atividade do SAP B1): tipo, data (hoje, nunca futura), contato, resumo e a próxima ação. Na
 * oportunidade aberta a próxima ação é obrigatória.
 */
export function DialogoInteracao({ caminho, idBase, contato, proximaObrigatoria, onCancelar, onRegistrada, onFalha }: {
  /** POST de destino: /api/v1/leads/{id}/interactions ou /api/v1/opportunities/{id}/interactions. */
  caminho: string;
  idBase: string;
  contato?: string | null;
  proximaObrigatoria: boolean;
  onCancelar: () => void;
  onRegistrada: (i: Interaction) => void;
  onFalha: (e: ApiError) => void;
}) {
  const [tipo, setTipo] = useState<InteractionKind>('LIGACAO');
  const [data, setData] = useState(dataDaApi(hojeIso()));
  const [nome, setNome] = useState(contato ?? '');
  const [resumo, setResumo] = useState('');
  const [proxData, setProxData] = useState('');
  const [proxNota, setProxNota] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const chave = useRef(novaChave());
  const registrar = async () => {
    try {
      const r = await api.post<Interaction>(caminho, {
        kind: tipo, occurredOn: dataParaApi(data), contactName: nome.trim() || null, summary: resumo.trim() || null,
        nextActionDate: dataParaApi(proxData), nextActionNote: proxNota.trim() || null,
      }, { 'Idempotency-Key': chave.current });
      onRegistrada(r.data);
    } catch (e) {
      const x = e as ApiError;
      if (x.status === 422) {
        const m: Record<string, string> = {};
        x.details.forEach((d) => d.field && (m[d.field] = d.message));
        setErros(m);
        chave.current = novaChave();
      } else onFalha(x);
    }
  };
  const erro = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  return (
    <Dialog icon="info" label="Registrar interação" onEscape={onCancelar}
      buttons={[
        { label: 'Registrar', primary: true, onClick: () => void registrar() },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      O que foi conversado e o que fica combinado. {proximaObrigatoria ? 'A oportunidade aberta precisa da próxima ação.' : ''}
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-tipo`}>Tipo</label>
        <Selecao id={`${idBase}-tipo`} valor={tipo} onChange={(v) => setTipo(v as InteractionKind)}
          opcoes={Object.entries(TIPO_INTERACAO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <label className="rp-label" htmlFor={`${idBase}-data`}>Data</label>
        <CampoData id={`${idBase}-data`} rotulo="Data da interação" valor={data} onChange={setData} invalido={!!erros.occurredOn} />
        {erro('occurredOn')}
        <label className="rp-label" htmlFor={`${idBase}-contato`}>Contato</label>
        <input id={`${idBase}-contato`} className="rp-field" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        <label className="rp-label" htmlFor={`${idBase}-resumo`}>Resumo</label>
        <input id={`${idBase}-resumo`} className="rp-field" maxLength={2000} value={resumo} aria-invalid={!!erros.summary}
          onChange={(e) => setResumo(e.target.value)} />
        {erro('summary')}
        <label className="rp-label" htmlFor={`${idBase}-prox-data`}>Próxima ação em</label>
        <CampoData id={`${idBase}-prox-data`} rotulo="Data da próxima ação" valor={proxData} onChange={setProxData} invalido={!!erros.nextActionDate} />
        {erro('nextActionDate')}
        <label className="rp-label" htmlFor={`${idBase}-prox-nota`}>Próxima ação</label>
        <input id={`${idBase}-prox-nota`} className="rp-field" maxLength={300} value={proxNota} aria-invalid={!!erros.nextActionNote}
          onChange={(e) => setProxNota(e.target.value)} />
        {erro('nextActionNote')}
      </div>
    </Dialog>
  );
}

/** Mudar de etapa (avança ou volta) com a nova próxima ação, obrigatória. */
export function DialogoEtapa({ etapas, atual, idBase, onCancelar, onConfirmar, erros }: {
  etapas: OpportunityStage[];
  atual: string;
  idBase: string;
  erros: Record<string, string>;
  onCancelar: () => void;
  onConfirmar: (etapa: string, data: string | null, nota: string) => void;
}) {
  const proxima = etapas.find((e) => e.position === (etapas.find((x) => x.code === atual)?.position ?? 0) + 1);
  const [etapa, setEtapa] = useState(proxima?.code ?? atual);
  const [data, setData] = useState('');
  const [nota, setNota] = useState('');
  const erro = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  return (
    <Dialog icon="info" label="Mudar etapa" onEscape={onCancelar}
      buttons={[
        { label: 'Mudar etapa', primary: true, onClick: () => onConfirmar(etapa, dataParaApi(data), nota.trim()) },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      A etapa muda o percentual de fechamento e o valor ponderado; a passagem fica na aba Etapas.
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-etapa`}>Etapa</label>
        <Selecao id={`${idBase}-etapa`} valor={etapa} onChange={setEtapa}
          opcoes={etapas.map((e) => ({ valor: e.code, rotulo: `${e.name} (${pct(e.closePercent)})${e.code === atual ? ' — atual' : ''}` }))} />
        {erro('stage')}
        <label className="rp-label" htmlFor={`${idBase}-data`}>Próxima ação em</label>
        <CampoData id={`${idBase}-data`} rotulo="Data da próxima ação" valor={data} onChange={setData} invalido={!!erros.nextActionDate} />
        {erro('nextActionDate')}
        <label className="rp-label" htmlFor={`${idBase}-nota`}>Próxima ação</label>
        <input id={`${idBase}-nota`} className="rp-field" maxLength={300} value={nota} aria-invalid={!!erros.nextActionNote}
          onChange={(e) => setNota(e.target.value)} />
        {erro('nextActionNote')}
      </div>
    </Dialog>
  );
}

/** Perda com o motivo da lista fixa; "Outro" exige o texto (decisão do PO em 03/10/2026). */
export function DialogoPerda({ texto, idBase, comTexto, onCancelar, onConfirmar }: {
  texto: string;
  idBase: string;
  /** Texto livre obrigatório sempre (perda da proposta, que guarda o motivo dela). */
  comTexto?: boolean;
  onCancelar: () => void;
  onConfirmar: (motivo: LossReason, detalhe: string) => void;
}) {
  const [motivo, setMotivo] = useState<LossReason | ''>('');
  const [detalhe, setDetalhe] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = () => {
    if (!motivo) setErro('Escolha o motivo da perda.');
    else if ((comTexto || motivo === 'OUTRO') && !detalhe.trim()) setErro('Descreva o motivo.');
    else onConfirmar(motivo, detalhe.trim());
  };
  return (
    <Dialog icon="aviso" label="Registrar perda" onEscape={onCancelar}
      buttons={[
        { label: 'Registrar perda', primary: true, onClick: confirmar },
        { label: 'Cancelar', onClick: onCancelar },
      ]}>
      {texto}
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={`${idBase}-motivo`}>Motivo</label>
        <Selecao id={`${idBase}-motivo`} valor={motivo} onChange={(v) => (setMotivo(v as LossReason), setErro(null))}
          opcoes={[{ valor: '', rotulo: 'Escolha o motivo' }, ...opcoesMotivo]} />
        <label className="rp-label" htmlFor={`${idBase}-detalhe`}>Detalhe</label>
        <input id={`${idBase}-detalhe`} className="rp-field" maxLength={500} value={detalhe}
          onChange={(e) => (setDetalhe(e.target.value), setErro(null))} onKeyDown={(e) => e.key === 'Enter' && confirmar()} />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}
