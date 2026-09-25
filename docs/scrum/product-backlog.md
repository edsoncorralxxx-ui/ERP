# Product Backlog — Renda+ ERP

Ordenado por prioridade. Épicos correspondem às fases do roteiro (`../backend/02-roteiro-e-backlog.md`). Histórias detalhadas só para as próximas sprints; as demais serão refinadas antes de entrarem.

## Épicos

| Ordem | Épico | Fase | Situação |
|---|---|---|---|
| 1 | Fundação de domínio e especificação | B01 | Sprint 0 — em revisão do PO |
| 2 | Base executável (servidor, worker, banco, CI) | B02 | Próximo |
| 3 | Acesso, cadastros e metadados | B03 | Backlog |
| 4 | Arquivos, importação e conferência | B04 | Backlog |
| 5 | Comercial e primeiro fluxo transacional | B05 | Backlog |
| 6 | Financeiro, conciliação e caixa | B06 | Backlog |
| 7 | Engenharia e planejamento | B07 | Backlog |
| 8 | Suprimentos, estoque e terceiros | B08 | Backlog |
| 9 | Produção, qualidade e instalação | B09 | Backlog |
| 10 | Repasses, fiscal e indicadores | B10 | Backlog |
| 11 | Pós-venda | B11 | Backlog |
| 12 | Migração do histórico | B12 | Backlog |
| 13 | Piloto e implantação | B13 | Backlog |
| 14 | Novas áreas analíticas | B14 | Backlog |
| 15 | Previsão, simulação e otimização | B15 | Backlog |
| 16 | IA generativa | B16 | Futuro |

O cliente macOS (Electron + React, janelas SAP B1, design system) entra junto das histórias de cada fluxo a partir do épico 3, e uma história própria de estrutura visual antes do primeiro fluxo com tela.

## Histórias refinadas — épico 2 (B02)

| ID | História | Critério de aceite | Depende de |
|---|---|---|---|
| US-201 | Como time, quero as tecnologias e versões definidas, para construir sobre base suportada | ADR-004 aceito com versões fixadas | PO |
| US-202 | Como time, quero a estrutura do repositório e um ambiente local reproduzível, para qualquer pessoa subir o sistema | README com passos; banco sobe com um comando | US-201 |
| US-203 | Como financeiro, quero que valores nunca percam centavos, para que parcelas e saldos fechem | Money/Quantity com testes de propriedade; soma de parcelas sempre exata | US-202, PD-002 |
| US-204 | Como time, quero que o build falhe se um módulo depender de outro indevidamente, para manter a arquitetura | Teste arquitetural gerado de `modulos.json` | US-202 |
| US-205 | Como usuário, quero que uma operação repetida por queda de conexão não se duplique, para confiar no sistema | Recibo de comando + consulta por ID; teste de resposta perdida | US-202 |
| US-206 | Como sistema, quero eventos e fatos gravados junto com a operação, para indicadores e módulos ficarem consistentes | Outbox + fatos na mesma transação; consumidor idempotente testado | US-205 |
| US-207 | Como time, quero um worker Python que retome tarefas após falha, para processar PDFs com segurança | Tarefa sobrevive a reinício; resultado de lease antigo rejeitado | US-206 |
| US-208 | Como cliente Mac, quero uma API documentada com erros claros em português | OpenAPI publicada; formato de erro padronizado com correlationId | US-205 |
| US-209 | Como time, quero CI executando build, testes, verificador B01 e migrações | Pipeline verde em banco limpo | US-202 |
