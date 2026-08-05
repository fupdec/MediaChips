import type { BrowserWindow as BrowserWindowInstance, WebContents, IpcMainEvent } from 'electron'
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { machineId } from 'node-machine-id'

import { initAppUpdater } from './electron/autoUpdater'
import { registerMediaDragIpc } from './electron/mediaDrag'
import { createAppTrayController } from './electron/appTray'
import { createAppMenuController } from './electron/appMenu'
import { createLoadingWindowController } from './electron/loadingWindow'
import { createPlayerWindowController } from './electron/playerWindow'
import { registerShellIpc } from './electron/shellIpc'
import {
  emitMainWindowUserFacingState,
  registerWindowChromeIpc,
} from './electron/windowChromeIpc'
import {
  createWindowBoundsPersistence,
  type WindowBoundsConfig,
} from './electron/windowBounds'
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

let win: BrowserWindowInstance | null = null
// Distinguishes an explicit quit (tray menu / File → Exit) from a window close
// that should be intercepted and turned into "hide to tray".
let isQuitting = false
let suppressZoomChangedEvent = false
// Packaged Electron builds do not set NODE_ENV=production; rely on app.isPackaged.
const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production'
const devLog = (...args: unknown[]) => {
  if (isDevelopment) console.log(...args)
}
// Vite is opt-in so `npx electron .` serves the built UI from the embedded backend.
const useViteDevServer = isDevelopment && process.env.MEDIA_CHIPS_VITE_DEV === '1'

const waitForBackend = async (port: number, timeoutMs = 30000) => {
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY

  while (Date.now() < deadline) {
    // Only treat the backend as ready after /api/ping succeeds. `server.listener`
    // is assigned when listen() is called, which can be before the port is bound
    // and before config.port is written — racing that left the UI on a stale port.
    const currentPort = serverConfig.port || port

    try {
      const response = await fetch(`http://127.0.0.1:${currentPort}/api/ping`)
      if (response.ok) return
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.warn(`Backend not ready on port ${serverConfig.port || port} after ${timeoutMs}ms; loading renderer anyway`)
}

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

const appTray = createAppTrayController({
  isWindows,
  getMainWindow: () => win,
  showMainWindow: () => showMainWindow(),
  quitApp: () => quitApp(),
  setIsQuitting: (value) => { isQuitting = value },
  getAppRoot: () => path.join(__dirname),
})
appTray.registerIpc()


const getRendererUrl = (search = '') => {
  const port = useViteDevServer
    ? Number(process.env.VITE_DEV_SERVER_PORT || 3000)
    : serverConfig.port
  const suffix = search
    ? (search.startsWith('?') ? search : `?${search}`)
    : ''
  return `http://localhost:${port}/${suffix}`
}

const getLoadingPageUrl = () => {
  if (useViteDevServer) {
    return `file://${path.join(__dirname, 'public/loading.html')}`
  }
  return `file://${path.join(__dirname, 'dist/loading.html')}`
}

const bindZoomChangedListener = (browserWindow: BrowserWindowInstance) => {
  if (!browserWindow || browserWindow.isDestroyed()) return

  const {webContents} = browserWindow

  webContents.on('before-input-event', (event: Electron.Event, input: Electron.Input) => {
    if (
      input.type === 'gesturePinchBegin'
      || input.type === 'gesturePinchUpdate'
      || input.type === 'gesturePinchEnd'
    ) {
      event.preventDefault()
    }
  })

  try {
    webContents.setVisualZoomLevelLimits(1, 1)
  } catch {}

  webContents.on('zoom-changed', () => {
    if (suppressZoomChangedEvent) return
    browserWindow.webContents.send('zoom-changed', browserWindow.webContents.getZoomFactor())
  })
}

const setWebContentsZoomFactor = (webContents: WebContents, factor: unknown) => {
  if (!webContents || webContents.isDestroyed()) return 1

  const clamped = Math.min(3, Math.max(0.5, Number(factor) || 1))
  suppressZoomChangedEvent = true
  webContents.setZoomFactor(clamped)
  suppressZoomChangedEvent = false
  return clamped
}

const sendConfigToWindow = (browserWindow: BrowserWindowInstance) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  browserWindow.webContents.send('config', server.config)
}

const bindRendererLoadRetry = (
  webContents: WebContents,
  getUrl: () => string,
) => {
  webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || useViteDevServer || webContents.isDestroyed()) return

    void (async () => {
      await waitForBackend(serverConfig.port, 10000)
      if (webContents.isDestroyed()) return
      await webContents.loadURL(getUrl())
    })()
  })
}


