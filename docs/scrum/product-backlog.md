# Product Backlog — Renda+ ERP

Ordenado por prioridade. Épicos correspondem às fases do roteiro (`../backend/02-roteiro-e-backlog.md`). Histórias detalhadas só para as próximas sprints; as demais serão refinadas antes de entrarem.

## Épicos

| Ordem | Épico | Fase | Situação |
|---|---|---|---|
| 1 | Fundação de domínio e especificação | B01 | Sprint 0 — em revisão do PO |
| 2 | Base executável (servidor, worker, banco, CI) | B02 | Próximo |
| 3 | Acesso, cadastros e metadados | B03 | Backlog |
| 4 | Arquivos, importação e conferência | B04 | Backlog |
| 5 | Comercial e primeiro fluxo transacional | B05 | Em execução (Sprints 4 e 5; Sprint 11: CRM) |
| 6 | Financeiro, conciliação e caixa | B06 | Em execução (Sprint 5: recebimentos, estornos e contas; Sprint 6: documentos e faturamento; Sprint 8: contas a pagar; Sprint 9: fluxo de caixa e transferências) |
| 7 | Engenharia e planejamento | B07 | Em execução (Sprint 10: BOM) |
| 8 | Suprimentos, estoque e terceiros | B08 | Backlog |
| 9 | Produção, qualidade e instalação | B09 | Backlog |
| 10 | Repasses, fiscal e indicadores | B10 | Em execução (Sprint 7: fiscal gerencial; Sprint 12: fiscal refeito pelo mock — em planning) |
| 11 | Pós-venda | B11 | Backlog |
| 12 | Migração do histórico | B12 | Backlog |
| 13 | Piloto e implantação | B13 | Backlog |
| 14 | Novas áreas analíticas | B14 | Backlog |
| 15 | Previsão, simulação e otimização | B15 | Backlog |
| 16 | IA generativa | B16 | Futuro |

O cliente macOS (Electron + React, janelas SAP B1, design system) entra junto das histórias de cada fluxo a partir do épico 3, e uma história própria de estrutura visual antes do primeiro fluxo com tela.

## Roteiro de sprints (fatias verticais)

Decidido com o PO em 25/09/2026: cada sprint entrega uma **fatia vertical completa** (tela no app do Mac + API + regras + banco + testes) de um fluxo real, na ordem das dependências. Os épicos acima continuam sendo o mapa técnico; as sprints os atravessam.

