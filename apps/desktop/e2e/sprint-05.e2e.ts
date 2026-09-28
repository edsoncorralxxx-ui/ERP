import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 5 — "Como verificar": título a receber gerado pela confirmação do pedido → recebimento parcial → recebimento
 * do resto → estornos → saldo do título e da conta de volta ao início. Pedido, cliente e conta são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CONTA = `Banco E2E ${SUFIXO}`;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s5-${nome}.png` });
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
  const chave = (k: string) => ({ ...auth, 'Idempotency-Key': `e2e5-${SUFIXO}-${k}` });
  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: chave('cliente'),
    data: { legalName: `Amidos E2E ${SUFIXO} Ltda.`, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
  });
  expect(cliente.ok(), await cliente.text()).toBeTruthy();
  const c = await cliente.json();
  const pedido = await request.post(`${API}/api/v1/sales-orders`, {
    headers: chave('pedido'),
    data: {
      customerId: c.id, unitId: c.units[0].id, contractDate: '2026-01-10',
      lines: [{ kind: 'EQUIPAMENTO', description: 'Balança de fluxo BF-200', quantity: '1', unitPrice: '155500' }],
      installments: [{ dueDate: '2026-12-10', amountCents: '5550000', milestone: 'Sinal' }, { dueDate: '2027-01-10', amountCents: '10000000', milestone: 'Aceite' }],
    },
  });
  expect(pedido.ok(), await pedido.text()).toBeTruthy();
  const confirma = await request.post(`${API}/api/v1/sales-orders/${(await pedido.json()).id}/confirmations`, { headers: { ...chave('conf'), 'If-Match': '"1"' } });
  expect(confirma.ok(), await confirma.text()).toBeTruthy();
  const conta = await request.post(`${API}/api/v1/bank-accounts`, {
    headers: auth,
    data: { name: CONTA, kind: 'BANCO', bank: 'Banco do Brasil', openingCents: '100000', openingOn: '2026-01-01' },
  });
  expect(conta.ok(), await conta.text()).toBeTruthy();
});

test('recebimento parcial, total e estornos devolvem o saldo do título e da conta', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Financeiro → Contas a receber: os dois títulos do pedido, com saldo.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await gaveta.getByRole('button', { name: /Contas a receber/ }).click();
  const lista = page.getByRole('dialog', { name: 'Contas a receber', exact: true });
  await lista.getByRole('searchbox').fill(`Amidos E2E ${SUFIXO}`);
  await expect(lista.getByRole('table')).toContainText('R$ 55.500,00');
  await expect(lista.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(lista.getByText('Saldo da lista: R$ 155.500,00')).toBeVisible();
  await foto(page, '01-contas-a-receber');
  await lista.getByRole('link', { name: /Abrir título CR\d{5}/ }).first().click();

  // Recebimento parcial de R$ 20.000,00 no banco.
  const titulo = page.getByRole('dialog', { name: 'Título a receber', exact: true });
  await expect(titulo.getByLabel('Saldo a receber')).toHaveValue('R$ 55.500,00');
  await titulo.getByRole('button', { name: 'Receber', exact: true }).click();
  let receber = page.getByRole('alertdialog', { name: 'Receber' });
  await expect(receber.getByLabel('Valor')).toHaveValue('55.500,00');
  await escolher(page, receber.getByRole('combobox', { name: 'Conta' }), new RegExp(CONTA));
  await receber.getByLabel('Valor').fill('20.000,00');
  await foto(page, '02-receber');
  await receber.getByRole('button', { name: 'Receber', exact: true }).click();
  await expect(titulo.getByLabel('Saldo a receber')).toHaveValue('R$ 35.500,00');
  await expect(titulo.getByText('Parcial', { exact: true })).toBeVisible();

  // Acima do saldo: recusado no campo, nada gravado.
  await titulo.getByRole('button', { name: 'Receber', exact: true }).click();
  receber = page.getByRole('alertdialog', { name: 'Receber' });
  await escolher(page, receber.getByRole('combobox', { name: 'Conta' }), new RegExp(CONTA));
  await receber.getByLabel('Valor').fill('35.500,01');
  await receber.getByRole('button', { name: 'Receber', exact: true }).click();
  await expect(receber.getByText('Saldo atual: R$ 35.500,00.')).toBeVisible();
  // O resto do saldo: o título fica liquidado.
  await receber.getByLabel('Valor').fill('35.500,00');
  await receber.getByRole('button', { name: 'Receber', exact: true }).click();
  await expect(titulo.getByLabel('Saldo a receber')).toHaveValue('R$ 0,00');
  await expect(titulo.getByText('Liquidado', { exact: true })).toBeVisible();
  await expect(titulo.getByRole('button', { name: 'Receber', exact: true })).toBeHidden();

  // Estornar os dois recebimentos com motivo: o título volta a R$ 55.500,00 em aberto.
  await titulo.getByRole('tab', { name: /Recebimentos/ }).click();
  const grade = titulo.getByRole('table', { name: 'Recebimentos do título' });
  await expect(grade.getByRole('row')).toHaveCount(3);
  await foto(page, '03-recebimentos');
  for (const motivo of ['Cheque devolvido', 'Lançado na conta errada']) {
    await grade.getByRole('button', { name: /Estornar recebimento RC\d{5}/ }).first().click();
    const estorno = page.getByRole('alertdialog', { name: 'Estornar recebimento' });
    await estorno.getByLabel('Motivo').fill(motivo);
    await estorno.getByRole('button', { name: 'Estornar', exact: true }).click();
    await expect(grade).toContainText(motivo);
  }
  await expect(titulo.getByLabel('Saldo a receber')).toHaveValue('R$ 55.500,00');
  await expect(titulo.getByText('Em aberto', { exact: true })).toBeVisible();
  await foto(page, '04-estornados');
  await titulo.getByRole('tab', { name: /Histórico/ }).click();
  await expect(titulo.getByRole('table')).toContainText('Lançado na conta errada');

  // Contas financeiras → Extrato: 2 entradas e 2 saídas; a conta volta ao saldo inicial.
  await page.keyboard.press('Escape');
  await gaveta.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await gaveta.getByRole('button', { name: /Contas financeiras/ }).click();
  const contas = page.getByRole('dialog', { name: 'Contas financeiras', exact: true });
  await expect(contas.getByRole('table', { name: 'Contas financeiras' })).toContainText(CONTA);
  await contas.getByRole('tab', { name: /Extrato/ }).click();
  await escolher(page, contas.getByRole('combobox', { name: 'Conta' }), new RegExp(CONTA));
  const extrato = contas.getByRole('table', { name: 'Extrato da conta' });
  await expect(extrato.getByRole('row')).toHaveCount(5);
  await expect(extrato.getByRole('row').last()).toContainText('R$ 1.000,00');
  await foto(page, '05-extrato');
});
