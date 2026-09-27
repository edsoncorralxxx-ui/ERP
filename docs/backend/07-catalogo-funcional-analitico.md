# Catálogo completo das funcionalidades analíticas incorporadas

25/09/2026. Catálogo funcional do documento fornecido pelo usuário, incorporado ao escopo. Arquitetura e execução seguem 05-motor-dados-analise-decisao.md; menções a funcionamento offline foram adaptadas para rede local com servidor. Os métodos dependem de elegibilidade e validação; as referências externas são as fornecidas no documento, sem nova verificação nesta exportação.

## Funcionalidades e métodos


Os métodos abaixo pertencem ao escopo. Sua execução dependerá de dados apropriados e validação; uma funcionalidade poderá começar com cálculo determinístico e habilitar modelos estatísticos posteriormente.

### Comercial, marketing e valor para o cliente

| Recursos e formulários | Dados coletados e classificados | Métodos | Informação para decisão |
|---|---|---|---|
| **Clientes, unidades e contatos** | Segmento, localização, equipamentos, relacionamento e histórico | Frequências, Pareto e concentração; agrupamento por similaridade quando houver dados | Dependência de clientes, segmentos atendidos e lacunas comerciais |
| **Prospecção e oportunidades** | Origem, necessidade, estágio, interações e motivos de perda | Conversão por etapa, tempo de permanência, atualização bayesiana de taxas; regressão logística validada | Oportunidades prioritárias e pontos de perda no funil |
| **Propostas e precificação** | Escopo, preço, desconto, custo, prazo e resultado da negociação | Margem de contribuição, ponto de equilíbrio, sensibilidade; elasticidade quando identificável | Efeito de descontos e condições sobre margem e conversão |
| **Pedidos, contratos e carteira** | Quantidades, valores, datas, revisões, cancelamentos e pendências | Análise de coortes, decomposição por produto/cliente, taxas de crescimento | Evolução da carteira e descompasso entre vendas, produção e entrega |
| **Previsão de demanda** | Pedidos confirmados por produto e período, perdas, sazonalidade e exposição comercial | Referência ingênua; suavização exponencial; Croston/SBA para demanda intermitente; ARIMA quando elegível | Faixas de demanda futura para compras e capacidade |
| **Campanhas e canais** | Investimento, contatos, oportunidades, conversões e receitas vinculadas | Custo por aquisição, retorno por coorte, testes controlados e inferência bayesiana | Canais que geram negócios e experimentos que merecem continuidade |
| **Planejamento de marketing** | Orçamento, capacidade comercial e resposta observada por canal | Programação linear; curvas de resposta e análise marginal quando estimáveis | Distribuição sugerida do orçamento, com limites e hipóteses |
| **Plano de valor do cliente** | Problema inicial, metas acordadas, referência anterior, investimento e medições posteriores | Custo total de propriedade, retorno, payback, valor presente e sensibilidade | Benefício econômico e operacional esperado e observado |
| **Satisfação e relacionamento** | Pesquisas, reclamações, recorrência, atendimento e recomendações | Distribuições, intervalos de confiança, coortes e associação com resultados | Clientes com dificuldades, oportunidades de melhoria e expansão |

**Valor para o cliente será medido explicitamente:** precisão, perdas, produtividade, disponibilidade, tempo, custo operacional e benefício financeiro poderão compor o plano de cada cliente. As metas serão pactuadas por projeto; benefícios não medidos permanecerão como hipóteses.

Comparações antes/depois serão apresentadas como evidência observacional. Alegações de efeito causal dependerão de desenho experimental ou comparação controlada adequada.

### Financeiro, contabilidade gerencial e fiscal

| Recursos e formulários | Dados coletados e classificados | Métodos | Informação para decisão |
|---|---|---|---|
| **Contas a receber e cobrança** | Parcelas, vencimentos, pagamentos, atrasos e renegociações | Faixas de atraso, distribuição do tempo de recebimento; modelos de sobrevivência quando elegíveis | Entradas prováveis, atraso recorrente e prioridades de acompanhamento |
| **Contas a pagar e tesouraria** | Obrigações, juros, descontos, vencimentos e recursos disponíveis | Equivalência financeira, custo efetivo e otimização com restrições | Alternativas de pagamento e necessidade de capital |
| **Conciliação e consistência financeira** | Extratos, títulos e liquidações | Correspondência por regras, tolerâncias monetárias e detecção robusta de valores atípicos | Duplicidades, diferenças e movimentos sem vínculo |
| **Fluxo de caixa e cenários** | Saldos, compromissos, recebimentos esperados e hipóteses | Projeção determinística, Monte Carlo e testes de estresse | Probabilidade estimada de insuficiência de caixa e período de exposição |
| **Custos e resultado por projeto** | Materiais, serviços, horas, despesas, receita e impostos | Custeio por atividade/tempo, decomposição preço–quantidade–mix e análise de desvios | Fontes de perda de margem e projetos que geram resultado |
| **Orçamento empresarial** | Metas, receitas, custos fixos/variáveis e realizado | Análise de variações, cenários e sensibilidade | Onde o orçamento se afastou da execução e quais medidas testar |
| **Investimentos e desenvolvimento** | Desembolso, benefícios, vida útil e riscos | VPL, TIR quando aplicável, payback descontado e simulação | Comparação de investimentos e condições para viabilidade |
| **Repasses e reservas** | Beneficiários, bases, percentuais, vigência e pagamentos | Álgebra de alocação, restrições de soma e análise de sensibilidade | Distribuição explicável e efeito sobre liquidez |
| **Contabilidade gerencial** | Competência, classificação, centros de resultado e critérios de rateio | Matrizes de alocação, reconciliação e análise vertical/horizontal | Resultado por área, cliente, produto e projeto |
| **Fiscal gerencial** | Documentos, natureza da operação, competência, parâmetros e apuração externa | Regras exatas por vigência, funções por faixas e comparação de cenários | Divergências, exposição e efeito financeiro de hipóteses |

