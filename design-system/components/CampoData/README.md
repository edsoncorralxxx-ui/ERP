Campo de data com o ícone de calendário dentro do campo, à esquerda — o formato de data do sistema é sempre `DD/MM/AAAA`.

- Marcação: `.rp-campo.rp-campo--icone` > `input.rp-field` + `button.rp-campo-icone` com o ícone `calendario`. O ícone só aparece com o campo selecionado (e enquanto o calendário está aberto): aí o contêiner ganha `rp-campo--com-icone` e o ícone entra dentro do campo, à esquerda; ao sair do campo ele some. Campo somente leitura não mostra o ícone.
- Pelo teclado, Alt+↓ ou F4 abre o calendário mesmo sem o ícone à vista.
- O calendário `.rp-cal` abre ancorado ao campo, semana começando na segunda; o dia escolhido em `nav-selected`, o dia de hoje com contorno `gold`, dias de outro mês em `titlebar-inactive`.
- O rodapé traz "Hoje" e "Limpar"; Esc fecha sem alterar e Enter confirma o dia em foco.
- Digitação livre é permitida: aceite `20/09/26`, `200926` e `20-09-2026` e normalize ao sair do campo.
- **Conta de datas**: `=19/05/2026+90du` (ou sem o "=", `19/05/2026+90du`). Unidades: `dc` dias corridos (também `d` ou nada), `du` dias úteis, `s` semanas, `m` meses, `a` anos; soma ou subtrai, e vários termos se aplicam da esquerda para a direita (`=19/05/2026+1m+5du`). No lugar da data vale `hoje`; sem data (`=+30du`) a conta parte da data que estava no campo, ou de hoje. Enter ou sair do campo põe a data; Esc volta à de antes. Durante a conta, Enter e Esc não confirmam nem fecham a janela.
- Dias úteis: segunda a sexta, fora dos feriados nacionais — os fixos (Consciência Negra a partir de 2024), a segunda e a terça de Carnaval, a Sexta-feira Santa e Corpus Christi. Feriados estaduais e municipais não entram.
- Para intervalo, use dois campos ("De" e "Até") lado a lado e valide a ordem na saída do segundo.
