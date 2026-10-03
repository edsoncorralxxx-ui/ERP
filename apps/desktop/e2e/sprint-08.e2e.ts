import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 8 — "Como verificar": título a pagar manual de R$ 3.000,00 em 3 parcelas pela tela; pagamento parcial de
 * R$ 400,00 pelo Banco (a conta cai para R$ 9.600,00, conferido pela API e no extrato); R$ 600,01 recusado; estorno
 * (a conta volta a R$ 10.000,00); cancelamento da 3ª parcela com motivo. Depois a guia DAS da competência D, na
 * Apuração do Simples (Sprint 12; era a conferência do contador), cria o título a pagar (seta da guia para o título) e
 * uma nova guia substitui a anterior, deixando um só DAS ativo (conferido pela API). A competência D é três meses antes
 * da data do servidor, para não cruzar com o roteiro da Sprint 12. Fornecedor e conta são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const FORNECEDOR = `Manutenção E2E8 ${SUFIXO} Ltda.`;
const BANCO = `Banco E2E8 ${SUFIXO}`;

let auth: Record<string, string> = {};
let hoje = '';
let contaId = '';
let contaCodigo = '';
let fornecedorCodigo = '';
/** Competência do DAS (AAAA-MM) e o seu rótulo (MM/AAAA). */
let d = '';
let rotulo = '';

const mes = (competencia: string, delta: number) => {
  const x = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)) - 1 + delta, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};
