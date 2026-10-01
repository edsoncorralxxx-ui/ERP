import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sprint 10 — "Como verificar": a BOM real da Balança Hidrostática (rev. 00) entra pela tela Importar BOM, com a prévia de
 * 203 linhas, R$ 69.398,51 e a linha sem quantidade; depois de informar a quantidade do Suporte 45° no Painel elétrico, a
 * BOM do modelo é aprovada com as submontagens; aplicada ao equipamento de um pedido, uma linha é retirada só nele; o
 * Detalhe do projeto mostra o custo planejado e a margem (conferidos pela API); uma revisão nova do modelo não muda o
 * equipamento. O produto leva um sufixo por execução, para rodar de novo no mesmo banco.
 */
const API = process.env.RENDA_E2E_API ?? 'http://localhost:8080';
const USUARIO = process.env.RENDA_E2E_USER ?? 'admin';
const SENHA = process.env.RENDA_E2E_PASSWORD ?? 'senha-e2e-renda';
const SUFIXO = Date.now().toString(36);
const EVIDENCIAS = process.env.RENDA_E2E_EVIDENCIAS;
const PRODUTO = `Balança Hidrostática E2E10 ${SUFIXO}`;

let auth: Record<string, string> = {};
let equipamento = { id: '', code: '' };
let projeto = '';

