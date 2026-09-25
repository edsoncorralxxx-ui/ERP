# ADR-012 — Indicadores, classificação e habilitação de modelos

- Situação: Proposto
- Data: 2026-09-25
- Pendências relacionadas: PD-022, PD-024 (`docs/backend/b01/pendencias.json`)

## Contexto

Indicadores e classificações precisam de definição única e histórico; modelos precisam de critério de habilitação.

## Decisão

IndicatorDefinition imutável por versão, com fórmula declarativa validada no servidor, política de ausentes UNKNOWN e denominador zero NOT_CALCULABLE. Classificação confirmada separada de sugestão, com revisão de regra. Modelos com estados dados insuficientes/experimental/validado/suspenso por versão; baseline obrigatório; sem limiar universal.

## Consequências

Catálogo inicial em docs/backend/b01/indicadores.json.

## Alternativas consideradas

Fórmulas por tela; SQL enviado pela interface (rejeitado).