const mmaaaa = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s8-${nome}.png` });
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

type Titulo = { id: string; code: string; status: string; balanceCents: string; paidCents: string; originType: string; competence: string; version: string };
type Periodo = { status: string; version: string; guides: { titleId: string | null; status: string }[] };
type Pagamento = { id: string; status: string; direction: string };

const saldoDaConta = async (request: APIRequestContext) => (await apiGet<{ balanceCents: string }>(request, `/api/v1/bank-accounts/${contaId}`)).balanceCents;

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  hoje = (await apiGet<{ businessDate: string }>(request, '/api/v1/status')).businessDate;
  d = mes(hoje.slice(0, 7), -3);
  rotulo = mmaaaa(d);

  // Banco reaproveitado: a competência D volta em apuração e o DAS dela sem pagamento (a nova guia exige).
  const antes = await apiGet<Periodo>(request, `/api/v1/tax-periods/${d}`);
  if (antes.status === 'ENCERRADA') {
    const r = await request.post(`${API}/api/v1/tax-periods/${d}/reopenings`, {
      headers: { ...auth, 'If-Match': `"${antes.version}"` }, data: { reason: 'Roteiro de ponta a ponta' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  for (const c of antes.guides.filter((x) => x.titleId && x.status !== 'SUBSTITUIDA')) {
    for (const s of await apiGet<Pagamento[]>(request, `/api/v1/settlements?titleId=${c.titleId}`)) {
      if (s.status !== 'POSTED') continue;
      const r = await request.post(`${API}/api/v1/settlements/${s.id}/reversals`, { headers: auth, data: { reason: 'Roteiro de ponta a ponta' } });
      expect(r.ok(), await r.text()).toBeTruthy();
    }
  }

  const fornecedor = await request.post(`${API}/api/v1/suppliers`, {
    headers: { ...auth, 'Idempotency-Key': `e2e8-${SUFIXO}-fornecedor` }, data: { legalName: FORNECEDOR },
  });
  expect(fornecedor.ok(), await fornecedor.text()).toBeTruthy();
  fornecedorCodigo = (await fornecedor.json()).code;
  const banco = await request.post(`${API}/api/v1/bank-accounts`, {
    headers: auth, data: { name: BANCO, kind: 'BANCO', bank: 'Banco do Brasil', openingCents: '1000000', openingOn: '2026-01-01' },
  });
  expect(banco.ok(), await banco.text()).toBeTruthy();
  const b = await banco.json();
  contaId = b.id;
  contaCodigo = b.code;
});

test('título a pagar em parcelas, pagamento parcial, excedente, estorno, cancelamento e o DAS da apuração', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Financeiro → Contas a pagar → Novo: R$ 3.000,00 em 3 parcelas.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await gaveta.getByRole('button', { name: /Contas a pagar/ }).click();
  const lista = page.getByRole('dialog', { name: 'Contas a pagar', exact: true });
  await lista.getByRole('button', { name: 'Novo' }).click();
  const novo = page.getByRole('dialog', { name: 'Título a pagar', exact: true });
  await escolher(page, novo.getByRole('combobox', { name: 'Beneficiário' }), `${fornecedorCodigo} — ${FORNECEDOR}`);
  await escolher(page, novo.getByRole('combobox', { name: 'Categoria' }), 'Serviços de terceiros');
  await novo.getByLabel('Competência').fill(mmaaaa(hoje.slice(0, 7)));
  await novo.getByLabel('Documento').fill(`NFS-e ${SUFIXO}`);
  await novo.getByLabel('Descrição').fill('Manutenção da linha');
  await novo.getByLabel('Total').fill('3.000,00');
  await novo.getByRole('button', { name: 'Dividir o total' }).click();
  await page.getByRole('alertdialog', { name: 'Dividir o total' }).getByRole('button', { name: 'Dividir' }).click();
  await expect(novo.getByLabel('Soma das parcelas')).toHaveText('R$ 3.000,00');
  await foto(page, '01-novo-titulo');
  await novo.getByRole('button', { name: 'Adicionar', exact: true }).click();
  const gerados = novo.getByRole('table', { name: 'Títulos gerados' });
  await expect(gerados.getByRole('row')).toHaveCount(4);
  const titulos = await apiGet<Titulo[]>(request, `/api/v1/payables?search=${encodeURIComponent(`NFS-e ${SUFIXO}`)}`);
  expect(titulos).toHaveLength(3);
  expect(titulos.every((t) => t.balanceCents === '100000' && t.status === 'OPEN')).toBeTruthy();
  const [t1, , t3] = titulos;
  await foto(page, '02-titulos-gerados');

  // Pagar R$ 400,00 pelo Banco: parcial; a conta cai para R$ 9.600,00.
  await novo.getByRole('button', { name: 'OK', exact: true }).click();
  await lista.getByRole('searchbox').fill(t1.code);
  await expect(lista.getByRole('table', { name: 'Contas a pagar' }).getByRole('row')).toHaveCount(2);
  await lista.getByRole('link', { name: `Abrir título ${t1.code}` }).click();
  const ficha = page.getByRole('dialog', { name: 'Título a pagar', exact: true });
  await expect(ficha.getByLabel('Saldo a pagar')).toHaveValue('R$ 1.000,00');
  await ficha.getByRole('button', { name: 'Pagar' }).click();
  let pagar = page.getByRole('alertdialog', { name: 'Pagar' });
  await escolher(page, pagar.getByRole('combobox', { name: 'Conta' }), `${contaCodigo} — ${BANCO}`);
  await pagar.getByLabel('Valor').fill('400,00');
  await expect(pagar.getByLabel('Saldo da conta depois')).toHaveValue('R$ 9.600,00');
  await pagar.getByRole('button', { name: 'Pagar', exact: true }).click();
  await expect(ficha.getByLabel('Saldo a pagar')).toHaveValue('R$ 600,00');
  expect(await saldoDaConta(request)).toBe('960000');
  await foto(page, '03-pagamento-parcial');

  // R$ 600,01 passa do saldo: recusado no campo, sem mexer na conta.
  await ficha.getByRole('button', { name: 'Pagar' }).click();
  pagar = page.getByRole('alertdialog', { name: 'Pagar' });
  await escolher(page, pagar.getByRole('combobox', { name: 'Conta' }), `${contaCodigo} — ${BANCO}`);
  await pagar.getByLabel('Valor').fill('600,01');
  await pagar.getByRole('button', { name: 'Pagar', exact: true }).click();
  await expect(pagar.getByText('Saldo atual: R$ 600,00.')).toBeVisible();
  await pagar.getByRole('button', { name: 'Cancelar' }).click();
  expect(await saldoDaConta(request)).toBe('960000');

  // Estornar o pagamento: o título volta a R$ 1.000,00 e a conta a R$ 10.000,00.
  await ficha.getByRole('tab', { name: /Pagamentos/ }).click();
  await ficha.getByRole('button', { name: /Estornar pagamento PG/ }).click();
  const estorno = page.getByRole('alertdialog', { name: 'Estornar pagamento' });
  await estorno.getByLabel('Motivo').fill('Pago na conta errada');
  await estorno.getByRole('button', { name: 'Estornar' }).click();
  await expect(ficha.getByLabel('Saldo a pagar')).toHaveValue('R$ 1.000,00');
  expect(await saldoDaConta(request)).toBe('1000000');
  await foto(page, '04-estorno');

  // Extrato da conta: a saída do pagamento e a entrada do estorno.
  const movimentos = await apiGet<{ amountCents: string }[]>(request, `/api/v1/bank-accounts/${contaId}/movements`);
  expect(movimentos.map((m) => m.amountCents)).toEqual(['-40000', '40000']);

  // Cancelar a 3ª parcela, pelo próximo registro da lista gerada.
  await ficha.getByRole('button', { name: 'OK', exact: true }).click();
  await lista.getByRole('searchbox').fill(t3.code);
  await expect(lista.getByRole('table', { name: 'Contas a pagar' }).getByRole('row')).toHaveCount(2);
  await lista.getByRole('link', { name: `Abrir título ${t3.code}` }).click();
  const ficha3 = page.getByRole('dialog', { name: 'Título a pagar', exact: true });
  await ficha3.getByRole('button', { name: 'Cancelar título' }).click();
  const cancela = page.getByRole('alertdialog', { name: 'Cancelar título' });
  await cancela.getByLabel('Motivo').fill('Parcela lançada em duplicidade');
  await cancela.getByRole('button', { name: 'Cancelar título' }).click();
  await expect(ficha3.getByLabel('Saldo a pagar')).toHaveValue('R$ 0,00');
  expect((await apiGet<Titulo>(request, `/api/v1/payables/${t3.id}`)).status).toBe('CANCELLED');
  await ficha3.getByRole('button', { name: 'OK', exact: true }).click();

  // Fiscal → Apuração do Simples → competência D → Guia DAS: nasce o título a pagar, com a seta da guia para ele.
  await gaveta.getByRole('button', { name: 'Fiscal', exact: true }).click();
  await gaveta.getByRole('button', { name: /Apuração do Simples/ }).click();
  const competencia = page.getByRole('dialog', { name: 'Apuração do Simples Nacional', exact: true });
  await escolher(page, competencia.getByRole('combobox', { name: 'Competência' }), rotulo);
  await competencia.getByRole('tab', { name: /Guia DAS/ }).click();
  const guia = competencia.getByRole('tabpanel');
  const gera = async (valor: string) => {
    await guia.locator('input[id$="-princ"]').fill(valor);
    await guia.getByRole('textbox', { name: 'Vencimento' }).last().fill(`20/${mmaaaa(mes(d, 1))}`);
    await guia.getByRole('button', { name: 'Gerar DAS' }).click();
  };
  await gera('1.330,00');
  await expect(guia.getByRole('textbox', { name: 'Total a pagar' })).toHaveValue('R$ 1.330,00');
  await expect(guia).toContainText('Aberto');
  await foto(page, '05-das-criado');

  // Nova guia: a anterior fica substituída e só um DAS fica ativo na competência (conferido pela API).
  await gera('1.335,00');
  await expect(guia.getByRole('textbox', { name: 'Total a pagar' })).toHaveValue('R$ 1.335,00');
  await expect(guia.getByRole('table', { name: 'Guias anteriores' })).toContainText('Substituída');
  const p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${d}`);
  const ativos = p.guides.filter((g) => g.status !== 'SUBSTITUIDA');
  expect(ativos).toHaveLength(1);
  const das = await apiGet<Titulo>(request, `/api/v1/payables/${ativos[0].titleId}`);
  expect(das).toMatchObject({ originType: 'TAX_PERIOD', competence: d, balanceCents: '133500', status: 'OPEN' });
  expect((await apiGet<Titulo[]>(request, `/api/v1/payables?search=${encodeURIComponent(`DAS ${rotulo}`)}`)).filter((t) => t.status !== 'CANCELLED'))
    .toHaveLength(1);
  await foto(page, '06-nova-guia');

  // A seta da guia abre o DAS em Contas a pagar.
  await guia.getByRole('link', { name: `Abrir título ${das.code}` }).click();
  const fichaDas = page.getByRole('dialog', { name: 'Título a pagar', exact: true });
  await expect(fichaDas.getByLabel('Descrição')).toHaveValue(`DAS ${rotulo}`);
  await expect(fichaDas.getByLabel('Categoria')).toHaveValue('Impostos — Simples Nacional');
  await expect(fichaDas.getByRole('button', { name: 'Cancelar título' })).toHaveCount(0);
  await foto(page, '07-das');
});