async function foto(page: Page, nome: string) {
  if (EVIDENCIAS) await page.screenshot({ path: `${EVIDENCIAS}/s10-${nome}.png` });
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

type Linha = { kind: string; itemId: string | null; childRevisionId: string | null; childBomId: string | null; referenceCode: string | null;
  description: string; quantity: string | null; uom: string; unitCost: string | null; category: string | null; supplier: string | null;
  material: string | null; notes: string | null };
type Revisao = { id: string; bomId: string; label: string; status: string; version: string; totalCents: string; informedTotalCents: string | null; lines: Linha[] };
const linhaDe = (r: Revisao, descricao: string) => r.lines.find((l) => l.description === descricao)!;
const paraPut = (l: Linha) => ({ kind: l.kind, itemId: l.itemId, childRevisionId: l.childRevisionId, referenceCode: l.referenceCode,
  description: l.description, quantity: l.quantity, uom: l.uom, unitCost: l.unitCost, category: l.category, supplier: l.supplier,
  material: l.material, notes: l.notes });

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/api/v1/session`, { data: { username: USUARIO, password: SENHA } });
  expect(login.ok(), await login.text()).toBeTruthy();
  auth = { Authorization: `Bearer ${(await login.json()).token}` };
  // Pedido confirmado com um equipamento do modelo, vendido por R$ 120.000,00.
  const cliente = await apiPost<{ id: string; units: { id: string }[] }>(request, '/api/v1/customers',
    { legalName: `Fecularia E2E10 ${SUFIXO} Ltda.`, units: [{ name: 'Matriz', city: 'Assis', state: 'SP' }] },
    { 'Idempotency-Key': `e2e10-${SUFIXO}-cli` });
  const pedido = await apiPost<{ id: string }>(request, '/api/v1/sales-orders', {
    customerId: cliente.id, unitId: cliente.units[0].id, contractDate: '2026-09-10',
    lines: [{ kind: 'EQUIPAMENTO', description: PRODUTO, quantity: '1', unitPrice: '120000.00' }],
    installments: [{ dueDate: '2026-12-10', amountCents: '12000000' }],
  }, { 'Idempotency-Key': `e2e10-${SUFIXO}-ped` });
  const conf = await request.post(`${API}/api/v1/sales-orders/${pedido.id}/confirmations`,
    { headers: { ...auth, 'If-Match': '"1"', 'Idempotency-Key': `e2e10-${SUFIXO}-conf` } });
  expect(conf.ok(), await conf.text()).toBeTruthy();
  const eqs = await apiGet<{ id: string; code: string; projectId: string; model: string }[]>(request, `/api/v1/equipment?search=${encodeURIComponent(SUFIXO)}`);
  expect(eqs).toHaveLength(1);
  equipamento = { id: eqs[0].id, code: eqs[0].code };
  projeto = eqs[0].projectId;
});

test('BOM real importada, aprovada com as submontagens, aplicada ao equipamento, ajustada e com a margem do projeto', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Engenharia → BOM — composição de custos → Importar BOM com o arquivo real (só o nome do produto muda por execução).
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await gaveta.getByRole('button', { name: 'Engenharia', exact: true }).click();
  await gaveta.getByRole('button', { name: /BOM — composição de custos/ }).click();
  const lista = page.getByRole('dialog', { name: 'BOM — composição de custos', exact: true });
  await lista.getByRole('button', { name: 'Importar BOM' }).click();
  const importar = page.getByRole('dialog', { name: 'Importar BOM', exact: true });
  const original = JSON.parse(readFileSync(join(__dirname, '../../../docs/scrum/sprints/exemplos/bom-balanca-hidrostatica-rev00.json'), 'utf8'));
  original.produto = PRODUTO;
  await importar.getByLabel('Arquivo da BOM (JSON)').setInputFiles({
    name: 'BOM_Renda_Mecanica_Eletrica.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original, null, 2)),
  });
  await expect(importar.getByLabel('Linhas', { exact: true })).toHaveValue('203');
  await expect(importar.getByLabel('Soma das linhas')).toHaveValue('R$ 69.398,51');
  await expect(importar.getByLabel('Total informado no arquivo')).toHaveValue('R$ 69.398,51');
  await expect(importar.getByRole('list', { name: 'Problemas da carga' })).toContainText('Elétrica 38 — Suporte 45° para Trilho DIN: sem quantidade');
  await expect(importar.getByRole('table', { name: 'Submontagens da carga' })).toContainText('Painel elétrico');
  await foto(page, '01-previa');
  await importar.getByRole('button', { name: 'Confirmar carga' }).click();

  // A revisão 00 do modelo abre em rascunho, com o total parcial (uma linha sem quantidade).
  const revisoes = page.getByRole('dialog', { name: 'Revisão da BOM', exact: true });
  const modelo = revisoes.filter({ hasText: `Mecânica — ${PRODUTO}` });
  await expect(modelo.getByLabel('Total da revisão')).toHaveValue('R$ 69.398,51');
  await expect(modelo.getByLabel('Pendências')).toHaveValue('1 linha');
  await modelo.getByRole('link', { name: `Abrir submontagem Elétrica — ${PRODUTO} rev. 00` }).click();
  const eletrica = revisoes.filter({ hasText: 'Sensor Magnético de Segurança' });
  await eletrica.getByRole('link', { name: `Abrir submontagem Painel elétrico — ${PRODUTO} rev. 00` }).click();
  const painel = revisoes.filter({ hasText: 'Suporte 45° para Trilho DIN' });
  await painel.getByRole('cell', { name: 'Suporte 45° para Trilho DIN' }).click();
  await painel.getByRole('button', { name: 'Alterar linha' }).click();
  const alterar = page.getByRole('alertdialog', { name: 'Alterar linha' });
  await alterar.getByLabel('Quantidade').fill('1');
  await alterar.getByRole('button', { name: 'Atualizar' }).click();
  await expect(alterar).toBeHidden();
  await expect(painel.getByLabel('Total da revisão')).toHaveValue('R$ 29.139,11');
  await expect(painel.getByLabel('Pendências')).toHaveValue('Nenhuma');
  await foto(page, '02-painel');

  // Aprovar a BOM do modelo aprova junto Mecânica, Elétrica e Painel elétrico.
  await modelo.click({ position: { x: 200, y: 12 } });
  await modelo.getByRole('button', { name: 'Aprovar revisão' }).click();
  await page.getByRole('alertdialog', { name: 'Aprovar revisão' }).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(modelo.getByText('Aprovada', { exact: true }).first()).toBeVisible();
  const boms = await apiGet<{ id: string; code: string; name: string; approved: { id: string; totalCents: string } | null }[]>(request,
    `/api/v1/boms?search=${encodeURIComponent(SUFIXO)}`);
  expect(boms.map((b) => b.name).sort()).toEqual([PRODUTO, `Elétrica — ${PRODUTO}`, `Mecânica — ${PRODUTO}`, `Painel elétrico — ${PRODUTO}`].sort());
  expect(boms.every((b) => b.approved)).toBe(true);
  const bomModelo = boms.find((b) => b.name === PRODUTO)!;
  expect(bomModelo.approved!.totalCents).toBe('6940795');
  await foto(page, '03-aprovada');

  // Equipamentos → o equipamento do pedido → aba BOM → Aplicar BOM.
  await gaveta.getByRole('button', { name: 'Equipamentos', exact: true }).first().click();
  await gaveta.getByRole('button', { name: 'Equipamentos', exact: true }).nth(1).click();
  const equipamentos = page.getByRole('dialog', { name: 'Equipamentos', exact: true });
  await equipamentos.getByRole('searchbox').fill(SUFIXO);
  await equipamentos.getByRole('link', { name: `Abrir equipamento ${equipamento.code}` }).click();
  const ficha = page.getByRole('dialog', { name: 'Equipamento', exact: true });
  await expect(ficha.getByLabel('Modelo')).toHaveValue(PRODUTO);
  await ficha.getByRole('tab', { name: 'BOM' }).click();
  await ficha.getByRole('button', { name: 'Aplicar BOM' }).click();
  const aplicar = page.getByRole('alertdialog', { name: 'Aplicar BOM' });
  await expect(aplicar.getByRole('combobox', { name: 'Revisão' })).toContainText(`${PRODUTO} — rev. 00 — R$ 69.407,95`);
  await aplicar.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(ficha.getByLabel('Total do equipamento')).toHaveValue('R$ 69.407,95');

  // Retirar a pintura só deste equipamento, com motivo.
  await ficha.getByRole('table', { name: 'BOM do equipamento' }).getByRole('cell', { name: 'Pintura', exact: true }).click();
  await ficha.getByRole('button', { name: 'Retirar linha' }).click();
  const retirar = page.getByRole('alertdialog', { name: 'Retirar linha' });
  await retirar.getByLabel('Motivo').fill('Cliente pinta na própria fábrica');
  await retirar.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(ficha.getByLabel('Total do equipamento')).toHaveValue('R$ 68.007,95');
  await expect(ficha.getByLabel('Total do modelo')).toHaveValue('R$ 69.407,95');
  await foto(page, '04-equipamento');

  // Detalhe do projeto → Custo planejado: R$ 120.000,00 − R$ 68.007,95 = R$ 51.992,05 (43,33%).
  await ficha.getByRole('tab', { name: 'Geral' }).click();
  await ficha.getByRole('link', { name: /Abrir projeto PJ\d{5}/ }).click();
  const detalhe = page.getByRole('dialog', { name: 'Detalhe do projeto', exact: true });
  await detalhe.getByRole('tab', { name: 'Custo planejado' }).click();
  await expect(detalhe.getByLabel('Custo planejado', { exact: true })).toHaveValue('R$ 68.007,95');
  await expect(detalhe.getByLabel('Margem prevista')).toHaveValue('R$ 51.992,05 (43,33%)');
  const custo = await apiGet<{ plannedCostCents: string; marginCents: string; complete: boolean }>(request, `/api/v1/projects/${projeto}/planned-cost`);
  expect(custo).toMatchObject({ plannedCostCents: '6800795', marginCents: '5199205', complete: true });
  await foto(page, '05-custo');

  // Revisão nova do modelo (Mecânica rev. 01 com a pintura a R$ 1.500,00), aprovada pela API: o equipamento não muda.
  const rev00 = await apiGet<Revisao>(request, `/api/v1/bom-revisions/${bomModelo.approved!.id}`);
  const mecBom = linhaDe(rev00, `Mecânica — ${PRODUTO}`).childBomId!;
  const mec1 = await apiPost<Revisao>(request, `/api/v1/boms/${mecBom}/revisions`, null, { 'Idempotency-Key': `e2e10-${SUFIXO}-mec1` });
  const linhasMec = mec1.lines.map(paraPut).map((l) => (l.description === 'Pintura' ? { ...l, unitCost: '1500' } : l));
  const put = await request.put(`${API}/api/v1/bom-revisions/${mec1.id}`, {
    headers: { ...auth, 'If-Match': `"${mec1.version}"` }, data: { informedTotalCents: mec1.informedTotalCents, notes: null, lines: linhasMec },
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  await apiPost(request, `/api/v1/bom-revisions/${mec1.id}/approval`, null);
  const mod1 = await apiPost<Revisao>(request, `/api/v1/boms/${bomModelo.id}/revisions`, null, { 'Idempotency-Key': `e2e10-${SUFIXO}-mod1` });
  const linhasMod = mod1.lines.map(paraPut).map((l) => (l.description === `Mecânica — ${PRODUTO}` ? { ...l, childRevisionId: mec1.id } : l));
  const putMod = await request.put(`${API}/api/v1/bom-revisions/${mod1.id}`, {
    headers: { ...auth, 'If-Match': `"${mod1.version}"` }, data: { informedTotalCents: mod1.informedTotalCents, notes: null, lines: linhasMod },
  });
  expect(putMod.ok(), await putMod.text()).toBeTruthy();
  const aprovada = await apiPost<Revisao>(request, `/api/v1/bom-revisions/${mod1.id}/approval`, null);
  expect(aprovada).toMatchObject({ label: '01', status: 'APPROVED', totalCents: '6950795' });
  const doEquipamento = await apiGet<{ revisionLabel: string; revisionStatus: string; totalCents: string }>(request, `/api/v1/equipment/${equipamento.id}/bom`);
  expect(doEquipamento).toMatchObject({ revisionLabel: '00', revisionStatus: 'SUPERSEDED', totalCents: '6800795' });

  // Na tela, pela lista de BOMs: a BOM do modelo abre na revisão 01, comparada com a 00 — a Mecânica mudou de revisão, + R$ 100,00.
  await lista.click({ position: { x: 300, y: 12 } });
  const recarregada = page.waitForResponse((r) => r.url().includes('/api/v1/boms?search='));
  await lista.getByRole('searchbox').fill(SUFIXO);
  await recarregada;
  await expect(lista.getByRole('row').filter({ hasText: bomModelo.code })).toContainText('69.507,95');
  await lista.getByRole('link', { name: `Abrir BOM ${bomModelo.code}` }).click();
  const rev01 = revisoes.filter({ hasText: `Mecânica — ${PRODUTO}` }).filter({ has: page.getByRole('combobox', { name: 'Revisão', exact: true }).filter({ hasText: '01 — Aprovada' }) });
  await rev01.getByRole('combobox', { name: 'Comparar com' }).click();
  await page.getByRole('listbox').getByRole('option', { name: /^00 — Substituída/ }).click();
  const comparacao = rev01.getByRole('table', { name: 'Comparação das revisões' });
  await expect(comparacao).toContainText(`Mecânica — ${PRODUTO} (rev. 00 → 01)`);
  await expect(rev01.getByText(/diferença R\$ 100,00/)).toBeVisible();
  await foto(page, '06-comparacao');
});
