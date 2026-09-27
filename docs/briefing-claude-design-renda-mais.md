# Renda+ ERP — inventário para Claude Design

Data: 24/09/2026. Fonte: código do mock atual em mock/src, principalmente data.js, Workspace.jsx, Analytics.jsx, main.jsx e Grid.jsx.

Este documento reúne as 32 áreas atuais, o menu lateral, campos, tabelas, abas, ações e exemplos. Não é uma nova auditoria dos PDFs originais. Os nomes, valores, datas, percentuais e contatos do cenário são sintéticos. As alterações do mock permanecem apenas na sessão; não há autenticação, servidor conectado, banco persistente ou IA real.

## 1. Prompt pronto para colar no Claude Design

Crie uma proposta visual completa e navegável para o Renda+ ERP com base neste inventário e nos arquivos do design system Renda+ ERP. A referência de organização é o SAP Business One desktop das imagens fornecidas: menus superiores, barra de ferramentas compacta, módulos laterais, múltiplas janelas internas sobrepostas e rodapé de mensagens/status. Use a identidade e os componentes do design system Renda+, incluindo ícones, campos, abas, tabelas, botões, gráficos e controles de IA.

Preserve o conteúdo das 32 áreas e os vínculos entre cliente, pedido, projeto, equipamento e financeiro. Separe a consulta em tabela da ficha do registro, agrupando campos por assunto e usando abas para informações complementares. Use português brasileiro, moeda BRL, datas DD/MM/AAAA e competências MM/AAAA. Identifique os dados como demonstrativos.

Mantenha a barra lateral estreita, proporcional à resolução e começando no topo da área de trabalho, logo abaixo das barras superiores. Mantenha a busca inteiramente dentro da tela. Centralize a marca grande Renda+ ERP na área de trabalho. As janelas podem ficar sobre a marca e sobre a busca, mas devem permanecer dentro da área útil. Preserve o rodapé visível. Remova os botões centrais “Abrir cockpit” e “Explorar módulos” e não recrie a faixa “Fluxo de trabalho” no dashboard inicial.

O hover dos módulos deve mudar suavemente entre tons azuis opacos, sem piscada branca. Seleções devem ser indicadas por preenchimento e/ou tipografia, sem contorno azul adicional. Preserve uma indicação discreta e acessível de foco pelo teclado. Não confunda bordas estruturais das janelas e tabelas com contornos de seleção.

Inclua as cinco visões do dashboard, gráficos de vendas e impostos, botões de IA nos gráficos e fluxo de caixa tabular com meses nas colunas, conforme o inventário. Não substitua a matriz de caixa apenas por cards. Mostre estados vazio, carregando, erro, selecionado, somente leitura, pendente e alterações não salvas. Não apresente simulações, rascunhos ou parâmetros fiscais ausentes como integrações ou cálculos reais.

Entregue o shell completo, as 32 áreas com listas e fichas quando aplicável, componentes reutilizáveis e exemplos dos principais diálogos. Adapte o conteúdo à largura real de cada janela; tabelas extensas podem ter rolagem interna. A arquitetura futura é cliente macOS Electron + React e servidor Java + Python; isso é contexto técnico, não texto promocional das telas.

## 2. Estrutura da interface

- Barra superior: menus textuais e controles da janela interna ativa.
- Barra de ferramentas: ícones com tooltip e estados habilitado/desabilitado conforme o contexto.
- Trilho vertical: Meu cockpit, Módulos e Janelas (quantidade de janelas abertas).
- Painel lateral: acordeão com os nove grupos abaixo. Largura atual de referência: 240–300 px lógicos (escala visual de 90%); em telas menores, abre sobre a área de trabalho e pode ser recolhido.
- Área de trabalho: saudação “Bem-vindo, Edson. Você está no cockpit inicial da Fourtech.”, busca e marca Renda+ ERP ao centro.
- Busca: placeholder “Pesquisar operações, dados mestre e documentos”; ícone de lupa; sugestões com nome/código e módulo; pesquisa módulos, clientes, pedidos, projetos e equipamentos; ↑/↓ selecionam, Enter abre e Esc fecha sugestões.
- Janelas internas: título, registro quando houver, indicação de edição pendente, minimizar, maximizar/restaurar, fechar, arrastar e redimensionar. Conteúdo rola dentro da janela; ações ficam no rodapé da janela.
- Bandeja de janelas: alternar entre abertas e restaurar minimizadas; organizar em cascata ou lado a lado.
- Rodapé global: log expansível, última mensagem, estado “Mock local · sem servidor”, data demonstrativa 23/09/2026, empresa Fourtech · Matriz, usuário Edson · demonstração, “Alterações somente nesta sessão”, horário 09:00 · demo, tela ativa, “Dados fictícios” e marca pequena. Em telas estreitas, priorizar estado, data e tela ativa.
- Atalhos: ⌘/Ctrl+K busca; ⌘/Ctrl+S salvar; Esc fecha menu, diálogo ou janela, conforme contexto.

## 3. Menu lateral completo

### Meu cockpit

- Visão geral — identificador: dashboard

### Cadastros

- Clientes e unidades — identificador: clientes
- Fornecedores — identificador: fornecedores
- Materiais e serviços — identificador: materiais
- Equipamentos — identificador: equipamentos

### Comercial

- Prospecção — identificador: prospeccao
- Oportunidades e propostas — identificador: propostas
- Pedidos e contratos — identificador: pedidos

### Projetos e engenharia

- Carteira de projetos — identificador: carteira
- Detalhe do projeto — identificador: projeto
- BOM — composição de custos — identificador: bom
- EAP e cronograma — identificador: cronograma

### Operação industrial

- Necessidades e cotações — identificador: necessidades
- Pedidos de compra — identificador: compras
- Recebimentos e terceiros — identificador: recebimentos
- Estoque e inventário — identificador: estoque
- Ordens de produção — identificador: producao
- Inspeções e qualidade — identificador: qualidade
- Instalação e entrega — identificador: instalacao

### Financeiro

- Documentos e faturamento — identificador: documentos
- Contas a receber — identificador: receber
- Contas a pagar — identificador: pagar
- Contas e conciliação — identificador: conciliacao
- Fluxo de caixa — identificador: caixa
- Custos e resultado — identificador: custos

### Gestão

- Repasses — identificador: repasses
- Impostos gerenciais — identificador: impostos
- Relatórios — identificador: relatorios

### Pós-venda

- Assistência técnica — identificador: assistencia
- Manutenção preventiva — identificador: preventiva

### Administração

- Importação e conferência — identificador: importacao
- Configurações e manutenção — identificador: configuracoes

## 4. Menus superiores e ferramentas

| Menu | Itens |
| --- | --- |
| Arquivo | Novo registro; Salvar alterações; Exportar tabela CSV; Imprimir janela; Reiniciar demonstração |
| Editar | Salvar registro ativo; Filtrar tabela; Estornar última baixa demo |
| Exibir | Mostrar/ocultar módulos; Log de mensagens; Cockpit inicial |
| Dados | Novo registro; Salvar registro; Exportar CSV |
| Ir para | Cliente; Pedido; Projeto; Contas a receber |
| Módulos | Os nove grupos do menu lateral |
| Ferramentas | Importação e conferência; Configurações |
| Janela | Cascata; Lado a lado; Maximizar/restaurar; Minimizar; Fechar; Ativar/restaurar cada janela aberta |
| Ajuda | Biblioteca do design system; Como navegar; Cobertura das 32 áreas |

Barra de ferramentas, na ordem atual (29 ícones): pré-visualizar documento; imprimir; rascunho de e-mail; rascunho de SMS; capa de fax; exportar CSV; exportar Word/RTF; salvar PDF pela impressão; organizar janelas; pausar tela; pesquisar; novo registro; primeiro registro; anterior; próximo; último; filtrar; ordenar; cliente relacionado; pedido relacionado; custos e resultado do projeto; títulos do projeto; editar registro; configurações; consultar módulos; log; cronograma; ajuda; assistente de gráficos.

E-mail/SMS/fax geram apenas rascunhos locais para download. Pausar tela é um bloqueio visual sem autenticação. Exportar PDF usa a impressão. As ações financeiras alteram somente os dados demo.

## 5. Padrão comum de listas e fichas

Listas: título, instrução breve, identificação de consulta demo, pesquisa por código/nome/descrição, situação e intervalo de datas quando aplicável, limpar filtros, tabela, seleção e acesso ao registro. Cabeçalhos ordenáveis; controles para ocultar/restaurar colunas; paginação de 5/10/25 linhas; contador; seleção por clique/teclado; abrir por seta dourada, Enter ou duplo clique; menu contextual.

Fichas: identificação e situação, campos compactos em colunas, lookup para trocar de registro, vínculos relacionados, abas, tabela/detalhe complementar, observações e checkbox “Conferência do registro realizada nesta sessão”. Código, valores monetários, dados do projeto e campos de títulos/fiscal são somente leitura nas fichas genéricas do mock. BOM tem edição própria de quantidade e custo.

Rodapé da janela: Salvar/Salvar alterações quando cabível, Fechar, indicação de alterações pendentes ou salvas na sessão, Exportar CSV e ação específica da área. Ações que exigem um registro ficam desabilitadas sem seleção. Fechar uma ficha alterada abre confirmação.

