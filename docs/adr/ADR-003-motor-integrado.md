# ADR-003 — Motor integrado de dados, análise e decisão

- Situação: Aceito — incluído por solicitação do usuário
- Data: 2026-09-25

## Contexto

O documento do motor amplia o escopo com 38 recursos analíticos e ciclo coletar → classificar → analisar → propor → decidir → avaliar.

## Decisão

Java mantém fatos, definições semânticas, indicadores oficiais, achados e decisões; Python executa métodos sobre snapshots versionados. Análise propõe; execução exige comando autorizado. Fundação semântica começa em B01.

## Consequências

Todo fato confirmado gera OperationalFact; indicadores têm definição única (docs/backend/b01/indicadores.json). Métodos avançados dependem de elegibilidade e validação (ADR-012). IA futura desligada (ADR-014).

## Alternativas consideradas

Análise executada no cliente com o aplicativo aberto (superado: processamento no servidor).
