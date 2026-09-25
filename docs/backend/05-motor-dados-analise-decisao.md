# Motor integrado de dados, análise e decisão — plano de backend

25/09/2026. Ampliação funcional solicitada pelo usuário. Complementa o plano operacional, sem substituir a arquitetura cliente-servidor. Fonte funcional: documento “ERP Renda+ — motor integrado de dados, análise e decisão” recebido nesta data.

## 1. Decisões e adaptação do documento

Adotar o ciclo coletar → classificar/validar → analisar → avaliar alternativas → propor ação → registrar decisão e resultado. Cada recurso explicita dados utilizados, pergunta respondida e decisão apoiada. A análise propõe; a execução operacional/financeira exige comando de usuário autorizado e validação Java.

Permanecem Electron + React no macOS e servidor Java + Python. As menções a JavaFX, SQLite e Python empacotado no cliente são referências superadas, não uma nova decisão técnica. Não incluir escrita offline/sincronização automaticamente. Com servidor em rede local, a operação pode independer de internet externa, mas continua exigindo conexão com o servidor. Topologia remota requer rede correspondente.

Diferente do documento de origem, o processamento contínuo roda no servidor e pode continuar com o aplicativo Mac fechado. Se o servidor/worker estiver indisponível, tarefas permanecem duráveis para retomada. IA externa é futura, desativada inicialmente e depende de configuração explícita de provedor e dados permitidos. Identidade visual continua o design system Renda+ já adotado.

Java mantém fatos oficiais, definições semânticas, permissões, indicadores determinísticos oficiais, agenda de tarefas, achados e decisões. Python recebe snapshots autorizados e executa estatística, previsão, simulação e otimização, devolvendo resultados versionados. Não altera movimentos diretamente. Bibliotecas do documento (NumPy, SciPy, pandas, statsmodels, scikit-learn, OR-Tools) são candidatas por método; fixar versões/licenças/compatibilidade quando cada método for implementado.

## 2. Fundação semântica compartilhada

### 2.1 Dicionário empresarial

Definir conceito, significado, unidade, granularidade, datas aplicáveis, vínculos, origem e responsável. Venda/pedido, faturamento, recebimento, custo, pagamento, reserva e previsão devem ser conceitos distintos. Registrar sinônimos/aliases para importação e busca sem fundir fatos diferentes.

O catálogo não é um mecanismo para criar entidades e regras financeiras arbitrárias por metadados. Domínios Java conservam invariantes em código e restrições no banco. Metadados descrevem e conectam formulários, indicadores, análises e permissões a esses contratos reais.

### 2.2 Contrato obrigatório de formulário

Cada formulário registra: ID/versão, nome e significado, campos (tipo/unidade/precisão/obrigatoriedade/origem), classificações, validações, comandos/eventos, indicadores afetados, análises habilitadas, metas/limites, ações possíveis e rastreabilidade. Esse catálogo é contrato comum para a interface React e os serviços Java, não validação apenas no cliente.

Classificações confirmadas e sugestões ficam separadas, com versão de regra, autor e validade. Reclassificação identifica os relatórios afetados e preserva consulta histórica pela classificação vigente ou atual, explicitando qual se usa.

## 3. Contratos persistidos

| Contrato | Conteúdo mínimo |
| --- | --- |
| OperationalFact | ID, empresa, entidade/versão, evento, instante do fato e do registro, origem, classificações, IDs de movimentos e reversões |
| FormDefinition | ID/versão, conceito, schema de campos, comandos, validações, eventos, indicadores, análises e permissões |
| ClassificationRule | Escopo, versão, vigência, entradas, condição, saída e aprovação |
| IndicatorDefinition | Fórmula/versão, unidade, população/granularidade, filtros, periodicidade, dependências, política para ausentes e responsável |
| DatasetSnapshot | ID, consulta/filtros autorizados, data de corte, watermark, schema, hash, quantidade, lacunas, permissões e retenção |
| AnalysisRun | Método/versão, snapshot, parâmetros, hipóteses, seed, ambiente, estados, resultado, incerteza, limitações e artefatos |
| ModelVersion | Método/features, dados e corte de treino, baseline, validação, métricas, elegibilidade, estado, responsável e histórico |
| Finding | Problema/oportunidade, evidências, confiança, impacto, urgência, prioridade, escopo, sugestão, validade e achados relacionados |
| Decision | Achado/cenário, alternativas, decisão e justificativa, responsável, metas, custo e plano de execução |
| DecisionEvaluation | Situação anterior, intervenção executada, período/exposição, resultado esperado/observado, método de avaliação e limitações |

Tabelas propostas: business_concept, form_definition, classification_rule_revision, classification_assignment, indicator_definition, indicator_dependency, indicator_snapshot, dataset_snapshot, analysis_definition, analysis_run, analysis_artifact, model_version, model_validation, model_monitoring, finding, finding_evidence, decision, action_plan, action_task, decision_evaluation, experiment, experiment_assignment, experiment_measurement.

