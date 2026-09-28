# Sprint 7 — Fiscal gerencial: receita por competência, simulação e conferência do contador

Situação: **Entregue para Review** (28/09/2026). Planning aprovado pelo PO em 28/09/2026 ("aprovado"), com o RBT12 informado como proposto; na aprovação o PO pediu também os botões **Registro anterior** e **Próximo registro** no menu superior, que entraram como S7-11 (ação da retrospectiva da Sprint 6 cumprida: a regra do faturamento e a do RBT12 foram confirmadas no planning, com exemplo numérico, antes de implementar).

## Objetivo

Conferir os impostos de cada mês: para cada **competência**, o Renda+ mostra a receita documentada pelas notas (produto e serviço, agora em **notas separadas**), calcula uma **simulação gerencial** do Simples Nacional com parâmetros confirmados pelo contador e registra o **valor que o contador apurou**, com a diferença entre os dois — mantendo sempre separados histórico, simulação e valor do contador, e sem tratar mês desconhecido como zero. A competência conferida pode ser **fechada** (a memória fica congelada) e só reaberta com motivo. Primeira fatia do módulo `fiscal` (B10, tela *Impostos gerenciais*).

## Pendências anteriores (não bloqueiam esta sprint)

| Pendência | Situação |
|---|---|
| Aceite da Sprint 6 (regime de caixa) | Entregue com o ajuste da Review; falta o aceite formal do PO |
| PD-004, PD-005 (Sprint 5) | Premissas em uso (recusar excedente; só estorno total) — a confirmar com o financeiro |
| PD-009 — permissões | Só Administrador opera; Consulta vê — a confirmar pelo PO |

## Respostas do PO (28/09/2026)

| Pergunta | Resposta | Consequência nesta sprint |
|---|---|---|
| 1. Enquadramento | **Simples Nacional**: produto no **Anexo II** (Indústria), serviço no **Anexo III** (Serviços), com as faixas da planilha *FOURTECH · Parâmetros do Simples Nacional* (tabela abaixo) | PD-013 respondida; a revisão 1 dos parâmetros já vem com essas faixas |
| 2. Tabelas preenchidas ou digitadas | Não respondida diretamente; o PO enviou as tabelas como "fonte única de consulta" | A revisão 1 é **semeada** com as tabelas enviadas, com a origem "Planilha FOURTECH, informada pelo PO em 28/09/2026". Mudança de faixa = nova revisão com vigência; nada é digitado por cima |
| 3. Base da receita | **Notas** registradas na competência | IND-005 por competência e tipo |
| 4. Histórico | **O sistema começa do zero**: não haverá digitação de meses anteriores | Sai a digitação do histórico mensal. Para o RBT12, ver "RBT12 enquanto não há 12 meses" |
| 5. Notas separadas | **Sim**: produto (NF-e) e serviço (NFS-e) saem em notas separadas | Novo item S7-00: a nota do pedido passa a ter **tipo** (Produto ou Serviço) e o a emitir é separado por tipo |
| 6. Competência fechada | **Recusar** registrar e cancelar nota | `TAX_PERIOD_CLOSED` pela porta `CompetenceLockGuard` |
| 7. DAS a pagar | **Na sprint de Contas a pagar** | `TaxPeriodConfirmed` sai com `titleId` vazio |

### Parâmetros — revisão 1 (vigência a partir de 09/2026)

| Faixa | RBT12 de | até | Anexo II (Produto): alíquota / a deduzir | Anexo III (Serviço): alíquota / a deduzir |
|---|---|---|---|---|
| 1ª | R$ 0,00 | R$ 180.000,00 | 4,50% / R$ 0,00 | 6,00% / R$ 0,00 |
| 2ª | R$ 180.000,01 | R$ 360.000,00 | 7,80% / R$ 5.940,00 | 11,20% / R$ 9.360,00 |
| 3ª | R$ 360.000,01 | R$ 720.000,00 | 10,00% / R$ 13.860,00 | 13,50% / R$ 17.640,00 |
| 4ª | R$ 720.000,01 | R$ 1.800.000,00 | 11,20% / R$ 22.500,00 | 16,00% / R$ 35.640,00 |
| 5ª | R$ 1.800.000,01 | R$ 3.600.000,00 | 14,70% / R$ 85.500,00 | 21,00% / R$ 125.640,00 |
| 6ª | R$ 3.600.000,01 | R$ 4.800.000,00 | 30,00% / R$ 720.000,00 | 33,00% / R$ 648.000,00 |

