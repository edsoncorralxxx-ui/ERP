# ADR-005 — Autenticação, sessões e perfis

- Situação: Aceito pelo PO em 25/09/2026 (planning da Sprint 2)
- Data: 2026-09-25
- Pendências relacionadas: PD-008 (respondida), PD-009 (premissa aceita) — `docs/backend/b01/pendencias.json`

## Contexto

Mecanismo depende de rede, hospedagem e administração disponíveis. Requisitos já fixados no B01: TLS, autorização no servidor por ação e objeto, sessão com expiração e revogação, nenhum segredo embarcado no Electron, auditoria com ator.

## Decisão

**Identidade (PD-008):** usuários do próprio Renda+, guardados no servidor.

- Login por nome de usuário e senha. Senha com no mínimo 10 caracteres, guardada só como hash **Argon2id** (parâmetros do Spring Security Crypto para 2023: 16 MB de memória, 2 iterações, paralelismo 1, sal aleatório). A senha nunca volta na API, nos logs nem na auditoria.
- **Sessão opaca no servidor:** o login devolve um token aleatório de 256 bits; o banco guarda só o hash SHA-256 dele. Expira após **8 h sem uso** ou **12 h no total**. É revogada ao sair, ao bloquear a tela, ao trocar ou redefinir a senha e ao desativar o usuário.
- **Bloqueio:** 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos. A resposta de login não diz se o usuário existe.
- **Electron:** o token fica no processo principal (memória), nunca no React nem em disco; a ponte só repassa as chamadas. O app não guarda senha.
- **Primeiro administrador:** criado por comando no servidor (`RENDA_BOOTSTRAP_ADMIN_USER` e `RENDA_BOOTSTRAP_ADMIN_PASSWORD` na primeira execução, só quando não existe nenhum usuário). Não há senha padrão.
- TLS: obrigatório quando o servidor for acessado por outros computadores (ADR-007); em `localhost` no desenvolvimento, HTTP.

**Perfis (PD-009) — premissa desta fase:** dois perfis.

| Perfil | Permissões |
|---|---|
| Administrador | Todas, inclusive `user.admin` (usuários e perfis) |
| Consulta | Só leitura (`*.read`) |

As permissões são por ação (`partner.read`, `partner.create`, `partner.update`, `partner.deactivate`, `company.update`, `user.admin`...), conferidas no servidor em cada comando; a negativa é registrada na auditoria. Novos perfis (Comercial, Financeiro etc.) entram com seus módulos; alçadas por valor e separação de funções continuam pendentes até o piloto (B13).

## Consequências

- Todas as rotas da API, exceto `/api/v1/status` e `/api/v1/session` (login), exigem sessão válida (401 sem ela).
- A auditoria passa a gravar o usuário real no lugar de `desenvolvimento-local`.
- Login com conta Microsoft/Google (OIDC) pode ser acrescentado depois sem mudar a autorização, que já é por permissão.

## Alternativas consideradas

- Credenciais caseiras sem política de sessão (rejeitado).
- OIDC com Microsoft 365/Google Workspace já nesta sprint (adiado: exige configurar o provedor antes).
- JWT sem estado (rejeitado: revogação imediata fica mais difícil; a sessão opaca atende).
- Oito perfis do documento 01 (adiado por decisão do PO: começar com Administrador e Consulta).
