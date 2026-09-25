# Sprint 2 — Login, permissões e auditoria + Clientes e unidades

Situação: **Entregue para Review** (25/09/2026). Planning aprovado pelo PO em 25/09/2026.

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

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S2-01 ADR-005 | Pronto | `docs/adr/ADR-005-autenticacao-sessoes.md` (aceito); PD-008 respondida e PD-009 com premissa em `docs/backend/b01/pendencias.json` |
| S2-02 Usuários, sessões e permissões | Pronto | `SessionApiTest` (10 testes): 401 sem sessão; mesma mensagem para senha errada e usuário inexistente; bloqueio na 5ª tentativa e liberação pela redefinição; expiração por 8 h sem uso e por 12 h; sair revoga na hora; Consulta lê e recebe 403 ao alterar, com `ACCESS_DENIED` na auditoria; senha nunca volta na API nem na auditoria; banco guarda só o hash do token |
| S2-03 Login real no app | Pronto | `App.test.tsx`; roteiro no Chromium contra o servidor real: erro de senha na linha de status, rodapé com nome e perfil, bloquear/sessão expirada mostram o login por cima com as janelas abertas por trás. Token só no processo principal do Electron (`electron/main.ts`) |
| S2-04 Usuários e perfis | Pronto | Janela *Usuários e permissões* (criar, perfil, desativar, redefinir senha); regras "não retira o próprio acesso" e "sempre resta um administrador ativo" testadas no servidor |
| S2-05 Comando repetido não se duplica | Pronto | `CustomerApiTest`: mesma chave devolve o mesmo cliente; 6 reenvios simultâneos criam um só; mesma chave com outro conteúdo → 422; app reenvia com a mesma chave depois de queda (`CustomerWindow.test.tsx`) |
| S2-06 Eventos junto com a operação | Pronto | `PartnerRegistered/Updated/Deactivated` na outbox na mesma transação (comando recusado não deixa evento); entregador com `skip locked`; consumidor de fatos operacionais processa cada evento uma única vez, mesmo entregue de novo |
| S2-07 Clientes e unidades | Pronto | `CustomerApiTest` (10 testes): código `C00001`, CNPJ válido e único com o código do cliente existente na mensagem, CNPJ ausente não inventado, unidades/contatos validados de uma vez, If-Match (412/428), ids das unidades preservados, inativação com motivo e idempotente, busca por código/nome/CNPJ |
| S2-08 Telas de clientes | Pronto | Lista (busca, funil, seta, Novo) e ficha (cabeçalho + Geral, Unidades, Contatos, Histórico; amarelo-claro em adição; conflito; Inativar); roteiro no navegador com capturas |
| S2-09 Histórico | Pronto | Aba Histórico lê a auditoria: data, usuário, operação, versão, campo, antes → depois e motivo |
| S2-10 Contratos | Pronto | `docs/backend/api/openapi.yaml`; `OpenApiContractTest` falha se o servidor e o contrato divergirem; `menu.json` marca Clientes e Usuários como implementados (verificador B01: 32/32 telas, 38/38 recursos) |

Testes executados: servidor 56 (PostgreSQL 16 real), app 37, typecheck e build do app e do Electron, verificador B01 + testes. Roteiro no Chromium contra o servidor real (login errado e certo, cadastro com duas unidades, edição, histórico, criação de usuário Consulta, entrada com ele, bloqueio).

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); a ponte do processo principal com o token foi revisada e tem a mesma lógica do transporte do navegador, testado acima. O CI no GitHub (Testcontainers) roda no próximo push.

**Fora do combinado, feito na Review:** itens novos no menu *Arquivo* (Trocar senha, Encerrar sessão) e *Clientes e unidades* no menu *Módulos*, necessários para o login; a ferramenta *Novo* da barra superior passa a funcionar nas janelas que criam registros.

**Pendências registradas:** a tela *Auditoria* (Administração) continua prevista; a revisão de possível duplicidade por semelhança de nome ficou fora do escopo; TLS obrigatório quando o servidor for acessado por outros computadores (ADR-007).

## Retrospectiva

- Funcionou: testes contra banco real pegaram a disputa entre o entregador automático da outbox e a limpeza dos testes; o roteiro no navegador achou o nome lido como "N ovo" pelo leitor de tela (letra de atalho dentro de botão flex) e uma classe do app que colidia com o design system.
- Melhorar: duas sessões mexeram no menu lateral ao mesmo tempo em branches diferentes.
- Ação: a partir da Sprint 3, uma branch de trabalho só (`claude/kind-thompson-qidwjm`) e pull request curto por sprint.
