Matriz de edição dos itens de um documento: cada linha é um item, cada célula é um campo.

- Marcação: `.rp-tabela` > `.rp-tabela-acoes` (título e botões) + `table.rp-grid.rp-grid--edicao` com `tfoot` de totais.
- A célula editável é um `input.rp-field` sem borda que só ganha `field-active` no foco; célula calculada usa `class="calc"` (`field-readonly`, à direita) e nunca recebe foco.
- A primeira coluna é o número da linha (`rownum`); a última é o × que remove a linha, visível quando o mouse passa.
- A última linha é a linha vazia `class="nova"`: digitar nela cria o item. Não use botão "+" no meio da grade.
- Colunas numéricas com `class="num"`, duas casas e ponto de milhar. O `tfoot` repete os totais que o rodapé da janela também mostra.
- Tab anda pelas células na horizontal; Ctrl+Insert adiciona linha e Ctrl+Delete remove a linha atual.
