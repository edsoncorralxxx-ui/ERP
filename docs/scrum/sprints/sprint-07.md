# Sprint 7 — Fiscal gerencial: receita por competência, simulação e conferência do contador

Situação: **Planning proposto — aguardando aprovação do PO** (28/09/2026). Nada será implementado antes da aprovação e das respostas às perguntas do fim deste arquivo (ação da retrospectiva da Sprint 6: regra de negócio que muda a tela é confirmada no planning, com exemplo numérico).

## Objetivo

Conferir os impostos de cada mês: para cada **competência**, o Renda+ mostra a receita documentada pelas notas da Sprint 6 (produto e serviço), calcula uma **simulação gerencial** do Simples Nacional com parâmetros confirmados pelo contador e registra o **valor que o contador apurou**, com a diferença entre os dois — mantendo sempre separados histórico, simulação e valor do contador, e sem tratar mês desconhecido como zero. A competência conferida pode ser **fechada** (a memória fica congelada) e só reaberta com motivo. Primeira fatia do módulo `fiscal` (B10, tela *Impostos gerenciais*).

## Pendências anteriores (não bloqueiam esta sprint)

| Pendência | Situação |
|---|---|
| Aceite da Sprint 6 (regime de caixa) | Entregue com o ajuste da Review; falta o aceite formal do PO |
| PD-004, PD-005 (Sprint 5) | Premissas em uso (recusar excedente; só estorno total) — a confirmar com o financeiro |
| PD-009 — permissões | Só Administrador opera; Consulta vê — a confirmar pelo PO |

## Decisões propostas para o planning

| Tema | Proposta | Quem decide |
|---|---|---|
| PD-013 — regime e enquadramento | **Simples Nacional**, com um anexo para Produto e outro para Serviço, informados na revisão de parâmetros (ex.: Produto → Anexo II, Serviço → Anexo III). O sistema não escolhe o anexo | **Contador** (pergunta 1) |
| Parâmetros (faixas, alíquota nominal, parcela a deduzir) | Revisão de parâmetros com **vigência** (a partir de `AAAA-MM`); nova revisão não altera simulações antigas. A revisão só vale para cálculo quando marcada **confirmada pelo contador** (nome e data). Sem revisão confirmada → simulação `NOT_CALCULABLE` (ADR-011) | Premissa B01 — ver pergunta 2 |
| Base da receita | **Notas de saída não canceladas por competência** (IND-005), separadas por tipo da linha (Produto/Serviço). Como no regime de caixa da Sprint 6 a nota só sai sobre o recebido, a base coincide com o recebido faturado | PO (pergunta 3) |
| RBT12 | Soma da receita bruta dos **12 meses anteriores** à competência, sem o mês corrente (manual do PGDAS-D, plano funcional). Mês sem nota e sem histórico informado é **desconhecido, não zero**: a simulação sai `NOT_CALCULABLE` listando os meses que faltam | Plano funcional — confirmar com o contador |
| Histórico anterior ao sistema | Digitação da **receita bruta mensal** (produto e serviço) e do **DAS pago** dos meses anteriores, com a origem ("informado por", observação). Fica separado da receita documentada; importação da planilha/PDF fica para B04 | PO (pergunta 4) |
| Cálculo | Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, por anexo; imposto = receita do mês do tipo × alíquota efetiva; arredondamento HALF_EVEN por tipo (PD-002). A **memória** (RBT12 mês a mês, faixa, fórmula, revisão usada) é gravada com a simulação | Premissa — confirmar com o contador |
| Conferência do contador | Valor apurado pelo contador, **vencimento** e observação, por competência; diferença = contador − simulação. O valor do contador nunca é substituído pela simulação | Contrato B01 |
| Título a pagar do DAS | O evento `TaxPeriodConfirmed` sai com `titleId` vazio; o título a pagar nasce na sprint de **Contas a pagar**, uma vez por competência confirmada | PO (pergunta 7) |
| Fechar e reabrir | Fechar exige conferência do contador; congela receita, simulação e conferência. Reabrir exige motivo e permissão própria; a trilha guarda os dois | Contrato B01 |
| Nota em competência fechada | Registrar ou cancelar nota com competência fechada é **recusado** (`TAX_PERIOD_CLOSED`, "reabra a competência"). O módulo documentos consulta uma porta (`CompetenceLockGuard`) implementada pelo fiscal — mesmo desenho do `TitleCancellationGuard` da Sprint 6, sem dependência circular | PO (pergunta 6) |
| PD-009 — permissões | `tax.read` para todos; `tax_parameter.admin`, `tax_period.simulate`, `tax_period.confirm`, `tax_period.close` e `tax_period.reopen` só no **Administrador** | Premissa — a confirmar pelo PO |

