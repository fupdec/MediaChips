import os from 'os'
import path from 'path'
import {
  app,
  BrowserWindow,
  type BrowserWindow as BrowserWindowInstance,
  type BrowserWindowConstructorOptions,
} from 'electron'
import {emitMainWindowUserFacingState} from './windowFocus'
import type {WindowBoundsKind} from './windowBounds'
import {resolveWindowIconPath} from './windowIcon'

export type MainWindowController = {
  getWindow: () => BrowserWindow | null
  createWindow: () => BrowserWindow
  showMainWindow: () => void
}

export function createMainWindowController(deps: {
  isWindows: boolean
  useWinElectronFrame: boolean
  isDevelopment: boolean
  getAppRoot: () => string
  getRendererUrl: (search?: string) => string
  readStoredWindowBounds: (
    kind: WindowBoundsKind,
    fallbackWidth: number,
    fallbackHeight: number,
  ) => {x: number; y: number; width: number; height: number}
  bindWindowBoundsPersistence: (kind: WindowBoundsKind, browserWindow: BrowserWindow) => void
  bindRendererLoadRetry: (webContents: Electron.WebContents, getUrl: () => string) => void
  sendConfigToWindow: (browserWindow: BrowserWindow) => void
  bindZoomChangedListener: (browserWindow: BrowserWindow) => void
  isMaximizedPreferred: () => boolean
  shouldHideOnClose: () => boolean
  resetRevealState: () => void
  bindMainWindowLoadedHandler: (mainWindow: BrowserWindow) => void
  waitForBackend: (port: number, timeoutMs?: number) => Promise<void>
  getBackendPort: () => number
}): MainWindowController {
  let win: BrowserWindow | null = null

  function getMainWindowOptions(): BrowserWindowConstructorOptions {
    const bounds = deps.readStoredWindowBounds('win', 1280, 720)
    const appRoot = deps.getAppRoot()
    const useWinElectronFrame = deps.useWinElectronFrame
    return {
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
      icon: resolveWindowIconPath(appRoot),
      webPreferences: {
        preload: path.join(appRoot, 'electron/preload.js'),
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: false,
      },
    }
  }

  function setupMainWindowEvents(mainWindow: BrowserWindow) {
    deps.bindWindowBoundsPersistence('win', mainWindow)

    mainWindow.on('close', (event: Electron.Event) => {
      if (deps.shouldHideOnClose()) {
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

    const emitFacing = () => emitMainWindowUserFacingState(mainWindow)
    mainWindow.on('blur', emitFacing)
    mainWindow.on('focus', emitFacing)
    mainWindow.on('show', emitFacing)
    mainWindow.on('hide', emitFacing)
    mainWindow.on('minimize', emitFacing)
    mainWindow.on('restore', emitFacing)
    // macOS Spaces / fullscreen apps: window can stay "alive" but be occluded on another desktop.
    ;(mainWindow as BrowserWindowInstance & {
      on(event: 'occlusion-state-changed', listener: () => void): BrowserWindowInstance
    }).on('occlusion-state-changed', emitFacing)

    deps.bindZoomChangedListener(mainWindow)
    deps.bindMainWindowLoadedHandler(mainWindow)
    mainWindow.webContents.on('did-finish-load', () => {
      deps.sendConfigToWindow(mainWindow)
      if (deps.isDevelopment) {
        // mainWindow.webContents.openDevTools();
      }
    })
  }

  function createWindow() {
    // Allow reveal again when the window is recreated after close (e.g. macOS Dock click).
    deps.resetRevealState()

    win = new BrowserWindow(getMainWindowOptions())
    if (deps.isMaximizedPreferred()) {
      win.maximize()
    }
    setupMainWindowEvents(win)
    deps.bindRendererLoadRetry(win.webContents, () => deps.getRendererUrl())
    win.loadURL(deps.getRendererUrl())
    return win
  }

  function showMainWindow() {
    if (!win || win.isDestroyed()) {
      void deps.waitForBackend(deps.getBackendPort(), 600000).then(() => createWindow())
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  return {
    getWindow: () => win,
    createWindow,
    showMainWindow,
  }
}