Na 6ª faixa a simulação sai com o aviso da planilha (salto para 30% e 33%; acima do sublimite de R$ 3.600.000,00, ICMS e ISS deixam de ir no DAS — isso não é calculado nesta sprint). RBT12 acima de R$ 4.800.000,00 → `NOT_CALCULABLE` ("acima do limite do Simples").

### RBT12 enquanto não há 12 meses (a confirmar na aprovação)

O RBT12 é a receita bruta **total** (produto + serviço) dos 12 meses anteriores à competência. Como o Renda+ começa do zero, nos primeiros 12 meses ele não tem esses meses. Tratar os meses ausentes como zero jogaria a empresa numa faixa menor e **subestimaria o imposto**, então essa opção fica fora.

**Proposta:** enquanto faltar algum dos 12 meses, a competência recebe o **RBT12 informado** (um único valor, o que o contador usou no PGDAS-D daquele mês, com "informado por" e observação). A simulação usa esse valor e a memória mostra "RBT12 informado". Quando o Renda+ tiver os 12 meses em notas, o RBT12 passa a ser calculado sozinho, e o informado, se houver, aparece ao lado como conferência.

Alternativa: sem o RBT12 informado, a simulação fica "Não calculável" até completar 12 meses (só a receita e o valor do contador aparecem).

## Decisões do planning

| Tema | Decisão |
|---|---|
| Parâmetros | Revisão com **vigência** (a partir de `AAAA-MM`), anexo por tipo e faixas; nova revisão não altera simulações antigas; a revisão em uso é a vigente na competência |
| Cálculo | Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, por anexo, com o mesmo RBT12 total; imposto = receita do mês do tipo × alíquota efetiva; arredondamento HALF_EVEN por tipo (PD-002). A **memória** (origem do RBT12, faixa, fórmula, revisão usada) é gravada com a simulação |
| Conferência do contador | Valor apurado pelo contador, **vencimento** e observação; diferença = contador − simulação. O valor do contador nunca é substituído pela simulação |
| Fechar e reabrir | Fechar exige conferência do contador; congela receita, simulação e conferência. Reabrir exige motivo e permissão própria; a trilha guarda os dois |
| Nota em competência fechada | Registrar ou cancelar nota com competência fechada é **recusado** (`TAX_PERIOD_CLOSED`, "reabra a competência"). O módulo documentos consulta a porta `CompetenceLockGuard`, implementada pelo fiscal — mesmo desenho do `TitleCancellationGuard` da Sprint 6, sem dependência circular |
| Nota por tipo (S7-00) | A nota do pedido tem tipo **Produto** ou **Serviço**. A emitir do tipo = recebido × participação do tipo no pedido − faturado do tipo; a parte de produto é arredondada (HALF_EVEN) e o serviço fica com o resto, para os dois somarem exatamente o recebido. As linhas da nota vêm só das linhas do pedido daquele tipo; os vínculos continuam pela ordem de vencimento das parcelas. Notas mistas já registradas continuam válidas |
| PD-009 — permissões | `tax.read` para todos; `tax_parameter.admin`, `tax_period.simulate`, `tax_period.confirm`, `tax_period.close` e `tax_period.reopen` só no **Administrador** — premissa, a confirmar pelo PO |

### Exemplo numérico (para conferir com o contador antes de implementar)

Competência 09/2026, revisão 1 (2ª faixa), com RBT12 informado de R$ 300.000,00:

| | Produto (Anexo II) | Serviço (Anexo III) |
|---|---|---|
| RBT12 (informado, total da empresa) | R$ 300.000,00 | R$ 300.000,00 |
| Faixa 2: alíquota nominal / parcela a deduzir | 7,80% / R$ 5.940,00 | 11,20% / R$ 9.360,00 |
| Alíquota efetiva | (300.000,00 × 7,8% − 5.940,00) ÷ 300.000,00 = **5,82%** | (300.000,00 × 11,2% − 9.360,00) ÷ 300.000,00 = **8,08%** |
| Receita do mês | Nota de produto: R$ 12.861,74 | Nota de serviço: R$ 7.138,26 |
| Imposto simulado | **R$ 748,55** | **R$ 576,77** |

Simulação da competência: **R$ 1.325,32**. Se o contador apurar R$ 1.330,00, a tela mostra diferença de **R$ 4,68**. Sem RBT12 informado e sem os 12 meses em notas, a simulação sai "Não calculável — RBT12 desconhecido: faltam 09/2025 a 08/2026", nunca um valor menor.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S7-00 | Nota de produto e nota de serviço | Na nota do pedido, tipo obrigatório; a emitir por tipo no pedido, em *Notas a emitir* e na nota; com R$ 20.000,00 recebidos: nota de produto até R$ 12.861,74 e de serviço até R$ 7.138,26 (R$ 0,01 a mais → `DOCUMENT_EXCEEDS_RECEIVED` com o a emitir do tipo); pedido só de equipamento não oferece Serviço; notas simultâneas do mesmo tipo não passam do a emitir; roteiro da Sprint 6 ajustado |
| S7-01 | Módulo `fiscal` e migração | Migração V12 (`tax_period`, `tax_parameter_revision` com a revisão 1 semeada, `tax_simulation`, `accountant_confirmation`, trilha de fechamento/reabertura); `fiscal` depende só de `documentos` (porta pública `DocumentQueryApi` com a receita por competência) e do kernel/plataforma (`modulos.json`, `ArchitectureTest`) |
| S7-02 | Receita por competência | Por competência e tipo Produto/Serviço, a partir das notas ativas; nota cancelada sai da receita; o total por competência **bate com o "Faturado da lista"** de *Documentos e faturamento* filtrado pela mesma competência (ação da retrospectiva da Sprint 6), conferido no teste do servidor e no roteiro |
| S7-03 | RBT12 informado | Administrador informa o RBT12 da competência (valor > 0, informado por, observação); alteração gera nova versão com trilha; competência fechada não aceita; com os 12 meses em notas, o calculado prevalece e o informado aparece como conferência |
| S7-04 | Parâmetros com vigência | Revisão 1 semeada com as tabelas acima (teste confere as 12 faixas); nova revisão com regime, anexo por tipo, faixas e vigência; faixas contíguas e crescentes, validadas; revisão gravada não é alterada — muda-se criando outra; evento `TaxParameterRevised` |
| S7-05 | Simulação | Idempotente pela chave; RBT12 calculado (12 meses em notas) ou informado, com a origem na memória; faixa pelo RBT12; alíquota efetiva e imposto por tipo como no exemplo acima (teste com esses números e com uma competência na 6ª faixa); `NOT_CALCULABLE` com os motivos (sem parâmetro vigente, RBT12 desconhecido, acima de R$ 4.800.000,00); nova simulação preserva a anterior; evento `TaxSimulationRecorded` |
| S7-06 | Conferência do contador | Valor, vencimento e observação; versão da competência conferida (412); diferença contador − simulação; reconferir gera nova versão com histórico; evento `TaxPeriodConfirmed` |
| S7-07 | Fechar e reabrir | Fechar só com conferência; competência fechada não recebe simulação, conferência nem RBT12 informado; nota com essa competência recusada no registro e no cancelamento (`TAX_PERIOD_CLOSED`); reabrir com motivo; eventos `TaxPeriodClosed` e `TaxPeriodReopened` |
| S7-08 | Telas | **Impostos gerenciais** (lista por competência: Receita de produto, Receita de serviço, RBT12, Simulação, Confirmado contador, Diferença, Situação; filtro por ano); **Competência** (abas Receitas — com seta para as notas —, Simulação com a memória, Conferência, Histórico; botões Informar RBT12, Simular, Registrar conferência, Fechar, Reabrir); **Parâmetros fiscais** (revisões e faixas; Nova revisão); na nota do pedido, o campo Tipo; Consulta só vê; design system (`rp-*`, Seleção, Campo de data, Campo de saldo) |
| S7-09 | Contratos | OpenAPI de `/tax-periods`, `/tax-parameters`, `/tax-periods/{id}/simulations`, `/confirmation`, `/close`, `/reopen` (`OpenApiContractTest`); permissões nos perfis; erros no catálogo; eventos com o payload do catálogo; `menu.json` marca *Impostos gerenciais* como implementado; PD-013 respondida em `pendencias.json`; verificador B01 OK |
| S7-11 | Registro anterior e próximo registro (pedido do PO na aprovação) | Nas fichas (cliente, fornecedor, produto, proposta, pedido, projeto, equipamento, título, documento e competência fiscal), as ferramentas Primeiro, Anterior, Próximo e Último registro da barra superior e do menu **Dados** (atalhos ⌥⌘ + setas) trocam o registro na mesma janela, pela lista de onde a ficha foi aberta (com a busca e os filtros dela) ou, vinda de uma seta, pela lista completa do tipo; nas pontas, a mensagem "Você já está no primeiro/último registro"; com alterações não gravadas, não sai do registro (NAV-001); registro já aberto em outra janela vem à frente |
| S7-10 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-07.e2e.ts`: nota de produto e nota de serviço do mesmo recebimento → competência na lista → RBT12 informado → simulação com os valores do exemplo → conferência → fechar → nota nessa competência recusada; confere pela API o total da competência contra a lista de documentos; roda no job `e2e` do CI com as Sprints 4 a 6 |

Ordem de execução: S7-00 → S7-01 → S7-02 → S7-03 → S7-04 → S7-05 → S7-06 → S7-07 (servidor) → S7-09 → S7-08 → S7-11 → S7-10.

Se faltar tempo, sai primeiro o bloqueio de notas em competência fechada (parte do S7-07) e depois a tela de Parâmetros como janela própria (os parâmetros ficam na aba da competência). S7-00 a S7-06, S7-08 e S7-10 formam o mínimo da sprint.

## Fora do escopo

Emissão ou transmissão do PGDAS-D/DAS; título a pagar do DAS (Contas a pagar); histórico de meses anteriores ao sistema (decisão do PO: começa do zero) e importação da planilha GESTAO_IMPOSTOS ou de PDFs (B04); anexos (apuração do contador em PDF — B04); Fator R e folha de pagamento; ICMS/ISS fora do DAS acima do sublimite, substituição tributária, DIFAL e retenções; Lucro Presumido/Real; mais de um CNPJ; início de atividade com menos de 12 meses (proporcionalização do RBT12); repasses (PD-012); painel fiscal com gráficos.

## Como verificar (ao final)

1. Pedido de R$ 155.500,00 (equipamento R$ 100.000,00 + instalação R$ 55.500,00) com R$ 20.000,00 recebidos, como na Sprint 6.
2. *Notas a emitir*: produto R$ 12.861,74 e serviço R$ 7.138,26. Nota de **Produto** de R$ 12.861,75 → recusada com "A emitir de produto: R$ 12.861,74."; R$ 12.861,74 → registrada. Nota de **Serviço** de R$ 7.138,26 → registrada. O pedido some da lista.
3. *Fiscal → Impostos gerenciais*: 09/2026 com produto R$ 12.861,74 e serviço R$ 7.138,26 — o total, R$ 20.000,00, é igual ao "Faturado da lista" de *Documentos e faturamento* na mesma competência.
4. Abrir a competência → **Simular**: "Não calculável — RBT12 desconhecido".
5. **Informar RBT12**: R$ 300.000,00 → **Simular**: 5,82% e 8,08%, simulação R$ 1.325,32, com a memória (RBT12 informado, 2ª faixa, revisão 1).
6. **Registrar conferência**: R$ 1.330,00, vencimento 20/10/2026 → diferença R$ 4,68.
7. **Fechar**. Registrar ou cancelar uma nota com competência 09/2026 → recusado com "Competência 09/2026 fechada".
8. **Reabrir** com motivo → a nota é aceita; a trilha mostra fechamento e reabertura.
9. Entrar como Consulta: vê tudo; não simula, não confere, não fecha, não altera parâmetros.
10. Na competência aberta pela lista, **Registro anterior** e **Próximo registro** (barra superior ou menu *Dados*) trocam a competência na mesma janela; o mesmo vale para clientes, pedidos, títulos, notas e as demais fichas.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README) — e o job `e2e` do CI.

## Riscos

- **Parâmetros errados viram número errado com aparência oficial**: a tela sempre mostra "simulação gerencial", separada do valor do contador, com a revisão e a origem do RBT12 na memória.
- **RBT12 informado errado** muda a faixa: a diferença contra o valor do contador aparece na conferência da mesma competência.
- **Anexo por tipo pode não bastar** (ex.: instalação em Anexo IV, atividade com Fator R): se o contador indicar, o anexo passa a ser por natureza da operação (classificação da Sprint 6) — muda a política de enquadramento, não o modelo.
- **Notas separadas mudam a Sprint 6** (S7-00): o roteiro e os testes da Sprint 6 são ajustados junto, para o CI continuar verde.

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S7-00 Nota de produto e nota de serviço | Pronto | `DocumentosApiTest.notaDoPedidoFaturaSoORecebidoComLinhasProporcionaisEVinculosPorVencimento` refeito: com R$ 20.000,00 recebidos, a emitir de produto R$ 12.861,74 e de serviço R$ 7.138,26; pedido com os dois tipos sem `kind` → `DOCUMENT_INVALID` no campo; R$ 12.861,75 de produto → "A emitir de produto: R$ 12.861,74."; a nota de produto leva só o equipamento e a de serviço só a instalação; pedido só de equipamento não aceita nota de serviço; com R$ 65.500,00 recebidos, R$ 29.260,45 e R$ 16.239,55 a emitir. `notasSimultaneasDoMesmoPedidoNaoPassamDoRecebido`: o bloqueio das parcelas continua valendo por tipo |
| S7-01 Módulo e migração | Pronto | Migração V12 com a revisão 1 semeada (as 12 faixas da planilha FOURTECH); `fiscal` depende de `documentos` pelas portas públicas `DocumentQueryApi` e `CompetenceLockGuard` (`modulos.json`, `ArchitectureTest` passa) |
| S7-02 Receita por competência | Pronto | `FiscalApiTest.simulacaoComRbt12InformadoConfereComOContadorEFechaACompetencia`: a lista mostra produto R$ 12.861,74 e serviço R$ 7.138,26, e o total bate com a soma da lista de documentos da mesma competência; nota cancelada sai da receita |
| S7-03 RBT12 informado | Pronto | Campos obrigatórios apontados; versão lida conferida (412); a origem vai para a memória. `rbt12CalculadoDasNotasQuandoORendaTemOs12Meses`: com os 12 meses conhecidos, o RBT12 é calculado das notas (R$ 300.000,00 → R$ 582,00 sobre R$ 10.000,00) |
| S7-04 Parâmetros com vigência | Pronto | `novaRevisaoDosParametrosTemVigenciaEPreservaAAnterior`: faixas decrescentes, alíquota fora de 0–100% e parcela negativa apontadas no campo; a revisão 2 vale só a partir da vigência dela; mesma chave → mesma revisão; evento `TaxParameterRevised` |
| S7-05 Simulação | Pronto | `SimplesSimulationTest`: o exemplo do planning (5,82%, 8,08%, R$ 748,55 + R$ 576,77 = R$ 1.325,32), os limites da 1ª e da 2ª faixa, a 6ª faixa com o aviso de ICMS/ISS e os casos não calculáveis (sem parâmetro, RBT12 desconhecido com os meses, acima de R$ 4.800.000,00). Na API: não calculável sem RBT12, a mesma chave não repete, a memória guarda revisão, faixa e alíquotas |
| S7-06 Conferência do contador | Pronto | R$ 1.330,00 → diferença R$ 4,68 na ficha e na lista; valor negativo e vencimento vazio apontados; evento `TaxPeriodConfirmed` com `titleId` nulo |
| S7-07 Fechar e reabrir | Pronto | Fechar sem conferência → `TAX_PERIOD_INVALID`; fechada, a competência recusa registrar e cancelar nota (`TAX_PERIOD_CLOSED`, no campo competência) e simular; nota em outra competência continua aceita; reabrir exige motivo; reabrir aberta → 409; trilha e eventos |
| S7-08 Telas | Pronto | `Sprint7Windows.test.tsx` (7 testes): lista do ano com os totais e a seta que abre a competência com a sequência; simular com a mesma chave depois de queda de rede; RBT12 informado com a versão lida; memória do cálculo; conferência, fechar e reabrir com motivo; Consulta sem botões; Parâmetros com as faixas e a nova revisão enviada como fração. `Sprint6Windows.test.tsx`: o campo Tipo da nota e o a emitir do tipo |
| S7-09 Contratos | Pronto | `openapi.yaml` com as 9 rotas do fiscal e o `kind` da nota (`OpenApiContractTest` passa); permissões nos perfis; `menu.json` com Impostos gerenciais implementado; PD-013 respondida em `pendencias.json`; formulários `documentos` e `impostos` atualizados; verificador B01 OK |
| S7-10 Roteiro de ponta a ponta | Pronto | `apps/desktop/e2e/sprint-07.e2e.ts` no Chromium contra o servidor real (banco vazio), junto com os roteiros das Sprints 4, 5 e 6 (o da 6 refeito para as notas separadas): 4 passando. Confere pela API a receita contra a lista de documentos, a simulação de R$ 1.325,32, a diferença e a nota recusada na competência fechada |
| S7-11 Registro anterior e próximo | Pronto | `navegacao.test.ts` (pontas, registro novo, sequência padrão), `windowManager.test.ts` (troca na mesma janela, registro já aberto vem à frente) e `App.test.tsx` (lista de clientes → ficha → Próximo, último registro, menu Dados → Primeiro, ⌥⌘→, alterações não gravadas bloqueiam); no roteiro da Sprint 7, anterior e próximo entre competências |

Testes executados: servidor **93** (PostgreSQL 16 real; eram 86), app **86** (eram 73), typecheck do app e do Electron, build, verificador B01 + testes, roteiros Playwright das Sprints 4 a 7.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); os atalhos ⌥⌘ + setas foram testados no navegador (jsdom e Chromium), não no teclado do Mac.

**Limitações conhecidas:**
- O início da receita no Renda+ é a competência 09/2026 (`RENDA_FISCAL_REVENUE_START`). Antes dela, e enquanto faltar algum dos 12 meses, o RBT12 é o informado; notas registradas com competência anterior a esse início aparecem na receita, mas não tornam o mês "conhecido".
- O fechamento guarda a receita, a simulação e a conferência do momento; como a competência fechada não aceita nem perde nota, a receita não muda enquanto ela estiver fechada.
- Sem proporcionalização do RBT12 para início de atividade, sem Fator R e sem o ICMS/ISS fora do DAS na 6ª faixa (só o aviso).
- A navegação da competência anda pelos 12 meses do ano da lista; para outro ano, troque o ano no filtro da lista.

## Retrospectiva

- Funcionou: confirmar no planning as duas regras que mudavam a tela (notas separadas e RBT12 informado), com o exemplo numérico, evitou refazer a tela na Review; o exemplo virou teste unitário e passo do roteiro.
- Funcionou: as portas `DocumentQueryApi` e `CompetenceLockGuard` deram ao fiscal a receita e a trava de competência sem o módulo documentos depender do fiscal.
- Melhorar: o roteiro de ponta a ponta clicou na ficha enquanto a lista ainda estava filtrada pela busca, e a sequência do anterior/próximo veio com um registro só. O comportamento estava certo, mas o roteiro precisa esperar a lista que ele pretende usar.
- Melhorar: roteiros que dependem de estado global (competência, RBT12) precisam deixar o banco como encontraram ou tolerar execuções anteriores; o da Sprint 7 reabre a competência e cancela as notas de execuções passadas.
- Ação: na próxima sprint (Contas a pagar), o título do DAS nasce da competência conferida, uma vez só; conferir no roteiro que reconferir não cria outro título.
