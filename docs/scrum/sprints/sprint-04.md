# Sprint 4 — Proposta → pedido confirmado → projeto, equipamentos e parcelas

Situação: **Entregue para Review** (27/09/2026). Objetivo do roteiro aprovado pelo PO ("implemente a próxima sprint", 27/09/2026); as regras de negócio pendentes seguem as premissas do B01, listadas abaixo para aceite ou ajuste na Review.

## Objetivo

Vender de ponta a ponta: montar a proposta com revisões, convertê-la em pedido, planejar as parcelas e confirmar — e ver o projeto, os equipamentos e as parcelas a receber gerados **uma única vez**, mesmo com a confirmação repetida ou simultânea. Também a primeira fatia do épico B05 (comercial e primeiro fluxo transacional).

## Decisões do planning

| Pendência | Decisão desta sprint | Quem decidiu |
|---|---|---|
| PD-001 — projetos por pedido | Premissa B01: **um projeto por pedido confirmado** e **um equipamento por unidade** de cada linha de equipamento (linha com 2 balanças = 2 equipamentos, cada um com código e histórico próprios) | Premissa B01 — **a confirmar pelo PO** |
| PD-002 — arredondamento | Premissa B01: total da linha = round(quantidade × preço) **meio-par por linha**, menos o desconto; ao dividir o total em parcelas, o **centavo que sobra vai para a primeira** | Premissa B01 — **a confirmar com financeiro e contador** |
| PD-003 — cancelamento de pedido confirmado | Premissa B01: sem recebimento nem execução, cancela os títulos, encerra o projeto e cancela os equipamentos; com recebimento ou projeto além de Planejado, recusa tudo (`CANCELLATION_BLOCKED_BY_EFFECTS`) | Premissa B01 — **a confirmar pelo PO e financeiro** |
| PD-010 / PD-024 — categoria e competência do título | Categoria `RECEITA_VENDA` para todas as parcelas do pedido; competência = mês do vencimento, até existir o plano de categorias | Premissa desta sprint — **a confirmar com o financeiro** |
| Equipamento na linha | A linha de equipamento é descrita pelo **modelo** (texto), sem item do cadastro; material e serviço usam o item do cadastro, da mesma natureza | Time (contrato "pedidos" do B01: tipo EQUIPAMENTO/SERVICO/MATERIAL) |
| Leads e oportunidades | Ficam para depois: a proposta nasce direto para o cliente; funil e interações entram com o CRM | Time |
| Aditivo de pedido confirmado | Fora desta sprint: depois da confirmação, linhas, preços e parcelas não mudam (409 com a indicação "só por aditivo") | Time |

Numeração gerada pelo sistema: proposta `PR00001`, pedido `PV00001`, projeto `PJ00001`, equipamento `EQ00001`, conta a receber `CR00001`.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S4-01 | Propostas com revisões | Rascunho idempotente; revisão em rascunho editável; emitida é imutável (409) e "Nova revisão" copia a última emitida preservando as anteriores; perda com motivo; tudo auditado com evento |
| S4-02 | Converter proposta em pedido | A revisão emitida vigente vira pedido em rascunho com as mesmas linhas; a proposta fica ganha; uma proposta gera um único pedido não cancelado, mesmo com chaves diferentes |
| S4-03 | Pedido em rascunho | Cliente e unidade ativos e da mesma empresa-cliente (INV-SO-6); linhas com quantidade > 0, preço ≥ 0, desconto ≤ bruto (INV-SO-1); total por linha meio-par (INV-SO-2); parcelas com vencimento ≥ contratação |
| S4-04 | Confirmar pedido | Numa transação: confere versão, Σ parcelas = total exato (INV-SO-3) e cliente/unidade ativos; cria projeto, equipamentos e um título a receber por parcela; grava confirmação com o retrato (hash) das linhas e parcelas, auditoria, eventos e recibo. Repetir (mesma chave ou outra, ou em paralelo) devolve a mesma confirmação sem novos efeitos (INV-SO-5, INV-FT-3) |
| S4-05 | Cancelar pedido | Rascunho cancela direto; confirmado segue a premissa PD-003; motivo obrigatório; cancelar de novo devolve o cancelamento existente |
| S4-06 | Projetos e equipamentos | Carteira de projetos e Detalhe do projeto (consulta); lista e ficha de equipamentos com série (única por modelo) e observações editáveis com versão; aceite e garantia vazios até a instalação (PD-015) |
| S4-07 | Telas | Oportunidades e propostas, Proposta, Pedidos e contratos, Pedido de venda, Carteira de projetos, Detalhe do projeto, Equipamentos e Equipamento, no design system |
| S4-08 | Contratos | OpenAPI dos endpoints novos; permissões por ação; `menu.json` marca os itens implementados; eventos novos no catálogo; módulos `comercial`, `projetos` e `financeiro` nas fronteiras do B01 (teste de arquitetura) |
| S4-09 | Roteiro de ponta a ponta versionado | Ação da retrospectiva da Sprint 3: roteiro Playwright no repositório (`apps/desktop/e2e/`), rodando contra o servidor real |

