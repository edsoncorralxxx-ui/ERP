# ADR-002 — Orientação a objetos e padrões de projeto

- Situação: Aceito — definido pelo usuário
- Data: 2026-09-25

## Contexto

O usuário solicitou OOP e design patterns no backend Java e Python.

## Decisão

Aplicar o documento 06: agregados que protegem invariantes, Value Objects imutáveis, ports/adapters, Strategy/Policy/Pipeline/Outbox onde houver responsabilidade concreta. Composição antes de herança. O modelo B01 está em docs/backend/12-b01-modelo-de-dominio.md.

## Consequências

Revisões de código exigem explicar a responsabilidade de cada classe e a invariante protegida. Não adotar microserviço por entidade, event sourcing global, Service Locator, Singleton mutável ou classe 'MotorERP'.

## Alternativas consideradas

Anemic domain com regras em serviços e controllers; herança profunda por tipo de parceiro.
