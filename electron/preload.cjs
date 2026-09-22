const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendUrl: () => ipcRenderer.invoke('backend:getUrl'),
  getBackendStatus: () => ipcRenderer.invoke('backend:getStatus'),
  onBackendReady: (cb) => ipcRenderer.on('backend:ready', (_e, url) => cb(url))
});
