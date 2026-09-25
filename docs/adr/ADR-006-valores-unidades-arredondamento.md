# ADR-006 — Valores, unidades e arredondamento

- Situação: Proposto — regras finais pendentes
- Data: 2026-09-25
- Pendências relacionadas: PD-002, PD-007 (`docs/backend/b01/pendencias.json`)

## Contexto

Dinheiro, quantidades e percentuais atravessam Java, Python, banco e JavaScript.

## Decisão

Money em centavos inteiros (long) com moeda explícita, sem ponto flutuante; na API amountCents como string. Quantity com BigDecimal e unidade explícita. Cálculos intermediários em decimal exato; arredondamento só por RoundingPolicy explícita. Divisão de valores por AllocationPolicy que garante soma exata. Premissa B01: HALF_EVEN por linha e resíduo distribuído a partir da primeira parcela.

## Consequências

Todos os cálculos declaram onde arredondam. Premissa pode mudar sem alterar contratos, pois é uma Strategy versionada.

## Alternativas consideradas

double/float para dinheiro (rejeitado); BigDecimal livre sem política (rejeitado).