Projeções de caixa separarão compromissos confirmados de negócios potenciais. Dependências entre vendas, recebimentos e compras serão preservadas nas simulações.

O escopo fiscal e contábil permanece de gestão e conferência. Classificações legais e obrigações oficiais não serão inferidas automaticamente por um modelo probabilístico.

### Engenharia, produção, compras e logística

| Recursos e formulários | Dados coletados e classificados | Métodos | Informação para decisão |
|---|---|---|---|
| **Produtos, materiais e BOM** | Revisões, componentes, quantidades, serviços e custos | Explosão de materiais, operações matriciais e sensibilidade de custo | Componentes que mais influenciam custo e disponibilidade |
| **EAP, cronograma e capacidade** | Precedências, durações, recursos, calendários e execução | Caminho crítico; PERT com estimativas documentadas; Monte Carlo e programação por restrições | Gargalos, risco de atraso e alternativas de sequenciamento |
| **Ordens de produção e apontamentos** | Tempos, consumo, quantidades, espera, perdas e retrabalho | Estatística de tempos, produtividade e curvas de aprendizado | Etapas instáveis, desperdícios e oportunidades de melhoria |
| **Planejamento de recursos** | Carga de trabalho, equipes, máquinas e terceirização | Programação linear inteira e programação por restrições | Alocação sugerida que respeite capacidade, precedências e datas |
| **Qualidade e inspeções** | Medições, limites técnicos, defeitos e lotes | Pareto, cartas de controle, EWMA/CUSUM e capacidade de processo quando válida | Mudanças no processo e características fora da especificação |
| **Medição e calibração** | Referências, repetições, operadores e instrumentos | Viés, repetibilidade, reprodutibilidade e propagação de incerteza | Confiabilidade das medições utilizadas nas decisões |
| **Cotações e fornecedores** | Preço, frete, qualidade, prazo prometido e entrega real | Custo total, distribuição de lead time e pontuação multicritério transparente | Fornecedor adequado ao custo, prazo e risco do projeto |
| **Compras e reposição** | Necessidades da BOM, reservas, saldos e prazos | MRP; ponto de reposição e estoque de segurança para itens recorrentes | O que comprar, quanto e quando |
| **Estoque e inventário** | Local, propriedade, consumo, reserva, saldo e ajuste | ABC por valor; XYZ por variabilidade; cobertura e giro | Excesso, ruptura, baixa movimentação e divergências físicas |
| **Terceirização** | Remessas, retornos, consumo, serviços e perdas | Balanço de materiais, variação de prazo e comparação de custo | Material em terceiros e desempenho da fabricação contratada |
| **Expedição, transporte e instalação** | Dimensões, carga, locais, recursos, janelas e custos | Otimização de rotas e alocação; distribuição do prazo de entrega | Viagens, agendas e entregas com menor custo e atraso |
| **Assistência e manutenção** | Falhas, horas de uso, reparos, peças, garantia e preventivas | MTBF/MTTR com exposição conhecida; Kaplan–Meier e Weibull quando adequados | Falhas recorrentes, risco de indisponibilidade e manutenção sugerida |
| **Desenvolvimento de produtos** | Requisitos, testes, versões, custos e desempenho em campo | Planejamento de experimentos, regressão, ANOVA, superfície de resposta e análise de falhas | Alterações que melhoram desempenho, confiabilidade e custo |

