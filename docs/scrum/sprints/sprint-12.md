# Sprint 12 — CRM: oportunidades de venda e de compra no desenho do SAP Business One Web Client

Situação: **Planning — aguardando aprovação do PO** (03/10/2026).

Pedido do PO (03/10/2026): "altere o CRM para que ele implemente essas funcionalidades: 1.3 Oportunidades [manual do SAP Business One, Web Client, páginas 63 a 70]. Além disso melhore o design, alinhamento e adicione as informações, campos e ícones corretamente. Siga o design system. Primeiro planeje cada tela e, se for necessário, altere o backend e depois me envie o planejamento."

Este documento é o planejamento. Nada foi implementado ainda: as mudanças do servidor estão descritas na seção **Servidor** e entram junto com as telas depois que o PO aprovar e responder as perguntas do fim.

## Objetivo

Levar *CRM → Oportunidades* ao nível do capítulo 1.3 do manual do SAP B1 Web Client: oportunidades de **venda e de compra**, lista com **visões**, **barra de filtros**, ordenação, **seleção de várias linhas** e as ações **Definir como ganha**, **Definir como perdida**, **Reabrir** e **Remover**; ficha com cabeçalho no desenho do SAP, abertura em **modo de visualização**, abas **Geral, Potencial, Etapas, Parceiros, Concorrentes, Resumo** (mais as que o app já tem) e a criação com **Adicionar e visualizar / Adicionar e novo / Adicionar e voltar**. Tudo com as classes `rp-*`, os tokens e os ícones do design system.

## O que o manual pede e onde estamos

| Manual (1.3) | Hoje (Sprint 11) | Nesta sprint |
|---|---|---|
| Aplicações *Oportunidades* e *Criar oportunidade* | Só *Oportunidades* (lista) com Novo | Item de menu **CRM → Criar oportunidade** e mosaico no Cockpit (pergunta 7) |
| Oportunidade de **vendas** (cliente ou lead) e de **compras** (fornecedor) | Só venda | Campo **Tipo de oportunidade** (Vendas, Compras); Compras usa o fornecedor (pergunta 1) |
| Visões: As minhas em aberto (padrão), Em aberto, Todas, As minhas; visão personalizada | Filtro Abertas/Ganhas/Perdidas/Todas | Menu de visões no canto superior esquerdo, as quatro predefinidas e **Salvar visão como** (guardada no servidor, por usuário) |
| Ordem padrão pelo nº, decrescente; clique no título ordena | Ordem do servidor, sem ordenar | Título de coluna clicável com o ícone `ordenar`; padrão Nº decrescente |
| Barra de filtros | Busca e Filtrar tabela (etapa, responsável) | Barra de filtros com Tipo, Parceiro, Vendedor/comprador, Etapa, Encerramento previsto (de/até) e **Mais filtros** |
| Partilhar: Enviar por e-mail, Guardar como mosaico | — | Menu **Partilhar** (ícone `email`) com as duas opções (perguntas 7 e 8) |
| Definir como ganha / perdida, Reabrir, Remover em uma ou várias | Perda só na ficha, uma por vez; ganha só pelo pedido | Caixa de seleção por linha + barra de ferramentas da tabela com as quatro ações em lote |
| Exportar para Excel; vistas de tabela, gráfico e cartão | — | Ícones `exportar-planilha`, `relatorio-lista` (tabela), `bi` (gráfico, `Barras3D` do ponderado por etapa) e `formulario` (cartão) |
| Ficha abre em modo de visualização | Abre já editável | Abre só leitura; **Editar** passa a editar (pergunta 6) |
| Cabeçalho: Oportunidade nº, Tipo, Cliente/lead ou Fornecedor (com pop-over e "Ver mais"), Vendedor/Comprador, Status, % de encerramento | Nº, nome, prospecção, cliente, unidade, responsável, origem; à direita situação, etapa, %, próxima ação | Cabeçalho reorganizado (desenho abaixo), com o pop-over do parceiro (componente Dica) |
| Ações do cabeçalho: Remover, Nova atividade | Mudar etapa, Registrar interação, Nova proposta, Marcar como perdida | **Remover**, **Nova interação** (a "atividade" do SAP), Nova proposta, Definir como ganha, Definir como perdida, Reabrir, navegação primeiro/anterior/próximo/último |
| Aba Geral (canal PN, classificação) | — (campos no cabeçalho e no Potencial) | Aba nova |
| Aba Potencial: montante potencial, ponderado, moeda, **% e total de lucro bruto**, lucro bruto do último documento, **Encerramento previsto em N dias/semanas/meses** | Potencial, ponderado, previsão (data), interesse, observações | Campos novos; lucro bruto só para quem tem permissão (pergunta 10) |
| Aba Etapas (Níveis): uma linha por etapa, **Etapa seguinte**, **Duplicar última etapa**, **Excluir última etapa**, documento ligado a cada etapa, **Mostrar documentos de PN** | Histórico só leitura + diálogo Mudar etapa | Grade editável (componente Tabela de edição); o histórico imutável continua por trás, para o funil |
| Aba Parceiros | — | Aba nova (pergunta 11) |
| Aba Concorrentes | Concorrente, ameaça, observação | + coluna **Ganhou**; grade no padrão Tabela de edição (linha nova no fim, × ao passar o mouse) |
| Aba Resumo: status, **Ver documentos relacionados com o PN**, tipo e nº do documento | Situação, pedido, motivo, datas | Campos do manual + o documento que fechou |
| Aba Campos definidos pelo usuário | — | Fora (pergunta 9) |
| Criar: Adicionar e visualizar / e novo / e voltar | Adicionar | Botão Adicionar com a lista das três opções |

