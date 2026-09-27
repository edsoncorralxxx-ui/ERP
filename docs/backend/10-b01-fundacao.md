# B01 — Fundação de domínio, semântica e OOP

Situação: **entregue para revisão** em 25/09/2026. B01 é uma fase documental: entrega especificação verificável, não código de servidor. Nada aqui afirma implementação do ERP.

## 1. Entregas

| Entrega exigida no roteiro | Onde está |
|---|---|
| Módulos e dependências sem ciclos | `11-b01-modulos-e-dependencias.md`, `b01/modulos.json`, ADR-016 |
| Agregados, Value Objects, invariantes e estados | `12-b01-modelo-de-dominio.md` (SalesOrder, FinancialTitle, Settlement, Money, Quantity, OperationalFact, IndicatorDefinition, AnalysisRun, Inspection, DataQualityIssue) |
| Confirmação, cancelamento, baixa, estorno e qualidade | `13-b01-especificacao-de-comandos.md` |
| Exemplos que distinguem pedido, faturamento, recebimento, custo e pagamento | `14-b01-exemplos-de-eventos.md` |
| Dicionário empresarial | `b01/conceitos.json` e `15-b01-dicionario-contratos-e-classificacao.md` §1 |
| Contratos de todos os formulários iniciais | `b01/formularios.json` (32/32) e doc 15 §2 |
| Classificação | doc 15 §3 |
| Catálogo de eventos e indicadores iniciais | `b01/eventos.json` (95), `b01/indicadores.json` (20) |
| ADRs | `docs/adr/` (ADR-001 a ADR-016) |
| Backlog e decisões pendentes | `backlog-execucao.md`, `b01/pendencias.json` (24), §3 abaixo |
| Verificação automática | `tools/b01/verificar_b01.py` e testes em `tools/b01/test_verificar_b01.py` |

## 2. Critérios de aceite e evidências

| Critério (roteiro B01) | Evidência | Situação |
|---|---|---|
| Exemplos distinguem pedido/faturamento/recebimento/custo/pagamento | Doc 14 §1: 8 eventos com 10 indicadores lado a lado e conferências aritméticas; estorno, cancelamento, arredondamento e transferência em §2–§5 | Atendido |
| Todo formulário inicial tem contrato | O verificador compara os 32 IDs do mapa `03-mapa-32-telas-backend.csv` com `formularios.json` e valida campos, tipos, unidades, comandos, eventos, permissões, indicadores e recursos AN | Atendido (32/32) |
| Diagrama sem ciclos | O verificador executa busca de ciclos no grafo de 24 módulos e no grafo de indicadores, e exige que consumidor de evento dependa do produtor e que comando só emita eventos de módulos alcançáveis | Atendido |
| Regras sem dados são marcadas pendentes | Validações e indicadores referenciam `PD-*`; o verificador exige que cada pendência exista, tenha premissa, bloqueio, responsável e ADR existente | Atendido (24 pendências) |

Como verificar:

```bash
python3 tools/b01/verificar_b01.py            # OK: catálogos do B01 consistentes
python3 -m unittest discover -s tools/b01     # 12 testes, incluindo casos negativos
python3 tools/b01/formatar_json.py --verificar
```

## 3. Decisões pendentes

As premissas permitem avançar com testes sintéticos. Elas **não** são regras aprovadas; cada uma é uma Policy/Strategy substituível.

