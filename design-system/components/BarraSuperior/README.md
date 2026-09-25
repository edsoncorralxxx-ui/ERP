Topo fixo do aplicativo: barra de menus com os botões da janela, barra de ferramentas e a linha de boas-vindas com a busca global.

- Marcação: `.rp-app` > `.rp-appbar` (`.rp-menubar` com `.rp-winctl` à direita + `.rp-toolbar`) > `.rp-appbody`, que é uma linha: o `.rp-rail` à esquerda e um `.rp-appmain` com o `.rp-apphead` (saudação à esquerda, Busca à direita) e o `.rp-appwork` embaixo.
- O trilho sobe até logo abaixo da barra de ferramentas e desce até o rodapé; a linha de boas-vindas fica **ao lado** dele, não por cima. A gaveta de módulos abre dentro do `.rp-appwork`, ou seja, um pouco mais abaixo que o trilho.
- Botões da janela: minimizar, maximizar e fechar, nessa ordem; o fechar fica vermelho no hover.
- A saudação é uma frase só: "Bem-vindo, {nome}. Você está no cockpit inicial da {empresa}."
- A barra de ferramentas segue o componente Barra de ferramentas (mesma ordem, indisponíveis em cinza).
- Fundo `chrome` nas barras e `ground` na linha de boas-vindas; um filete `grid-rule` separa do corpo.