## Telas

Os desenhos são esquemáticos (largura de ~1100px, a janela padrão das fichas). Valores de exemplo no formato do app (`R$ 150.000,00`, `03/10/2026`).

### Tela 1 — Oportunidades (janela de lista)

```
┌ Oportunidades ─────────────────────────────────────────────────────────────── _ □ × ┐
│ [As minhas oportunidades em aberto ▾]                                [✉ Partilhar ▾] │  ← faixa de visões
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Localizar [________________]  Tipo [Todos ▾]  Parceiro [______⌕]  Vendedor/comprador │  ← Barra de filtros
│ [edson ▾]  Etapa [Todas ▾]  Encerramento de [__/__/____] até [__/__/____]            │
│ [Aplicar] [Limpar] [Mais filtros]        Situação: Aberta ×   Vendedor: edson ×      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [Definir como ganha] [Definir como perdida] [Reabrir] [Remover]   ▤ ▥ ▦ │ ⇅ ⊞ ⊟      │  ← barra da tabela
├──┬──┬──┬───────┬───────┬────────────────┬──────────────────┬────────┬──────────┬─────┤
│☐ │# │→ │ Nº ▼  │ Tipo  │ Nome           │ Parceiro         │ Vend.  │ Etapa    │  %  │ …
│☐ │0 │→ │OP00012│Vendas │Balança — Beta  │C00007 — Fécula B.│ edson  │Proposta  │50,00│ …
│☑ │1 │→ │OP00011│Compras│Células de carga│F00003 — Sensores │ edson  │Cotação   │20,00│ …
│  │  │  │       │       │                │                  │        │          │     │  ← rp-grid-resto
├──┴──┴──┴───────┴───────┴────────────────┴──────────────────┴────────┴──────────┴─────┤
│ «  ‹  1  ›  »  [50 ▾]   1 a 2 de 2 registros     Potencial: R$ 270.000,00  Ponderado: R$ 87.000,00 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [Cancelar] [Novo]                                                             [funil] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Visões** (Seleção à esquerda, acima da barra de filtros): *As minhas oportunidades em aberto* (padrão), *Oportunidades em aberto*, *Todas as oportunidades*, *As minhas oportunidades*, depois as visões salvas do usuário e, separado, **Salvar visão como…** e **Gerenciar visões…** (renomear, excluir, marcar como padrão). Uma visão guarda filtros, ordem, colunas visíveis e o modo (tabela, gráfico, cartão). Visão alterada mostra "(alterada)" ao lado do nome, como no Web Client.
- **Barra de filtros** (componente Barra de filtros): no máximo seis campos na faixa (Tipo, Parceiro com Campo de busca de registro, Vendedor/comprador, Etapa, Encerramento de/até); **Mais filtros** abre a janela com Situação, Origem, Nível de interesse, Potencial de/até e Próxima ação vencida. Cada filtro aplicado vira marca (`rp-chip`) com ×. O funil do canto inferior direito continua abrindo a mesma janela de filtros, como em todas as listas.
- **Grade** (componente Grade, lista: numeração a partir de 0): colunas Nº, Tipo, Nome, Parceiro (código — nome), Vendedor/comprador, Etapa, % de encerramento, Montante potencial, Montante ponderado, Encerramento previsto, Próxima ação, Situação (Selo de status: Aberta `aberto`, Ganha `aprovado`, Perdida `cancelado`). Números à direita (`num`). Título clicável ordena e mostra a seta da direção; padrão **Nº decrescente**. Próxima ação vencida aparece com o ícone `status-aviso` e a palavra "Vencida".
- **Seleção múltipla**: caixa de seleção de 13px antes do #, caixa no cabeçalho marca todas da página; clique na linha seleciona uma, Ctrl e Shift somam; duplo clique ou a seta abre a ficha. Linhas selecionadas em `grid-row-selected`.
- **Barra de ferramentas da tabela**: botões de texto (sem ícone, regra do design system) **Definir como ganha**, **Definir como perdida**, **Reabrir**, **Remover**, habilitados conforme a seleção (ex.: Reabrir só com fechadas selecionadas; Remover só com abertas e com `opportunity.delete`). À direita os ícones de 16px: `relatorio-lista` (tabela), `bi` (gráfico), `formulario` (cartão), `ordenar` (Definições de visualização: colunas visíveis com Lista de seleção, ordem e agrupamento por etapa ou vendedor) e `exportar-planilha`.
- **Ações em lote**: Definir como perdida abre o diálogo com o motivo da lista fixa (Preço, Prazo, Concorrente, Sem orçamento, Desistiu, Outro) e o texto, aplicado a todas; Definir como ganha abre o diálogo com o documento opcional (pergunta 5); Remover e Reabrir pedem confirmação (Caixa de mensagem). O resultado vem por linha: "3 oportunidades definidas como ganhas; 1 não pôde ser alterada" no rodapé e, se houver falhas, a lista delas com o motivo (ex.: "OP00009 tem a proposta 00031 aberta: registre a perda na proposta").
- **Vista de gráfico**: `Barras3D` do montante ponderado por etapa (e por mês de encerramento previsto, à escolha), com a dica do design system; no máximo um gráfico.
- **Vista de cartão**: cartões no estilo Indicador, um por oportunidade (nº, nome, parceiro, etapa com %, ponderado, encerramento previsto, selo), com a caixa de seleção no canto.
- **Paginação** (componente Paginação): 50, 100, 200; o rodapé soma potencial e ponderado de **todos** os registros do filtro (vem do servidor), não só da página.
- **Exportar**: arquivo `.csv` em UTF-8 com separador `;`, valores no formato brasileiro, que o Excel abre direto; exporta o filtro inteiro com as colunas visíveis.

### Tela 2 — Oportunidade (ficha), cabeçalho e ações

```
┌ Oportunidade ─────────────────────────────────────────────────────────────── _ □ × ┐
│ ⏮ ◀ ▶ ⏭   ✎ Editar                    [Nova interação] [Nova proposta] [Definir como ▾] [Remover] │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Tipo de oportunidade  (•) Vendas ( ) Compras      │ Nº              OP00012          │
│ Cliente/lead      → [C00007 ⌕][Fécula Beta Ltda ] │ Situação        [● Aberta]       │
│ Pessoa de contato   [Maria Souza            ▾]    │ Etapa           Proposta         │
│ Vendedor            [edson                  ▾]    │ % de encerramento     50,00%     │
│ Nome da oportunidade[Balança — Fécula Beta     ]  │ Data de início  12/09/2026       │
│ Prospecção        → [PS00004 — Fécula Beta     ]  │ Encerr. previsto 30/11/2026      │
│                                                   │ Próxima ação em [10/10/2026]     │
│                                                   │ Próxima ação    [Ligar p/ revisão] │
├──────────┬──────────┬──────────┬──────────┬───────────┬─────────┬───────────┬──────────┬──────────┬───────────┤
│  Geral   │ Potencial│  Etapas  │ Parceiros│Concorrentes│ Resumo │Interações │ Propostas│ Histórico│Observações│
├──────────┴──────────┴──────────┴──────────┴───────────┴─────────┴───────────┴──────────┴──────────┴───────────┤
│ (painel da aba, ocupa a altura que sobra)                                          │
├────────────────────────────────────────────────────────────────────────────────────┤
│ [OK]  [Cancelar]                                                                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Título**: "Oportunidade" (o design system não põe número no título); o nº fica na coluna de situação à direita, como na janela de documento.
- **Barra do cabeçalho**: navegação `primeiro`, `anterior`, `proximo`, `ultimo` pela sequência da lista que abriu a ficha; `editar` (Editar) passa do modo de visualização para o de edição — no modo de visualização todos os campos ficam `field-readonly` e os botões de ação ficam visíveis; no modo de edição aparecem **Atualizar** e **Cancelar** embaixo e as ações ficam indisponíveis até gravar. **Definir como ▾** abre a lista Ganha / Perdida / Reabrir conforme a situação.
- **Tipo de oportunidade** (Opções, rádio): só na criação; depois fica só leitura. Vendas → o campo se chama **Cliente/lead** e aceita cliente ou prospecção; Compras → **Fornecedor** e aceita só parceiro com papel de fornecedor; o rótulo **Vendedor** vira **Comprador**.
- **Cliente/lead ou Fornecedor** (Campo de busca de registro): código + descrição só leitura ao lado; digitar parte do código ou do nome sugere o melhor resultado; ⌕ abre a lista "Parceiros de negócios". A Seta de link no rótulo abre o cadastro; **clique no código** abre o pop-over (componente Dica) com razão social, CNPJ, cidade/UF, telefone, e-mail, vendedor padrão e o link **Ver mais**, que abre *Dados mestre do parceiro de negócios* (cliente ou fornecedor). Ao escolher o parceiro, contato, vendedor e unidade vêm preenchidos.
- **Pessoa de contato**: Seleção com os contatos do parceiro (`partner_contact`); na prospecção, o contato dela.
- **Vendedor/Comprador**: padrão = vendedor do parceiro; sem ele, o usuário que está criando (no app ainda não há a janela "Vendedores/compradores — Configuração"; o responsável é usuário do sistema, como na Sprint 11).
- **Coluna de situação** (direita, encostada na borda, folga `space-6` antes das abas): Nº, Situação (Selo), Etapa, % de encerramento (da **última linha** da aba Etapas), Data de início, Encerramento previsto, Próxima ação em / Próxima ação (regra do PO de 03/10/2026: obrigatória enquanto aberta).
- **Atalhos** (Alt + letra sublinhada, uma por elemento): <u>G</u>eral, Po<u>t</u>encial, <u>E</u>tapas, P<u>a</u>rceiros, <u>C</u>oncorrentes, Res<u>u</u>mo, I<u>n</u>terações, Pr<u>o</u>postas, <u>H</u>istórico, Ob<u>s</u>ervações; Ed<u>i</u>tar, Nova inte<u>r</u>ação, Nova <u>p</u>roposta, <u>D</u>efinir como, Re<u>m</u>over.

