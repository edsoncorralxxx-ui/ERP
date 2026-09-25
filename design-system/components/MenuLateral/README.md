Menu lateral oculto do aplicativo: um trilho fino com abas verticais sempre visível e uma gaveta que abre e recolhe com o conteúdo da aba.

- Marcação: `.rp-shell` > `.rp-rail` (abas `.rp-rail-tab[data-view]`) + `aside.rp-drawer[data-open]` (botão `.rp-drawer-close` e uma `.rp-drawer-view[data-view]` por aba) + `main.rp-workspace`.
- Comportamento (`RendaERP.MenuLateral(shell)`): clicar numa aba abre a gaveta naquela vista; clicar de novo na aba ativa recolhe; o botão ◂ recolhe; Esc recolhe. Com a gaveta fechada sobra só o trilho e a área de trabalho ocupa a tela.
- Efeitos: a gaveta desliza na largura (0,25 s); a vista entra com um leve deslize; aba ativa do trilho em azul com brilho; hover das abas em `grid-row-alt`; módulos com brilho e acordeão (ver Painel de módulos); os itens trazem uma seta pequena que avança no hover; na vista Arrastar e relacionar as pastas passam a abertas ao expandir.
- Três vistas fixas: Meu cockpit (atalhos de cockpits), Módulos (acordeão com ícones de módulo), Arrastar e relacionar (pastas).
- Largura aberta: 300px; canto superior direito `radius-lg`.
