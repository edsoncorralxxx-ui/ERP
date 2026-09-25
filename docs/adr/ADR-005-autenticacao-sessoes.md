# ADR-005 — Autenticação, sessões e perfis

- Situação: Pendente
- Data: 2026-09-25
- Pendências relacionadas: PD-008, PD-009 (`docs/backend/b01/pendencias.json`)

## Contexto

Mecanismo depende de rede, hospedagem e administração disponíveis.

## Decisão

Não decidido. Requisitos já fixados: TLS, autorização no servidor por ação e objeto, sessão com expiração e revogação, nenhum segredo embarcado no Electron, auditoria com ator.

## Consequências

B03 fica bloqueado quanto ao mecanismo; contratos B01 usam um ator autenticado abstrato.

## Alternativas consideradas

Credenciais caseiras sem política de sessão (rejeitado).