### Tela 2a — aba Geral

```
Canal PN            → [P00021 ⌕][Integradora Sul        ]    Unidade            [Matriz — Toledo   ▾]
Contato do canal      [João Lima                   ▾]        Setor              [Fecularia         ▾]
Origem                [Indicação                   ▾]        Território (UF)    [PR ▾]
Nível de interesse    [Alto                        ▾]        Projeto          → [PR00005 — Balança Beta] (só leitura, depois do pedido)
```

- Duas colunas, rótulos à esquerda (~160px) com o fio `form-rule`, a segunda coluna começando `space-5` depois.
- **Canal PN** e **Contato do canal**: parceiro que traz ou intermedeia o negócio (revenda, integrador).
- **Setor**: lista fixa inicial (Fecularia, Amidonaria, Frigorífico, Laticínio, Agroindústria, Outro), editável pelo Administrador junto com as etapas (pergunta 12).
- **Origem** e **Nível de interesse** saem do cabeçalho e do Potencial atuais e vêm para cá.

### Tela 2b — aba Potencial

```
Encerramento previsto em [ 60 ] [Dias ▾]   →   Data de encerramento prevista [30/11/2026]
Montante potencial       [R$ 150.000,00]   Moeda  R$
Montante ponderado       [R$  75.000,00]   (só leitura: potencial × % da última etapa, 50,00%)
% de lucro bruto         [      32,00%]    Total de lucro bruto [R$ 48.000,00]   ← só com opportunity.gross_profit
Lucro bruto do último documento  Proposta 00031 rev. 2: R$ 51.230,00 (34,15%)     ← só leitura
```

