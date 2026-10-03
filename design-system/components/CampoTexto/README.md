Campo plano de uma linha, em linhas rótulo/campo; a base de todo formulário.

- Marcação: grade `.rp-form` com pares `.rp-label` + `.rp-field`, um par por `row-form`.
- Estados: editável (`field`, branco), somente leitura ou calculado (`rp-field--readonly`, `field-readonly`), com foco (`field-active`, amarelo forte), observações com várias linhas (`rp-field--note`).
- **Modo de adição**: enquanto a janela está sendo preenchida (Adicionar), ponha `rp-form--adicao` na grade — os campos editáveis continuam brancos, os somente leitura continuam cinza e só o campo com foco fica amarelo (`field-active`) — decisão do PO em 30/09/2026. A classe marca o modo; o título e o botão Adicionar dizem que se está criando.
- Valores: `rp-field--num` — alinhado à direita, algarismos tabulares, formato brasileiro (`R$ 23.579,23`).
- Obrigatório: o asterisco vermelho fica numa **coluna própria** entre o rótulo e o campo — `rp-form--req` na grade e `<span class="rp-req">*</span>` na célula do meio (célula vazia nos campos opcionais). Assim os campos ficam todos alinhados.
- Rótulos à esquerda, só com a inicial maiúscula, sem dois-pontos.
- Inválido: `aria-invalid="true"` no campo (contorno `status-error`) e, logo abaixo, `<span class="rp-campo-erro"><i class="rp-ico rp-ico-status-erro"></i>O CNPJ tem 14 dígitos</span>`. Na tabela de edição o erro é um traço vermelho de 2px no pé da célula, que continua branca e fica amarela com o foco.