Complementos por domínio: marketing_campaign, channel_touchpoint, attribution_rule, marketing_budget; customer_value_plan, customer_baseline, benefit_measurement, satisfaction_survey; corporate_budget_revision, investment_case, cash_scenario; resource_capacity, scheduling_scenario, calibration_session, measurement_observation, shipment, route_matrix, routing_scenario, product_experiment; contractual_obligation, legal_occurrence, risk_assessment. Nomes conceituais a refinar nas migrações.

## 4. Exemplo: pedido único alimentando o motor

1. Rascunho é intenção; não soma carteira confirmada nem cria obrigação definitiva.
2. Confirmar pedido grava transação de domínio e eventos; cria demanda/carteira/programação conforme regra validada.
3. Projeções aplicam evento com deduplicação; identificam itens, unidade, projeto, região e datas.
4. Produção e compras consomem demanda rastreável, sem recontar pedido e linha como duas demandas.
5. Caixa contratual usa vencimentos; cenário de atraso é uma simulação separada do saldo oficial.
6. Entrega/faturamento parciais reduzem seus respectivos saldos pendentes; recebimento liquida título, sem equivalência automática entre esses eventos.
7. Cancelamento/aditivo produz correções de demanda/indicadores, preservando eventos originais e versões.
8. Avaliação compara margem, prazo, entrega e benefício observado no cliente.

Indicadores iniciais: carteira confirmada por data de confirmação; carteira a entregar por saldo de quantidade de item; carteira a faturar por valor pendente; relação pedidos confirmados/faturamento com mesma moeda, período e base explicitados. Denominador zero é “não calculável”, não infinito nem 100% arbitrário.

## 5. Serviços e APIs propostas

| Serviço Java | Contratos públicos propostos | Python quando aplicável |
| --- | --- | --- |
| Catálogo semântico | /business-concepts, /form-definitions, /classification-rules | Sugestões/classificação com evidência |
| Qualidade de dados | /data-quality/issues, /data-quality/assessments | Perfilamento, duplicidades e detecção |
| Indicadores | /indicator-definitions, /indicators/{id}/values, /composition | Cálculo auxiliar, reconciliado com definição |
| Execuções | /datasets, /analyses, /analysis-runs | Estratégias estatísticas/modelos |
| Modelos | /models, /model-versions, /validations | Treino, avaliação, calibração e monitoramento |
| Cenários | /scenarios, /optimizations | Monte Carlo, LP/MILP/CP, rotas |
| Central | /findings, /finding-evidence | Achados propostos, deduplicados no Java |
| Decisões | /decisions, /action-plans, /evaluations | Avaliação estatística quando elegível |
| Experimentos | /experiments, /measurements | Poder, estimativas e diagnósticos |
| IA futura | /assistant/sessions, /assistant/queries | Adaptadores de modelos/documentos autorizados |

APIs herdam autenticação, idempotência, autorização por objeto, versionamento e erros do plano principal. Catálogo não permite SQL/código arbitrário enviado pela interface: fórmulas declarativas validadas ou funções registradas no servidor, com limites de execução e análise de dependências.

## 6. Processamento e atualização

Eventos oficiais alimentam dependências de indicadores. Recalcular somente o necessário, agrupar eventos frequentes, detectar ciclos de dependências e marcar projeções desatualizadas. Reconstrução a partir dos fatos deve reconciliar com atualização incremental.

Análises pesadas usam jobs com progresso, cancelamento, limite de recursos, prioridade e quotas; o servidor agenda periodicidade. Consultas transacionais e confirmações não esperam um treino/otimizador. Dados do snapshot não mudam durante execução. Se fatos mudarem, o resultado preserva o corte e recebe indicação de desatualização; executar nova análise não apaga a anterior.

Deduplicar alertas por definição/versão, objeto, período e condição. Atualizar evidência de achado existente em vez de enviar alertas repetidos. Estados: aberto, em análise, aceito, rejeitado, em execução, resolvido, expirado; reabertura com motivo. Prioridade separa impacto estimado, urgência e confiança; não apresentar uma nota composta como probabilidade calibrada.

Decisão aceita pode originar um plano de ação, mas não confirma automaticamente pagamento/compra/baixa. Execução atravessa os comandos existentes, com permissões e checagem de versão/estado atual; aprovação antiga de cenário não autoriza operar sobre dados já alterados sem revalidação.

## 7. Elegibilidade, validação e matemática

Modelos exibem dados insuficientes, experimental, validado ou suspenso. Estados pertencem à versão do modelo/método e seu domínio de aplicação. Não escolher um número mínimo universal de amostras. Registrar tamanho, cobertura temporal, exposição, eventos raros, dados faltantes, regime e poder/precisão necessária para cada método.

Previsão: comparação com referência simples, separação temporal, backtesting por origem móvel, ausência de vazamento de informação futura e comparação na mesma janela/horizonte. Transformações/preenchimentos aprendidos apenas no treino. Registrar erro fora da amostra, intervalos e cobertura. Modelos probabilísticos registram calibração; desempenho insuficiente volta ao baseline. Reavaliar após mudança de processo/regime.

