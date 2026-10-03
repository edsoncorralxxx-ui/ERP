# Sprint 12 — Fiscal refeito pelo mock: painel, apuração por anexo, obrigações, classificação e tabelas

Situação: **Entregue para Review** (03/10/2026). Planning aprovado pelo PO em 03/10/2026 ("pode implementar"), com as propostas das perguntas como escritas. Pedido do PO: "planeje novamente e refatore o módulo fiscal; implemente todas as funcionalidades do mock *Renda+ ERP MOCK*; se for necessário altere o banco, o backend e o front-end; pode usar os dados de exemplo do mock".

Referência: as cinco telas da *Seção Fiscal* do mock (artefato *Renda+ ERP MOCK*): **Painel fiscal**, **Apuração do Simples Nacional**, **Obrigações fiscais e acessórias**, **Classificação fiscal de itens** e **Tabelas e parâmetros do Simples Nacional**. Os dados do mock estão em `exemplos/fiscal-exemplo.json`.

## Objetivo

Trocar as três janelas da Sprint 7 (*Impostos gerenciais*, *Competência fiscal* e *Parâmetros fiscais*) pelas cinco do mock, com tudo funcionando de ponta a ponta (app → servidor → banco): apurar o DAS **por anexo** (I, II e III) com a **repartição por tributo**, acompanhar o RBT12 contra o **sublimite** e o **limite** do Simples, registrar a **transmissão do PGDAS-D**, gerar e pagar a **guia DAS**, fechar a competência por **etapas**, controlar as **obrigações** num calendário e manter a **classificação fiscal** de cada item, que é de onde sai o anexo da receita.

## O mock comparado com o que existe

| Tela do mock | O que o mock faz | O que existe hoje (Sprint 7 e 8) | O que muda |
|---|---|---|---|
| **Painel fiscal** | Filtro por competência; 4 indicadores (DAS a pagar, RBT12, receita acumulada no ano, obrigações nos próximos 7 dias); gráficos RBT12 × sublimite e limite (Linha), DAS por tributo (Rosca3D) e DAS por anexo em 12 competências (Empilhadas3D), cada um com filtro, tabela e análise; próximas obrigações; barras de limite e fechamento; últimas guias DAS; aviso da opção IBS/CBS; análise com IA | Não existe | Tela nova, com os números vindos do servidor (`GET /fiscal/dashboard`) |
| **Apuração do Simples Nacional** | Cabeçalho (competência, estabelecimento, reconhecimento da receita, vencimento do DAS, RBT12, receita, DAS apurado, situação); abas **Receitas** (por anexo, com as notas), **Cálculo do DAS** (alíquota efetiva por anexo e repartição por tributo, com o ISS limitado a 5%), **RBT12** (12 meses, gráfico e barras), **Guia DAS** (documento de arrecadação, conta de pagamento, Gerar DAS, Registrar pagamento, guias anteriores), **Fechamento** (7 etapas com responsável e data) e **Histórico de competências**; botões Calcular, Transmitir PGDAS-D, Gerar DAS, Imprimir memória | *Impostos gerenciais* (lista do ano) e *Competência fiscal* (receita de produto e serviço, simulação com 2 anexos, conferência do contador que cria o título do DAS, fechar e reabrir) | Uma janela por competência, no desenho do mock. Receita e cálculo **por anexo** e **por tributo**; a "conferência do contador" vira a **Guia DAS**; o fechamento passa a ter **etapas**; a lista do ano vira a aba *Histórico de competências* |
| **Obrigações fiscais e acessórias** | Lista com filtros (texto, situação, esfera), prazo em dias, calendário do mês com os vencimentos, ficha da obrigação com **Entregue** e **Anexar recibo**, Nova obrigação, Exportar agenda | Não existe (só a pendência do DAS no fluxo de caixa) | Tela, tabelas e regras novas; o PGDAS-D e o DAS de cada competência se atualizam sozinhos pela apuração e pelo financeiro |
| **Classificação fiscal de itens** | Abas *Produtos e materiais* (NCM, CFOP interno/interestadual, CSOSN, origem, anexo, situação) e *Serviços* (item da LC 116, NBS, anexo, retenção de ISS, situação); filtros; painel do item; sugestão da IA com Aplicar/Ignorar; Abrir cadastro do item | Só o NCM (produto) e o código da LC 116 (serviço) no cadastro do item | Perfil fiscal do item (tabela nova do fiscal) e a situação Classificado / Revisar / Sem classificação |
| **Tabelas e parâmetros do Simples** | Abas **Parâmetros** (empresa no Simples, limites, aviso ao atingir, Fator R, **opção IBS/CBS 2027**), **Anexos e faixas** (anexos I a V, faixa atual destacada, repartição por faixa) e **Atividades e anexos**; Histórico de alterações | *Parâmetros fiscais*: revisões com vigência, só anexo de produto e de serviço, sem repartição | Parâmetros por anexo (I a V) com a repartição dos tributos, dados da empresa no Simples, limites, opção IBS/CBS e atividades; as revisões com vigência continuam e viram o *Histórico de alterações* |

