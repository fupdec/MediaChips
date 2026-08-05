import type { BrowserWindow as BrowserWindowInstance, IpcMainEvent } from 'electron'
import {
  app,
  ipcMain,
  dialog,
} from 'electron'
import os from 'os'
import path from 'path'
import { machineId } from 'node-machine-id'

import { initAppUpdater } from './electron/autoUpdater'
import { registerMediaDragIpc } from './electron/mediaDrag'
import { createAppTrayController } from './electron/appTray'
import { createAppMenuController } from './electron/appMenu'
import { createLoadingWindowController } from './electron/loadingWindow'
import { createMainWindowController } from './electron/mainWindow'
import { createPlayerWindowController } from './electron/playerWindow'
import { registerShellIpc } from './electron/shellIpc'
import { registerBridgeIpc } from './electron/bridgeIpc'
import { registerWindowChromeIpc } from './electron/windowChromeIpc'
import {
  createWindowBoundsPersistence,
  type WindowBoundsConfig,
} from './electron/windowBounds'
import {
  bindRendererLoadRetry as bindRendererLoadRetryImpl,
  buildLoadingPageUrl,
  buildRendererUrl,
  createWaitForBackend,
  createZoomController,
  sendConfigToWindow as sendConfigToWindowImpl,
} from './electron/rendererBootstrap'
import { saveConfigFile } from './app/server/configFile'

type ServerWindowConfig = {
  win?: WindowBoundsConfig
  player?: WindowBoundsConfig
  minimizeToTray?: string
}

type AppServerExports = {
  config: import('./app/types/server').ServerConfig & ServerWindowConfig
  app: import('electron').App
  listener?: { close(): void }
  resolveFilePath?: unknown
}

process.electron_app = app

if (app.isPackaged) {
  process.env.NODE_ENV = 'production'
}

// Claim the single-instance lock before starting the HTTP server so a second
// launch exits immediately instead of racing on the listen port / prompts.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.warn('MediaChips is already running. Exiting second instance.')
  process.exit(0)
}

const serverModule = require('./app/server.js') as AppServerExports & { default?: AppServerExports }
const server = (serverModule.default ?? serverModule) as AppServerExports
const serverConfig = server.config

if (process.platform === 'win32') {
  const disableGpu = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MEDIA_CHIPS_DISABLE_GPU || '').toLowerCase()
  )
  if (disableGpu) {
    app.disableHardwareAcceleration()
  }
}

const isWindows = os.type() === 'Windows_NT'
const useWinElectronFrame = isWindows

// Distinguishes an explicit quit (tray menu / File → Exit) from a window close
// that should be intercepted and turned into "hide to tray".
let isQuitting = false
// Packaged Electron builds do not set NODE_ENV=production; rely on app.isPackaged.
const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production'
const devLog = (...args: unknown[]) => {
  if (isDevelopment) console.log(...args)
}
// Vite is opt-in so `npx electron .` serves the built UI from the embedded backend.
const useViteDevServer = isDevelopment && process.env.MEDIA_CHIPS_VITE_DEV === '1'

const waitForBackend = createWaitForBackend({
  getPort: () => serverConfig.port,
})

function getElectronConfigPath(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config.json')
  }
  return path.join(app.getPath('userData'), 'config.json')
}

const {
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
} = createWindowBoundsPersistence({
  getStore: () => serverConfig,
  getConfigPath: getElectronConfigPath,
  saveConfig: (configPath) => {
    saveConfigFile(configPath, serverConfig)
  },
})

const getRendererUrl = (search = '') => {
  const port = useViteDevServer
    ? Number(process.env.VITE_DEV_SERVER_PORT || 3000)
    : serverConfig.port
  return buildRendererUrl({port, search})
}

const getLoadingPageUrl = () => buildLoadingPageUrl({
  appRoot: path.join(__dirname),
  useViteDevServer,
})

const {bindZoomChangedListener, setWebContentsZoomFactor} = createZoomController()

const sendConfigToWindow = (browserWindow: BrowserWindowInstance) => {
  sendConfigToWindowImpl(browserWindow, server.config)
}

const bindRendererLoadRetry = (
  webContents: Electron.WebContents,
  getUrl: () => string,
) => {
  bindRendererLoadRetryImpl(webContents, getUrl, {
    useViteDevServer,
    waitForBackend,
    getPort: () => serverConfig.port,
  })
}

const loadingWindow = createLoadingWindowController({
  getMainWindow: () => mainWindow.getWindow(),
  getLoadingPageUrl,
  getAppRoot: () => path.join(__dirname),
  onReadyLog: () => { devLog('App ready') },
})

