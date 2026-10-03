Diálogo modal curto que pede confirmação ou avisa antes de uma ação que não pode ser desfeita.

- Marcação: `.rp-window.rp-msgbox` com um ícone de status de 32px (`status-aviso`, `status-erro`, `status-info`, `status-sucesso`) à esquerda do texto.
- Título: o nome do produto. Texto: o fato primeiro, depois a pergunta.
- Botões à direita, o padrão (`rp-btn--default`) primeiro: Sim / Não / Cancelar ou OK.
- Modal: envolva a caixa em `.rp-modal`, que ocupa a tela, centraliza a caixa (460px) e bloqueia o clique no fundo sem escurecê-lo.
- Quando a caixa pede um dado (motivo da perda, nova senha), o campo vai em `.rp-form.rp-msgbox__form` logo abaixo do texto.
