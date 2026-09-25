Campo de data com botão de calendário — o formato de data do sistema é sempre `DD/MM/AAAA`.

- Marcação: `.rp-campo` > `input.rp-field` + `button.rp-campo-btn` com o ícone `calendario`. Em campo somente leitura o botão também fica `disabled`.
- O calendário `.rp-cal` abre ancorado ao campo, semana começando na segunda; o dia escolhido em `nav-selected`, o dia de hoje com contorno `gold`, dias de outro mês em `titlebar-inactive`.
- O rodapé traz "Hoje" e "Limpar"; Esc fecha sem alterar e Enter confirma o dia em foco.
- Digitação livre é permitida: aceite `20/09/26`, `200926` e `20-09-2026` e normalize ao sair do campo.
- Para intervalo, use dois campos ("De" e "Até") lado a lado e valide a ordem na saída do segundo.
