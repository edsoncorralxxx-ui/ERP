# ADR-016 — Módulos do backend e direção das dependências

- Situação: Proposto — B01
- Data: 2026-09-25

## Contexto

O monólito modular precisa de fronteiras sem ciclos para permitir transações locais e evolução.

## Decisão

24 módulos em docs/backend/b01/modulos.json. O consumidor depende da API pública do provedor (não o contrário). Provisionamento síncrono dentro da transação quando a invariante exige atomicidade (pedido → projetos/títulos). Efeitos gerenciais (custo, repasse, fiscal) consomem eventos de domínio via outbox com deduplicação por origem. O motor analítico consome fatos operacionais genéricos, sem depender dos módulos de negócio. Consultas integradas ficam em módulo próprio sem dados. Grafo verificado por tools/b01/verificar_b01.py.

## Consequências

Em B02 a verificação passa a ser automática no build (teste arquitetural). Custo incorrido é eventualmente consistente e reconciliável com as origens.

## Alternativas consideradas

Portas definidas no consumidor e implementadas pelo provedor em todos os casos (gera ciclos entre financeiro e seus originadores); apropriação síncrona de custo em cada módulo operacional.
