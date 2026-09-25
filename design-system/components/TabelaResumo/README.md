Tabela agrupada com subtotais, para relatórios de vendas, compras, estoque e custos.

- Marcação: `table.rp-grid.rp-grid--resumo` dentro de `.rp-grid-rolagem.rp-rolagem` (cabeçalho fixo e barra de rolagem clássica); linhas de grupo `tr.grupo` com `data-aberto="sim|nao"`, filhos com `td.rec`, subtotal `tr.sub` e total geral no `tfoot`.
- Um nível de agrupamento por tabela. Para dois níveis, prefira dois relatórios ou uma árvore.
- O triângulo do grupo abre e fecha os filhos; o grupo fechado continua mostrando seus totais.
- `.rp-barra-celula` desenha a participação dentro da célula, sempre com o número ao lado — a barra é apoio, não a informação.
- A Seta de link fica na linha filha, que é o documento; a linha de grupo não tem seta.
- Colunas de valor e porcentagem com `class="num"`, duas casas e padrão brasileiro.
