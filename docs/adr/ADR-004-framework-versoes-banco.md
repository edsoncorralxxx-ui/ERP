# ADR-004 — Framework, versões e banco

- Situação: Aceito pelo PO em 25/09/2026 (Sprint 1)
- Data: 2026-09-25

## Contexto

A Sprint 1 cria a base executável. O PO aceitou Java + Spring Boot + PostgreSQL + Electron/React + Python e pediu para rodar o servidor localmente no próprio Mac.

## Decisão

| Camada | Escolha | Versão |
|---|---|---|
| Linguagem do servidor | Java (LTS) | 21 |
| Framework | Spring Boot, monólito modular | 4.1.x (4.1.1 na Sprint 1) |
| Build | Maven com Maven Wrapper (`./mvnw`, sem instalar Maven) | 3.9.x |
| Banco | PostgreSQL | 16 |
| Migrações | Flyway (gerenciado pelo Spring Boot) | 12.x |
| Acesso a dados | Spring JDBC (`JdbcClient`), sem JPA no domínio | — |
| Testes | JUnit 6, Testcontainers 2 ou PostgreSQL local via variável `RENDA_TEST_JDBC_URL`, ArchUnit | gerenciados pelo Boot / 1.5.x |
| App do Mac | Electron + React + TypeScript, Vite | Electron 38+, React 19, Vite 8 (fixados no package-lock) |
| Python | 3.11+, uv | quando a importação precisar |
| CI | GitHub Actions | — |

O PO aprovou "Spring Boot 3". Na implementação, a linha 3.5 já estava fora do suporte gratuito (setembro/2026) e a linha estável atual é a 4.1. Adotada a 4.1.x, mesma família, com suporte vigente.

**Execução local no Mac:** servidor Java e PostgreSQL rodam na máquina do usuário. O PostgreSQL pode vir do Homebrew/Postgres.app ou do Docker Desktop. Instruções no `README.md`.

## Consequências

- O domínio não usa anotações de persistência; o JDBC fica nos adaptadores.
- Os testes de banco rodam contra PostgreSQL real: Testcontainers quando há Docker; senão, um PostgreSQL local indicado por variável de ambiente.
- Atualizações de versão menor são feitas por PR com CI verde; versão maior exige novo ADR.

## Alternativas consideradas

Spring Boot 3.5 (fora do suporte gratuito); JPA/Hibernate (acopla o domínio ao ORM); Gradle (Maven é suficiente e mais simples para o time).
