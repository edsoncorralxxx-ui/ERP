# Roteiro e backlog do backend

25/09/2026. Planejamento, não implementação concluída. Todos os itens iniciam como Planejado. OOP e padrões seguem o documento 06; motor integrado segue 05/07.

## Regras de execução

- A sequência define dependências, não um cronograma fechado em dias.
- B01–B04 são fundação; indicadores básicos acompanham B05–B11.
- B12 começa em B04 e conclui a migração dos módulos disponíveis.
- B13 é o piloto operacional. B14 pode avançar antes dele quando suas dependências estiverem satisfeitas; não exige IA.
- B15 é entregue por método elegível. Dados insuficientes são um estado válido da funcionalidade; não uma autorização para publicar modelo sem validação.
- B16 é evolução futura e fica desativada até decisão de integração.
- Cada item deve registrar responsável, estimativa/faixa após análise, progresso, decisões, testes, riscos e próximo passo.

## B01 — Fundação de domínio, semântica e OOP

**Dependências:** Nenhuma.

**Entrega:** Estados, invariantes, módulos, agregados, Value Objects, dicionário empresarial, contratos dos formulários, classificação e ADRs; backlog e decisões pendentes.

**Trabalho:** Modelar SalesOrder, FinancialTitle, Money, Quantity, OperationalFact, IndicatorDefinition e AnalysisRun; especificar confirmação, cancelamento, baixa, estorno e qualidade.

**Aceite:** Exemplos distinguem pedido/faturamento/recebimento/custo/pagamento; todo formulário inicial tem contrato; diagrama sem ciclos; regras sem dados são marcadas pendentes.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B02 — Base executável, contratos e persistência

**Dependências:** B01.

**Entrega:** Java modular, Python worker, banco proposto aprovado em ADR, migrações, API pública/interna, job mínimo durável, outbox, auditoria técnica e CI.

**Trabalho:** Construir ports/adapters e um fluxo técnico real de tarefa e resultado, com lease/generation, deduplicação e configuração externa.

**Aceite:** Subir ambiente limpo; persistir após reinício; job retomado após falha; nenhum acesso direto do Python a tabelas de negócio; build e contratos verificáveis.

**Documentos:** 01, 06. **Situação:** Planejado.

## B03 — Acesso, cadastros e metadados

**Dependências:** B02.

**Entrega:** Sessões, papéis/permissões, empresa, parceiros/unidades/contatos, itens/unidades, contas/categorias, projetos/equipamentos mínimos; catálogo semântico versionado.

**Trabalho:** Entregar CRUD com versão e inativação, contratos de formulários e permissões por ação; escolher autenticação conforme ADR.

**Aceite:** API nega ação e objeto não autorizado; edição desatualizada é rejeitada; unidades/aliases preservam origem; metadados não contornam invariantes.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B04 — Arquivos, Python, conferência e recuperação

**Dependências:** B02, B03.

**Entrega:** Upload privado/hash, extração e normalização, staging, divergências/decisão, aplicação idempotente inicial; backup/restore; DatasetSnapshot e AnalysisRun básicos.

**Trabalho:** Aplicar Pipeline e Adapter; validar schema de resultados e separar sugestão de classificação confirmada; preservar exemplos originais.

**Aceite:** Reenvio não duplica aplicação; timeout/worker antigo não publica resultado; proveniência recuperável; restore de banco+arquivos ensaiado.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B05 — Comercial e primeiro fluxo transacional

**Dependências:** B03, B04.

**Entrega:** Leads/interações, propostas versionadas, pedidos/aditivos, projetos/equipamentos, parcelas, baixa parcial/estorno mínimo; eventos e indicadores de carteira.

**Trabalho:** Implementar cliente → unidade → proposta/pedido → projeto/equipamento → parcelas → recebimento parcial → estorno, com contratos reais para React.

