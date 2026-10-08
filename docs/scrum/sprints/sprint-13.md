# Sprint 13 — Sistema inteiro pelo mock: cadastros, CRM, cockpit e carga de demonstração

Situação: **Pronta para a Review** (08/10/2026; início em 04/10/2026). Pedido do PO: "estude detalhadamente o artefato *Renda+ ERP MOCK* e altere o sistema inteiro para implementar todas as telas do mock; se for necessário altere o backend, o frontend e tudo; o sistema deverá ser idêntico às telas do mock". Pedido seguinte, na mesma conversa: "apague todos os dados do banco de dados e adicione os dados de exemplo, os mesmos usados no mock".

Referência: as 21 telas do mock (artefato *Renda+ ERP MOCK*, versão de 04/10/2026), capturadas em todos os estados e abas: Login; Cockpit inicial; Meu cockpit; Dados do indicador; Seção Cadastros (lista, parceiro, item, tabela editável, localizações, calendários e feriados); Seção CRM (painel comercial, oportunidades em lista e por etapa, oportunidade de venda, kanban, leads, atividades e agenda); Seção Fiscal (refeita na Sprint 12).

O PO pediu para implementar sem nova rodada de perguntas. As decisões abaixo foram tomadas na execução e ficam para confirmar na Review.

## O mock comparado com o que existe

| Tela do mock | O que existe hoje | O que muda |
|---|---|---|
| **Login** | Janela de login com estação de trabalho | Ilustração da secretária com fone (como no mock) |
| **Cockpit inicial** (moldura) | Moldura, gaveta com os 30 módulos do B01, marca d'água | Gaveta com os **25 módulos e os itens do mock** (Cadastros com 21 itens, CRM com 5, Fiscal com 5…), item ainda sem tela esmaecido; barra de ferramentas e menus com os nomes e ícones do mock; busca em *Operações*, *Dados mestre* e *Documentos*; sem marca d'água |
| **Meu cockpit** | Saúde da conexão e preenchimento do cadastro da empresa | Indicadores de negócio do mock com os números do servidor (`GET /cockpit`): faturamento do mês, carteira de pedidos, funil ponderado, saldo em caixa e bancos; 6 gráficos; *O que precisa de atenção*; próximas entregas. Indicadores de módulos que ainda não existem (produção, instalações, pós-venda, estoque mínimo) aparecem com o valor que o cadastro permite calcular ou com "Módulo previsto" |
| **Dados do indicador** | Não existe | Janela que abre de cada indicador com a lista que forma o número (ex.: *Notas fiscais emitidas* do mês) |
| **Lista de cadastro** (9 cadastros) | Clientes, Fornecedores e Produtos e serviços, cada um com sua lista | Uma lista no desenho do mock para **Clientes, Fornecedores, Contatos, Transportadoras, Colaboradores, Produtos, Serviços, Materiais e componentes e Depósitos**: Localizar, Situação, Grupo, colunas do mock (saldo em aberto, saldo a pagar, em estoque, preço…), total do resultado filtrado e "N registros de M" |
| **Dados mestre do parceiro** | Ficha do cliente (unidades, contatos, histórico) e do fornecedor | Ficha única de **cliente, fornecedor e transportadora** com o cabeçalho do mock (código automático, tipo, CNPJ validado, IE, grupo; saldo em aberto, pedidos em aberto, equipamentos instalados e oportunidades) e as abas **Geral, Endereços, Contatos, Pagamento, Fiscal, Atividades, Documentos e Histórico** |
| **Dados mestre do item** | Ficha do produto ou serviço (natureza Material/Serviço) | Ficha de **Produto, Material e Serviço** com foto, quantidades, marcas de item de estoque/venda/compra/fabricado e as abas **Geral, Vendas, Compras, Estoque, Engenharia, Fiscal e Documentos** |
| **Tabela editável** (8 tabelas) | Unidades e categorias | Grade editável do mock para **Unidades de medida, Categorias, Marcas, Bancos, Condições de pagamento, Formas de pagamento, Moedas e Tipos de documento** |
| **Localizações de estoque** | Não existe | Árvore depósito → área → rua → estante → posição, com capacidade, volume, ocupação, bloqueios e itens guardados |
| **Calendários e feriados** | Não existe | Calendários (padrão — fábrica, equipe de instalação, administrativo), feriados do ano com Páscoa calculada, jornada e dias úteis |
| **Painel comercial** | *Funil de vendas* | Painel do mock: funil em aberto, previsão ponderada, conversão em 12 meses, meta do mês; gráfico por etapa, rosca por origem, fechamentos previstos por mês e alertas |
| **Oportunidades** | Lista de oportunidades | Abas **Lista** e **Por etapa do funil** com subtotais; filtros de responsável e etapa |
| **Oportunidade de venda** | Ficha com abas Potencial, Etapas, Interações, Propostas, Concorrentes, Resumo, Histórico | Cabeçalho do mock (cliente, contato, título, origem, responsável, número, etapa, probabilidade, valor potencial e ponderado, previsão, avanço no funil) e abas **Geral** (itens de interesse e necessidade do cliente), **Atividades**, **Propostas e pedidos**, **Histórico de etapas** e **Observações**; Marcar como ganha / perdida |
| **Kanban de vendas** | Não existe | Colunas por etapa, cartões com dias sem atividade, setas e arrastar para mudar de etapa |
| **Leads** | *Prospecção* (empresas com estrelas) | Lista de leads do mock (nº L-…, contato, empresa, cidade, moagem, pontuação, situação) com o painel do lead ao lado; Converter em oportunidade, Registrar atividade, Descartar |
| **Atividades e agenda** | *Agenda do CRM* (próximas ações) | Agenda da semana (08h–18h) e lista; tipos Visita técnica, Reunião, Ligação, E-mail e Tarefa; situação Planejada, Hoje, Atrasada, Concluída; Concluir e Reagendar |