## O que a refatoração muda nos conceitos da Sprint 7

| Antes (Sprint 7/8) | Depois (Sprint 12) | Por quê |
|---|---|---|
| Receita por **tipo da nota** (Produto → Anexo II, Serviço → Anexo III) | Receita por **anexo da linha da nota**, vindo da classificação fiscal do item (I revenda, II fabricação, III serviços) | O mock separa a revenda de peças (Anexo I) da fabricação (Anexo II); era o risco anotado na Sprint 7 ("o anexo passa a ser por natureza da operação") |
| Parâmetros com faixas por **tipo** | Parâmetros com faixas e **repartição dos tributos** por **anexo** (I a V) | Cálculo do DAS por tributo e gráfico por tributo do painel |
| **RBT12 informado** (um valor por competência) | **Histórico mensal de receita** anterior ao Renda+, por anexo, informado ou carregado do PGDAS-D; o RBT12 passa a ser sempre a soma dos 12 meses. O RBT12 informado fica só como reserva para mês sem histórico | O mock mostra 24 meses de receita, o RBT12 mês a mês e o acumulado do ano contra o sublimite — impossível com um valor solto |
| **Simulação gerencial** × **valor do contador** | **Cálculo do DAS** (Renda+) × **Guia DAS** (valor do PGDAS-D, com número do documento, multa e juros); a diferença continua aparecendo | É o desenho do mock; a separação da ADR-011 (cálculo nunca substitui o valor declarado) se mantém |
| Fechar = ter conferência | Fechar = as **7 etapas** concluídas (algumas se concluem sozinhas) | Aba *Fechamento* e barra de fechamento do painel |

## Perguntas ao PO

| # | Pergunta | Proposta (se você só disser "sim") |
|---|---|---|
| 1 | **Anexo por item**: a receita passa a ser separada pelo anexo da classificação fiscal de cada item (I revenda, II fabricação, III serviços). Confirma com o contador? | Sim. Item sem classificação usa o padrão pelo tipo da linha do pedido: equipamento → II, material → II, serviço → III, e a competência mostra a pendência "item sem classificação". Notas já registradas ficam como estão hoje (produto → II, serviço → III) |
| 2 | **Histórico de receita**: na Sprint 7 você decidiu que o sistema começa do zero. O mock mostra 24 meses. Podemos ter o histórico mensal por anexo (meses antes de 09/2026)? | Sim: digitado por competência ou carregado de um arquivo JSON (o mesmo formato de `exemplos/fiscal-exemplo.json`). Os números do mock vão só para o banco de teste; na sua base entra o histórico real do PGDAS-D quando você mandar |
| 3 | **Guia DAS no lugar da conferência do contador**: o valor da guia é o declarado no PGDAS-D; o cálculo do Renda+ é a sugestão. OK? | Sim. As conferências já registradas viram guias (sem número do documento) com o mesmo título a pagar; nada se perde |
| 4 | **Nota "Pendente" de autorização**: o mock mostra a NFS-e 000518 ainda não autorizada e soma na receita. O Renda+ não emite nota; quer marcar na nota a situação *Autorizada* / *Pendente* (com o protocolo)? | Sim, marcada à mão na nota (padrão: Autorizada). Nota pendente entra na receita, gera alerta e bloqueia a etapa "Autorizar notas pendentes" do fechamento |
| 5 | **"Análise com IA" do mock**: a ADR-014 deixa a IA desligada. | No lugar da IA, **alertas por regra** com o mesmo visual (sublimite, nota pendente, item sem classificação, NBS ausente, obrigação vencendo), sem o selo "IA" e sem percentual de confiança. A IA de verdade fica para o épico B16 |
| 6 | **Obrigações**: as 15 do mock são exemplos de 08 e 09/2026. | O sistema traz **modelos recorrentes** (PGDAS-D e DAS dia 20, eSocial e EFD-Reinf dia 15, FGTS Digital dia 20, DeSTDA dia 28, DCTFWeb último dia do mês seguinte, DEFIS 31/03) que criam as ocorrências de cada competência; você inclui as avulsas em *Nova obrigação*. As 15 do mock vão só para o banco de teste |
| 7 | **Opção IBS/CBS no 1º semestre de 2027**: no mock o prazo é 30/09/2026, que já passou (hoje é 03/10/2026). | A tela registra a decisão tomada (dentro ou fora do DAS), com data e quem registrou, e mostra "prazo encerrado" e a data de desistência (30/11/2026). Confirme se a empresa já optou |
| 8 | **Atividades e dados da empresa no Simples** (CNAE 2829-1/99 e 3321-0/00, atividades do mock): são os da empresa? | Semeados como premissa, como a revisão 1 dos parâmetros na Sprint 7, e editáveis pelo Administrador |
| 9 | **Permissões** (PD-009) | Consulta só vê; Administrador faz tudo (permissões novas abaixo) |

