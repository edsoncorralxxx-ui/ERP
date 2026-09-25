# Sprint 1 — Esqueleto do sistema

Situação: **Entregue para Review** (25/09/2026). Planning aprovado pelo PO em 25/09/2026.

## Objetivo

Abrir o aplicativo Renda+ no Mac, conectado ao servidor, e salvar de verdade no banco os dados da empresa. Prova que as três camadas (app → servidor Java → PostgreSQL) funcionam juntas e servem de base para todas as próximas fatias.

## Tecnologias (ADR-004, a aceitar nesta sprint)

| Camada | Proposta |
|---|---|
| Servidor | Java 21 (LTS), Spring Boot 3 (versão estável mais recente conferida na implementação), Maven |
| Banco | PostgreSQL 16, migrações com Flyway |
| Testes | JUnit 5, Testcontainers (PostgreSQL real), ArchUnit (regras de arquitetura) |
| App do Mac | Electron + React + TypeScript, empacotado com Vite |
| Python | 3.11+, gerenciado por uv (entra quando a importação precisar) |
| Ambiente local | Docker Compose para o banco |
| CI | GitHub Actions |

## Itens

| ID | Item | Critério de aceite |
|---|---|---|
| S1-01 | ADR-004 aceito com versões fixadas | ADR marcado "Aceito" pelo PO |
| S1-02 | Estrutura do repositório e ambiente local | Seguindo o README, banco + servidor + app sobem do zero |
| S1-03 | Núcleo `kernel`: Money, Quantity e políticas de arredondamento | Testes de propriedade: partes sempre somam o total; sem ponto flutuante |
| S1-04 | Plataforma mínima do servidor: erro padronizado em português, versão da API, status do servidor, migração inicial | `GET /api/v1/status` responde; erro com código, mensagem e correlationId |
| S1-05 | Regra de arquitetura automática | Build falha ao introduzir dependência proibida entre módulos |
| S1-06 | App do Mac: janela principal no estilo SAP Business One | Menu superior, barra de ferramentas, lateral recolhível, área de trabalho com janelas internas (abrir, mover, minimizar, maximizar, fechar) e rodapé com estado da conexão |
| S1-07 | Primeira fatia de ponta a ponta: **Dados da empresa** (Configurações) | Abrir a janela, editar razão social/nome/CNPJ/endereço, salvar; dado persiste após reiniciar o servidor; edição com versão desatualizada mostra conflito em vez de sobrescrever |
| S1-08 | CI | A cada push: build e testes Java (com banco real), build do app, verificador B01 |

## Fora desta sprint

Login e permissões (Sprint 2), qualquer cadastro de negócio, worker Python, instalador assinado do Mac, servidor de produção.

## Dependências e riscos

- **Design system:** o pacote original (`design-system/renda-mais-erp/`: tokens, componentes, ícones) não está no repositório. Sem ele, a Sprint 1 usa as cores e regras do briefing (#4867B1, #FCF0AE etc.) de forma provisória, e a troca pelos tokens reais fica para quando o pacote for enviado.
- **Teste visual no Mac:** este ambiente é Linux na nuvem. O app será verificado aqui (build e testes automatizados); a abertura real no macOS precisa ser feita por você, com as instruções do README.
- **PD-002 / PD-007:** usadas as premissas atuais, que podem ser trocadas depois sem mudar a estrutura.

## Demonstração prevista na Review

1. Subir o ambiente com os comandos do README.
2. Abrir o app: janela principal, status "Conectado".
3. Abrir "Dados da empresa", editar e salvar; reiniciar o servidor e reabrir: o dado continua lá.
4. Simular edição concorrente: o app mostra o conflito.
5. Mostrar o CI verde e os testes de Money (soma sempre exata).

## Mudanças durante a sprint (acordadas com o PO)

- **Servidor local no Mac do usuário** (pedido do PO): README com passo a passo via Homebrew; servidor escuta só em 127.0.0.1 por padrão.
- **Spring Boot 4.1.x** no lugar de 3.x: a linha 3.5 estava fora do suporte gratuito (ADR-004).
- **Design system oficial** (pedido do PO): pasta `design-system/` trazida da sessão "Integração do Design System" e adotada como fonte única (ADR-017). Tokens provisórios removidos.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S1-01 ADR-004 | Pronto | `docs/adr/ADR-004-framework-versoes-banco.md` (aceito) |
| S1-02 Estrutura e ambiente | Pronto | `README.md` (Mac), `infra/local/docker-compose.yml`, Maven Wrapper |
| S1-03 Kernel | Pronto | `MoneyTest` (incl. 20.000 casos aleatórios: partes sempre somam o total), `QuantityTest`, `CnpjTest` (numérico e alfanumérico) |
| S1-04 Plataforma mínima | Pronto | `GET /api/v1/status`; erro padronizado com código, mensagem em português e correlationId; 400/404/412/422/428 |
| S1-05 Regra de arquitetura | Pronto | `ArchitectureTest` lê `docs/backend/b01/modulos.json`; testado com dependência proibida (falha) e sem ela (passa) |
| S1-06 Janela principal | Pronto | Barra superior, barra de ferramentas, trilho + gaveta com os 30 módulos, área de trabalho com janelas internas (abrir/ativar existente, mover, redimensionar, minimizar, maximizar/restaurar, cascata, lado a lado), rodapé com conexão |
| S1-07 Dados da empresa | Pronto | Salvar → versão 1; reiniciar servidor → dado persiste; edição desatualizada → diálogo de conflito, nada sobrescrito; 8 gravações simultâneas → 1 vence, 7 recebem 412; auditoria com diferenças e correlationId |
| S1-08 CI | Pronto (a confirmar no primeiro push) | `.github/workflows/ci.yml`: especificação, servidor (Testcontainers) e app |

Testes executados nesta sessão: servidor 35 (PostgreSQL 16 real), app 19, verificador B01 + 12 testes. Roteiro de demonstração executado no Chromium contra o servidor real (capturas na conversa).

**Não verificado aqui:** abertura do app dentro do Electron no macOS (este ambiente é Linux sem tela; o binário do Electron não foi baixado). O mesmo código de interface roda no navegador de desenvolvimento, verificado acima; a abertura no Mac precisa ser feita pelo PO seguindo o README.

## Retrospectiva

- Funcionou: testes contra banco real e roteiro no navegador acharam um laço de renderização que os testes unitários não pegavam; corrigido e coberto por teste.
- Melhorar: o design system chegou no meio da sprint e exigiu refazer o shell. Na próxima, conferir antes do planning se há material visual novo.
- Ação: Sprint 2 começa com checklist de insumos (design, decisões pendentes de prioridade 1–2).
