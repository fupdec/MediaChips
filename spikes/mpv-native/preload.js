const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('mpv', {
  init: () => ipcRenderer.invoke('player:init'),
  rect: rect => ipcRenderer.send('player:rect', rect),
  command: command => ipcRenderer.send('player:cmd', command),
  openWindow: () => ipcRenderer.send('player:window'),
  close: () => ipcRenderer.send('player:close'),
  onEvent: callback => ipcRenderer.on('player:event', (_event, json) => callback(JSON.parse(json))),
})
