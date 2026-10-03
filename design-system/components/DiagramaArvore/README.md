Diagrama em árvore: a mesma estrutura da Árvore desenhada como caixas ligadas, para ver a composição inteira de uma vez.

- Marcação: `.rp-diagrama.rp-rolagem` > `.rp-diagrama__tela` (largura e altura do desenho) > `svg.rp-diagrama__ligacoes` com um `path` por ligação e `ul.rp-diagrama__caixas[role=tree]` com `li.rp-diagrama__no` posicionados (`left`, `top`, `width`, `height`).
- Fundo branco rebaixado (`field`, `shadow-inset-field`); caixas `surface-panel` com contorno `window-border`, `radius-md` e `shadow-window`.
- Ligações em cotovelo, 1,5px em `window-border`, do pé do pai ao topo do filho.
- Caixa: `.rp-diagrama__nome` (ícone + nome, `label-strong` em `ink-heading`), `.rp-diagrama__meta` (código, quantidade) e `.rp-diagrama__total` (valor em `numeric` e, se houver, `.rp-diagrama__pendente` com `status-aviso`).
- Variações: `--raiz` em `panel-head` com contorno de 2px; `--sel` em `grid-row-selected`; `--pendente` com contorno `status-warning`. Sob o mouse, `grid-row-alt`.
- O clique na caixa seleciona o mesmo nó na Árvore; as duas vistas ficam em abas do mesmo painel.
