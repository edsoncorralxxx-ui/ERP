Rodapé fixo do aplicativo: a linha de mensagem, a aba do log do sistema e os compartimentos de status em duas linhas.

- Marcação: (mensagem opcional `.rp-status-msg`) + `.rp-appfoot` > `.rp-logbar` (`.rp-status-tab` com a contagem + `.rp-winctl`) > `.rp-slots` (oito compartimentos: quatro colunas × duas linhas).
- A segunda coluna traz a data em cima e a hora embaixo; os outros compartimentos ficam livres para contexto (empresa, usuário, filtro ativo, registro atual).
- Compartimentos em `field-readonly` com um brilho interno claro; a aba do log usa `button-default-mark` e cresce com o número de mensagens.
- Para um rodapé com ícones e estado de conexão, use a Barra de status do sistema.
