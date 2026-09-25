# ADR-004 — Framework, versões e banco

- Situação: Proposto — a registrar antes de B02
- Data: 2026-09-25

## Contexto

B02 precisa de base executável. Documentos propõem Spring Boot modular e PostgreSQL, sem versões fixadas.

## Decisão

Proposta: Java LTS com Spring Boot em monólito modular (Spring Modulith opcional para verificar limites), PostgreSQL, migrações versionadas (Flyway ou equivalente), Testcontainers para testes com banco real, Python com dependências fixadas por lock. Versões serão escolhidas em B02 conferindo suporte e compatibilidade na documentação oficial.

## Consequências

Até a aceitação, B01 permanece independente de framework: o modelo de domínio não usa anotações de persistência.

## Alternativas consideradas

Microserviços por módulo; banco por área; SQLite central.