## Decisões (para confirmar na Review)

| Tema | Decisão |
|---|---|
| Menu lateral | O mock passa a ser a referência da gaveta: os 25 módulos e os itens dele, nessa ordem. O `menu.json` do B01 é refeito e o verificador confere os módulos do mock. As telas do plano que o mock ainda não tem no menu (Importação e conferência, Repasses) ficam numa lista `semMenu` com o motivo |
| Itens do mock sem tela | Aparecem esmaecidos, com a dica "ainda não disponível", como no mock |
| "Dados fictícios de demonstração" | O selo do mock **não** aparece no sistema: os dados são reais (do banco) |
| IA | Como na Sprint 12 (ADR-014): no lugar da "Análise com IA", **alertas por regra** com o mesmo visual, sem percentual de confiança. A sugestão de dados pelo CNPJ não consulta fonte externa |
| Parceiro | Um cadastro de parceiros com papéis **Cliente, Fornecedor e Transportadora**. Os campos novos (telefones, site, tipo de indústria, moagem, vendedor responsável, transportadora padrão, território, origem, observações, bloqueio com período e motivo, condições de pagamento, limite de crédito, dados fiscais e retenções) ficam no parceiro; endereços são as unidades (com tipo e padrão); contatos ganham *principal* e *recebe NF-e e boletos* |
| Colaboradores | Cadastro novo (matrícula, nome, departamento, função, centro de custo, admissão). É de onde saem o *vendedor responsável* e o *responsável* do CRM |
| Item | Tipos **Produto** (vendável, PA-), **Material** (componente, MP-/SN-/EL-…) e **Serviço**. Produtos e materiais continuam sendo a natureza MATERIAL do servidor, separados pelo tipo; os campos novos do mock ficam no item |
| Estoque | Sem módulo de estoque ainda: os **saldos por depósito** (em estoque, reservado, em pedido) são informados no cadastro e mostrados como no mock; *Movimentos de estoque* fica esmaecido até o módulo |
| Compras, produção, instalação, pós-venda | Sem módulo: as grades que dependem deles (últimas compras, ordens de produção, chamados) aparecem vazias com o aviso do módulo previsto, e os botões ficam esmaecidos |
| Documentos (anexos) | Anexos guardados no banco (até 10 MB por arquivo) para parceiro e item: Anexar, Abrir, Remover |
| Etapas do funil | As do mock: **Prospecção 10%, Qualificação 25%, Visita técnica 40%, Proposta 60%, Negociação 80%** (a etapa Prospecção é nova; percentuais continuam editáveis em *Etapas do funil*) |
| Lead | A prospecção da Sprint 11 vira **lead**: contato, empresa, cidade/UF, origem, interesse, moagem (t/dia), pontuação 0–100 e situação **Novo, Em contato, Qualificado, Descartado** (IDENTIFICADO, CONTATADO, INTERESSADO, DESCARTADO). A pontuação é calculada por regra (moagem, interesse, origem, contato recente) e pode ser ajustada |
| Atividades | As interações da Sprint 11 viram **atividades** com data, hora de início, duração, tipo, assunto, cliente, oportunidade, responsável, anotações e situação (*Planejada* ou *Concluída*; *Hoje* e *Atrasada* são calculadas pela data) |
| Meta comercial | Duas metas mensais: a de **vendas** (`sales_target`, pedidos confirmados no mês — *Meta de setembro* do painel comercial) e a de **faturamento** (`billing_target`, V21 — *Faturamento × meta* do cockpit). No mock as duas têm valores diferentes (R$ 450 mil e R$ 370 mil em setembro) |
| Próxima ação | Deixa de ser obrigatória na oportunidade e na mudança de etapa: o acompanhamento passa a ser feito pelas **atividades** (agenda). Mudança de etapa sem próxima ação mantém a atual e guarda a anotação da passagem |
| Responsável do CRM | Pode ser um usuário ou um **colaborador ativo** (os responsáveis do mock — Patrícia Gomes, Rafael Lima, Carlos Eduardo Pereira — são colaboradores) |
| Códigos | No formato do mock: lead `L-0412`, oportunidade `OP-000231`, proposta `PRO-000331`, pedido `PV-000118` (os já gravados não mudam) |
| Cockpit | Calculado no servidor (`GET /api/v1/cockpit`, `GET /api/v1/cockpit/indicators/{indicador}`) com o que os módulos gravam: faturamento (notas de saída), carteira (pedidos confirmados menos o faturado), funil ponderado, caixa (contas e movimentos), instalações (entrega contratual dos projetos nos próximos 30 dias) e itens abaixo do estoque mínimo (disponível = em estoque − reservado). **Ordens de produção** e **chamados de pós-venda** não têm módulo: aparecem com "—" e o aviso, sem número inventado. *O que precisa de atenção* e *Leitura dos números* são regras, não IA |
| Linha de produto | Na *Receita do ano por linha de produto*, cada modelo de balança (categoria Balanças de renda) é uma linha; serviços se dividem em *Contratos de manutenção* e *Instalação e serviços*; os demais produtos são *Peças e acessórios* |
| Competência das telas fiscais | Painel e apuração abrem no **mês corrente**, como no mock (na Sprint 12 abriam no mês anterior) |
| Importar lista de leads | O mock não tem o item no menu; a carga da Sprint 11 fica no botão **Importar lista** da tela Leads |
| Carga de demonstração | Comando no servidor: `RENDA_DEMO=recarregar` apaga **todos os dados de negócio** (mantém usuários e a estrutura) e carrega os dados do mock; `RENDA_DEMO_DATE=2026-09-24T09:31` faz o relógio do servidor começar no "hoje" do mock, para *Hoje*, *Atrasada* e os prazos aparecerem iguais |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S13-01 | Moldura, login, menu, ferramentas e busca | Iguais ao mock; menu.json refeito; verificador B01 OK |
| S13-02 | Banco (migração V19) | Tabelas e colunas novas dos cadastros e do CRM; dados existentes convertidos |
| S13-03 | Cadastros | As 9 listas, a ficha do parceiro (3 tipos), a ficha do item (3 tipos), as 8 tabelas, localizações e calendários, de ponta a ponta |
| S13-04 | CRM | Painel, leads, oportunidades (lista e por etapa), oportunidade, kanban e atividades, de ponta a ponta |
| S13-05 | Cockpit | Meu cockpit e dados do indicador com números do servidor |
| S13-06 | Carga de demonstração | Comando que apaga e carrega os dados do mock; números do mock na tela (ex.: clientes C00012…C00045, funil R$ 2.438.440,00, ponderado R$ 1.123.892,00) |
| S13-07 | Contratos e testes | OpenAPI, testes do servidor e do app, roteiro de ponta a ponta |