Ordem de execução: S4-03 → S4-04 → S4-05 (servidor) → S4-01/S4-02 → S4-06 → S4-08 → S4-07 → S4-09.

## Fora do escopo

Leads, interações e oportunidades (funil); custo estimado e margem da proposta; exportar proposta em PDF; aditivo de pedido; mudança de estágio do projeto, responsáveis e marcos (B07); recebimento, baixa parcial e estorno (Sprint 5); tela Contas a receber (Sprint 5 — os títulos aparecem no pedido e no projeto); documentos fiscais (Sprint 6).

## Como verificar (ao final)

1. Cadastrar um cliente com a unidade "Matriz" e um material.
2. *Vendas → Oportunidades e propostas → Novo*: cliente, unidade, título, uma linha de equipamento (2 × R$ 150.000,00) e uma de material (10,5 × R$ 16,33 → R$ 171,46 meio-par). Adicionar, **Emitir revisão**, ver que não muda mais; **Nova revisão** mostra a 2 em rascunho e a 1 preservada.
3. **Converter em pedido**: o pedido abre em rascunho com as linhas; a proposta fica ganha.
4. Aba *Parcelas* → **Dividir o total** em 3: R$ 100.057,16 + R$ 100.057,15 + R$ 100.057,15; a soma confere. Atualizar e **Confirmar pedido**.
5. Aba *Projeto e títulos*: projeto `PJ…` planejado, 2 equipamentos e 3 parcelas a receber. Confirmar de novo não cria nada.
6. Abrir um equipamento pela seta, informar a série e Atualizar; repetir a série em outro equipamento do mesmo modelo e ver a recusa.
7. **Cancelar pedido** com motivo: parcelas canceladas, projeto encerrado, equipamentos cancelados.
8. Entrar como Consulta: vê tudo, não cria nem confirma.

Automático: `cd apps/desktop && npm run e2e` (servidor rodando; ver README).

## Review — evidências