const loadingWindow = createLoadingWindowController({
  getMainWindow: () => win,
  getLoadingPageUrl,
  getAppRoot: () => path.join(__dirname),
  onReadyLog: () => { devLog('App ready') },
})

const {
  createLoadingWindow,
  revealMainWindow,
  bindMainWindowLoadedHandler,
} = loadingWindow

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

const createWindow = () => {
  // Allow reveal again when the window is recreated after close (e.g. macOS Dock click).
  loadingWindow.resetRevealState()

  const bounds = readStoredWindowBounds('win', 1280, 720)
  const shouldMaximize = Boolean(serverConfig.win?.maximized)

  win = new BrowserWindow({
    show: false,
    x: bounds.x,
    y: bounds.y,
    height: bounds.height,
    width: bounds.width,
    frame: !useWinElectronFrame,
    thickFrame: useWinElectronFrame,
    autoHideMenuBar: useWinElectronFrame,
    titleBarStyle: (os.type() === 'Darwin' && !useWinElectronFrame ? 'hidden' : 'default') as 'hidden' | 'default',
    trafficLightPosition: os.type() === 'Darwin' && !useWinElectronFrame ? {x: 18, y: 15} : undefined,
    backgroundColor: '#333',
    icon: path.join(__dirname, 'dist/icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, './electron/preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  const mainWindow = win!
  if (shouldMaximize) {
    mainWindow.maximize()
  }
  bindWindowBoundsPersistence('win', mainWindow)
  bindRendererLoadRetry(mainWindow.webContents, () => getRendererUrl())
  mainWindow.loadURL(getRendererUrl())
  mainWindow.on('close', (event: Electron.Event) => {
    if (isWindows && appTray.getMinimizeToTray() && !isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    if (process.platform !== 'darwin') app.quit()
    else win = null
  })
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('unmaximize')
  })
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('enter-full-screen')
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('leave-full-screen')
  })
  mainWindow.on('blur', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('focus', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('show', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('hide', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('minimize', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('restore', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  // macOS Spaces / fullscreen apps: window can stay "alive" but be occluded on another desktop.
  ;(mainWindow as BrowserWindowInstance & {
    on(event: 'occlusion-state-changed', listener: () => void): BrowserWindowInstance
  }).on('occlusion-state-changed', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  bindZoomChangedListener(mainWindow)
  bindMainWindowLoadedHandler(mainWindow)
  mainWindow.webContents.on('did-finish-load', () => {
    sendConfigToWindow(mainWindow)
    if (isDevelopment) {
      // mainWindow.webContents.openDevTools();
    }
  })
}

ipcMain.handle('get-config', () => server.config)

ipcMain.handle('get-machine-id', async () => machineId())

registerWindowChromeIpc({
  getMainWindow: () => win,
  getPlayerWindow: () => playerWindow.getWindow(),
  focusMainWindow: () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  },
  setWebContentsZoomFactor,
})
registerShellIpc({ log: devLog })
registerMediaDragIpc()

app.on('second-instance', () => {
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

  initAppUpdater({getWindow: () => win})
})

app.on("activate", async () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    await waitForBackend(serverConfig.port, 600000)
    createWindow()
  }
});

function quitApp() {
  isQuitting = true
  appTray.destroyTray()
  playerWindow.destroyPlayerWindow()
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
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  quitApp()
}

ipcMain.on('closeApp', handleCloseAppRequest)

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    void waitForBackend(serverConfig.port, 600000).then(() => createWindow())
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}


app.on('window-all-closed', () => {
  if (process.platform !== "darwin") // close if not macOS
    app.quit();
});

function lockApp() {
  win?.webContents.send('lockApp')
  playerWindow.stopPlayerPlayback()
}

createAppMenuController({
  getMainWindow: () => win,
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
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return
  revealMainWindow()
  playerWindow.schedulePlayerWarmup()
})

ipcMain.on('getItemsFromDb', async (_event: IpcMainEvent, data: unknown) => {
  win?.webContents.send('getItemsFromDb', data)
})
ipcMain.on('updateVideoFrames', async (_event: IpcMainEvent, id: unknown) => {
  win?.webContents.send('updateVideoFrames', id)
})
ipcMain.on('removeEntitiesFromState', async (_event: IpcMainEvent, data: unknown) => {
  win?.webContents.send('removeEntitiesFromState', data)
})
