Acordeão de módulos do menu lateral; cada módulo expande para seus formulários e relatórios.

- Marcação: `.rp-nav` > `.rp-nav-group[data-open]` > `.rp-nav-item` (ícone branco + nome) + `.rp-nav-subs` com `.rp-nav-sub`.
- Efeitos do cliente clássico: a linha fechada é chapada em `nav` e as linhas são separadas por um **sulco** — 1px escuro em `nav-deep` embaixo e 1px claro no topo da linha seguinte, o que dá o contorno gravado da origem; hover e grupo aberto com brilho de `nav-selected-top` até `nav-selected`; as sublinhas não têm separador; elas deslizam ao abrir (0,25 s) e só um grupo fica aberto por vez.
- Cada módulo leva o ícone branco `rp-ico-w-NOME`. As sublinhas trazem uma seta pequena branca, que avança 2px e fica totalmente branca no hover; com a classe `rp-nav--icones` no `.rp-nav`, elas mostram no lugar da seta o ícone escolhido pelo contexto do nome (cliente → parceiros, nota fiscal → fiscal, custo → custos…).
- O comportamento vem de `RendaERP.MenuLateral(elemento)`; dentro do Menu lateral recolhível ele já é ligado.
