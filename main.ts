import type { BrowserWindow as BrowserWindowInstance, WebContents, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
  shell,
} from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { machineId } from 'node-machine-id'

import { apiErrorMessage } from './api/types/errors'
import { initAppUpdater } from './electron/autoUpdater'
import { normalizeMediaPath } from './api/utils/normalizeUserPath'
import { resolveExistingPath } from './api/services/contentHash'

type ServerWindowConfig = {
  win?: { height?: number; width?: number }
  player?: { height?: number; width?: number }
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

const serverModule = require('./app/server.js') as AppServerExports & { default?: AppServerExports }
const server = (serverModule.default ?? serverModule) as AppServerExports
const serverConfig = server.config

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.warn('MediaChips is already running. Exiting second instance.')
  process.exit(0)
}

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
let loading: BrowserWindowInstance | null = null
let player: BrowserWindowInstance | null = null
let tray: Electron.Tray | null = null
// When enabled (Windows only), closing the main window hides it to the system
// tray instead of quitting. Persisted in config.json (`minimizeToTray`); the
// renderer notifies the main process of runtime changes via `set-minimize-to-tray`.
let minimizeToTray = false
// Distinguishes an explicit quit (tray menu / File → Exit) from a window close
// that should be intercepted and turned into "hide to tray".
let isQuitting = false
let suppressPlayerWarmup = false
let suppressZoomChangedEvent = false
// Packaged Electron builds do not set NODE_ENV=production; rely on app.isPackaged.
const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production'
const devLog = (...args: unknown[]) => {
  if (isDevelopment) console.log(...args)
}
// Vite is opt-in so `npx electron .` serves the built UI from the embedded backend.
const useViteDevServer = isDevelopment && process.env.MEDIA_CHIPS_VITE_DEV === '1'

