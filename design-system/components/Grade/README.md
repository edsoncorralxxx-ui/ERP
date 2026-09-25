Matriz densa de documentos ou linhas de item, com número da linha, setas de link e total da coluna.

- Marcação: `table.rp-grid` com `thead`, `tbody` e `tfoot` opcional para o total. Quem consome fornece colunas e linhas.
- Primeira coluna: número da linha (`rownum`); segunda: a `rp-link` para o registro.
- Valores: classe `num` — à direita, duas casas decimais, ponto de milhar e vírgula decimal.
- Status do documento em Selo de status.
- Mostre linhas vazias no fim para preencher a janela; o total fica sob sua coluna em `field-readonly`.
- Linha selecionada: `aria-selected="true"` (`grid-row-alt`).
- Em documento, a numeração começa em 1 (é a linha do item); em lista de consulta e Drag & Relate, começa em 0, porque ali o número é a posição no resultado, não o item.
- Grade rolável: ponha `rp-rolagem` no contêiner para a barra de rolagem clássica (setas nas pontas e polegar em degradê).