## Decisões do planning (propostas)

| Tema | Decisão |
|---|---|
| Anexo da linha | Ao registrar a nota, cada linha guarda o **item** (da linha do pedido) e o **anexo** daquele momento (cópia, para a receita de um mês fechado não mudar quando a classificação mudar). Mudar a classificação depois não altera notas registradas; a aba *Receitas* aponta a diferença se houver |
| Cálculo por anexo | Mesmo RBT12 total para todos os anexos; faixa pelo RBT12; alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12; DAS do anexo = receita do anexo × alíquota efetiva, em centavos, meio para o par (HALF_EVEN, PD-002). Na 1ª faixa a efetiva é a nominal |
| Repartição por tributo | DAS do anexo × percentual da faixa de cada tributo, em centavos (HALF_EVEN); a diferença de centavos vai para o tributo de maior participação, para os tributos somarem exatamente o DAS do anexo |
| ISS limitado | No Anexo III, se o ISS efetivo (alíquota efetiva × % do ISS) passar de 5%, fica em 5% da receita e o excesso vai para os tributos federais na proporção de cada um (aviso na aba Cálculo, como no mock) |
| 6ª faixa e sublimite | 6ª faixa: ICMS e ISS fora do DAS (repartição zero) com o aviso; RBT12 acima de R$ 4.800.000,00 → "não calculável". Receita acumulada no ano acima do sublimite (R$ 3.600.000,00, com o excesso tolerado de 20%) → alerta |
| RBT12 | Soma da receita dos 12 meses anteriores: notas para os meses a partir do início do Renda+ (09/2026), histórico para os anteriores. Mês sem nenhum dos dois → o RBT12 informado da competência, se houver; senão "não calculável" com os meses que faltam (mês desconhecido continua não sendo zero) |
| Calcular | Grava um cálculo novo (o anterior fica), com a memória por anexo e por tributo; idempotente pela chave |
| Transmitir PGDAS-D | O Renda+ não transmite à Receita: **registra** a transmissão feita no portal (data, número do recibo, receita declarada). A obrigação PGDAS-D da competência passa a *Entregue* |
| Gerar DAS | Registra a guia: número do documento, vencimento, valor principal (sugerido = cálculo), multa e juros; cria o título a pagar do DAS como na Sprint 8 (substitui o anterior sem pagamento; com pagamento, recusa) |
| Registrar pagamento | Pela guia, com a **conta de pagamento**: usa o pagamento de *Contas a pagar* (saída na conta, estorno lá mesmo). Pago, a obrigação DAS passa a *Pago* |
| Fechamento | 7 etapas: (1) conferir notas de saída, (2) autorizar notas pendentes, (3) conferir cancelamentos e devoluções, (4) segregar a receita por anexo, (5) conferir o RBT12 e as faixas, (6) transmitir o PGDAS-D, (7) gerar e pagar o DAS. As etapas 2, 4, 6 e 7 se concluem sozinhas pelos dados; as outras são marcadas com responsável e data. Com as 7 concluídas a competência fica **Encerrada**; reabrir continua exigindo motivo, e competência encerrada continua recusando nota (`TAX_PERIOD_CLOSED`) |
| Situação da competência | *Em apuração* → *Encerrada* (a "Fechada" da Sprint 7) |
| Obrigações | Situação gravada: *A entregar*, *Em preparação*, *Em apuração*, *Aberto*, *Decisão pendente*, *Entregue*, *Pago*. "Vence esta semana" (até 7 dias) e "Atrasada" são calculadas pela data, nunca gravadas. Entregar pede data e número do recibo; o arquivo do recibo fica para a sprint de arquivos (ADR-008) |
| Classificação | Perfil fiscal do item no fiscal: CFOP interno e interestadual, CSOSN, origem (0 a 8), anexo (ou "insumo, não tributa na saída"), NBS e retenção de ISS (Sim, Não, Conforme o município) e a marca "Revisar" com observação. NCM e item da LC 116 continuam no cadastro do item e são editados pela mesma tela. Situação: *Sem classificação* (falta campo obrigatório), *Revisar* (marcado) ou *Classificado* |
| Exportar | *Exportar para planilha* e as tabelas dos gráficos → CSV; *Exportar agenda* → arquivo de calendário (.ics); *Imprimir memória* → memória do cálculo pronta para imprimir |
| Estabelecimento | Uma empresa, um CNPJ: o filtro mostra a Matriz e não muda nada (vários estabelecimentos ficam fora) |
| Permissões | Novas: `tax_period.declare` (PGDAS-D), `tax_das.issue` (gerar DAS, no lugar de `tax_period.confirm`), `tax_period.close_step`, `tax_obligation.update`, `tax_classification.update`, `tax_profile.admin` (dados da empresa, limites, atividades, opção IBS/CBS). `tax.read` em Administrador e Consulta; as demais só no Administrador. Pagar o DAS exige a permissão de pagamento de *Contas a pagar* |

