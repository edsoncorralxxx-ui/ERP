O Renda+ ERP é um aplicativo de gestão denso, no estilo desktop: muitas janelas pequenas sobre uma área de trabalho clara, um menu lateral azul que se recolhe, botões e campos amarelo-claros que dizem "aja aqui" e setas douradas que levam de um registro ao outro. Monte cada tela para que um contador a leia sem rolar e aja sem procurar.

## Fundamentos de conteúdo

- Nomeie as coisas pelo objeto de negócio, com só a inicial maiúscula: "Dados mestre do parceiro de negócios", "Cotação de venda", "Condições de pagamento". O título da janela é só o nome do objeto.
- Botões são verbos curtos ou nomes de objeto: OK, Cancelar, Copiar para, Chamados de serviço relacionados, Atividade. Sem frases, sem ícones em botões.
- Fale com o usuário na segunda pessoa ("você"), de forma simples e uma vez só: "Bem-vindo, {nome}. Você está no cockpit inicial da {empresa}."
- Abreviações do domínio são bem-vindas: NF, CNPJ, Nº, Ref., Cód., C/R, C/P.
- Números no padrão brasileiro: duas casas, ponto de milhar e vírgula decimal (`R$ 23.579,23`); datas `DD/MM/AAAA`. Use o estilo `numeric`, alinhado à direita.
- Erros na barra de status: o que aconteceu, depois o código e o id — "Nenhum registro correspondente encontrado (ODBC -2028) [Mensagem 131-183]". Sucesso: objeto e número — "Pedido de venda 1.284 adicionado com sucesso".
- Conteúdo gerado por IA é sempre identificado (ícone `ia-*` ou selo "IA"), traz o grau de confiança e pede conferência antes de aplicar.
- Sem emoji, sem pontos de exclamação.

## Fundamentos visuais

**Cor.** A área de trabalho é `ground`; todo corpo de janela, painel de abas e grade é `surface-form`. A navegação é azul: linhas `nav` separadas por `nav-divider`, o módulo aberto em `nav-selected`, rótulos brancos `on-dark`. Amarelo significa "você pode agir aqui": `button` em todo botão, `field-active` no campo com foco e na busca, `field-note` nas observações e dicas. Campos editáveis são brancos (`field`) quando o registro já está carregado e **amarelo-claro (`field-note`) enquanto a janela está em modo de adição** — é assim que se sabe, de relance, se está criando ou consultando; valores somente leitura e calculados são `field-readonly` nos dois modos. `gold` é o acento da marca e a cor da faísca da IA — não use para mais nada nos formulários. A seta de link tem relevo próprio, em três tons (`seta-topo`, `seta-base`, `seta-borda`): um contorno oliva fino fechando toda a silhueta e o corpo em degradê, com a luz vindo de cima. Status: `status-error`, `status-warning`, `status-success`, `status-info`, sempre com ícone e palavra. IA: `ai-surface` com contorno `ai-border` e rótulos `ai-ink`.

**Efeitos.** Medidos na origem. **Degradê vertical** na barra de título (de `titlebar` a `titlebar-bottom`, que termina quase no `nav-deep`), na linha de módulo aberta ou sob o mouse (de `nav-selected-top` a `nav-selected`), na aba ativa (de `tab` a `tab-active`), no cabeçalho da grade (clareando de cima para baixo), no topo do aplicativo (os primeiros pixels da barra de menus) e no botão (de `button-top` a `button`). A linha de módulo **fechada é chapada** em `nav` — degradê ali é engano comum. O que separa uma linha da outra é um **sulco**: 1px escuro em `nav-deep` embaixo e 1px claro no topo da linha seguinte, o contorno gravado que dá relevo à lista inteira. As sublinhas não têm separador. **Sombra interna**: o campo é rebaixado por `shadow-inset-field`, 2 a 3px no topo, mais visível no campo amarelo com foco; o botão é saliente por `shadow-inset-button`, 1px em cima e 1px embaixo, e afunda no clique. **Sombra projetada**: a janela flutuante tem borda `window-border` de 1px e uma sombra curta (`shadow-window`); a barra superior projeta uns 12px sobre a área de trabalho; o trilho lateral projeta de 2 a 4px à direita; e o rodapé é rebaixado, recebendo do alto a mesma sombra, que entra uns 10px nele. A gaveta de módulos não projeta sombra. Sem sombras coloridas e sem gradientes fora desses pares.

