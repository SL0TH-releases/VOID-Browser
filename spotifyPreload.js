const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('voidSpotify', {
  get: () => ipcRenderer.invoke('spotify-get'),
  add: (title, link) => ipcRenderer.send('spotify-add', title, link),
  remove: id => ipcRenderer.send('spotify-remove', id),
  onLib: f => ipcRenderer.on('spotify-lib', (_, l) => f(l)),
  hide: () => ipcRenderer.send('spotify-hide'),
  login: () => ipcRenderer.send('spotify-login'),
  onLoginDone: f => ipcRenderer.on('spotify-login-done', () => f()),
  getMusic: () => ipcRenderer.invoke('music-get'),
  pickMusic: () => ipcRenderer.invoke('music-pick'),
  removeMusic: id => ipcRenderer.send('music-remove', id),
  onMusic: f => ipcRenderer.on('music-lib', (_, l) => f(l)),
});