- **Encerramento previsto em** N + Dias/Semanas/Meses, contados da Data de início, preenche a data; digitar a data recalcula o N em dias. Campo de data com conta (`=hoje+60dc`) continua valendo.
- **Montante potencial**: Campo de dinheiro. **Montante ponderado** é calculado na tela e no servidor (mesma regra da Sprint 11, meio para cima).
- **% de lucro bruto ↔ Total de lucro bruto**: digitar um calcula o outro (total = potencial × %; % = total ÷ potencial). Só aparecem e só são gravados com a permissão nova `opportunity.gross_profit`.
- **Lucro bruto do último documento**: total da última proposta ou pedido ligado menos Σ (quantidade × custo de referência do item); linha sem custo de referência vira aviso "sem custo para N linhas", nunca zero.

### Tela 2c — aba Etapas

```
┌# ┬Data início┬Data término┬Vendedor┬Etapa          ┬   %  ┬ Montante potencial ┬ Ponderado      ┬Docs PN┬Tipo de doc.┬ Nº do doc.  ┬Observação      ┐
│1 │12/09/2026 │20/09/2026 │edson   │Qualificação   │10,00 │   R$ 150.000,00    │  R$ 15.000,00  │  ☑   │            │             │1ª reunião      │
│2 │20/09/2026 │02/10/2026 │edson   │Visita técnica │25,00 │   R$ 150.000,00    │  R$ 37.500,00  │  ☑   │            │             │                │
│3 │02/10/2026 │           │edson   │Proposta       │50,00 │   R$ 150.000,00    │  R$ 75.000,00  │  ☑   │Proposta    │00031 ⌕      │                │
└──┴───────────┴───────────┴────────┴───────────────┴──────┴────────────────────┴────────────────┴──────┴────────────┴─────────────┴────────────────┘
[Etapa seguinte] [Duplicar última etapa] [Excluir última etapa]
```

