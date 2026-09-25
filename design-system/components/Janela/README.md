Janela flutuante de documento ou dados mestre: barra de título azul, corpo claro, botões embaixo.

- Marcação: `.rp-window` > `.rp-titlebar` (título + `.rp-winbtns`) > `.rp-window-body` > `.rp-window-foot`.
- A janela ativa usa `titlebar`; janelas atrás dela recebem `rp-window--inactive`.
- **Janela de lista** (consulta, Arrastar e relacionar, resultado de busca): a grade ocupa o corpo e o rodapé vira `.rp-lista-foot` — Cancelar à esquerda e o **funil de filtro** (`.rp-funil`) no canto inferior direito, que abre a janela Filtrar tabela. Com filtro aplicado, o funil fica `aria-pressed="true"` em `field-active`.
- `rp-window--login` adiciona a faixa `gold-light` sob a barra de título, para login e telas de abertura.
- Título = só o nome do objeto ("Cotação de venda", "Dados mestre do item"); sem número de registro no título.
