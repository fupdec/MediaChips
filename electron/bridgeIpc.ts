import {ipcMain, type BrowserWindow, type IpcMainEvent} from 'electron'

/**
 * Relays main-process → renderer fan-out channels used by backend workers /
 * other windows to poke the Vue app state.
 */
export function registerBridgeIpc(deps: {
  getMainWindow: () => BrowserWindow | null
}) {
  ipcMain.on('getItemsFromDb', async (_event: IpcMainEvent, data: unknown) => {
    deps.getMainWindow()?.webContents.send('getItemsFromDb', data)
  })
  ipcMain.on('updateVideoFrames', async (_event: IpcMainEvent, id: unknown) => {
    deps.getMainWindow()?.webContents.send('updateVideoFrames', id)
  })
  ipcMain.on('removeEntitiesFromState', async (_event: IpcMainEvent, data: unknown) => {
    deps.getMainWindow()?.webContents.send('removeEntitiesFromState', data)
  })
}