- Componente Tabela de edição; % e Ponderado são `calc` (o % vem da etapa escolhida); a última linha define etapa e % de encerramento do cabeçalho.
- **Etapa seguinte** acrescenta a linha com a próxima etapa do funil, data de início = hoje e data de término da anterior = hoje; **Duplicar última etapa** copia a última; **Excluir última etapa** retira a última (nunca a única).
- **Mostrar documentos de PN** marcado: o ⌕ do Nº do documento lista só documentos do parceiro da oportunidade; desmarcado, de todos os parceiros. Tipos de documento: em Vendas, Proposta, Pedido de venda e Nota fiscal; em Compras, Conta a pagar (pergunta 1).
- O diálogo **Mudar etapa** da Sprint 11 sai: mudar de etapa é acrescentar a linha e Atualizar (que exige a próxima ação, como hoje). Toda mudança da etapa atual continua gravando o histórico imutável que alimenta a conversão por etapa do *Funil de vendas* (IND-016), então o funil não muda.

### Tela 2d — aba Parceiros

```
┌# ┬Parceiro                     ┬Relação      ┬PN relacionado            ┬Observação                ┐
│1 │P00021 — Integradora Sul ⌕   │Integrador ▾ │C00007 — Fécula Beta ⌕    │Indicou e acompanha a obra │
│2 │                              │             │                          │                          │ ← linha nova
```

- Parceiros (clientes, fornecedores ou prospecções) que trabalham junto nesta oportunidade. Relação: lista fixa (Indicador, Revenda, Integrador, Consultor, Parceiro técnico, Outro — pergunta 11).

### Tela 2e — aba Concorrentes

```
┌# ┬Concorrente            ┬Ameaça   ┬Observação                     ┬Ganhou┐
│1 │Balanças Exemplo S.A.   │Alta ▾   │Preço 8% menor                 │  ☐   │
│2 │                         │         │                               │      │ ← linha nova
```

- Passa ao padrão Tabela de edição: sai o botão "Incluir concorrente" e o botão × fixo; a linha vazia no fim cria o concorrente e o × aparece ao passar o mouse. **Ganhou** só pode ser marcada em uma linha e só quando a oportunidade está perdida.

### Tela 2f — aba Resumo

```
Status da oportunidade   ( ) Aberta  (•) Ganha  ( ) Perdida            (só leitura; muda pelas ações)
Ver documentos relacionados com o PN   (•) Sim  ( ) Não
Tipo de documento        Pedido de venda
Nº do documento        → PV00014
Fechada em               15/10/2026 por edson
── se Perdida ──
Motivo da perda          Concorrente
Detalhe                  Preço 8% menor
Concorrente vencedor     Balanças Exemplo S.A.
```

- Tipo e Nº do documento: o documento que fechou (ganha) ou, aberta, o ligado à última etapa. Ver documentos relacionados com o PN = Sim filtra os documentos ligados ao parceiro da oportunidade; Não mostra todos (o filtro vale também para a aba Propostas, que passa a se chamar **Documentos** e mostra propostas, pedidos e notas ligados).
- Para alterar qualquer campo de uma oportunidade fechada é preciso **Reabrir** (regra do manual).

### Tela 2g — abas que o app já tem

**Interações** (as "atividades" do SAP), **Documentos** (era Propostas), **Histórico** (trilha de auditoria) e **Observações** (o campo que hoje fica no Potencial; última aba, regra do design system). **Nova interação** no cabeçalho abre o diálogo atual já ligado à oportunidade e ao parceiro.

### Tela 3 — Criar oportunidade

