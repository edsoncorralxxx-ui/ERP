# ERP Renda+ — interface por janelas

Diretriz do usuário registrada em 23/09/2026: usar a organização de interface do SAP Business One mostrada nas nove capturas fornecidas, com múltiplas janelas e distribuição das informações dentro de cada tela. Este documento complementa o plano funcional, o planejamento e o design system. Há um [mock React navegável](../mock/README.md) com gerenciador de janelas e dados sintéticos para validação. A implementação operacional e os contratos com o servidor continuam no planejamento.

## 1. Referência e decisões

As capturas mostram login, menus e ferramentas globais, navegação lateral recolhível, área de trabalho, formulário flutuante e maximizado, janela de relatório sobre cadastro, lista de documentos, diálogo de filtros e busca global. Também mostram barras de título ativa/inativa, abas, campos compactos, setas para registros relacionados e mensagens no rodapé.

Esses elementos orientam a interface Renda+. A marca, os tokens e os ícones continuam sendo os do design system escolhido. Nomes, valores e módulos dos exemplos SAP são demonstrativos e não entram como dados ou escopo do ERP. Comportamentos detalhados abaixo são decisões de implementação propostas para concretizar a solicitação; uma captura estática não comprova atalhos, persistência ou regras internas do SAP.

## 2. Estrutura principal

Uma janela principal do Electron conterá a área de trabalho e várias janelas internas React, no padrão MDI (interface com múltiplos documentos). Cadastros e documentos poderão permanecer abertos simultaneamente, com uma janela ativa por vez. Não criar uma janela nativa do sistema operacional para cada formulário.

| Região | Conteúdo e comportamento |
|---|---|
| Topo | Menus Arquivo, Editar, Exibir, Dados, Ir para, Módulos, Ferramentas, Janelas e Ajuda, contendo apenas comandos implementados e pertinentes |
| Barra de ferramentas | Novo, localizar, salvar, navegar registros, filtrar, imprimir/exportar e relacionados; ações aplicadas à janela ativa e habilitadas conforme estado/permissão |
| Lateral | Trilho e painel de módulos recolhível, com árvore de funções; lista de janelas abertas disponível pelo menu Janelas |
| Faixa inicial | Empresa/usuário e busca global de registros permitidos; parte da área de trabalho, sem cobrir formulários maximizados |
| Área central | Janelas internas móveis e redimensionáveis, sobreposição, maximização dentro da área útil e marca d'água discreta Renda+ no fundo |
| Base | Mensagens do sistema recolhíveis e barra de status com contexto, conexão e ajuda do campo ativo |

O login será uma tela própria com marca Renda+, usuário, senha e estado da conexão. A configuração do servidor será acessível quando necessária. A referência “trocar empresa” não introduz operação multiempresa no escopo de um CNPJ.

## 3. Contrato do gerenciador de janelas

- **Abrir/ativar:** clicar no menu abre a janela correspondente. Abrir novamente o mesmo registro ativa sua janela existente. Registros diferentes podem ser abertos simultaneamente. Novos rascunhos recebem identificador próprio.
- **Foco e sobreposição:** clicar numa janela a traz à frente; sua barra fica ativa e as demais, inativas. Trocar de janela conserva aba, filtro, seleção, rolagem e rascunho em memória.
- **Mover/redimensionar:** arrastar pela barra de título; respeitar tamanho mínimo e limites da área útil. Após mudança de resolução, zoom ou painel lateral, manter título e controles recuperáveis.
- **Minimizar:** retirar do espaço central, mantendo a janela acessível no menu Janelas. Restaurar conserva o estado.
- **Maximizar/restaurar:** ocupar somente a área de trabalho, preservando menus e status. Restaurar retorna às dimensões anteriores. Maximizar uma janela interna é diferente de colocar o aplicativo em tela cheia.
- **Organizar:** oferecer cascata e lado a lado. Se o espaço for insuficiente para os tamanhos mínimos, manter janelas recuperáveis e informar a limitação, sem reduzir campos a ponto de impedir leitura.
- **Fechar:** se houver alterações, oferecer salvar, descartar ou continuar editando. Salvamento depende de confirmação da API. Fechar janela não cancela documento de negócio.
- **Fechar aplicativo/sair:** tratar todos os rascunhos pendentes e comandos em andamento. Não reenviar operação incerta apenas porque a janela foi reaberta; consultar seu identificador no servidor.
- **Sessão:** preferências de posição/tamanho podem ser salvas por usuário e computador. Reabrir registros exige nova consulta e verificação de acesso. Não persistir senhas ou rascunhos sensíveis automaticamente em armazenamento local.
- **Diálogos:** confirmação, filtro e seleção pertencem à janela de origem. Quando modais, bloqueiam a interação de fundo enquanto abertos, conservam foco e o devolvem ao controle de origem ao fechar. Relatórios e registros relacionados são janelas não modais.
- **Atualizações:** salvar um registro atualiza/invalida consultas relacionadas sem sobrescrever outro rascunho em edição. Conflitos são mostrados ao usuário.

