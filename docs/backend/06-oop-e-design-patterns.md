# Orientação a objetos e padrões de projeto — Renda+ ERP

25/09/2026. Diretriz solicitada pelo usuário: utilizar OOP e design patterns no desenvolvimento do backend Java e Python. Os padrões devem resolver responsabilidades concretas; não criar uma classe/interface por campo ou usar todos os padrões em todo módulo.

## 1. Organização e princípios

Java: domínio com objetos que preservam invariantes, serviços de aplicação que coordenam casos de uso e infraestrutura em adaptadores. Encapsular estado, usar tipos explícitos, manter alta coesão e dependências pequenas. Evitar setters públicos que permitam tornar um pedido “confirmado” sem executar suas regras.

Preferir composição a herança. Herança somente quando há substituição comportamental válida; Cliente e Fornecedor podem ser papéis de Parceiro, em vez de subclasses incompatíveis. Value Objects imutáveis para dinheiro, quantidade, moeda, período, documento normalizado, identificadores e versões. DTOs/records de transporte não substituem agregados de domínio.

SOLID orienta divisão de responsabilidades e inversão de dependências. Interfaces pertencem ao módulo consumidor quando representam uma porta; não depender de Spring/JPA dentro dos conceitos de domínio quando isso prejudicar testes e clareza. Funções puras são adequadas para fórmulas, transformações e estatística; OOP não exige envolver cada cálculo trivial em um objeto.

Python: classes/Protocols para contratos de processadores, datasets, métodos analíticos e adaptadores; dataclasses/modelos validados para entradas e saídas; funções vetorizadas para cálculos. Estado de execução explícito; sem singletons mutáveis compartilhando dados de empresas/execuções.

## 2. Mapa de padrões

| Padrão | Aplicação no ERP | Limite/critério |
| --- | --- | --- |
| Entity/Aggregate | Pedido, revisão de BOM, título, reserva, confirmação de repasse | Agregado protege suas invariantes; não colocar todo ERP no agregado Projeto |
| Value Object | Money, Quantity, DateRange, ProjectId, Revision, ConfidenceInterval | Imutável, igualdade por valor, unidade/moeda explícitas |
| Repository | Carregar/salvar agregados por porta | Evitar repositório genérico que exponha tabelas/ORM a todos os módulos |
| Unit of Work/transação | Confirmação de pedido, alocação de baixa, reserva/consumo | Usar transação do banco/framework; não inventar segundo coordenador |
| Application Service/Command | ConfirmSalesOrder, PostSettlement, ApplyImport, AcceptDecision | Coordena permissão, versões, transação e resposta; regra interna no domínio |
| Domain Service | Rateio entre títulos/projetos, necessidade líquida | Para regra que não pertence naturalmente a uma entidade; sem serviço gigante |
| Strategy | Base de repasse, arredondamento, classificação, método de previsão/otimização | Contrato e seleção versionados; habilitar só estratégia elegível |
| Factory | Construção validada de agregado, escolha de extrator/solver | Registro explícito de tipos permitidos; não carregar classe arbitrária por texto do usuário |
| State | Transições complexas de pedido/job/modelo/achado | Enum + política de transição é suficiente para casos simples; classes por estado só se necessário |
| Specification/Policy | Elegibilidade de modelo, aprovação, garantia, filtros tipados | Regras compostas testáveis; autorização continua no servidor |
| Adapter + Ports | Banco, storage, parser PDF/OFX, solver, provedor de IA | Domínio independente de fornecedor; testes de contrato por adaptador |
| Domain Events/Observer | Fato confirmado invalida indicador e agenda processamento | Entre processos usar outbox durável; listener em memória sozinho não garante entrega |
| Outbox + Inbox/idempotent consumer | Projeções, tarefas e reprocessamento | Deduplicar eventos e preservar ordem/versão quando necessária |
| CQRS leve | Comandos de escrita e consultas gerenciais separadas | Mesmo banco inicialmente; não exige event sourcing ou microserviços |
| Decorator | Métricas, logs, timeout e cache de consulta | Retry só para operações seguras/idempotentes; não esconder efeitos |
| Pipeline/Chain of Responsibility | Arquivo → extração → normalização → qualidade → candidato | Saída de cada etapa com esquema e proveniência; falha não some |
| Facade | ProjectOverviewQuery agrega vínculos de módulos | Fachada de consulta não vira dona dos dados nem transação universal |
| Builder | Montar cenário ou definição com muitos parâmetros | Usar apenas quando melhora validação/clareza em relação a construtor/factory |