### Exemplo numérico (para conferir com o contador antes de implementar)

Competência 09/2026, parâmetros **ilustrativos** (tabelas da LC 123/2006, faixa 2, a confirmar):

| | Produto (Anexo II) | Serviço (Anexo III) |
|---|---|---|
| RBT12 (09/2025 a 08/2026) | R$ 300.000,00 | R$ 300.000,00 |
| Faixa 2: alíquota nominal / parcela a deduzir | 7,80% / R$ 5.940,00 | 11,20% / R$ 9.360,00 |
| Alíquota efetiva | (300.000,00 × 7,8% − 5.940,00) ÷ 300.000,00 = **5,82%** | (300.000,00 × 11,2% − 9.360,00) ÷ 300.000,00 = **8,08%** |
| Receita do mês (nota da Sprint 6) | R$ 12.861,74 | R$ 7.138,26 |
| Imposto simulado | **R$ 748,55** | **R$ 576,77** |

Simulação da competência: **R$ 1.325,32**. Se o contador apurar R$ 1.330,00, a tela mostra diferença de **R$ 4,68**. Se faltar a receita de qualquer mês entre 09/2025 e 08/2026, a simulação sai "Não calculável — falta a receita de: 11/2025, 12/2025…", nunca um valor menor.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S7-01 | Módulo `fiscal` e migração | Migração V12 (`tax_period`, `tax_parameter_revision`, `tax_revenue_history`, `tax_simulation`, `accountant_confirmation`, trilha de fechamento/reabertura); `fiscal` depende só de `documentos` (porta pública `DocumentQueryApi` com a receita por competência) e do kernel/plataforma (`modulos.json`, `ArchitectureTest`) |
| S7-02 | Receita por competência | Por competência e tipo Produto/Serviço, a partir das notas ativas; nota cancelada sai da receita; o total por competência **bate com o "Faturado da lista"** de *Documentos e faturamento* filtrado pela mesma competência (ação da retrospectiva da Sprint 6), conferido no teste do servidor e no roteiro |
| S7-03 | Histórico informado | Administrador digita receita bruta (produto e serviço) e DAS pago de meses anteriores, com origem; competência com notas no Renda+ não aceita histórico de receita (`TAX_HISTORY_CONFLICT`); alteração gera nova versão com trilha; valor ausente continua ausente |
| S7-04 | Parâmetros com vigência | Revisão com regime, anexo por tipo, faixas (limite superior, alíquota nominal, parcela a deduzir) e vigência; faixas contíguas e crescentes, validadas; confirmação do contador (nome, data); revisão confirmada não é alterada — muda-se criando outra; evento `TaxParameterRevised` |
| S7-05 | Simulação | Idempotente pela chave; RBT12 dos 12 meses anteriores com a origem de cada mês (notas ou histórico); faixa pelo RBT12; alíquota efetiva e imposto por tipo como no exemplo acima (teste com esses números); `NOT_CALCULABLE` com os motivos (sem parâmetro confirmado vigente, meses faltando, RBT12 acima do limite); nova simulação preserva a anterior; evento `TaxSimulationRecorded` |
| S7-06 | Conferência do contador | Valor, vencimento e observação; versão da competência conferida (412); diferença contador − simulação; reconferir gera nova versão com histórico; evento `TaxPeriodConfirmed` |
| S7-07 | Fechar e reabrir | Fechar só com conferência; competência fechada não recebe simulação, conferência nem histórico; nota com essa competência recusada no registro e no cancelamento (`TAX_PERIOD_CLOSED`); reabrir com motivo; eventos `TaxPeriodClosed` e `TaxPeriodReopened` |
| S7-08 | Telas | **Impostos gerenciais** (lista por competência: Receita documentada, Histórico, Simulação, Confirmado contador, Diferença, Situação; filtro por ano); **Competência** (abas Receitas — com seta para as notas —, Simulação com a memória, Conferência, Histórico; botões Simular, Registrar conferência, Fechar, Reabrir); **Parâmetros fiscais** (revisões, faixas em `rp-*` Tabela de edição, Confirmar pelo contador); Consulta só vê; design system (`rp-*`, Seleção, Campo de data, Campo de saldo) |
| S7-09 | Contratos | OpenAPI de `/tax-periods`, `/tax-parameters`, `/tax-periods/{id}/simulations`, `/confirmation`, `/close`, `/reopen` (`OpenApiContractTest`); permissões nos perfis; erros no catálogo; eventos com o payload do catálogo; `menu.json` marca *Impostos gerenciais* como implementado; PD-013 atualizada em `pendencias.json`; verificador B01 OK |
| S7-10 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-07.e2e.ts`: nota da Sprint 6 → competência na lista → histórico dos 12 meses → parâmetros confirmados → simulação com os valores do exemplo → conferência → fechar → nota nessa competência recusada; confere pela API o total da competência contra a lista de documentos; roda no job `e2e` do CI com as Sprints 4 a 6 |

Ordem de execução: S7-01 → S7-02 → S7-03 → S7-04 → S7-05 → S7-06 → S7-07 (servidor) → S7-09 → S7-08 → S7-10.

Se faltar tempo, sai primeiro o bloqueio de notas em competência fechada (parte do S7-07) e depois a tela de Parâmetros como janela própria (os parâmetros ficam na aba da competência). S7-01 a S7-06, S7-08 e S7-10 formam o mínimo da sprint.

## Fora do escopo

Emissão ou transmissão do PGDAS-D/DAS; título a pagar do DAS (Contas a pagar); importação do histórico da planilha GESTAO_IMPOSTOS ou de PDFs (B04, worker Python); anexos (apuração do contador em PDF — B04); Fator R e folha de pagamento; sublimite estadual, ICMS/ISS fora do DAS, substituição tributária, DIFAL e retenções; Lucro Presumido/Real; mais de um CNPJ; início de atividade com menos de 12 meses (proporcionalização do RBT12); repasses (PD-012); painel fiscal com gráficos.

## Como verificar (ao final)

1. Usar a nota de R$ 20.000,00 da Sprint 6 (produto R$ 12.861,74, serviço R$ 7.138,26) com competência 09/2026.
2. *Fiscal → Impostos gerenciais*: 09/2026 com Receita documentada R$ 20.000,00, igual ao "Faturado da lista" de *Documentos e faturamento* na mesma competência; Simulação "Não calculável".
3. Abrir a competência → **Simular**: "Não calculável — sem parâmetros confirmados; falta a receita de 09/2025 a 08/2026".
4. *Parâmetros fiscais → Nova revisão*: Simples Nacional, Produto Anexo II, Serviço Anexo III, faixas informadas, vigência 01/2026; **Confirmar pelo contador**.
5. Informar o histórico dos 12 meses (R$ 25.000,00 por mês, meio a meio) → **Simular**: RBT12 R$ 300.000,00, simulação R$ 1.325,32 com a memória.
6. **Registrar conferência**: R$ 1.330,00, vencimento 20/10/2026 → diferença R$ 4,68.
7. **Fechar**. Registrar uma nota com competência 09/2026 → recusada com "Competência 09/2026 fechada".
8. **Reabrir** com motivo → a nota é aceita; a trilha mostra fechamento e reabertura.
9. Entrar como Consulta: vê tudo; não simula, não confere, não fecha, não altera parâmetros.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README) — e o job `e2e` do CI.

## Riscos

- **Parâmetros errados viram número errado com aparência oficial**: por isso a simulação só usa revisão confirmada pelo contador e a tela sempre mostra "simulação gerencial", separada do valor do contador.
- **Anexo por tipo pode não bastar** (ex.: instalação em Anexo IV, atividade com Fator R): se o contador indicar, o anexo passa a ser por natureza da operação (classificação da Sprint 6) — muda a política de enquadramento, não o modelo.
- **Notas mistas**: se produto e serviço tiverem de sair em notas separadas (pergunta 5), o registro da Sprint 6 muda antes desta sprint ou junto dela.

## Perguntas do planning

1. **Enquadramento (contador):** a empresa é Simples Nacional? Qual anexo para a venda de equipamentos e qual para instalação/serviço?
2. **Tabelas:** o sistema traz as faixas da LC 123 preenchidas como sugestão (marcadas "a confirmar", sem uso até o contador confirmar), ou o administrador digita tudo? Proposta: trazer como sugestão — o ADR-011 ("sem valores até validação") continua valendo, porque nada é calculado antes da confirmação.
3. **Base da receita:** a receita do mês é a das **notas registradas** naquela competência (proposta) ou o **recebido** no mês?
4. **Histórico:** vocês têm a receita bruta mensal dos últimos 12 meses (PGDAS ou planilha) para digitar? Sem ela, nenhuma simulação sai antes de 12 meses de uso.
5. **Notas separadas (retrospectiva da Sprint 6):** produto (NF-e) e serviço (NFS-e) saem em notas separadas para o mesmo recebimento?
6. **Competência fechada:** recusar registrar/cancelar nota nela (proposta) ou só avisar?
7. **DAS a pagar:** o título a pagar do DAS fica para a sprint de Contas a pagar (proposta)?
