# Backlog de execução do backend

Detalhamento executável das fases do roteiro (`02-roteiro-e-backlog.md`). Estimativas só depois da fundação medida.

## B01 — Fundação de domínio, semântica e OOP

| Item | Entrega | Situação | Evidência |
|---|---|---|---|
| B01.01 | Importar documentação canônica para `docs/backend` e `docs/` | Concluído | commit de importação |
| B01.02 | Módulos, responsabilidades e dependências acíclicas | Entregue para revisão | doc 11, `b01/modulos.json`, ADR-016 |
| B01.03 | Value Objects (Money, Quantity, Rate, períodos, EntityRef) e políticas | Entregue para revisão | doc 12 §1 |
| B01.04 | Agregados SalesOrder, FinancialTitle, Settlement com invariantes e estados | Entregue para revisão | doc 12 §2–4 |
| B01.05 | OperationalFact, IndicatorDefinition, AnalysisRun | Entregue para revisão | doc 12 §5–6 |
| B01.06 | Especificação de confirmação, cancelamento, baixa, estorno e qualidade | Entregue para revisão | doc 13 |
| B01.07 | Exemplos numéricos pedido/faturamento/recebimento/custo/pagamento | Entregue para revisão | doc 14 |
| B01.08 | Dicionário empresarial | Entregue para revisão | `b01/conceitos.json` |
| B01.09 | Contratos dos 32 formulários | Entregue para revisão | `b01/formularios.json` |
| B01.10 | Catálogos de eventos e indicadores iniciais | Entregue para revisão | `b01/eventos.json`, `b01/indicadores.json` |
| B01.11 | Classificação e qualidade de dados | Entregue para revisão | doc 15 §3–4, doc 12 §7 |
| B01.12 | ADRs 001–016 | Entregue para revisão | `docs/adr/` |
| B01.13 | Pendências com premissa, bloqueio e responsável | Entregue para revisão | `b01/pendencias.json` |
| B01.14 | Verificador automático e testes | Concluído | `tools/b01/` |

## B02 — Base executável (próxima)

| Item | Entrega | Depende de | Situação |
|---|---|---|---|
| B02.01 | Aceitar ADR-004 e fixar versões (Java, Spring Boot, PostgreSQL, Python) | revisão do usuário | Planejado |
| B02.02 | Estrutura `backend/java`, `backend/python`, `contracts/`, `infra/local` | B02.01 | Planejado |
| B02.03 | Kernel: Money/Quantity/políticas com testes de propriedade (INV-MON-*, INV-QTY-*) | B02.02 | Planejado |
| B02.04 | Teste arquitetural de módulos a partir de `b01/modulos.json` | B02.02 | Planejado |
| B02.05 | Migrações iniciais: command_receipt, outbox_event, consumer_receipt, operational_fact, processing_job, audit_event | B02.02, PD-007 | Planejado |
| B02.06 | Tarefa Python durável de demonstração com lease/geração | B02.05 | Planejado |
| B02.07 | API pública/interna mínima com OpenAPI e erros padronizados | B02.05 | Planejado |
| B02.08 | CI com build, testes, verificador B01 e migrações em banco limpo | B02.02 | Planejado |