**Aceite:** Duas confirmações produzem um conjunto; timeout após commit recupera mesmos IDs; baixa e estorno reconciliam; cancelamento ajusta fatos e indicadores.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B06 — Financeiro, documentos, conciliação e caixa

**Dependências:** B05.

**Entrega:** Pagar/receber, ajustes/renegociação/adiantamentos, documentos vinculados, contas/transferências, OFX/CSV e conciliação; matriz de caixa; indicadores determinísticos.

**Trabalho:** Completar liquidação e alocação N:N, projeções separadas do realizado e cenários de estresse determinísticos antes de Monte Carlo.

**Aceite:** Duas baixas não ultrapassam saldo; extrato reimportado não duplica; transferência é neutra no consolidado; matriz e composição reconciliam; simulação isolada.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B07 — Engenharia e planejamento

**Dependências:** B05.

**Entrega:** BOM/modelo/revisão por projeto, EAP, atividades/calendários/dependências, linha de base, avanço e recálculo; dados para capacidade.

**Trabalho:** Aplicar Strategy/Policy quando útil a calendários/validação; servir dados do Gantt e rastrear revisão usada por necessidade.

**Aceite:** Ciclo rejeitado; linha de base preservada; revisão não muda máquina em produção; custos e unidades conferem; divergência R$ 3.000 registrada.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B08 — Suprimentos, estoque e terceiros

**Dependências:** B06, B07.

**Entrega:** Necessidades líquidas, cotações, compras/aprovação, recebimento parcial, reserva/consumo/devolução/transferência, inventário e custo médio.

**Trabalho:** Especificar retroatividade/custo antes de calcular; fornecer indicadores iniciais de cobertura, giro, lead time e ABC com definição rastreável.

**Aceite:** Reservas concorrentes não excedem físico; terceiro preserva propriedade; custo apropriado uma vez; documento e compra não duplicam obrigação.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B09 — Produção, qualidade, instalação e custo

**Dependências:** B07, B08.

**Entrega:** Ordens/roteiros, horas/consumo, inspeções/checklists/NC/retrabalho, execução em campo, despesas, aceite e composição montada.

**Trabalho:** Registrar tempos/esperas/perdas/exposição necessários às análises futuras; testes e evidências versionados.

**Aceite:** Cada custo tem origem única; pagamento não repete custo; critérios de inspeção e aceite explícitos; garantia não parte da data prevista.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B10 — Repasses, fiscal gerencial, indicadores e central

**Dependências:** B06, B09.

**Entrega:** Regras de repasse versionadas, simulação/confirmação/ajuste; competência fiscal/histórico/contador; catálogos de indicadores; achados determinísticos, decisões e planos de ação.

**Trabalho:** Implementar IndicatorDefinition, Finding e Decision; centralizar fórmulas e registrar expected/observed; manter parâmetros fiscais pendentes até validação.

**Aceite:** Confirmar duas vezes não duplica títulos; memória congelada; indicador abre composição/fórmula; ausente distinto de zero; achados deduplicados; aceitar achado não executa pagamento.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B11 — Pós-venda e resultados no cliente

**Dependências:** B09, B10.

**Entrega:** Chamados/OS, garantia, peças/horas/despesas, preventiva, coleta de exposição/falhas e base inicial de valor/satisfação do cliente.

**Trabalho:** Entregar atendimento ponta a ponta e contrato de medições antes/depois; não afirmar causalidade nem MTBF sem exposição.

**Aceite:** Geração preventiva repetida não duplica OS; histórico do equipamento preservado; benefício não medido continua hipótese; custo de assistência único.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B12 — Migração consolidada e reconciliação

**Dependências:** B04 e módulos de destino implementados.

**Entrega:** Carga por etapas, aliases, corte, documentos/títulos/baixas comprovadas, inventário inicial, relatórios de diferenças e retomada.

**Trabalho:** Executar ensaio em base limpa, preservar bruto/corrigido/aplicado e validar totais por origem; não promover seed sintético a produção.