| ID | Tema | Premissa B01 | Bloqueia | Responsável | ADR |
|---|---|---|---|---|---|
| PD-001 | Geração de projetos por pedido | Um projeto por pedido confirmado, com um equipamento por unidade de item do tipo equipamento | Operação real de B05 | Negócio (Edson) | ADR-010 |
| PD-002 | Arredondamento e resíduos | HALF_EVEN por linha; resíduo distribuído um centavo por vez a partir da primeira parcela | Valores oficiais de B05/B06/B10 | Financeiro + contador | ADR-006 |
| PD-003 | Cancelamento de pedido confirmado | Cancelamento bloqueado quando houver recebimento, reserva, consumo ou produção; sem efeitos, cancela títulos abertos e projetos planejados | Cancelamento com efeitos em B05 | Negócio + financeiro | ADR-010 |
| PD-004 | Pagamento acima do saldo | Rejeitar, salvo se o operador declarar crédito explícito com permissão financial_credit.create | Crédito/adiantamento em B06 | Financeiro | ADR-010 |
| PD-005 | Estorno parcial | Estorno total por liquidação; corrigir parcialmente = estornar e lançar nova liquidação | Estorno parcial | Financeiro | ADR-010 |
| PD-006 | Estorno de liquidação conciliada | Exigir desconciliação explícita antes do estorno (erro SETTLEMENT_RECONCILED) | Fluxo conciliação/estorno em B06 | Financeiro | ADR-010 |
| PD-007 | Precisão de quantidades e preços unitários | Quantidade escala 6; preço/custo unitário escala 6; percentual escala 6 (fração) | DDL de B02 | Desenvolvimento + engenharia | ADR-006 |
| PD-008 | Autenticação | Nenhuma; contratos usam ator autenticado abstrato | B03 | Negócio + infraestrutura | ADR-005 |
| PD-009 | Perfis e permissões reais | Perfis sugeridos no documento 01, sem usuários reais | Piloto B13 | Negócio | ADR-005 |
| PD-010 | Categorias financeiras e centros de resultado | Categoria obrigatória por título, lista a cadastrar | Relatórios gerenciais de B06/B10 | Financeiro | ADR-010 |
| PD-011 | Custo médio e retroatividade | Custo médio móvel; estoque disponível nunca negativo; retroativo bloqueado até definição | B08 | Financeiro + operação | ADR-009 |
| PD-012 | Regras de repasse | Estrutura versionada sem valores; nomes e percentuais do histórico não são regras vigentes | B10 operacional | Negócio + financeiro | ADR-011 |
| PD-013 | Parâmetros fiscais e enquadramento | Simulação indisponível (NOT_CALCULABLE) sem parâmetros confirmados | B10 fiscal | Contador + financeiro | ADR-011 |
| PD-014 | Critérios de inspeção e aceite | Checklist versionado genérico; nenhum critério inventado | Liberação real em B09 | Engenharia/operação | ADR-010 |
| PD-015 | Início da garantia | Garantia inicia no aceite registrado; termos cadastrados por contrato | B09/B11 | Negócio | ADR-010 |
| PD-016 | Fórmula de necessidade líquida | Cálculo por data, alocando cada suprimento uma vez; compras em cotação não contam | B08 | Operação + desenvolvimento | ADR-009 |
| PD-017 | Convenção de calendário do cronograma | Dias corridos; término = início + duração − 1; marco com duração zero | Recálculo em B07 | Engenharia | ADR-010 |
| PD-018 | Pesos da EAP e avanço | Avanço ponderado pelos pesos validados; soma 100% | Indicador de avanço em B07 | Engenharia | ADR-010 |
| PD-019 | Data de corte e saldos iniciais | Nenhuma carga definitiva antes da definição | B12 | Negócio + financeiro | ADR-013 |
| PD-020 | Topologia e capacidade | Nenhuma; ambiente de desenvolvimento sintético | B13 | Negócio + infraestrutura | ADR-007 |
| PD-021 | RPO/RTO e retenção | Nenhuma | B13 | Negócio + operação | ADR-013 |
| PD-022 | Classificação histórica versus atual | Padrão: classificação vigente na data do fato; consulta pela atual explicitada | Relatórios de B10 | Negócio | ADR-012 |
| PD-023 | Faturamento parcial e parcelas | Vínculo documento→parcelas com valor por vínculo; soma vinculada ≤ valor do documento e ≤ valor das parcelas | B06 | Financeiro | ADR-010 |
| PD-024 | Fórmula de carteira e faturamento para indicadores | Definições IND-001 a IND-004 deste B01 | Painéis oficiais de B05/B10 | Negócio | ADR-012 |

## 4. Limites desta entrega

- Os nomes de classes, tabelas e endpoints são propostas. As assinaturas finais vêm com OpenAPI e migrações em B02+.
- Frameworks e versões não foram escolhidos (ADR-004 proposto). O modelo não depende de Spring/JPA.
- Nenhum dado real foi importado. Os valores dos exemplos são sintéticos; os números do estudo (32 linhas, R$ 5.681.662,94, R$ 3.000,00 etc.) aparecem só como casos de conferência.
- O mock React, o pacote do design system e os PDFs não estão neste repositório, então os contratos de formulário não foram comparados com o código do mock. Os campos seguem o plano funcional, o briefing e o mapa de telas.
- As novas áreas do catálogo analítico (B14) não receberam contratos de formulário nesta fase; os 38 recursos AN estão vinculados às 32 telas existentes quando aplicável.

## 5. Próximo passo

B02 (base executável) depende de aceite ou ajuste do **ADR-004** (framework, versões, banco) e da revisão das premissas que afetam o DDL (**PD-002** e **PD-007**). ADR-005 (autenticação) pode ficar pendente até B03.
