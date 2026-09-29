const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('voidApi', {
  cmd: (c, a) => ipcRenderer.send('cmd', c, a),
  onState: f => ipcRenderer.on('state', (_, s) => f(s)),
  onFocusUrl: f => ipcRenderer.on('focus-url', () => f()),
  onNotice: f => ipcRenderer.on('notice', (_, message) => f(message)),
});