**Aceite:** Conferir 32 linhas/R$ 5.681.662,94 e 104 linhas separadas; manter divergências e saldos iniciais sem dupla contagem; reimportação determinística.

**Documentos:** 01, 05. **Situação:** Planejado.

## B13 — Piloto operacional e implantação

**Dependências:** B01–B12; metas e infraestrutura definidas.

**Entrega:** Permissões reais, testes de capacidade, observabilidade, releases/migrações, runbooks, backup e restauração, compatibilidade cliente/API, corte e suporte.

**Trabalho:** Preparar piloto do núcleo com relatório de aceites e pendências; módulos analíticos avançados continuam no backlog quando não habilitados.

**Aceite:** RPO/RTO acordados e ensaiados; tarefas/outbox recuperáveis; cliente sem dependência da IA; responsáveis de operação definidos.

**Documentos:** 01, 05, 06. **Situação:** Planejado.

## B14 — Ampliação de áreas de análise e decisão

**Dependências:** B03–B11 conforme domínio.

**Entrega:** Marketing/canais/orçamento, demanda, valor/satisfação, orçamento empresarial/investimentos/contabilidade gerencial, capacidade/calibração/logística/produtos, contratos/riscos e experimentos.

**Trabalho:** Implementar primeiro registros, indicadores descritivos, cenários explícitos e acompanhamento das decisões; organizar subentregas por domínio.

**Aceite:** Todos os recursos AN do catálogo têm contrato, dados, métodos elegíveis, decisão apoiada, responsável e fase; novas áreas não se confundem com 32 telas do mock.

**Documentos:** 05, 06, 07, 08. **Situação:** Planejado.

## B15 — Previsão, probabilidade, simulação e otimização

**Dependências:** B04, B10, B14; dados e critérios por método.

**Entrega:** Strategies de modelos, eligibility/validation policies, snapshots, registry, baseline, backtesting, calibração, Monte Carlo, solvers e experimentos.

**Trabalho:** Dividir por famílias do catálogo AN; iniciar baseline/descritiva e habilitar avançados só com validação registrada, sem limiar universal inventado.

**Aceite:** Sem vazamento temporal; soluções viáveis verificadas; seed e snapshot rastreáveis; incerteza e limitações visíveis; fallback e suspensão testados.

**Documentos:** 05, 06, 07, 08. **Situação:** Planejado.

## B16 — IA generativa futura

**Dependências:** B10, B14; política/provedor/dados permitidos definidos.

**Entrega:** Adaptador inicialmente desligado, consultas autorizadas ao catálogo/documentos/resultados, explicação com fontes, hipóteses e recomendações.

**Trabalho:** Implementar porta de IA e ferramentas de leitura/cálculo; testar isolamento/autorização e respostas sem evidência; execução sempre por comando autorizado.

**Aceite:** Sem ação financeira autônoma; sem vazamento de dados restritos; documento não injeta instruções; falha IA não interrompe operação; cálculos vêm do motor.

**Documentos:** 05, 06, 07. **Situação:** Planejado.

## Pacotes transversais

T01 Segurança/autorização e trilha em cada endpoint. T02 Dinheiro/unidades/tempo. T03 Idempotência/concorrência. T04 Contratos e migrações. T05 Observabilidade/recuperação. T06 Qualidade e proveniência. T07 Catálogo semântico/indicadores. T08 OOP/limites arquiteturais. T09 Reconciliação entre tela/relatório/exportação. T10 Modelos/hipóteses/avaliação e governança. Cada fase deve declarar quais pacotes aplica e sua evidência.

## Critério de conclusão

Código compilável e executável, migração testada, API documentada, permissões, invariantes, auditoria, cenários críticos verificados e integração real com o cliente no marco correspondente. Não marcar entrega pronta por existir só uma pasta, mock ou botão. Pendência de dados/regras de negócio fica explícita com o escopo bloqueado.
