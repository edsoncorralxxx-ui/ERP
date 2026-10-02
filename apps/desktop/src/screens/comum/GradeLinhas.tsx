import type { KeyboardEvent } from 'react';
import type { ItemSummary, SalesLine, TipoLinha } from '../../api/types';
import { Selecao } from './Selecao';
import { brutoDaLinha, centavos, centavosParaApi, decimalDaApi, decimalParaApi, reais } from '../../format';
import { CampoDinheiro } from './CampoDinheiro';
import { LinhaResto } from './LinhaResto';

/** Linha como o usuário edita: números no padrão brasileiro; o servidor confere e calcula de novo. */
export type LinhaForm = { id: string | null; kind: TipoLinha; itemId: string; description: string; quantity: string; unitPrice: string; discount: string };

export const LINHA_NOVA: LinhaForm = { id: null, kind: 'EQUIPAMENTO', itemId: '', description: '', quantity: '1', unitPrice: '', discount: '' };

export const TIPO: Record<TipoLinha, string> = { EQUIPAMENTO: 'Equipamento', MATERIAL: 'Produto', SERVICO: 'Serviço' };

export const linhaDaApi = (l: SalesLine): LinhaForm => ({
  id: l.id,
  kind: l.kind,
  itemId: l.itemId ?? '',
  description: l.description,
  quantity: decimalDaApi(l.quantity, 0),
  unitPrice: decimalDaApi(l.unitPrice),
  discount: l.discountCents === '0' ? '' : centavos(l.discountCents),
});

export const linhaParaApi = (l: LinhaForm) => ({
  id: l.id,
  kind: l.kind,
  itemId: l.kind === 'EQUIPAMENTO' ? null : l.itemId || null,
  description: l.description.trim() || null,
  quantity: decimalParaApi(l.quantity),
  unitPrice: decimalParaApi(l.unitPrice),
  discountCents: centavosParaApi(l.discount) ?? '0',
});

/** Total da linha em centavos como o servidor calcula (meio-par por linha, menos o desconto); nulo se incompleta. */
export const totalDaLinha = (l: LinhaForm): bigint | null => {
  const bruto = brutoDaLinha(decimalParaApi(l.quantity), decimalParaApi(l.unitPrice));
  const desconto = centavosParaApi(l.discount) ?? '0';
  if (bruto === null || !/^\d+$/.test(desconto)) return null;
  return bruto - BigInt(desconto);
};

export const totalDasLinhas = (linhas: LinhaForm[]): bigint =>
  linhas.reduce((t, l) => t + (totalDaLinha(l) ?? 0n), 0n);

/**
 * Tabela de edição das linhas de proposta e pedido (componente Tabela de edição): tipo, item do cadastro (produto ou
 * serviço da mesma natureza) ou modelo do equipamento, quantidade, preço, desconto e total calculado; a última linha
 * vazia cria um item; Ctrl+Insert adiciona e Ctrl+Delete remove a linha em foco; o rodapé repete o total.
 */