Não adotar por padrão: microserviço por entidade, event sourcing de toda a aplicação, herança profunda, Service Locator, Singleton com estado mutável, framework próprio de ORM ou uma classe “MotorERP” com todas as regras.

## 3. Exemplo conceitual de objetos Java

```text
sales.domain
  SalesOrder
    confirm(ConfirmationPolicy, Instant) -> OrderConfirmation
    amend(ApprovedAmendment) -> SalesOrderAmended
    cancel(CancellationPolicy, Reason) -> SalesOrderCancelled
  SalesOrderLine, PaymentSchedule, OrderStatus
  SalesOrderId, Money, Quantity, OrderVersion
sales.application
  ConfirmSalesOrderHandler
  SalesOrderRepository (porta)
  ProjectProvisioning (porta intermodular)
  TitleProvisioning (porta intermodular)
  CommandReceiptStore, EventOutbox (portas de plataforma)
sales.infrastructure
  Jdbc/JpaSalesOrderRepository, HttpSalesOrderController
```

Sequência: controller valida schema → handler verifica ator/permissão e chave → transação carrega pedido/versão → agregado confirma invariantes → contratos dos módulos criam projetos/títulos na mesma transação local → persistir agregados, recibo do comando, auditoria e outbox → commit → resposta recuperável. O evento externo após commit não substitui a criação atômica exigida pelos invariantes.

Money soma/subtrai somente mesma moeda, não contém double e retorna novo valor. Quantity conserva unidade; conversão usa regra explícita. Reversal referencia o lançamento original e seu valor, em vez de recalcular o passado com regras atuais.

## 4. Exemplo conceitual do motor analítico

```text
IndicatorDefinition (imutável por versão)
DatasetSnapshot (corte e hash)
AnalysisRequest (método, versão, parâmetros)
AnalysisStrategy (validate_eligibility, execute)
  DescriptiveAnalysis
  NaiveForecast
  ExponentialSmoothingForecast
  IntermittentDemandForecast
  CashMonteCarlo
  CapacityOptimization
AnalysisResult (métricas, intervalos, limites, artefatos)
FindingPolicy (resultado -> proposta de achado)
Decision (aceitar/rejeitar/adiar com justificativa)
DecisionEvaluation (esperado vs observado)
```

StrategyRegistry seleciona método permitido por ID/versão e estado; EligibilityPolicy pode retornar “dados insuficientes” com causas. JobRunner gerencia lease/cancelamento/recursos. StorageAdapter lê somente snapshot autorizado. Resultado é validado no Java antes de publicação. Método não recebe repository de pagamentos/estoque nem credencial do banco transacional.

Estados de modelo: experimental não ganha publicação automática por concluir treino. ValidationPolicy compara com baseline e verifica critérios antes de habilitar. Suspender modelo não apaga suas execuções históricas. Fallback para método de referência é decisão explícita e registrada.

## 5. Testes arquiteturais e revisão

- Verificar ausência de ciclos entre módulos e acesso às implementações internas alheias.
- Testar invariantes chamando objetos/casos de uso, não apenas controllers.
- Contract tests dos ports/adapters (storage, solver, parser, integração interna).
- Property-based tests são opção para somas de parcelas/rateios/reversões e invariantes numéricas, com casos legíveis de referência.
- Testes de persistência/concorrência contra banco real continuam necessários; mock de Repository não comprova transação.
- Critério de revisão: explicar a responsabilidade de cada classe, invariantes protegidas, padrão utilizado e por que um desenho mais simples seria insuficiente.
- Cada ADR relevante registra alternativas rejeitadas e custo operacional; não exigir um ADR para cada classe pequena.

## 6. Ordem de adoção

B01 define módulos, agregados, Value Objects e catálogo de padrões. B02 estabelece ports/adapters, transações e contratos. B03–B11 aplicam padrões aos fluxos reais. O motor introduz Strategy/Policy/Pipeline e catálogo de definições conforme necessidade. B15 habilita os métodos analíticos sem trocar os contratos centrais. A regra é evoluir a partir dos casos de uso, mantendo compatibilidade e testes.
