import path from 'path'
import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
} from 'electron'
import {machineId} from 'node-machine-id'

export function shouldDisableHardwareAcceleration(envValue: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(envValue || '').toLowerCase())
}

export function resolveElectronConfigPath({
  portableExecutableDir,
  userDataPath,
}: {
  portableExecutableDir?: string
  userDataPath: string
}): string {
  if (portableExecutableDir) {
    return path.join(portableExecutableDir, 'config.json')
  }
  return path.join(userDataPath, 'config.json')
}

export function formatPortInUseErrorMessage(port: number): string {
  return (
    `Port ${port} is already in use.\n\n`
    + 'Please close other applications using this port and restart the application.'
  )
}

export function shouldHideWindowOnCloseApp({
  isWindows,
  minimizeToTray,
  isQuitting,
}: {
  isWindows: boolean
  minimizeToTray: boolean
  isQuitting: boolean
}): boolean {
  return isWindows && minimizeToTray && !isQuitting
}

export function focusExistingMainWindow(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return true
}

export type AppLifecycleController = {
  quitApp: () => void
  isQuitting: () => boolean
  setIsQuitting: (value: boolean) => void
  shouldHideOnClose: () => boolean
  lockApp: () => void
  register: () => void
}

export function createAppLifecycleController(deps: {
  isWindows: boolean
  getPort: () => number
  getConfig: () => unknown
  isMinimizeToTrayPreferred: () => boolean
  waitForBackend: (port: number, timeoutMs?: number) => Promise<void>
  createLoadingWindow: () => void
  createWindow: () => void
  getMainWindow: () => BrowserWindow | null
  setMinimizeToTray: (enabled: boolean) => void
  destroyTray: () => void
  destroyPlayerWindow: () => void
  stopPlayerPlayback: () => void
  schedulePlayerWarmup: () => void
  revealMainWindow: () => void
  closeServerListener: () => void
  initAppUpdater: () => void
  getMinimizeToTray: () => boolean
}): AppLifecycleController {
  let quitting = false

  function setIsQuitting(value: boolean) {
    quitting = value
  }

  function isQuitting() {
    return quitting
  }

  function shouldHideOnClose() {
    return shouldHideWindowOnCloseApp({
      isWindows: deps.isWindows,
      minimizeToTray: deps.getMinimizeToTray(),
      isQuitting: quitting,
    })
  }

  function quitApp() {
    quitting = true
    deps.destroyTray()
    deps.destroyPlayerWindow()
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.close()
    }
    deps.closeServerListener()
    app.quit()
  }

  function handleCloseAppRequest() {
    if (shouldHideWindowOnCloseApp({
      isWindows: deps.isWindows,
      minimizeToTray: deps.getMinimizeToTray(),
      isQuitting: quitting,
    })) {
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed()) win.hide()
      return
    }
    quitApp()
  }

  function lockApp() {
    deps.getMainWindow()?.webContents.send('lockApp')
    deps.stopPlayerPlayback()
  }

  function register() {
    ipcMain.handle('get-config', () => deps.getConfig())
    ipcMain.handle('get-machine-id', async () => machineId())

    ipcMain.on('closeApp', handleCloseAppRequest)

    ipcMain.on('main-app-ready', (event: IpcMainEvent) => {
      const win = deps.getMainWindow()
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return
      deps.revealMainWindow()
      deps.schedulePlayerWarmup()
    })

    app.on('second-instance', () => {
      focusExistingMainWindow(deps.getMainWindow())
    })

    app.on('ready', async () => {
      // Wait for the API before any UI chrome. The port-in-use prompt may run first;
      // showing the splash behind it left a stuck logo with no main window.
      await deps.waitForBackend(deps.getPort(), 600000)

      deps.createLoadingWindow()
      deps.createWindow()

      // config.json is the source of truth for the tray preference. Initialize the
      // in-memory flag and create the tray icon before the renderer has loaded.
      if (deps.isWindows && deps.isMinimizeToTrayPreferred()) {
        deps.setMinimizeToTray(true)
      }

      deps.initAppUpdater()
    })

    app.on('activate', async () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (deps.getMainWindow() === null) {
        await deps.waitForBackend(deps.getPort(), 600000)
        deps.createWindow()
      }
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        // Port conflicts are normally handled during server startup with a native
        // port-input dialog. This is only a last-resort safety net.
        dialog.showErrorBox('Startup Error', formatPortInUseErrorMessage(deps.getPort() || 12321))
        app.quit()
      } else {
        console.error('Uncaught Exception:', error)
      }
    })
  }

  return {
    quitApp,
    isQuitting,
    setIsQuitting,
    shouldHideOnClose,
    lockApp,
    register,
  }
}
