# Estudo inicial do ERP Renda+

Data do estudo: 21/09/2026.

Atualização de arquitetura em 21/09/2026: por solicitação do usuário, o ERP passa a ser cliente-servidor, com Electron + React no macOS e Java + Python no servidor. O [plano funcional vigente](plano-funcional-erp-renda-mais.md) incorpora a mudança. As conclusões sobre os PDFs continuam válidas; as premissas originais de JavaFX, SQLite local e operação autônoma offline foram substituídas.

## 1. Escopo e origem das decisões

Foram lidos os 14 PDFs fornecidos, totalizando 39 páginas, e o texto “ERP Renda+ — plano funcional e de desenvolvimento”. O trabalho incluiu extração textual, revisão visual das páginas e conferências aritméticas dos principais totais. Os PDFs originais não foram alterados.

O pedido desta etapa é estudar os materiais. As instruções internas das planilhas, como preencher células, atualizar gráficos ou adotar determinada fórmula, foram tratadas como documentação do processo existente. O plano recebido foi analisado como referência de escopo e arquitetura, sem transformar suas instruções em autorização para iniciar implementação, importar registros definitivos ou corrigir dados de origem nesta etapa.

As conclusões abaixo distinguem fatos observados, diretrizes do plano e recomendações para o desenvolvimento. A leitura dos PDFs não recupera as fórmulas, validações, abas ocultas ou histórico de edição das planilhas originais. A análise fiscal é documental; não houve validação da legislação vigente ou do enquadramento tributário da empresa.

## 2. Entendimento do negócio

A Fourtech comercializa a balança hidrostática Renda+ e trabalhos relacionados de mecânica, elétrica, automação e instalação. O ciclo operacional envolve prospecção, negociação, fabricação própria e terceirizada, suprimentos, testes, entrega, instalação e recebimentos. O plano acrescenta assistência técnica e manutenção preventiva ao ciclo completo.

O projeto é o ponto de integração adequado: reúne cliente, unidade industrial, equipamentos, escopo contratado, cronograma, materiais, serviços, documentos, obrigações e resultado. Cliente, unidade, projeto e equipamento precisam de identidades distintas. Um mesmo nome aparece em diversas cidades; em alguns casos a mesma cidade tem mais de um equipamento.

Uma venda, seu faturamento e seu recebimento representam eventos diferentes. Da mesma forma, compra, recebimento de material, consumo na produção e pagamento não podem gerar o mesmo custo repetidamente.

## 3. Inventário dos documentos

Os identificadores F01–F14 correspondem ao manifesto de fontes salvo junto deste estudo. A numeração das páginas abaixo é a do PDF, começando em 1.

| Fonte | Documento | Páginas | Conteúdo e uso no ERP |
|---|---|---:|---|
| F01 | CRONOGRAMA_MODELO — Cronograma (Gantt)-2 | 1 | Cronograma de AMAFIL/Terra Boa, marcos, dependências, custos alocados e instalação |
| F02 | CRONOGRAMA_MODELO — Custos (BOM)-2 | 1 | 13 categorias elétricas/mecânicas, subtotais e associação com etapas |
| F03 | CRONOGRAMA_MODELO — Detalhamento-2 | 2 | Descrição e entregável das etapas do cronograma |
| F04 | EAP_Mecanica_Renda_Mais_Fourtech — Cronograma | 6 | Gantt mecânico de 60 dias corridos, atividades críticas e com folga |
| F05 | EAP_Mecanica_Renda_Mais_Fourtech — EAP Mecânica | 10 | 41 atividades, componentes, responsáveis, predecessoras, duração, datas, peso e status |
| F06 | EAP_Mecanica_Renda_Mais_Fourtech — Suprimentos | 4 | Categorias de compra, fornecedores, prazos estimados e relação subsistema/BOM/EAP |
| F07 | GESTAO_FLUXO_DE_CAIXA — Fluxo de Caixa Total-2 | 3 | Parcelas, custos, repasses, impostos, reserva e posição de caixa |
| F08 | GESTAO_IMPOSTOS — Lançamentos Mensais-2 | 2 | 64 linhas de produto/serviço, empresa, categoria, valor e imposto |
| F09 | GESTAO_IMPOSTOS — Painel | 1 | Indicadores de RBT12, faixas e DAS por mês |
| F10 | GESTAO_IMPOSTOS — Parâmetros SN-2 | 1 | Tabelas apresentadas como Anexos II e III, faixas e deduções |
| F11 | Vendas_Renda+ TOTAL — BASE | 1 | 32 registros comerciais e operacionais |
| F12 | Vendas_Renda+ TOTAL — Cópia de LISTA DE FECULARIAS | 4 | 104 linhas de empresas/unidades, presença de Renda+ e classificação por estrelas |
| F13 | Vendas_Renda+ TOTAL — DASHBOARD | 2 | Resumos por ano, cliente, status e UF |
| F14 | GESTAO_IMPOSTOS — Apuração Mensal | 1 | Receita por tipo, RBT12, alíquotas, DAS e mês de vencimento |

