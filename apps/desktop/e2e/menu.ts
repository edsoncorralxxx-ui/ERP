import type { Page } from '@playwright/test';

/** Abre um item do menu lateral do mock: expande o módulo (se ainda fechado) e clica no item pelo rótulo exato. */
export async function abrirMenu(page: Page, modulo: string, item: string): Promise<void> {
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  const grupo = gaveta.locator('.rp-nav-group').filter({ has: page.locator('button.rp-nav-item', { hasText: new RegExp(`^${modulo}$`) }) }).first();
  const cabecalho = grupo.locator('button.rp-nav-item');
  if ((await cabecalho.getAttribute('aria-expanded')) !== 'true') await cabecalho.click();
  await grupo.getByRole('button', { name: item, exact: true }).first().click();
}
