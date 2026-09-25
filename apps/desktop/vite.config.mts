import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Política de conteúdo aplicada ao app empacotado: nenhuma origem externa; a API é acessada pela ponte do Electron.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function contentSecurityPolicy(): Plugin {
  return {
    name: 'renda-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