| Item | Resultado | Evidência |
|---|---|---|
| S4-01 Propostas com revisões | Pronto | `ComercialApiTest`: rascunho idempotente (mesma chave com outro corpo → 422), alteração com versão, emissão, 409 ao alterar emitida, revisão 2 em rascunho com a 1 preservada (totais diferentes nas duas), perda com motivo obrigatório e sem conversão depois; histórico e eventos `ProposalRevisionIssued`/`ProposalOutcomeRecorded` |
| S4-02 Converter em pedido | Pronto | Mesmo teste: pedido `PV` em rascunho com a revisão 2; proposta ganha; mesma chave e chave nova devolvem o mesmo pedido (1 no banco) |
| S4-03 Pedido em rascunho | Pronto | `confirmacaoRecusadaNaoDeixaEfeito`: unidade de outro cliente recusada, equipamento fracionado, item de natureza errada, desconto acima do bruto, quantidade 0, preço negativo, vencimento antes da contratação e parcela zero — todos apontados no campo |
| S4-04 Confirmar pedido | Pronto | `confirmacaoCriaProjetoEquipamentosETitulosUmaUnicaVez`: 1 projeto, 2 equipamentos, 3 títulos somando exatamente R$ 302.071,46; mesma chave e chave nova → mesma confirmação; eventos na ordem, `SalesOrderConfirmed` uma vez. `confirmacoesConcorrentesComChavesDiferentesGeramUmSoConjunto`: 6 confirmações simultâneas → todas 200 e um único conjunto. Σ parcelas ≠ total → 422 com a diferença em reais e nada criado; cliente inativado depois do rascunho → 422 `PARTNER_INACTIVE_OR_UNIT_MISMATCH` |
| S4-05 Cancelar pedido | Pronto | `cancelamentoDoPedidoConfirmado…`: motivo obrigatório; confirmado → 3 títulos cancelados, projeto encerrado, 2 equipamentos cancelados; lista de contas a receber vazia (cancelados só com filtro); cancelar de novo devolve o existente; confirmar cancelado → 409 |
| S4-06 Projetos e equipamentos | Pronto | `equipamentoTemSerieUnicaPorModeloEHistorico`: série gravada com versão (412 com versão velha), série repetida no mesmo modelo → 422 `EQUIPMENT_SERIAL_DUPLICATE`, aceite e garantia vazios, histórico; carteira com contagem de equipamentos e valor contratado |
| S4-07 Telas | Pronto | `Sprint4Windows.test.tsx` (6 testes): total da linha igual ao do servidor, linhas no formato da API, revisão emitida só leitura, conversão abre o pedido, dividir o total com resíduo na primeira, confirmação reenviada com a **mesma** chave depois de queda de rede, Consulta sem botões, série repetida apontada no campo |
| S4-08 Contratos | Pronto | `docs/backend/api/openapi.yaml` (+26 rotas; `OpenApiContractTest` passa); permissões `proposal.*`, `sales_order.*`, `project.read`, `equipment.*`, `financial_title.read` nos perfis; `menu.json` com 5 itens novos implementados; eventos `ProposalDrafted`, `ProposalUpdated`, `SalesOrderUpdated` no catálogo; `ArchitectureTest` confere comercial → projetos/financeiro/cadastros só pelas APIs públicas; verificador B01 OK |
| S4-09 Roteiro de ponta a ponta | Pronto | `apps/desktop/e2e/sprint-04.e2e.ts` executado no Chromium contra o servidor real (banco vazio): passos 2 a 7 do "Como verificar" |

Testes executados: servidor **74** (PostgreSQL 16 real; eram 66), app **58** (eram 47), typecheck e build do app e do Electron, verificador B01 + 15 testes, roteiro Playwright.

**Não verificado aqui:** o app dentro do Electron no macOS (ambiente Linux sem tela); o CI do GitHub roda no próximo push.

**Limitações conhecidas:**
- A unidade do cliente fica no pedido e no projeto pelo id e pelo nome da época, sem chave estrangeira, porque a ficha do cliente regrava as unidades a cada alteração. Remover da ficha uma unidade já usada num pedido não é impedido; o pedido continua mostrando o nome. Resolver pede que a ficha do cliente preserve as unidades (próximo refinamento).
- O pedido não passa sozinho a "Em execução" nem a "Concluído": isso depende dos estágios do projeto (B07) e dos recebimentos (Sprint 5).

**Pedidos do PO feitos durante a sprint (interface, em todas as telas):**
- Listas suspensas no padrão do design system: o novo componente *Seleção* (`screens/comum/Selecao.tsx`) desenha a lista como o Menu do design system (`rp-menu`, destaque `field-active`, rolagem clássica), com teclado completo, no lugar da lista nativa — em todas as telas, inclusive Usuários, Material ou serviço e o filtro das listas.
- Abas com o hover no azul do design system (`tab-active`), não mais amarelo.
- As janelas passam por cima da faixa de boas-vindas e da busca.
- Esc fecha a janela ativa (perguntando se há alterações não salvas); com lista suspensa, calendário ou caixa de mensagem aberta, fecha só ela.
- Cursor de mão fechada enquanto a janela é arrastada pela barra de título.

**Também feito na sprint:** componente *Campo de data* do design system (`DD/MM/AAAA`, digitação livre `200926`/`20/09/26`, calendário com Hoje e Limpar); histórico mostra valores em reais e datas em `DD/MM/AAAA`.

## Retrospectiva

- Funcionou: o teste de arquitetura gerado do `modulos.json` manteve o comercial falando com projetos e financeiro só pelas APIs públicas; o teste concorrente provou a confirmação única antes da tela existir; o roteiro Playwright versionado achou um caso real (Esc com o foco fora da janela recolhia a gaveta em vez de fechar a janela).
- Melhorar: pedidos de interface chegaram no meio da sprint; entraram porque eram pequenos e transversais, mas convém reuni-los no refinamento.
- Ação: na Sprint 5, rodar o roteiro Playwright também no CI (hoje roda local, com o servidor de pé).
