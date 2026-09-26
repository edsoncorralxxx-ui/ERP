# Sprint 3 — Fornecedores, materiais e serviços

Situação: **Entregue para Review** (25/09/2026). Planning aprovado pelo PO em 25/09/2026.

## Objetivo

Completar os cadastros básicos para comprar e vender: fornecedores (o mesmo parceiro do cliente, com o papel de fornecedor) e materiais e serviços com unidade de medida, categoria e conversões — com permissões, auditoria e histórico como nos clientes.

## Decisões do planning

| Pendência | Decisão | Quem decidiu |
|---|---|---|
| Equipamentos | Saem desta sprint e vão para a **Sprint 4**: o equipamento nasce da confirmação do pedido e exige um projeto (modelo de dados, "Projetos e equipamentos") | PO |
| Código de materiais e serviços | **Gerado pelo sistema**: `M00001` para material, `S00001` para serviço (o contrato do formulário dizia "usuário"; ajustado) | PO |
| Unidades de medida e categorias | **Lista inicial + manutenção pelo Administrador**: o sistema já vem com UN, PC, CJ, KG, G, T, M, M2, M3, L, H; categorias começam vazias; o Administrador inclui e inativa unidades e categorias numa janela própria | PO |
| PD-007 — precisão | Premissa do B01 mantida: custo de referência e fator de conversão com até 6 casas decimais | Premissa B01 |
| Papéis do parceiro | Cliente e fornecedor são papéis do mesmo parceiro (formulário "fornecedores"): um CNPJ já cadastrado como cliente não cria outro parceiro — o app oferece torná-lo também fornecedor. Cada papel tem a sua situação: inativar o fornecedor não inativa o cliente | Contrato B01 |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S3-01 | Papéis do parceiro | `partner_role` com situação por papel; clientes existentes migrados; inativar um papel não mexe no outro; lista de clientes e de fornecedores filtram pelo papel |
| S3-02 | Fornecedores no servidor | Cadastrar (idempotente, código `F00001`), editar com versão (If-Match), inativar com motivo, histórico; categorias fornecidas, prazo de referência (dias) e condições de pagamento; CNPJ de parceiro existente → erro que aponta o parceiro, e comando para torná-lo fornecedor; tudo auditado e com evento na outbox |
| S3-03 | Unidades de medida e categorias | Lista inicial semeada; Administrador inclui, renomeia e inativa; código da unidade único e em maiúsculas; unidade/categoria em uso não é apagada, só inativada |
| S3-04 | Materiais e serviços no servidor | Cadastrar (idempotente, código `M`/`S` do sistema), editar com versão, inativar com motivo, histórico; serviço não controla estoque; unidade e categoria ativas obrigatórias; conversão com fator > 0 e sem repetir a unidade; custo de referência ≥ 0 com até 6 casas; eventos `ItemRegistered`, `ItemUpdated`, `ItemDeactivated` |
| S3-05 | Telas de fornecedores | Janela de lista (busca, funil, seta, Novo) e ficha (cabeçalho + Geral, Contatos, Histórico) no design system; diálogo "tornar fornecedor" para CNPJ de cliente |
| S3-06 | Telas de materiais e serviços | Janela de lista e ficha (cabeçalho + Geral, Conversões, Histórico); natureza em rádios; campos amarelo-claros em adição |
| S3-07 | Janela Unidades e categorias | Só o Administrador edita; Consulta vê |
| S3-08 | Contratos | OpenAPI dos endpoints novos; permissões `item.*` e `catalog.admin`; `menu.json` marca os itens implementados e move Equipamentos para a Sprint 4 |

Ordem de execução: S3-01 → S3-02 → S3-03 → S3-04 → S3-05/S3-06/S3-07 → S3-08.

## Fora do escopo

Equipamentos (Sprint 4); itens fornecidos por fornecedor com prazo por item (`supplier_item`, entra com Compras); preços de venda e listas de preço; estoque e custo médio (B08); unidades por endereço do fornecedor; importação de cadastros (B04).

## Como verificar (ao final)

