# ADR-008 — Arquivos e tarefas duráveis

- Situação: Proposto — detalhar em B02–B04
- Data: 2026-09-25

## Contexto

Python processa arquivos e análises sem acesso às tabelas de negócio.

## Decisão

Armazenamento privado com hash e metadados no banco. Tarefas em tabela durável com lease, leaseToken, geração e heartbeat; resultado de lease obsoleto é rejeitado. Outbox transacional com consumidores idempotentes; entrega pelo menos uma vez com deduplicação. Sem broker externo inicialmente.

## Consequências

Python autentica como serviço com escopo mínimo por tipo de tarefa.

## Alternativas consideradas

Broker de mensagens desde o início; Python gravando direto no banco (rejeitado).