Os vínculos de contexto abrem informações do mesmo projeto. Não misturar dados de clientes diferentes. Alguns detalhamentos existem apenas para PRJ-026; para os demais, mostrar estado vazio.

## 6. Dashboards e gráficos

Cinco visões: Geral, Vendas, Financeiro, Industrial e Impostos. Relatórios reutiliza essas visões atualmente.

### Indicadores compartilhados (Geral, Vendas, Financeiro e Industrial)

- Carteira de pedidos: R$ 1.168.000,00, seis documentos; abre pedidos. O filtro de situação de Vendas altera este indicador.
- Saldo de caixa realizado: R$ 120.500,00; abre fluxo de caixa.
- A receber: R$ 194.300,00; abre títulos a receber.
- Projetos em execução: cinco; abre carteira.

### Geral

Gráfico de barras “Entradas e saídas do caixa” (setembro a dezembro/2026). Próximas ações: aprovar PC-063, conferir INS-032, conferir CR-026-2 e conferir DOC-042. Tabela de projetos com projeto, cliente, etapa, avanço, valor contratado e entrega. Sem a faixa “Fluxo de trabalho”.

### Vendas

Filtro de situação do pedido: Todos, Confirmado, Rascunho. Gráficos: “Pedidos por cliente” (barras; rótulos atuais são códigos dos pedidos); “Composição da carteira” (rosca, valor confirmado versus rascunho); “Recebido e saldo por cliente” (barras empilhadas). Tabela de pedidos filtrada.

### Financeiro

Gráficos: “Evolução do saldo previsto” (linha, realizado e títulos abertos nos vencimentos); “Composição dos saldos a pagar” (pizza por beneficiário). Tabela de contas a receber. Valores ausentes de impostos/reservas não entram no saldo.

### Industrial

Gráficos: “Avanço físico por projeto” (barras em %); “Orçado e incorrido por categoria” (área, materiais/serviços/mão de obra/instalação do PRJ-026). Tabela da carteira de projetos.

### Impostos

Filtro por competência: Todos, 08/2026, 09/2026 e 10/2026. Indicadores: receita documentada (R$ 332.300,00 no conjunto conhecido); três competências pendentes; imposto confirmado “Não informado”; dois documentos de venda no detalhe do cenário. O histórico agregado de agosto não tem documentos individuais carregados neste exemplo.

Gráficos: “Receitas por competência” (barras, agosto R$ 192.000,00 e setembro R$ 140.300,00; outubro sem valor conhecido); “Conferência dos documentos de venda” (rosca de quantidades vinculadas/em conferência); “Pendências fiscais por competência” (empilhado com contagem de histórico não importado e contador pendente). Tabela de competências e sugestão demo para conferir competências antes de projetar obrigações.

### Controles de cada gráfico

Ícones Ver dados e Analisar com IA. Ver dados alterna para tabela acessível. IA abre painel “Assistente de análise” com selo Demo, opções Resumir, Comparar e Conferir base, ações Conferir dados e Marcar como conferido. Respostas locais calculadas a partir dos valores exibidos, sem modelo de IA conectado. Links Abrir registros aparecem quando há uma fonte navegável.

## 7. Fluxo de caixa — matriz semelhante ao PDF

Tela: “Fluxo de caixa consolidado”. Filtros: Base (Realizado + previsto; Somente realizado; Somente a realizar) e Colunas (2026–2027; 2026; 2027). Saldo realizado destacado e botão Exportar matriz.

Abas: Tabular, Gráficos e Resumo mensal.

Na matriz: primeira coluna Descrição/projeto; colunas ANTES, jul./26, ago./26, set./26, out./26, nov./26, dez./26, jan./27, fev./27, mar./27, abr./27, mai./27, jun./27, jul./27, ago./27, set./27, out./27, nov./27, dez./27; CONF.; IMPOSTOS; Total do período. Cabeçalho e identificação da linha fixos durante a rolagem. Agrupamentos recolhíveis: Entradas — parcelas dos clientes; Saídas — fornecedores e serviços. Cada título mostra cliente/fornecedor, projeto e código. Clicar em um mês com valor mostra composição realizado/a realizar e permite abrir o título.

Linhas separadas de Repasses, Impostos e Reserva interna indicam informação ausente e não alteram totais. Linhas finais: Saldo inicial, Movimento líquido e Saldo acumulado. Não somar saldos mensais como se fossem receitas. O total de movimento é somável; os saldos não.

Saldo inicial do cenário: R$ 50.000,00. Recebimentos realizados: R$ 75.500,00; pagamentos realizados: R$ 5.000,00. Realizados são alocados em setembro/2026 neste mock; previsões seguem vencimentos. Saldo realizado R$ 120.500,00; saldo combinado final R$ 288.900,00. Meses sem títulos não criam receitas/despesas fictícias.

Gráficos: “Entradas e saídas mensais” (barras) e “Saldo acumulado” (linha), ambos com IA/tabela. Resumo mensal usa mês, saldo inicial, entradas, saídas, saldo final e base. A exportação da matriz é distinta do resumo CSV.

## 8. Inventário das 32 telas

Como ler: “Colunas/ficha atual” são os dados utilizados pela interface genérica; “Campos de referência do cadastro” são metadados presentes no código para o desenho, mas nem todos são renderizados no cabeçalho atual. “Abas previstas” enumera o esquema cadastrado; uma aba sem tabela ou vínculo específico pode exibir estado vazio. Não tratar rótulos de abas como funcionalidades completas de backend.

### 1. Visão geral

- Identificador: dashboard.
- Finalidade: Posição gerencial • setembro de 2026.
- Grupo: Meu cockpit.
- Colunas/ficha atual: Projeto; Cliente; Etapa; Avanço; Valor; Entrega.
- Abas previstas no cadastro: Visão geral; Pendências; Projetos.
- Ação principal: Abrir carteira.
- Vínculos: Carteira de projetos; Fluxo de caixa.
- Comportamento específico: Dashboard com cinco visões: Geral, Vendas, Financeiro, Industrial e Impostos. O detalhamento dos gráficos está na seção 6; as abas antigas Visão geral/Pendências/Projetos do cadastro não são a navegação renderizada.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

### 2. Clientes e unidades

- Identificador: clientes.
- Finalidade: Dados mestre de clientes e unidades industriais.
- Grupo: Cadastros.
- Colunas/ficha atual: Código; Cliente; Cidade / UF; Unidades; Situação.
- Abas previstas no cadastro: Geral; Unidades; Contatos; Condições; Documentos; Histórico.
- Ação principal: Novo cliente.
- Vínculos: Pedidos e contratos; Equipamentos; Contas a receber.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Código | CLI-001 | — |
| Nome | Fecularia Horizonte | — |
| CNPJ | Não informado · exemplo | — |
| Grupo | Indústria de fécula | — |
| Cidade / UF | Nova Esperança / PR | — |
| Situação | Ativo | — |

Dados da tabela no cenário inicial:

| Código | Cliente | Cidade / UF | Unidades | Situação |
| --- | --- | --- | --- | --- |
| CLI-001 | Fecularia Horizonte | Nova Esperança / PR | 2 | Ativo |
| CLI-002 | Amidos do Vale | Maringá / PR | 1 | Ativo |
| CLI-003 | Agroindustrial Aurora | Dourados / MS | 1 | Ativo |
| CLI-004 | Fécula Santa Clara | Paranavaí / PR | 1 | Ativo |
| CLI-005 | Indústria Boa Terra | Assis / SP | 1 | Ativo |
| CLI-006 | Amidos Rio Azul | Toledo / PR | 1 | Ativo |

Conteúdo das abas complementares:

- Unidades: tabela auxiliar com Código, Unidade, Cidade / UF, Tipo (exemplos no anexo).
- Contatos: tabela auxiliar com Nome demonstrativo, Área, Contato, Preferencial (exemplos no anexo).
- Condições: tabela auxiliar com Condição, Valor (exemplos no anexo).
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

### 3. Fornecedores

- Identificador: fornecedores.
- Finalidade: Parceiros de suprimentos e execução.
- Grupo: Cadastros.
- Colunas/ficha atual: Código; Fornecedor; Categoria; Prazo; Situação.
- Abas previstas no cadastro: Geral; Contatos; Itens; Condições; Histórico.
- Ação principal: Novo fornecedor.
- Vínculos: Pedidos de compra; Recebimentos e terceiros.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Código | FOR-001 | — |
| Fornecedor | Metalúrgica Modelo | — |
| Categoria | Chapas e estruturas | — |
| Prazo médio | 12 dias | — |
| Condição | 30 dias | — |
| Situação | Ativo | — |

Dados da tabela no cenário inicial:

| Código | Fornecedor | Categoria | Prazo | Situação |
| --- | --- | --- | --- | --- |
| FOR-001 | Metalúrgica Modelo | Chapas e estruturas | 12 dias | Ativo |
| FOR-002 | Automação Exemplo | Painéis elétricos | 18 dias | Ativo |
| FOR-003 | Usinagem Central | Usinagem | 8 dias | Ativo |
| FOR-004 | Pintura Técnica | Tratamento superficial | 5 dias | Ativo |

Conteúdo das abas complementares:

- Contatos: tabela auxiliar com Nome demonstrativo, Área, Contato, Preferencial (exemplos no anexo).
- Itens: tabela auxiliar com Código, Descrição, Quantidade, Preço unitário, Total (exemplos no anexo).
- Condições: tabela auxiliar com Condição, Valor (exemplos no anexo).
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

