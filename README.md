# Renda+ ERP

ERP industrial orientado a projetos para a Fourtech/Renda+. App macOS em Electron + React; servidor em Java (Spring Boot) + PostgreSQL; Python para processamento (a partir da sprint de importação).

Situação: **Sprint 11 — CRM: prospecção, interações e funil de oportunidades** (entregue para Review). Funcionam de ponta a ponta (app → servidor → banco): entrar com usuário e senha, perfis Administrador e Consulta, *Clientes e unidades* (com CNPJ por unidade), *Fornecedores*, *Produtos e serviços* (NCM nos produtos, código da LC 116 nos serviços), *Unidades e categorias*, *Oportunidades e propostas* (revisões preservadas, conversão em pedido), *Pedidos e contratos* (parcelas, confirmação que cria o projeto, os equipamentos e as parcelas a receber uma única vez, cancelamento), *Carteira de projetos*, *Detalhe do projeto*, *Equipamentos*, *Contas a receber* (receber em partes, estornar, histórico), *Contas financeiras* (caixa e bancos, com extrato), *Notas a emitir* e *Documentos e faturamento* (regime de caixa: a nota do pedido fatura o recebido que ainda não tem nota, sem criar cobrança; nota de produto e nota de serviço separadas), *Impostos gerenciais* (receita por competência, simulação do Simples Nacional, conferência do contador e fechamento), *Contas a pagar* (títulos com parcelas, pagamento parcial com saída na conta, estorno, cancelamento e o DAS gerado pela conferência do contador), *Categorias financeiras*, *Fluxo de caixa* (realizado e previsto por mês, com a composição de cada valor) e transferência entre contas, *BOM — composição de custos* (BOM do modelo com submontagens, editável direto, com a árvore da estrutura e o diagrama em árvore; carga da BOM do arquivo JSON com prévia), *Modelos de equipamento*, a BOM do equipamento (cópia aplicada, ajustável e reaplicável com motivo) e o custo planejado com a margem prevista no *Detalhe do projeto*, *CRM* no desenho do SAP Business One (*Prospecção* com estrelas e carga da lista, interações com próxima ação, *Oportunidades* pelas etapas do funil com percentual de fechamento e valor ponderado, conversão em cliente, *Funil de vendas*, *Agenda do CRM* e *Etapas do funil*; toda proposta pertence a uma oportunidade), *Usuários e permissões* e *Dados da empresa*, com controle de versão, auditoria e comando que não se duplica. Os demais módulos entram a cada sprint (`docs/scrum/product-backlog.md`).

## Rodar no seu Mac

### 1. Instalar as ferramentas (uma vez)

