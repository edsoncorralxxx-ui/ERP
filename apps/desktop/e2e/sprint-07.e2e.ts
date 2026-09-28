import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 7 — "Como verificar": nota de produto e nota de serviço do mesmo recebimento na competência C (o mês seguinte
 * ao do servidor, para que o RBT12 dependa do valor informado); a competência aparece em Impostos gerenciais com a
 * mesma receita da lista de documentos (ação da retrospectiva da Sprint 6); simular sem RBT12 não calcula; com o RBT12
 * informado sai a simulação do planning (R$ 1.325,32); a conferência do contador mostra a diferença; fechar trava as
 * notas da competência; anterior e próximo registro andam entre as competências; reabrir exige motivo. Cada passo da
 * tela é conferido também pela API. Cliente, pedido, recebimento e notas são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CLIENTE = `Amidos E2E7 ${SUFIXO} Ltda.`;

let auth: Record<string, string> = {};
let pedidoId = '';
let hoje = '';
/** Competência do roteiro (AAAA-MM) e o seu rótulo (MM/AAAA). */
let c = '';
let rotulo = '';
/** RBT12 já informado na competência (banco reaproveitado de outra execução); no CI o banco começa vazio. */
let rbt12Anterior = false;

const mes = (competencia: string, delta: number) => {
  const d = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const mmaaaa = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s7-${nome}.png` });
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

const nota = (request: APIRequestContext, chave: string, kind: string, numero: string, competencia: string) =>
  request.post(`${API}/api/v1/documents`, {
    headers: { ...auth, 'Idempotency-Key': `e2e7-${SUFIXO}-${chave}` },
    data: { orderId: pedidoId, kind, series: '7', number: numero, issueDate: hoje, competence: competencia },
  });

type Periodo = { status: string; version: string; rbt12: { informedCents: string | null }; revenueCents: string; simulations: { totalTaxCents: string | null; result: string }[]; differenceCents: string | null };

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  const chave = (k: string) => ({ ...auth, 'Idempotency-Key': `e2e7-${SUFIXO}-${k}` });
  hoje = (await apiGet<{ businessDate: string }>(request, '/api/v1/status')).businessDate;
  c = mes(hoje.slice(0, 7), 1);
  rotulo = mmaaaa(c);

  // Banco reaproveitado: a competência do roteiro volta aberta e sem notas de execuções anteriores.
  const antes = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  rbt12Anterior = antes.rbt12.informedCents !== null;
  if (antes.status === 'FECHADA') {
    const r = await request.post(`${API}/api/v1/tax-periods/${c}/reopenings`, {
      headers: { ...auth, 'If-Match': `"${antes.version}"` }, data: { reason: 'Roteiro de ponta a ponta' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  for (const d of await apiGet<{ id: string; version: string }[]>(request, `/api/v1/documents?competence=${c}`)) {
    const r = await request.post(`${API}/api/v1/documents/${d.id}/cancellations`, {
      headers: { ...auth, 'If-Match': `"${d.version}"` }, data: { reason: 'Roteiro de ponta a ponta' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }

  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: chave('cliente'), data: { legalName: CLIENTE, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
  });
  expect(cliente.ok(), await cliente.text()).toBeTruthy();
  const cl = await cliente.json();
  const categoria = await request.post(`${API}/api/v1/item-categories`, { headers: auth, data: { name: `Serviços E2E7 ${SUFIXO}` } });
  expect(categoria.ok(), await categoria.text()).toBeTruthy();
  const servico = await request.post(`${API}/api/v1/items`, {
    headers: chave('servico'),
    data: { description: 'Instalação e comissionamento', nature: 'SERVICO', uom: 'H', categoryId: (await categoria.json()).id, stockControlled: false },
  });
  expect(servico.ok(), await servico.text()).toBeTruthy();
  const pedido = await request.post(`${API}/api/v1/sales-orders`, {
    headers: chave('pedido'),
    data: {
      customerId: cl.id, unitId: cl.units[0].id, contractDate: '2026-01-10',
      lines: [
        { kind: 'EQUIPAMENTO', description: 'Balança de fluxo BF-200', quantity: '1', unitPrice: '100000' },
        { kind: 'SERVICO', itemId: (await servico.json()).id, quantity: '1', unitPrice: '55500' },
      ],
      installments: [{ dueDate: '2026-12-10', amountCents: '15550000', milestone: 'Único' }],
    },
  });
  expect(pedido.ok(), await pedido.text()).toBeTruthy();
  pedidoId = (await pedido.json()).id;
  const confirma = await request.post(`${API}/api/v1/sales-orders/${pedidoId}/confirmations`, { headers: { ...chave('conf'), 'If-Match': '"1"' } });
  expect(confirma.ok(), await confirma.text()).toBeTruthy();
  const titulo = ((await confirma.json()).titles as { id: string }[])[0].id;
  const caixa = (await apiGet<{ id: string; kind: string }[]>(request, '/api/v1/bank-accounts')).find((a) => a.kind === 'CAIXA')!.id;
  const rec = await request.post(`${API}/api/v1/settlements`, {
    headers: chave('rec'),
    data: { accountId: caixa, effectiveDate: hoje, amountCents: '2000000', allocations: [{ titleId: titulo, amountCents: '2000000' }] },
  });
  expect(rec.ok(), await rec.text()).toBeTruthy();
  // Nota de produto (NF-e) e nota de serviço (NFS-e) do mesmo recebimento, na competência C.
  for (const [k, tipo, numero] of [['nfe', 'PRODUTO', '71234'], ['nfse', 'SERVICO', '75001']]) {
    const r = await nota(request, k, tipo, numero, c);
    expect(r.status(), await r.text()).toBe(201);
  }
});

test('competência com receita das notas, simulação com RBT12 informado, conferência, fechamento e navegação', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Fiscal → Impostos gerenciais: a competência C com a receita de produto e de serviço das notas.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Fiscal', exact: true }).click();
  await gaveta.getByRole('button', { name: /Impostos gerenciais/ }).click();
  const lista = page.getByRole('dialog', { name: 'Impostos gerenciais', exact: true });
  if (c.slice(0, 4) !== hoje.slice(0, 4)) {
    await lista.getByRole('button', { name: 'Filtrar tabela' }).click();
    await escolher(page, lista.getByRole('combobox', { name: 'Ano' }), c.slice(0, 4));
    await lista.getByRole('dialog', { name: 'Filtrar tabela' }).getByRole('button', { name: 'OK', exact: true }).click();
  }
  await lista.getByRole('searchbox').fill(rotulo);
  const grade = lista.getByRole('table', { name: 'Impostos gerenciais' });
  await expect(grade.getByRole('row')).toHaveCount(2);
  await expect(grade).toContainText('R$ 12.861,74');
  await expect(grade).toContainText('R$ 7.138,26');
  await expect(grade).toContainText('R$ 20.000,00');
  // A receita da competência bate com o "Faturado da lista" dos documentos da mesma competência.
  const docs = await apiGet<{ totalCents: string }[]>(request, `/api/v1/documents?competence=${c}`);
  expect(docs.reduce((t, d) => t + BigInt(d.totalCents), 0n)).toBe(2000000n);
  await foto(page, '01-impostos-gerenciais');
  // Sem a busca, a lista mostra os 12 meses do ano: é essa a sequência do anterior e do próximo registro.
  await lista.getByRole('searchbox').fill('');
  await expect(grade.getByRole('row')).toHaveCount(13);
  await grade.getByRole('link', { name: `Abrir competência ${rotulo}` }).click();

  const ficha = page.getByRole('dialog', { name: 'Competência fiscal', exact: true });
  await expect(ficha.getByLabel('Competência', { exact: true })).toHaveValue(rotulo);
  await expect(ficha.getByLabel('Receita documentada')).toHaveValue('R$ 20.000,00');
  await expect(ficha.getByLabel('Parâmetros vigentes')).toHaveValue(/Revisão \d+ — Anexo II \(produto\), III \(serviço\)/);
  await expect(ficha.getByRole('table', { name: 'Notas da competência' })).toContainText('Serviço (NFS-e)');

  // Sem RBT12, a simulação não calcula e diz o motivo.
  if (!rbt12Anterior) {
    await ficha.getByRole('button', { name: 'Simular' }).click();
    await expect(ficha.getByLabel('Motivos')).toContainText('RBT12 desconhecido');
    await foto(page, '02-nao-calculavel');
  }

  // RBT12 informado (o do PGDAS-D): a simulação do planning, R$ 748,55 + R$ 576,77.
  await ficha.getByRole('tab', { name: /RBT12/ }).click();
  await ficha.getByLabel('RBT12 do PGDAS-D').fill('300.000,00');
  await ficha.getByLabel('Informado por').fill('Escritório contábil');
  await ficha.getByRole('button', { name: 'Informar RBT12' }).click();
  await expect(ficha.getByLabel('RBT12 usado')).toHaveValue('R$ 300.000,00 (informado pelo contador)');
  await ficha.getByRole('button', { name: 'Simular' }).click();
  await expect(ficha.getByLabel('Total simulado')).toHaveText('R$ 1.325,32');
  const memoria = ficha.getByRole('table', { name: 'Memória do cálculo' });
  await expect(memoria).toContainText('5,82%');
  await expect(memoria).toContainText('R$ 748,55');
  await expect(memoria).toContainText('8,08%');
  await expect(memoria).toContainText('R$ 576,77');
  await foto(page, '03-simulacao');
  let p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p.simulations[0]).toMatchObject({ result: 'CALCULADA', totalTaxCents: '132532' });

  // Conferência do contador: R$ 1.330,00 → diferença de R$ 4,68.
  await ficha.getByRole('tab', { name: /Conferência/ }).click();
  await ficha.getByLabel('Valor do contador').fill('1.330,00');
  await ficha.getByRole('textbox', { name: 'Vencimento' }).last().fill(`20/${mmaaaa(mes(c, 1))}`);
  await ficha.getByRole('button', { name: 'Registrar conferência' }).click();
  await expect(ficha.getByLabel('Diferença')).toHaveValue('R$ 4,68');
  await foto(page, '04-conferencia');

  // Fechar: a competência trava as notas dela (conferido pela API).
  await ficha.getByRole('button', { name: 'Fechar competência' }).click();
  await expect(ficha.getByText(`Competência fechada: notas de ${rotulo}`)).toBeVisible();
  const travada = await nota(request, 'travada', 'PRODUTO', '71235', c);
  expect(travada.status()).toBe(422);
  expect(await travada.text()).toContain('TAX_PERIOD_CLOSED');
  p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p).toMatchObject({ status: 'FECHADA', differenceCents: '468' });
  await foto(page, '05-fechada');

  // Registro anterior e próximo: a ficha anda entre as competências do ano, na mesma janela.
  const [ida, volta] = c.slice(5) === '01' ? (['Próximo registro', 'Registro anterior'] as const) : (['Registro anterior', 'Próximo registro'] as const);
  await page.getByRole('button', { name: ida }).click();
  await expect(ficha.getByLabel('Competência', { exact: true })).toHaveValue(mmaaaa(mes(c, ida === 'Próximo registro' ? 1 : -1)));
  await page.getByRole('menuitem', { name: 'Dados' }).click();
  await page.getByRole('menuitem', { name: new RegExp(volta) }).click();
  await expect(ficha.getByLabel('Competência', { exact: true })).toHaveValue(rotulo);
  await expect(page.getByRole('dialog', { name: 'Competência fiscal', exact: true })).toHaveCount(1);

  // Reabrir exige motivo; depois a competência volta a aceitar notas.
  await ficha.getByRole('button', { name: 'Reabrir competência' }).click();
  const reabrir = page.getByRole('alertdialog', { name: 'Reabrir competência' });
  await reabrir.getByLabel('Motivo').fill('Nota de serviço com valor errado');
  await reabrir.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await expect(ficha.getByRole('button', { name: 'Simular' })).toBeEnabled();
  await ficha.getByRole('tab', { name: /Histórico/ }).click();
  await expect(ficha.getByRole('table')).toContainText('Nota de serviço com valor errado');
  expect((await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`)).status).toBe('ABERTA');
  await foto(page, '06-reaberta');

  // Parâmetros fiscais pela seta: as faixas da revisão vigente.
  await ficha.getByRole('tab', { name: /Receitas/ }).click();
  await ficha.getByRole('link', { name: 'Abrir parâmetros fiscais' }).click();
  const parametros = page.getByRole('dialog', { name: 'Parâmetros fiscais', exact: true });
  await expect(parametros.getByRole('table', { name: 'Faixas de produto' })).toContainText('7,80%');
  await expect(parametros.getByRole('table', { name: 'Faixas de serviço' })).toContainText('11,20%');
  await foto(page, '07-parametros');
});
