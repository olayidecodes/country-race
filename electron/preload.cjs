'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  startServer: (opts) => ipcRenderer.invoke('start-server', opts),
  openGame:    ()     => ipcRenderer.send('open-game'),
  openUrl:     (url)  => ipcRenderer.send('open-url', url),
  copy:        (text) => ipcRenderer.send('copy', text),
});