Com o [Homebrew](https://brew.sh):

```bash
brew install openjdk@21 node@22 postgresql@16
brew services start postgresql@16
```

Essas três versões não entram no PATH automaticamente. Rode uma vez e abra um novo Terminal:

```bash
echo 'export PATH="$(brew --prefix)/opt/openjdk@21/bin:$(brew --prefix)/opt/node@22/bin:$(brew --prefix)/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
```

Confira com `java -version` (21), `node -v` (22) e `psql --version` (16).

Não é preciso instalar Maven: o projeto usa o Maven Wrapper (`./mvnw`).

> Alternativa ao PostgreSQL do Homebrew: com o Docker Desktop, `docker compose -f infra/local/docker-compose.yml up -d` sobe o banco já configurado e pula o passo 2.

### 2. Criar o banco (uma vez)

Antes, confirme que o PostgreSQL está rodando:

```bash
pg_isready          # esperado: "/tmp:5432 - accepting connections"
```

Se não estiver, veja **Problemas comuns** no fim desta seção. Depois:

```bash
createuser renda --pwprompt        # digite a senha: renda
createdb renda --owner renda
createdb renda_test --owner renda  # usado pelos testes automáticos
```

### 3. Baixar o projeto

```bash
cd ~/Documents
git clone https://github.com/edsoncorralxxx-ui/ERP.git
cd ERP
```

O clone já traz a branch principal do repositório, com a sprint mais recente. Para receber atualizações depois: `git pull` dentro da pasta `ERP`.

### 4. Iniciar o servidor (Terminal 1)

Na **primeira vez**, informe o primeiro administrador (troque o usuário e a senha pelos seus; a senha precisa de pelo menos 10 caracteres):

```bash
cd ~/Documents/ERP/backend/java
RENDA_BOOTSTRAP_ADMIN_USER=edson RENDA_BOOTSTRAP_ADMIN_PASSWORD='uma-senha-forte' ./mvnw spring-boot:run
```

Pronto quando aparecer `Started RendaErpApplication` e `Primeiro administrador criado: edson`. Isso só acontece enquanto o banco não tem nenhum usuário; não existe senha padrão. **Nas próximas vezes**, basta:

```bash
cd ~/Documents/ERP/backend/java
./mvnw spring-boot:run
```

Teste em outro Terminal: `curl http://localhost:8080/api/v1/status`. O servidor cria e atualiza as tabelas sozinho.

### 5. Abrir o app (Terminal 2)

```bash
cd ~/Documents/ERP/apps/desktop
npm install          # só na primeira vez
npm run dev
```

A janela do Renda+ ERP abre na tela de login: entre com o administrador criado no passo 4. No rodapé aparecem o seu nome e perfil e **Servidor conectado**. Pelo menu lateral:

- *Cadastros → Clientes e unidades*: lista, **Novo**, ficha com Unidades, Contatos e Histórico, Inativar.
- *Administração → Usuários e permissões*: crie outros usuários (Administrador ou Consulta) e redefina senhas.
- *Configurações → Dados da empresa*: dados cadastrais da empresa.
- *CRM → Prospecção*: empresas-alvo com estrelas (vazio = desconhecido), etapa e próxima ação; **Importar lista** (JSON, com prévia: erro não entra, nome repetido ou parecido só avisa; exemplo em `docs/scrum/sprints/exemplos/prospeccao-exemplo.json`). Na ficha: **Registrar interação** (tipo, resumo e próxima ação), **Abrir oportunidade**, **Converter em cliente** e **Descartar** com motivo.
- *CRM → Oportunidades*: a oportunidade de venda como no SAP B1 — abas Potencial (valor, previsão, interesse e **valor ponderado** = potencial × % da etapa), Etapas, Interações, Propostas, Concorrentes, Resumo e Histórico. A próxima ação é obrigatória enquanto aberta. **Mudar etapa**, **Registrar interação**, **Nova proposta** (precisa do cliente) e **Marcar como perdida** com o motivo da lista. Emitir a proposta leva à etapa Proposta; converter em pedido deixa a oportunidade **Ganha**.
- *CRM → Funil de vendas*: abertas por etapa com potencial e ponderado, ganhas e perdidas no período (com os motivos) e a conversão por etapa ("Não calculável" quando ninguém entrou). *CRM → Agenda do CRM*: próximas ações vencidas, de hoje, dos próximos 7 dias e depois. *CRM → Etapas do funil*: o Administrador muda o nome e o % de fechamento.
- *Vendas → Propostas*: proposta com linhas, **Emitir revisão**, **Nova revisão**, **Converter em pedido**, **Registrar perda** (com o motivo da lista, que também perde a oportunidade quando ela não tem outra proposta aberta). Toda proposta mostra a oportunidade dela.
- *Vendas → Pedidos e contratos*: pedido com linhas e parcelas (**Dividir o total**), **Confirmar pedido** (cria projeto, equipamentos e parcelas a receber) e **Cancelar pedido**.
- *Projetos → Carteira de projetos* e *Equipamentos → Equipamentos*: projetos gerados pelos pedidos e equipamentos com número de série.
- *Financeiro → Contas a receber*: parcelas dos pedidos confirmados; na ficha do título, **Receber** (conta, data e valor; parcial ou total) e **Estornar** com motivo na aba Recebimentos.
- *Financeiro → Contas a pagar*: **Novo** (beneficiário, categoria de despesa, competência, documento do fornecedor, total e parcelas com **Dividir o total**; cada parcela vira um título CP); na ficha, **Pagar** (conta, data e valor; parcial ou total — a janela avisa se a conta vai ficar negativa), **Estornar** na aba Pagamentos e **Cancelar título** (só o manual sem pagamento). O DAS aparece aqui quando a conferência do contador é registrada.
- *Financeiro → Fluxo de caixa*: um mês por coluna — realizado nos meses passados, realizado até hoje, **Em atraso** e previsto no mês corrente, previsto nos futuros — com o saldo final levado ao mês seguinte; filtros de conta, categoria e período (MM/AAAA). Clique num valor para ver os títulos ou movimentos que o formam, com a seta para cada um. Pendências (ex.: imposto de competência não conferida) aparecem embaixo.
- *Financeiro → Contas financeiras*: **Transferir** entre as suas contas (o total não muda); no extrato, **Estornar** a transferência com motivo.
- *Financeiro → Categorias financeiras*: as categorias de despesa e receita; o Administrador cadastra, renomeia e inativa.
- *Financeiro → Contas financeiras*: o Caixa já vem cadastrado; cadastre as contas bancárias com o saldo inicial e veja o **Extrato** de cada conta.
- *Faturamento → Notas a emitir*: os pedidos com recebimento que ainda não tem nota, com quanto é produto (NF-e) e quanto é serviço (NFS-e). Pela seta, a nota abre com o pedido; escolha o **Tipo da nota** (produto ou serviço) e o sistema monta as linhas desse tipo e as parcelas; emita a nota no portal da SEFAZ (produto) ou da prefeitura (serviço) e registre aqui número, série e emissão. O valor pode ser menor que o a emitir do tipo (nota parcial), nunca maior.
- *Faturamento → Documentos e faturamento*: as notas registradas, com o pedido; **Cancelar documento** (com motivo) devolve o valor às notas a emitir. O pedido, o projeto e o título mostram o faturado e o que falta emitir.
- *Fiscal → Impostos gerenciais*: as competências do ano com a receita das notas (produto e serviço), a simulação, o valor do contador e a diferença. Na competência: **Simular** (Simples Nacional, Anexo II para produto e III para serviço, com a memória do cálculo), aba *RBT12* para **Informar RBT12** (o que o contador usou no PGDAS-D, enquanto o Renda+ não tem 12 meses de notas), aba *Conferência* para **Registrar conferência** (valor e vencimento do contador; cria o título do DAS em Contas a pagar, e reconferir substitui o DAS ainda não pago), **Fechar competência** (as notas dela deixam de poder ser registradas ou canceladas) e **Reabrir competência** com motivo. A seta de *Parâmetros* abre as faixas e a **Nova revisão**.

Atalhos: **Esc** fecha a janela ativa (pergunta antes se houver alterações não salvas); **⌘S** grava; **Alt + letra sublinhada** aciona abas e botões; **⌥⌘ + setas** (ou as ferramentas da barra superior e o menu *Dados*) vão ao primeiro, anterior, próximo e último registro, pela lista de onde a ficha foi aberta.

*Arquivo → Bloquear tela* pede a senha de novo sem fechar as janelas; *Arquivo → Trocar senha* troca a sua senha.

**Esqueceu a senha do único administrador?** Peça a outro administrador para redefinir. Se não houver outro, no Terminal: `psql renda -c "delete from user_session; delete from app_user;"` e reinicie o servidor com as variáveis do passo 4 — isso apaga todos os usuários e sessões; clientes, fornecedores, itens, empresa e auditoria continuam.

### Problemas comuns

**`createuser: erro: a conexão com o servidor no soquete "/tmp/.s.PGSQL.5432" falhou`** — o PostgreSQL não está rodando.

1. `brew services list` — veja a situação de `postgresql@16`.
2. `brew services restart postgresql@16`, espere alguns segundos e rode `pg_isready`.
3. Se continuar, leia o log: `tail -20 "$(brew --prefix)/var/log/postgresql@16.log"`
   - `Address already in use`: outro PostgreSQL (ex.: Postgres.app) já usa a porta 5432; feche-o.
   - `does not exist` / `is not a database cluster`: inicialize com `initdb --locale=C -E UTF-8 "$(brew --prefix)/var/postgresql@16"` e repita o passo 2.
   - `lock file "postmaster.pid" already exists`: `rm "$(brew --prefix)/var/postgresql@16/postmaster.pid"` e repita o passo 2.

**`java: command not found` ou versão errada** — refaça o comando do PATH do passo 1 e abra um novo Terminal.

### Rodar os testes

```bash
# servidor (usa o banco renda_test local; com Docker, basta ./mvnw verify)
cd backend/java
RENDA_TEST_JDBC_URL=jdbc:postgresql://localhost:5432/renda_test ./mvnw verify

# app
cd apps/desktop && npm test

# especificação B01
python3 tools/b01/verificar_b01.py

# roteiro de ponta a ponta no navegador (com o servidor do passo 4 rodando; usa o administrador informado)
cd apps/desktop && RENDA_E2E_USER=edson RENDA_E2E_PASSWORD='uma-senha-forte' npm run e2e
```

Na primeira vez, o roteiro de ponta a ponta precisa do navegador do Playwright: `npx playwright install chromium`. Ele cria clientes, itens, propostas, pedidos, contas e recebimentos de teste no banco em uso — prefira rodá-lo num banco de testes. No GitHub, o job `e2e` do CI roda os mesmos roteiros num banco vazio a cada push e guarda as capturas de tela.

### Configurações do servidor

| Variável | Padrão | Uso |
|---|---|---|
| `RENDA_DB_URL` | `jdbc:postgresql://localhost:5432/renda` | endereço do banco |
| `RENDA_DB_USER` / `RENDA_DB_PASSWORD` | `renda` / `renda` | credenciais do banco |
| `RENDA_SERVER_ADDRESS` | `127.0.0.1` | só a própria máquina; use `0.0.0.0` para outros computadores da rede |
| `RENDA_SERVER_PORT` | `8080` | porta da API |
| `RENDA_BOOTSTRAP_ADMIN_USER` / `RENDA_BOOTSTRAP_ADMIN_PASSWORD` | — | primeiro administrador, usado só enquanto não há nenhum usuário |
| `RENDA_FISCAL_REVENUE_START` | `2026-09` | primeira competência com toda a receita no Renda+; antes dela o RBT12 é o informado pelo contador |

O app procura o servidor em `http://localhost:8080` (pode ser alterado com `RENDA_SERVER_URL`).

## Estrutura

```text
apps/desktop/      app do Mac (Electron + React + TypeScript)
backend/java/      servidor (Spring Boot, módulos por pacote, migrações Flyway)
infra/local/       banco via Docker (opcional)
design-system/     design system Renda+ ERP (fonte única da interface)
docs/              plano funcional, backend (B01–B16), ADRs, Scrum; contrato da API em docs/backend/api/openapi.yaml
decisoes/          planilha das decisões pendentes
tools/b01/         verificador da especificação
```

## Design system

Toda a interface segue `design-system/` (guia em `design-system/README.md`, tokens, componentes `rp-*` e ícones). Antes de criar uma tela, leia o guia e o `README.md` do componente. Não crie cores, fontes ou sombras fora dos tokens. Veja também `CLAUDE.md` e o ADR-017.

## Documentação

- `docs/scrum/` — processo, backlog e sprints (a Sprint 1 está em `docs/scrum/sprints/sprint-01.md`).
- `docs/backend/10-b01-fundacao.md` — especificação de domínio.
- `docs/adr/` — decisões de arquitetura.

Precedência: instruções do usuário → ADRs aceitos → plano funcional → detalhamento do backend → mock e arquivos históricos.
