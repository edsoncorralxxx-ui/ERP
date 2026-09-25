# Renda+ ERP

## Design system

O design system do projeto fica em [`design-system/`](design-system/). Ele foi exportado do design system **Renda+ ERP** criado no Claude.

| Arquivo | O que é |
| --- | --- |
| `design-system/README.md` | Regras de conteúdo, cor, tipografia, layout e ícones. Leia antes de montar uma tela. |
| `design-system/tokens.json` | Fonte dos tokens: cores, tipografia, espaçamento, raio e sombra. |
| `design-system/tokens.css` | Os tokens como variáveis CSS (`--nav`, `--space-4`...). Gerado a partir do `tokens.json`. |
| `design-system/components/bundle.css` | Estilos de todos os componentes (classes `rp-*`), com os ícones embutidos. |
| `design-system/components/bundle.js` | Gráficos 3D e menu lateral (`window.RendaERP`), sem dependências. |
| `design-system/components/index.d.ts` | Tipos TypeScript do `window.RendaERP`. |
| `design-system/components/<Componente>/` | Guia (`README.md`) e exemplo de marcação (`preview.html`) de cada componente. |
| `design-system/assets/` | Logotipos (PNG) e ícones (SVG). |

### Como usar numa página

```html
<link rel="stylesheet" href="design-system/tokens.css">
<link rel="stylesheet" href="design-system/components/bundle.css">
<script src="design-system/components/bundle.js"></script>

<body class="rp">
  <button class="rp-btn rp-btn--default">OK</button>
  <button class="rp-btn"><u>C</u>ancelar</button>
</body>
```

Copie a marcação do `preview.html` do componente que você precisa. Os gráficos são criados por script, por exemplo
`RendaERP.Barras3D(elemento, { categorias, series })`.

### Ver a galeria

A galeria mostra todos os componentes renderizados:

```sh
cd design-system
python3 -m http.server 8000
# abra http://localhost:8000
```

### Mudou um token?

Edite o `design-system/tokens.json` e gere o CSS de novo:

```sh
node design-system/scripts/build-tokens.mjs
```
