import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 9 — "Como verificar": transferência de R$ 5.000,00 entre duas contas do roteiro pela tela (cada conta muda, o
 * total não — conferido pela API); o fluxo de caixa filtrado por uma categoria própria do roteiro mostra as saídas
 * previstas do planning (R$ 2.335,00 no mês seguinte e R$ 1.000,00 no outro), com os saldos encadeados; a composição de
 * uma célula soma o valor da grade (conferido pela API); filtrado pela conta de destino, o realizado do mês tem a
 * entrada da transferência; o estorno pelo extrato devolve os saldos. Tudo com nomes únicos por execução, para rodar
 * de novo no mesmo banco (ação da retrospectiva da Sprint 8).
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const ORIGEM = `Caixa E2E9 ${SUFIXO}`;
const DESTINO = `Banco E2E9 ${SUFIXO}`;
const CATEGORIA = `Despesas E2E9 ${SUFIXO}`;

let auth: Record<string, string> = {};
let hoje = '';
let m = '';
let n = '';
let origem = { id: '', code: '' };
let destino = { id: '', code: '' };
let categoria = '';

const mes = (competencia: string, delta: number) => {
  const x = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)) - 1 + delta, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};
const mmaaaa = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s9-${nome}.png` });
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

type Saldos = { totalCents: string; accounts: { accountId: string; balanceCents: string }[] };
type Mes = { month: string; realizedInCents: string; forecastOutCents: string; closingCents: string; openingCents: string };
const saldoDe = (s: Saldos, id: string) => s.accounts.find((a) => a.accountId === id)!.balanceCents;

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  hoje = (await apiGet<{ businessDate: string }>(request, '/api/v1/status')).businessDate;
  m = hoje.slice(0, 7);
  n = mes(m, 1);

  for (const [nome, kind, saldo, alvo] of [[ORIGEM, 'CAIXA', '2000000', 'o'], [DESTINO, 'BANCO', '1000000', 'd']] as const) {
    const r = await request.post(`${API}/api/v1/bank-accounts`, {
      headers: auth, data: { name: nome, kind, bank: kind === 'BANCO' ? 'Banco do Brasil' : null, openingCents: saldo, openingOn: '2026-01-01' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    const c = await r.json();
    if (alvo === 'o') origem = { id: c.id, code: c.code };
    else destino = { id: c.id, code: c.code };
  }
  const cat = await request.post(`${API}/api/v1/financial-categories`, { headers: auth, data: { name: CATEGORIA, direction: 'DESPESA' } });
  expect(cat.ok(), await cat.text()).toBeTruthy();
  categoria = (await cat.json()).code;
  const fornecedor = await request.post(`${API}/api/v1/suppliers`, {
    headers: { ...auth, 'Idempotency-Key': `e2e9-${SUFIXO}-fornecedor` }, data: { legalName: `Fornecedor E2E9 ${SUFIXO} Ltda.` },
  });
  expect(fornecedor.ok(), await fornecedor.text()).toBeTruthy();
  const supplierId = (await fornecedor.json()).id;
  for (const [k, cents, venc] of [['a', 100000, `${n}-10`], ['b', 133500, `${n}-20`], ['c', 100000, `${mes(m, 2)}-10`]] as const) {
    const r = await request.post(`${API}/api/v1/payables`, {
      headers: { ...auth, 'Idempotency-Key': `e2e9-${SUFIXO}-cp-${k}` },
      data: { supplierId, category: categoria, competence: m, totalCents: String(cents), installments: [{ dueDate: venc, amountCents: String(cents) }] },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
});

test('transferência sem mudar o total, fluxo de caixa com a composição e estorno pelo extrato', async ({ page, request }) => {
  const antes = await apiGet<Saldos>(request, `/api/v1/bank-accounts/balances?date=${hoje}`);
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Financeiro → Contas financeiras → Transferir R$ 5.000,00 da origem para o destino.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await gaveta.getByRole('button', { name: /Contas financeiras/ }).click();
  const contas = page.getByRole('dialog', { name: 'Contas financeiras', exact: true });
  await contas.getByRole('button', { name: 'Transferir' }).click();
  const transferir = page.getByRole('alertdialog', { name: 'Transferir' });
  await escolher(page, transferir.getByRole('combobox', { name: 'Origem' }), `${origem.code} — ${ORIGEM}`);
  await escolher(page, transferir.getByRole('combobox', { name: 'Destino' }), `${destino.code} — ${DESTINO}`);
  await transferir.getByLabel('Valor').fill('5.000,00');
  await expect(transferir.getByLabel('Saldo da origem depois')).toHaveValue('R$ 15.000,00');
  await foto(page, '01-transferir');
  await transferir.getByRole('button', { name: 'Transferir', exact: true }).click();
  await expect(transferir).toBeHidden();
  const depois = await apiGet<Saldos>(request, `/api/v1/bank-accounts/balances?date=${hoje}`);
  expect(saldoDe(depois, origem.id)).toBe('1500000');
  expect(saldoDe(depois, destino.id)).toBe('1500000');
  expect(depois.totalCents).toBe(antes.totalCents);

  // Financeiro → Fluxo de caixa, pela categoria do roteiro: R$ 2.335,00 e R$ 1.000,00 previstos, saldos encadeados.
  await gaveta.getByRole('button', { name: /Fluxo de caixa/ }).click();
  const fluxo = page.getByRole('dialog', { name: 'Fluxo de caixa', exact: true });
  await escolher(page, fluxo.getByRole('combobox', { name: 'Categoria' }), CATEGORIA);
  await fluxo.getByLabel('De', { exact: true }).fill(mmaaaa(m));
  await fluxo.getByLabel('Até', { exact: true }).fill(mmaaaa(mes(m, 2)));
  await fluxo.getByRole('button', { name: 'Atualizar' }).click();
  const grade = fluxo.getByRole('table', { name: 'Fluxo de caixa' });
  const celula = grade.getByRole('button', { name: `Saídas previstas de ${mmaaaa(n)}: R$ 2.335,00` });
  await expect(celula).toBeVisible();
  await expect(grade.getByRole('button', { name: `Saídas previstas de ${mmaaaa(mes(m, 2))}: R$ 1.000,00` })).toBeVisible();
  await expect(grade.getByRole('row', { name: /Saldo final/ })).toContainText('-R$ 3.335,00');
  await foto(page, '02-fluxo');
  await celula.click();
  await expect(fluxo.getByLabel('Total da composição')).toHaveText('R$ 2.335,00');
  await expect(fluxo.getByRole('table', { name: 'Composição do valor' }).getByRole('row')).toHaveCount(4);
  const comp = await apiGet<{ totalCents: string; lines: unknown[] }>(request,
    `/api/v1/cash-flow/composition?month=${n}&column=FORECAST_OUT&category=${categoria}`);
  expect(comp).toMatchObject({ totalCents: '233500' });
  expect(comp.lines).toHaveLength(2);
  await foto(page, '03-composicao');

  // Pela conta de destino: o realizado do mês tem a entrada da transferência (conferido pela API).
  const doDestino = await apiGet<{ months: Mes[] }>(request, `/api/v1/cash-flow?from=${m}&to=${m}&accountId=${destino.id}`);
  expect(doDestino.months[0]).toMatchObject({ openingCents: '1000000', realizedInCents: '500000' });

  // Estorno pelo extrato: os dois saldos voltam.
  await gaveta.getByRole('button', { name: /Contas financeiras/ }).click();
  await contas.getByRole('tab', { name: 'Extrato' }).click();
  await escolher(page, contas.getByRole('combobox', { name: 'Conta' }), `${origem.code} — ${ORIGEM}`);
  const extrato = contas.getByRole('table', { name: 'Extrato da conta' });
  await expect(extrato).toContainText('R$ 5.000,00');
  await extrato.getByRole('button', { name: /Estornar transferência TR\d{5}/ }).click();
  const estorno = page.getByRole('alertdialog', { name: 'Estornar transferência' });
  await estorno.getByLabel('Motivo').fill('Conta errada');
  await estorno.getByRole('button', { name: 'Estornar', exact: true }).click();
  await expect(estorno).toBeHidden();
  await expect(extrato).toContainText('Estorno da transferência');
  const final = await apiGet<Saldos>(request, '/api/v1/bank-accounts/balances');
  expect(saldoDe(final, origem.id)).toBe('2000000');
  expect(saldoDe(final, destino.id)).toBe('1000000');
  await foto(page, '04-estorno');
});
