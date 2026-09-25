Agrupa campos relacionados dentro de uma janela ou aba, com título e moldura discretos.

- Marcação: `fieldset.rp-grupo` + `legend`, ou `div.rp-grupo` com `.rp-grupo-tit` e `.rp-grupo-corpo`.
- Recolhível: `rp-grupo--recolhivel` mais `data-aberto="sim|nao"`; o triângulo gira em 0,2 s. Guarde o estado por usuário e janela.
- Título em `ink-heading`, negrito, só a inicial maiúscula, sem dois-pontos. Moldura de 1px `grid-rule` — sem sombra, sem cor de fundo própria.
- Use no máximo quatro grupos por aba; acima disso o conteúdo pede uma aba nova.
- Grupo recolhido nunca esconde campo obrigatório vazio: abra-o ao validar e leve o foco para o campo.
