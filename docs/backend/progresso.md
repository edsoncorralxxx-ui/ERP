# Progresso do backend

Registro da execução real do roteiro B01–B16. Situações: Planejado, Em execução, Entregue para revisão, Concluído, Bloqueado (com causa).

| Fase | Situação | Data | Evidência | Próximo passo |
|---|---|---|---|---|
| B01 — Fundação de domínio, semântica e OOP | Entregue para revisão | 2026-09-25 | `10-b01-fundacao.md`; `python3 tools/b01/verificar_b01.py` → OK; 12 testes do verificador passando | Revisão do usuário; aceite/ajuste de ADR-004, PD-002, PD-007 |
| B02 — Base executável, contratos e persistência | Planejado (aguarda ADR-004) | — | — | Escolher versões e montar Java/Python/banco/CI |
| B03–B16 | Planejado | — | — | Conforme dependências do roteiro |

## Registro

### 2026-09-25 — B01

- Importado o pacote de planejamento de 25/09/2026 para `docs/` e `docs/backend/`. Cópias idênticas (`.txt` duplicados e o consolidado `PLANO-BACKEND-COMPLETO`) não foram incluídas.
- Entregues módulos (24), dicionário (57 conceitos), eventos (95), indicadores (20), contratos de 32 formulários, modelo de domínio com invariantes numeradas, especificação de 5 comandos/fluxos, exemplos numéricos, ADR-001 a ADR-016 e 24 pendências com premissas.
- Verificação executada: `verificar_b01.py` OK; `unittest` 12/12; formato dos JSON conferido.
- Não executado: nenhuma implementação de servidor (fora do escopo do B01); comparação dos contratos com o código do mock (mock ausente no repositório).
- Divergência registrada: os prompts antigos do Codex usam `docs/backlog-implementacao.md` e `docs/progresso-desenvolvimento.md`. Para o backend passam a valer `docs/backend/progresso.md` e `docs/backend/backlog-execucao.md`, conforme o documento 04.
