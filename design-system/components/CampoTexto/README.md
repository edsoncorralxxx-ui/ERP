Campo plano de uma linha, em linhas rótulo/campo; a base de todo formulário.

- Marcação: grade `.rp-form` com pares `.rp-label` + `.rp-field`, um par por `row-form`.
- Estados: editável (`field`, branco), somente leitura ou calculado (`rp-field--readonly`, `field-readonly`), com foco (`field-active`, amarelo forte), observações com várias linhas (`rp-field--note`).
- **Modo de adição**: enquanto a janela está sendo preenchida (Adicionar), ponha `rp-form--adicao` na grade — todo campo editável fica em `field-note` (amarelo-claro), os somente leitura continuam cinza e o campo com foco vai para `field-active`. Ao carregar um registro (modo de exibição), a classe sai e os campos voltam a branco. É assim que o usuário sabe, de relance, se está criando ou consultando.
- Valores: `rp-field--num` — alinhado à direita, algarismos tabulares, formato brasileiro (`R$ 23.579,23`).
- Obrigatório: o asterisco vermelho fica numa **coluna própria** entre o rótulo e o campo — `rp-form--req` na grade e `<span class="rp-req">*</span>` na célula do meio (célula vazia nos campos opcionais). Assim os campos ficam todos alinhados.
- Rótulos à esquerda, só com a inicial maiúscula, sem dois-pontos.
