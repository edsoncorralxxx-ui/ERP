# Renda+ ERP

ERP industrial orientado a projetos para a Fourtech/Renda+. App macOS em Electron + React; servidor em Java (Spring Boot) + PostgreSQL; Python para processamento (a partir da sprint de importação).

Situação: **Sprint 1 — esqueleto do sistema.** Funciona de ponta a ponta a janela *Dados da empresa* (app → servidor → banco), com controle de versão, validação e auditoria. Os demais módulos entram a cada sprint (`docs/scrum/product-backlog.md`).

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
git checkout claude/kind-thompson-qidwjm
```

Para receber atualizações depois: `git pull` dentro da pasta `ERP`.

### 4. Iniciar o servidor (Terminal 1)

```bash
cd ~/Documents/ERP/backend/java
./mvnw spring-boot:run
```

Pronto quando aparecer `Started RendaErpApplication`. Teste em outro Terminal: `curl http://localhost:8080/api/v1/status`. O servidor cria as tabelas sozinho na primeira execução.

### 5. Abrir o app (Terminal 2)

```bash
cd ~/Documents/ERP/apps/desktop
npm install          # só na primeira vez
npm run dev
```

A janela do Renda+ ERP abre. No rodapé deve aparecer **Conectado · servidor 0.1.0-SNAPSHOT**. Em *Módulos → Administração → Dados da empresa* você edita e salva os dados.

### Rodar os testes

```bash
# servidor (usa o banco renda_test local; com Docker, basta ./mvnw verify)
cd backend/java
RENDA_TEST_JDBC_URL=jdbc:postgresql://localhost:5432/renda_test ./mvnw verify

# app
cd apps/desktop && npm test

# especificação B01
python3 tools/b01/verificar_b01.py
```

### Configurações do servidor

| Variável | Padrão | Uso |
|---|---|---|
| `RENDA_DB_URL` | `jdbc:postgresql://localhost:5432/renda` | endereço do banco |
| `RENDA_DB_USER` / `RENDA_DB_PASSWORD` | `renda` / `renda` | credenciais do banco |
| `RENDA_SERVER_ADDRESS` | `127.0.0.1` | só a própria máquina; use `0.0.0.0` para outros computadores da rede |
| `RENDA_SERVER_PORT` | `8080` | porta da API |

O app procura o servidor em `http://localhost:8080` (pode ser alterado com `RENDA_SERVER_URL`).

## Estrutura

```text
apps/desktop/      app do Mac (Electron + React + TypeScript)
backend/java/      servidor (Spring Boot, módulos por pacote, migrações Flyway)
infra/local/       banco via Docker (opcional)
docs/              plano funcional, backend (B01–B16), ADRs, Scrum
decisoes/          planilha das decisões pendentes
tools/b01/         verificador da especificação
```

## Documentação

- `docs/scrum/` — processo, backlog e sprints (a Sprint 1 está em `docs/scrum/sprints/sprint-01.md`).
- `docs/backend/10-b01-fundacao.md` — especificação de domínio.
- `docs/adr/` — decisões de arquitetura.

Precedência: instruções do usuário → ADRs aceitos → plano funcional → detalhamento do backend → mock e arquivos históricos.
