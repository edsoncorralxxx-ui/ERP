import { useEffect, useState } from 'react';
import { api, type ApiError } from '../api/client';
import type { PlannedCost } from '../api/types';
import { centavos, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { BOM_ALTERADA } from './BomRevisionWindow';
import { margem } from './comum/Bom';

/**
 * Aba Custo planejado do Detalhe do projeto (Sprint 10): a soma das BOMs dos equipamentos contra o valor contratado. A
 * margem prevista só aparece quando todos os equipamentos ativos têm BOM sem pendência; equipamento sem BOM fica "sem
 * custo planejado", nunca zero. Cada custo abre a BOM do equipamento.
 */
export function PlannedCostPanel({ projectId }: { projectId: string }) {
  const win = useWindow();
  const [custo, setCusto] = useState<PlannedCost | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () =>
      api.get<PlannedCost>(`/api/v1/projects/${projectId}/planned-cost`)
        .then((r) => (setCusto(r.data), setErro(null)))
        .catch((e: ApiError) => setErro(e.isNetwork ? 'Sem conexão com o servidor.' : `${e.message} (${e.code})`));
    void carregar();
    window.addEventListener(BOM_ALTERADA, carregar);
    return () => window.removeEventListener(BOM_ALTERADA, carregar);
  }, [projectId]);

  if (erro) {
    return (
      <p className="rp-janela-mdi__aviso">
        <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
      </p>
    );
  }
  if (!custo) return <p className="rp-janela-mdi__aviso">Carregando</p>;
  const abrir = (id: string) => win.open('equipment', id);

  return (
    <div className="rp-ficha__geral">
      <div className="rp-form rp-janela-mdi__form">
        <span className="rp-label">Valor contratado</span>
        <span />
        <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Valor contratado do projeto" value={reais(custo.contractCents)} />
        <span className="rp-label">Custo planejado</span>
        <span />
        <input className="rp-field rp-field--readonly rp-field--num rp-field--curto" readOnly aria-label="Custo planejado" value={reais(custo.plannedCostCents)} />
        <span className="rp-label">Margem prevista</span>
        <span />
        <input className="rp-field rp-field--readonly rp-field--num rp-bom__margem" readOnly aria-label="Margem prevista"
          value={custo.marginCents === null ? '' : `${reais(custo.marginCents)} (${margem(custo.marginRate)})`}
          placeholder="Sem margem: falta custo planejado" />
      </div>
      {!custo.complete && (
        <p className="rp-janela-mdi__aviso" role="status">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" />{' '}
          {custo.withoutBom > 0
            ? `${custo.withoutBom} ${custo.withoutBom === 1 ? 'equipamento está' : 'equipamentos estão'} sem custo planejado; aplique a BOM na ficha do equipamento. O custo acima é parcial e a margem só aparece com todos.`
            : custo.equipment.length === 0 ? 'O projeto não tem equipamentos ativos.' : 'Há linhas sem quantidade ou custo nas BOMs dos equipamentos; o custo acima é parcial.'}
        </p>
      )}
      <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
        <table className="rp-grid rp-janela-mdi__grade" aria-label="Custo planejado por equipamento">
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th aria-label="Abrir" />
              <th>Equipamento</th>
              <th>Modelo</th>
              <th>BOM</th>
              <th>Revisão</th>
              <th>Ajustada</th>
              <th className="num">Custo planejado</th>
            </tr>
          </thead>
          <tbody>
            {custo.equipment.map((e, i) => (
              <tr key={e.equipment.id} onDoubleClick={() => abrir(e.equipment.id)}>
                <td className="rownum">{i + 1}</td>
                <td>
                  <span className="rp-link" role="link" tabIndex={0} aria-label={`Abrir equipamento ${e.equipment.code}`} title={`Abrir equipamento ${e.equipment.code}`}
                    onClick={() => abrir(e.equipment.id)} onKeyDown={(k) => k.key === 'Enter' && abrir(e.equipment.id)} />
                </td>
                <td>{e.equipment.code}</td>
                <td>{e.equipment.modelName}</td>
                <td>{e.bomName ?? ''}</td>
                <td>{e.revisionLabel ?? ''}</td>
                <td>{e.applied ? (e.adjusted ? 'Sim' : 'Não') : ''}</td>
                <td className="num">{e.applied ? centavos(e.costCents) : <span className="rp-badge rp-badge--pendente">Sem custo planejado</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>{custo.complete ? 'Custo planejado' : 'Custo planejado (parcial)'}</td>
              <td className="num" aria-label="Soma do custo planejado">{centavos(custo.plannedCostCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
