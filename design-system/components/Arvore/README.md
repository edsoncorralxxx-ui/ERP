Árvore em painel lateral para estruturas hierárquicas (BOM, categorias, plano de contas): o pai à esquerda, o registro escolhido à direita.

- Marcação: `section.rp-arvore-painel` > `.rp-arvore-painel__tit` (nome à esquerda, `.rp-arvore-painel__total` à direita) > `ul.rp-arvore[role=tree]` > `li.rp-arvore__no[role=treeitem]` > ícone + `.rp-arvore__nome` + `.rp-arvore__total`; nota opcional em `.rp-arvore-painel__nota` no pé.
- Ícones: `pasta` / `pasta-aberta` no nó com filhos, `formulario` na folha; pendência com `status-aviso` antes do total.
- Recuo de `space-5` por nível, mais `space-2` (calcule no `padding-left` do nó).
- Nó de `row-grid`; selecionado em `grid-row-selected` (`aria-selected="true"`); sob o mouse, `grid-row-alt` — a única lista que reage ao mouse.
- Teclado: setas sobem e descem, direita abre, esquerda fecha; o foco aparece como contorno pontilhado no nó selecionado.
- Totais em `numeric`, formato `R$ 23.579,23`, em `ink-muted`.
