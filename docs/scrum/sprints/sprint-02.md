# Sprint 2 — Login, permissões e auditoria + Clientes e unidades

Situação: **Em execução.** Planning aprovado pelo PO em 25/09/2026.

## Objetivo

Entrar no Renda+ com usuário e senha de verdade, cadastrar clientes com suas unidades e contatos e ver quem alterou o quê — com o servidor negando o que o perfil do usuário não permite.

## Decisões do planning

| Pendência | Decisão | Quem decidiu |
|---|---|---|
| PD-008 / ADR-005 — mecanismo de autenticação | Usuários do próprio Renda+ guardados no servidor: senha com hash Argon2id; sessão opaca no servidor com expiração por inatividade (8 h) e absoluta (12 h), revogável (sair, desativar usuário, trocar senha); bloqueio temporário após 5 tentativas erradas. O token fica no processo principal do Electron, nunca no React. Primeiro administrador criado por comando no servidor, sem senha padrão. Login com conta Microsoft/Google (OIDC) fica como evolução. | PO — aceito (ADR-005) |
| PD-009 — perfis e permissões | Premissa desta fase: **dois perfis, Administrador (tudo) e Consulta (só leitura)**, com permissões por ação. Os demais perfis entram com seus módulos; alçadas por valor e separação de funções continuam pendentes até o piloto. | PO — escolheu 2 perfis em vez dos 8 sugeridos |

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S2-01 | ADR-005 aceito com o mecanismo acima | ADR com decisão, parâmetros de sessão e alternativas; PD-008 respondida |
| S2-02 | Usuários, perfis e permissões no servidor | API devolve 401 sem sessão e 403 para ação não permitida (e registra a negativa); senha nunca volta na API nem nos logs; bloqueio após 5 tentativas; sessão expirada ou revogada deixa de valer na hora |
| S2-03 | Login real no app | A tela de abertura autentica no servidor; nome e perfil do usuário no rodapé; Sair e Bloquear tela encerram a sessão; sessão expirada volta ao login com aviso, sem perder o que está digitado nas janelas |
| S2-04 | Usuários e perfis (Administração) | Janela para criar usuário, atribuir perfil, desativar e redefinir senha; só o perfil Administrador vê e usa |
| S2-05 | Comando repetido não se duplica (US-205) | Cadastro com a mesma chave de idempotência devolve o mesmo cliente; teste de resposta perdida (servidor grava, cliente reenvia) |
| S2-06 | Eventos gravados junto com a operação (US-206) | `PartnerRegistered`, `PartnerUpdated`, `PartnerDeactivated` na outbox na mesma transação; consumidor idempotente testado |
| S2-07 | Clientes e unidades no servidor | Cadastrar, editar com versão (If-Match), inativar; código gerado pelo sistema; CNPJ válido e único por empresa, ausente não é inventado; unidades (nome, cidade, UF, endereço) e contatos (nome, função, telefone, e-mail); cliente referenciado não é apagado, só inativado; tudo auditado com ator |
| S2-08 | Telas de clientes | Janela de lista (grade, busca, situação, funil de filtro, seta para abrir) e ficha do cliente (cabeçalho + abas Geral, Unidades, Contatos, Histórico) no design system; campos amarelo-claros em modo de adição; conflito de versão mostra o diálogo |
| S2-09 | Histórico do registro | Aba Histórico lê a auditoria: quando, quem, o que mudou (antes → depois) |
| S2-10 | Contratos | OpenAPI dos endpoints novos; menu lateral marca como implementados só os itens que funcionam |

Ordem de execução: S2-01 → S2-02 → S2-03 → S2-05/S2-06 → S2-07 → S2-08/S2-09 → S2-04 → S2-10.

## Fora do escopo

Fornecedores, materiais e equipamentos (Sprint 3); nomes alternativos vindos de importação (B04); revisão automática de possível duplicidade por semelhança de nome (nesta sprint só o aviso de CNPJ repetido); login com Microsoft/Google; alçadas por valor; worker Python (US-207).

## Como verificar (ao final)

1. Criar o primeiro administrador pelo comando do servidor; entrar no app.
2. Criar um usuário com perfil Consulta; entrar com ele e ver que não consegue cadastrar cliente (e que a tentativa aparece na auditoria).
3. Com o administrador: cadastrar um cliente com duas unidades e um contato; editar; abrir a aba Histórico.
4. Editar o mesmo cliente em duas janelas: a segunda gravação mostra o conflito, nada é sobrescrito.
5. Errar a senha 5 vezes: o usuário fica bloqueado por um tempo.
