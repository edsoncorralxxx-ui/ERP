import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 6 — "Como verificar", no regime de caixa decidido na Review (PD-023) e com as notas separadas da Sprint 7: o
 * pedido com recebimento sem nota aparece em Notas a emitir; a nota de produto (NF-e) e a de serviço (NFS-e) são
 * registradas a partir dele, cada uma com as linhas do seu tipo e os vínculos montados pelo sistema; acima do a emitir
 * do tipo é recusado; número repetido é recusado; pedido faturado não cancela; cancelar a nota devolve o valor às notas
 * a emitir. Ação da retrospectiva da Sprint 5: cada nota criada pela tela é conferida também
 * pela API no mesmo roteiro. Cliente, serviço, pedido e recebimentos são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CLIENTE = `Amidos E2E6 ${SUFIXO} Ltda.`;

let auth: Record<string, string> = {};
let pedidoId = '';
let caixa = '';
let hoje = '';
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

async function recebe(request: APIRequestContext, chave: string, titulo: string, centavos: string) {
  const r = await request.post(`${API}/api/v1/settlements`, {
    headers: { ...auth, 'Idempotency-Key': `e2e6-${SUFIXO}-${chave}` },
    data: { accountId: caixa, effectiveDate: hoje, amountCents: centavos, allocations: [{ titleId: titulo, amountCents: centavos }] },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

type Caixa = { id: string; receivedCents: string; invoicedCents: string; toIssueCents: string; productCents: string; serviceCents: string };
type Documento = { id: string; code: string; kind: string; status: string; totalCents: string; linkedCents: string; orderId: string; links: { titleId: string; amountCents: string; status: string }[] };

const doPedido = async (request: APIRequestContext) => apiGet<Caixa>(request, `/api/v1/invoicing/orders/${pedidoId}`);

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
  const categoria = await request.post(`${API}/api/v1/item-categories`, { headers: auth, data: { name: `Serviços E2E6 ${SUFIXO}` } });
  expect(categoria.ok(), await categoria.text()).toBeTruthy();
  const servico = await request.post(`${API}/api/v1/items`, {
    headers: chave('servico'),
    data: { description: 'Instalação e comissionamento', nature: 'SERVICO', uom: 'H', categoryId: (await categoria.json()).id, stockControlled: false },
  });
  expect(servico.ok(), await servico.text()).toBeTruthy();
  const pedido = await request.post(`${API}/api/v1/sales-orders`, {
    headers: chave('pedido'),
    data: {
      customerId: c.id, unitId: c.units[0].id, contractDate: '2026-01-10',
      lines: [
        { kind: 'EQUIPAMENTO', description: 'Balança de fluxo BF-200', quantity: '1', unitPrice: '100000' },
        { kind: 'SERVICO', itemId: (await servico.json()).id, quantity: '1', unitPrice: '55500' },
      ],
      installments: [{ dueDate: '2026-12-10', amountCents: '5550000', milestone: 'Sinal' }, { dueDate: '2027-01-10', amountCents: '10000000', milestone: 'Aceite' }],
    },
  });
  expect(pedido.ok(), await pedido.text()).toBeTruthy();
  pedidoId = (await pedido.json()).id;
  const confirma = await request.post(`${API}/api/v1/sales-orders/${pedidoId}/confirmations`, { headers: { ...chave('conf'), 'If-Match': '"1"' } });
  expect(confirma.ok(), await confirma.text()).toBeTruthy();
  [t1, t2] = ((await confirma.json()).titles as { id: string }[]).map((t) => t.id);
  caixa = (await apiGet<{ id: string; kind: string }[]>(request, '/api/v1/bank-accounts')).find((a) => a.kind === 'CAIXA')!.id;
  hoje = (await apiGet<{ businessDate: string }>(request, '/api/v1/status')).businessDate;
  await recebe(request, 'rec1', t1, '2000000');
});

test('nota registrada a partir do pedido fatura só o recebido; pedido faturado não cancela', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Faturamento → Notas a emitir: o pedido com R$ 20.000,00 recebidos sem nota, repartidos entre produto e serviço.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Faturamento', exact: true }).click();
  await gaveta.getByRole('button', { name: /Notas a emitir/ }).click();
  const aEmitir = page.getByRole('dialog', { name: 'Notas a emitir', exact: true });
  await aEmitir.getByRole('searchbox').fill(CLIENTE);
  const grade = aEmitir.getByRole('table', { name: 'Notas a emitir' });
  await expect(grade.getByRole('row')).toHaveCount(2);
  await expect(grade).toContainText('R$ 20.000,00');
  await expect(grade).toContainText('R$ 12.861,74');
  await expect(grade).toContainText('R$ 7.138,26');
  await foto(page, '01-notas-a-emitir');
  await grade.getByRole('link', { name: /Registrar nota do pedido PV\d{5}/ }).click();

  // A nota de produto vem montada pelo pedido (só o equipamento): só o número, a série e a emissão são digitados.
  const nota = () => page.getByRole('dialog', { name: 'Documento de faturamento', exact: true }).last();
  let nf = nota();
  await expect(nf.getByLabel('A emitir', { exact: true })).toHaveValue('R$ 20.000,00');
  await expect(nf.getByRole('combobox', { name: 'Tipo da nota' })).toContainText('Produto (NF-e)');
  await expect(nf.getByLabel('A emitir do tipo')).toHaveValue('R$ 12.861,74');
  await expect(nf.getByLabel('Valor da nota')).toHaveValue('12.861,74');
  await expect(nf.getByRole('textbox', { name: 'Cliente' })).toHaveValue(new RegExp(CLIENTE));
  await expect(nf.getByRole('table', { name: 'Linhas da nota' })).toContainText('Balança de fluxo BF-200');
  await expect(nf.getByRole('table', { name: 'Linhas da nota' })).not.toContainText('Instalação');
  await nf.getByLabel('Nº da nota').fill('1234');
  await expect(nf.getByLabel('Competência')).toHaveValue(/^\d{2}\/\d{4}$/);
  await foto(page, '02-nota-pelo-pedido');
  await nf.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(nf.getByLabel('Documento')).toHaveValue(/^DF\d{5}$/);
  await expect(nf.getByLabel('Vinculado')).toHaveValue('R$ 12.861,74');
  const codigo1 = await nf.getByLabel('Documento').inputValue();

  // Conferência pela API: nota de produto do pedido, vínculo na parcela 1; falta o serviço; o saldo a receber não mudou.
  const d1 = (await apiGet<Documento[]>(request, `/api/v1/documents?search=${encodeURIComponent(codigo1)}`))[0];
  expect(d1).toMatchObject({ kind: 'PRODUTO', status: 'ATIVO', totalCents: '1286174', linkedCents: '1286174', orderId: pedidoId });
  expect(d1.links.map((l) => [l.titleId, l.amountCents])).toEqual([[t1, '1286174']]);
  expect(await doPedido(request)).toMatchObject({ receivedCents: '2000000', invoicedCents: '1286174', toIssueCents: '713826', productCents: '0', serviceCents: '713826' });
  expect((await apiGet<{ balanceCents: string }>(request, `/api/v1/receivables/${t1}`)).balanceCents).toBe('3550000');
  await nf.getByRole('button', { name: 'OK', exact: true }).click();

  // A nota de serviço do mesmo recebimento: só a instalação.
  await grade.getByRole('link', { name: /Registrar nota do pedido PV\d{5}/ }).click();
  nf = nota();
  await expect(nf.getByLabel('A emitir', { exact: true })).toHaveValue('R$ 7.138,26');
  await escolher(page, nf.getByRole('combobox', { name: 'Tipo da nota' }), 'Serviço (NFS-e)');
  await expect(nf.getByLabel('Valor da nota')).toHaveValue('7.138,26');
  await expect(nf.getByRole('table', { name: 'Linhas da nota' })).toContainText('Instalação e comissionamento');
  await nf.getByLabel('Nº da nota').fill('5001');
  await nf.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(nf.getByLabel('Tipo da nota')).toHaveValue('Serviço (NFS-e)');
  expect(await doPedido(request)).toMatchObject({ invoicedCents: '2000000', toIssueCents: '0' });
  await foto(page, '02b-nota-de-servico');
  await nf.getByRole('button', { name: 'OK', exact: true }).click();
  await aEmitir.getByRole('searchbox').fill(`${CLIENTE} `);
  await expect(aEmitir.getByText('Nenhum pedido atende à busca e aos filtros.')).toBeVisible();

  // Mais R$ 45.500,00 recebidos (produto R$ 29.260,45, serviço R$ 16.239,55): acima do a emitir de produto é recusado
  // no valor; uma nota de produto parcial de R$ 20.000,00 vai à parcela mais antiga.
  await recebe(request, 'rec2', t1, '3550000');
  await recebe(request, 'rec3', t2, '1000000');
  await aEmitir.getByRole('searchbox').fill(CLIENTE);
  await expect(grade).toContainText('R$ 45.500,00');
  await expect(grade).toContainText('R$ 29.260,45');
  await expect(grade).toContainText('R$ 16.239,55');
  await grade.getByRole('link', { name: /Registrar nota do pedido PV\d{5}/ }).click();
  nf = nota();
  await expect(nf.getByLabel('A emitir', { exact: true })).toHaveValue('R$ 45.500,00');
  await nf.getByLabel('Valor da nota').fill('29.260,46');
  await nf.getByLabel('Nº da nota').click();
  await expect(nf.getByText('A emitir de produto: R$ 29.260,45.')).toBeVisible();
  await foto(page, '03-acima-do-recebido');
  await nf.getByLabel('Valor da nota').fill('20.000,00');
  await nf.getByLabel('Nº da nota').fill('1235');
  await nf.getByRole('tab', { name: /Parcelas/ }).click();
  await expect(nf.getByLabel('Soma das parcelas nesta nota')).toHaveText('R$ 20.000,00');
  await nf.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(nf.getByLabel('Vinculado')).toHaveValue('R$ 20.000,00');
  expect(await doPedido(request)).toMatchObject({ invoicedCents: '4000000', toIssueCents: '2550000' });

  // Mesmo número para o mesmo cliente e série: recusado apontando a nota existente.
  await aEmitir.locator('.rp-titlebar').click();
  await grade.getByRole('link', { name: /Registrar nota do pedido PV\d{5}/ }).click();
  const repetida = nota();
  await expect(repetida.getByLabel('A emitir', { exact: true })).toHaveValue('R$ 25.500,00');
  await repetida.getByLabel('Nº da nota').fill('1234');
  await repetida.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(repetida.getByText(`Já registrada como ${codigo1}.`)).toBeVisible();
  await foto(page, '04-numero-repetido');
  await repetida.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Não', exact: true }).click();
  await aEmitir.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // O pedido mostra o faturado e o que falta emitir pelo caixa.
  await gaveta.getByRole('button', { name: 'Vendas', exact: true }).click();
  await gaveta.getByRole('button', { name: /Pedidos e contratos/ }).click();
  const pedidos = page.getByRole('dialog', { name: 'Pedidos e contratos', exact: true });
  await pedidos.getByRole('searchbox').fill(CLIENTE);
  await pedidos.getByRole('link', { name: /Abrir pedido PV\d{5}/ }).first().click();
  const pedido = page.getByRole('dialog', { name: 'Pedido de venda', exact: true });
  await pedido.getByRole('tab', { name: /Projeto e títulos/ }).click();
  await expect(pedido.getByLabel('Faturado do pedido')).toHaveText('R$ 40.000,00');
  await expect(pedido.getByLabel('A emitir do pedido', { exact: true })).toHaveText('R$ 25.500,00');
  await expect(pedido.getByLabel('Nota a emitir do pedido')).toHaveValue('R$ 25.500,00');
  await expect(pedido.getByRole('button', { name: 'Registrar nota' })).toBeVisible();
  await foto(page, '05-pedido');
  await pedido.getByRole('button', { name: 'OK', exact: true }).click();
  await pedidos.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // Pedido com recebimento e nota não cancela; a recusa lista os dois (conferido pela API).
  const bloqueado = await request.post(`${API}/api/v1/sales-orders/${pedidoId}/cancellations`, {
    headers: { ...auth, 'If-Match': '"2"' }, data: { reason: 'Cliente desistiu' },
  });
  expect(bloqueado.status()).toBe(422);
  expect(await bloqueado.text()).toContain('vinculada à nota nº');

  // Cancelar a nota 1235: os R$ 20.000,00 voltam às notas a emitir.
  await nf.getByRole('button', { name: 'Cancelar documento' }).click();
  const cancelar = page.getByRole('alertdialog', { name: 'Cancelar documento' });
  await cancelar.getByLabel('Motivo').fill('Valor digitado errado');
  await cancelar.getByRole('button', { name: 'Cancelar documento', exact: true }).click();
  await expect(nf.getByLabel('Motivo do cancelamento')).toHaveValue('Valor digitado errado');
  await nf.getByRole('tab', { name: /Histórico/ }).click();
  await expect(nf.getByRole('table')).toContainText('Valor digitado errado');
  expect(await doPedido(request)).toMatchObject({ invoicedCents: '2000000', toIssueCents: '4550000' });
  await foto(page, '06-nota-cancelada');
  await nf.getByRole('button', { name: 'OK', exact: true }).click();

  // A lista de documentos do cliente fatura só as notas ativas (a de produto e a de serviço do primeiro recebimento).
  await gaveta.getByRole('button', { name: 'Faturamento', exact: true }).click();
  await gaveta.getByRole('button', { name: /Documentos e faturamento/ }).click();
  const lista = page.getByRole('dialog', { name: 'Documentos e faturamento', exact: true });
  await lista.getByRole('searchbox').fill(CLIENTE);
  await expect(lista.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(lista.getByText('Faturado da lista: R$ 20.000,00')).toBeVisible();
  await foto(page, '07-lista');
});
