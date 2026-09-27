# ADR-009 — Custo, estoque e retroatividade

- Situação: Proposto — detalhes pendentes
- Data: 2026-09-25
- Pendências relacionadas: PD-011, PD-016 (`docs/backend/b01/pendencias.json`)

## Contexto

O plano fixa custo médio móvel e separação entre propriedade e local.

## Decisão

Custo médio móvel por item; disponível nunca negativo; propriedade distinta de localização; cada custo entra uma vez pela origem. Retroatividade, estoque negativo e devolução ao custo de origem ficam pendentes.

## Consequências

B08 começa pela especificação desses pontos antes de calcular.

## Alternativas consideradas

Custo por PEPS/UEPS (não solicitado).
