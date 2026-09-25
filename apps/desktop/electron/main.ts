import { app, BrowserWindow, ipcMain, Menu, net, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Processo principal do Renda+ ERP.
 * Segurança (plano funcional §4): renderer sem Node, isolamento de contexto, sandbox, navegação bloqueada
 * e ponte nativa mínima com validação das mensagens. O renderer nunca acessa a rede diretamente.
 */

const DEFAULT_SERVER_URL = 'http://localhost:8080';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_HEADERS = new Set(['if-match', 'idempotency-key', 'content-type', 'x-correlation-id']);
const MAX_BODY = 1_000_000;

function serverUrl(): string {
  const fromEnv = process.env.RENDA_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const configFile = path.join(app.getPath('userData'), 'config.json');
  if (existsSync(configFile)) {
    try {
      const cfg = JSON.parse(readFileSync(configFile, 'utf8')) as { serverUrl?: string };
      if (cfg.serverUrl && /^https?:\/\/[^\s]+$/.test(cfg.serverUrl)) return cfg.serverUrl.replace(/\/$/, '');
    } catch {
      // configuração inválida: usa o padrão
    }
  }
  return DEFAULT_SERVER_URL;
}

type ApiRequest = { method: string; path: string; headers?: Record<string, string>; body?: string };

function validate(req: unknown): ApiRequest {
  if (typeof req !== 'object' || req === null) throw new Error('Requisição inválida');
  const r = req as Record<string, unknown>;
  const method = String(r.method ?? '').toUpperCase();
  const reqPath = String(r.path ?? '');
  if (!ALLOWED_METHODS.has(method)) throw new Error('Método não permitido');
  if (!/^\/api\/v1\/[A-Za-z0-9\-/_?=&.%]*$/.test(reqPath) || reqPath.includes('..')) throw new Error('Caminho não permitido');
  const headers: Record<string, string> = {};
  if (r.headers && typeof r.headers === 'object') {
    for (const [k, v] of Object.entries(r.headers as Record<string, unknown>)) {
      if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === 'string' && v.length < 200) headers[k] = v;
    }
  }
  const body = r.body === undefined ? undefined : String(r.body);
  if (body && body.length > MAX_BODY) throw new Error('Corpo muito grande');
  return { method, path: reqPath, headers, body };
}

ipcMain.handle('api:request', async (_event, raw: unknown) => {
  const req = validate(raw);
  const response = await net.fetch(serverUrl() + req.path, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(15_000),
  });
  const headers: Record<string, string> = {};
  for (const name of ['etag', 'content-type', 'x-correlation-id']) {
    const v = response.headers.get(name);
    if (v) headers[name] = v;
  }
  return { status: response.status, headers, body: await response.text() };
});

ipcMain.handle('app:info', () => ({ version: app.getVersion(), serverUrl: serverUrl(), platform: process.platform }));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Renda+ ERP',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', label: 'Renda+ ERP' },
    { role: 'editMenu', label: 'Editar' },
    { role: 'windowMenu', label: 'Janela' },
  ]));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