Mesma ficha, em modo de adição: Tipo de oportunidade editável; abas Geral, Potencial, Etapas (com a primeira linha já criada na primeira etapa), Parceiros, Concorrentes e Observações; as outras ficam indisponíveis até adicionar. Embaixo:

```
[Adicionar ▾]  [Cancelar]
   ├ Adicionar e visualizar   (padrão do Enter: grava e fica na ficha em visualização)
   ├ Adicionar e novo         (grava e abre outra oportunidade vazia, do mesmo tipo)
   └ Adicionar e voltar       (grava, fecha a ficha e volta para a lista)
```

Entradas: Novo na lista, **CRM → Criar oportunidade** no menu lateral e na Busca, mosaico no Cockpit (pergunta 7), Abrir oportunidade na prospecção e no cliente (já existem) e, para compras, **Abrir oportunidade de compra** na ficha do fornecedor.

### Tela 4 — Etapas do funil (configuração)

Ganha a coluna **Usada em** (Vendas, Compras ou as duas) e as etapas iniciais de compra (pergunta 2). O resto continua como na Sprint 11.

### Ajustes de desenho e alinhamento (todas as telas acima)

- Cabeçalho da ficha em duas colunas de largura fixa, rótulos de 160px com o fio `form-rule`, campos alinhados à mesma borda; hoje os rótulos usam colunas de asterisco vazias (`<span />`) que desalinham quando há erro — passa a `rp-label--req`, como diz o Campo de busca de registro.
- Coluna de situação encostada na borda direita com folga `space-6` antes das abas (regra da janela de documento); hoje ela acompanha a largura do formulário.
- Abas com 185px × 25px e o painel ocupando a altura que sobra, grades indo até o pé com `rp-grid-resto` (hoje a aba Concorrentes e a Propostas não têm a linha de preenchimento).
- Números com `num` e duas casas em todas as grades (hoje o % sai sem o símbolo na lista).
- Selos com palavra; próxima ação vencida com ícone e palavra; erros com `status-erro` no rodapé.
- Ícones só os da biblioteca (`editar`, `primeiro`, `anterior`, `proximo`, `ultimo`, `email`, `exportar-planilha`, `relatorio-lista`, `bi`, `formulario`, `ordenar`, `consulta`, `filtro`, `oportunidades`); nenhum ícone dentro de botão de texto.
- Classes novas de tela com o prefixo `rp-crm-` e conferidas no `bundle.css` antes de criar (ação da retrospectiva da Sprint 11).

## Servidor

### Migração V18 (`V18__crm_oportunidades_sap.sql`)

| Tabela | Mudança |
|---|---|
| `opportunity` | `kind` (`VENDAS`, `COMPRAS`; as existentes viram `VENDAS`); `supplier_id` (parceiro com papel FORNECEDOR, só em Compras; check: venda tem lead ou cliente, compra tem fornecedor); `contact_id` (`partner_contact`); `channel_partner_id`, `channel_contact_id`; `industry`; `territory` (UF); `start_date` (as existentes recebem a data de criação); `expected_in` + `expected_in_unit` (`DIAS`, `SEMANAS`, `MESES`); `gross_profit_percent`, `gross_profit_cents`; `show_partner_documents`; `closing_document_type`, `closing_document_id`, `closing_document_code` (generaliza `won_order_code`, que é migrado); `winning_competitor`; `removed_at`, `removed_by` (remoção lógica, pergunta 3); `reopened_at`, `reopened_by` |
| `opportunity_stage_line` (nova) | Linhas da aba Etapas: `position`, `start_date`, `end_date`, `owner`, `stage`, `close_percent`, `potential_cents`, `show_partner_documents`, `document_type`, `document_id`, `document_code`, `notes`. Migração cria uma linha por registro de `opportunity_stage_change` com situação ABERTA |
| `opportunity_stage_change` | Continua, imutável: grava a passagem quando a etapa da última linha muda, o fechamento e agora a **reabertura** (status `REABERTA`); o funil e a conversão IND-016 continuam lendo daqui |
| `opportunity_partner` (nova) | `position`, `partner_id` ou `lead_id`, `relationship`, `related_partner_id`, `notes` |
| `opportunity_competitor` | `won boolean` |
| `opportunity_stage` | `applies_to_sales`, `applies_to_purchases`; etapas de compra iniciais (pergunta 2) |
| `crm_industry` (nova) | Setores editáveis pelo Administrador |
| `user_list_view` (nova, plataforma) | `username`, `screen`, `name`, `definition jsonb` (filtros, ordem, colunas, modo), `is_default`, versão. Genérica, para as outras listas usarem depois |

### Domínio e regras