### 4. Materiais e serviços

- Identificador: materiais.
- Finalidade: Catálogo de componentes, insumos e serviços.
- Grupo: Cadastros.
- Colunas/ficha atual: Código; Descrição; Unidade; Categoria; Custo de referência.
- Abas previstas no cadastro: Catálogo; Especificações; Fornecedores; Custos; Histórico.
- Ação principal: Novo item.
- Vínculos: Estoque e inventário; BOM — composição de custos; Fornecedores.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Código | MAT-001 | — |
| Descrição | Chapa inox 304 · 3 mm | — |
| Unidade | kg | — |
| Categoria | Estrutura | — |
| Custo de referência | R$ 32,50 | — |
| Controle de estoque | Sim | — |

Dados da tabela no cenário inicial:

| Código | Descrição | Unidade | Categoria | Custo de referência |
| --- | --- | --- | --- | --- |
| MAT-001 | Chapa inox 304 · 3 mm | kg | Estrutura | R$ 32,50 |
| MAT-002 | Motorredutor 1,5 CV | un | Acionamento | R$ 3.200,00 |
| MAT-003 | Célula de carga 500 kg | un | Instrumentação | R$ 1.450,00 |
| MAT-004 | Painel elétrico Renda+ | un | Elétrica | R$ 18.900,00 |
| SRV-001 | Pintura e acabamento | sv | Serviço | R$ 3.000,00 |

Conteúdo das abas complementares:

- Fornecedores: consulta vinculada a Fornecedores; colunas Código, Fornecedor, Categoria, Prazo, Situação.
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

### 5. Equipamentos

- Identificador: equipamentos.
- Finalidade: Identificação e histórico de cada Renda+.
- Grupo: Cadastros.
- Colunas/ficha atual: Equipamento; Modelo; Cliente; Projeto; Situação.
- Abas previstas no cadastro: Geral; Composição; Fabricação; Instalação; Garantia; Assistência.
- Ação principal: Novo equipamento.
- Vínculos: Detalhe do projeto; Assistência técnica; Manutenção preventiva.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Equipamento | REN-026 | — |
| Modelo / revisão | Renda+ · R2 | — |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Projeto | PRJ-026 | Detalhe do projeto |
| Número de série | DEMO-2026-026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Equipamento | Modelo | Cliente | Projeto | Situação |
| --- | --- | --- | --- | --- |
| REN-026 | Renda+ R2 | Fecularia Horizonte | PRJ-026 | Em produção |
| REN-027 | Renda+ R2 | Amidos do Vale | PRJ-027 | Engenharia |
| REN-028 | Renda+ R2 | Agroindustrial Aurora | PRJ-028 | Em instalação |
| REN-029 | Renda+ R2 | Fécula Santa Clara | PRJ-029 | Suprimentos |
| REN-030 | Renda+ R2 | Indústria Boa Terra | PRJ-030 | A produzir |
| REN-031 | Renda+ R2 | Amidos Rio Azul | PRJ-031 | Concluído |

Conteúdo das abas complementares:

- Composição: consulta vinculada a BOM — composição de custos; colunas Código, Componente, Quantidade, Unidade, Custo unitário, Subtotal.
- Garantia: tabela auxiliar com Condição, Valor (exemplos no anexo).
- Assistência: consulta vinculada a Assistência técnica; colunas Chamado, Cliente, Equipamento, Assunto, Prioridade, Situação.

### 6. Prospecção

- Identificador: prospeccao.
- Finalidade: Relacionamento e próximas ações comerciais.
- Grupo: Comercial.
- Colunas/ficha atual: Código; Empresa; Cidade / UF; Interesse; Próxima ação.
- Abas previstas no cadastro: Empresas; Interações; Próximas ações.
- Ação principal: Registrar interação.
- Vínculos: Oportunidades e propostas; Clientes e unidades.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fecularia Modelo Norte | — |
| Classificação | 4 de 5 | — |
| Etapa | Contato realizado | — |
| Responsável | Equipe comercial | — |
| Próxima ação | 25/09/2026 | — |
| Possui Renda+ | Não | — |

Dados da tabela no cenário inicial:

| Código | Empresa | Cidade / UF | Interesse | Próxima ação |
| --- | --- | --- | --- | --- |
| LEAD-001 | Fecularia Modelo Norte | Umuarama / PR | Alto | 25/09 · ligação |
| LEAD-002 | Amidos Exemplo Sul | Ivinhema / MS | Médio | 28/09 · visita |
| LEAD-003 | Indústria Campo Verde | Londrina / PR | Alto | 30/09 · proposta |

### 7. Oportunidades e propostas

- Identificador: propostas.
- Finalidade: Negociação, revisões e formação de preço.
- Grupo: Comercial.
- Colunas/ficha atual: Proposta; Cliente; Revisão; Validade; Valor; Situação.
- Abas previstas no cadastro: Propostas; Itens; Condições; Custos estimados; Histórico.
- Ação principal: Gerar pedido.
- Vínculos: Pedidos e contratos; Custos e resultado.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Proposta | PROP-043 | — |
| Cliente | Fecularia Modelo Norte | Clientes e unidades |
| Revisão | R1 | — |
| Validade | 12/10/2026 | — |
| Condição de pagamento | 30% / 40% / 30% | — |
| Situação | Rascunho | — |

Dados da tabela no cenário inicial:

| Proposta | Cliente | Revisão | Validade | Valor | Situação |
| --- | --- | --- | --- | --- | --- |
| PROP-041 | Fecularia Horizonte | R2 | 30/09/2026 | R$ 185.000,00 | Aceita |
| PROP-042 | Amidos do Vale | R1 | 05/10/2026 | R$ 198.000,00 | Em negociação |
| PROP-043 | Fecularia Modelo Norte | R1 | 12/10/2026 | R$ 209.000,00 | Rascunho |

Conteúdo das abas complementares:

- Itens: tabela auxiliar com Código, Descrição, Quantidade, Preço unitário, Total (exemplos no anexo).
- Condições: tabela auxiliar com Condição, Valor (exemplos no anexo).
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

### 8. Pedidos e contratos

- Identificador: pedidos.
- Finalidade: Documentos comerciais e seus desdobramentos.
- Grupo: Comercial.
- Colunas/ficha atual: Pedido; Cliente; Projeto; Contratação; Valor; Situação.
- Abas previstas no cadastro: Pedidos; Itens; Pagamento; Entrega; Documentos; Histórico.
- Ação principal: Confirmar pedido.
- Vínculos: Detalhe do projeto; Contas a receber; Documentos e faturamento.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Pedido | PV-026 | — |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Unidade | Nova Esperança / PR | — |
| Projeto | PRJ-026 | Detalhe do projeto |
| Data | 15/09/2026 | — |
| Situação | Rascunho | — |

Dados da tabela no cenário inicial:

| Pedido | Cliente | Projeto | Contratação | Valor | Situação |
| --- | --- | --- | --- | --- | --- |
| PV-026 | Fecularia Horizonte | PRJ-026 | 15/09/2026 | R$ 185.000,00 | Rascunho |
| PV-027 | Amidos do Vale | PRJ-027 | 15/09/2026 | R$ 198.000,00 | Confirmado |
| PV-028 | Agroindustrial Aurora | PRJ-028 | 15/09/2026 | R$ 212.000,00 | Confirmado |
| PV-029 | Fécula Santa Clara | PRJ-029 | 15/09/2026 | R$ 176.000,00 | Confirmado |
| PV-030 | Indústria Boa Terra | PRJ-030 | 15/09/2026 | R$ 205.000,00 | Confirmado |
| PV-031 | Amidos Rio Azul | PRJ-031 | 15/09/2026 | R$ 192.000,00 | Confirmado |

Conteúdo das abas complementares:

- Itens: tabela auxiliar com Código, Descrição, Quantidade, Preço unitário, Total (exemplos no anexo).
- Pagamento: tabela auxiliar com Parcela, Vencimento, Percentual, Valor, Situação (exemplos no anexo).
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

Exceção: a aba Pagamento usa os títulos de contas a receber do projeto, com valores recebidos e saldos atualizados.

### 9. Carteira de projetos

- Identificador: carteira.
- Finalidade: Acompanhamento de contratos e entregas.
- Grupo: Projetos e engenharia.
- Colunas/ficha atual: Projeto; Cliente; Etapa; Avanço; Valor contratado; Entrega.
- Abas previstas no cadastro: Projetos; Prazos; Responsáveis.
- Ação principal: Abrir projeto.
- Vínculos: Detalhe do projeto; EAP e cronograma; Custos e resultado.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

Dados da tabela no cenário inicial:

| Projeto | Cliente | Etapa | Avanço | Valor contratado | Entrega |
| --- | --- | --- | --- | --- | --- |
| PRJ-026 | Fecularia Horizonte | Em produção | 68% | R$ 185.000,00 | 15/10/2026 |
| PRJ-027 | Amidos do Vale | Engenharia | 25% | R$ 198.000,00 | 28/10/2026 |
| PRJ-028 | Agroindustrial Aurora | Em instalação | 92% | R$ 212.000,00 | 30/09/2026 |
| PRJ-029 | Fécula Santa Clara | Suprimentos | 38% | R$ 176.000,00 | 12/11/2026 |
| PRJ-030 | Indústria Boa Terra | A produzir | 10% | R$ 205.000,00 | 25/11/2026 |
| PRJ-031 | Amidos Rio Azul | Concluído | 100% | R$ 192.000,00 | 15/09/2026 |