## Review — evidências (08/10/2026)

Todas as telas do mock foram implementadas e conferidas por captura lado a lado com o artefato (lista e fichas de cadastro, tabelas, localizações, calendários, painel comercial, leads, oportunidades em lista e por etapa, oportunidade, kanban, atividades e agenda em semana e lista, Meu cockpit, Dados do indicador e as telas fiscais).

Com a carga de demonstração (`RENDA_DEMO=recarregar RENDA_DEMO_DATE=2026-09-24T09:31`), os números do mock saem do banco:

| Tela | Número do mock | No sistema |
|---|---|---|
| Painel comercial | Funil R$ 2.438.440, ponderado R$ 1.123.892, meta 72% (R$ 324.000 de R$ 450.000) | Iguais |
| Meu cockpit | Faturamento R$ 386.400 (▲ 7,3%), carteira R$ 1.562.640 com 9 balanças, funil ponderado R$ 1.123.892, caixa R$ 842.310 (▼ 4,1%) | Iguais |
| Dados do indicador | 8 notas de setembro somando R$ 386.400,00; 8 pedidos somando R$ 1.562.640,00 | Iguais |
| Painel fiscal (09/2026) | DAS R$ 52.415,79, RBT12 R$ 3.340.000, receita do ano R$ 2.616.400 (72,7% do sublimite) | Iguais |
| Atividades e agenda | Semana de 21 a 25/09, 13 atividades, 5 concluídas, 1 atrasada | Iguais |

