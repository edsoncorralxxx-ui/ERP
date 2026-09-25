# Sprint 0 — Fundação e especificação (B01)

Registrada retroativamente ao adotar Scrum (25/09/2026).

## Objetivo

Transformar o pacote de planejamento em especificação verificável: módulos, domínio, regras, contratos das 32 telas, decisões pendentes.

## Itens entregues

B01.01 a B01.14 — ver `../../backend/backlog-execucao.md` e `../../backend/10-b01-fundacao.md`.

## Review

| Item | Evidência | Aceite do PO |
|---|---|---|
| Especificação B01 (docs 10–15, catálogos, ADRs) | `python3 tools/b01/verificar_b01.py` → OK; 12 testes | Aguardando |
| Planilha das 24 decisões | `decisoes/decisoes-pendencias-B01.xlsx` | Aguardando respostas |

Não feito: comparação dos contratos com o mock (arquivos ausentes no repositório).

## Retrospectiva

- Funcionou: verificador automático tornou os critérios de aceite objetivos.
- Melhorar: o planejamento com o PO aconteceu depois da execução; a partir da Sprint 1, objetivo e itens são aprovados antes.
- Ação: toda sprint começa com o arquivo `sprint-NN.md` em estado "Proposta" até o aceite do PO.
