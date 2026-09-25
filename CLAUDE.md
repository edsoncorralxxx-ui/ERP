# Renda+ ERP

Toda interface deste projeto segue o design system em `design-system/`:

- Antes de criar ou alterar uma tela, leia `design-system/README.md` e o `README.md` do componente em `design-system/components/<Componente>/`.
- Use as classes `rp-*` de `design-system/components/bundle.css` e as variáveis de `design-system/tokens.css`. Não crie cores, fontes, espaçamentos ou sombras fora dos tokens.
- Gráficos e o menu lateral vêm de `window.RendaERP` (`design-system/components/bundle.js`; tipos em `index.d.ts`).
- `design-system/tokens.css` é gerado: altere `tokens.json` e rode `node design-system/scripts/build-tokens.mjs`.
- Textos em português do Brasil, números no formato `R$ 23.579,23` e datas no formato `DD/MM/AAAA`.
