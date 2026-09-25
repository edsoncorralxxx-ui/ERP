import { contextBridge, ipcRenderer } from 'electron';

// Ponte mínima: o renderer só pode fazer requisições à API (validadas no processo principal) e ler informações do app.
contextBridge.exposeInMainWorld('renda', {
  request: (req: unknown) => ipcRenderer.invoke('api:request', req),
  info: () => ipcRenderer.invoke('app:info'),
});
