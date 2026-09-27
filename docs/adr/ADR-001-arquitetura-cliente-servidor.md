# ADR-001 — Arquitetura cliente-servidor

- Situação: Aceito — definido pelo usuário
- Data: 2026-09-21

## Contexto

O ERP é novo para a Fourtech/Renda+ e deve atender vários usuários com dados centralizados. O plano original previa JavaFX/SQLite em um único Mac offline.

## Decisão

Cliente macOS em Electron + React. Servidor com Java (API, regras, transações, persistência) e Python (processamento documental e analítico). O cliente não acessa banco nem Python diretamente.

## Consequências

Gravações dependem de conexão ao servidor; servidor em rede local pode operar sem internet externa. Escrita offline com sincronização fica fora (ADR-015). O Mac não precisa de Java/Python instalados.

## Alternativas consideradas

JavaFX + SQLite local (superado por decisão do usuário).