- `Opportunity` ganha `kind`, as linhas de etapa, os parceiros, os campos da aba Geral e do Potencial; `win(document, …)` passa a aceitar ganho manual com documento opcional; `reopen()` (só fechadas, volta para a etapa da última linha, exige a próxima ação nova); `remove()` (só abertas, sem proposta ou pedido ligado).
- Regra que continua: oportunidade com proposta aberta não é perdida pela oportunidade (a perda vai pela proposta); converter a proposta em pedido continua marcando Ganha com o pedido como documento de fechamento.
- Validações novas: fornecedor só em Compras; proposta só em Vendas; % de lucro bruto entre −100 e 100; datas das etapas em ordem; documento da etapa precisa ser do parceiro quando "Mostrar documentos de PN" estiver marcado.

### API (`/api/v1`)

| Método e caminho | O quê |
|---|---|
| `GET /opportunities` | Paginação (`page`, `size`), ordem (`sort=code,desc`), filtros `kind`, `status`, `owner` (`me`), `partnerId`, `stage`, `closeFrom`, `closeTo`, `source`, `interest`, `potentialFrom`, `potentialTo`, `overdue`, `search`; responde `items`, `total`, `potentialCents` e `weightedCents` do filtro inteiro. **Muda o contrato** da lista (a tela é atualizada junto) |
| `GET /opportunities/export` | O mesmo filtro em CSV |
| `POST /opportunities`, `PUT /opportunities/{id}` | Corpo com `kind`, os campos novos, `stageLines`, `partners`, `competitors` (com `won`) |
| `POST /opportunities/{id}/win` · `/loss` · `/reopen` | Com `If-Match`; `win` com documento opcional |
| `DELETE /opportunities/{id}` | Remoção lógica, `If-Match`, permissão `opportunity.delete` |
| `POST /opportunities/batch/{win\|loss\|reopen\|remove}` | `Idempotency-Key`; corpo `items: [{id, version}]` + motivo/documento; resposta por item (`ok` ou o erro com código), nunca tudo ou nada |
| `GET /opportunities/{id}/documents?partnerOnly=` | Documentos ligáveis e ligados (propostas, pedidos, notas; em Compras, contas a pagar) |
| `GET /partners/{id}/card` | Dados do pop-over do parceiro |
| `GET/POST/PUT/DELETE /list-views?screen=opportunities` | Visões salvas do usuário |
| `GET/PUT /crm-industries` | Setores |

### Permissões, eventos e contratos

- Permissões novas: `opportunity.delete` e `opportunity.gross_profit` (só Administrador); `opportunity.reopen` fica com `opportunity.update`. Consulta continua só vendo — e não vê lucro bruto.
- Eventos: `OpportunityWon` (manual), `OpportunityReopened`, `OpportunityRemoved`, `OpportunitiesBatchChanged`, `ListViewSaved`.
- `openapi.yaml`, `docs/backend/b01/{eventos,formularios,menu}.json` (item *Criar oportunidade*), verificador B01.

## Itens

| ID | História | Critério de aceite |
|---|---|---|
| S12-01 | Tipo de oportunidade e fornecedor | V18; criar oportunidade de compra com fornecedor; fornecedor recusado em Vendas e cliente em Compras (422); proposta recusada em Compras |
| S12-02 | Lista no servidor | Paginação, ordem (padrão Nº decrescente), filtros e somas do filtro inteiro; "As minhas" filtra pelo usuário da sessão |
| S12-03 | Ações em lote | Ganha, perdida, reabrir e remover em várias; resultado por item; ganha/perdida não remove (409); proposta aberta impede a perda pela oportunidade; repetir a chave não repete |
| S12-04 | Reabrir e remover na ficha | Reabrir volta para a etapa da última linha e grava `REABERTA` no histórico; remoção lógica some das visões e fica na trilha |
| S12-05 | Aba Etapas editável | Etapa seguinte, duplicar, excluir última; documento por etapa com "Mostrar documentos de PN"; o funil e a IND-016 continuam com os números da Sprint 11 |
| S12-06 | Geral, Potencial, Parceiros, Concorrentes, Resumo | Campos novos gravados e auditados; lucro bruto escondido e recusado (403 no campo) sem permissão; ponderado igual na tela e no servidor |
| S12-07 | Visões salvas | Salvar, renomear, excluir, marcar como padrão; outra pessoa não vê as suas |
| S12-08 | Tela de lista | Visões, barra de filtros, ordenação, seleção múltipla, barra da tabela, vistas de tabela, gráfico e cartão, exportar, Partilhar |
| S12-09 | Ficha e criação | Modo de visualização e Editar; cabeçalho do SAP com pop-over; navegação; Adicionar e visualizar / e novo / e voltar; menu *Criar oportunidade* |
| S12-10 | Desenho | Ajustes da lista acima conferidos tela a tela contra o design system |
| S12-11 | Contratos | OpenAPI, B01, permissões, menu |
| S12-12 | Roteiro de ponta a ponta | `apps/desktop/e2e/sprint-12.e2e.ts`: compra e venda, lote ganha/perdida, reabrir, remover, visão salva, exportar; roda duas vezes no mesmo banco |

