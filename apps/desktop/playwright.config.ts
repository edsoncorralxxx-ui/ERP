import { defineConfig } from '@playwright/test';

/**
 * Roteiro de ponta a ponta no navegador contra o servidor real (ação da retrospectiva da Sprint 3). Antes de rodar:
 * servidor em http://localhost:8080 com um administrador (RENDA_E2E_USER / RENDA_E2E_PASSWORD). O Vite sobe sozinho.
 * Chromium de outra instalação: PLAYWRIGHT_CHROMIUM=/caminho/do/chrome.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 1000 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  webServer: { command: 'npm run dev:web', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