Confiança sobre estimativa média, intervalo de previsão individual e intervalo credível bayesiano são conceitos distintos. Identificar hipóteses/priores. Associação não é causalidade. Antes/depois sem controle é observacional. Ausência de dado não é zero e exclusões precisam constar dos resultados.

Monte Carlo: registrar seed, distribuições e sua fonte, dependências/correlações, número de simulações, erro numérico e cenário-base. Preservar vínculo venda → compra → recebimento e cronograma; não assumir independência por conveniência. Probabilidades derivadas de hipóteses são apresentadas como condicionais ao cenário.

Otimização: registrar variáveis, objetivo, unidades, restrições duras/suaves, solver/versão, tempo limite e tolerância. Retornar status viável, ótimo com evidência, inviável, sem conclusão ou limite de tempo. Solução viável interrompida não é declarada ótima; informar bound/gap quando disponível. Relaxar restrições apenas em novo cenário explicitamente identificado.

Métodos numéricos: casos de solução conhecida e análise dimensional. Fluxos financeiros discretos usam somatórios/desconto, não integral contínua desnecessária. Derivadas/diferenças finitas/gradientes apenas em modelos adequados e dentro do intervalo válido. Regras por faixas, inteiros e contratos usam tratamento por trechos/restrições. TIR pode não existir ou ter múltiplas soluções: sinalizar, não fabricar resposta.

Controle estatístico: limites de controle distintos de especificações técnicas; capacidade só com condições justificadas. Calibração exige padrão/repetições/operadores/exposição. MTBF/MTTR, sobrevivência e Weibull exigem tempo de uso, censura e definição de falha apropriados.

Bibliotecas e métodos são implementados e habilitados progressivamente. Os 32 registros do histórico não bastam para afirmar elegibilidade de todos os modelos. Análise descritiva e cenários determinísticos devem continuar disponíveis.

## 8. Extensões de domínio incluídas

O anexo `07-catalogo-funcional-analitico.md` preserva todos os recursos e métodos funcionais recebidos (comercial/marketing/valor, financeiro, indústria e jurídico/gestão). Faz parte do escopo de planejamento; não é uma promessa de execução imediata de todos os modelos.

Novas famílias de área, além das 32 atuais: previsão de demanda; campanhas/canais e orçamento de marketing; valor do cliente e satisfação; orçamento empresarial/investimentos/contabilidade gerencial; capacidade e recursos; medição/calibração; expedição/transporte/rotas; desenvolvimento/experimentos de produto; obrigações contratuais e ocorrências jurídicas; central de problemas/oportunidades; decisões/planos de ação/avaliação e experimentos gerenciais.

A contagem de telas finais será decidida ao distribuir essas funções entre abas e novas janelas. Não chamar o escopo ampliado de apenas “32 telas concluídas”. As 32 são o inventário inicial, preservado no mapa CSV. Telemetria/sensores são fontes futuras; entrada inicial por formulário e CSV/Excel/PDF conferidos.

Jurídico organiza contratos, prazos, evidências e avaliações profissionais; previsão de resultado judicial continua fora do escopo inicial. Fiscal e contabilidade são gerenciais, sem obrigação oficial inferida por modelo probabilístico.

## 9. IA generativa futura

IA consulta catálogo, resultados matemáticos e documentos autorizados; apresenta origem de afirmações, lacunas, hipóteses e recomendações. Cálculos vêm de ferramentas do motor, não de números inventados em texto. Cada resposta distingue fato registrado, resultado calculado, hipótese e recomendação.

Adaptador inicialmente desabilitado. Sem dependência de IA para confirmar operação, abrir ERP, emitir consulta ou rodar estatística local do servidor. Integração externa exige política de quais dados podem sair, provedor, retenção, credencial de serviço e trilha; não presume autorização para transmitir arquivos ao criar este plano.

Recuperação documental aplica permissões antes da busca e da montagem do contexto. Documentos e resultados de ferramentas são dados não confiáveis como instruções; impedir que texto de documento altere regras de acesso ou execute comandos. Ferramentas de IA inicialmente de leitura/cálculo; propostas de ação separadas de execução do gestor.

## 10. Aceite e sequência

Fundação semântica entra em B01–B04, não só após ERP pronto. Indicadores/descritivos acompanham cada módulo B05–B11. Novas áreas entram em B14; métodos avançados em B15, sujeitos a validação; IA futura em B16. Piloto operacional pode ocorrer sem modelos avançados, que continuam no backlog e não são marcados concluídos.

Aceites: fórmula e registros rastreáveis; mesmas definições em todas as telas; cancelamento sem duplicação; ausente distinto de zero; simulação sem efeitos operacionais; seed/snapshot reproduzíveis; teste de método conhecido; otimização respeita restrições e informa inviabilidade; avaliação temporal/calibração; fallback; achado deduplicado; decisão ligada ao resultado observado; falha Python/IA não bloqueia operações; backup recupera catálogos, versões, datasets necessários, execuções e evidências.