const {
  createLoadingWindow,
  revealMainWindow,
  bindMainWindowLoadedHandler,
} = loadingWindow

const mainWindow = createMainWindowController({
  isWindows,
  useWinElectronFrame,
  isDevelopment,
  getAppRoot: () => path.join(__dirname),
  getRendererUrl,
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
  bindRendererLoadRetry,
  sendConfigToWindow,
  bindZoomChangedListener,
  isMaximizedPreferred: () => Boolean(serverConfig.win?.maximized),
  shouldHideOnClose: () => isWindows && appTray.getMinimizeToTray() && !isQuitting,
  resetRevealState: () => loadingWindow.resetRevealState(),
  bindMainWindowLoadedHandler,
  waitForBackend,
  getBackendPort: () => serverConfig.port,
})

const {createWindow, showMainWindow} = mainWindow

const appTray = createAppTrayController({
  isWindows,
  getMainWindow: () => mainWindow.getWindow(),
  showMainWindow: () => showMainWindow(),
  quitApp: () => quitApp(),
  setIsQuitting: (value) => { isQuitting = value },
  getAppRoot: () => path.join(__dirname),
})
appTray.registerIpc()

const playerWindow = createPlayerWindowController({
  isWindows,
  getAppRoot: () => path.join(__dirname),
  getRendererUrl,
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
  bindRendererLoadRetry,
  sendConfigToWindow,
  bindZoomChangedListener,
  isPlayerMaximizedPreferred: () => Boolean(serverConfig.player?.maximized),
  isMainWindowRevealed: () => loadingWindow.isMainWindowRevealed(),
})
playerWindow.registerIpc()

ipcMain.handle('get-config', () => server.config)

ipcMain.handle('get-machine-id', async () => machineId())

registerWindowChromeIpc({
  getMainWindow: () => mainWindow.getWindow(),
  getPlayerWindow: () => playerWindow.getWindow(),
  focusMainWindow: () => {
    const win = mainWindow.getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  },
  setWebContentsZoomFactor,
})
registerShellIpc({ log: devLog })
registerMediaDragIpc()
registerBridgeIpc({ getMainWindow: () => mainWindow.getWindow() })

app.on('second-instance', () => {
  const win = mainWindow.getWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

app.on('ready', async () => {
  // Wait for the API before any UI chrome. The port-in-use prompt may run first;
  // showing the splash behind it left a stuck logo with no main window.
  await waitForBackend(serverConfig.port, 600000)

  createLoadingWindow()
  createWindow()

  // config.json is the source of truth for the tray preference. Initialize the
  // in-memory flag and create the tray icon before the renderer has loaded.
  if (isWindows && serverConfig.minimizeToTray === '1') {
    appTray.setMinimizeToTray(true)
  }

  initAppUpdater({getWindow: () => mainWindow.getWindow()})
})

app.on("activate", async () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow.getWindow() === null) {
    await waitForBackend(serverConfig.port, 600000)
    createWindow()
  }
});

function quitApp() {
  isQuitting = true
  appTray.destroyTray()
  playerWindow.destroyPlayerWindow()
  const win = mainWindow.getWindow()
  if (win && !win.isDestroyed()) {
    win.close()
  }
  if (server.listener) {
    server.listener.close()
  }
  app.quit()
}

// window events from render process. When "minimize to tray" is enabled on
// Windows, the in-app close button hides the window instead of quitting.
function handleCloseAppRequest() {
  if (isWindows && appTray.getMinimizeToTray() && !isQuitting) {
    const win = mainWindow.getWindow()
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  quitApp()
}

ipcMain.on('closeApp', handleCloseAppRequest)

app.on('window-all-closed', () => {
  if (process.platform !== "darwin") // close if not macOS
    app.quit();
});

function lockApp() {
  mainWindow.getWindow()?.webContents.send('lockApp')
  playerWindow.stopPlayerPlayback()
}

createAppMenuController({
  getMainWindow: () => mainWindow.getWindow(),
  onLock: () => lockApp(),
}).install()

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    // Port conflicts are normally handled during server startup with a native
    // port-input dialog. This is only a last-resort safety net.
    const port = serverConfig.port || 12321
    dialog.showErrorBox('Startup Error',
      `Port ${port} is already in use.\n\n` +
      `Please close other applications using this port and restart the application.`
    );
    app.quit();
  } else {
    console.error('Uncaught Exception:', error);
  }
});

ipcMain.on('main-app-ready', (event: IpcMainEvent) => {
  const win = mainWindow.getWindow()
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return
  revealMainWindow()
  playerWindow.schedulePlayerWarmup()
})