O planejamento de produção usará restrições explícitas de precedência e disponibilidade de recursos, como no problema de *job shop*. Rotas usarão matrizes de distância/tempo fornecidas ou importadas; a operação em rede local sem internet não pressupõe trânsito em tempo real. [Programação de produção](https://developers.google.com/optimization/scheduling/job_shop), [roteirização](https://developers.google.com/optimization/routing/vrp).

Cartas de controle, capacidade e experimentos terão verificações de aplicabilidade. Limites de controle estatístico serão distintos dos limites técnicos de especificação. [Controle de processos — NIST](https://itl.nist.gov/div898/handbook/pmc/pmc.htm), [experimentos — NIST](https://www.itl.nist.gov/div898/handbook/pri/pri.htm).

### Jurídico, gestão e melhoria contínua

| Recursos e formulários | Dados coletados e classificados | Métodos | Informação para decisão |
|---|---|---|---|
| **Contratos, garantias e obrigações** | Partes, versões, entregáveis, cláusulas cadastradas, vigências e evidências | Regras de prazo, dependências e matrizes de risco | Obrigações pendentes, vencimentos e exposição contratual |
| **Ocorrências e riscos jurídicos** | Evento, contrato, documentação, responsável e avaliação profissional | Cenários e impacto esperado, quando houver probabilidade fundamentada | Priorização de providências e necessidade de revisão |
| **Central de problemas e oportunidades** | Desvios, tendências, hipóteses, exposição, impacto e evidência | Regras, anomalias estatísticas e priorização multicritério | Lista explicável do que merece atenção |
| **Planos de ação** | Decisão, responsável, prazo, custo, meta e execução | Comparação previsto/realizado e avaliação de efeito | Quais intervenções produziram resultado |
| **Experimentos gerenciais** | Hipótese, grupos, intervenção, métricas e período | Testes controlados, análise de poder e intervalos de confiança | Evidência para mudar preço, processo, produto ou abordagem comercial |
| **Relatórios e avaliação da gestão** | Indicadores e decisões de todas as áreas | Tendência, comparação por coorte e análise de contribuição | Evolução de valor entregue ao cliente e desempenho da Fourtech |

A previsão de resultado de processos judiciais não integra o escopo inicial. A parte jurídica organizará contratos, obrigações, evidências e cenários informados por responsáveis.

## 4. Aplicação concreta da matemática e da IA

### Cálculo diferencial e integral

| Método | Uso no ERP | Condição |
|---|---|---|
| **Derivadas e diferenças finitas** | Variação de margem com preço; efeito de custo, juros, prazo e capacidade | Modelo e unidades definidos; dados discretos usam diferenças finitas |
| **Derivadas parciais e gradientes** | Sensibilidade simultânea a preço, volume, custo, prazo e desperdício | Relações estimadas ou hipóteses explícitas |
| **Otimização com restrições** | Preço, compras, produção, orçamento e alocação de recursos | Respeitar limites comerciais, operacionais e financeiros |
| **Integração numérica** | Consumo acumulado a partir de taxas, volume processado e benefícios ao longo do tempo | Taxas medidas, intervalos conhecidos e tratamento de lacunas |
| **Desconto de fluxos** | Valor presente de receitas, despesas e benefício do equipamento | Fluxos financeiros discretos calculados por somatórios |
| **Sensibilidade de modelos** | Identificar quais variáveis dominam o resultado | Informar intervalo de validade e incerteza |

Por exemplo:

- Lucro modelado: `π(p) = p × q(p) − C(q(p))`.
- Benefício acumulado: integral da taxa de economia ao longo do tempo, descontados os custos adicionais.
- Consumo de materiais: `necessidade = matriz da BOM × quantidades planejadas`.

A primeira expressão só orientará preço quando a relação entre preço e demanda tiver suporte. Caso contrário, servirá para cenários assumidos pelo gestor.

**Funções fiscais por faixas, decisões inteiras e regras contratuais serão tratadas por trechos ou restrições apropriadas.** Não se aplicará uma derivada onde o modelo não for diferenciável.

### Estatística, probabilidade e álgebra linear

O motor disponibilizará:

- Média, mediana, quantis, dispersão, distribuições e comparações por grupo.
- Intervalos de confiança e de previsão, apresentados com significados distintos.
- Regressão linear regularizada e logística, com diagnóstico e validação.
- Atualização bayesiana, identificando hipóteses e influência das distribuições iniciais.
- Monte Carlo com cenários, dependências e sementes reproduzíveis.
- Matrizes para BOM, custos, capacidade e rateios.
- PCA e agrupamentos para exploração multivariada, após padronização e validação de estabilidade.
- Otimização linear, inteira e não linear, conforme o problema.

Uma associação estatística não será apresentada como causa. Uma pontuação comercial não será chamada de probabilidade sem validação de calibração. [Calibração probabilística](https://scikit-learn.org/stable/modules/calibration.html).

### Integração futura com IA generativa

A IA terá acesso controlado ao catálogo semântico, aos resultados matemáticos e aos documentos autorizados. Poderá:

- Responder perguntas sobre indicadores e sua composição.
- Explicar alertas e comparar cenários.
- Sugerir classificações, hipóteses e planos de ação.
- Resumir contratos, propostas, chamados e relatórios com referência à origem.
- Identificar informações faltantes para responder uma pergunta.
- Preparar relatórios gerenciais e de valor entregue ao cliente.

Cálculos serão executados pelas ferramentas do motor. A resposta da IA distinguirá **fato registrado, resultado calculado, hipótese e recomendação**.

A integração ficará desativada inicialmente. O núcleo operacional continuará funcionando sem IA e, em rede local, poderá operar sem internet externa, mantendo conexão com o servidor. Acesso a um provedor externo exigirá configuração explícita dos dados permitidos para envio.