### 10. Detalhe do projeto

- Identificador: projeto.
- Finalidade: PRJ-026 · Fabricação e instalação de balança Renda+.
- Grupo: Projetos e engenharia.
- Colunas/ficha atual: Etapa; Responsável; Previsão; Avanço; Situação.
- Abas previstas no cadastro: Resumo; Equipamentos; Planejamento; Materiais; Compras; Financeiro; Documentos; Histórico.
- Ação principal: Abrir cronograma.
- Vínculos: EAP e cronograma; BOM — composição de custos; Custos e resultado; Contas a receber.
- Comportamento específico: A entrada pelo menu lista a carteira. Abrir um projeto mostra Projeto, Cliente, Unidade, Etapa, Avanço, Valor contratado e Entrega; a aba Resumo contém a tabela de etapas abaixo.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Etapa | Responsável | Previsão | Avanço | Situação |
| --- | --- | --- | --- | --- |
| Engenharia | Equipe técnica | 29/08/2026 | 100% | Concluído |
| Suprimentos | Compras | 12/09/2026 | 90% | Em andamento |
| Fabricação mecânica | Produção | 02/10/2026 | 68% | Em andamento |
| Integração elétrica | Elétrica | 08/10/2026 | 25% | Em andamento |
| Instalação e testes | Campo | 15/10/2026 | 0% | Planejado |

Conteúdo das abas complementares:

- Equipamentos: consulta vinculada a Equipamentos; colunas Equipamento, Modelo, Cliente, Projeto, Situação.
- Planejamento: consulta vinculada a EAP e cronograma; colunas Atividade, Responsável, Início, Término, Avanço.
- Materiais: consulta vinculada a Estoque e inventário; colunas Item, Descrição, Local, Físico, Reservado, Disponível.
- Compras: consulta vinculada a Pedidos de compra; colunas Pedido, Fornecedor, Projeto, Entrega prevista, Valor, Situação.
- Financeiro: consulta vinculada a Contas a receber; colunas Título, Cliente, Vencimento, Original, Recebido, Saldo, Situação.
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).
- Histórico: tabela auxiliar com Data / hora, Usuário demo, Evento (exemplos no anexo).

### 11. BOM — composição de custos

- Identificador: bom.
- Finalidade: Modelo Renda+ R2 · revisão de engenharia.
- Grupo: Projetos e engenharia.
- Colunas/ficha atual: Código; Componente; Quantidade; Unidade; Custo unitário; Subtotal.
- Abas previstas no cadastro: Componentes; Serviços; Categorias; Revisões.
- Ação principal: Criar revisão.
- Vínculos: Materiais e serviços; Necessidades e cotações; Custos e resultado.
- Comportamento específico: Selecionar projeto. Na aba Componentes, quantidade e custo unitário são editáveis, com subtotal e total recalculados. Dados detalhados do exemplo pertencem a PRJ-026.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Modelo | Renda+ R2 | — |
| Revisão | R03 | — |
| Projeto | PRJ-026 | Detalhe do projeto |
| Situação | Aprovada | — |
| Data da revisão | 01/09/2026 | — |
| Responsável | Engenharia | — |

Dados da tabela no cenário inicial:

| Código | Componente | Quantidade | Unidade | Custo unitário | Subtotal |
| --- | --- | --- | --- | --- | --- |
| MAT-001 | Chapa inox 304 · 3 mm | 240 | kg | R$ 32,50 | R$ 7.800,00 |
| MAT-002 | Motorredutor 1,5 CV | 1 | un | R$ 3.200,00 | R$ 3.200,00 |
| MAT-003 | Célula de carga 500 kg | 4 | un | R$ 1.450,00 | R$ 5.800,00 |
| MAT-004 | Painel elétrico Renda+ | 1 | un | R$ 18.900,00 | R$ 18.900,00 |
| SRV-001 | Pintura e acabamento | 1 | sv | R$ 3.000,00 | R$ 3.000,00 |

Conteúdo das abas complementares:

- Serviços: consulta vinculada a Materiais e serviços; colunas Código, Descrição, Unidade, Categoria, Custo de referência.

### 12. EAP e cronograma

- Identificador: cronograma.
- Finalidade: Planejamento, linha de base e execução.
- Grupo: Projetos e engenharia.
- Colunas/ficha atual: Atividade; Responsável; Início; Término; Avanço.
- Abas previstas no cadastro: Gantt; Atividades; Dependências; Linha de base.
- Ação principal: Registrar avanço.
- Vínculos: Ordens de produção; Necessidades e cotações.
- Comportamento específico: Selecionar projeto. Gantt apresenta atividades, responsáveis, datas e avanço; há abas de atividades, dependências e linha de base. O registro de avanço do mock altera Montagem mecânica de PRJ-026.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Atividade | Responsável | Início | Término | Avanço |
| --- | --- | --- | --- | --- |
| Engenharia e liberação | Engenharia | 24/08/2026 | 29/08/2026 | 100% |
| Compra de componentes | Compras | 28/08/2026 | 12/09/2026 | 90% |
| Corte e usinagem | Produção | 07/09/2026 | 20/09/2026 | 100% |
| Montagem mecânica | Produção | 18/09/2026 | 02/10/2026 | 68% |
| Painel e integração | Elétrica | 28/09/2026 | 08/10/2026 | 25% |
| Inspeção e testes | Qualidade | 08/10/2026 | 10/10/2026 | 0% |
| Instalação e aceite | Campo | 12/10/2026 | 15/10/2026 | 0% |

Conteúdo das abas complementares:

- Dependências: tabela auxiliar com Atividade, Predecessora, Vínculo, Defasagem (exemplos no anexo).
- Linha de base: tabela auxiliar com Versão, Aprovada em, Entrega prevista, Situação (exemplos no anexo).

### 13. Necessidades e cotações

- Identificador: necessidades.
- Finalidade: Demanda por projeto e comparação de fornecedores.
- Grupo: Operação industrial.
- Colunas/ficha atual: Item; Descrição; Necessário; Disponível; Faltante; Data necessária.
- Abas previstas no cadastro: Necessidades; Cotações; Comparação.
- Ação principal: Gerar compra.
- Vínculos: Pedidos de compra; Fornecedores; Estoque e inventário.
- Comportamento específico: Planejamento por projeto com necessidades, cotações e comparação; dados de exemplo do PRJ-026.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Item | Descrição | Necessário | Disponível | Faltante | Data necessária |
| --- | --- | --- | --- | --- | --- |
| MAT-001 | Chapa inox 304 | 240 kg | 180 kg | 60 kg | 28/09/2026 |
| MAT-002 | Motorredutor | 1 un | 0 un | 1 un | 01/10/2026 |
| MAT-003 | Célula de carga | 4 un | 8 un | 0 un | 02/10/2026 |

Conteúdo das abas complementares:

- Cotações: consulta vinculada a Necessidades e cotações; colunas Item, Descrição, Necessário, Disponível, Faltante, Data necessária.

### 14. Pedidos de compra

- Identificador: compras.
- Finalidade: Compras vinculadas a projeto e orçamento.
- Grupo: Operação industrial.
- Colunas/ficha atual: Pedido; Fornecedor; Projeto; Entrega prevista; Valor; Situação.
- Abas previstas no cadastro: Pedidos; Itens; Entrega; Pagamento; Documentos.
- Ação principal: Aprovar compra.
- Vínculos: Recebimentos e terceiros; Contas a pagar.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Pedido | PC-061 | — |
| Fornecedor | Metalúrgica Modelo | Fornecedores |
| Projeto | PRJ-026 | Detalhe do projeto |
| Entrega prevista | 28/09/2026 | — |
| Condição | 30 dias | — |
| Situação | Parcial | — |

Dados da tabela no cenário inicial:

| Pedido | Fornecedor | Projeto | Entrega prevista | Valor | Situação |
| --- | --- | --- | --- | --- | --- |
| PC-061 | Metalúrgica Modelo | PRJ-026 | 28/09/2026 | R$ 7.800,00 | Parcial |
| PC-062 | Automação Exemplo | PRJ-026 | 01/10/2026 | R$ 18.900,00 | Aprovado |
| PC-063 | Usinagem Central | PRJ-027 | 02/10/2026 | R$ 4.200,00 | Em aprovação |

Conteúdo das abas complementares:

- Itens: tabela auxiliar com Código, Descrição, Quantidade, Preço unitário, Total (exemplos no anexo).
- Pagamento: tabela auxiliar com Parcela, Vencimento, Percentual, Valor, Situação (exemplos no anexo).
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).

### 15. Recebimentos e terceiros

- Identificador: recebimentos.
- Finalidade: Conferência física, remessas e retornos.
- Grupo: Operação industrial.
- Colunas/ficha atual: Registro; Pedido; Item / serviço; Quantidade; Local; Situação.
- Abas previstas no cadastro: Recebimentos; Conferência; Remessas e retornos; Documentos.
- Ação principal: Conferir recebimento.
- Vínculos: Estoque e inventário; Pedidos de compra.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Registro | REC-081 | — |
| Pedido | PC-061 | Pedidos de compra |
| Fornecedor | Metalúrgica Modelo | Fornecedores |
| Local | Almoxarifado | — |
| Data | 21/09/2026 | — |
| Situação | Conferido | — |