Ordem: S12-01 → S12-12. Se faltar tempo, saem primeiro a vista de cartão, o Partilhar e a aba Parceiros.

## Fora do escopo

Campos definidos pelo usuário (pergunta 9); documentos de compra além de contas a pagar (pedido de compra ainda não existe no app); janela *Vendedores/compradores — Configuração*; mais de um motivo de perda por oportunidade; previsão de vendas; anexos.

## Perguntas ao PO

| # | Pergunta | Recomendação |
|---|---|---|
| 1 | Oportunidade de **compra** entra nesta sprint? O app ainda não tem pedido de compra; o único documento de compra que dá para ligar é a conta a pagar. | Sim, com o fornecedor e a conta a pagar como documento; o pedido de compra liga quando existir |
| 2 | Etapas de compra: as mesmas do funil de vendas ou próprias? | Próprias: Cotação 20%, Negociação 60%, Aprovação 90% (editáveis) |
| 3 | **Remover**: apagar de vez ou só tirar das listas? | Só tirar das listas (remoção lógica), com a trilha; e só sem proposta ou pedido ligado |
| 4 | **Reabrir** uma oportunidade ganha que tem pedido ativo? | Não: só reabre ganha manual ou com o pedido cancelado; perdida reabre sempre |
| 5 | **Definir como ganha** sem pedido (ex.: ganho fora do sistema)? | Sim, com documento opcional e o motivo no texto |
| 6 | A ficha passa a abrir em **modo de visualização** com o botão Editar (como o manual), em vez de já abrir editável como as outras fichas do app? | Sim, só no CRM nesta sprint; se aprovar, levamos às outras fichas depois |
| 7 | **Mosaicos** no Cockpit: "Guardar como mosaico" (a visão vira um bloco com contagem e ponderado) e o mosaico *Criar oportunidade*? | Sim, numa faixa "Meus mosaicos" no topo do Cockpit |
| 8 | **Enviar por e-mail**: o app não envia e-mail (fora do escopo da Sprint 11). | Abrir o programa de e-mail do Mac com o resumo da visão (filtros, contagem, totais) no corpo; o arquivo vai pelo Exportar |
| 9 | Aba **Campos definidos pelo usuário**: o app não tem campos de usuário. | Fora desta sprint |
| 10 | Quem vê e edita o **lucro bruto**? | Só quem tem `opportunity.gross_profit` (Administrador) |
| 11 | Lista de **relações** da aba Parceiros: Indicador, Revenda, Integrador, Consultor, Parceiro técnico, Outro? | Sim, fixa como os motivos de perda |
| 12 | Lista de **setores** inicial: Fecularia, Amidonaria, Frigorífico, Laticínio, Agroindústria, Outro? | Sim, editável pelo Administrador |
| 13 | Vocabulário: manter **Etapas** e **Interações** (já usados no app) em vez de "Níveis/Fases" e "Atividades" do manual? | Manter os do app |

## Como verificar (ao final)

1. *Oportunidades* abre em **As minhas oportunidades em aberto**, ordenada pelo Nº decrescente; clicar em "Ponderado" ordena por ele.
2. Filtrar Tipo = Compras e Encerramento até 31/12/2026: marcas na barra; **Salvar visão como** "Compras do ano"; fechar e abrir: a visão está no menu.
3. Selecionar três abertas → **Definir como perdida** com "Preço": as três ficam Perdidas; uma com proposta aberta volta com o motivo.
4. Selecionar as perdidas → **Reabrir**: voltam para a etapa em que estavam, com linha "Reaberta" no histórico.
5. **CRM → Criar oportunidade**, Compras, fornecedor F00003, potencial R$ 80.000,00, Etapa seguinte até Negociação (60%): ponderado R$ 48.000,00; **Adicionar e novo** abre outra vazia.
6. Abrir uma oportunidade: vem em visualização; clicar no código do cliente mostra o pop-over e **Ver mais** abre o cliente.
7. **Exportar**: o CSV abre no Excel com `R$ 150.000,00` e `30/11/2026`.
8. Entrar como Consulta: vê as listas e as fichas, sem lucro bruto e sem as ações.
