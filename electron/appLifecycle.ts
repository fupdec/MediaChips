import path from 'path'
import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
} from 'electron'
import {machineId} from 'node-machine-id'
import {parseJumpListAction} from './windowsJumpList'

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
  supportsTray,
  minimizeToTray,
  isQuitting,
}: {
  supportsTray: boolean
  minimizeToTray: boolean
  isQuitting: boolean
}): boolean {
  return supportsTray && minimizeToTray && !isQuitting
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
  /** Windows / macOS / Linux — platforms with a notification-area or menu-bar tray. */
  supportsTray: boolean
  getPort: () => number
  getConfig: () => unknown
  isMinimizeToTrayPreferred: () => boolean
  waitForBackend: (port: number, timeoutMs?: number) => Promise<void>
  createLoadingWindow: () => void
  hideLoadingWindow: () => void
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
  /** Optional: handle Windows Jump List / second-instance CLI actions. */
  handleJumpListAction?: (action: string) => void
  logStartup?: (message: string) => void
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
      supportsTray: deps.supportsTray,
      minimizeToTray: deps.getMinimizeToTray(),
      isQuitting: quitting,
    })
  }

  function quitApp() {
    quitting = true
    try { deps.destroyTray() } catch (error) {
      console.warn('destroyTray during quit failed:', error)
    }
    try { deps.destroyPlayerWindow() } catch (error) {
      console.warn('destroyPlayerWindow during quit failed:', error)
    }
    try { deps.hideLoadingWindow() } catch (error) {
      console.warn('hideLoadingWindow during quit failed:', error)
    }
    try { deps.closeServerListener() } catch (error) {
      console.warn('closeServerListener during quit failed:', error)
    }
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed()) {
      try {
        // destroy() bypasses the close→tray-hide handler so Exit always terminates.
        win.destroy()
      } catch (error) {
        console.warn('main window destroy during quit failed:', error)
      }
    }
    // Match Ctrl+Q / native Exit — app.quit() alone can stall if a hidden
    // player/loading window or hung child keeps the event loop alive.
    app.exit(0)
  }

  function handleCloseAppRequest(_event?: IpcMainEvent, payload?: unknown) {
    const forceQuit = Boolean(
      payload
      && typeof payload === 'object'
      && (payload as {force?: unknown}).force === true,
    )
    if (!forceQuit && shouldHideWindowOnCloseApp({
      supportsTray: deps.supportsTray,
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

    app.on('second-instance', (_event, commandLine) => {
      focusExistingMainWindow(deps.getMainWindow())
      const action = parseJumpListAction(commandLine)
      if (action) deps.handleJumpListAction?.(action)
    })

    app.on('ready', async () => {
      const readyStartedAt = Date.now()
      const log = deps.logStartup || ((message: string) => console.log(message))

      // Show splash immediately so portable cold starts are not a blank desktop.
      // Port-in-use prompts still run in the API child; hide splash if startup fails.
      deps.createLoadingWindow()
      log(`[startup] splash shown (+${Date.now() - readyStartedAt}ms)`)

      try {
        await deps.waitForBackend(deps.getPort(), 600000)
        log(`[startup] backend ready (+${Date.now() - readyStartedAt}ms)`)
        deps.createWindow()
        log(`[startup] main window created (+${Date.now() - readyStartedAt}ms)`)
      } catch (error) {
        console.error('Startup failed while waiting for backend:', error)
        deps.hideLoadingWindow()
        throw error
      }

      // config.json is the source of truth for the tray preference. Initialize the
      // in-memory flag and create the tray icon before the renderer has loaded.
      if (deps.supportsTray && deps.isMinimizeToTrayPreferred()) {
        deps.setMinimizeToTray(true)
      }

      const startupJumpAction = parseJumpListAction(process.argv)
      if (startupJumpAction) {
        deps.handleJumpListAction?.(startupJumpAction)
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
        deps.hideLoadingWindow()
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