O estado visual conterá identificador de instância, tipo de tela, registro, título, posição, tamanho, ordem de sobreposição, estado normal/minimizado/maximizado, estado anterior, janela de origem e indicação de alterações. Dados de negócio e versão do registro permanecem separados desse estado visual.

## 4. Distribuição das informações em cada janela

Cada janela será composta por regiões estáveis. Formulários usam grupos alinhados em duas colunas quando houver espaço; em largura menor, os grupos se reorganizam em uma coluna. Maximizar amplia sobretudo tabelas e área de trabalho, sem esticar todos os campos de texto por toda a tela.

| Região | Regra de distribuição |
|---|---|
| Título | Tipo do documento/cadastro + código ou nome curto + indicação de alterações |
| Cabeçalho esquerdo | Identificação principal: cliente, unidade, fornecedor, equipamento ou projeto |
| Cabeçalho direito | Número, revisão, situação, responsável e datas principais |
| Corpo com abas | Grupos por finalidade; abas do registro atual, conservando cabeçalho e contexto |
| Área tabular | Itens, parcelas, materiais, atividades ou movimentos; rolagem própria, cabeçalho e totais legíveis |
| Resumo inferior | Observações curtas à esquerda; totais, saldos ou indicadores à direita, conforme o documento |
| Ações inferiores | Salvar/Adicionar/Atualizar e fechar à esquerda; operações de negócio pertinentes à direita |

As ações terão nomes inequívocos: “Cancelar edição”, “Fechar” e “Cancelar pedido” são ações diferentes. Confirmar pedido, dar baixa, estornar e aprovar repasse exigem ações próprias; salvar um rascunho não executa essas operações.

Listagens terão filtros, tabela, contagem e totalização com escopo explícito (página ou resultado filtrado). Abrir uma linha ou uma seta de vínculo abre/ativa outra janela conservando a lista. Relatórios terão filtros no alto, tabela e gráficos no corpo, totais e exportação. Seletores devolverão código/identificador ao campo de origem; abrir detalhe do registro não deve selecionar silenciosamente outro valor.

### Exemplo: pedido de venda

```text
┌ Pedido de venda — PV-000123                         _  □  × ┐
│ Cliente / unidade                 Número / situação        │
│ Projeto / contato                 Data / prazo / responsável│
│ [Itens] [Pagamento] [Entrega] [Documentos] [Histórico]       │
│                                                           │
│ Código | Descrição | Quantidade | Preço | Desconto | Total  │
│                       tabela de itens                     │
│                                                           │
│ Observações                       Subtotal / desconto      │
│                                   Total / saldo            │
│ [Salvar rascunho] [Fechar]          [Confirmar pedido]       │
└───────────────────────────────────────────────────────────┘
```

O código acima é ilustrativo. “Saldo” será exibido somente quando houver títulos vinculados e significado financeiro definido. Na aba Pagamento ficam condições e parcelas; títulos individuais abrem em janelas próprias. Clicar no cliente abre seu cadastro mantendo o pedido aberto.

## 5. Distribuição das 32 áreas funcionais

Cada linha define uma área funcional, que pode conter uma listagem e várias janelas de registro. Não impõe limite de 32 instâncias abertas nem coloca todo o módulo numa janela única. O plano funcional continua sendo a referência completa de campos e ações.