Dados da tabela no cenário inicial:

| Registro | Pedido | Item / serviço | Quantidade | Local | Situação |
| --- | --- | --- | --- | --- | --- |
| REC-081 | PC-061 | Chapa inox 304 | 180 kg | Almoxarifado | Conferido |
| REM-012 | PC-061 | Estrutura mecânica | 1 conjunto | Pintura Técnica | Em terceiros |
| REC-082 | PC-062 | Painel elétrico | 1 un | Recebimento | Pendente |

Conteúdo das abas complementares:

- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).

### 16. Estoque e inventário

- Identificador: estoque.
- Finalidade: Posição física, reservas e propriedade.
- Grupo: Operação industrial.
- Colunas/ficha atual: Item; Descrição; Local; Físico; Reservado; Disponível.
- Abas previstas no cadastro: Saldos; Reservas; Movimentos; Inventário; Terceiros.
- Ação principal: Registrar reserva.
- Vínculos: Materiais e serviços; Ordens de produção; Recebimentos e terceiros.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Local | Todos os locais | — |
| Projeto | PRJ-026 | Detalhe do projeto |
| Propriedade | Fourtech | — |
| Data da posição | 23/09/2026 | — |
| Categoria | Todas | — |
| Unidade | Conforme item | — |

Dados da tabela no cenário inicial:

| Item | Descrição | Local | Físico | Reservado | Disponível |
| --- | --- | --- | --- | --- | --- |
| MAT-001 | Chapa inox 304 | Almoxarifado | 240 kg | 60 kg | 180 kg |
| MAT-002 | Motorredutor | Almoxarifado | 1 un | 1 un | 0 un |
| MAT-003 | Célula de carga | Instrumentação | 12 un | 4 un | 8 un |
| MAT-004 | Painel elétrico | Recebimento | 0 un | 0 un | 0 un |

Conteúdo das abas complementares:

- Reservas: consulta vinculada a Estoque e inventário; colunas Item, Descrição, Local, Físico, Reservado, Disponível.
- Terceiros: consulta vinculada a Recebimentos e terceiros; colunas Registro, Pedido, Item / serviço, Quantidade, Local, Situação.

### 17. Ordens de produção

- Identificador: producao.
- Finalidade: Execução de fabricação por equipamento.
- Grupo: Operação industrial.
- Colunas/ficha atual: Ordem; Equipamento; Operação; Responsável; Avanço; Situação.
- Abas previstas no cadastro: Ordens; Roteiro; Materiais; Apontamentos; Terceiros.
- Ação principal: Apontar produção.
- Vínculos: Inspeções e qualidade; Estoque e inventário; EAP e cronograma.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Ordem | Equipamento | Operação | Responsável | Avanço | Situação |
| --- | --- | --- | --- | --- | --- |
| OP-026 | REN-026 | Montagem mecânica | Equipe A | 68% | Em execução |
| OP-027 | REN-027 | Preparação de materiais | Equipe B | 25% | Liberada |
| OP-028 | REN-028 | Testes finais | Equipe A | 100% | Concluída |

Conteúdo das abas complementares:

- Materiais: consulta vinculada a Estoque e inventário; colunas Item, Descrição, Local, Físico, Reservado, Disponível.
- Terceiros: consulta vinculada a Recebimentos e terceiros; colunas Registro, Pedido, Item / serviço, Quantidade, Local, Situação.

### 18. Inspeções e qualidade

- Identificador: qualidade.
- Finalidade: Liberações, evidências e não conformidades.
- Grupo: Operação industrial.
- Colunas/ficha atual: Inspeção; Equipamento; Etapa; Responsável; Data; Resultado.
- Abas previstas no cadastro: Inspeções; Checklist; Evidências; Não conformidades.
- Ação principal: Registrar inspeção.
- Vínculos: Ordens de produção; Instalação e entrega.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Inspeção | Equipamento | Etapa | Responsável | Data | Resultado |
| --- | --- | --- | --- | --- | --- |
| INS-031 | REN-026 | Dimensional da estrutura | Qualidade | 22/09/2026 | Aprovada |
| INS-032 | REN-026 | Solda e acabamento | Qualidade | 23/09/2026 | Pendente |
| NC-004 | REN-027 | Ajuste de suporte | Produção | 21/09/2026 | Em correção |

Conteúdo das abas complementares:

- Checklist: tabela auxiliar com Verificação demonstrativa, Resultado, Responsável (exemplos no anexo).
- Evidências: tabela auxiliar com Evidência, Estado (exemplos no anexo).
- Não conformidades: consulta vinculada a Inspeções e qualidade; colunas Inspeção, Equipamento, Etapa, Responsável, Data, Resultado.

### 19. Instalação e entrega

- Identificador: instalacao.
- Finalidade: Programação de campo e aceite do equipamento.
- Grupo: Operação industrial.
- Colunas/ficha atual: Instalação; Cliente; Equipamento; Data; Equipe; Situação.
- Abas previstas no cadastro: Agenda; Execução; Despesas; Testes; Aceite.
- Ação principal: Registrar aceite.
- Vínculos: Equipamentos; Assistência técnica.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Instalação | Cliente | Equipamento | Data | Equipe | Situação |
| --- | --- | --- | --- | --- | --- |
| INST-028 | Agroindustrial Aurora | REN-028 | 28/09/2026 | Equipe de campo | Em execução |
| INST-026 | Fecularia Horizonte | REN-026 | 15/10/2026 | Equipe de campo | Programada |

### 20. Documentos e faturamento

- Identificador: documentos.
- Finalidade: Registro e conferência • emissão externa.
- Grupo: Financeiro.
- Colunas/ficha atual: Documento; Cliente / fornecedor; Emissão; Competência; Valor; Situação.
- Abas previstas no cadastro: Documentos; Classificação; Títulos vinculados; Anexos.
- Ação principal: Conferir documento.
- Vínculos: Contas a receber; Contas a pagar; Impostos gerenciais.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

Dados da tabela no cenário inicial:

| Documento | Cliente / fornecedor | Emissão | Competência | Valor | Situação |
| --- | --- | --- | --- | --- | --- |
| DOC-041 | Fecularia Horizonte | 15/09/2026 | 09/2026 | R$ 55.500,00 | Vinculado |
| DOC-042 | Agroindustrial Aurora | 18/09/2026 | 09/2026 | R$ 84.800,00 | Em conferência |
| DOC-043 | Metalúrgica Modelo | 21/09/2026 | 09/2026 | R$ 7.800,00 | Vinculado |

Conteúdo das abas complementares:

- Títulos vinculados: consulta vinculada a Contas a receber; colunas Título, Cliente, Vencimento, Original, Recebido, Saldo, Situação.
- Anexos: tabela auxiliar com Anexo demonstrativo, Tipo, Situação (exemplos no anexo).

### 21. Contas a receber

- Identificador: receber.
- Finalidade: Títulos, recebimentos e saldos.
- Grupo: Financeiro.
- Colunas/ficha atual: Título; Cliente; Vencimento; Original; Recebido; Saldo; Situação.
- Abas previstas no cadastro: Títulos; Recebimentos; Ajustes; Documentos.
- Ação principal: Registrar recebimento.
- Vínculos: Fluxo de caixa; Contas e conciliação; Pedidos e contratos.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Projeto | PRJ-026 | Detalhe do projeto |
| Conta de destino | Banco demonstração | — |
| Período | Setembro e outubro / 2026 | — |
| Categoria | Venda de equipamento | — |
| Moeda | BRL | — |

Dados da tabela no cenário inicial:

| Título | Cliente | Vencimento | Original | Recebido | Saldo | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| CR-026-1 | Fecularia Horizonte | 15/09/2026 | R$ 55.500,00 | R$ 55.500,00 | R$ 0,00 | Liquidado |
| CR-026-2 | Fecularia Horizonte | 30/09/2026 | R$ 74.000,00 | R$ 20.000,00 | R$ 54.000,00 | Parcial |
| CR-026-3 | Fecularia Horizonte | 15/10/2026 | R$ 55.500,00 | R$ 0,00 | R$ 55.500,00 | Aberto |
| CR-028-2 | Agroindustrial Aurora | 28/09/2026 | R$ 84.800,00 | R$ 0,00 | R$ 84.800,00 | Aberto |

Conteúdo das abas complementares:

- Recebimentos: consulta vinculada a Contas a receber; colunas Título, Cliente, Vencimento, Original, Recebido, Saldo, Situação.
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).

Exceção: a aba de recebimentos/pagamentos da ficha apresenta Título, Original, Liquidado, Saldo e Situação.

### 22. Contas a pagar

- Identificador: pagar.
- Finalidade: Obrigações com fornecedores e prestadores.
- Grupo: Financeiro.
- Colunas/ficha atual: Título; Beneficiário; Vencimento; Original; Pago; Saldo; Situação.
- Abas previstas no cadastro: Títulos; Pagamentos; Ajustes; Documentos.
- Ação principal: Registrar pagamento.
- Vínculos: Pedidos de compra; Fluxo de caixa; Contas e conciliação.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

