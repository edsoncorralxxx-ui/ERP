# ADR-011 — Repasses e fiscal gerencial

- Situação: Pendente de validação
- Data: 2026-09-25
- Pendências relacionadas: PD-012, PD-013 (`docs/backend/b01/pendencias.json`)

## Contexto

Regras de repasse e parâmetros fiscais exigem negócio e contador.

## Decisão

Estrutura versionada com vigência, simulação, confirmação com memória congelada e fechamento; sem valores até validação. Histórico importado, simulação e valor do contador permanecem separados.

## Consequências

B10 pode entregar estrutura e testes sintéticos; operação real bloqueada.

## Alternativas consideradas

Usar percentuais e nomes do histórico como regra vigente (rejeitado).
