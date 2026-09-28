import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 5 — "Como verificar": título gerado por um pedido confirmado → baixa parcial → quitação → estorno com motivo,
 * pela tela Contas a receber. O cliente e o pedido confirmado são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CLIENTE = `Amido E2E ${SUFIXO} Ltda.`;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/${nome}.png` });
}

async function escolher(page: Page, campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await page.getByRole('listbox').getByRole('option', { name: opcao }).click();
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { token } = await login.json();
  const auth = { Authorization: `Bearer ${token}` };
  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: { ...auth, 'Idempotency-Key': `e2e5-${SUFIXO}-cliente` },
    data: { legalName: CLIENTE, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
  });
  expect(cliente.ok(), await cliente.text()).toBeTruthy();
  const c = await cliente.json();
  // Pedido de R$ 100.000,00 em duas parcelas: R$ 55.500,00 (exemplo do B01) e R$ 44.500,00.
  const pedido = await request.post(`${API}/api/v1/sales-orders`, {
    headers: { ...auth, 'Idempotency-Key': `e2e5-${SUFIXO}-pedido` },
    data: {
      customerId: c.id, unitId: c.units[0].id, contractDate: '2026-10-01',
      lines: [{ kind: 'EQUIPAMENTO', description: 'Balança de fluxo BF-200', quantity: '1', unitPrice: '100000' }],
      installments: [{ dueDate: '2026-10-10', amountCents: '5550000', milestone: 'Sinal' }, { dueDate: '2026-12-10', amountCents: '4450000', milestone: 'Aceite' }],
    },
  });
  expect(pedido.ok(), await pedido.text()).toBeTruthy();
  const confirmado = await request.post(`${API}/api/v1/sales-orders/${(await pedido.json()).id}/confirmations`, {
    headers: { ...auth, 'Idempotency-Key': `e2e5-${SUFIXO}-conf`, 'If-Match': '"1"' },
  });
  expect(confirmado.ok(), await confirmado.text()).toBeTruthy();
});

test('baixa parcial, quitação e estorno de um título a receber', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Financeiro → Contas a receber, buscando pelo cliente.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await gaveta.getByRole('button', { name: /Contas a receber/ }).click();
  const lista = page.getByRole('dialog', { name: 'Contas a receber', exact: true });
  await lista.getByPlaceholder('Título, cliente ou pedido').fill(CLIENTE);
  const grade = lista.getByRole('table', { name: 'Contas a receber' });
  await expect(grade.getByRole('row')).toHaveCount(3);
  await expect(lista.getByText('Saldo a receber: R$ 100.000,00')).toBeVisible();
  await foto(page, '01-contas-a-receber');
  await grade.getByRole('link', { name: /Abrir título CR\d{5}/ }).first().click();

  // Baixa parcial de R$ 20.000,00 no título de R$ 55.500,00.
  const titulo = page.getByRole('dialog', { name: 'Título a receber', exact: true });
  await expect(titulo.getByLabel('Saldo')).toHaveValue('R$ 55.500,00');
  await titulo.getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  let dialogo = page.getByRole('alertdialog', { name: 'Registrar recebimento' });
  await expect(dialogo.getByLabel('Valor')).toHaveValue('55.500,00');
  await escolher(page, dialogo.getByRole('combobox', { name: 'Conta' }), /Caixa/);
  await dialogo.getByLabel('Valor').fill('20.000,00');
  await dialogo.getByLabel('Observações').fill('Pix do sinal');
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(titulo.getByLabel('Saldo')).toHaveValue('R$ 35.500,00');
  await expect(titulo.getByText('Parcial', { exact: true })).toBeVisible();
  await expect(page.getByText(/Recebimento RC\d{5} de R\$ 20\.000,00 registrado com sucesso/).first()).toBeVisible();
  await foto(page, '02-baixa-parcial');

  // Acima do saldo: recusado, com o saldo atual no diálogo.
  await titulo.getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  dialogo = page.getByRole('alertdialog', { name: 'Registrar recebimento' });
  await dialogo.getByLabel('Valor').fill('40.000,00');
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(dialogo.getByText('Saldo atual R$ 35.500,00.')).toBeVisible();
  await foto(page, '03-acima-do-saldo');

  // Quita o restante.
  await dialogo.getByLabel('Valor').fill('35.500,00');
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(titulo.getByLabel('Saldo')).toHaveValue('R$ 0,00');
  await expect(titulo.getByText('Liquidado', { exact: true })).toBeVisible();

  // Estorna o primeiro recebimento: o título volta a parcial com R$ 20.000,00 de saldo.
  const recebimentos = titulo.getByRole('table', { name: 'Recebimentos do título' });
  await expect(recebimentos.getByRole('row')).toHaveCount(3);
  await recebimentos.getByRole('row').filter({ hasText: 'R$ 20.000,00' }).click();
  await titulo.getByRole('button', { name: 'Estornar recebimento', exact: true }).click();
  const estorno = page.getByRole('alertdialog', { name: 'Estornar recebimento' });
  await estorno.getByLabel('Motivo').fill('Pix devolvido pelo banco');
  await estorno.getByRole('button', { name: 'Estornar', exact: true }).click();
  await expect(titulo.getByLabel('Saldo')).toHaveValue('R$ 20.000,00');
  await expect(recebimentos).toContainText('Estornado');
  await expect(recebimentos).toContainText('Pix devolvido pelo banco');
  await foto(page, '04-estorno');

  // Histórico do título: recebimentos e estorno, com o motivo.
  await titulo.getByRole('tab', { name: /Histórico/ }).click();
  const historico = titulo.getByRole('table', { name: 'Histórico do título' });
  await expect(historico).toContainText('Estorno de recebimento');
  await expect(historico).toContainText('Pix devolvido pelo banco');
  await foto(page, '05-historico');
});
