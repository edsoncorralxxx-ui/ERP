# Progresso do backend

Registro da execução real do roteiro B01–B16. Desde 25/09/2026 o trabalho segue Scrum (`docs/scrum/`); cada sprint tem seu arquivo em `docs/scrum/sprints/`. Situações: Planejado, Em execução, Entregue para revisão, Concluído, Bloqueado (com causa).

| Fase | Situação | Data | Evidência | Próximo passo |
|---|---|---|---|---|
| B01 — Fundação de domínio, semântica e OOP | Entregue para revisão | 2026-09-25 | `10-b01-fundacao.md`; `python3 tools/b01/verificar_b01.py` → OK; 12 testes do verificador passando | Revisão do usuário; aceite/ajuste de ADR-004, PD-002, PD-007 |
| B02 — Base executável, contratos e persistência | Em execução (Sprints 1 e 2: kernel, plataforma, arquitetura, CI, recibo de comando, outbox, fatos operacionais, OpenAPI) | 2026-09-25 | `docs/scrum/sprints/sprint-01.md`, `sprint-02.md` | Worker Python (US-207) na sprint de importação |
| B03 — Acesso, cadastros e metadados | Em execução (Sprints 2 e 3: sessões, perfis, permissões, clientes, fornecedores, materiais e serviços, unidades e categorias) | 2026-09-25 | `docs/scrum/sprints/sprint-02.md`, `sprint-03.md` | Contas e categorias financeiras (PD-010) |
| B05 — Comercial e primeiro fluxo transacional | Em execução (Sprint 4: propostas com revisões, pedidos, confirmação com projeto, equipamentos e títulos a receber, cancelamento; Sprint 5: baixa parcial e estorno) | 2026-09-27 | `docs/scrum/sprints/sprint-04.md`, `sprint-05.md` | Aditivo; documentos e faturamento (Sprint 6) |
| B06 — Financeiro, conciliação e caixa | Em execução (Sprint 5: recebimentos com alocações, estorno total, contas financeiras, movimentos de caixa e extrato; Sprint 6: documentos de saída vinculados às parcelas, faturado e a faturar) | 2026-09-28 | `docs/scrum/sprints/sprint-05.md`, `sprint-06.md` | Crédito do cliente (PD-004), ajustes, renegociação, contas a pagar e documentos de entrada, conciliação (PD-006), fluxo de caixa |
| B04, B07–B16 | Planejado | — | — | Conforme dependências do roteiro |

## Registro

### 2026-09-25 — B01

- Importado o pacote de planejamento de 25/09/2026 para `docs/` e `docs/backend/`. Cópias idênticas (`.txt` duplicados e o consolidado `PLANO-BACKEND-COMPLETO`) não foram incluídas.
- Entregues módulos (24), dicionário (57 conceitos), eventos (95), indicadores (20), contratos de 32 formulários, modelo de domínio com invariantes numeradas, especificação de 5 comandos/fluxos, exemplos numéricos, ADR-001 a ADR-016 e 24 pendências com premissas.
- Verificação executada: `verificar_b01.py` OK; `unittest` 12/12; formato dos JSON conferido.
- Não executado: nenhuma implementação de servidor (fora do escopo do B01); comparação dos contratos com o código do mock (mock ausente no repositório).
- Divergência registrada: os prompts antigos do Codex usam `docs/backlog-implementacao.md` e `docs/progresso-desenvolvimento.md`. Para o backend passam a valer `docs/backend/progresso.md` e `docs/backend/backlog-execucao.md`, conforme o documento 04.

### 2026-09-25 — Sprint 1 (B02 parcial)

- Servidor Java 21 + Spring Boot 4.1.1, PostgreSQL 16, Flyway; kernel (Money, Quantity, CNPJ), plataforma (status, erros, correlação), auditoria, fatia Dados da empresa com ETag/If-Match.
- App Electron + React + TypeScript com o design system oficial (ADR-017).
- Verificação: 35 testes no servidor, 19 no app, verificador B01; roteiro de demonstração no navegador contra o servidor real.
- Pendente de B02: recibo de comando/idempotência, outbox, fatos operacionais, worker Python, OpenAPI (Sprint 2+).

### 2026-09-25 — Sprint 2 (B02 e B03 parciais)

