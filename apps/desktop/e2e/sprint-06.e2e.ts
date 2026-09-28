import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 6 — "Como verificar": nota registrada pela tela e vinculada às parcelas do pedido (PD-023), recusa acima do a
 * faturar, número repetido, pedido faturado que não cancela e cancelamento da nota. Ação da retrospectiva da Sprint 5:
 * cada documento criado pela tela é conferido também pela API no mesmo roteiro. Cliente, pedido e o recebimento parcial
 * são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CLIENTE = `Amidos E2E6 ${SUFIXO} Ltda.`;

let auth: Record<string, string> = {};
let pedidoId = '';
let t1 = '';
let t2 = '';

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s6-${nome}.png` });
}

async function escolher(page: Page, campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await page.getByRole('listbox').getByRole('option', { name: opcao }).click();
}

async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: auth });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as T;
}

type Faturamento = { titleId: string; invoicedCents: string; toInvoiceCents: string; balanceCents: string };
type Documento = { id: string; code: string; status: string; totalCents: string; linkedCents: string; links: { titleId: string; amountCents: string; status: string }[] };

/** Faturado e a faturar das duas parcelas, lidos pela API. */
async function faturamento(request: APIRequestContext) {
  const f = await apiGet<Faturamento[]>(request, `/api/v1/invoicing?titleId=${t1}&titleId=${t2}`);
  const de = (id: string) => f.find((x) => x.titleId === id)!;
  return { t1: de(t1), t2: de(t2) };
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  const chave = (k: string) => ({ ...auth, 'Idempotency-Key': `e2e6-${SUFIXO}-${k}` });
  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: chave('cliente'),
    data: { legalName: CLIENTE, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
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
  pedidoId = (await pedido.json()).id;
  const confirma = await request.post(`${API}/api/v1/sales-orders/${pedidoId}/confirmations`, { headers: { ...chave('conf'), 'If-Match': '"1"' } });
  expect(confirma.ok(), await confirma.text()).toBeTruthy();
  const titulos = (await confirma.json()).titles as { id: string }[];
  [t1, t2] = titulos.map((t) => t.id);
  // Recebimento parcial da parcela 1 antes da nota: faturamento e recebimento são independentes.
  const caixa = (await apiGet<{ id: string; kind: string }[]>(request, '/api/v1/bank-accounts')).find((a) => a.kind === 'CAIXA')!;
  const status = await apiGet<{ businessDate: string }>(request, '/api/v1/status');
  const rec = await request.post(`${API}/api/v1/settlements`, {
    headers: chave('rec'),
    data: { accountId: caixa.id, effectiveDate: status.businessDate, amountCents: '2000000', allocations: [{ titleId: t1, amountCents: '2000000' }] },
  });
  expect(rec.ok(), await rec.text()).toBeTruthy();
});

test('nota vinculada às parcelas mostra o faturado sem mudar o saldo; pedido faturado não cancela', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Faturamento → Documentos e faturamento → Novo: nota 1234 de R$ 92.500,00.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Faturamento', exact: true }).click();
  await gaveta.getByRole('button', { name: /Documentos e faturamento/ }).click();
  const lista = page.getByRole('dialog', { name: 'Documentos e faturamento', exact: true });
  await lista.getByRole('button', { name: 'Novo' }).click();

  const registra = async (numero: string, valor: string) => {
    const doc = page.getByRole('dialog', { name: 'Documento de faturamento', exact: true }).last();
    await escolher(page, doc.getByRole('combobox', { name: 'Cliente' }), new RegExp(CLIENTE));
    await doc.getByLabel('Nº da nota').fill(numero);
    await expect(doc.getByLabel('Competência')).toHaveValue(/^\d{2}\/\d{4}$/);
    await doc.getByText('Clique para adicionar uma linha…').click();
    await doc.getByLabel('Descrição da linha 1').fill('Balança de fluxo BF-200');
    await doc.getByLabel('Valor da linha 1').fill(valor);
    await doc.getByRole('button', { name: 'Adicionar', exact: true }).click();
    return doc;
  };

  const nf1 = await registra('1234', '92.500,00');
  await expect(nf1.getByLabel('Documento')).toHaveValue(/^DF\d{5}$/);
  const codigo1 = await nf1.getByLabel('Documento').inputValue();
  await foto(page, '01-nota-registrada');

  // Vincular parcelas: a sugestão já reparte a nota — parcela 1 inteira e R$ 37.000,00 da parcela 2.
  await nf1.getByRole('button', { name: 'Vincular parcelas' }).click();
  let vincular = page.getByRole('alertdialog', { name: 'Vincular parcelas' });
  const campos = vincular.getByRole('textbox', { name: /Vincular à parcela CR\d{5}/ });
  await expect(campos).toHaveCount(2);
  await expect(campos.nth(0)).toHaveValue('55.500,00');
  await expect(campos.nth(1)).toHaveValue('37.000,00');
  await foto(page, '02-vincular');
  await vincular.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(nf1.getByLabel('Vinculado')).toHaveValue('R$ 92.500,00');
  await expect(nf1.getByRole('table', { name: 'Vínculos da nota com as parcelas' }).getByRole('row')).toHaveCount(4);

  // Conferência pela API: documento, vínculos e faturado; o saldo a receber não mudou.
  const docs = await apiGet<Documento[]>(request, `/api/v1/documents?search=${encodeURIComponent(codigo1)}`);
  expect(docs).toHaveLength(1);
  const d1 = await apiGet<Documento>(request, `/api/v1/documents/${docs[0].id}`);
  expect(d1).toMatchObject({ status: 'ATIVO', totalCents: '9250000', linkedCents: '9250000' });
  expect(d1.links.map((l) => [l.titleId, l.amountCents])).toEqual([[t1, '5550000'], [t2, '3700000']]);
  let f = await faturamento(request);
  expect(f.t1).toMatchObject({ invoicedCents: '5550000', toInvoiceCents: '0', balanceCents: '3550000' });
  expect(f.t2).toMatchObject({ invoicedCents: '3700000', toInvoiceCents: '6300000', balanceCents: '10000000' });

  await nf1.getByRole('button', { name: 'OK', exact: true }).click();

  // Mesmo número para o mesmo cliente e série: recusado apontando a nota existente.
  await lista.getByRole('button', { name: 'Novo' }).click();
  const repetida = await registra('1234', '100,00');
  await expect(repetida.getByText(`Já registrada como ${codigo1}.`)).toBeVisible();
  await foto(page, '03-numero-repetido');
  await repetida.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Não', exact: true }).click();

  // Nota 1235 de R$ 70.000,00: R$ 63.000,01 na parcela 2 é recusado no campo; R$ 63.000,00 fecha.
  await lista.getByRole('button', { name: 'Novo' }).click();
  const nf2 = await registra('1235', '70.000,00');
  await expect(nf2.getByLabel('Documento')).toHaveValue(/^DF\d{5}$/);
  await nf2.getByRole('button', { name: 'Vincular parcelas' }).click();
  vincular = page.getByRole('alertdialog', { name: 'Vincular parcelas' });
  const campo = vincular.getByRole('textbox', { name: /Vincular à parcela CR\d{5}/ });
  await expect(campo).toHaveCount(1);
  await expect(campo).toHaveValue('63.000,00');
  await campo.fill('63.000,01');
  await vincular.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(vincular.getByText(/A faturar da parcela: R\$ 63\.000,00\./)).toBeVisible();
  await foto(page, '04-acima-do-a-faturar');
  await campo.fill('63.000,00');
  await vincular.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(nf2.getByLabel('Sem vínculo')).toHaveValue('R$ 7.000,00');
  f = await faturamento(request);
  expect(f.t2).toMatchObject({ invoicedCents: '10000000', toInvoiceCents: '0' });

  // O pedido mostra tudo faturado.
  await gaveta.getByRole('button', { name: 'Vendas', exact: true }).click();
  await gaveta.getByRole('button', { name: /Pedidos e contratos/ }).click();
  const pedidos = page.getByRole('dialog', { name: 'Pedidos e contratos', exact: true });
  await pedidos.getByRole('searchbox').fill(CLIENTE);
  await pedidos.getByRole('link', { name: /Abrir pedido PV\d{5}/ }).first().click();
  const pedido = page.getByRole('dialog', { name: 'Pedido de venda', exact: true });
  await pedido.getByRole('tab', { name: /Projeto e títulos/ }).click();
  await expect(pedido.getByLabel('Faturado do pedido')).toHaveText('R$ 155.500,00');
  await expect(pedido.getByLabel('A faturar do pedido')).toHaveText('R$ 0,00');
  await foto(page, '05-pedido-faturado');
  await pedido.getByRole('button', { name: 'OK', exact: true }).click();
  await pedidos.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // Pedido com nota vinculada não cancela (conferido pela API; a tela usa o mesmo comando).
  const bloqueado = await request.post(`${API}/api/v1/sales-orders/${pedidoId}/cancellations`, {
    headers: { ...auth, 'If-Match': '"2"' }, data: { reason: 'Cliente desistiu' },
  });
  expect(bloqueado.status()).toBe(422);
  expect(await bloqueado.text()).toContain('vinculada à nota nº');

  // Cancelar a nota 1235 com motivo: o a faturar da parcela 2 volta a R$ 63.000,00.
  await nf2.getByRole('button', { name: 'Cancelar documento' }).click();
  const cancelar = page.getByRole('alertdialog', { name: 'Cancelar documento' });
  await cancelar.getByLabel('Motivo').fill('Valor digitado errado');
  await cancelar.getByRole('button', { name: 'Cancelar documento', exact: true }).click();
  await expect(nf2.getByLabel('Motivo do cancelamento')).toHaveValue('Valor digitado errado');
  await nf2.getByRole('tab', { name: /Histórico/ }).click();
  await expect(nf2.getByRole('table')).toContainText('Valor digitado errado');
  f = await faturamento(request);
  expect(f.t2).toMatchObject({ invoicedCents: '3700000', toInvoiceCents: '6300000' });
  const d2 = (await apiGet<Documento[]>(request, `/api/v1/documents?status=CANCELADOS&search=${encodeURIComponent(CLIENTE)}`))[0];
  expect(d2).toMatchObject({ status: 'CANCELADO', totalCents: '7000000', linkedCents: '0' });
  await foto(page, '06-nota-cancelada');

  // A lista do cliente fatura só a nota ativa.
  await lista.getByRole('searchbox').fill(CLIENTE);
  await expect(lista.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(lista.getByText('Faturado da lista: R$ 92.500,00')).toBeVisible();
  await foto(page, '07-lista');
});
