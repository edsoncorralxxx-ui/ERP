import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 12 — "Como verificar": o histórico de receita do mock (12 meses antes da primeira competência no Renda+) dá o
 * RBT12 de R$ 3.340.000,00; nota de produto e nota de serviço do mesmo recebimento caem nos anexos II e III; o Painel
 * fiscal abre a Apuração do Simples, que calcula o DAS por anexo, registra o PGDAS-D, gera a guia DAS com o título a
 * pagar e registra o pagamento; o fechamento conclui as etapas, encerra (a competência trava as notas) e reabre com
 * motivo; a nota mostra o anexo de cada linha; Obrigações mostra o PGDAS-D e o DAS da competência. Cada passo da tela é
 * conferido também pela API. Histórico, cliente, pedido, recebimento e notas são criados pela API.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const CLIENTE = `Fécula E2E12 ${SUFIXO} Ltda.`;
const SERVICO = `Instalação E2E12 ${SUFIXO}`;

/** Histórico do mock (docs/scrum/sprints/exemplos/fiscal-exemplo.json): os 12 meses antes de 09/2026, em centavos. */
const HISTORICO: [string, string, string][] = [
  ['980000', '19740000', '7280000'], ['840000', '16920000', '6240000'], ['910000', '18330000', '6760000'],
  ['1155000', '23265000', '8580000'], ['525000', '10575000', '3900000'], ['490000', '9870000', '3640000'],
  ['665000', '13395000', '4940000'], ['875000', '17625000', '6500000'], ['1155000', '23265000', '8580000'],
  ['1365000', '27495000', '10140000'], ['1470000', '29610000', '10920000'], ['1260000', '26220000', '8520000'],
];

let auth: Record<string, string> = {};
let pedidoId = '';
let hoje = '';
/** Competência do roteiro (AAAA-MM), a primeira com a receita no Renda+, e o seu rótulo (MM/AAAA). */
let c = '';
let rotulo = '';
/** Conta Caixa do pagamento da guia, como aparece na escolha (código — nome). */
let caixaRotulo = '';

const mes = (competencia: string, delta: number) => {
  const d = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const mmaaaa = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
const reais = (cents: string) => {
  const v = BigInt(cents);
  const inteiro = (v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiro},${(v % 100n).toString().padStart(2, '0')}`;
};

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s12-${nome}.png` });
}

async function escolher(page: Page, campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await page.getByRole('listbox').getByRole('option', { name: opcao, exact: true }).click();
}

async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: auth });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as T;
}

const nota = (request: APIRequestContext, chave: string, kind: string, numero: string) =>
  request.post(`${API}/api/v1/documents`, {
    headers: { ...auth, 'Idempotency-Key': `e2e12-${SUFIXO}-${chave}` },
    data: { orderId: pedidoId, kind, series: '12', number: numero, issueDate: hoje, competence: c },
  });

