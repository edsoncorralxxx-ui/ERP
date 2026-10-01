Pesquisa global no canto superior direito; sugere formulários, dados mestre e documentos enquanto se digita.

- Marcação: `.rp-search` (campo + botão com a lupa); sugestões em `.rp-search-list`, com os caracteres encontrados sublinhados.
- Sempre amarela (`field-active`) para parecer o lugar de digitar. Com o foco, a borda fica laranja (`search-focus`, 2px).
- Texto reservado em itálico `ink-muted`: "Pesquisar operações, dados mestre e documentos".
- O botão leva a lupa desenhada em `nav-divider` (a do preview), não o binóculo `rp-ico-buscar` da barra de ferramentas.
- Resultados em três grupos, nesta ordem, com o título em `.rp-search-grupo`: **Operações** (telas do menu que o usuário pode abrir, achadas pelo nome da tela ou do módulo, sem diferenciar acento), **Dados mestre** (clientes, fornecedores, produtos e serviços, equipamentos) e **Documentos** (propostas, pedidos, projetos, documentos de faturamento, títulos a receber e a pagar). Cada item é um `[role=option]` com o rótulo à esquerda e o tipo em `.rp-search-detalhe` à direita; até 5 por tipo, incluindo inativos e cancelados.
- Operações aparecem desde a primeira letra; dados mestre e documentos, a partir de 2 caracteres. Sem nada: "Nenhum registro correspondente encontrado" em `.rp-search-aviso`.
- Teclado: setas escolhem (o item escolhido em `grid-row-selected`), Enter abre, Esc fecha a lista e, com ela fechada, limpa o campo. Passar o mouse não pinta o item; o clique abre.
