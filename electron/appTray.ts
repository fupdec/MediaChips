import fs from 'fs'
import path from 'path'
import {
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'

export type AppTrayController = {
  createTray: () => void
  destroyTray: () => void
  getMinimizeToTray: () => boolean
  setMinimizeToTray: (enabled: boolean) => boolean
  registerIpc: () => void
}

export function createAppTrayController(deps: {
  isWindows: boolean
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => void
  quitApp: () => void
  setIsQuitting: (value: boolean) => void
  /** Directory that contains `dist/icons` (usually project root). */
  getAppRoot: () => string
}): AppTrayController {
  let tray: Tray | null = null
  let minimizeToTray = false

  function createTray() {
    if (tray || !deps.isWindows) return

    try {
      // Prefer the multi-size .ico (16/32/48) so Windows can pick the crispest
      // variant for the current DPI; fall back to the PNG if it is missing.
      const iconDir = path.join(deps.getAppRoot(), 'dist/icons')
      const icoPath = path.join(iconDir, 'favicon.ico')
      const pngPath = path.join(iconDir, 'icon.png')
      const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath
      const image = nativeImage.createFromPath(iconPath)
      tray = new Tray(image.isEmpty() ? iconPath : image)
      tray.setToolTip('MediaChips')
      tray.setContextMenu(Menu.buildFromTemplate([
        {label: 'Open MediaChips', click: () => deps.showMainWindow()},
        {type: 'separator'},
        {label: 'Exit', click: () => {
          deps.setIsQuitting(true)
          deps.quitApp()
        }},
      ]))
      tray.on('click', () => {
        const win = deps.getMainWindow()
        if (win && !win.isDestroyed() && win.isVisible()) {
          win.hide()
        } else {
          deps.showMainWindow()
        }
      })
      tray.on('double-click', () => deps.showMainWindow())
    } catch (error) {
      console.warn('Failed to create tray icon:', error)
      tray = null
    }
  }

  function destroyTray() {
    if (tray) {
      tray.destroy()
      tray = null
    }
  }

  function setMinimizeToTray(enabled: boolean) {
    minimizeToTray = Boolean(enabled)

    if (!deps.isWindows) return minimizeToTray

    if (minimizeToTray) {
      createTray()
    } else {
      destroyTray()
      // Without a tray icon a hidden window would be unreachable, so restore it.
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed() && !win.isVisible()) {
        win.show()
      }
    }

    return minimizeToTray
  }

  function registerIpc() {
    ipcMain.handle('set-minimize-to-tray', (_event: IpcMainInvokeEvent, enabled: unknown) => {
      return setMinimizeToTray(Boolean(enabled))
    })
  }

  return {
    createTray,
    destroyTray,
    getMinimizeToTray: () => minimizeToTray,
    setMinimizeToTray,
    registerIpc,
  }
}