- ADR-005 aceito (usuários do Renda+, Argon2id, sessão opaca 8 h/12 h, bloqueio); perfis Administrador e Consulta (PD-009).
- Servidor: módulos `acesso` e `cadastros`; recibo de comando, outbox e fatos operacionais na `plataforma`; histórico lido da `auditoria`; migrações V2–V4; contrato `docs/backend/api/openapi.yaml`.
- App: login real (token no processo principal), bloqueio e sessão expirada por cima das janelas, Clientes e unidades, Cliente, Usuários e permissões, Trocar senha.
- Verificação: 56 testes no servidor, 37 no app, verificador B01; roteiro no navegador contra o servidor real.

### 2026-09-25 — Sprint 3 (B03 parcial)

- Planning: equipamentos passam para a Sprint 4; código de material/serviço gerado pelo sistema; unidades e categorias com lista inicial e manutenção pelo Administrador.
- Servidor: papéis do parceiro (V5), fornecedores, unidades de medida, categorias, materiais e serviços com conversões (V6); permissões `item.*` e `catalog.admin`; OpenAPI.
- App: Fornecedores, Materiais e serviços, Unidades e categorias; componentes comuns de lista e ficha.
- Verificação: 66 testes no servidor, 47 no app, verificador B01; roteiro no navegador contra o servidor real.

### 2026-09-27 — Sprint 4 (B05 parcial, B03 projetos/equipamentos)

- Planning: objetivo do roteiro; premissas B01 para PD-001 (um projeto por pedido, um equipamento por unidade), PD-002 (meio-par por linha, resíduo na primeira parcela) e PD-003 (cancelamento sem efeitos), a confirmar na Review.
- Servidor: módulos `comercial` (propostas com revisões, pedidos, confirmação e cancelamento), `projetos` (projeto e equipamentos, `ProjectProvisioningApi`) e `financeiro` (títulos a receber, `TitleIssuanceApi`); APIs públicas de cadastros para cliente/unidade e itens; migração V7; OpenAPI.
- App: Oportunidades e propostas, Pedidos e contratos, Carteira de projetos, Detalhe do projeto, Equipamentos; componentes Seleção (lista suspensa do design system, em todas as telas) e Campo de data.
- Verificação: 74 testes no servidor, 58 no app, verificador B01; roteiro Playwright versionado (`apps/desktop/e2e/`) contra o servidor real.

### 2026-09-28 — Sprint 5 (B05/B06 recebimentos)

- Planning: objetivo do roteiro; premissas B01 para PD-004 (recusar excedente), PD-005 (estorno total) e PD-006 (sem conciliação ainda); PD-009: receber, estornar e manter contas só no Administrador, a confirmar na Review.
- Servidor: liquidação (`Settlement`) com alocações, bloqueio dos títulos em ordem de id, saldo do título sob bloqueio, estorno total idempotente pela liquidação, contas financeiras (caixa semeado) e movimentos de caixa com extrato; migração V9; OpenAPI.
- App: Contas a receber, Título a receber (Receber, Estornar, Recebimentos, Histórico), Contas financeiras (Contas e Extrato); seta para o título nas parcelas do pedido e do projeto.
- Verificação: 81 testes no servidor (inclui as duas baixas concorrentes do B01), 64 no app, verificador B01; roteiros Playwright das Sprints 4 e 5 contra o servidor real e agora também no CI (job `e2e`).

### 2026-09-28 — Sprint 6 (B06 documentos e faturamento)

- Planning aprovado pelo PO: premissa B01 para PD-023 (vínculo com valor por parcela, limitado ao valor da parcela e independente do recebimento); cancelar nota e desfazer vínculo; PD-009: registrar, vincular, classificar e cancelar só no Administrador, a confirmar na Review.
- Servidor: módulo `documentos` (nota de saída, linhas, vínculos às parcelas com o documento e as parcelas bloqueados em ordem de id, cancelamento, classificação, faturado por parcela); porta `TitleCancellationGuard` no financeiro, implementada por documentos, para o pedido faturado não cancelar; `/status` com o dia de negócio; migração V10; OpenAPI.
- App: Documentos e faturamento (lista e ficha com Linhas, Vínculos, Classificação e Histórico; Vincular parcelas); Faturado e A faturar no pedido, no projeto e no título a receber.
- Verificação: 86 testes no servidor (inclui dois vínculos simultâneos numa parcela), 72 no app, verificador B01; roteiros Playwright das Sprints 4, 5 e 6 contra o servidor real, o da Sprint 6 conferindo pela API cada nota criada pela tela.