const waitForBackend = async (port: number, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (server.listener) return

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`)
      if (response.ok) return
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.warn(`Backend not ready on port ${port} after ${timeoutMs}ms; loading renderer anyway`)
}

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

const createWindow = () => {
  win = new BrowserWindow({
    show: false,
    height: serverConfig.win?.height || 720,
    width: serverConfig.win?.width || 1280,
    frame: !useWinElectronFrame,
    thickFrame: useWinElectronFrame,
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
  bindRendererLoadRetry(mainWindow.webContents, () => getRendererUrl())
  mainWindow.loadURL(getRendererUrl())
  mainWindow.on('close', (event: Electron.Event) => {
    if (isWindows && minimizeToTray && !isQuitting) {
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
    mainWindow.webContents.send('blur')
  })
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('focus')
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

ipcMain.handle('setZoomFactor', (event: IpcMainInvokeEvent, factor: unknown) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow || browserWindow.isDestroyed()) return 1
  return setWebContentsZoomFactor(browserWindow.webContents, factor)
})

ipcMain.handle('getZoomFactor', (event: IpcMainInvokeEvent) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow || browserWindow.isDestroyed()) return 1
  return browserWindow.webContents.getZoomFactor()
})

ipcMain.handle('checkFileExists', async (_event: IpcMainInvokeEvent, data: Record<string, unknown>) => {
  const rawPath = typeof data === 'string' ? data : data?.path
  if (!rawPath) return false

  try {
    const filePath = normalizeMediaPath(rawPath)
    return Boolean(await resolveExistingPath(filePath))
  } catch {
    return false
  }
})

ipcMain.handle('openPath', async (_event: IpcMainInvokeEvent, data: Record<string, unknown> | string) => {
  const rawPath = typeof data === 'string' ? data : data?.path
  if (rawPath == null || rawPath === '') return {error: 'Path is required'}

  let entryPath = path.normalize(String(rawPath))
  if (typeof data === 'object' && data !== null && data.isDir) {
    entryPath = path.dirname(entryPath)
  }

  const error = await shell.openPath(entryPath)
  return error ? {error} : {success: true}
})

ipcMain.handle('dialog:saveFile', async (_event: IpcMainInvokeEvent, options: { defaultPath?: string; content?: string; filters?: Array<{ name: string; extensions: string[] }> } = {}) => {
  const result = await dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{name: 'All Files', extensions: ['*']}],
  })

  if (result.canceled || !result.filePath) {
    return {canceled: true}
  }

  fs.writeFileSync(result.filePath, options.content ?? '', 'utf8')
  return {canceled: false, filePath: result.filePath}
})

ipcMain.handle('toggleDevTools', () => {
  if (win && !win.isDestroyed()) {
    win.webContents.toggleDevTools()
  }
})

// Keep splash visible until the renderer reports the UI shell is painted.
const MAIN_APP_READY_TIMEOUT_MS = 60_000

let isMainWindowRevealed = false
let mainRevealFallbackTimer: ReturnType<typeof setTimeout> | null = null

function hideLoadingWindow(): void {
  if (loading && !loading.isDestroyed()) {
    loading.hide()
    loading.close()
    loading = null
  }
}

function revealMainWindow(): void {
  if (!win || win.isDestroyed() || isMainWindowRevealed) return

  isMainWindowRevealed = true

  if (mainRevealFallbackTimer) {
    clearTimeout(mainRevealFallbackTimer)
    mainRevealFallbackTimer = null
  }

  devLog('App ready')
  hideLoadingWindow()
  win.show()
}

const bindMainWindowLoadedHandler = (mainWindow: BrowserWindowInstance) => {
  if (mainRevealFallbackTimer) {
    clearTimeout(mainRevealFallbackTimer)
  }

  mainRevealFallbackTimer = setTimeout(() => {
    console.warn('main-app-ready timeout, revealing main window')
    revealMainWindow()
  }, MAIN_APP_READY_TIMEOUT_MS)

  if (!mainWindow.webContents.isLoading()) {
    return
  }

  mainWindow.webContents.once('did-finish-load', () => {
    // Window reveal is deferred until renderer sends main-app-ready.
  })
}

const createLoadingWindow = () => {
  loading = new BrowserWindow({
    width: 320,
    height: 320,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#333',
    icon: __dirname + `/icons/icon.png`,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      webSecurity: false,
      contextIsolation: false
    },
  })
  const loadingWindow = loading!

  loadingWindow.once('ready-to-show', () => {
    loadingWindow.show()
  })

  loadingWindow.loadURL(getLoadingPageUrl())
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

app.on('ready', async () => {
  createLoadingWindow()

  if (!useViteDevServer) {
    await waitForBackend(serverConfig.port)
  }

  createWindow()

  // config.json is the source of truth for the tray preference. Initialize the
  // in-memory flag and create the tray icon before the renderer has loaded.
  minimizeToTray = isWindows && serverConfig.minimizeToTray === '1'
  if (minimizeToTray) createTray()

  initAppUpdater({getWindow: () => win})
})

app.on("activate", async () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    if (!useViteDevServer) {
      await waitForBackend(serverConfig.port)
    }
    createWindow()
  }
});

function quitApp() {
  isQuitting = true
  destroyTray()
  if (playerWarmupTimer) {
    clearTimeout(playerWarmupTimer)
    playerWarmupTimer = null
  }
  if (player && !player.isDestroyed()) {
    player.destroy()
    player = null
  }
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
  if (isWindows && minimizeToTray && !isQuitting) {
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  quitApp()
}

ipcMain.on('closeApp', handleCloseAppRequest)

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    if (!useViteDevServer) {
      void waitForBackend(serverConfig.port).then(() => createWindow())
    } else {
      createWindow()
    }
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray() {
  if (tray || !isWindows) return

  try {
    // Prefer the multi-size .ico (16/32/48) so Windows can pick the crispest
    // variant for the current DPI; fall back to the PNG if it is missing.
    const iconDir = path.join(__dirname, 'dist/icons')
    const icoPath = path.join(iconDir, 'favicon.ico')
    const pngPath = path.join(iconDir, 'icon.png')
    const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath
    const image = nativeImage.createFromPath(iconPath)
    tray = new Tray(image.isEmpty() ? iconPath : image)
    tray.setToolTip('MediaChips')
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: 'Open MediaChips', click: () => showMainWindow()},
      {type: 'separator'},
      {label: 'Exit', click: () => { isQuitting = true; quitApp() }},
    ]))
    tray.on('click', () => {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.hide()
      } else {
        showMainWindow()
      }
    })
    tray.on('double-click', () => showMainWindow())
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

ipcMain.handle('set-minimize-to-tray', (_event: IpcMainInvokeEvent, enabled: unknown) => {
  minimizeToTray = Boolean(enabled)

  if (!isWindows) return minimizeToTray

  if (minimizeToTray) {
    createTray()
  } else {
    destroyTray()
    // Without a tray icon a hidden window would be unreachable, so restore it.
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show()
    }
  }

  return minimizeToTray
})

app.on('window-all-closed', () => {
  if (process.platform !== "darwin") // close if not macOS
    app.quit();
});

function stopPlayerPlayback() {
  if (player && !player.isDestroyed()) {
    player.webContents.send('stop-playing-video')
  }
}

ipcMain.handle('closePlayer', () => {
  stopPlayerPlayback()
  if (player && !player.isDestroyed()) {
    player.hide()
  }
})

ipcMain.handle('maximize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.maximize()
  } else {
    win?.maximize()
  }
})
ipcMain.handle('unmaximize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.unmaximize()
  } else {
    win?.unmaximize()
  }
})
ipcMain.handle('minimize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.minimize()
  } else {
    win?.minimize()
  }
})
ipcMain.handle('relaunch', () => {
  app.relaunch()
  app.exit()
})

ipcMain.handle('toggleMainFullscreen', () => {
  if (!win || win.isDestroyed()) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})

ipcMain.handle('findInPage', async (_event: IpcMainInvokeEvent, payload: unknown) => {
  const options = payload as { text?: string; forward?: boolean; findNext?: boolean }
  const query = String(options?.text || '').trim()
  if (!query || !win || win.isDestroyed()) {
    return {matches: 0, activeMatchOrdinal: 0}
  }

  return new Promise((resolve) => {
    const requestId = win!.webContents.findInPage(query, {
      forward: options?.forward !== false,
      findNext: Boolean(options?.findNext),
    })

    const onFound = (_event: Electron.Event, result: Electron.FoundInPageResult) => {
      if (result.requestId !== requestId) return
      win?.webContents.removeListener('found-in-page', onFound)
      resolve(result)
    }

    win!.webContents.on('found-in-page', onFound)
  })
})

ipcMain.handle('stopFindInPage', () => {
  win?.webContents.stopFindInPage('clearSelection')
})

function sendMenuAction(action: string) {
  win?.webContents.send('menuAction', action)
}

function menuActionItem(label: string, action: string, accelerator?: string) {
  return {
    label,
    ...(accelerator ? {accelerator} : {}),
    click() {
      sendMenuAction(action)
    },
  }
}

const isMac = process.platform === 'darwin'

const fileMenu = {
  label: 'File',
  submenu: [
    menuActionItem('Add Media', 'addMedia'),
    {type: 'separator' as const},
    menuActionItem('Import Backup...', 'importBackup'),
    menuActionItem('Export Backup...', 'exportBackup'),
    {type: 'separator' as const},
    menuActionItem('Open Data Folder', 'openDataFolder'),
    {type: 'separator' as const},
    {role: 'close' as const},
  ],
}

const editMenu = {
  label: 'Edit',
  submenu: [
    {
      label: 'Undo',
      accelerator: 'CommandOrControl+Z',
      role: 'undo' as const,
    },
    {
      label: 'Redo',
      accelerator: 'CommandOrControl+Y',
      role: 'redo' as const,
    },
    {type: 'separator' as const},
    {
      label: 'Cut',
      accelerator: 'CommandOrControl+X',
      role: 'cut' as const,
    },
    {
      label: 'Copy',
      accelerator: 'CommandOrControl+C',
      role: 'copy' as const,
    },
    {
      label: 'Paste',
      accelerator: 'CommandOrControl+V',
      role: 'paste' as const,
    },
    {type: 'separator' as const},
    {
      label: 'Select all',
      accelerator: 'CommandOrControl+A',
      role: 'selectAll' as const,
    },
    menuActionItem('Find', 'find', 'CommandOrControl+F'),
  ],
}

const viewMenu = {
  label: 'View',
  submenu: [
    menuActionItem('Global Search', 'globalSearch'),
    menuActionItem('Toggle Theme', 'toggleTheme'),
    {type: 'separator' as const},
    {role: 'zoomIn' as const},
    {role: 'zoomOut' as const},
    {role: 'resetZoom' as const},
    {type: 'separator' as const},
    {role: 'togglefullscreen' as const},
  ],
}

const appMenu = {
  label: 'App',
  submenu: [
    menuActionItem('Settings', 'settings', 'CommandOrControl+,'),
    {
      label: 'Lock',
      id: 'lock',
      enabled: true,
      click() {
        lockApp()
      },
    },
    {type: 'separator' as const},
    menuActionItem('Restart', 'restart'),
    ...(!isMac ? [{
      label: 'Exit',
      accelerator: 'CommandOrControl+Q',
      click() {
        app.exit()
      },
    }] : []),
  ],
}

const windowMenu = {
  label: 'Window',
  submenu: [
    {role: 'minimize' as const},
    {role: 'zoom' as const},
    {type: 'separator' as const},
    {role: 'front' as const},
  ],
}

const helpMenu = {
  label: 'Help',
  submenu: [
    menuActionItem('Documentation', 'documentation'),
    menuActionItem('Send Feedback', 'sendFeedback'),
    menuActionItem('Keyboard Shortcuts', 'keyboardShortcuts'),
    {type: 'separator' as const},
    menuActionItem('Check for Updates', 'checkUpdates'),
    menuActionItem('Version History', 'versionHistory'),
    menuActionItem('Website', 'website'),
    {type: 'separator' as const},
    {
      label: 'Toggle Developer Tools',
      accelerator: 'CommandOrControl+Shift+I',
      role: 'toggleDevTools' as const,
    },
    {type: 'separator' as const},
    menuActionItem('About', 'about'),
  ],
}

const systemMenu = Menu.buildFromTemplate([
  ...(isMac ? [{
    label: app.name,
    submenu: [
      {role: 'services' as const},
      {type: 'separator' as const},
      {role: 'hide' as const},
      {role: 'hideOthers' as const},
      {role: 'unhide' as const},
      {type: 'separator' as const},
      {role: 'quit' as const},
    ],
  }] : []),
  ...(isMac
    ? [fileMenu, editMenu, viewMenu, appMenu, windowMenu, helpMenu]
    : [appMenu, fileMenu, viewMenu, helpMenu]),
])

Menu.setApplicationMenu(systemMenu)

function lockApp() {
  win?.webContents.send('lockApp')
  player?.webContents.send('stop-playing-video')
}

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    dialog.showErrorBox('Startup Error',
      `Port 12321 is already in use.\n\n` +
      `Please close other applications using this port and restart the application.`
    );
    app.quit();
  } else {
    console.error('Uncaught Exception:', error);
  }
});

// folder selection dialog and getting their paths
ipcMain.handle('showOpenDialog', async (_event: IpcMainInvokeEvent, properties: unknown) => {
  devLog('showOpenDialog called with properties:', properties);

  // Check that properties is an array
  let dialogProperties = [];

  if (Array.isArray(properties)) {
    dialogProperties = properties;
  } else {
    console.warn('Properties should be an array, received:', typeof properties);
    // Attempt to convert
    if (typeof properties === 'string') {
      dialogProperties = [properties];
    } else if (typeof properties === 'object' && properties !== null) {
      dialogProperties = Object.keys(properties).filter(key => (properties as Record<string, unknown>)[key] === true);
    }
  }

  devLog('Dialog properties being used:', dialogProperties);

  try {
    const result = await dialog.showOpenDialog({
      properties: dialogProperties,
    });

    devLog('Dialog closed, result:', {
      canceled: result.canceled,
      filePaths: result.filePaths,
      filePathsLength: result.filePaths.length
    });

    if (result.canceled) {
      return { canceled: true, filePaths: [] };
    }

    return {
      canceled: false,
      filePaths: result.filePaths,
      message: 'Directories selected successfully'
    };

  } catch (error: unknown) {
    console.error('Error in showOpenDialog:', error);
    return {
      error: true,
      message: error instanceof Error ? apiErrorMessage(error) : String(error),
      filePaths: []
    };
  }
});

// player window
let pendingPlayerPayload: unknown = null
let isPlayerRendererReady = false
let playerWarmupTimer: ReturnType<typeof setTimeout> | null = null

function getPlayerWindowOptions() {
  return {
    frame: false,
    thickFrame: isWindows,
    show: false,
    height: serverConfig.player?.height || 720,
    width: serverConfig.player?.width || 1280,
    titleBarStyle: 'hidden' as const,
    trafficLightPosition: os.type() === 'Darwin' ? {x: 12, y: 8} : undefined,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'dist/icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, './electron/preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  }
}

function setupPlayerWindowEvents(browserWindow: BrowserWindowInstance) {
  browserWindow.on('maximize', () => {
    browserWindow.webContents.send('maximize')
  })

  browserWindow.on('unmaximize', () => {
    browserWindow.webContents.send('unmaximize')
  })

  browserWindow.on('close', () => {
    stopPlayerPlayback()
  })

  browserWindow.on('closed', () => {
    player = null
    isPlayerRendererReady = false
    pendingPlayerPayload = null
    if (suppressPlayerWarmup) {
      suppressPlayerWarmup = false
      return
    }
    schedulePlayerWarmup()
  })

  browserWindow.on('enter-full-screen', () => {
    browserWindow.webContents.send('enter-full-screen')
  })

  browserWindow.on('leave-full-screen', () => {
    browserWindow.webContents.send('leave-full-screen')
  })

  browserWindow.webContents.on('did-finish-load', () => {
    sendConfigToWindow(browserWindow)
  })

  bindZoomChangedListener(browserWindow)
}

function createPlayerWindow() {
  if (player && !player.isDestroyed()) return player

  isPlayerRendererReady = false
  player = new BrowserWindow(getPlayerWindowOptions() as Electron.BrowserWindowConstructorOptions)
  const playerWindow = player!
  setupPlayerWindowEvents(playerWindow)
  bindRendererLoadRetry(playerWindow.webContents, () => getRendererUrl('?player=true'))
  playerWindow.loadURL(getRendererUrl('?player=true'))
  return playerWindow
}

function deliverPlayerPayload(data: unknown) {
  if (!player || player.isDestroyed()) return

  sendConfigToWindow(player)
  player.webContents.send('play-video', data)
  if (!player.isVisible()) player.show()
  player.focus()
}

function schedulePlayerWarmup() {
  if (playerWarmupTimer || !isMainWindowRevealed) return

  playerWarmupTimer = setTimeout(() => {
    playerWarmupTimer = null
    if (!player || player.isDestroyed()) {
      createPlayerWindow()
    }
  }, 30_000)
}

function destroyPlayerWindow() {
  if (playerWarmupTimer) {
    clearTimeout(playerWarmupTimer)
    playerWarmupTimer = null
  }

  stopPlayerPlayback()

  if (player && !player.isDestroyed()) {
    suppressPlayerWarmup = true
    player.destroy()
  }

  player = null
  isPlayerRendererReady = false
  pendingPlayerPayload = null
}

ipcMain.handle('destroyPlayer', () => {
  destroyPlayerWindow()
})

ipcMain.on('main-app-ready', (event: IpcMainEvent) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return
  revealMainWindow()
  schedulePlayerWarmup()
})

ipcMain.on('player-ready', (event: IpcMainEvent) => {
  if (!player || player.isDestroyed() || event.sender !== player.webContents) return

  isPlayerRendererReady = true

  if (pendingPlayerPayload) {
    deliverPlayerPayload(pendingPlayerPayload)
    pendingPlayerPayload = null
  }
})

ipcMain.on('open-player', async (_event: IpcMainEvent, data: Record<string, unknown>) => {
  if (!player || player.isDestroyed()) {
    pendingPlayerPayload = data
    createPlayerWindow()
    return
  }

  if (isPlayerRendererReady) {
    deliverPlayerPayload(data)
    return
  }

  pendingPlayerPayload = data
  if (!player.isVisible()) player.show()
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
ipcMain.on('stop-playing-video', async () => {
  player?.webContents.send('stop-playing-video')
})
ipcMain.on('setFullScreen', async () => {
  player?.setFullScreen(false)
})