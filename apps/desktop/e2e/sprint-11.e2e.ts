import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { abrirMenu } from './menu';

/**
 * Sprint 11, refeito nas telas do mock (Sprint 13): a lista de prospecção de exemplo entra por CRM → Leads → Importar
 * lista (prévia com 10 linhas, 3 com erro e 2 avisos de nome repetido); na ficha de um lead, Registrar interação leva a
 * Contatado com a próxima ação; Abrir oportunidade cria a OP na Prospecção (10%: ponderado R$ 15.000,00) e a etapa
 * Visita técnica (40%) dá R$ 60.000,00, com a passagem no Histórico de etapas; Converter em cliente cadastra o cliente
 * uma vez; a proposta da oportunidade, emitida e convertida em pedido (pela API), deixa a oportunidade Ganha, com o
 * pedido em Propostas e pedidos; o funil (API) e a lista de oportunidades mostram o que aconteceu. As empresas levam um
 * sufixo por execução, para rodar de novo no mesmo banco.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;

let auth: Record<string, string> = {};

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s11-${nome}.png` });
}

async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: auth });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as T;
}

async function apiPost<T>(request: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
  const r = await request.post(`${API}${path}`, { headers: { ...auth, ...headers }, data });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as T;
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
});

test('lista carregada, interação, oportunidade pelas etapas, cliente, proposta ganha, funil e oportunidades', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // CRM → Leads → Importar lista com o exemplo (só os nomes das empresas mudam por execução).
  await abrirMenu(page, 'CRM', 'Leads');
  const lista = page.getByRole('dialog', { name: 'Leads', exact: true });
  await lista.getByRole('button', { name: 'Importar lista' }).click();
  const importar = page.getByRole('dialog', { name: 'Importar lista de prospecção', exact: true });
  const exemplo = JSON.parse(readFileSync(join(__dirname, '../../../docs/scrum/sprints/exemplos/prospeccao-exemplo.json'), 'utf8'));
  exemplo.origem = `${exemplo.origem} — E2E ${SUFIXO}`;
  for (const p of exemplo.prospeccoes) if (p.empresa) p.empresa = `${p.empresa} ${SUFIXO}`;
  await importar.getByLabel('Lista de prospecção (JSON)').setInputFiles({
    name: `prospeccao-${SUFIXO}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exemplo, null, 2)),
  });
  await expect(importar.getByLabel('Linhas do arquivo')).toHaveValue('10');
  await expect(importar.getByLabel('Linhas que serão carregadas')).toHaveValue('7');
  await expect(importar.getByLabel('Linhas com erro')).toHaveValue('3');
  await expect(importar.getByLabel('Avisos')).toHaveValue('2');
  const linhas = importar.getByRole('table', { name: 'Linhas da lista' });
  await expect(linhas).toContainText('Estrelas 7 fora de 1 a 5');
  await expect(linhas).toContainText('Mesmo nome e cidade da linha 2');
  await expect(linhas).toContainText('Mesmo nome da linha 4 em outra cidade (Paranavaí × Mandaguaçu)');
  await foto(page, '01-previa');
  await importar.getByRole('button', { name: 'Confirmar carga' }).click();
  await expect(importar.getByText('Carregada', { exact: true })).toBeVisible();
  await importar.getByRole('button', { name: 'OK', exact: true }).click();

  // A prospecção Alfa: Registrar interação → Contatado com a próxima ação.
  const alfa = `Fecularia Exemplo Alfa Ltda. ${SUFIXO}`;
  await lista.getByLabel('Localizar').fill(SUFIXO);
  await lista.getByRole('button', { name: 'Aplicar' }).click();
  await expect(lista).toContainText(alfa);
  await lista.getByRole('row').filter({ hasText: alfa }).first().dblclick();
  const ficha = page.getByRole('dialog', { name: 'Prospecção', exact: true }).filter({ has: page.getByLabel('Empresa') });
  await expect(ficha.getByLabel('Empresa')).toHaveValue(alfa);
  await expect(ficha.getByLabel('Classificação')).toContainText('5 de 5');
  await ficha.getByRole('button', { name: 'Registrar interação' }).click();
  const interacao = page.getByRole('alertdialog', { name: 'Registrar interação' });
  await interacao.getByLabel('Resumo').fill('Interesse na balança automática para a linha nova');
  await interacao.getByLabel('Próxima ação em').fill('31/12/2026');
  await interacao.getByLabel('Próxima ação', { exact: true }).fill('Enviar catálogo');
  await interacao.getByRole('button', { name: 'Registrar' }).click();
  await expect(interacao).toBeHidden();
  await expect(ficha.getByText('Contatado', { exact: true }).first()).toBeVisible();
  await expect(ficha.getByLabel('Próxima ação', { exact: true })).toHaveValue('Enviar catálogo');
  await expect(ficha.getByRole('table', { name: 'Interações da prospecção' })).toContainText('Interesse na balança automática');
  await foto(page, '02-prospeccao');

  // Abrir oportunidade: Prospecção (10%), R$ 150.000,00 → ponderado R$ 15.000,00.
  await ficha.getByRole('button', { name: 'Abrir oportunidade' }).click();
  const opp = page.getByRole('dialog', { name: /^Oportunidade de venda/ });
  await expect(opp.getByLabel('Nome do cliente')).toHaveValue(alfa);
  await opp.getByLabel('Valor potencial').fill('150000');
  await expect(opp.getByLabel('Valor ponderado')).toHaveValue('15.000,00');
  await opp.getByRole('button', { name: 'Adicionar', exact: true }).last().click();
  await expect(opp.getByLabel('Número')).toHaveValue(/^OP-\d{6}$/);
  const codigo = await opp.getByLabel('Número').inputValue();

  // Etapa Visita técnica (40%): R$ 60.000,00, e a passagem fica no Histórico de etapas.
  await opp.getByRole('combobox', { name: 'Etapa' }).click();
  await page.getByRole('listbox').getByRole('option', { name: 'Visita técnica', exact: true }).click();
  await opp.getByRole('button', { name: 'Atualizar' }).click();
  await expect(opp.getByLabel('Probabilidade')).toHaveValue('40');
  await expect(opp.getByLabel('Valor ponderado')).toHaveValue('60.000,00');
  await opp.getByRole('tab', { name: /Histórico de etapas/ }).click();
  await expect(opp.getByRole('table', { name: 'Histórico de etapas' })).toContainText('Visita técnica');
  await foto(page, '03-oportunidade');

  // Fecha a ficha da oportunidade; ela volta depois pela aba Oportunidades da prospecção, já com o que a proposta fez.
  await opp.getByLabel('Título').click();
  await page.keyboard.press('Escape');
  await expect(opp).toBeHidden();

  // Converter em cliente, na prospecção: o cliente é cadastrado uma vez e a oportunidade passa a tê-lo.
  await ficha.getByRole('button', { name: 'Converter em cliente' }).click();
  await page.getByRole('alertdialog', { name: 'Converter em cliente' }).getByRole('button', { name: 'Converter' }).click();
  await expect(ficha.getByLabel('Cliente', { exact: true })).toHaveValue(new RegExp(`^C\\d{5} — ${alfa.replace(/[.]/g, '\\.')}`));
  const clientes = await apiGet<{ id: string }[]>(request, `/api/v1/customers?status=TODOS&search=${encodeURIComponent(alfa)}`);
  expect(clientes).toHaveLength(1);

  // A proposta da oportunidade, emitida e convertida em pedido (pela API): a oportunidade fica Ganha.
  const oportunidades = await apiGet<{ id: string; code: string; customerId: string | null; stage: string }[]>(request, `/api/v1/opportunities?status=TODAS&search=${codigo}`);
  expect(oportunidades[0].customerId).toBe(clientes[0].id);
  const proposta = await apiPost<{ id: string; opportunityCode: string }>(request, '/api/v1/proposals', {
    opportunityId: oportunidades[0].id, customerId: clientes[0].id, title: 'Balança automática', validUntil: '2026-12-31',
    lines: [{ kind: 'EQUIPAMENTO', description: 'Balança Renda+ automática', quantity: '1', unitPrice: '150000' }],
  }, { 'Idempotency-Key': `e2e11-${SUFIXO}-prop` });
  expect(proposta.opportunityCode).toBe(codigo);
  const emitir = await request.post(`${API}/api/v1/proposals/${proposta.id}/issue`, { headers: { ...auth, 'If-Match': '"1"' } });
  expect(emitir.ok(), await emitir.text()).toBeTruthy();
  const pedido = await apiPost<{ code: string }>(request, `/api/v1/proposals/${proposta.id}/orders`, {}, { 'Idempotency-Key': `e2e11-${SUFIXO}-conv` });
  await ficha.getByRole('tab', { name: /Oportunidades/ }).click();
  await ficha.getByRole('link', { name: `Abrir oportunidade ${codigo}` }).click();
  const ganha = page.getByRole('dialog', { name: `Oportunidade de venda — ${codigo}` });
  await expect(ganha.getByText('Ganha', { exact: true }).first()).toBeVisible();
  await ganha.getByRole('tab', { name: /Propostas e pedidos/ }).click();
  await expect(ganha.getByRole('table', { name: 'Propostas e pedidos' })).toContainText(pedido.code);
  await foto(page, '04-ganha');

  // Funil (API): a ganha aparece no período; da Prospecção, quem entrou e avançou.
  const dados = await apiGet<{ won: { count: number }; conversion: { code: string; entered: number; advanced: number }[] }>(request, '/api/v1/crm/funnel');
  expect(dados.won.count).toBeGreaterThanOrEqual(1);
  expect(dados.conversion.find((c) => c.code === 'PROSPECCAO')!.advanced).toBeGreaterThanOrEqual(1);

  // CRM → Oportunidades: filtrada pela etapa Ganha, a oportunidade está na lista.
  await abrirMenu(page, 'CRM', 'Oportunidades');
  const oportunidadesJanela = page.getByRole('dialog', { name: 'Oportunidades de venda', exact: true });
  await oportunidadesJanela.getByLabel('Localizar').fill(codigo);
  await oportunidadesJanela.getByRole('button', { name: 'Aplicar' }).click();
  await expect(oportunidadesJanela.getByRole('table', { name: 'Oportunidades' })).toContainText(codigo);
  await expect(oportunidadesJanela.getByRole('table', { name: 'Oportunidades' })).toContainText('Ganha');
  await foto(page, '05-oportunidades');
});
