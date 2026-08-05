import type { BrowserWindow as BrowserWindowInstance } from 'electron'
import { app } from 'electron'
import os from 'os'
import path from 'path'

import { initAppUpdater } from './electron/autoUpdater'
import { registerMediaDragIpc } from './electron/mediaDrag'
import { createAppTrayController } from './electron/appTray'
import { createAppMenuController } from './electron/appMenu'
import {
  createAppLifecycleController,
  resolveElectronConfigPath,
  shouldDisableHardwareAcceleration,
} from './electron/appLifecycle'
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

if (
  process.platform === 'win32'
  && shouldDisableHardwareAcceleration(process.env.MEDIA_CHIPS_DISABLE_GPU)
) {
  app.disableHardwareAcceleration()
}

const isWindows = os.type() === 'Windows_NT'
const useWinElectronFrame = isWindows

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

const {
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
} = createWindowBoundsPersistence({
  getStore: () => serverConfig,
  getConfigPath: () => resolveElectronConfigPath({
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    userDataPath: app.getPath('userData'),
  }),
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
  shouldHideOnClose: () => appLifecycle.shouldHideOnClose(),
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
  quitApp: () => appLifecycle.quitApp(),
  setIsQuitting: (value) => { appLifecycle.setIsQuitting(value) },
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

const appLifecycle = createAppLifecycleController({
  isWindows,
  getPort: () => serverConfig.port,
  getConfig: () => server.config,
  isMinimizeToTrayPreferred: () => serverConfig.minimizeToTray === '1',
  waitForBackend,
  createLoadingWindow,
  createWindow,
  getMainWindow: () => mainWindow.getWindow(),
  setMinimizeToTray: (enabled) => { appTray.setMinimizeToTray(enabled) },
  destroyTray: () => appTray.destroyTray(),
  destroyPlayerWindow: () => playerWindow.destroyPlayerWindow(),
  stopPlayerPlayback: () => playerWindow.stopPlayerPlayback(),
  schedulePlayerWarmup: () => playerWindow.schedulePlayerWarmup(),
  revealMainWindow,
  closeServerListener: () => { server.listener?.close() },
  initAppUpdater: () => initAppUpdater({getWindow: () => mainWindow.getWindow()}),
  getMinimizeToTray: () => appTray.getMinimizeToTray(),
})

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

createAppMenuController({
  getMainWindow: () => mainWindow.getWindow(),
  onLock: () => appLifecycle.lockApp(),
}).install()

appLifecycle.register()