Dados da tabela no cenário inicial:

| Título | Beneficiário | Vencimento | Original | Pago | Saldo | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| CP-061 | Metalúrgica Modelo | 21/10/2026 | R$ 7.800,00 | R$ 0,00 | R$ 7.800,00 | Aberto |
| CP-062 | Automação Exemplo | 01/10/2026 | R$ 18.900,00 | R$ 5.000,00 | R$ 13.900,00 | Parcial |
| CP-063 | Usinagem Central | 02/10/2026 | R$ 4.200,00 | R$ 0,00 | R$ 4.200,00 | Aberto |

Conteúdo das abas complementares:

- Pagamentos: consulta vinculada a Contas a pagar; colunas Título, Beneficiário, Vencimento, Original, Pago, Saldo, Situação.
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).

Exceção: a aba de recebimentos/pagamentos da ficha apresenta Título, Original, Liquidado, Saldo e Situação.

### 23. Contas e conciliação

- Identificador: conciliacao.
- Finalidade: Correspondência entre extrato e lançamentos.
- Grupo: Financeiro.
- Colunas/ficha atual: Data; Descrição do extrato; Valor; Lançamento; Situação.
- Abas previstas no cadastro: Conciliação; Contas; Diferenças.
- Ação principal: Conciliar selecionado.
- Vínculos: Contas a receber; Contas a pagar; Fluxo de caixa.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Conta | Banco demonstração | — |
| Período inicial | 01/09/2026 | — |
| Período final | 30/09/2026 | — |
| Lote | EXT-DEMO-09 | — |
| Moeda | BRL | — |
| Saldo inicial | R$ 50.000,00 | — |

Dados da tabela no cenário inicial:

| Data | Descrição do extrato | Valor | Lançamento | Situação |
| --- | --- | --- | --- | --- |
| 15/09/2026 | Recebimento · entrada PV-026 | R$ 55.500,00 | CR-026-1 | Conciliado |
| 20/09/2026 | Transferência · cliente Horizonte | R$ 20.000,00 | CR-026-2 | A conferir |
| 21/09/2026 | Pagamento · Automação Exemplo | -R$ 5.000,00 | CP-062 | A conferir |

Conteúdo das abas complementares:

- Contas: consulta vinculada a Contas e conciliação; colunas Data, Descrição do extrato, Valor, Lançamento, Situação.

### 24. Fluxo de caixa

- Identificador: caixa.
- Finalidade: Realizado e projetado separados.
- Grupo: Financeiro.
- Colunas/ficha atual: Mês; Saldo inicial; Entradas; Saídas; Saldo final; Base.
- Abas previstas no cadastro: Visão mensal; Realizado; Projetado; Composição.
- Ação principal: Abrir contas a receber.
- Vínculos: Contas a receber; Contas a pagar; Contas e conciliação.
- Comportamento específico: Tela própria com Tabular, Gráficos e Resumo mensal. Usar os dados calculados dos títulos e a estrutura da seção 7; ignorar as antigas projeções estáticas cadastradas em data.js.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

Resumo calculado dos títulos (cenário inicial, realizado + previsto):

| Mês | Saldo inicial | Entradas | Saídas | Saldo final | Base |
| --- | --- | --- | --- | --- | --- |
| ANTES | R$ 50.000,00 | R$ 0,00 | R$ 0,00 | R$ 50.000,00 | Referência / setembro |
| jul./26 | R$ 50.000,00 | R$ 0,00 | R$ 0,00 | R$ 50.000,00 | Referência / setembro |
| ago./26 | R$ 50.000,00 | R$ 0,00 | R$ 0,00 | R$ 50.000,00 | Referência / setembro |
| set./26 | R$ 50.000,00 | R$ 214.300,00 | R$ 5.000,00 | R$ 259.300,00 | Referência / setembro |
| out./26 | R$ 259.300,00 | R$ 55.500,00 | R$ 25.900,00 | R$ 288.900,00 | Projeção |
| nov./26 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| dez./26 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| jan./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| fev./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| mar./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| abr./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| mai./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| jun./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| jul./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| ago./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| set./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| out./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| nov./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |
| dez./27 | R$ 288.900,00 | R$ 0,00 | R$ 0,00 | R$ 288.900,00 | Projeção |

Conteúdo das abas complementares:

- Composição: consulta vinculada a BOM — composição de custos; colunas Código, Componente, Quantidade, Unidade, Custo unitário, Subtotal.

### 25. Custos e resultado

- Identificador: custos.
- Finalidade: Orçamento e execução por projeto.
- Grupo: Financeiro.
- Colunas/ficha atual: Categoria; Orçado; Comprometido; Incorrido; Saldo a executar.
- Abas previstas no cadastro: Resultado; Orçado; Comprometido; Incorrido; Receitas.
- Ação principal: Abrir composição.
- Vínculos: BOM — composição de custos; Pedidos de compra; Ordens de produção.
- Comportamento específico: Composição por projeto. Separar orçado, comprometido, incorrido e saldo a executar; dados de exemplo do PRJ-026.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Projeto | PRJ-026 | Detalhe do projeto |
| Cliente | Fecularia Horizonte | Clientes e unidades |
| Equipamento | REN-026 · Renda+ | Equipamentos |
| Responsável | Equipe de engenharia | — |
| Previsão de entrega | 15/10/2026 | — |
| Situação | Em produção | — |

Dados da tabela no cenário inicial:

| Categoria | Orçado | Comprometido | Incorrido | Saldo a executar |
| --- | --- | --- | --- | --- |
| Materiais | R$ 35.700,00 | R$ 32.000,00 | R$ 24.000,00 | R$ 11.700,00 |
| Serviços | R$ 15.000,00 | R$ 11.000,00 | R$ 8.000,00 | R$ 7.000,00 |
| Mão de obra | R$ 22.000,00 | R$ 22.000,00 | R$ 12.000,00 | R$ 10.000,00 |
| Instalação | R$ 9.000,00 | R$ 4.000,00 | R$ 0,00 | R$ 9.000,00 |

Conteúdo das abas complementares:

- Receitas: consulta vinculada a Documentos e faturamento; colunas Documento, Cliente / fornecedor, Emissão, Competência, Valor, Situação.

### 26. Repasses

- Identificador: repasses.
- Finalidade: Simulações e memória de aprovação.
- Grupo: Gestão.
- Colunas/ficha atual: Beneficiário demo; Base recebida; Percentual demo; Previsto; Pago; Saldo.
- Abas previstas no cadastro: Simulação; Beneficiários; Base de cálculo; Aprovações; Pagamentos.
- Ação principal: Aprovar simulação.
- Vínculos: Contas a pagar; Custos e resultado.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Regra | REP-DEMO · R1 | — |
| Base | Recebimentos do projeto | — |
| Projeto | PRJ-026 | Detalhe do projeto |
| Vigência | 09/2026 | — |
| Situação | Simulação | — |
| Reserva interna | Separada dos beneficiários | — |

Dados da tabela no cenário inicial:

| Beneficiário demo | Base recebida | Percentual demo | Previsto | Pago | Saldo |
| --- | --- | --- | --- | --- | --- |
| Prestador A | R$ 75.500,00 | 5% | R$ 3.775,00 | R$ 0,00 | R$ 3.775,00 |
| Prestador B | R$ 75.500,00 | 3% | R$ 2.265,00 | R$ 0,00 | R$ 2.265,00 |

Conteúdo das abas complementares:

- Beneficiários: consulta vinculada a Repasses; colunas Beneficiário demo, Base recebida, Percentual demo, Previsto, Pago, Saldo.
- Pagamentos: consulta vinculada a Contas a pagar; colunas Título, Beneficiário, Vencimento, Original, Pago, Saldo, Situação.

### 27. Impostos gerenciais

- Identificador: impostos.
- Finalidade: Conferência documental • sem apuração fiscal oficial.
- Grupo: Gestão.
- Colunas/ficha atual: Competência; Receita documentada; Histórico; Simulação; Confirmado contador; Situação.
- Abas previstas no cadastro: Competências; Receitas; Parâmetros; Conferência; Documentos.
- Ação principal: Registrar conferência.
- Vínculos: Documentos e faturamento; Contas a pagar.
- Comportamento específico: Entrada com abas Dashboard e Competências. Dashboard mostra indicadores e três gráficos fiscais. Competências apresenta a tabela; abrir uma competência exibe a ficha e as abas abaixo.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Competência | 09/2026 | — |
| Enquadramento | A validar com contador | — |
| RBT12 | Histórico insuficiente | — |
| Parâmetros | Não validados | — |
| Valor confirmado | Não informado | — |
| Situação | Conferência documental | — |

Dados da tabela no cenário inicial:

| Competência | Receita documentada | Histórico | Simulação | Confirmado contador | Situação |
| --- | --- | --- | --- | --- | --- |
| 08/2026 | R$ 192.000,00 | Não importado | Não calculada | Pendente | A conferir |
| 09/2026 | R$ 140.300,00 | Não importado | Não calculada | Pendente | A conferir |
| 10/2026 | Projetada | Não importado | Não calculada | Pendente | Não apurado |

Conteúdo das abas complementares:

- Receitas: consulta vinculada a Documentos e faturamento; colunas Documento, Cliente / fornecedor, Emissão, Competência, Valor, Situação.
- Parâmetros: tabela auxiliar com Parâmetro, Valor, Estado (exemplos no anexo).
- Documentos: tabela auxiliar com Documento demo, Tipo, Data, Situação (exemplos no anexo).

