# Progresso do backend

Registro da execução real do roteiro B01–B16. Desde 25/09/2026 o trabalho segue Scrum (`docs/scrum/`); cada sprint tem seu arquivo em `docs/scrum/sprints/`. Situações: Planejado, Em execução, Entregue para revisão, Concluído, Bloqueado (com causa).

| Fase | Situação | Data | Evidência | Próximo passo |
|---|---|---|---|---|
| B01 — Fundação de domínio, semântica e OOP | Entregue para revisão | 2026-09-25 | `10-b01-fundacao.md`; `python3 tools/b01/verificar_b01.py` → OK; 12 testes do verificador passando | Revisão do usuário; aceite/ajuste de ADR-004, PD-002, PD-007 |
| B02 — Base executável, contratos e persistência | Em execução (Sprints 1 e 2: kernel, plataforma, arquitetura, CI, recibo de comando, outbox, fatos operacionais, OpenAPI) | 2026-09-25 | `docs/scrum/sprints/sprint-01.md`, `sprint-02.md` | Worker Python (US-207) na sprint de importação |
| B03 — Acesso, cadastros e metadados | Em execução (Sprints 2 e 3: sessões, perfis, permissões, clientes, fornecedores, materiais e serviços, unidades e categorias) | 2026-09-25 | `docs/scrum/sprints/sprint-02.md`, `sprint-03.md` | Equipamentos com o pedido (Sprint 4); contas e categorias financeiras |
| B04–B16 | Planejado | — | — | Conforme dependências do roteiro |

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
