import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 4 — "Como verificar": proposta → revisão emitida → pedido → parcelas → confirmação (projeto, equipamentos e
 * títulos gerados uma vez) → equipamento com série → cancelamento. Os cadastros de apoio são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/${nome}.png` });
}

/** Escolhe na Seleção do design system: abre a lista desenhada e clica na opção. */
async function escolher(page: Page, campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await page.getByRole('listbox').getByRole('option', { name: opcao }).click();
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { token } = await login.json();
  const headers = (k: string) => ({ Authorization: `Bearer ${token}`, 'Idempotency-Key': `e2e-${SUFIXO}-${k}` });
  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: headers('cliente'),
    data: { legalName: `Fecularia E2E ${SUFIXO} Ltda.`, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
  });
  expect(cliente.ok(), await cliente.text()).toBeTruthy();
  const cat = await request.post(`${API}/api/v1/item-categories`, { headers: { Authorization: `Bearer ${token}` }, data: { name: `Perfis ${SUFIXO}` } });
  expect(cat.ok(), await cat.text()).toBeTruthy();
  const item = await request.post(`${API}/api/v1/items`, {
    headers: headers('item'),
    data: { description: `Perfil L ${SUFIXO}`, nature: 'MATERIAL', uom: 'M', categoryId: (await cat.json()).id, stockControlled: true },
  });
  expect(item.ok(), await item.text()).toBeTruthy();
});

test('proposta vira pedido confirmado com projeto, equipamentos e parcelas uma única vez', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Proposta pela gaveta: Vendas → Propostas → Novo.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Vendas', exact: true }).click();
  await gaveta.getByRole('button', { name: 'Propostas', exact: true }).click();
  const lista = page.getByRole('dialog', { name: 'Propostas', exact: true });
  await lista.getByRole('button', { name: 'Novo', exact: true }).click();
  const proposta = page.getByRole('dialog', { name: 'Proposta', exact: true });
  await escolher(page, proposta.getByRole('combobox', { name: 'Cliente', exact: true }), new RegExp(`Fecularia E2E ${SUFIXO}`));
  await escolher(page, proposta.getByRole('combobox', { name: 'Unidade', exact: true }), 'Matriz');
  await proposta.getByLabel('Título').fill('Linha de dosagem');
  await proposta.getByRole('button', { name: /adicionar uma linha/ }).click();
  await proposta.getByLabel('Descrição da linha 1').fill('Balança de fluxo BF-200');
  await proposta.getByLabel('Quantidade da linha 1').fill('2');
  await proposta.getByLabel('Preço unitário da linha 1').fill('150.000,00');
  await proposta.getByRole('button', { name: /adicionar uma linha/ }).click();
  await escolher(page, proposta.getByRole('combobox', { name: 'Tipo da linha 2' }), 'Produto');
  await escolher(page, proposta.getByRole('combobox', { name: 'Item da linha 2' }), new RegExp(`Perfil L ${SUFIXO}`));
  await proposta.getByLabel('Quantidade da linha 2').fill('10,5');
  await proposta.getByLabel('Preço unitário da linha 2').fill('16,33');
  await expect(proposta.getByLabel('Total da linha 2')).toHaveText('171,46');
  await expect(proposta.getByLabel('Total', { exact: true })).toHaveValue('R$ 300.171,46');
  await foto(page, '01-proposta-rascunho');
  await proposta.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(proposta.getByLabel('Número')).toHaveValue(/PR\d{5}/);
  await proposta.getByRole('button', { name: 'Emitir revisão', exact: true }).click();
  await expect(proposta.getByText(/emitida: para alterar, crie uma nova revisão/)).toBeVisible();
  await proposta.getByRole('button', { name: 'Converter em pedido', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Converter em pedido' }).getByRole('button', { name: 'Converter', exact: true }).click();

  // Pedido em rascunho aberto a partir da proposta: dividir em 3 parcelas e confirmar.
  const pedido = page.getByRole('dialog', { name: 'Pedido de venda', exact: true });
  await expect(pedido.getByLabel('Número')).toHaveValue(/PV\d{5}/);
  await pedido.getByRole('tab', { name: /Parcelas/ }).click();
  await pedido.getByRole('button', { name: 'Dividir o total', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Dividir o total' }).getByRole('button', { name: 'Dividir', exact: true }).click();
  await expect(pedido.getByText('Confere com o total do pedido')).toBeVisible();
  await expect(pedido.getByLabel('Valor da parcela 1')).toHaveValue('100.057,16');
  await foto(page, '02-pedido-parcelas');
  await pedido.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText(/Pedido PV\d{5} atualizado com sucesso/).first()).toBeVisible();
  await pedido.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Confirmar pedido' }).getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(pedido.getByRole('table', { name: 'Equipamentos do pedido' }).getByRole('row')).toHaveCount(3);
  await expect(pedido.getByRole('table', { name: 'Parcelas a receber do pedido' })).toContainText('R$ 300.171,46');
  await expect(pedido.getByText('Confirmado', { exact: true })).toBeVisible();
  await foto(page, '03-pedido-confirmado');

  // Equipamento pela seta: série e observações.
  await pedido.getByRole('link', { name: /Abrir equipamento EQ\d{5}/ }).first().click();
  const equipamento = page.getByRole('dialog', { name: 'Equipamento', exact: true });
  await equipamento.getByLabel('Nº de série').fill(`BF-${SUFIXO}`);
  await equipamento.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(equipamento.getByLabel('Versão')).toHaveValue('2');
  await foto(page, '04-equipamento');
  await page.keyboard.press('Escape');
  await expect(equipamento).toBeHidden();

  // Carteira de projetos mostra o projeto planejado.
  await page.getByRole('menuitem', { name: 'Módulos' }).click();
  await page.getByRole('menuitem', { name: 'Carteira de projetos' }).click();
  const carteira = page.getByRole('dialog', { name: 'Carteira de projetos', exact: true });
  await expect(carteira.getByRole('table')).toContainText(`Fecularia E2E ${SUFIXO}`);
  await expect(carteira.getByRole('table')).toContainText('Planejado');
  await foto(page, '05-carteira');

  // Cancelar o pedido confirmado: títulos cancelados, projeto encerrado, equipamentos cancelados.
  await pedido.click({ position: { x: 200, y: 10 } });
  await pedido.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
  const motivo = page.getByRole('alertdialog', { name: 'Cancelar pedido' });
  await motivo.getByLabel('Motivo').fill('Cliente desistiu');
  await motivo.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
  await expect(pedido.getByText('Cancelado', { exact: true }).first()).toBeVisible();
  await pedido.getByRole('tab', { name: /Projeto e títulos/ }).click();
  await expect(pedido.getByRole('table', { name: 'Parcelas a receber do pedido' })).toContainText('Cancelado');
  await foto(page, '06-pedido-cancelado');
});