O texto de planejamento foi preservado separadamente como `plano-funcional-recebido.txt`.

## 4. Comercial e relacionamento

### 4.1 Conferência da carteira

A soma das 32 linhas da BASE confere com R$ 5.681.662,94. Cada linha informa quantidade 1. Isso permite preservar 32 registros de origem, mas não comprova 32 clientes únicos nem fornece os números de série dos equipamentos. [F11, p. 1]

| Situação na origem | Registros | Valor |
|---|---:|---:|
| Em operação | 24 | R$ 4.146.462,94 |
| Em instalação | 3 | R$ 596.200,00 |
| Em produção | 1 | R$ 185.000,00 |
| A produzir | 4 | R$ 754.000,00 |
| Total | 32 | R$ 5.681.662,94 |

Por ano da data comercial: 2024 tem 5 registros/R$ 705.000,00; 2025 tem 16/R$ 2.864.462,94; 2026 tem 11/R$ 2.112.200,00. Por UF: PR tem 24/R$ 4.242.601,24; MS tem 5/R$ 885.861,70; SP tem 2/R$ 370.000,00; MG tem 1/R$ 183.200,00. Os indicadores correspondentes do dashboard conferem nos arredondamentos apresentados. [F11; F13]

O termo “faturamento anual” usado pelo dashboard deriva da carteira comercial; a BASE não contém documentos fiscais que comprovem esse faturamento. O ERP deve identificar claramente valor vendido, faturado e recebido. O “pipeline aberto” do painel corresponde a projetos fora de operação, não necessariamente a oportunidades ainda não vendidas. [F13, p. 1]

### 4.2 Datas e identificação

- A BASE anuncia período até 23/04/2026, mas contém vendas até 19/09/2026. O DASHBOARD anuncia até 10/07/2026 e ainda usa rótulos como “jan-abr”, embora seus totais contemplem as linhas posteriores. [F11; F13]
- Nas 32 linhas, “data de entrega” é exatamente a data comercial mais 90 dias. É um indício forte de prazo calculado; não deve ser importada como entrega efetivamente realizada sem confirmação. [F11]
- AMAFIL/Terra Boa aparece na BASE com venda em 19/06/2026 e entrega em 17/09/2026; o cronograma começa em 25/06/2026, prevê entrega técnica em 23/09/2026 e conclusão em 07/10/2026. As datas podem representar eventos diferentes; devem ser preservadas com seus significados e procedência. [F01; F11]

### 4.3 Prospecção

A lista possui 104 linhas: 23 marcadas SIM e 81 NÃO. São contagens de linhas, antes de deduplicação. Apesar do título “sem a Renda+”, inclui empresas que já possuem o equipamento. A segunda coluna “CLIENTE” contém SIM/NÃO e deve ter sua interpretação registrada na importação. [F12, pp. 1–4]