1. Com o administrador: incluir a categoria "Chapas" e a unidade "BR" (barra) na janela Unidades e categorias.
2. Cadastrar um material com conversão (1 BR = 6 M) e um serviço; tentar marcar o serviço como controlado em estoque e ver a recusa.
3. Cadastrar um fornecedor com a categoria "Chapas"; tentar cadastrar como fornecedor o CNPJ de um cliente e aceitar torná-lo fornecedor.
4. Inativar o papel de fornecedor desse parceiro e ver que ele continua cliente ativo.
5. Entrar como Consulta: vê tudo, não altera nada.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S3-01 Papéis do parceiro | Pronto | Migração V5 (`partner_role`), clientes da Sprint 2 migrados com a situação que tinham (conferido num banco com dados da V4); `SupplierApiTest`: inativar o fornecedor deixa o cliente ativo e o parceiro continua `ATIVO` |
| S3-02 Fornecedores no servidor | Pronto | `SupplierApiTest` (5 testes): código `F00001`, categorias, prazo e condições, auditoria e evento com o papel; mesma chave devolve o mesmo fornecedor; CNPJ de cliente → `PARTNER_OTHER_ROLE` com `partnerId` e versão, sem criar outro parceiro; `/enable` idempotente mantém o código `C`; a ficha do fornecedor não mexe nas unidades do cliente; Consulta lê e recebe 403 ao cadastrar |
| S3-03 Unidades e categorias | Pronto | Lista inicial de 11 unidades (V6); `ItemApiTest`: código em maiúsculas e único, nome de categoria único sem diferenciar maiúsculas, versão (412), só `catalog.admin` altera, tudo auditado |
| S3-04 Materiais e serviços | Pronto | `ItemApiTest` (5 testes): códigos `M00001`/`S00001`, custo e fator com 6 casas, serviço não controla estoque (também no banco), fator > 0, unidade repetida e da própria unidade recusadas, natureza fixa depois do cadastro, unidade inativada continua aceita no item que já a usa, histórico com "1 BR = 6,00 M", eventos `ItemRegistered/Updated/Deactivated` |
| S3-05 Telas de fornecedores | Pronto | Lista e ficha (Geral com Lista de seleção das categorias, Contatos, Histórico); diálogo "Parceiro já cadastrado → torná-lo também fornecedor"; Reativar; seta para a ficha de cliente (`Sprint3Windows.test.tsx`) |
| S3-06 Telas de materiais e serviços | Pronto | Lista (filtros de natureza e categoria) e ficha (natureza em rádios, estoque desabilitado para serviço, custo digitado como `1.234,5` vai como `1234.50`, conversões na Tabela de edição) |
| S3-07 Janela Unidades e categorias | Pronto | Abas Unidades de medida e Categorias de item; Consulta só vê (`Sprint3Windows.test.tsx`) |
| S3-08 Contratos | Pronto | `docs/backend/api/openapi.yaml` (20 rotas novas; `OpenApiContractTest` passa); permissões `item.*` e `catalog.admin` nos perfis; `menu.json` com Fornecedores, Materiais e serviços e Unidades e categorias implementados e Equipamentos na Sprint 4; evento `PartnerDeactivated` agora leva o papel; verificador B01 OK |

Testes executados: servidor 66 (PostgreSQL 16 real; eram 56), app 47 (eram 42), typecheck e build do app e do Electron, verificador B01 + testes. Roteiro "Como verificar" executado no Chromium contra o servidor real, do banco vazio: categoria e unidade incluídas; material `M00001` com 1 BR = 6 M e serviço `S00001` (caixa de estoque desabilitada); cliente `C00001` cadastrado como fornecedor pelo diálogo, sem duplicar; fornecedor inativado e o parceiro continua na lista de clientes ativos; usuário Consulta sem botões de alteração.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); o CI do GitHub roda no próximo push.

**Limitação conhecida:** a busca das listas diferencia acentos ("acos" não acha "Aços"), como já acontecia nos clientes. Resolver pede a extensão `unaccent` do PostgreSQL — fica para decisão.

**Fora do combinado, feito na Sprint:** a ficha do cliente ganhou o mesmo diálogo "tornar também cliente" (para CNPJ de um fornecedor) e a seta para a ficha de fornecedor; lista, histórico, contatos e diálogos das fichas passaram a componentes comuns (`apps/desktop/src/screens/comum/`).

## Retrospectiva

- Funcionou: o teste de contrato pegou na hora as rotas novas sem documentação; a migração foi conferida com dados reais da versão anterior antes de subir.
- Melhorar: o roteiro no navegador ainda é um script solto na sessão; vale guardá-lo no repositório para rodar a cada sprint.
- Ação: na Sprint 4, versionar o roteiro de ponta a ponta (Playwright) junto do app.
