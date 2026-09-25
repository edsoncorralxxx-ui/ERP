// Gera design-system/tokens.css a partir de design-system/tokens.json.
// Uso: node design-system/scripts/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));

// Valores como "{gold-light}" apontam para outro token; vira var(--gold-light).
const valor = (v) => String(v).replace(/^\{([a-z0-9-]+)\}$/, 'var(--$1)');

const linhas = [];
const secao = (titulo, lista) => {
  linhas.push(`  /* ${titulo} */`);
  for (const t of lista) linhas.push(`  --${t.name}: ${valor(t.value)};`);
  linhas.push('');
};

secao('Cor', tokens.color.tokens);

linhas.push('  /* Tipografia */');
for (const [nome, familia] of Object.entries(tokens.type.families)) {
  linhas.push(`  --font-${nome}: ${familia};`);
}
for (const grupo of tokens.type.groups) {
  for (const s of grupo.styles) {
    linhas.push(`  --text-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${grupo.family});`);
  }
}
linhas.push('');

secao('Espaçamento e medidas', tokens.spacing.tokens);
secao('Raio', tokens.radius.tokens);
secao('Sombra', tokens.shadow.tokens);

const css = `/* ${tokens.name} — tokens. Gerado por scripts/build-tokens.mjs a partir de tokens.json; não edite à mão. */
:root {
${linhas.join('\n').trimEnd()}
}
`;

writeFileSync(join(root, 'tokens.css'), css);
console.log('tokens.css gerado');