**Tipografia.** Uma família, `ui` (Segoe UI com Tahoma de reserva). Quase tudo é `body`, 13/18. Títulos de janela em `window-title`, módulos em `nav-item`, títulos de seção em `section` com `ink-heading` sublinhado, valores de indicador em `kpi-value`, números em `numeric`.

**Densidade e espaçamento.** Linhas de formulário no passo `row-form`, linhas de grade e itens de menu em `row-grid`, linhas de navegação em `row-nav`. Preencha o corpo da janela com `space-5`, painéis de abas e de IA com `space-4`, campos e células com `space-2`. Formulários de duas colunas: rótulos à esquerda (~160px), campos à direita; a segunda coluna começa `space-5` depois da primeira.

**Forma.** Campos e células são retos (`radius-none`); botões, abas e selos `radius-sm`; janelas, indicadores e painéis `radius-md`; o canto superior direito da gaveta lateral `radius-lg`. Janelas flutuam com `shadow-window`; campos têm `shadow-inset-field`.

**Layout.** A moldura do aplicativo é fixa: em cima a **Barra superior** (barra de menus com os botões minimizar/maximizar/fechar e a barra de ferramentas); logo abaixo dela o trilho da **Barra lateral** começa e desce até o rodapé, com a linha de boas-vindas e a Busca **ao lado** dele, não por cima — a gaveta de módulos abre um pouco mais abaixo, já dentro da área de trabalho; à esquerda a **Barra lateral** (trilho com Meu cockpit, Módulos e Arrastar e relacionar e o painel flutuante de 428px com os 30 módulos, do Cockpit às Configurações, cada um abrindo seus formulários e relatórios), na versão **Menu lateral recolhível** quando a gaveta deve abrir e recolher com o clique na aba, com o botão ◂ ou com Esc; embaixo o **Rodapé** (linha de mensagem, aba do Log de mensagens do sistema com a contagem e oito compartimentos de status, com data e hora na segunda coluna) — ou a Barra de status do sistema quando quiser ícones e estado de conexão. As janelas abrem na área restante, sobrepostas; a ativa com `titlebar`, as outras com `titlebar-inactive`.

**Estados.** Modo de adição deixa todo campo editável em `field-note`, e o campo com foco vai para `field-active`. Hover clareia botões para `button-top`; linha de navegação aberta em `nav-selected`; linha de grade selecionada em `grid-row-alt`; item de menu em foco em `field-active`. Foco do teclado: anel sólido de 2px em `nav-divider` com 1px de afastamento (8,16:1 sobre `surface-form`), mais `field-active` no campo com foco.

**Atalhos.** A letra que o Alt aciona vem sublinhada no rótulo, em menus, botões e abas — `Ativi<u>d</u>ade`, `<u>G</u>eral`. Uma letra por elemento, sem repetir dentro da mesma janela; OK e Cancelar podem ficar sem, porque já respondem a Enter e Esc.

**Movimento.** Só o necessário: a gaveta lateral desliza na largura em 0,25 s, o acordeão de módulos abre em 0,25 s, o ícone de processando gira. Janelas não animam.

**Gráficos.** Todos saem de `components/bundle.js`, em SVG puro, com as séries em `chart-1` a `chart-5` (amarelo, verde e lilás da origem primeiro). Ao passar o mouse, a série sob o cursor fica cheia e as outras recuam, e uma dica em `field-note` segue o ponteiro com a série, o período e o valor exato — é ali que o número aparece, não em rótulos no desenho. Com profundidade — paredes `chart-wall`, piso `chart-floor`, grade `chart-axis` — vêm `Barras3D`, `Pizza3D`, `Area3D`, `Rosca3D` (composição com o total no meio) e `Empilhadas3D` (total e divisão na mesma coluna); o topo clareia e a lateral escurece sozinhos. Sem profundidade, onde ela atrapalharia a leitura: `Linha`, para séries longas. No máximo três gráficos 3D por tela; escolha o desenho pela pergunta, não pelo efeito.