export function GradeLinhas({ linhas, onChange, itens, somenteLeitura, adicao, erros, rotulo }: {
  linhas: LinhaForm[];
  onChange: (linhas: LinhaForm[]) => void;
  itens: ItemSummary[];
  somenteLeitura: boolean;
  adicao: boolean;
  erros: Record<string, string>;
  rotulo: string;
}) {
  const set = (i: number, patch: Partial<LinhaForm>) => onChange(linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const adicionar = () => onChange([...linhas, { ...LINHA_NOVA }]);
  const remover = (i: number) => onChange(linhas.filter((_, j) => j !== i));
  const teclas = (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') return adicionar();
    const tr = (e.target as HTMLElement).closest('tr');
    const i = tr ? Array.from(tr.parentElement?.children ?? []).indexOf(tr) : -1;
    if (i >= 0 && i < linhas.length) remover(i);
  };
  const erro = (i: number, campo: string) => erros[`lines[${i}].${campo}`];
  const mensagens = Object.entries(erros)
    .filter(([k]) => k.startsWith('lines'))
    .map(([k, v]) => {
      const m = /\[(\d+)\]/.exec(k);
      return m ? `Linha ${Number(m[1]) + 1}: ${v}` : v;
    });
  const total = totalDasLinhas(linhas);
  const ativos = (tipo: TipoLinha, atual: string) => itens.filter((it) => it.nature === tipo && (it.status === 'ATIVO' || it.id === atual));

  return (
    <div className="rp-tabela">
      <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade rp-linhas">
        <table className={`rp-grid rp-grid--edicao${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`} aria-label={rotulo} onKeyDown={teclas}>
          <thead>
            <tr>
              <th className="rp-ficha__col-num">#</th>
              <th className="rp-linhas__tipo">Tipo</th>
              <th className="rp-linhas__item">Item</th>
              <th>Descrição ou modelo</th>
              <th className="num rp-linhas__qtd">Quantidade</th>
              <th className="rp-ficha__col-curta">UM</th>
              <th className="num rp-linhas__valor">Preço unitário</th>
              <th className="num rp-linhas__valor">Desconto</th>
              <th className="num rp-linhas__valor">Total</th>
              <th className="rp-ficha__col-x" aria-label="Remover" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const item = itens.find((it) => it.id === l.itemId);
              const t = totalDaLinha(l);
              return (
                <tr key={l.id ?? `n${i}`}>
                  <td className="rownum">{i + 1}</td>
                  <td>
                    <Selecao valor={l.kind} disabled={somenteLeitura} aria-label={`Tipo da linha ${i + 1}`} aria-invalid={!!erro(i, 'kind')}
                      onChange={(v) => set(i, { kind: v as TipoLinha, itemId: '', description: '' })}
                      opcoes={(Object.keys(TIPO) as TipoLinha[]).map((k) => ({ valor: k, rotulo: TIPO[k] }))} />
                  </td>
                  <td>
                    {l.kind === 'EQUIPAMENTO' ? (
                      <span className="rp-linhas__sem-item" title="Equipamento é descrito pelo modelo">—</span>
                    ) : (
                      <Selecao valor={l.itemId} disabled={somenteLeitura} aria-label={`Item da linha ${i + 1}`} aria-invalid={!!erro(i, 'itemId')} title={erro(i, 'itemId')}
                        onChange={(v) => set(i, { itemId: v, description: '' })}
                        opcoes={[{ valor: '', rotulo: 'Escolha' }, ...ativos(l.kind, l.itemId).map((it) => ({ valor: it.id, rotulo: `${it.code} — ${it.description}` }))]} />
                    )}
                  </td>
                  <td>
                    <input className="rp-field" value={l.description} maxLength={200} readOnly={somenteLeitura}
                      placeholder={l.kind === 'EQUIPAMENTO' ? 'Modelo do equipamento' : item?.description ?? ''}
                      aria-label={`Descrição da linha ${i + 1}`} aria-invalid={!!erro(i, 'description')} title={erro(i, 'description')}
                      onChange={(e) => set(i, { description: e.target.value })} />
                  </td>
                  <td>
                    <input className="rp-field rp-field--num" value={l.quantity} maxLength={20} inputMode="decimal" readOnly={somenteLeitura}
                      aria-label={`Quantidade da linha ${i + 1}`} aria-invalid={!!erro(i, 'quantity')} title={erro(i, 'quantity')}
                      onChange={(e) => set(i, { quantity: e.target.value })} />
                  </td>
                  <td className="calc">{l.kind === 'EQUIPAMENTO' ? 'UN' : item?.uom ?? ''}</td>
                  <td>
                    <CampoDinheiro className="rp-field rp-field--num" value={l.unitPrice} maxLength={20} casas={6} readOnly={somenteLeitura}
                      aria-label={`Preço unitário da linha ${i + 1}`} aria-invalid={!!erro(i, 'unitPrice')} title={erro(i, 'unitPrice')}
                      onChange={(e) => set(i, { unitPrice: e.target.value })} />
                  </td>
                  <td>
                    <CampoDinheiro className="rp-field rp-field--num" value={l.discount} maxLength={20} readOnly={somenteLeitura}
                      aria-label={`Desconto da linha ${i + 1}`} aria-invalid={!!erro(i, 'discountCents')} title={erro(i, 'discountCents')}
                      onChange={(e) => set(i, { discount: e.target.value })}
                      onBlur={() => {
                        const c = centavosParaApi(l.discount);
                        if (c && /^\d+$/.test(c)) set(i, { discount: centavos(c) });
                      }} />
                  </td>
                  <td className="calc" aria-label={`Total da linha ${i + 1}`}>{t === null ? '' : centavos(t.toString())}</td>
                  <td className="rp-linha-x" role={somenteLeitura ? undefined : 'button'} tabIndex={somenteLeitura ? -1 : 0} title="Remover linha"
                    aria-label={`Remover linha ${i + 1}`} onClick={() => !somenteLeitura && remover(i)} onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remover(i)}>
                    {somenteLeitura ? '' : '×'}
                  </td>
                </tr>
              );
            })}
            {!somenteLeitura && (
              <tr className="nova">
                <td className="rownum">{linhas.length + 1}</td>
                <td colSpan={9} role="button" tabIndex={0} onClick={adicionar} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), adicionar())}>
                  Clique para adicionar uma linha…
                </td>
              </tr>
            )}
            <LinhaResto colunas={10} />
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8}>Total</td>
              <td className="num" aria-label="Total das linhas">{reais(total.toString())}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {mensagens.map((m) => (
        <p key={m} className="rp-campo-erro rp-ficha__erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
        </p>
      ))}
    </div>
  );
}
