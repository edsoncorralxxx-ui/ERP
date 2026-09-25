Abas de pasta que dividem uma janela de dados mestre em páginas.

- Marcação: `.rp-tabs` com `.rp-tab[role=tab]`, a selecionada com `aria-selected="true"`, seguida de um `.rp-tabpanel`.
- As abas ficam justas à esquerda, cada uma do tamanho do seu rótulo, com os cantos de cima arredondados (`radius-sm`) e contorno `tab-border`.
- Aba ativa em `tab-active` com um degradê claro no topo; inativas em `tab`. O texto é escuro nas duas.
- Rótulos de uma ou duas palavras, com a letra de atalho sublinhada (`<u>G</u>eral`); Geral sempre primeiro, Observações sempre por último.
- Tudo acima das abas (código, nome, saldos) continua visível em todas as abas.
