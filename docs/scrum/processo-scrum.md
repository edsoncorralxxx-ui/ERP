# Processo de desenvolvimento — Scrum

Adotado por decisão do usuário em 25/09/2026. O roteiro B01–B16 continua sendo o mapa técnico de dependências; o Scrum define **como** o trabalho é planejado, entregue e revisado.

## Papéis

| Papel | Quem | Responsabilidade |
|---|---|---|
| Product Owner | Edson | Prioriza o backlog, aprova o objetivo de cada sprint, aceita ou recusa o incremento, responde às decisões de negócio |
| Time de desenvolvimento | Claude (e outros desenvolvedores, se houver) | Estima, implementa, testa, documenta e demonstra |
| Scrum Master (facilitação) | Claude | Conduz os eventos, mantém os artefatos, sinaliza impedimentos |
| Partes interessadas | Financeiro, contador, engenharia/operação | Respondem pendências da sua área e participam das revisões quando o tema for seu |

## Eventos

| Evento | Como será feito aqui | Resultado registrado |
|---|---|---|
| **Sprint Planning** | Na conversa, antes de começar: Claude propõe objetivo e itens; o PO ajusta e aprova | `sprints/sprint-NN.md` com objetivo, itens, critérios de aceite e fora do escopo |
| **Execução** (substitui a Daily) | Trabalho assíncrono; impedimentos são levados ao PO assim que surgem | Commits e atualização do progresso |
| **Sprint Review** | Demonstração do incremento: o que funciona, como verificar, o que não foi feito | Seção "Review" do arquivo da sprint; PO aceita ou recusa cada item |
| **Retrospective** | O que funcionou, o que melhorar e uma ação concreta para a próxima sprint | Seção "Retrospectiva" |
| **Refinamento** | Entre sprints: detalhar histórias das próximas sprints e decisões pendentes | Atualização do `product-backlog.md` |

Nenhuma sprint começa sem objetivo aprovado pelo PO. Mudança de escopo no meio da sprint só com acordo do PO; o item removido volta ao backlog.

## Duração

Proposta: cada sprint tem **um objetivo coerente e demonstrável**, equivalente a 1–2 semanas de trabalho de um time. A duração em calendário depende da disponibilidade para planejamento e revisão (a confirmar pelo PO). Uma fase B grande pode ocupar várias sprints; uma sprint nunca mistura objetivos sem relação.

## Artefatos

- **Product Backlog** — `product-backlog.md`: épicos (fases B01–B16) e histórias priorizadas.
- **Sprint Backlog** — `sprints/sprint-NN.md`.
- **Incremento** — código/documentos no branch, verificáveis pelos comandos descritos na sprint.
- **Decisões pendentes** — `../../decisoes/decisoes-pendencias-B01.xlsx` e `../backend/b01/pendencias.json`.

## Definição de Pronto (Definition of Done)

Um item só é "Pronto" quando:

1. atende todos os critérios de aceite da sprint;
2. o código compila e os testes relevantes passam (domínio, banco real quando houver persistência, concorrência/idempotência quando aplicável);
3. permissões e auditoria estão aplicadas quando o item tem operação de negócio;
4. contratos (OpenAPI/JSON) e documentação estão atualizados;
5. a verificação automática (CI e verificadores) passa;
6. foi demonstrado na Review e aceito pelo PO;
7. não esconde pendência crítica: o que não foi verificado está escrito.

Mock, tela com dados fictícios ou botão sem servidor **não** contam como Pronto para um fluxo que deveria funcionar de verdade.

## Definição de Preparado (Definition of Ready)

Uma história entra numa sprint quando tem: valor claro, critérios de aceite verificáveis, dependências satisfeitas e, se depender de regra de negócio, a decisão respondida ou uma premissa explicitamente aceita pelo PO.