### Exemplo numérico (dados do mock, competência 09/2026)

RBT12 = receita de 09/2025 a 08/2026 = **R$ 3.340.000,00** (5ª faixa nos três anexos). Receita de 09/2026 = **R$ 386.400,00**.

| Anexo | Receita | Nominal / a deduzir | Alíquota efetiva | DAS |
|---|---|---|---|---|
| I — Comércio (revenda de peças) | R$ 11.840,00 | 14,30% / R$ 87.300,00 | (3.340.000,00 × 14,30% − 87.300,00) ÷ 3.340.000,00 = **11,6862%** | **R$ 1.383,65** |
| II — Indústria (fabricação) | R$ 265.500,00 | 14,70% / R$ 85.500,00 | **12,1401%** | **R$ 32.232,02** |
| III — Serviços | R$ 109.060,00 | 21,00% / R$ 125.640,00 | **17,2383%** | **R$ 18.800,12** |
| **Total** | **R$ 386.400,00** | | média 13,57% | **R$ 52.415,79** |

ISS do Anexo III: 17,2383% × 33,50% = 5,7748% da receita, acima de 5% → ISS = 5% × R$ 109.060,00 = **R$ 5.453,00**; o excesso de R$ 845,04 vai para IRPJ, CSLL, COFINS, PIS/Pasep e CPP na proporção deles.

Repartição de 09/2026 por tributo: IRPJ R$ 2.651,69 · CSLL R$ 1.879,03 · COFINS R$ 6.459,27 · PIS/Pasep R$ 1.398,74 · CPP R$ 21.378,89 · IPI R$ 2.417,40 · ICMS R$ 10.777,77 · ISS R$ 5.453,00 = **R$ 52.415,79** (no Anexo II a soma arredondada dá R$ 0,01 a mais e no Anexo III R$ 0,01 a menos; o centavo é ajustado na CPP de cada anexo).

Painel em 09/2026: receita acumulada em 2026 **R$ 2.616.400,00** = 72,7% do sublimite (faltam R$ 983.600,00); RBT12 = 69,6% do limite de R$ 4.800.000,00.

Observação: o mock mostra R$ 52.415,80 porque arredonda cada tributo separadamente; pela regra acima são R$ 52.415,79.

## Banco de dados (migração V18)

| Tabela | Mudança |
|---|---|
| `tax_parameter_revision` | Nova coluna `annexes` (jsonb): por anexo I a V, as 6 faixas e a repartição dos tributos por faixa. **Revisão 2** semeada com as tabelas da LC 123/2006 do mock (anexos I a V; repartição dos anexos I, II e III), vigente a partir de 09/2026; II e III com os mesmos números da revisão 1, então os cálculos já gravados não mudam. `product_annex` e `service_annex` passam a opcionais (só a revisão 1 as usa) |
| `tax_company_profile` (nova) | Dados da empresa no Simples: regime, optante desde, CNAE principal e secundário, município/UF (de *Dados da empresa*), reconhecimento da receita, emissor de NFS-e, limite anual, sublimite, excesso tolerado, aviso ao atingir; versão e trilha |
| `tax_activity` (nova) | Atividade, enquadramento (CNAE ou item da LC 116), anexo, tributos no DAS; semeada com as 5 do mock (pergunta 8) |
| `tax_ibs_cbs_option` (nova) | Período (1º semestre de 2027), escolha (dentro ou fora do DAS), prazo, desistência até, quem e quando registrou |
| `tax_revenue_history` (nova) | Competência anterior ao Renda+, receita por anexo, origem (digitado ou arquivo), quem informou e observação; versão e trilha |
| `document_line` | Novas colunas `item_id` e `annex`; as linhas existentes recebem Produto → II e Serviço → III |
| `business_document` | Novas colunas `authorization_status` (Autorizada / Pendente; existentes = Autorizada) e `authorization_protocol` (pergunta 4) |
| `tax_simulation` | Passa a ser o **cálculo**: novas colunas `annexes` e `taxes` (jsonb) com o resultado por anexo e por tributo; as colunas de produto e serviço ficam para os cálculos antigos |
| `accountant_confirmation` → `tax_das_guide` | Renomeada; novas colunas número do documento, multa, juros e total; as conferências existentes viram guias sem número, com o mesmo título |
| `tax_pgdas_declaration` (nova) | Transmissões registradas: competência, data, número do recibo, receita declarada, quem |
| `tax_closing_step` (nova) | Etapas marcadas à mão: competência, etapa, quem, quando, observação |
| `tax_period.status` | `ABERTA`/`FECHADA` → `EM_APURACAO`/`ENCERRADA` (dados existentes convertidos) |
| `tax_obligation_template` (nova) | Modelos recorrentes (nome, esfera, periodicidade, regra de vencimento, responsável, detalhe); semeados com os 8 da pergunta 6 |
| `tax_obligation` (nova) | Ocorrências: nome, competência, vencimento, esfera, responsável, detalhe, situação, entregue em, recibo, modelo de origem; versão e trilha; uma por modelo e competência |
| `item_fiscal_profile` (nova, do fiscal) | Item, CFOP interno e interestadual, CSOSN, origem, anexo, NBS, retenção de ISS, marca Revisar com observação; versão e trilha |

