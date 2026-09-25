# ADR-017 — Design system Renda+ ERP como fonte única da interface

- Situação: Aceito pelo PO em 25/09/2026 (Sprint 1)
- Data: 2026-09-25

## Contexto

O PO pediu para usar o design system integrado na sessão "Integração do Design System" (branch `claude/serene-darwin-0e27bz`). Até então o app usava tokens provisórios tirados do briefing.

## Decisão

- A pasta `design-system/` (guia, `tokens.json`/`tokens.css`, `components/bundle.css`, `bundle.js`, 49 componentes, ícones e logotipos) foi trazida para este branch e é a **fonte única** de cores, tipografia, espaçamentos, sombras, ícones e marcação.
- O app importa `design-system/tokens.css` e `design-system/components/bundle.css` diretamente; não há cópia nem tokens paralelos.
- As telas usam a marcação e as classes `rp-*` de cada componente (Barra superior, Barra de menus, Barra de ferramentas, Trilho/Menu lateral recolhível, Painel de módulos, Janela, Caixa de mensagem, Abas, Campo de texto, Botão, Selo de status, Grade, Barra de status do sistema, Logotipo).
- `apps/desktop/src/styles/app.css` contém só a ligação com o React (posição das janelas internas, menus suspensos, modal), usando apenas variáveis dos tokens.
- O comportamento (janelas, gaveta, acordeão, menus) é implementado em React; `bundle.js` fica reservado para os gráficos quando houver dashboards.
- `CLAUDE.md` na raiz registra a regra para qualquer sessão futura: ler o guia antes de criar tela e não criar cores, fontes ou sombras fora dos tokens.

## Ajustes pedidos pelo PO (25/09/2026)

Divergências conscientes em relação ao guia do design system, todas feitas só com tokens:

- **Gaveta de módulos em altura total**: vai da barra de ferramentas ao rodapé, como coluna própria; a linha de boas-vindas e as janelas ficam ao lado dela (o guia a abre dentro da área de trabalho, sobreposta).
- **Hover suave no menu lateral**: o degradê de hover/aberto fica numa camada com transição de opacidade (0,2 s), sem troca seca de fundo; o hover do trilho usa `tab` em vez de `grid-row-alt`, que parecia um piscar branco.
- **Controles de janela no padrão do macOS**: sem os botões minimizar/maximizar/fechar na barra de menus (o macOS já oferece os seus); as janelas internas usam fechar, minimizar e maximizar à esquerda do título, com `status-error`, `status-warning` e `status-success`.
- **Hover amarelo** em todos os componentes, exceto o menu lateral: botões, barra de ferramentas, menus da barra superior e abas em `field-active`; linhas de grade em `field-note`; transição de 0,18 s. Aplicado no CSS de ligação do app, sem alterar o `bundle.css` exportado.
- **Menu suspenso por cima da barra de ferramentas**: a barra de menus ganhou um nível de empilhamento acima (no bundle as duas tinham o mesmo).

## Consequências

- Alterar a aparência é alterar `design-system/tokens.json` e rodar `node design-system/scripts/build-tokens.mjs`.
- Novos componentes de tela seguem o `README.md` do componente correspondente.
- Os tokens provisórios da Sprint 1 foram removidos.

## Alternativas consideradas

Copiar o CSS para dentro do app (duplicaria a fonte); reescrever os componentes em CSS próprio (perderia fidelidade).