Diferenças que ficam, por decisão acima: produção e pós-venda sem números (sem módulo); "Análise com IA" substituída por regras; o selo "Dados fictícios de demonstração" não aparece; instalações nos próximos 30 dias contam os equipamentos dos projetos (4 na carga, o mock mostra 6); itens abaixo do mínimo pela regra do disponível (5 na carga, o mock mostra 4, um deles com estoque acima do mínimo).

Testes ao fechar a sprint:

| Conjunto | Resultado |
|---|---|
| App (Vitest) | 151 testes, todos passando |
| Servidor (`mvn verify`, PostgreSQL 16) | 121 testes, todos passando, incluindo o contrato OpenAPI (62 rotas novas documentadas) e as regras de arquitetura |
| Ponta a ponta (Playwright, servidor real) | 8 roteiros (Sprints 4 a 12), todos passando, navegando pelo menu do mock |
| Verificador do B01 e formatação dos JSON | OK |
| Carga do mock (`carga_mock.py --verificar`) | Em dia |

Defeitos achados e corrigidos na verificação: Anterior/Próximo registro não andava nas fichas novas de parceiro e colaborador; o menu e a busca não conferiam a permissão de cada lista de cadastro; a ficha do lead podia ficar em "Carregando" quando a recarga coincidia com a resposta anterior; a carga de leads ficou sem acesso no menu novo (botão Importar lista).