**Listas e rolagem.** Janela de lista (consulta, Arrastar e relacionar, resultado de busca) traz a grade no corpo, Cancelar embaixo à esquerda e o funil de filtro no canto inferior direito, que abre Filtrar tabela. Nessas listas a numeração começa em 0, porque é a posição no resultado; em documento começa em 1, porque é a linha do item. Áreas que rolam levam `rp-rolagem` e ganham a barra de rolagem clássica, com setas nas pontas e polegar em degradê. Quando o foco está num campo com limite de tamanho, o rodapé mostra "(250 caracteres)" no compartimento da esquerda.

**Notas de contraste.** Quatro pares vêm da origem e ficam como estão, sinalizados nas notas dos tokens: branco sobre `nav-selected` (4,24:1, manter negrito), branco sobre `status-error` (4,09:1, manter negrito com o ícone), branco sobre `titlebar-inactive` (2,33:1, só decorativo) e `field-border` sobre `field` (1,63:1, os campos se leem pelo fundo).

## Iconografia

Biblioteca própria de 16px em SVG, nos grupos de ativos Ferramentas, Módulos, Pastas, IA e Status, e como classes CSS: `<i class="rp-ico rp-ico-NOME"></i>`; versão branca para o azul do menu: `rp-ico-w-NOME`.

- **Ferramentas**: no estilo da barra superior clássica — contorno azul-ardósia `#3b4d70`, preenchimento em degradê branco → azul-acinzentado, páginas com canto dobrado, cor só como acento (cadeado dourado, aviso laranja, mover e binóculo azuis, estrela laranja do novo). Mesma ordem e funções da barra original: visualizar, imprimir, e-mail, SMS, fax, exportar planilha/Word/PDF, mover, bloquear, buscar, novo, primeiro/anterior/próximo/último, filtro, ordenar, documento-base/destino, lucro bruto, meios de pagamento, editar, configurações, consulta, alertas, calendário, ajuda. Ferramentas indisponíveis ficam em cinza esmaecido.
- **Módulos**: um ícone por módulo, em branco no menu lateral.
- **Pastas**: pasta, pasta aberta, formulário e relatório para a vista Arrastar e relacionar.
- **IA**: todo ícone de IA leva a faísca dourada de quatro pontas; a faísca não aparece em nenhum outro ícone.
- **Status**: sucesso, aviso, erro, informação, processando.

Tamanho sempre 16px; em destaque 32px. Sem emoji.

## Logotipo

A marca é "Renda+ ERP" e não tem fundo: são três cores de texto e nada mais — "Renda" em `logo-renda`, o "+" em `logo-mais` e "ERP" em `logo-erp`. Em tela, prefira a versão em texto (`<span class="rp-logo">Renda<b>+</b><i>ERP</i></span>`), que herda os tokens e nunca leva um retângulo claro para dentro de um fundo escuro; `rp-logo--rodape` troca o "Renda" por `logo-renda-escuro`, para os cinzas do rodapé. Em `assets/Logos/` estão os dois arquivos com fundo transparente (`renda-erp.png` e `renda-erp-rodape.png`), para onde não dá para usar texto. Altura mínima de 20px, folga em volta igual à altura do "+", sem esticar, girar, recolorir nem pôr sobre um retângulo de cor. A marca aparece no canto direito do rodapé e nas telas de login e abertura, nunca dentro de formulários.

## Usando os componentes

Os componentes são HTML puro mais `components/bundle.css` (classes com prefixo `rp-`). Coloque `class="rp"` num contêiner para herdar fonte e cor e use a marcação mostrada no guia de cada componente. Gráficos e o Menu lateral recolhível precisam de `components/bundle.js`, que define `window.RendaERP` sem dependências; `components/index.d.ts` traz as assinaturas.
