# ADR-010 — Regras comerciais, financeiras e operacionais específicas

- Situação: Pendente — premissas B01 registradas
- Data: 2026-09-25
- Pendências relacionadas: PD-001, PD-003, PD-004, PD-005, PD-006, PD-010, PD-014, PD-015, PD-017, PD-018, PD-023 (`docs/backend/b01/pendencias.json`)

## Contexto

Várias regras de negócio dependem de informação do negócio ainda não fornecida.

## Decisão

B01 registra premissas explícitas em docs/backend/b01/pendencias.json (geração de projetos, cancelamento, excedente, estorno parcial, conciliação, categorias, inspeção, garantia, calendário, pesos, faturamento parcial). Premissas orientam testes sintéticos, não operação real.

## Consequências

Cada premissa é uma Policy/Strategy substituível; a troca não altera agregados nem contratos da API.

## Alternativas consideradas

Inventar regras a partir das planilhas (rejeitado).