O módulo `fiscal` passa a depender também de `cadastros` (itens, pela porta pública `ItemQueryApi`, e a gravação do NCM e do item da LC 116 por uma porta nova) — `modulos.json` e `ArchitectureTest`.

## Servidor (API)

| Rota | Para quê |
|---|---|
| `GET /fiscal/dashboard?competence=` | Indicadores, séries dos três gráficos (12 competências), próximas obrigações, barras de limite e fechamento, últimas guias e alertas |
| `GET /tax-periods?year=` | Histórico de competências (receita, RBT12, alíquota efetiva, DAS, pago em, situação) |
| `GET /tax-periods/{competence}` | Cabeçalho e abas: receita por anexo com as notas, cálculo por anexo e por tributo, RBT12 dos 12 meses, guia e guias anteriores, etapas do fechamento |
| `POST /tax-periods/{competence}/simulations` | Calcular (já existe; passa a calcular por anexo e por tributo) |
| `POST /tax-periods/{competence}/declarations` | Registrar a transmissão do PGDAS-D |
| `POST /tax-periods/{competence}/das-guides` | Gerar DAS (substitui `/confirmations`) |
| `POST /tax-periods/{competence}/das-guides/{id}/payments` | Registrar pagamento na conta escolhida |
| `PUT /tax-periods/{competence}/closing-steps/{step}` | Concluir ou desfazer uma etapa manual |
| `POST .../closures`, `POST .../reopenings` | Mantidas (encerrar exige as 7 etapas) |
| `GET /tax-periods/{competence}/memory` | Memória do cálculo para imprimir |
| `PUT /tax-revenue-history/{competence}`, `POST /tax-revenue-history/imports` | Histórico de receita: digitar o mês ou carregar o arquivo (prévia e confirmação, o mesmo arquivo não carrega duas vezes) |
| `GET /tax-obligations`, `POST /tax-obligations`, `PUT /tax-obligations/{id}`, `POST /tax-obligations/{id}/deliveries`, `GET /tax-obligations/calendar.ics` | Lista com filtros, nova obrigação, alteração, entregar/pagar com recibo, exportar agenda |
| `GET /fiscal-classification?tab=&status=&annex=&q=`, `PUT /fiscal-classification/{itemId}` | Lista e gravação do perfil fiscal (com o NCM ou o item da LC 116) |
| `GET/PUT /tax-profile`, `GET/PUT /tax-activities`, `POST /tax-ibs-cbs-options` | Dados da empresa no Simples, limites, atividades, opção IBS/CBS |
| `GET/POST /tax-parameters` | Mantidas, agora por anexo com a repartição |

Eventos novos: `TaxDeclarationRecorded`, `TaxDasGuideIssued` (no lugar de `TaxPeriodConfirmed`), `TaxDasPaid`, `TaxClosingStepCompleted`, `TaxObligationDelivered`, `ItemFiscalProfileUpdated`, `TaxRevenueHistoryRecorded`, `TaxIbsCbsOptionRecorded`. Comandos repetidos não duplicam (Idempotency-Key) e alterações conferem a versão (If-Match), como no resto do sistema.

## App (telas)

| Menu *Fiscal* | Janela | Sai |
|---|---|---|
| Painel fiscal | Nova (`fiscal-dashboard`), no desenho do mock, com `Linha`, `Rosca3D` e `Empilhadas3D` de `window.RendaERP` | — |
| Apuração do Simples | Nova (`tax-assessment`, uma por competência), abas Receitas, Cálculo do DAS, RBT12, Guia DAS, Fechamento e Histórico de competências | *Impostos gerenciais* e *Competência fiscal* (`TaxPeriodsWindow`, `TaxPeriodWindow`) |
| Obrigações | Nova (`tax-obligations`), lista + calendário (`rp-cal`) + ficha | — |
| Classificação fiscal | Nova (`fiscal-classification`), abas Produtos e materiais / Serviços | — |
| Tabelas e parâmetros | Nova (`tax-tables`), abas Parâmetros, Anexos e faixas, Atividades e anexos; Histórico de alterações = revisões | *Parâmetros fiscais* (`TaxParametersWindow`) |