| Área | Cabeçalho/contexto | Corpo: abas ou seções | Resumo e janelas relacionadas |
|---|---|---|---|
| Visão geral | Período, área e projeto | Comercial, operação, financeiro, pendências | Indicadores abrem listas filtradas e seus registros |
| Clientes e unidades | Código, razão social, CNPJ, situação | Geral, unidades, contatos, condições, documentos, histórico | Saldos e vínculos permitidos; unidade/equipamento em janela própria |
| Prospecção | Empresa/unidade, etapa, classificação, responsável | Contatos, interações, próximas ações | Próximo acompanhamento; abrir oportunidade |
| Oportunidades e propostas | Cliente/unidade, número, revisão, situação | Itens/serviços, condições, custos estimados, documentos, histórico | Totais e margem estimada; abrir pedido originado |
| Pedidos e contratos | Cliente/unidade, número, datas, situação | Itens, pagamento, entrega, aditivos, documentos, histórico | Total contratado; abrir projetos, equipamentos e títulos |
| Carteira de projetos | Filtros de cliente, estágio, responsável, período | Grade de projetos | Contagem/totais; abrir detalhe sem perder filtro |
| Detalhe do projeto | Código, cliente/unidade, responsável, datas | Resumo, equipamentos, planejamento, materiais, compras, financeiro, documentos, histórico | Previsto/realizado; operações especializadas abrem janelas vinculadas |
| Equipamentos | Identificador, série, modelo/revisão, cliente/unidade | Composição, fabricação, instalação, garantia, assistência, documentos | Situação e datas; abrir projeto/chamado |
| Materiais e serviços | Código, descrição, categoria, unidade, situação | Especificações, fornecedores, custos de referência, estoque, histórico | Disponibilidade e vínculo para movimentos |
| BOM | Modelo/projeto, revisão, situação | Componentes, serviços, categorias/etapas, revisões | Total estimado e diferenças; item em janela própria |
| EAP e cronograma | Projeto, versão, calendário, linha de base | Atividades, Gantt, dependências, avanço | Datas/progresso; atividade detalhada em janela vinculada |
| Ordens de produção | Número, projeto/equipamento, situação, responsável | Roteiro, reservas/consumos, horas, terceiros, apontamentos | Planejado/executado; abrir material, inspeção e custo |
| Inspeções e qualidade | Ordem/etapa, equipamento, responsável, data | Checklist, evidências, não conformidades, retrabalho | Resultado e liberação; abrir correção relacionada |
| Fornecedores | Código, identificação, situação | Geral, contatos, itens, condições, documentos, histórico | Compras/entregas e materiais sob guarda |
| Necessidades e cotações | Projeto, data de necessidade, filtros | Necessidades, fornecedores, propostas, comparação | Faltas e totais; abrir pedido de compra |
| Pedidos de compra | Fornecedor, número, situação, datas | Itens/serviços, entrega, pagamento, documentos, histórico | Totais e pendências; abrir recebimentos/títulos |
| Recebimentos e terceiros | Pedido, fornecedor/terceiro, local, data | Itens recebidos, conferência, remessas/retornos, documentos | Recebido/pendente/perdas; abrir movimentos |
| Estoque e inventário | Item, local, projeto e filtros | Saldos, reservas, movimentos, inventário, terceiros | Físico/reservado/disponível; ajuste em operação própria |
| Instalação e entrega | Projeto/equipamento, unidade, equipe, datas | Agenda, execução, despesas, testes, pendências, aceite | Avanço e situação; abrir documentos e chamados |
| Documentos e faturamento | Número, contraparte, emissão, competência, tipo | Itens/classificação, vínculos, títulos, anexos | Total e valor vinculado; abrir títulos existentes |
| Contas a receber | Cliente, pedido/projeto, título, vencimento | Composição, recebimentos, ajustes, documentos, histórico | Original/recebido/saldo; baixa/estorno em diálogo próprio |
| Contas a pagar | Beneficiário, compra/projeto, título, vencimento | Composição, pagamentos, ajustes, documentos, histórico | Original/pago/saldo; baixa/estorno em diálogo próprio |
| Contas e conciliação | Conta, período, lote de extrato | Extrato e movimentos lado a lado, correspondências, diferenças | Saldo e pendências; abrir lançamento/importação |
| Fluxo de caixa | Período, contas, projeto, categorias | Realizado, projetado, composição | Inicial/entradas/saídas/final; abrir movimentos filtrados |
| Custos e resultado | Projeto/equipamento, período, revisão orçamentária | Orçado, comprometido, incorrido, receitas, desvios | Margem e diferenças com composição rastreável |
| Repasses | Regra/versão, projeto, período, situação | Base, beneficiários, simulação, aprovação, pagamentos, histórico | Previsto/aprovado/pago/saldo; reserva separada |
| Impostos gerenciais | Competência, parâmetro/vigência, situação | Receitas, histórico importado, simulação, conferência, documentos | Valores separados e diferença; abrir obrigação confirmada |
| Assistência técnica | Chamado, equipamento, cliente, prioridade, responsável | Diagnóstico, garantia, execução, peças, horas/despesas, solução | Situação/custo; abrir equipamento e movimentos |
| Manutenção preventiva | Equipamento, plano, periodicidade, responsável | Checklist, programação, execuções | Última/próxima execução; abrir ordem gerada |
| Relatórios | Tipo de relatório, período, filtros | Tabela, gráficos quando úteis, composição | Totais e exportação; registro em janela própria |
| Importação e conferência | Arquivo/lote, origem, processador, situação | Origem, propostas, correspondências, divergências, aprovação | Contagens e totais reconciliados; visualizar documento relacionado |
| Configurações e manutenção | Grupo selecionado e contexto da empresa/usuário | Empresa, acesso, conexão, parâmetros, modelos, auditoria, backups | Resultado da operação e ações conforme permissão |

