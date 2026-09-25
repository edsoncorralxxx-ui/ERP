Barra lateral esquerda do aplicativo: o trilho com as três abas e, ao lado, o painel flutuante com a lista de módulos.

- Marcação: `.rp-sidebar` > `.rp-rail` (abas `.rp-rail-tab`) + `aside.rp-sidepanel` (`.rp-sidepanel-head` com o botão ◂, `.rp-sidepanel-list` com um `.rp-nav-item` por módulo e `.rp-sidepanel-rest` vazio) + `main.rp-sidebar-work`.
- O painel tem 428px de largura, fundo `surface-panel`, borda `window-border`, cantos direitos `radius-lg` e uma sombra leve; a faixa do topo usa `panel-head` e só carrega o botão de recolher.
- As linhas de módulo são chapadas em `nav`, com 39px (`row-nav`), rótulo branco em negrito e ícone branco `rp-ico-w-NOME`. Entre uma linha e outra há um sulco: 1px escuro em `nav-deep` embaixo e 1px claro no topo da seguinte — é esse contorno gravado que dá o relevo da lista. Só o hover e o módulo aberto ganham o brilho `nav-selected-top` → `nav-selected`.
- A lista ocupa o alto do painel; o resto fica vazio até o rodapé.
- Ordem dos módulos (30): Cockpit, Dashboard, Cadastros, CRM, Vendas, Engenharia, Compras, Estoque, MRP, Produção, Projetos, Instalações, Equipamentos, Renda+, Qualidade, Manutenção, Pós-venda, Financeiro, Faturamento, Fiscal, Custos, Contabilidade / Controladoria, Tarefas, BI & Relatórios, Documentos, Integrações, Recursos Humanos, Patrimônio, Administração, Configurações.
- Para a versão que abre e recolhe com o clique nas abas, use o Menu lateral recolhível — a mesma barra com `RendaERP.MenuLateral`.