type Guia = { id: string; status: string; titleId: string | null; totalCents: string };
type Periodo = {
  status: string;
  version: string;
  revenueCents: string;
  revenueByAnnex: Record<string, string>;
  rbt12: { usedCents: string | null; usedOrigin: string | null };
  calculation: { source: string; result: string; totalTaxCents: string | null; memory: { annexes?: { annex: string; taxCents: string }[] } };
  declarations: { receiptNumber: string }[];
  guides: Guia[];
  steps: { code: string; automatic: boolean; done: boolean }[];
  documents: { documentId: string; code: string; annex: string; cents: string }[];
};

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  const chave = (k: string) => ({ ...auth, 'Idempotency-Key': `e2e12-${SUFIXO}-${k}` });
  hoje = (await apiGet<{ businessDate: string }>(request, '/api/v1/status')).businessDate;
  c = (await apiGet<{ revenueStart: string }>(request, '/api/v1/tax-setup')).revenueStart;
  rotulo = mmaaaa(c);

  // Banco reaproveitado: a competência volta em apuração, sem notas, sem etapas manuais e com a guia sem pagamento.
  let antes = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  if (antes.status === 'ENCERRADA') {
    const r = await request.post(`${API}/api/v1/tax-periods/${c}/reopenings`, {
      headers: { ...auth, 'If-Match': `"${antes.version}"` }, data: { reason: 'Roteiro de ponta a ponta' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    antes = await r.json();
  }
  for (const g of antes.guides.filter((x) => x.titleId && x.status !== 'SUBSTITUIDA')) {
    for (const s of await apiGet<{ id: string; status: string }[]>(request, `/api/v1/settlements?titleId=${g.titleId}`)) {
      if (s.status !== 'POSTED') continue;
      const r = await request.post(`${API}/api/v1/settlements/${s.id}/reversals`, { headers: auth, data: { reason: 'Roteiro de ponta a ponta' } });
      expect(r.ok(), await r.text()).toBeTruthy();
    }
  }
  for (const s of antes.steps.filter((x) => !x.automatic && x.done)) {
    const atual = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
    const r = await request.put(`${API}/api/v1/tax-periods/${c}/closing-steps/${s.code}`, {
      headers: { ...auth, 'If-Match': `"${atual.version}"` }, data: { done: false },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  for (const d of await apiGet<{ id: string; version: string }[]>(request, `/api/v1/documents?competence=${c}`)) {
    const r = await request.post(`${API}/api/v1/documents/${d.id}/cancellations`, {
      headers: { ...auth, 'If-Match': `"${d.version}"` }, data: { reason: 'Roteiro de ponta a ponta' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }

  // Histórico de receita do mock nos 12 meses antes da competência.
  const historico = await apiGet<{ competence: string; version: string }[]>(request, '/api/v1/tax-revenue-history');
  for (let i = 0; i < 12; i++) {
    const comp = mes(c, i - 12);
    const versao = historico.find((h) => h.competence === comp)?.version ?? '0';
    const [anexoI, anexoII, anexoIII] = HISTORICO[i];
    const r = await request.put(`${API}/api/v1/tax-revenue-history/${comp}`, {
      headers: { ...auth, 'If-Match': `"${versao}"` },
      data: { annexICents: anexoI, annexIICents: anexoII, annexIIICents: anexoIII, informedBy: 'Escritório contábil' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }

  const cliente = await request.post(`${API}/api/v1/customers`, {
    headers: chave('cliente'), data: { legalName: CLIENTE, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
  });
  expect(cliente.ok(), await cliente.text()).toBeTruthy();
  const cl = await cliente.json();
  const categoria = await request.post(`${API}/api/v1/item-categories`, { headers: auth, data: { name: `Serviços E2E12 ${SUFIXO}` } });
  expect(categoria.ok(), await categoria.text()).toBeTruthy();
  const servico = await request.post(`${API}/api/v1/items`, {
    headers: chave('servico'),
    data: { description: SERVICO, nature: 'SERVICO', uom: 'H', categoryId: (await categoria.json()).id, stockControlled: false },
  });
  expect(servico.ok(), await servico.text()).toBeTruthy();
  const pedido = await request.post(`${API}/api/v1/sales-orders`, {
    headers: chave('pedido'),
    data: {
      customerId: cl.id, unitId: cl.units[0].id, contractDate: '2026-01-10',
      lines: [
        { kind: 'EQUIPAMENTO', description: 'Balança Renda+ R50', quantity: '1', unitPrice: '100000' },
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
  const conta = (await apiGet<{ id: string; kind: string; code: string; name: string }[]>(request, '/api/v1/bank-accounts')).find((a) => a.kind === 'CAIXA')!;
  const caixa = conta.id;
  caixaRotulo = `${conta.code} — ${conta.name}`;
  const rec = await request.post(`${API}/api/v1/settlements`, {
    headers: chave('rec'),
    data: { accountId: caixa, effectiveDate: hoje, amountCents: '2000000', allocations: [{ titleId: titulo, amountCents: '2000000' }] },
  });
  expect(rec.ok(), await rec.text()).toBeTruthy();
  // Nota de produto (NF-e: o equipamento vai ao anexo II) e de serviço (NFS-e: item sem classificação, anexo III padrão).
  for (const [k, tipo, numero] of [['nfe', 'PRODUTO', '124871'], ['nfse', 'SERVICO', '120512']]) {
    const r = await nota(request, k, tipo, numero);
    expect(r.status(), await r.text()).toBe(201);
  }
});

test('painel, apuração por anexo, PGDAS-D, guia DAS paga, fechamento e obrigações', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Fiscal → Painel fiscal: RBT12 do histórico do mock na competência do roteiro.
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Fiscal', exact: true }).click();
  await gaveta.getByRole('button', { name: /Painel fiscal/ }).click();
  const painel = page.getByRole('dialog', { name: 'Painel fiscal', exact: true });
  if (mes(hoje.slice(0, 7), -1) !== c) await escolher(page, painel.getByRole('combobox', { name: 'Competência' }), rotulo);
  await expect(painel).toContainText(`RBT12 — receita em 12 meses`);
  await expect(painel).toContainText('R$ 3.340.000');
  await foto(page, '01-painel');

  // A seta do DAS abre a Apuração do Simples na mesma competência.
  await painel.getByRole('link', { name: 'Abrir o cálculo do DAS' }).click();
  const apuracao = page.getByRole('dialog', { name: 'Apuração do Simples Nacional', exact: true });
  await expect(apuracao.getByRole('combobox', { name: 'Competência' })).toContainText(rotulo);
  await expect(apuracao.getByRole('textbox', { name: 'RBT12', exact: true })).toHaveValue('R$ 3.340.000,00');
  await expect(apuracao.getByRole('textbox', { name: 'Receita do período' })).toHaveValue('R$ 20.000,00');
  await apuracao.getByRole('tab', { name: /Receitas/ }).click();
  const receitas = apuracao.getByRole('table', { name: 'Receitas da competência por anexo' });
  await expect(receitas).toContainText('R$ 12.861,74');
  await expect(receitas).toContainText('R$ 7.138,26');
  let p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p.revenueByAnnex).toMatchObject({ II: '1286174', III: '713826' });
  expect(p.rbt12).toMatchObject({ usedCents: '334000000', usedOrigin: 'CALCULADO' });
  await foto(page, '02-receitas');

  // A seta da nota de serviço abre o documento: a linha está no anexo III padrão (item sem classificação), autorizada.
  const servico = p.documents.find((d) => d.annex === 'III')!;
  await receitas.getByRole('link', { name: `Abrir documento ${servico.code}` }).click();
  const documento = page.getByRole('dialog', { name: /Nota|Documento/ }).last();
  const linhasDaNota = documento.getByRole('table', { name: 'Linhas da nota' });
  await expect(linhasDaNota).toContainText('III (padrão)');
  await expect(documento.getByText('Autorizada', { exact: true })).toBeVisible();
  await foto(page, '03-nota-padrao');

  // Classificação fiscal do serviço: a linha da nota em apuração passa ao anexo da classificação.
  await gaveta.getByRole('button', { name: /Classificação fiscal/ }).click();
  const classificacao = page.getByRole('dialog', { name: 'Classificação fiscal de itens', exact: true });
  await classificacao.getByRole('tab', { name: /Serviços/ }).click();
  await classificacao.getByRole('searchbox').fill(SERVICO);
  await classificacao.getByRole('table', { name: 'Serviços' }).getByRole('row', { name: new RegExp(SERVICO) }).click();
  await classificacao.getByLabel('Item LC 116').fill('14.06');
  await classificacao.getByLabel('NBS').fill('1.2001.10.00');
  await escolher(page, classificacao.getByRole('combobox', { name: 'Anexo', exact: true }).last(), 'Anexo III — Serviços');
  await escolher(page, classificacao.getByRole('combobox', { name: 'Retenção de ISS' }), 'Não');
  await classificacao.getByRole('button', { name: 'Gravar' }).click();
  await expect(classificacao.getByText('Classificação conferida.')).toBeVisible();
  await foto(page, '04-classificacao');
  const doc = await apiGet<{ lines: { annex: string; annexSource: string }[] }>(request, `/api/v1/documents/${servico.documentId}`);
  expect(doc.lines.map((l) => [l.annex, l.annexSource])).toEqual([['III', 'CLASSIFICACAO']]);
  p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p.steps.find((s) => s.code === 'RECEITA_SEGREGADA')?.done).toBe(true);

  // Calcular: o DAS por anexo, gravado; a tela mostra o mesmo total da API.
  await apuracao.click({ position: { x: 60, y: 8 } });
  await apuracao.getByRole('button', { name: 'Calcular' }).click();
  await expect(apuracao.getByRole('table', { name: 'Alíquota efetiva por anexo' })).toBeVisible();
  p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p.calculation).toMatchObject({ source: 'GRAVADO', result: 'CALCULADA' });
  const total = p.calculation.totalTaxCents!;
  expect(p.calculation.memory.annexes!.reduce((t, a) => t + BigInt(a.taxCents), 0n)).toBe(BigInt(total));
  await expect(apuracao.getByLabel('Total do DAS', { exact: true })).toHaveText(reais(total));
  await expect(apuracao.getByRole('textbox', { name: 'DAS apurado' })).toHaveValue(reais(total));
  await foto(page, '05-calculo');

  // Transmitir PGDAS-D: registra o recibo da transmissão feita no portal.
  await apuracao.getByRole('button', { name: 'Transmitir PGDAS-D' }).click();
  const transmitir = page.getByRole('alertdialog', { name: 'Transmitir PGDAS-D' });
  await transmitir.getByLabel('Número do recibo').fill(`E2E12-${SUFIXO}`);
  await transmitir.getByRole('button', { name: 'Registrar' }).click();
  await expect(transmitir).toHaveCount(0);
  p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  expect(p.declarations[0].receiptNumber).toBe(`E2E12-${SUFIXO}`);

  // Guia DAS: o valor principal vem do cálculo; gerar cria o título a pagar; pagar pelo Caixa quita a guia.
  await apuracao.getByRole('tab', { name: /Guia DAS/ }).click();
  const painelGuia = apuracao.getByRole('tabpanel');
  // Banco reaproveitado: a guia anterior (sem pagamento) aparece em leitura e a nova a substitui.
  await expect(painelGuia.locator('input[id$="-princ"]')).toHaveValue(reais(total).replace('R$ ', ''));
  await painelGuia.locator('input[id$="-num"]').fill(`07.20.26${SUFIXO.slice(-6)}`);
  await painelGuia.getByRole('button', { name: 'Gerar DAS' }).click();
  await expect(painelGuia.getByRole('textbox', { name: 'Total a pagar' })).toHaveValue(reais(total));
  const guiasAntes = p.guides.length;
  await expect.poll(async () => (await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`)).guides.length).toBe(guiasAntes + 1);
  p = await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`);
  const guia = p.guides.find((g) => g.status !== 'SUBSTITUIDA')!;
  expect(guia).toMatchObject({ status: 'ABERTO', totalCents: total });
  expect(guia.titleId).not.toBeNull();
  await foto(page, '06-guia');
  await escolher(page, painelGuia.getByRole('combobox', { name: 'Conta de pagamento' }), caixaRotulo);
  await painelGuia.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect.poll(async () => (await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`)).guides.find((g) => g.id === guia.id)?.status).toBe('PAGO');
  expect((await apiGet<{ status: string }>(request, `/api/v1/payables/${guia.titleId}`)).status).toBe('SETTLED');

  // Fechamento: as etapas manuais e as que se concluem pelos dados; encerrar trava as notas da competência.
  await apuracao.getByRole('tab', { name: /Fechamento/ }).click();
  const etapas = apuracao.getByRole('table', { name: 'Etapas do fechamento' });
  for (let i = 0; i < 3; i++) {
    await etapas.getByRole('button', { name: 'Concluir' }).first().click();
    await expect(etapas.getByRole('button', { name: 'Concluir' })).toHaveCount(2 - i);
  }
  await expect(apuracao).toContainText('7 de 7 etapas concluídas.');
  await foto(page, '07-fechamento');
  await apuracao.getByRole('button', { name: 'Encerrar competência' }).click();
  await expect(apuracao.getByRole('button', { name: 'Reabrir competência' })).toBeVisible();
  expect((await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`)).status).toBe('ENCERRADA');
  const travada = await nota(request, 'travada', 'PRODUTO', '124872');
  expect(travada.status()).toBe(422);
  expect(await travada.text()).toContain('TAX_PERIOD_CLOSED');

  // Reabrir exige motivo.
  await apuracao.getByRole('button', { name: 'Reabrir competência' }).click();
  const reabrir = page.getByRole('alertdialog', { name: 'Reabrir competência' });
  await reabrir.getByLabel('Motivo').fill('Nota de serviço com valor errado');
  await reabrir.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await expect(apuracao.getByRole('button', { name: 'Encerrar competência' })).toBeVisible();
  expect((await apiGet<Periodo>(request, `/api/v1/tax-periods/${c}`)).status).toBe('EM_APURACAO');
  await foto(page, '08-reaberta');

  // Obrigações: o PGDAS-D e o DAS da competência, com a situação que vem da apuração.
  await gaveta.getByRole('button', { name: /^Obrigações/ }).click();
  const obrigacoes = page.getByRole('dialog', { name: 'Obrigações fiscais e acessórias', exact: true });
  const grade = obrigacoes.getByRole('table', { name: 'Obrigações fiscais e acessórias' });
  await expect(grade).toContainText('PGDAS-D');
  const lista = await apiGet<{ templateCode: string | null; competence: string; status: string }[]>(request, '/api/v1/tax-obligations');
  expect(lista.find((o) => o.templateCode === 'PGDAS_D' && o.competence === c)?.status).toBe('ENTREGUE');
  expect(lista.find((o) => o.templateCode === 'DAS' && o.competence === c)?.status).toBe('PAGO');
  await foto(page, '09-obrigacoes');
});