## 6. Navegação e comportamento dos campos

Setas de vínculo abrem cliente, fornecedor, projeto, equipamento ou documento relacionado. Busca global retorna resultados agrupados por tipo, respeita permissões e abre a janela correta. A primeira implementação de relações será por cliques e comandos explícitos; “arrastar e relacionar” fica como possibilidade posterior, sem bloquear a entrega das janelas.

Estados de consulta, inclusão, edição e busca precisam ser visíveis. Reutilizar amarelo de edição/foco e cores de leitura do design system com rótulos, ícones e mensagens; a cor sozinha não comunica erro ou obrigatoriedade. Campos monetários alinhados à direita, datas brasileiras e valores BRL seguem o contrato do servidor.

Tab/Shift+Tab percorrem os controles em ordem lógica. Enter executa a ação principal apenas quando apropriado, sem confirmar operações financeiras inesperadamente. Esc fecha seletor/diálogo ou solicita fechar a janela com tratamento de alterações. Cmd+S salva a janela ativa quando permitido; atalhos de fechamento/troca de janelas serão conciliados com os atalhos nativos do macOS antes da implementação. Deve existir alternativa por menu/teclado para mover, redimensionar e ativar janelas. Apenas diálogos modais prendem foco; janelas internas comuns permitem alternância.

## 7. Critérios de aceite da etapa visual

1. Abrir cliente, pedido e projeto ao mesmo tempo; alternar entre eles preservando o contexto e as alterações em memória.
2. Abrir o cliente pelo vínculo do pedido e ativar a instância existente, sem duplicá-la.
3. Mover, redimensionar, minimizar, maximizar e restaurar janelas, com controles acessíveis após recolher a lateral ou alterar zoom/tamanho do aplicativo.
4. Acionar a ferramenta Salvar e afetar somente a janela ativa autorizada, conservando alterações nas outras.
5. Abrir filtro/seletor, cancelar sem aplicar alterações e retornar foco à origem; abrir relatório relacionado sem bloquear o cadastro.
6. Fechar com mudanças pendentes e testar salvar, descartar e continuar; simular falha de salvamento e manter a edição acessível.
7. Verificar formulário, documento com itens, grade, relatório e Gantt com distribuição consistente e rolagem própria.
8. Verificar cabeçalhos, abas e totais com textos longos, erros de validação e volume representativo; ampliar tabela ao maximizar sem tornar campos ilegíveis.
9. Percorrer o fluxo comercial por teclado e comprovar diferenciação de janela ativa, estado de conexão e comando em andamento.

Na etapa 3, executar os cenários visuais com dados sintéticos identificados. Repetir os cenários de salvamento, autorização e conflito com a API real quando os módulos correspondentes forem entregues.
