import type { BrowserWindow as BrowserWindowInstance } from 'electron'
import { app, powerMonitor } from 'electron'
import os from 'os'
import path from 'path'

import { initAppUpdater } from './electron/autoUpdater'
import { registerMediaDragIpc } from './electron/mediaDrag'
import {
  createAppTrayController,
  isTraySupportedPlatform,
} from './electron/appTray'
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
import {
  createServerProcessSupervisor,
  resolveElectronDataDir,
} from './electron/serverProcess'
import {
  createDefaultConfig,
  loadConfigFile,
  saveConfigFile,
  type ConfigFileRecord,
} from './app/server/configFile'
import { resolveListenPort } from './app/server/ports'

type ServerWindowConfig = {
  win?: WindowBoundsConfig
  player?: WindowBoundsConfig
  minimizeToTray?: string
}

type ShellConfig = ConfigFileRecord & ServerWindowConfig

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

const appRoot = path.join(__dirname)
const configPath = resolveElectronConfigPath({
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  userDataPath: app.getPath('userData'),
})
const dataDir = resolveElectronDataDir({
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  userDataPath: app.getPath('userData'),
})

const loaded = loadConfigFile(configPath)
const shellConfig: ShellConfig = (loaded.config || createDefaultConfig()) as ShellConfig
shellConfig.port = resolveListenPort(shellConfig.port)

/** Renderer-facing payload from GET /api/config (preferred once the child is up). */
let apiConfigCache: Record<string, unknown> | null = null

function syncPortFromConfigFile(): number {
  const fresh = loadConfigFile(configPath).config
  if (fresh?.port != null) {
    shellConfig.port = resolveListenPort(fresh.port)
  }
  if (fresh && typeof fresh.minimizeToTray === 'string') {
    shellConfig.minimizeToTray = fresh.minimizeToTray
  }
  return resolveListenPort(shellConfig.port)
}

