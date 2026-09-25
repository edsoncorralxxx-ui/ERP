Linha de mensagem no rodapé da área de trabalho; uma de cinco variantes por vez.

- Marcação: `.rp-status-msg` + modificador: (nenhum) erro, `--aviso`, `--sucesso`, `--info`, `--processando`. Ação opcional à direita em `.rp-status-acao`.
- Cada variante já traz seu ícone (×, !, ✓, i, girando) — a cor nunca aparece sozinha.
- A faixa dos compartimentos é uma área rebaixada: filete `chart-axis` no topo e a sombra do alto caindo uns 10px para dentro, a contraparte da sombra que a Barra superior projeta.
- Quando o foco está num campo de texto com limite, o compartimento da esquerda mostra o tamanho permitido em `.rp-status-limite` — "(250 caracteres)" —, alinhado à esquerda e em `ink-muted`. Some ao sair do campo.
- Erro: o que aconteceu, depois o código entre parênteses e o id entre colchetes. Sucesso: o objeto e o número ("Pedido de venda 1.284 adicionado com sucesso").
- Mensagens de uma linha; detalhes vão para o Log de mensagens do sistema (`.rp-status-tab` com a contagem).
- Sucesso e informação somem após 5 s; erro e aviso ficam até a próxima ação.
