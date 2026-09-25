Paginação de grade: navegação por páginas, tamanho da página e contagem de registros.

- Marcação: `.rp-pag` logo abaixo da Grade, sem borda entre as duas; botões « ‹ 1 2 3 › » , a Seleção do tamanho e `.rp-pag-info`.
- A página atual usa `aria-current="page"` e fica em `tab-active`; os extremos ficam `disabled` na primeira e na última página.
- Mostre sempre o intervalo e o total ("1 a 50 de 187 registros"); sem total conhecido, escreva "50 registros carregados" e ofereça "Carregar mais".
- Tamanhos oferecidos: 50, 100 e 200. Trocar o tamanho volta para a página 1 e mantém os filtros.
- Em grade de edição (itens do documento) não há paginação: o documento inteiro fica em uma só matriz rolável.
