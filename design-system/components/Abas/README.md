Abas de pasta que dividem uma janela de dados mestre em páginas.

- Marcação: `.rp-tabs` com `.rp-tab[role=tab]`, a selecionada com `aria-selected="true"`, seguida de um `.rp-tabpanel`.
- Dentro das janelas, as abas ficam justas à esquerda, largas (mínimo de 185px) e altas (25px), com o rótulo centrado, em forma de pasta (lado esquerdo inclinado) e contorno `tab-border`.
- Aba ativa chapada em `tab-active`, com um brilho de 2px em `tab-active-top` no topo; inativas em degradê de `tab-top` a `tab`. O texto é `ink` nas duas; aba indisponível em `ink-muted`.
- Na janela de documento, o `.rp-tabpanel` filho direto do corpo ocupa toda a altura que sobra (contorno `panel-border`), e a grade dentro dele vai até o pé do painel.
- Rótulos de uma ou duas palavras, com a letra de atalho sublinhada (`<u>G</u>eral`); Geral sempre primeiro, Observações sempre por último.
- Tudo acima das abas (código, nome, saldos) continua visível em todas as abas.
