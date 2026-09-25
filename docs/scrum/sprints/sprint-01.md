# Sprint 1 — Esqueleto do sistema

Situação: **Proposta para aprovação do PO** (Sprint Planning).

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
