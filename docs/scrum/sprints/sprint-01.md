# Sprint 1 — Proposta (aguardando Sprint Planning com o PO)

## Objetivo proposto

Ter a base do servidor rodando e verificada: estrutura do projeto, núcleo de valores monetários à prova de erro de centavos, regra de arquitetura automática e CI.

## Itens propostos

| ID | Item | Critério de aceite |
|---|---|---|
| US-201 | Definir tecnologias e versões (ADR-004) | ADR aceito pelo PO |
| US-202 | Estrutura do repositório e ambiente local | Subir o ambiente seguindo o README |
| US-203 | Money/Quantity/políticas de arredondamento | Testes de propriedade passando; parcelas sempre somam o total |
| US-204 | Teste arquitetural dos 24 módulos | Build falha ao introduzir dependência proibida |
| US-209 | CI inicial | Pipeline verde executando build, testes e verificador B01 |

## Fora desta sprint

Recibo de comando, outbox, worker Python e API (US-205 a US-208) ficam para a Sprint 2. Nenhuma tela ou regra de negócio.

## Decisões necessárias do PO antes de começar

- ADR-004: Java + Spring Boot + PostgreSQL + Python (versões LTS conferidas na documentação oficial).
- PD-002 (arredondamento) e PD-007 (casas decimais) — ou aceitar as premissas atuais.

## Situação

Proposta. Início somente após aprovação do PO.
