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
  trayActive = true,
}: {
  supportsTray: boolean
  minimizeToTray: boolean
  isQuitting: boolean
  /** Must be true — never hide into a black hole without a tray icon. */
  trayActive?: boolean
}): boolean {
  return supportsTray && minimizeToTray && Boolean(trayActive) && !isQuitting
}

export function focusExistingMainWindow(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return true
}

/**
 * macOS Dock click (`app` `activate`): show a hidden/minimized main window, or
 * recreate it after the red close button destroyed it.
 */
export async function ensureMainWindowOnActivate(deps: {
  getMainWindow: () => BrowserWindow | null
  waitForBackend: (port: number, timeoutMs?: number) => Promise<void>
  getPort: () => number
  createWindow: () => void
  flushPendingMenuAction?: () => void
}): Promise<void> {
  if (focusExistingMainWindow(deps.getMainWindow())) {
    deps.flushPendingMenuAction?.()
    return
  }
  await deps.waitForBackend(deps.getPort(), 600000)
  deps.createWindow()
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
  ensureTray?: () => boolean
  hasTrayIcon?: () => boolean
  destroyPlayerWindow: () => void
  stopPlayerPlayback: () => void
  schedulePlayerWarmup: () => void
  revealMainWindow: () => void
  closeServerListener: () => void
  initAppUpdater: () => void
  getMinimizeToTray: () => boolean
  /** Optional: deliver Dock/tray menu actions queued while the window was missing. */
  flushPendingMenuAction?: () => void
  /** Optional: handle Windows Jump List / second-instance CLI actions. */
  handleJumpListAction?: (action: string) => void
  logStartup?: (message: string) => void
}): AppLifecycleController {
  let quitting = false
  let hardExitTimer: ReturnType<typeof setTimeout> | null = null

  function setIsQuitting(value: boolean) {
    quitting = value
  }

  function isQuitting() {
    return quitting
  }

  function isTrayReady() {
    return Boolean(deps.hasTrayIcon?.())
  }

  function shouldHideOnClose() {
    if (deps.getMinimizeToTray() && deps.supportsTray) {
      deps.ensureTray?.()
    }
    return shouldHideWindowOnCloseApp({
      supportsTray: deps.supportsTray,
      minimizeToTray: deps.getMinimizeToTray(),
      isQuitting: quitting,
      trayActive: isTrayReady(),
    })
  }

  function quitApp() {
    quitting = true

    // Failsafe: if cleanup hangs (Windows child kill / window destroy), still die.
    if (!hardExitTimer) {
      hardExitTimer = setTimeout(() => {
        try {
          app.exit(0)
        } catch {
          process.exit(0)
        }
      }, 2000)
      hardExitTimer.unref?.()
    }

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
    try {
      app.exit(0)
    } catch {
      process.exit(0)
    }
  }

  function handleCloseAppRequest(_event?: IpcMainEvent, payload?: unknown) {
    const forceQuit = Boolean(
      payload
      && typeof payload === 'object'
      && (payload as {force?: unknown}).force === true,
    )
    if (!forceQuit && shouldHideOnClose()) {
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
      deps.flushPendingMenuAction?.()
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
      // Dock click: show a hidden main window, or recreate after red-close destroy.
      await ensureMainWindowOnActivate({
        getMainWindow: deps.getMainWindow,
        waitForBackend: deps.waitForBackend,
        getPort: deps.getPort,
        createWindow: deps.createWindow,
        flushPendingMenuAction: deps.flushPendingMenuAction,
      })
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    // Dock Quit / Cmd+Q / app menu Quit call app.quit(), which closes windows.
    // If minimize-to-tray is on, the close handler would preventDefault+hide and
    // abort that quit — mark quitting first so hide-on-close is skipped.
    app.on('before-quit', () => {
      quitting = true
      try { deps.destroyTray() } catch (error) {
        console.warn('destroyTray during before-quit failed:', error)
      }
      try { deps.hideLoadingWindow() } catch (error) {
        console.warn('hideLoadingWindow during before-quit failed:', error)
      }
      try { deps.closeServerListener() } catch (error) {
        console.warn('closeServerListener during before-quit failed:', error)
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
