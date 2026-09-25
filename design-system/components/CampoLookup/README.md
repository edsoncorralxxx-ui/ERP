Campo de busca de registro mestre: você digita o código ou aperta o botão para escolher em uma lista.

- Marcação: `.rp-campo` > `input.rp-field` + `button.rp-campo-btn` com o ícone `consulta`. O campo vizinho com a descrição é sempre `rp-field--readonly`.
- Ponha a Seta de link no rótulo quando o registro tiver uma janela própria — é assim que o usuário abre o cadastro sem perder o documento.
- Digitar `*` ou parte do nome e sair do campo abre a lista já filtrada; um único resultado é preenchido direto.
- Campo obrigatório leva `rp-label--req` (asterisco em `status-error`), nunca uma cor de fundo diferente.
- Código não encontrado: mensagem no Rodapé — "Nenhum registro correspondente encontrado (ODBC -2028)" — e o foco volta ao campo, que fica em `field-active`.
