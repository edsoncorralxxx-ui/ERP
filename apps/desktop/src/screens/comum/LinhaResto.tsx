/**
 * Linha de preenchimento no fim da grade (design system, Grade): ocupa a altura que sobra na área de rolagem e continua
 * os fios das colunas, a coluna # e as linhas vazias até o pé do painel, como no cliente clássico. Só visual.
 */
export function LinhaResto({ colunas, numerada = true }: { colunas: number; numerada?: boolean }) {
  return (
    <tr className="rp-grid-resto" aria-hidden="true">
      {Array.from({ length: colunas }, (_, i) => (
        <td key={i} className={numerada && i === 0 ? 'rownum' : undefined} />
      ))}
    </tr>
  );
}
