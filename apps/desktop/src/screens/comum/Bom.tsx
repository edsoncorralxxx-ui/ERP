import type { BomProblem, EquipmentBomLine } from '../../api/types';
import { decimalDaApi } from '../../format';

/** Avisado depois de gravar uma BOM ou a BOM de um equipamento, para as listas e outras janelas recarregarem. */
export const BOM_ALTERADA = 'renda:bom-alterada';

/** Selos e apoio das janelas da BOM (Sprint 10). */
const selo = (classe: string, texto: string) => <span className={`rp-badge${classe ? ` rp-badge--${classe}` : ''}`}>{texto}</span>;

export const ESTADO_LINHA: Record<EquipmentBomLine['state'], string> = { MODEL: 'Do modelo', CHANGED: 'Alterada', ADDED: 'Incluída', REMOVED: 'Retirada' };
export const seloEstadoLinha = (s: EquipmentBomLine['state']) =>
  s === 'MODEL' ? null : selo(s === 'CHANGED' ? 'pendente' : s === 'ADDED' ? 'aberto' : 'cancelado', ESTADO_LINHA[s]);

const ICONE: Record<BomProblem['severity'], string> = { BLOCKING: 'erro', WARNING: 'aviso', INFO: 'info' };
export const SEVERIDADE: Record<BomProblem['severity'], string> = { BLOCKING: 'Impede aplicar ao equipamento', WARNING: 'Aviso', INFO: 'Informação' };

/** Lista de problemas com ícone e palavra (nunca só a cor). */
export function ListaProblemas({ problemas, rotulo }: { problemas: BomProblem[]; rotulo: string }) {
  if (problemas.length === 0) {
    return (
      <p className="rp-janela-mdi__aviso">
        <i className="rp-ico rp-ico-status-sucesso" aria-hidden="true" /> Nenhum problema encontrado.
      </p>
    );
  }
  return (
    <ul className="rp-bom__problemas" aria-label={rotulo}>
      {problemas.map((p, i) => (
        <li key={i}>
          <i className={`rp-ico rp-ico-status-${ICONE[p.severity]}`} aria-hidden="true" /> <b>{SEVERIDADE[p.severity]}:</b> {p.message}
        </li>
      ))}
    </ul>
  );
}

/** Quantidade da API ("2.5") no padrão brasileiro sem casas sobrando ("2,5"); vazia fica vazia. */
export const quantidade = (v: string | null | undefined) => decimalDaApi(v, 0);

/** Custo unitário da API com duas casas no mínimo ("25,69", "0,333333"). */
export const custo = (v: string | null | undefined) => decimalDaApi(v, 2);

/** Margem como fração da API ("0.4216", "-0.12") em percentual com duas casas: `42,16%`, `-12,00%`. */
export const margem = (fracao: string | null | undefined): string => {
  if (!fracao || !/^-?\d+(\.\d+)?$/.test(fracao)) return '';
  const negativo = fracao.startsWith('-');
  const [i, f = ''] = fracao.replace('-', '').split('.');
  // Fração com 6 casas = centésimos de ponto percentual × 100; arredonda meio para cima nos centésimos.
  const milionesimos = BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
  const centesimos = (milionesimos + 50n) / 100n;
  const inteiro = centesimos / 100n;
  const resto = (centesimos % 100n).toString().padStart(2, '0');
  return `${negativo && centesimos > 0n ? '-' : ''}${inteiro},${resto}%`;
};
