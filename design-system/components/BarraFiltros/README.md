Faixa de filtros sobre uma grade ou relatório: os campos de recorte, os botões e as marcas dos filtros já aplicados.

- Marcação: `.rp-filtros` com `label` (rótulo + campo), os botões Aplicar e Limpar e `.rp-filtros-dir` com as marcas `.rp-chip`.
- Fundo `grid-header` com borda `grid-rule`, encostada no topo da grade — o conjunto lê como uma peça só.
- Aplicar é o botão padrão da faixa (`rp-btn--default`); Limpar remove todos os recortes de uma vez.
- Cada `.rp-chip` mostra campo e valor ("Filial: Matriz") e some no ×, reconsultando na hora. Filtro ativo é sempre visível — nunca deixe uma grade filtrada sem marca.
- Até seis campos na faixa; o resto vai para uma janela "Mais filtros" aberta por um botão.