Existem repetições que exigem cuidado: Alimentos Lopes/Nova Londrina aparece duas vezes e também possui duas vendas na BASE; isso pode representar dois equipamentos legítimos. AMAGIL aparece na prospecção e nos impostos, enquanto a BASE usa AMAFIL para Novo Horizonte do Sul. Não é seguro unificar empresas apenas pela similaridade do nome. TERRAFEC aparece com cidades e situações diferentes. Classificações vazias devem permanecer desconhecidas, sem virar zero estrelas. [F08; F11; F12]

## 5. Engenharia, custos, produção e suprimentos

### 5.1 BOM e custos

| Conferência | Valor |
|---|---:|
| Soma das 2 linhas elétricas | R$ 40.921,11 |
| Soma das 11 linhas mecânicas, incluindo pintura | R$ 31.477,40 |
| Soma das 13 linhas | R$ 72.398,51 |
| Subtotal mecânico impresso | R$ 28.477,40 |
| Total geral impresso | R$ 69.398,51 |
| Diferença entre linhas e total impresso | R$ 3.000,00 |

A diferença coincide exatamente com CAT-11/Pintura. Isso confirma a divergência aritmética, mas não determina sozinho se é necessário aumentar o orçamento ou se a pintura já estaria embutida em outra categoria. Em Suprimentos, CAT-10 inclui “pintura/montagem/caixa d'água”, enquanto a BOM resumida apresenta pintura separadamente. A composição original deve esclarecer essa sobreposição. [F02, p. 1; F06, p. 1]

O custo elétrico de referência no fluxo de caixa é R$ 41.522,60 por equipamento em várias linhas, contra R$ 40.921,11 na BOM: diferença de R$ 601,49. Pode ser revisão, despesa adicional ou outra base; não foi explicado nos arquivos. [F02; F07, p. 1]

Na BOM, ELE-01, ELE-02 e CAT-07 apontam para etapa 2.4. Seus valores somam R$ 43.217,21. O Gantt chama essa etapa de “Motorredutor”, enquanto o detalhamento a chama de “Painel e automação”. Portanto, o valor não pode ser interpretado como custo isolado do motorredutor. Há categorias sem etapa associada; R$ 55.426,53 de fabricação no Gantt não cobre todas as linhas da BOM. [F01; F02; F03]

Os arquivos apresentam categorias e alguns componentes/especificações, mas não a BOM completa com quantidade, unidade e custo unitário de cada peça. Os números da coluna “Itens” em Suprimentos são contagens por categoria, não saldos físicos nem quantidades a consumir. CAT-01a/b/c repartem prazos; R$ 10.441,77 corresponde às três classes de chapas em conjunto, conforme a observação do documento. [F06, p. 1]

### 5.2 EAP e cronogramas

A EAP mecânica contém 41 atividades em 9 grupos: engenharia, suprimentos, corte/dobra/usinagem, subconjuntos, pintura, montagem, sistemas pneumático/hidráulico, inspeção/testes e liberação. Os 41 pesos somam 100%. Todas as atividades constam como “Não iniciado”; o arquivo é uma referência de planejamento, não comprovação do avanço atual. [F05, pp. 6–10]

O Gantt mecânico cobre 60 dias corridos e termina na liberação para integração elétrica. O modelo de entrega trabalha com fabricação de 90 dias, seguida de instalação mecânica e elétrica. São escopos diferentes; os dois prazos não devem ser tratados automaticamente como contraditórios. [F01; F04; F05]

Divergências concretas:

| Local | Evidência | Tratamento proposto |
|---|---|---|
| EAP 1.1 | “Reunião de Planejamento”, dia 1, contra “Revisão de projeto e liberação da OP”, dias 1–2 no Gantt | Conciliar conteúdo e versão do modelo |
| EAP 3.3 | Corte de inox especial em 01–02/07/2026, dias 5–6, precedido de compra que termina em 15/07; Suprimentos prevê chegada em 16/07 | Sinalizar início antes da disponibilidade |
| Gantt mecânico 3.3 | Corte previsto nos dias 20–21 | Preservar ambas as versões até conferência |
| EAP 6.2 e 6.3 | Dias 35–37 e 38–41; Gantt usa 36–38 e 39–42 | Definir convenção de início/fim e recalcular dependências |
| Compra do motorredutor | EAP termina dia 23, 19/07; Suprimentos prevê dia 24, 20/07 | Unificar contagem do prazo de fornecimento |
| Modelo 2.5 | Começa em 10/07, mas depende de 2.4 que termina em 25/07 | Explicitar paralelismo, liberação parcial ou corrigir vínculo |
| Modelo 2.6 e 2.7 | Sem descrição no Gantt; descritas no Detalhamento | Manter cadastro único de atividade |

Fontes: F01, p. 1; F03, p. 1; F04, pp. 1–2; F05, pp. 6–8; F06, pp. 1 e 3.

A EAP e Suprimentos referenciam desenhos Fig. 1–7, BOM detalhada, relatório de manutenção/qualidade e POP-MP-RENDA-001. Esses materiais não integram os arquivos recebidos. Checklists e critérios de aceite completos ainda não podem ser reconstruídos. [F05, pp. 1–5; F06, p. 2]

## 6. Financeiro e repasses

O fluxo abrange uma coluna “ANTES” e meses de julho/2026 a dezembro/2027. Entradas e saídas são agrupadas por projeto e por beneficiário/categoria, incluindo Rafael, Edson, Everton, Sergio, mecânica, elétrica, impostos e caixa. Apresenta parcelas de R$ 2.537.685,00 no total de entradas. Esse recorte não equivale à carteira comercial completa de R$ 5.681.662,94. [F07, pp. 1–2]

Os títulos “Recebidos ou a Receber” e “Pagos ou a Pagar” misturam situação realizada e prevista. A posição temporal da coluna e a cor de uma célula não comprovam uma baixa bancária. Existem valores de conferência negativos, repasses, serviços e custos na mesma estrutura; não é seguro transformar cada célula em uma obrigação nova. [F07]

Exemplos de valores que precisam de vinculação por escopo:

- Terra Boa: R$ 185.000,00 na carteira e R$ 222.735,50 nas parcelas do fluxo. Os lançamentos fiscais incluem R$ 185.000,00 de balança em duas parcelas de faturamento e R$ 37.735,50 de painel/instalação elétrica. Há indício consistente de que o fluxo reúne escopo adicional. [F07; F08, p. 2; F11]
- Barra Velha: R$ 190.000,00 na carteira e R$ 174.000,00 no fluxo. A diferença precisa de explicação documental; não foi presumido desconto, saldo ou erro. [F07; F11]
- Talinda: balança por R$ 183.200,00 na BASE e R$ 183.226,33 nos lançamentos. A diferença de R$ 26,33 deve constar da conferência. [F08, p. 2; F11]

A nota [1] da página 3 do fluxo contém “IMPOSTO C.VALE ELÉTRICA”; a nota [2] não traz explicação útil. Preservar essas notas e sua ligação à origem. As colunas “CONF” e “IMPOSTOS” exigem mapeamento por seção antes de serem usadas como saldo ou tributo. Os arquivos não explicitam uma fórmula completa e uniforme dos repasses. [F07]

O plano recebido prevê regras de repasse versionadas, substituição por projeto, bases de faturamento/recebimento/resultado e confirmação que congela a memória do cálculo. É necessário manter reserva interna de caixa separada de pagamentos a beneficiários e distinguir custos de execução de distribuição de resultado.

## 7. Impostos gerenciais

Os lançamentos distinguem BALANÇA RENDA+, MECÂNICA e ELÉTRICA, com tipos PRODUTO ou SERVIÇO. Há 64 linhas de março/2025 a março/2027, portanto também há períodos futuros em relação à data deste estudo. A apuração se estende até dezembro/2027. Registros futuros não devem ser classificados como faturamento efetivamente realizado sem documento ou confirmação. [F08; F14]

