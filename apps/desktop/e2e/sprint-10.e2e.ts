import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { abrirMenu } from './menu';

/**
 * Sprint 10 — "Como verificar" (com os ajustes da Review de 02/10/2026: BOM única editável, árvore e diagrama): a BOM real
 * da Balança Hidrostática (rev. 00) entra pela tela Importar BOM, com a prévia de 203 linhas, R$ 69.398,51 e a linha sem
 * quantidade; a janela da BOM abre com a árvore da estrutura; escolhido o Painel elétrico na árvore, a quantidade do
 * Suporte 45° é informada e o total do modelo muda na hora; o diagrama mostra a estrutura; aplicada ao equipamento de um
 * pedido, uma linha é retirada só nele; o Detalhe do projeto mostra o custo planejado e a margem (conferidos pela API);
 * a Mecânica muda (pintura a R$ 1.500,00) e o equipamento só muda ao reaplicar, com motivo. O produto leva um sufixo por
 * execução, para rodar de novo no mesmo banco.
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

type Linha = { kind: string; itemId: string | null; childBomId: string | null; referenceCode: string | null; description: string;
  quantity: string | null; uom: string; unitCost: string | null; category: string | null; supplier: string | null; material: string | null;
  notes: string | null };
type Bom = { id: string; code: string; name: string; version: string; totalCents: string; pending: number; informedTotalCents: string | null;
  notes: string | null; lines: Linha[] };
const paraPut = (l: Linha) => ({ kind: l.kind, itemId: l.itemId, childBomId: l.childBomId, referenceCode: l.referenceCode,
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

test('BOM real importada, editada na árvore, com diagrama, aplicada ao equipamento, ajustada, reaplicada e com a margem do projeto', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('menubar', { name: 'Menu principal' })).toBeVisible();

  // Engenharia → BOM — composição de custos → Importar BOM com o arquivo real (só o nome do produto muda por execução).
  const gaveta = page.getByRole('complementary', { name: 'Módulos' });
  await abrirMenu(page, 'Engenharia', 'BOM');
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

  // A BOM do modelo abre com a árvore: Balança → Mecânica e Elétrica → Painel elétrico; total parcial (uma linha sem quantidade).
  const janela = page.getByRole('dialog', { name: 'BOM', exact: true }).filter({ hasText: `Mecânica — ${PRODUTO}` });
  const arvore = janela.getByRole('tree', { name: 'Estrutura da BOM' });
  await expect(arvore.getByRole('treeitem')).toHaveCount(4);
  await expect(janela.getByLabel('Total da BOM')).toHaveValue('R$ 69.398,51');
  await expect(janela.getByLabel('Pendências')).toHaveValue('1 linha');
  await foto(page, '02-arvore');

  // Painel elétrico escolhido na árvore: a quantidade do Suporte 45° é informada e o total do modelo muda na hora.
  await arvore.getByRole('treeitem', { name: new RegExp(`Painel elétrico — ${PRODUTO}`) }).click();
  await expect(janela.getByLabel('BOM', { exact: true })).toHaveValue(new RegExp(`Painel elétrico — ${PRODUTO}$`));
  await janela.getByRole('cell', { name: 'Suporte 45° para Trilho DIN' }).click();
  await janela.getByRole('button', { name: 'Alterar linha' }).click();
  const alterar = page.getByRole('alertdialog', { name: 'Alterar linha' });
  await alterar.getByLabel('Quantidade').fill('1');
  await alterar.getByRole('button', { name: 'Atualizar' }).click();
  await expect(alterar).toBeHidden();
  await expect(janela.getByLabel('Total da BOM')).toHaveValue('R$ 29.139,11');
  await expect(janela.getByLabel('Pendências')).toHaveValue('Nenhuma');
  await expect(janela.getByRole('region', { name: 'Estrutura' })).toContainText('R$ 69.407,95');
  await expect(janela.getByText('Estrutura completa: pode ser aplicada aos equipamentos.')).toBeVisible();
  await foto(page, '03-painel');

  // Diagrama em árvore da estrutura (sem gráficos 3D).
  await janela.getByRole('tab', { name: 'Diagrama' }).click();
  const diagrama = janela.getByRole('tree', { name: 'Diagrama da estrutura' });
  await expect(diagrama.getByRole('treeitem')).toHaveCount(4);
  await expect(diagrama.getByRole('treeitem', { name: new RegExp(`^${PRODUTO}, R\\$ 69\\.407,95$`) })).toBeVisible();
  await foto(page, '04-diagrama');

  const boms = await apiGet<{ id: string; code: string; name: string; totalCents: string; pending: number }[]>(request,
    `/api/v1/boms?search=${encodeURIComponent(SUFIXO)}`);
  expect(boms.map((b) => b.name).sort()).toEqual([PRODUTO, `Elétrica — ${PRODUTO}`, `Mecânica — ${PRODUTO}`, `Painel elétrico — ${PRODUTO}`].sort());
  const bomModelo = boms.find((b) => b.name === PRODUTO)!;
  expect(bomModelo).toMatchObject({ totalCents: '6940795', pending: 0 });

  // Equipamentos → o equipamento do pedido → aba BOM → Aplicar BOM.
  await abrirMenu(page, 'Equipamentos', 'Equipamentos Vendidos');
  const equipamentos = page.getByRole('dialog', { name: 'Equipamentos', exact: true });
  await equipamentos.getByRole('searchbox').fill(SUFIXO);
  await equipamentos.getByRole('link', { name: `Abrir equipamento ${equipamento.code}` }).click();
  const ficha = page.getByRole('dialog', { name: 'Equipamento', exact: true });
  await expect(ficha.getByLabel('Modelo')).toHaveValue(PRODUTO);
  await ficha.getByRole('tab', { name: 'BOM' }).click();
  await ficha.getByRole('button', { name: 'Aplicar BOM' }).click();
  const aplicar = page.getByRole('alertdialog', { name: 'Aplicar BOM' });
  await expect(aplicar.getByRole('combobox', { name: 'BOM' })).toContainText(`${PRODUTO} — R$ 69.407,95`);
  await aplicar.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(ficha.getByLabel('Total do equipamento')).toHaveValue('R$ 69.407,95');

  // Retirar a pintura só deste equipamento, com motivo.
  await ficha.getByRole('table', { name: 'BOM do equipamento' }).getByRole('cell', { name: 'Pintura', exact: true }).click();
  await ficha.getByRole('button', { name: 'Retirar linha' }).click();
  const retirar = page.getByRole('alertdialog', { name: 'Retirar linha' });
  await retirar.getByLabel('Motivo').fill('Cliente pinta na própria fábrica');
  await retirar.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(ficha.getByLabel('Total do equipamento')).toHaveValue('R$ 68.007,95');
  await expect(ficha.getByLabel('Total atual do modelo')).toHaveValue('R$ 69.407,95');
  await foto(page, '05-equipamento');

  // Detalhe do projeto → Custo planejado: R$ 120.000,00 − R$ 68.007,95 = R$ 51.992,05 (43,33%).
  await ficha.getByRole('tab', { name: 'Geral' }).click();
  await ficha.getByRole('link', { name: /Abrir projeto PJ\d{5}/ }).click();
  const detalhe = page.getByRole('dialog', { name: 'Detalhe do projeto', exact: true });
  await detalhe.getByRole('tab', { name: 'Custo planejado' }).click();
  await expect(detalhe.getByLabel('Custo planejado', { exact: true })).toHaveValue('R$ 68.007,95');
  await expect(detalhe.getByLabel('Margem prevista')).toHaveValue('R$ 51.992,05 (43,33%)');
  const custo = await apiGet<{ plannedCostCents: string; marginCents: string; complete: boolean }>(request, `/api/v1/projects/${projeto}/planned-cost`);
  expect(custo).toMatchObject({ plannedCostCents: '6800795', marginCents: '5199205', complete: true });
  await foto(page, '06-custo');

  // A Mecânica muda pela API (pintura a R$ 1.500,00): o modelo passa a R$ 69.507,95 e o equipamento não muda até reaplicar.
  const mecanica = boms.find((b) => b.name === `Mecânica — ${PRODUTO}`)!;
  const mec = await apiGet<Bom>(request, `/api/v1/boms/${mecanica.id}`);
  const put = await request.put(`${API}/api/v1/boms/${mec.id}`, {
    headers: { ...auth, 'If-Match': `"${mec.version}"` },
    data: { informedTotalCents: mec.informedTotalCents, notes: mec.notes, lines: mec.lines.map(paraPut).map((l) => (l.description === 'Pintura' ? { ...l, unitCost: '1500' } : l)) },
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  expect((await apiGet<Bom>(request, `/api/v1/boms/${bomModelo.id}`)).totalCents).toBe('6950795');
  expect(await apiGet<{ totalCents: string; modelChanged: boolean }>(request, `/api/v1/equipment/${equipamento.id}/bom`))
    .toMatchObject({ totalCents: '6800795', modelChanged: true });

  // Na ficha do equipamento, o aviso aparece e Reaplicar BOM (com motivo) traz o conteúdo atual, sem os ajustes.
  await ficha.click({ position: { x: 300, y: 12 } });
  await ficha.getByRole('tab', { name: 'BOM' }).click();
  const aviso = ficha.getByRole('note').filter({ hasText: 'A BOM do modelo mudou depois de aplicada' });
  await expect(aviso).toContainText('total atual R$ 69.507,95');
  await aviso.getByRole('button', { name: 'Reaplicar BOM' }).click();
  const reaplicar = page.getByRole('alertdialog', { name: 'Reaplicar BOM' });
  await reaplicar.getByLabel('Motivo').fill('Pintura reajustada pelo fornecedor');
  await reaplicar.getByRole('button', { name: 'Reaplicar', exact: true }).click();
  await expect(ficha.getByLabel('Total do equipamento')).toHaveValue('R$ 69.507,95');
  await expect(aviso).toBeHidden();
  await foto(page, '07-reaplicada');
});