### 28. Assistência técnica

- Identificador: assistencia.
- Finalidade: Atendimento e histórico pós-venda.
- Grupo: Pós-venda.
- Colunas/ficha atual: Chamado; Cliente; Equipamento; Assunto; Prioridade; Situação.
- Abas previstas no cadastro: Chamados; Diagnóstico; Garantia; Peças e horas; Solução.
- Ação principal: Registrar atendimento.
- Vínculos: Equipamentos; Estoque e inventário; Manutenção preventiva.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Chamado | AT-012 | — |
| Cliente | Amidos Rio Azul | Clientes e unidades |
| Equipamento | REN-031 | Equipamentos |
| Responsável | Equipe de campo | — |
| Prioridade | Normal | — |
| Garantia | Conferir condições | — |

Dados da tabela no cenário inicial:

| Chamado | Cliente | Equipamento | Assunto | Prioridade | Situação |
| --- | --- | --- | --- | --- | --- |
| AT-012 | Amidos Rio Azul | REN-031 | Verificação de calibração | Normal | Em atendimento |
| AT-013 | Agroindustrial Aurora | REN-028 | Orientação de operação | Normal | Aberto |

Conteúdo das abas complementares:

- Garantia: tabela auxiliar com Condição, Valor (exemplos no anexo).

### 29. Manutenção preventiva

- Identificador: preventiva.
- Finalidade: Planos e programação por equipamento.
- Grupo: Pós-venda.
- Colunas/ficha atual: Plano; Equipamento; Periodicidade; Última execução; Próxima execução; Situação.
- Abas previstas no cadastro: Programação; Planos; Checklist; Execuções.
- Ação principal: Gerar ordem de serviço.
- Vínculos: Assistência técnica; Equipamentos.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Plano | MP-031 | — |
| Equipamento | REN-031 | Equipamentos |
| Periodicidade | Trimestral | — |
| Responsável | Pós-venda | — |
| Próxima execução | 15/12/2026 | — |
| Situação | Programada | — |

Dados da tabela no cenário inicial:

| Plano | Equipamento | Periodicidade | Última execução | Próxima execução | Situação |
| --- | --- | --- | --- | --- | --- |
| MP-031 | REN-031 | Trimestral | 15/09/2026 | 15/12/2026 | Programada |
| MP-028 | REN-028 | Trimestral | Aguardando aceite | A definir | Pendente |

Conteúdo das abas complementares:

- Checklist: tabela auxiliar com Verificação demonstrativa, Resultado, Responsável (exemplos no anexo).

### 30. Relatórios

- Identificador: relatorios.
- Finalidade: Consultas gerenciais com composição rastreável.
- Grupo: Gestão.
- Colunas/ficha atual: Relatório; Descrição; Formato; Atualização.
- Abas previstas no cadastro: Carteira; Financeiro; Industrial; Pós-venda.
- Ação principal: Abrir relatório.
- Vínculos: Carteira de projetos; Fluxo de caixa; Custos e resultado.
- Comportamento específico: Abre a mesma Central de acompanhamento com as cinco visões do cockpit. A lista de relatórios cadastrada abaixo é referência de conteúdo e ainda não é uma tela separada de catálogo.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Responsável | Edson · demonstração | — |
| Data de referência | 23/09/2026 | — |
| Ambiente | Mock · dados fictícios | — |

Catálogo cadastrado como referência, ainda não renderizado separadamente:

| Relatório | Descrição | Formato | Atualização |
| --- | --- | --- | --- |
| REL-001 | Carteira por cliente e situação | CSV / impressão | Sob demanda |
| REL-002 | Contas a receber em aberto | CSV / impressão | Sob demanda |
| REL-003 | Estoque disponível por local | CSV / impressão | Sob demanda |
| REL-004 | Custos por projeto | CSV / impressão | Sob demanda |

Conteúdo das abas complementares:

- Financeiro: consulta vinculada a Contas a receber; colunas Título, Cliente, Vencimento, Original, Recebido, Saldo, Situação.
- Industrial: consulta vinculada a Ordens de produção; colunas Ordem, Equipamento, Operação, Responsável, Avanço, Situação.
- Pós-venda: consulta vinculada a Assistência técnica; colunas Chamado, Cliente, Equipamento, Assunto, Prioridade, Situação.

### 31. Importação e conferência

- Identificador: importacao.
- Finalidade: Procedência e revisão antes da aplicação.
- Grupo: Administração.
- Colunas/ficha atual: Lote; Arquivo demonstrativo; Registros; Pendências; Situação.
- Abas previstas no cadastro: Lotes; Origem; Registros propostos; Divergências; Aprovação.
- Ação principal: Simular novo lote.
- Vínculos: Materiais e serviços; Carteira de projetos.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Lote | IMP-DEMO-02 | — |
| Origem | Arquivo de demonstração | — |
| Processador | Simulado · sem extração real | — |
| Registros propostos | 5 | — |
| Pendências | 1 divergência de total | — |
| Situação | Em revisão | — |

Dados da tabela no cenário inicial:

| Lote | Arquivo demonstrativo | Registros | Pendências | Situação |
| --- | --- | --- | --- | --- |
| IMP-DEMO-01 | carteira-exemplo.csv | 6 | 0 | Conferido |
| IMP-DEMO-02 | bom-exemplo.pdf | 5 | 1 | Em revisão |
| IMP-DEMO-03 | recebimentos-exemplo.csv | 4 | 2 | Em revisão |

Conteúdo das abas complementares:

- Divergências: tabela auxiliar com Campo, Origem demo, Conferência, Tratamento (exemplos no anexo).

### 32. Configurações e manutenção

- Identificador: configuracoes.
- Finalidade: Preferências do protótipo e referências técnicas.
- Grupo: Administração.
- Colunas/ficha atual: Configuração; Valor; Estado.
- Abas previstas no cadastro: Geral; Acesso; Conexão; Parâmetros; Auditoria; Backups.
- Ação principal: Reiniciar demonstração.
- Vínculos: Nenhum vínculo específico.

Campos de referência do cadastro (não confundir com campos já renderizados):

| Campo | Exemplo sintético | Destino vinculado |
| --- | --- | --- |
| Empresa | Fourtech · demonstração | — |
| Usuário | Edson · demonstração | — |
| Ambiente | Mock local | — |
| Servidor | Sem conexão real | — |
| Idioma | Português brasileiro | — |
| Moeda | BRL | — |

Dados da tabela no cenário inicial:

| Configuração | Valor | Estado |
| --- | --- | --- |
| Cliente | Electron + React | Arquitetura definida |
| Servidor | Java + Python | Não conectado neste mock |
| Armazenamento do mock | Memória da sessão | Reiniciar limpa alterações |
| Moeda / idioma | BRL / Português brasileiro | Ativo |
| Design system | Renda+ ERP | Aplicado |

Conteúdo das abas complementares:

- Acesso: tabela auxiliar com Perfil demo, Permissão, Situação (exemplos no anexo).
- Parâmetros: tabela auxiliar com Parâmetro, Valor, Estado (exemplos no anexo).
- Auditoria: tabela auxiliar com Quando, Operador, Ação (exemplos no anexo).
- Backups: tabela auxiliar com Recurso, Situação no mock, Previsto no ERP (exemplos no anexo).

## 9. Diálogos e estados auxiliares

| Diálogo | Informações e ações |
| --- | --- |
| Alterações não salvas | Aviso; Descartar; Continuar editando; Salvar e fechar |
| Filtrar tabela | Texto que deve aparecer nas colunas; Limpar; Cancelar; Aplicar filtro |
| Ordenar tabela | Coluna; checkbox Ordem decrescente; Cancelar; Aplicar ordenação |
| Baixa de recebimento/pagamento | Título; cliente/beneficiário; saldo; valor da baixa; conta Banco/Caixa demonstração; validação de valor positivo até o saldo; Confirmar baixa demo |
| Registrar avanço | Montagem mecânica PRJ-026; slider 0–100%; Registrar avanço; linha de base preservada |
| Importação demonstrativa | Nome do arquivo; Cancelar; Criar lote demo; não lê arquivo real |
| Confirmar ação | Registro selecionado; descrição da simulação; Confirmar simulação |
| Conferência fiscal | Aviso de que valores fiscais e parâmetros não são calculados/presumidos; Fechar |
| Reiniciar demonstração | Descartar alterações da sessão e recarregar cenário; Cancelar/Reiniciar |
| Pré-visualizar documento | Tabela com campos e dados da consulta ou ficha ativa; Fechar |
| Rascunho e-mail/SMS/fax | Destinatário; Assunto; Mensagem; contador de caracteres; Baixar rascunho; sem envio |
| Tela pausada | Aviso de pausa visual; Retomar; sem autenticação |
| Como navegar | Orientações de módulos, busca, vínculos, janelas e atalhos |
| Mapa de áreas | Nove grupos, 32 atalhos de telas |
| Biblioteca do design system | Busca; lista de componentes; descrição; exemplo visual |

Estados de interface: vazio após filtro; projeto sem planejamento; botão desabilitado sem seleção; campo somente leitura; competência sem imposto informado; título parcialmente liquidado; registro com alterações não salvas; sucesso/erro no log; gráfico alternado para tabela; IA demonstrativa aberta/fechada; janela ativa/inativa/minimizada/maximizada.

