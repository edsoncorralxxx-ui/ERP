import type { HistoryEntry } from '../../api/types';
import { competenciaDaApi, dataDaApi, dataHora, reais } from '../../format';
import { LinhaResto } from './LinhaResto';

export const ROTULO_HISTORICO: Record<string, string> = {
  code: 'Código', legalName: 'Razão social', tradeName: 'Nome fantasia', cnpj: 'CNPJ', group: 'Grupo', status: 'Situação',
  customerStatus: 'Situação como cliente', supplierStatus: 'Situação como fornecedor', units: 'Unidades', contacts: 'Contatos',
  leadTimeDays: 'Prazo de referência (dias)', paymentTerms: 'Condições de pagamento', suppliedCategories: 'Categorias fornecidas',
  description: 'Descrição', nature: 'Natureza', uom: 'Unidade de medida', category: 'Categoria', stockControlled: 'Controla estoque',
  referenceCost: 'Custo de referência', conversions: 'Conversões', ncm: 'NCM', serviceCode: 'Cód. serviço (LC 116)',
  title: 'Título', unit: 'Unidade', revision: 'Revisão', revisionStatus: 'Situação da revisão', validUntil: 'Validade',
  lines: 'Linhas', totalCents: 'Total', contractDate: 'Contratação', promisedDate: 'Prazo prometido', notes: 'Observações',
  installments: 'Parcelas', proposal: 'Proposta', order: 'Pedido', project: 'Projeto', equipment: 'Equipamentos', titles: 'Parcelas a receber',
  snapshotHash: 'Retrato da confirmação', name: 'Nome', stage: 'Estágio', model: 'Modelo', serialNumber: 'Nº de série',
  origin: 'Origem', dueDate: 'Vencimento', originalCents: 'Valor',
  receivedCents: 'Recebido', balanceCents: 'Saldo', settlement: 'Recebimento', account: 'Conta', effectiveDate: 'Data', reversalDate: 'Data do estorno',
  number: 'Nota', customer: 'Cliente', issueDate: 'Emissão', competence: 'Competência', linkedCents: 'Vinculado', links: 'Vínculos',
  operationNature: 'Natureza da operação', classificationRevision: 'Revisão da classificação', document: 'Documento', invoiced: 'Faturado',
  companyName: 'Empresa', city: 'Cidade', state: 'UF', hasRenda: 'Possui Renda+', rating: 'Estrelas', discardReason: 'Motivo do descarte',
  owner: 'Responsável', source: 'Origem', contactName: 'Contato', contactPhone: 'Telefone', contactEmail: 'E-mail',
  nextActionDate: 'Próxima ação em', nextActionNote: 'Próxima ação', lead: 'Prospecção', interest: 'Interesse',
  potentialCents: 'Potencial', expectedClose: 'Previsão de fechamento', lossReason: 'Motivo da perda', lossNote: 'Detalhe da perda',
  wonOrder: 'Pedido ganho', competitors: 'Concorrentes', closePercent: 'Fechamento (%)', file: 'Arquivo', leads: 'Prospecções',
  simulation: 'Cálculo', result: 'Resultado', informedRbt12: 'RBT12 informado', informedBy: 'Informado por', pgdasReceipt: 'Recibo do PGDAS-D',
  transmittedOn: 'Transmitido em', declaredRevenue: 'Receita declarada', dasTotal: 'Total da guia DAS', documentNumber: 'Nº do documento',
  difference: 'Diferença guia − cálculo', dasTitle: 'Título do DAS', step: 'Etapa', revenue: 'Receita', optedSince: 'Optante desde',
  cnaeMain: 'CNAE principal', cnaeSecondary: 'CNAE secundário', nfseIssuer: 'Emissor de NFS-e', annualLimit: 'Limite anual',
  sublimit: 'Sublimite', tolerance: 'Excesso tolerado', alertThreshold: 'Avisar ao atingir', ibsCbsOption: 'Opção IBS/CBS', framing: 'Enquadramento',
  annex: 'Anexo', taxes: 'Tributos no DAS', cfopInternal: 'CFOP interno', cfopInterstate: 'CFOP interestadual', csosn: 'CSOSN', nbs: 'NBS',
  issRetention: 'Retenção de ISS', review: 'Revisar', receiptNumber: 'Recibo', deliveredOn: 'Entregue em', responsible: 'Responsável',
  detail: 'Detalhe', authorization: 'Autorização', authorizationProtocol: 'Protocolo', months: 'Meses',
};
export const ACAO_HISTORICO: Record<string, string> = {
  PARTNER_REGISTERED: 'Cadastro', PARTNER_UPDATED: 'Alteração', PARTNER_DEACTIVATED: 'Inativação', PARTNER_ROLE_ENABLED: 'Novo papel',
  ITEM_REGISTERED: 'Cadastro', ITEM_UPDATED: 'Alteração', ITEM_DEACTIVATED: 'Inativação',
  PROPOSAL_DRAFTED: 'Cadastro', PROPOSAL_UPDATED: 'Alteração', PROPOSAL_REVISION_ISSUED: 'Revisão emitida',
  PROPOSAL_REVISION_CREATED: 'Nova revisão', PROPOSAL_LOST: 'Perda', PROPOSAL_WON: 'Ganho (convertida em pedido)',
  SALES_ORDER_DRAFTED: 'Cadastro', SALES_ORDER_UPDATED: 'Alteração', SALES_ORDER_CONFIRMED: 'Confirmação', SALES_ORDER_CANCELLED: 'Cancelamento',
  PROJECT_CREATED: 'Criação', PROJECT_CLOSED: 'Encerramento', EQUIPMENT_CREATED: 'Criação', EQUIPMENT_UPDATED: 'Alteração',
  EQUIPMENT_CANCELLED: 'Cancelamento',
  FINANCIAL_TITLE_CREATED: 'Criação', FINANCIAL_TITLE_SETTLED: 'Recebimento', FINANCIAL_TITLE_SETTLEMENT_REVERSED: 'Estorno de recebimento',
  FINANCIAL_TITLE_CANCELLED: 'Cancelamento', FINANCIAL_TITLE_DOCUMENT_LINKED: 'Nota vinculada', FINANCIAL_TITLE_DOCUMENT_UNLINKED: 'Vínculo com nota desfeito',
  DOCUMENT_REGISTERED: 'Registro', DOCUMENT_LINKED_TO_TITLES: 'Vínculo com parcelas', DOCUMENT_LINK_REMOVED: 'Vínculo desfeito',
  DOCUMENT_CANCELLED: 'Cancelamento', DOCUMENT_CLASSIFIED: 'Classificação',
  LEAD_REGISTERED: 'Cadastro', LEAD_UPDATED: 'Alteração', LEAD_DISCARDED: 'Descarte', LEAD_INTERACTION_RECORDED: 'Interação',
  LEAD_CONVERTED: 'Convertida em cliente', LEAD_CUSTOMER_LINKED: 'Ligada a cliente', OPPORTUNITY_OPENED: 'Abertura',
  OPPORTUNITY_UPDATED: 'Alteração', OPPORTUNITY_STAGE_CHANGED: 'Mudança de etapa', OPPORTUNITY_LOST: 'Perda', OPPORTUNITY_WON: 'Ganho',
  OPPORTUNITY_INTERACTION_RECORDED: 'Interação', OPPORTUNITY_CUSTOMER_LINKED: 'Cliente ligado', OPPORTUNITY_STAGE_CONFIGURED: 'Configuração da etapa',
  TAX_SIMULATION_RECORDED: 'Cálculo do DAS', TAX_RBT12_INFORMED: 'RBT12 informado', TAX_DECLARATION_RECORDED: 'Transmissão do PGDAS-D',
  TAX_DAS_GUIDE_ISSUED: 'Guia DAS', TAX_PERIOD_CONFIRMED: 'Conferência do contador', TAX_CLOSING_STEP_COMPLETED: 'Etapa concluída',
  TAX_CLOSING_STEP_UNDONE: 'Etapa desfeita', TAX_PERIOD_CLOSED: 'Encerramento', TAX_PERIOD_REOPENED: 'Reabertura',
  TAX_PROFILE_UPDATED: 'Dados da empresa no Simples', TAX_ACTIVITY_REGISTERED: 'Nova atividade', TAX_ACTIVITY_UPDATED: 'Atividade alterada',
  TAX_IBS_CBS_OPTION_RECORDED: 'Opção IBS/CBS', TAX_OBLIGATION_REGISTERED: 'Cadastro', TAX_OBLIGATION_UPDATED: 'Alteração',
  TAX_OBLIGATION_DELIVERED: 'Entrega', ITEM_FISCAL_PROFILE_UPDATED: 'Classificação fiscal', DOCUMENT_AUTHORIZATION_RECORDED: 'Autorização',
};
const VALOR: Record<string, string> = {
  ATIVO: 'Ativo', INATIVO: 'Inativo', MATERIAL: 'Produto', SERVICO: 'Serviço', ABERTA: 'Aberta', GANHA: 'Ganha', PERDIDA: 'Perdida',
  RASCUNHO: 'Rascunho', EMITIDA: 'Emitida', DRAFT: 'Rascunho', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado', PLANEJADO: 'Planejado',
  ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado', OPEN: 'Em aberto', PARTIAL: 'Parcial', SETTLED: 'Liquidado', DESFEITO: 'Desfeito',
  IDENTIFICADO: 'Identificado', CONTATADO: 'Contatado', INTERESSADO: 'Interessado', DESCARTADO: 'Descartado', SIM: 'Sim', NAO: 'Não',
  DESCONHECIDO: 'Desconhecido', BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto', QUALIFICACAO: 'Qualificação', VISITA_TECNICA: 'Visita técnica',
  PROPOSTA: 'Proposta', NEGOCIACAO: 'Negociação', PRECO: 'Preço', PRAZO: 'Prazo', CONCORRENTE: 'Concorrente', SEM_ORCAMENTO: 'Sem orçamento',
  DESISTIU: 'Desistiu', OUTRO: 'Outro', INDICACAO: 'Indicação', FEIRA: 'Feira', SITE: 'Site', LISTA: 'Lista de prospecção',
  PROSPECCAO_ATIVA: 'Prospecção ativa', CLIENTE_ATUAL: 'Cliente atual',
  AUTORIZADA: 'Autorizada', PENDENTE: 'Pendente', EM_APURACAO: 'Em apuração', ENCERRADA: 'Encerrada', ENTREGUE: 'Entregue', PAGO: 'Pago',
  A_ENTREGAR: 'A entregar', EM_PREPARACAO: 'Em preparação', DECISAO_PENDENTE: 'Decisão pendente', CONFORME_MUNICIPIO: 'Conforme o município',
  INSUMO: 'Insumo',
  VENDA_PRODUCAO: 'Venda de produção própria', VENDA_MERCADORIA: 'Venda de mercadoria', PRESTACAO_SERVICO: 'Prestação de serviço', REMESSA: 'Remessa',
};

