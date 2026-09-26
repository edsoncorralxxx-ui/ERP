import type { HistoryEntry } from '../../api/types';
import { dataHora } from '../../format';

const ROTULO: Record<string, string> = {
  code: 'Código', legalName: 'Razão social', tradeName: 'Nome fantasia', cnpj: 'CNPJ', group: 'Grupo', status: 'Situação',
  customerStatus: 'Situação como cliente', supplierStatus: 'Situação como fornecedor', units: 'Unidades', contacts: 'Contatos',
  leadTimeDays: 'Prazo de referência (dias)', paymentTerms: 'Condições de pagamento', suppliedCategories: 'Categorias fornecidas',
  description: 'Descrição', nature: 'Natureza', uom: 'Unidade de medida', category: 'Categoria', stockControlled: 'Controla estoque',
  referenceCost: 'Custo de referência', conversions: 'Conversões',
};
const ACAO: Record<string, string> = {
  PARTNER_REGISTERED: 'Cadastro', PARTNER_UPDATED: 'Alteração', PARTNER_DEACTIVATED: 'Inativação', PARTNER_ROLE_ENABLED: 'Novo papel',
  ITEM_REGISTERED: 'Cadastro', ITEM_UPDATED: 'Alteração', ITEM_DEACTIVATED: 'Inativação',
};
const VALOR: Record<string, string> = { ATIVO: 'Ativo', INATIVO: 'Inativo', MATERIAL: 'Material', SERVICO: 'Serviço' };

const texto = (v: string | null) => (v === null ? '' : VALOR[v] ?? v);

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
              const linhas: [string, string, string][] = mudancas.length ? mudancas.map(([k, v]) => [ROTULO[k] ?? k, texto(v.before), texto(v.after)]) : [['', '', '']];
              if (h.reason) linhas.push(['Motivo', '', h.reason]);
              return linhas.map(([campo, antes, depois], j) => (
                <tr key={`${i}-${j}`}>
                  <td>{j === 0 ? dataHora(h.occurredAt) : ''}</td>
                  <td>{j === 0 ? h.actor : ''}</td>
                  <td>{j === 0 ? ACAO[h.action] ?? h.action : ''}</td>
                  <td className="num">{j === 0 ? h.version : ''}</td>
                  <td>{campo}</td>
                  <td className="rp-ficha__antes">{antes}</td>
                  <td>{depois}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