## 10. Tabelas auxiliares das abas

Esses exemplos não são universais: na interface atual, são restringidos ao PRJ-026, exceto referências de Configurações. Abas de vínculo têm prioridade sobre exemplos estáticos com o mesmo nome.

### Unidades

| Código | Unidade | Cidade / UF | Tipo |
| --- | --- | --- | --- |
| UNI-001 | Unidade industrial 01 | Nova Esperança / PR | Matriz |
| UNI-002 | Unidade industrial 02 | Maringá / PR | Filial |

### Contatos

| Nome demonstrativo | Área | Contato | Preferencial |
| --- | --- | --- | --- |
| Ana · exemplo | Administrativo | ana@example.com | Sim |
| Paulo · exemplo | Operação | paulo@example.com | Não |

### Itens

| Código | Descrição | Quantidade | Preço unitário | Total |
| --- | --- | --- | --- | --- |
| REN-R2 | Balança hidrostática Renda+ R2 | 1 | R$ 170.000,00 | R$ 170.000,00 |
| SRV-INST | Instalação e comissionamento | 1 | R$ 15.000,00 | R$ 15.000,00 |

### Pagamento

| Parcela | Vencimento | Percentual | Valor | Situação |
| --- | --- | --- | --- | --- |
| 1 / 3 | 15/09/2026 | 30% | R$ 55.500,00 | Liquidado |
| 2 / 3 | 30/09/2026 | 40% | R$ 74.000,00 | Parcial |
| 3 / 3 | 15/10/2026 | 30% | R$ 55.500,00 | Aberto |

### Documentos

| Documento demo | Tipo | Data | Situação |
| --- | --- | --- | --- |
| Contrato demonstrativo | Contrato | 15/09/2026 | Exemplo visual |
| Desenho de conjunto R2 | Engenharia | 01/09/2026 | Exemplo visual |

### Anexos

| Anexo demonstrativo | Tipo | Situação |
| --- | --- | --- |
| Documento de conferência | PDF | Referência visual · arquivo não anexado |

### Histórico

| Data / hora | Usuário demo | Evento |
| --- | --- | --- |
| 23/09/2026 09:15 | Edson | Registro consultado |
| 22/09/2026 16:40 | Engenharia | Revisão de planejamento |
| 15/09/2026 10:20 | Comercial | Registro de demonstração criado |

### Checklist

| Verificação demonstrativa | Resultado | Responsável |
| --- | --- | --- |
| Conferência visual | Pendente | Qualidade |
| Verificação dimensional | Aprovada | Qualidade |
| Documentação associada | Pendente | Engenharia |

### Dependências

| Atividade | Predecessora | Vínculo | Defasagem |
| --- | --- | --- | --- |
| Montagem mecânica | Corte e usinagem | Término–início | 0 dias |
| Inspeção e testes | Painel e integração | Término–início | 0 dias |
| Instalação e aceite | Inspeção e testes | Término–início | 1 dia |

### Linha de base

| Versão | Aprovada em | Entrega prevista | Situação |
| --- | --- | --- | --- |
| LB-01 | 24/08/2026 | 15/10/2026 | Preservada |
| Planejamento atual | 23/09/2026 | 15/10/2026 | Sem alteração de entrega |

### Divergências

| Campo | Origem demo | Conferência | Tratamento |
| --- | --- | --- | --- |
| Total da BOM | R$ 35.700,00 | R$ 38.700,00 | Diferença de R$ 3.000,00 · revisar |

### Acesso

| Perfil demo | Permissão | Situação |
| --- | --- | --- |
| Administrador | Configurações e todas as áreas | Exemplo |
| Operação | Projetos, produção e estoque | Exemplo |
| Financeiro | Títulos, caixa e conciliação | Exemplo |

### Backups

| Recurso | Situação no mock | Previsto no ERP |
| --- | --- | --- |
| Banco central | Não implementado | Backup agendado no servidor |
| Anexos | Não implementado | Cópia consistente e restauração ensaiada |

### Garantia

| Condição | Valor |
| --- | --- |
| Termo | Definido por contrato |
| Início | Data de aceite confirmado |
| Validação | Necessária antes de cobertura |

### Condições

| Condição | Valor |
| --- | --- |
| Forma de pagamento | Transferência bancária |
| Parcelamento | 30% entrada / 40% fabricação / 30% entrega |
| Moeda | BRL |
| Prazo da proposta | 15 dias |

### Evidências

| Evidência | Estado |
| --- | --- |
| Fotos da inspeção | Sem arquivos reais neste mock |
| Relatório dimensional | Registro demonstrativo |

### Parâmetros

| Parâmetro | Valor | Estado |
| --- | --- | --- |
| Competência | 09/2026 | Exemplo |
| Regra tributária | A validar | Nenhum cálculo fiscal executado |
| Arredondamento | Conforme contrato futuro | Planejado |

### Auditoria

| Quando | Operador | Ação |
| --- | --- | --- |
| 23/09/2026 | Edson · demo | Abertura do protótipo |
| 23/09/2026 | Sistema · demo | Carga de dados sintéticos |

## 11. Design system e entrega visual

Usar o pacote design-system/renda-mais-erp e suas referências originais. A navegação pode seguir o SAP Business One sem copiar marcas SAP.

Cores principais do pacote: navegação #4867B1; navegação selecionada #4C7BC6; superfícies de formulário #EEF3F7; campos ativos #FCF0AE; campos somente leitura #E0E7F2; botões #FCEEB0; abas ativas #9DB8DB; texto #1F2026; destaque dourado #EFB43E. Usar os tokens de tipografia, bordas, ícones e espaçamentos do pacote, com densidade compacta.

Hover dos módulos: fundo azul opaco em ambos os estados, transição curta de cor (180 ms), sem transição de azul para transparente. Seleção por preenchimento/ênfase tipográfica; sem anel azul. Foco de teclado discreto, atualmente pontilhado dourado.

Catálogo disponível (49 componentes; nem todos são necessários em todas as telas):

| Componente | Grupo |
| --- | --- |
| Logotipo | Marca |
| Abas | Layout |
| Barra superior | Layout |
| Caixa de mensagem | Layout |
| Janela | Layout |
| Rodapé | Layout |
| Barra de menus | Navegação |
| Barra lateral | Navegação |
| Busca | Navegação |
| Menu lateral recolhível | Navegação |
| Painel de módulos | Navegação |
| Trilho lateral | Navegação |
| Barra de ferramentas | Ações |
| Botão | Ações |
| Menu de contexto | Ações |
| Seta de link | Ações |
| Barra de filtros | Entradas |
| Campo de busca de registro | Entradas |
| Campo de data | Entradas |
| Campo de saldo | Entradas |
| Campo de texto | Entradas |
| Grupo de campos | Entradas |
| Lista de seleção | Entradas |
| Opções | Entradas |
| Paginação | Entradas |
| Seleção | Entradas |
| Barra de progresso | Dados |
| Grade | Dados |
| Indicador | Dados |
| Selo de status | Dados |
| Tabela de edição | Dados |
| Tabela de resumo | Dados |
| Barras 3D | Gráficos 3D |
| Barras empilhadas 3D | Gráficos 3D |
| Pizza 3D | Gráficos 3D |
| Rosca 3D | Gráficos 3D |
| Área 3D | Gráficos 3D |
| Linha | Gráficos |
| Dashboard 3D | Painéis |
| Análise com IA | IA |
| Sugestão de IA | IA |
| Barra de status | Status |
| Barra de status do sistema | Status |
| Dica | Status |
| Ícones de IA | Ícones |
| Ícones de ferramentas | Ícones |
| Ícones de módulos | Ícones |
| Ícones de pastas | Ícones |
| Ícones de status | Ícones |

## 12. Limites importantes para o redesenho

- Os gráficos e números fiscais são gerenciais; não há apuração tributária oficial. Ausência de valor deve continuar “Não informado”, “Pendente” ou “Não calculada”.
- A biblioteca de componentes, o catálogo de campos e as abas são referências; não declarar todos os recursos como implementados.
- Ações como Gerar pedido/Gerar compra podem apenas navegar para outra área; isso não equivale a criar automaticamente documentos vinculados.
- Contas a receber/pagar e caixa compartilham os mesmos títulos no cenário. Preservar esta relação e as baixas parciais.
- A emissão de documentos fiscais é externa no mock. Sem envio de e-mail/SMS/fax, importação real de PDF/CSV ou autenticação.
- O layout futuro pode completar campos hoje apenas cadastrados, mas deve identificar isso como evolução proposta.
- A marca deve permanecer centralizada quando o painel lateral abre/fecha; janelas podem sobrepor busca/marca e o rodapé continua visível.

## 13. Referências para anexar ao Claude Design

1. Este documento, que contém o prompt e o inventário.
2. O pacote original renda-mais-erp (tokens, componentes e ícones).
3. As nove capturas do SAP Business One fornecidas pelo usuário.
4. O PDF GESTAO_FLUXO_DE_CAIXA — Fluxo de Caixa Total, como referência visual para a matriz.

O Claude não terá acesso automático aos caminhos locais mencionados aqui: anexe os arquivos desejados na conversa de destino.
