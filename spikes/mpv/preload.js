const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('spike', {
  command: command => ipcRenderer.send('spike:command', command),
  close: () => ipcRenderer.send('spike:close'),
  onState: callback => ipcRenderer.on('spike:state', (_event, state) => callback(state)),
  onLog: callback => ipcRenderer.on('spike:log', (_event, message) => callback(message)),
})
