Janela flutuante de documento ou dados mestre: barra de título azul, corpo claro, botões embaixo.

- Marcação: `.rp-window` > `.rp-titlebar` (título + `.rp-winbtns`) > `.rp-window-body` > `.rp-window-foot`.
- A janela ativa usa `titlebar`; janelas atrás dela recebem `rp-window--inactive`.
- Janela que se redimensiona leva a alça `.rp-window-grip` no canto inferior direito: três riscos diagonais em `ink-muted` com brilho branco, cursor de redimensionar. Janela maximizada não mostra a alça.
- **Janela de lista** (consulta, Arrastar e relacionar, resultado de busca): a grade ocupa o corpo e o rodapé vira `.rp-lista-foot` — Cancelar à esquerda e o **funil de filtro** (`.rp-funil`) no canto inferior direito, que abre a janela Filtrar tabela. Com filtro aplicado, o funil fica `aria-pressed="true"` em `field-active`.
- `rp-window--login` adiciona a faixa `gold-light` sob a barra de título, para login e telas de abertura.
- Título = só o nome do objeto ("Cotação de venda", "Dados mestre do item"); sem número de registro no título.
- Minimizar: a janela vira um botão `.rp-minimizada` (26px, degradê da barra de título, título com reticências) na fila `.rp-minimizadas`, embaixo à esquerda da área de trabalho e atrás das janelas abertas; sob o mouse, o degradê de `nav-selected-top` a `nav-selected`.
- Títulos de seção dentro do corpo (blocos de um painel, partes de um relatório): `<h3 class="rp-secao-tit">`, texto `section` em `ink-heading` sublinhado.
