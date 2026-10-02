Matriz densa de documentos ou linhas de item, com número da linha, setas de link e total da coluna.

- Marcação: `table.rp-grid` com `thead`, `tbody` e `tfoot` opcional para o total. Quem consome fornece colunas e linhas.
- Primeira coluna: número da linha (`rownum`); segunda: a `rp-link` para o registro.
- Valores: classe `num` — à direita, duas casas decimais, ponto de milhar e vírgula decimal.
- Status do documento em Selo de status.
- Linhas vazias até o fim da área: a última linha do `tbody` é a linha de preenchimento `tr.rp-grid-resto` (`aria-hidden="true"`, uma `td` por coluna, a primeira com `rownum`). Ela fica com a altura que sobra e continua os fios das colunas, a coluna # cinza e as linhas vazias, como no cliente clássico; no app, é o componente `LinhaResto`. O total (`tfoot`) fica sob sua coluna em `field-readonly`, preso ao pé da área de rolagem.
- Linha selecionada: `aria-selected="true"`, em amarelo (`grid-row-selected`), menos a coluna #, que fica sempre em `grid-rownum`. Passar o mouse não pinta a linha; só a seleção.
- Em documento, a numeração começa em 1 (é a linha do item); em lista de consulta e Drag & Relate, começa em 0, porque ali o número é a posição no resultado, não o item.
- Grade rolável: `.rp-grid-rolagem.rp-rolagem` com contorno `panel-border`; dentro das janelas a barra de rolagem é a clara da referência — trilho `scroll-track`, polegar e botões com contorno `scroll-edge`, setas pequenas em `ink-muted`. O cabeçalho fica preso no topo.