Pontos confirmados:

- O painel apresenta `#REF!` em faturamento acumulado. [F09, p. 1]
- A instalação elétrica de AMAFIL/São Lourenço tem mês janeiro/2027 e coluna Ano igual a 2026. [F08, p. 2]
- A apuração declara expressamente que o RBT12 inclui o mês corrente. O plano recebido propõe outra regra para a futura simulação; o histórico deve manter sua memória de origem separada. [F14; plano, seção 4]
- O painel chama janeiro/2027 de “último mês apurado”, embora suas tabelas se estendam por 2027. Seleção de período, projeção e competência confirmada precisam ser explícitas. [F09]
- A classificação fiscal não pode ser inferida apenas pela descrição: há lançamento de balança como SERVIÇO e de montagem/instalação como PRODUTO. É necessária conferência com os documentos correspondentes. [F08, p. 1]
- Existem diferenças de um centavo entre a soma de componentes exibidos e o total mensal em alguns casos, como janeiro/2026 e janeiro/2027. Isso pode decorrer da precisão interna e do arredondamento; os PDFs não permitem recuperar a fórmula exata. [F14]

As tabelas de parâmetros devem entrar como histórico da fonte, com vigência e validação própria antes de uso operacional. O estudo não certifica a adequação dos anexos, limites ou cálculos à situação tributária da Fourtech. O desenho recebido mantém emissão/transmissão fiscal externas e separa simulação gerencial, histórico da planilha e valor confirmado pelo contador.

## 8. Escopo funcional e técnico do plano recebido

O plano já descreve 32 telas/áreas. Para desenvolvimento, elas podem ser organizadas nestes conjuntos, mantendo suas funções:

| Conjunto | Funções previstas |
|---|---|
| Fundação | Empresa, operador, clientes/unidades, fornecedores, itens, anexos, auditoria, configurações, importação e backups |
| Comercial | Prospecção, oportunidades, propostas versionadas, pedidos, contratos e parcelas |
| Projetos | Carteira, detalhe do projeto, equipamentos, BOM, EAP, cronograma e linhas de base |
| Industrial | Necessidades, cotações, compras, recebimentos, estoque, terceiros, produção, qualidade e instalação |
| Financeiro | Documentos/faturamento, contas a pagar/receber, baixas parciais, contas bancárias, conciliação, caixa e resultado |
| Gestão | Repasses, conferência fiscal, relatórios e visão geral |
| Pós-venda | Assistência, ordens de serviço, peças, garantia e manutenção preventiva |

Diretriz técnica vigente, alterada pelo usuário após o estudo: arquitetura cliente-servidor; cliente macOS em Electron + React; servidor em Java e Python. A proposta detalhada no plano vigente concentra regras e persistência em Java e processamento documental em Python, com API entre cliente e servidor e backups centralizados. PostgreSQL é uma proposta de banco; hospedagem, capacidade de usuários e frameworks ainda estão em aberto. A proposta inicial depende de conexão ao servidor. BRL, português brasileiro, um CNPJ e separação do Fourtech Gestão existente permanecem. A referência original JavaFX/SQLite está preservada apenas no arquivo recebido.

Ficam fora da versão: folha de pagamento, contabilidade oficial, emissão/transmissão fiscal e integrações bancárias online. A proposta cliente-servidor não inclui gravações offline com sincronização posterior. Importação OFX/CSV e registro/conferência de documentos continuam previstos.

A ambiguidade visual do plano recebido foi resolvida pela escolha posterior do usuário: adotar o pacote Renda+ ERP, preservado em `design-system/renda-mais-erp`. A adaptação para React seguirá o [guia de integração](../design-system/README.md). Essa decisão não altera as conclusões documentais do estudo.

## 9. Regras essenciais para a especificação

Estas regras consolidam o plano recebido e os riscos observados:

1. Identificar cliente, unidade, pedido, projeto e equipamento separadamente; manter aliases e vínculos revisáveis.
2. Versionar BOM, EAP, parâmetros e repasses; cada projeto conserva a revisão utilizada.
3. Separar contratação, competência, vencimento, baixa, entrega técnica e aceite.
4. Registrar eventos financeiros uma vez; faturamento posterior vincula títulos existentes.
5. Distinguir planejamento, compromisso, execução e caixa; custos entram por consumo/execução, sem repetição na baixa.
6. Controlar estoque físico, reservado, disponível, localização e propriedade, inclusive material em terceiros.
7. Preservar linha de base do cronograma; dependências tipadas, defasagens e calendário guiam o recálculo. Rótulos “parcial/paralelo” precisam virar regras explícitas.
8. Usar ajustes/estornos rastreáveis para movimentos confirmados e manter memória dos fechamentos.
9. Separar valores históricos, simulados e confirmados; desconhecido não equivale a zero.
10. Calcular indicadores a partir dos registros de origem e permitir abrir sua composição.

## 10. Preparação da migração

A migração precisa de uma área de conferência. Cada registro proposto deve ter arquivo, hash, página, localização/linha, texto original, tipo de registro, correspondência sugerida, divergências e situação de revisão. Os arquivos de origem devem permanecer acessíveis.

Ordem sugerida: cadastros e aliases → carteira/projetos/equipamentos → modelos de custos e atividades → lançamentos/documentos e títulos → baixas comprovadas → parâmetros/repasses validados. Dashboards e totais servem para reconciliar; não geram transações adicionais.

Cuidados específicos de paginação: EAP divide descrições e datas em blocos de páginas; o Gantt mecânico repete atividades ao continuar a escala horizontal; Suprimentos coloca datas de chegada em páginas separadas. Importar página a página sem reconstruir a tabela criaria duplicações ou associações erradas. Há textos sobrepostos/cortados em cabeçalhos. [F04–F06]

Informações ainda ausentes para uma carga operacional confiável:

- CNPJ e endereços completos dos clientes/unidades, contatos e correspondências de nomes.
- Contratos, aditivos, documentos fiscais, comprovantes e extratos para classificar saldos e baixas.
- Saldos iniciais por conta e data de corte da migração.
- BOM detalhada, estoque inicial, locais e materiais que estão em terceiros.
- Números de série, datas reais de entrega/aceite e condições de garantia.
- Regras e percentuais de repasse por área/projeto, base de cálculo e vigência.
- Desenhos, checklists e critérios de inspeção/instalação referenciados.
- Enquadramento/parametrização fiscal validada e valores efetivamente apurados pelo contador.

Essas ausências não impedem desenhar a estrutura do sistema; impedem tratar certas informações históricas como definitivas.

## 11. Encaminhamento para desenvolvimento

A sequência do plano é coerente com as dependências: fundação → comercial/financeiro → operação industrial → repasses/fiscal/pós-venda → homologação completa. Com a alteração de arquitetura, a fundação inclui cliente Electron/React, servidor Java, processamento Python, API, sessões e persistência central; a homologação inclui falhas de conexão, repetição de comandos e recuperação de tarefas. O próximo trabalho concreto é transformar o estudo e as 32 telas do plano em modelo de dados, estados e eventos, regras verificáveis e backlog de implementação.

Casos prioritários de aceitação: reconciliar os 32 registros/R$ 5.681.662,94; detectar divergência da pintura; impedir reimportação duplicada; suportar parcelas/baixas parciais e estornos; não duplicar custo ou receita entre eventos; controlar reserva/consumo/terceiros; recalcular cronograma sem alterar linha de base; restaurar banco e anexos em ambiente separado.

A etapa de estudo está concluída. Em 23/09/2026, foi acrescentado o [planejamento de desenvolvimento](planejamento-desenvolvimento-erp-renda-mais.md), acompanhado dos [prompts para o Codex](prompts-codex-erp-renda-mais.md). Não foi iniciada a implementação do ERP nem foram alterados os dados de negócio.
