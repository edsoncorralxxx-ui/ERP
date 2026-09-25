Botão amarelo-claro usado para todo comando de uma janela: OK, Cancelar, Copiar para, Chamados de serviço relacionados.

- Marcação: `<button class="rp-btn">Rótulo</button>`. Quem consome fornece o rótulo (uma a três palavras, só a inicial maiúscula).
- `rp-btn--default` adiciona a barra azul `button-default-mark`: exatamente um por janela, o botão que o Enter aciona (OK / Adicionar / Atualizar).
- `rp-btn--menu` adiciona o triângulo no canto para botões que abrem uma lista (Copiar para, Copiar de).
- Tamanho: `control-h` de altura, no mínimo `control-w` de largura; rótulos longos alargam o botão.
- OK e Cancelar ficam embaixo à esquerda da janela; botões de registros relacionados embaixo à direita, separados por `space-3`.
- Letra de atalho sublinhada no rótulo (`<u>C</u>ancelar`), como na Barra de menus: é ela que o Alt aciona. Uma letra por botão, sem repetir dentro da mesma janela; OK e Cancelar, que já têm Enter e Esc, podem ficar sem.
- Não faça: colorir botão por significado (sem Excluir vermelho); não coloque ícones dentro de botões — ícones vão na Barra de ferramentas.
