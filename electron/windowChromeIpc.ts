import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import {emitMainWindowUserFacingState, isBrowserWindowUserFacing} from './windowFocus'

export {emitMainWindowUserFacingState, isBrowserWindowUserFacing}

export function registerWindowChromeIpc(deps: {
  getMainWindow: () => BrowserWindow | null
  getPlayerWindow: () => BrowserWindow | null
  focusMainWindow: () => void
  setWebContentsZoomFactor: (webContents: Electron.WebContents, factor: unknown) => number
}) {
  ipcMain.handle('setZoomFactor', (event: IpcMainInvokeEvent, factor: unknown) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow || browserWindow.isDestroyed()) return 1
    return deps.setWebContentsZoomFactor(browserWindow.webContents, factor)
  })

  ipcMain.handle('getZoomFactor', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow || browserWindow.isDestroyed()) return 1
    return browserWindow.webContents.getZoomFactor()
  })

  ipcMain.handle('toggleDevTools', () => {
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.toggleDevTools()
    }
  })

  ipcMain.handle('maximize', (_event: IpcMainInvokeEvent, args: unknown) => {
    if (args === 'player') {
      deps.getPlayerWindow()?.maximize()
    } else {
      deps.getMainWindow()?.maximize()
    }
  })

  ipcMain.handle('unmaximize', (_event: IpcMainInvokeEvent, args: unknown) => {
    if (args === 'player') {
      deps.getPlayerWindow()?.unmaximize()
    } else {
      deps.getMainWindow()?.unmaximize()
    }
  })

  ipcMain.handle('minimize', (_event: IpcMainInvokeEvent, args: unknown) => {
    if (args === 'player') {
      deps.getPlayerWindow()?.minimize()
    } else {
      deps.getMainWindow()?.minimize()
    }
  })

  ipcMain.handle('focusMainWindow', () => {
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed()) return false
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return true
  })

  ipcMain.handle('isMainWindowFocused', () => {
    return isBrowserWindowUserFacing(deps.getMainWindow())
  })

  ipcMain.handle('showOsNotification', (_event: IpcMainInvokeEvent, raw: unknown) => {
    const payload = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const title = String(payload.title || '').trim() || 'MediaChips'
    const body = String(payload.body || '').trim()
    const silent = Boolean(payload.silent)

    if (!Notification.isSupported()) {
      return {success: false, supported: false, error: 'Notifications are not supported'}
    }

    try {
      const notification = new Notification({
        title,
        body,
        silent,
      })
      const revealPath = String(payload.revealPath || '').trim()
      notification.on('click', () => {
        deps.focusMainWindow()
        if (revealPath) {
          try {
            shell.showItemInFolder(revealPath)
          } catch (error) {
            console.warn('Failed to reveal exported file from OS notification:', error)
          }
        }
      })
      notification.show()
      return {success: true, supported: true}
    } catch (error) {
      return {
        success: false,
        supported: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle('setDockBadge', (_event: IpcMainInvokeEvent, raw: unknown) => {
    const count = typeof raw === 'number'
      ? raw
      : Number((raw as {count?: unknown} | null)?.count ?? 0)
    const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0

    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(normalized > 0 ? String(normalized) : '')
      return true
    }

    // Windows overlay badge is limited; keep API no-op success so renderer can call unconditionally.
    return true
  })

  ipcMain.handle('setProgressBar', (_event: IpcMainInvokeEvent, raw: unknown) => {
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed()) return false

    let value: number | null = null
    if (typeof raw === 'number') {
      value = raw
    } else if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
      const next = (raw as {value: unknown}).value
      value = next == null ? null : Number(next)
    }

    if (value == null || !Number.isFinite(value) || value < 0) {
      win.setProgressBar(-1)
      return true
    }

    win.setProgressBar(Math.min(1, Math.max(0, value)))
    return true
  })

  ipcMain.handle('relaunch', () => {
    app.relaunch()
    app.exit()
  })

  ipcMain.handle('toggleMainFullscreen', () => {
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed()) return false
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })

  ipcMain.handle('isMainFullscreen', () => {
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed()) return false
    return win.isFullScreen()
  })
}