| Sprint | Fatia vertical | Resultado para o usuário | Épicos |
|---|---|---|---|
| 1 | Esqueleto do sistema: servidor, banco, app do Mac com janelas, primeira tela de ponta a ponta (dados da empresa) — **entregue para Review** | Abrir o app, ver a conexão com o servidor e salvar dados reais | B02 |
| 2 | Login, permissões e auditoria + Clientes e unidades — **entregue para Review** | Entrar, cadastrar clientes/unidades, ver histórico | B02, B03 |
| 3 | Fornecedores, materiais e serviços, unidades e categorias — **entregue para Review** (equipamentos passaram para a Sprint 4, decisão do PO em 25/09/2026) | Cadastros básicos completos | B03 |
| 4 | Proposta → pedido confirmado → projeto, equipamento e parcelas; tela de Equipamentos — **entregue para Review** (premissas PD-001, PD-002 e PD-003 a confirmar) | Vender e ver projeto, equipamentos e parcelas gerados uma única vez | B05 |
| 5 | Contas a receber (tela e títulos da Sprint 4): baixa parcial e estorno; contas financeiras e extrato; roteiro Playwright no CI — **entregue para Review** (premissas PD-004, PD-005 e PD-009 a confirmar) | Registrar e estornar recebimentos | B05, B06 |
| 6 | Documentos e faturamento vinculados às parcelas — **entregue para Review**, ajustada na Review para o regime de caixa (PD-023 respondida; PD-009 a confirmar) | Registrar notas sem duplicar cobrança | B06 |
| 7 | Fiscal gerencial: receita por competência, histórico informado, simulação do Simples Nacional, conferência do contador e fechamento e notas separadas de produto e serviço; registro anterior e próximo nas fichas — **entregue para Review** (`sprints/sprint-07.md`; PD-013 respondida) | Conferir impostos por competência | B10 |
| 8 | Contas a pagar: títulos manuais com parcelas, pagamento parcial com saída na conta, estorno, cancelamento, categorias financeiras (PD-010) e o DAS gerado pela conferência do contador — **entregue para Review** (`sprints/sprint-08.md`) | Registrar e pagar obrigações; DAS uma vez só | B06, B10 |
| 9 | Fluxo de caixa mês a mês (realizado, em atraso e previsto, com a composição de cada valor), transferência entre contas e pendências fiscais — **entregue para Review** (`sprints/sprint-09.md`) | Ver o caixa previsto e o realizado | B06 |
| 10 | BOM por modelo com submontagens (editável direto, árvore e diagrama), carga da BOM real em JSON, BOM do equipamento com ajustes, custo planejado e margem do projeto — **entregue para Review** (`sprints/sprint-10.md`) | Saber quanto custa cada equipamento antes de produzir | B07 |
| 11 | CRM no desenho do SAP Business One: prospecção com estrelas e carga da lista, interações com próxima ação, oportunidades pelas etapas do funil com percentual de fechamento e valor ponderado, concorrentes, perda com motivo da lista, conversão em cliente, propostas ligadas à oportunidade, funil com conversão por etapa (IND-016) e agenda — **entregue para Review** (`sprints/sprint-11.md`) | Acompanhar cada empresa-alvo e cada negócio até o pedido | B05 |
| 12 | Fiscal refeito pelo mock *Renda+ ERP MOCK*: painel fiscal, apuração do Simples por anexo (I, II e III) com repartição por tributo e ISS limitado, histórico de receita e RBT12 mês a mês, PGDAS-D e guia DAS com pagamento, fechamento por etapas, obrigações com calendário, classificação fiscal dos itens e tabelas e parâmetros (anexos I a V, limites, opção IBS/CBS) — **planning aguardando aprovação do PO** (`sprints/sprint-12.md`) | Apurar, pagar e fechar o Simples por anexo e não perder prazo fiscal | B10 |
| — | Conciliação bancária com importação de extrato OFX/CSV — **adiada pelo PO em 01/10/2026**, sem sprint definida | Conferir o extrato do banco com os lançamentos | B04, B06 |
| — | Cronograma do projeto (EAP, Gantt, caminho crítico, linha de base e avanço) — proposto em 03/10/2026 e **trocado pelo CRM** a pedido do PO; proposta e perguntas na conversa de planning da Sprint 11 | Saber se o projeto está no prazo | B07 |
| 12+ | Cronograma, compras, estoque, produção, qualidade, instalação, repasses, pós-venda, importação do histórico | Um fluxo novo por sprint | B04–B12 |

A ordem pode ser revista em cada refinamento. O worker Python entra na primeira sprint que precisar dele (importação de arquivos).

## Histórias refinadas — Sprint 1

Ver `sprints/sprint-01.md`. As histórias abaixo (épico B02) serão distribuídas entre as Sprints 1 e 2.

### Épico 2 (B02)

| ID | História | Critério de aceite | Depende de |
|---|---|---|---|
| US-201 | Como time, quero as tecnologias e versões definidas, para construir sobre base suportada | ADR-004 aceito com versões fixadas | PO |
| US-202 | Como time, quero a estrutura do repositório e um ambiente local reproduzível, para qualquer pessoa subir o sistema | README com passos; banco sobe com um comando | US-201 |
| US-203 | Como financeiro, quero que valores nunca percam centavos, para que parcelas e saldos fechem | Money/Quantity com testes de propriedade; soma de parcelas sempre exata | US-202, PD-002 |
| US-204 | Como time, quero que o build falhe se um módulo depender de outro indevidamente, para manter a arquitetura | Teste arquitetural gerado de `modulos.json` | US-202 |
| US-205 | Como usuário, quero que uma operação repetida por queda de conexão não se duplique, para confiar no sistema — **Sprint 2** | Recibo de comando + consulta por ID; teste de resposta perdida | US-202 |
| US-206 | Como sistema, quero eventos e fatos gravados junto com a operação, para indicadores e módulos ficarem consistentes — **Sprint 2** | Outbox + fatos na mesma transação; consumidor idempotente testado | US-205 |
| US-207 | Como time, quero um worker Python que retome tarefas após falha, para processar PDFs com segurança | Tarefa sobrevive a reinício; resultado de lease antigo rejeitado | US-206 |
| US-208 | Como cliente Mac, quero uma API documentada com erros claros em português — **Sprint 2** (`docs/backend/api/openapi.yaml`) | OpenAPI publicada; formato de erro padronizado com correlationId | US-205 |
| US-209 | Como time, quero CI executando build, testes, verificador B01 e migrações | Pipeline verde em banco limpo | US-202 |