/** Valor de código da auditoria por extenso (ATIVO → Ativo); texto livre volta como veio. */
export const valorHistorico = (v: string, _campo = ''): string => VALOR[v] ?? v;

/** Valores em centavos (campos terminados em Cents) aparecem em reais; datas AAAA-MM-DD em DD/MM/AAAA; competência em MM/AAAA. */
const texto = (v: string | null, campo = '') => {
  if (v === null) return '';
  if (campo.endsWith('Cents') && /^-?\d+$/.test(v)) return reais(v);
  if (campo === 'competence' && /^\d{4}-\d{2}$/.test(v)) return competenciaDaApi(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataDaApi(v);
  return VALOR[v] ?? v;
};

/** Aba Histórico: lê a auditoria — quando, quem, a operação e o que mudou (antes → depois), com o motivo. */
export function GradeHistorico({ historico, rotulo }: { historico: HistoryEntry[] | null; rotulo: string }) {
  return (
    <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
      {historico === null ? (
        <p className="rp-janela-mdi__aviso">Carregando</p>
      ) : (
        <table className="rp-grid rp-janela-mdi__grade" aria-label={rotulo}>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Usuário</th>
              <th>Operação</th>
              <th className="num">Versão</th>
              <th>Campo</th>
              <th>Antes</th>
              <th>Depois</th>
            </tr>
          </thead>
          <tbody>
            {historico.flatMap((h, i) => {
              const mudancas = Object.entries(h.changes);
              const linhas: [string, string, string][] = mudancas.length ? mudancas.map(([k, v]) => [ROTULO_HISTORICO[k] ?? k, texto(v.before, k), texto(v.after, k)]) : [['', '', '']];
              if (h.reason) linhas.push(['Motivo', '', h.reason]);
              return linhas.map(([campo, antes, depois], j) => (
                <tr key={`${i}-${j}`}>
                  <td>{j === 0 ? dataHora(h.occurredAt) : ''}</td>
                  <td>{j === 0 ? h.actor : ''}</td>
                  <td>{j === 0 ? ACAO_HISTORICO[h.action] ?? h.action : ''}</td>
                  <td className="num">{j === 0 ? h.version : ''}</td>
                  <td>{campo}</td>
                  <td className="rp-ficha__antes">{antes}</td>
                  <td>{depois}</td>
                </tr>
              ));
            })}
            <LinhaResto colunas={7} numerada={false} />
          </tbody>
        </table>
      )}
    </div>
  );
}
