# Renda+ ERP

ERP industrial orientado a projetos para a Fourtech/Renda+. App macOS em Electron + React; servidor em Java (Spring Boot) + PostgreSQL; Python para processamento (a partir da sprint de importação).

Situação: **Sprint 5 — contas a receber: recebimento parcial, estorno e contas financeiras** (entregue para Review). Funcionam de ponta a ponta (app → servidor → banco): entrar com usuário e senha, perfis Administrador e Consulta, *Clientes e unidades* (com CNPJ por unidade), *Fornecedores*, *Produtos e serviços* (NCM nos produtos, código da LC 116 nos serviços), *Unidades e categorias*, *Oportunidades e propostas* (revisões preservadas, conversão em pedido), *Pedidos e contratos* (parcelas, confirmação que cria o projeto, os equipamentos e as parcelas a receber uma única vez, cancelamento), *Carteira de projetos*, *Detalhe do projeto*, *Equipamentos*, *Contas a receber* (receber em partes, estornar, histórico), *Contas financeiras* (caixa e bancos, com extrato), *Usuários e permissões* e *Dados da empresa*, com controle de versão, auditoria e comando que não se duplica. Os demais módulos entram a cada sprint (`docs/scrum/product-backlog.md`).

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
- *Vendas → Oportunidades e propostas*: proposta com linhas, **Emitir revisão**, **Nova revisão**, **Converter em pedido**, **Registrar perda**.
- *Vendas → Pedidos e contratos*: pedido com linhas e parcelas (**Dividir o total**), **Confirmar pedido** (cria projeto, equipamentos e parcelas a receber) e **Cancelar pedido**.
- *Projetos → Carteira de projetos* e *Equipamentos → Equipamentos*: projetos gerados pelos pedidos e equipamentos com número de série.
- *Financeiro → Contas a receber*: parcelas dos pedidos confirmados; na ficha do título, **Receber** (conta, data e valor; parcial ou total) e **Estornar** com motivo na aba Recebimentos.
- *Financeiro → Contas financeiras*: o Caixa já vem cadastrado; cadastre as contas bancárias com o saldo inicial e veja o **Extrato** de cada conta.

Atalhos: **Esc** fecha a janela ativa (pergunta antes se houver alterações não salvas); **⌘S** grava; **Alt + letra sublinhada** aciona abas e botões.

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