Também: na nota (*Documentos e faturamento*), o anexo de cada linha e a situação de autorização; no cadastro do item, a seta para a classificação fiscal; os alertas no lugar da "Análise com IA" (pergunta 5). Tudo com as classes `rp-*` e os tokens do design system; textos em português, valores `R$ 23.579,23`, datas `DD/MM/AAAA`.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S12-01 | Migração V18 e módulo | Tabelas acima; dados da Sprint 7 e 8 convertidos sem perda (cálculos, conferências → guias com o mesmo título, fechamentos); revisão 2 semeada (teste confere as 30 faixas e as 18 linhas de repartição); `fiscal` → `cadastros` em `modulos.json` |
| S12-02 | Classificação fiscal do item | Perfil fiscal com validação (CFOP de 4 dígitos, CSOSN da lista, origem 0 a 8, NBS no formato `1.2345.67.89`); situação calculada; If-Match e trilha; filtros por situação, anexo e texto; Consulta só vê |
| S12-03 | Anexo nas linhas da nota | Linha da nota guarda item e anexo; item sem classificação usa o padrão e gera pendência; notas antigas com II/III; situação de autorização na nota |
| S12-04 | Histórico de receita | Digitar e carregar o arquivo (prévia, confirmação, hash); `exemplos/fiscal-exemplo.json` carrega 23 meses (10/2024 a 08/2026); competência a partir de 09/2026 recusada (vem das notas) |
| S12-05 | Parâmetros por anexo e dados do Simples | Nova revisão por anexo com repartição (validação: faixas crescentes, repartição de cada faixa soma 100%); dados da empresa, limites, aviso, atividades e opção IBS/CBS com trilha |
| S12-06 | Cálculo do DAS | Por anexo e por tributo como no exemplo (teste unitário com 09/2026 = R$ 52.415,79, ISS limitado a R$ 5.453,00, ajuste de centavo; 08/2026 = R$ 47.866,71; 1ª e 6ª faixas; não calculável); memória por anexo e tributo |
| S12-07 | PGDAS-D e guia DAS | Registrar transmissão; gerar a guia com título a pagar (reconferir substitui, pago recusa); pagar pela guia com a conta; obrigações PGDAS-D e DAS atualizadas |
| S12-08 | Fechamento por etapas | Etapas automáticas e manuais; encerrar só com as 7; reabrir com motivo; nota em competência encerrada recusada |
| S12-09 | Obrigações | Modelos geram as ocorrências da competência uma vez só; nova obrigação; entregar com recibo; prazo e "Atrasada" calculados; filtros; calendário; exportar .ics |
| S12-10 | Painel fiscal | `GET /fiscal/dashboard` com os números do exemplo (DAS R$ 52.415,79, RBT12 R$ 3.340.000,00, acumulado R$ 2.616.400,00 = 72,7% do sublimite); alertas por regra |
| S12-11 | Contratos | OpenAPI das rotas novas e alteradas (`OpenApiContractTest`); eventos, comandos, permissões e erros no B01; `menu.json` com as 5 telas do Fiscal; verificador B01 OK |
| S12-12 | Telas | As 5 janelas no desenho do mock; as 3 antigas removidas; testes de tela (`Sprint12Windows.test.tsx`); Consulta sem botões de ação |
| S12-13 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-12.e2e.ts`, escrito com a primeira tela: carga do histórico → notas de 09/2026 por anexo → Calcular (R$ 52.415,79) → Transmitir PGDAS-D → Gerar DAS → Pagar → etapas → Encerrar → nota recusada; roteiro da Sprint 7 ajustado ao novo fluxo; roda duas vezes no mesmo banco |

Ordem: S12-01 → S12-02 → S12-03 → S12-04 → S12-05 → S12-06 → S12-07 → S12-08 → S12-09 → S12-10 → S12-11 → S12-12 (Apuração primeiro, depois Tabelas, Classificação, Obrigações e Painel) → S12-13.

É uma sprint grande (cinco telas e a troca do modelo de cálculo). Se faltar tempo, sai primeiro a exportação (.ics e CSV), depois o calendário da tela de Obrigações (a lista fica). O mínimo é S12-01 a S12-08, S12-11, a Apuração e as Tabelas do S12-12 e o S12-13.

## Fora do escopo

Transmitir o PGDAS-D ou emitir o DAS pela internet (o Renda+ registra o que foi feito no portal); emitir NF-e/NFS-e; IA generativa (ADR-014; ficam os alertas por regra); anexos IV e V e Fator R na receita (as tabelas ficam cadastradas, sem atividade nesses anexos); ICMS e ISS fora do DAS acima do sublimite (só o alerta); substituição tributária, DIFAL e retenções calculadas (DeSTDA e EFD-Reinf são só obrigações a controlar); arquivo do recibo (ADR-008); mais de um estabelecimento; feriados no vencimento das obrigações (o vencimento é editável); regime de caixa no reconhecimento da receita (a opção aparece, travada em Competência).

## Como verificar (ao final)

1. *Fiscal → Tabelas e parâmetros → Anexos e faixas*: anexos I a V com as faixas e a repartição; a faixa atual destacada.
2. Carregar `exemplos/fiscal-exemplo.json` no histórico (banco de teste): 23 meses; RBT12 de 09/2026 = R$ 3.340.000,00.
3. Registrar as notas de 09/2026 do exemplo com itens dos anexos I, II e III (a NFS-e 000518 como Pendente).
4. *Apuração do Simples* 09/2026 → **Calcular**: anexos I R$ 1.383,65, II R$ 32.232,02 e III R$ 18.800,12; total **R$ 52.415,79**; ISS limitado a R$ 5.453,00 com o aviso.
5. **Transmitir PGDAS-D** (recibo) → a obrigação PGDAS-D fica Entregue. **Gerar DAS** → o título aparece em *Contas a pagar*. **Registrar pagamento** → a obrigação DAS fica Paga e a saída aparece na conta.
6. *Fechamento*: a etapa "Autorizar notas pendentes" só conclui depois de marcar a NFS-e 000518 como Autorizada; com as 7 etapas, **Encerrar**; registrar nota em 09/2026 → recusada.
7. *Painel fiscal*: DAS, RBT12, acumulado (72,7% do sublimite), gráficos e próximas obrigações batendo com a apuração.
8. *Classificação fiscal*: o kit de pesos sem NCM aparece em *Sem classificação*; preencher e gravar → Classificado.
9. *Obrigações*: calendário de outubro com os vencimentos; **Entregue** com recibo tira da lista de pendentes.
10. Entrar como Consulta: vê tudo, não altera nada.

## Riscos

- **Troca do modelo de cálculo**: cálculos e guias da Sprint 7/8 precisam continuar legíveis; a migração é testada num banco com competência simulada, conferida e fechada.
- **Anexo errado = imposto errado**: item mal classificado muda o anexo; por isso o anexo fica na linha da nota, a pendência aparece na apuração e a guia continua sendo o valor declarado.
- **Histórico informado errado** muda a faixa: a diferença entre o cálculo e a guia aparece na mesma competência.
- **Tabelas da LC 123 do mock** podem estar desatualizadas: entram como revisão com fonte e vigência, confirmadas pelo contador (como na Sprint 7).
- **Volume**: cinco telas novas e três removidas; a ordem acima diz o que sai primeiro.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S12-01 Migração V18 e módulo | Pronto | `V18__fiscal_refeito_pelo_mock.sql`: situação EM_APURACAO/ENCERRADA, parâmetros por anexo (revisão 1 convertida; revisão 2 da LC 123 com os anexos I a V e a repartição, vigente desde 09/2026), empresa no Simples, atividades, opção IBS/CBS, histórico de receita e cargas, anexo e item na linha da nota, autorização da nota, conferência → guia DAS (mesmo título), declarações, etapas, modelos de obrigação e obrigações, perfil fiscal do item. Conversão conferida num banco com dados das Sprints 7 e 8 (cálculos, conferências com título e fechamentos) |
| S12-02 Classificação fiscal | Pronto | `FiscalApiTest.classificacaoFiscalComValidacaoESituacao`: CFOP, CSOSN, origem e NBS validados (422 com o campo); Sem classificação → Revisar → Classificado; If-Match; NCM e LC 116 gravados no cadastro do item (trilha `ITEM_UPDATED`); Consulta recebe 403 |
| S12-03 Anexo nas linhas da nota | Pronto | Nota com equipamento (II, EQUIPAMENTO), peça classificada (I, CLASSIFICACAO) e serviço sem classificação (III, PADRAO); notas antigas com MIGRACAO; `PUT /documents/{id}/authorization` (Pendente/Autorizada com protocolo); a nota mostra o anexo de cada linha e a autorização. Classificar o item passa as linhas com o anexo padrão das competências em apuração para o anexo da classificação (ver "Corrigido junto") |
| S12-04 Histórico de receita | Pronto | `historicoDeReceitaComPreviaProblemasEDigitado` e o teste da apuração: prévia não grava, confirmação carrega 12 meses, o mesmo arquivo de novo → `alreadyLoaded`; competência a partir de 09/2026 recusada; digitado com If-Match |
| S12-05 Parâmetros por anexo | Pronto | `parametrosPorAnexoDadosDaEmpresaEAtividades`: faixas crescentes e repartição que soma 100% (422 com o anexo e a faixa); dados da empresa, limites, atividades e opção IBS/CBS com trilha |
| S12-06 Cálculo do DAS | Pronto | `SimplesCalculationTest`: 09/2026 = **R$ 52.415,79** (I R$ 1.383,65, II R$ 32.232,02, III R$ 18.800,12; ISS limitado a R$ 5.453,00 com o excedente redistribuído), 08/2026 = R$ 47.866,71, 1ª e 6ª faixas, não calculável. Os mesmos números pela API em `apuracaoDoExemploDoMockDoCalculoAoEncerramento` (receita R$ 386.400,00, RBT12 R$ 3.340.000,00 do histórico) |
| S12-07 PGDAS-D e guia DAS | Pronto | Transmissão com recibo; guia com título a pagar; nova guia substitui a sem pagamento e guia paga é recusada (`TAX_DAS_PAID`); pagamento pela tela usa o pagamento de Contas a pagar; obrigações PGDAS-D Entregue e DAS Pago |
| S12-08 Fechamento por etapas | Pronto | Etapa automática não se marca à mão; encerrar com etapa pendente → 422; com as 7, Encerrada; nota e cálculo em competência encerrada → `TAX_PERIOD_CLOSED`; reabrir exige motivo |
| S12-09 Obrigações | Pronto | `obrigacoesRecorrentesEntregaAvulsaEAgenda`: os modelos geram as ocorrências uma vez; obrigação avulsa; entrega com recibo; PGDAS-D e DAS seguem a apuração (`TAX_OBLIGATION_LINKED` ao tentar entregar à mão); `calendar.ics` |
| S12-10 Painel fiscal | Pronto | `GET /fiscal/dashboard`: DAS R$ 52.415,79, RBT12 R$ 3.340.000,00 (5ª faixa), 7 etapas, ISS R$ 5.453,00, guias e alertas por regra |
| S12-11 Contratos | Pronto | `openapi.yaml` com as rotas do fiscal e a autorização da nota (`OpenApiContractTest` passa); eventos (`TaxDasGuideIssued` no lugar de `TaxPeriodConfirmed`, `ItemFiscalProfileUpdated` com `reclassifiedLines`), formulários, permissões e `menu.json` com as 5 telas do Fiscal; verificador B01 OK |
| S12-12 Telas | Pronto | Painel fiscal, Apuração do Simples Nacional (6 abas), Obrigações (lista e calendário), Classificação fiscal e Tabelas e parâmetros; as 3 janelas da Sprint 7 removidas; `Sprint12Windows.test.tsx` (11 testes) |
| S12-13 Roteiro de ponta a ponta | Pronto | `apps/desktop/e2e/sprint-12.e2e.ts` no Chromium contra o servidor real: histórico do mock → RBT12 R$ 3.340.000,00 no Painel → Apuração pela seta → receita II R$ 12.861,74 e III R$ 7.138,26 → nota com "III (padrão)" → Classificação fiscal do serviço → Calcular (R$ 2.791,95, igual à API) → Transmitir PGDAS-D → Gerar DAS → Registrar pagamento → 7 etapas → Encerrar → nota recusada → Reabrir com motivo → Obrigações (PGDAS-D Entregue, DAS Pago). Passou em três rodadas completas seguidas no mesmo banco. O roteiro da Sprint 8 passou a gerar o DAS pela Guia DAS (nova guia substitui a anterior) |

Testes executados: servidor **121** (PostgreSQL 16 real; eram 117), app **148** (eram 144), typecheck, build, verificador B01, roteiros Playwright das Sprints 5, 6 e 8 a 12 contra o servidor real (três rodadas completas).

**Corrigido junto (achado pelo roteiro de ponta a ponta):**
- **Nota com anexo padrão travava o fechamento**: a linha de um item sem classificação ficava no anexo padrão para sempre e a etapa "Segregar a receita por anexo" nunca concluía. Agora, ao gravar a classificação do item, as linhas com o anexo padrão das notas ativas em competências **não encerradas** passam ao anexo da classificação (a trilha do item registra quantas linhas mudaram). O teste da API fazia isso com SQL; agora usa a classificação.
- **Apuração aberta pelo menu**: a tela recebia a chave "singleton" como competência e mostrava "Competência inválida"; agora abre na competência padrão (teste novo). O mesmo na tela de Obrigações.

**Decisões tomadas na execução (para confirmar na Review):**
- **Pagamento da guia** usa o pagamento de Contas a pagar (`POST /settlements`), em vez de uma rota própria da guia: a saída na conta e o estorno ficam num lugar só.
- **Imprimir memória** imprime a memória da tela (impressão do sistema), sem rota de servidor.
- **Alertas** são por regra e aparecem como aviso comum, sem o selo de IA do design system (ADR-014).
- **Roteiro da Sprint 7** foi retirado: as telas dele não existem mais e o fluxo (competência, RBT12, cálculo, fechamento, trava e reabertura) está no roteiro da Sprint 12. O da Sprint 8 usa agora a competência três meses **antes** da data do servidor, porque a escolha de competência da Apuração lista os últimos 18 meses.

**Não verificado aqui:** o app dentro do Electron no macOS; a migração V18 no seu banco (conferida num banco de teste com dados das Sprints 7 e 8); as tabelas da LC 123 do mock contra a publicação oficial (entram como revisão com fonte e vigência, para o contador confirmar). O roteiro de ponta a ponta usa notas menores que as do mock (o pedido fatura o recebido); os valores exatos do mock (R$ 52.415,79) estão nos testes do servidor.

**Limitações conhecidas:**
- O roteiro da Sprint 4 continua falhando de vez em quando no mesmo banco (a ficha do equipamento não fecha com Esc depois de gravar); é a tarefa à parte registrada na Sprint 9.
- Arquivo do recibo das obrigações fica fora (ADR-008): registra-se o número.

