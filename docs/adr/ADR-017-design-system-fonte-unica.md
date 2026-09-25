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

## Consequências

- Alterar a aparência é alterar `design-system/tokens.json` e rodar `node design-system/scripts/build-tokens.mjs`.
- Novos componentes de tela seguem o `README.md` do componente correspondente.
- Os tokens provisórios da Sprint 1 foram removidos.

## Alternativas consideradas

Copiar o CSS para dentro do app (duplicaria a fonte); reescrever os componentes em CSS próprio (perderia fidelidade).