async function refreshApiConfigCache(): Promise<void> {
  const port = syncPortFromConfigFile()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`)
    if (!response.ok) return
    apiConfigCache = await response.json() as Record<string, unknown>
  } catch (error) {
    console.warn('Failed to refresh API config cache:', error)
  }
}

function getShellConfigForRenderer(): Record<string, unknown> {
  if (apiConfigCache) {
    return {
      ...apiConfigCache,
      win: shellConfig.win,
      player: shellConfig.player,
    }
  }
  return shellConfig as unknown as Record<string, unknown>
}

const startupStartedAt = Date.now()

const apiSupervisor = createServerProcessSupervisor({
  appRoot,
  dataDir,
  resourcesPath: process.resourcesPath,
})

try {
  apiSupervisor.start()
  console.log(`[startup] API process spawned (+${Date.now() - startupStartedAt}ms)`)
} catch (error) {
  console.error('Failed to start MediaChips API server process:', error)
  app.quit()
  process.exit(1)
}

const waitForBackendInner = createWaitForBackend({
  getPort: () => syncPortFromConfigFile(),
})

const waitForBackend = async (port: number, timeoutMs?: number) => {
  const pingStartedAt = Date.now()
  await waitForBackendInner(port, timeoutMs)
  console.log(`[startup] /api/ping ok (+${Date.now() - startupStartedAt}ms, wait ${Date.now() - pingStartedAt}ms)`)
  await refreshApiConfigCache()
}

async function isBackendReachable(timeoutMs = 2000): Promise<boolean> {
  const port = syncPortFromConfigFile()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function restartBackendAndWait(timeoutMs = 30000): Promise<boolean> {
  const ok = await apiSupervisor.restart()
  if (!ok) return false
  await waitForBackend(syncPortFromConfigFile(), timeoutMs)
  return isBackendReachable(2000)
}

async function ensureBackendAfterResume(): Promise<void> {
  if (apiSupervisor.isStopping()) return
  if (await isBackendReachable(1500)) return
  console.warn('[startup] Backend unreachable after resume; restarting API process')
  await restartBackendAndWait(20000)
}

const {
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
} = createWindowBoundsPersistence({
  getStore: () => shellConfig,
  getConfigPath: () => configPath,
  saveConfig: (targetPath) => {
    saveConfigFile(targetPath, shellConfig)
  },
})

const getRendererUrl = (search = '') => {
  const port = useViteDevServer
    ? Number(process.env.VITE_DEV_SERVER_PORT || 3000)
    : syncPortFromConfigFile()
  return buildRendererUrl({port, search})
}

const getLoadingPageUrl = () => buildLoadingPageUrl({
  appRoot,
  useViteDevServer,
})

const {bindZoomChangedListener, setWebContentsZoomFactor} = createZoomController()

const sendConfigToWindow = (browserWindow: BrowserWindowInstance) => {
  sendConfigToWindowImpl(browserWindow, getShellConfigForRenderer())
}

const bindRendererLoadRetry = (
  webContents: Electron.WebContents,
  getUrl: () => string,
) => {
  bindRendererLoadRetryImpl(webContents, getUrl, {
    useViteDevServer,
    waitForBackend,
    getPort: () => syncPortFromConfigFile(),
  })
}

const loadingWindow = createLoadingWindowController({
  getMainWindow: () => mainWindow.getWindow(),
  getLoadingPageUrl,
  getAppRoot: () => appRoot,
  onReadyLog: () => { devLog('App ready') },
})

const {
  createLoadingWindow,
  hideLoadingWindow,
  revealMainWindow,
  bindMainWindowLoadedHandler,
} = loadingWindow

const mainWindow = createMainWindowController({
  isWindows,
  useWinElectronFrame,
  isDevelopment,
  getAppRoot: () => appRoot,
  getRendererUrl,
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
  bindRendererLoadRetry,
  sendConfigToWindow,
  bindZoomChangedListener,
  isMaximizedPreferred: () => Boolean(shellConfig.win?.maximized),
  shouldHideOnClose: () => appLifecycle.shouldHideOnClose(),
  resetRevealState: () => loadingWindow.resetRevealState(),
  bindMainWindowLoadedHandler,
  waitForBackend,
  getBackendPort: () => syncPortFromConfigFile(),
})

const {createWindow, showMainWindow} = mainWindow

const appMenu = createAppMenuController({
  getMainWindow: () => mainWindow.getWindow(),
  onLock: () => appLifecycle.lockApp(),
})
appMenu.install()

const appTray = createAppTrayController({
  platform: process.platform,
  getMainWindow: () => mainWindow.getWindow(),
  showMainWindow: () => showMainWindow(),
  sendMenuAction: (action) => {
    mainWindow.getWindow()?.webContents.send('menuAction', action)
  },
  onLock: () => appLifecycle.lockApp(),
  quitApp: () => appLifecycle.quitApp(),
  setIsQuitting: (value) => { appLifecycle.setIsQuitting(value) },
  getAppRoot: () => appRoot,
  onLocaleChange: (locale) => appMenu.setLocale(locale),
})
appTray.registerIpc()
appTray.installDockMenu()
if (typeof appTray.installWindowsJumpList === 'function') {
  appTray.installWindowsJumpList()
}

const playerWindow = createPlayerWindowController({
  isWindows,
  getAppRoot: () => appRoot,
  getRendererUrl,
  readStoredWindowBounds,
  bindWindowBoundsPersistence,
  bindRendererLoadRetry,
  sendConfigToWindow,
  bindZoomChangedListener,
  isPlayerMaximizedPreferred: () => Boolean(shellConfig.player?.maximized),
  isMainWindowRevealed: () => loadingWindow.isMainWindowRevealed(),
})
playerWindow.registerIpc()

const appLifecycle = createAppLifecycleController({
  supportsTray: isTraySupportedPlatform(process.platform),
  getPort: () => syncPortFromConfigFile(),
  getConfig: () => getShellConfigForRenderer(),
  isMinimizeToTrayPreferred: () => shellConfig.minimizeToTray === '1',
  waitForBackend,
  createLoadingWindow,
  hideLoadingWindow,
  createWindow,
  getMainWindow: () => mainWindow.getWindow(),
  setMinimizeToTray: (enabled) => { appTray.setMinimizeToTray(enabled) },
  destroyTray: () => appTray.destroyTray(),
  ensureTray: () => appTray.ensureTray(),
  hasTrayIcon: () => appTray.hasTrayIcon(),
  destroyPlayerWindow: () => playerWindow.destroyPlayerWindow(),
  stopPlayerPlayback: () => playerWindow.stopPlayerPlayback(),
  schedulePlayerWarmup: () => playerWindow.schedulePlayerWarmup(),
  revealMainWindow,
  closeServerListener: () => { apiSupervisor.stop() },
  initAppUpdater: () => initAppUpdater({getWindow: () => mainWindow.getWindow()}),
  getMinimizeToTray: () => appTray.getMinimizeToTray(),
  handleJumpListAction: (action) => appTray.handleJumpListAction(action),
  logStartup: (message) => { console.log(message) },
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
  beforeRelaunch: () => { apiSupervisor.stop() },
  restartBackend: () => restartBackendAndWait(30000),
})
registerShellIpc({ log: devLog })
registerMediaDragIpc()
registerBridgeIpc({ getMainWindow: () => mainWindow.getWindow() })

powerMonitor.on('resume', () => {
  void ensureBackendAfterResume()
})

appLifecycle.register()
