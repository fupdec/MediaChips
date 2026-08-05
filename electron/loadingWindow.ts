import path from 'path'
import {BrowserWindow, type BrowserWindow as BrowserWindowInstance} from 'electron'

export type LoadingWindowController = {
  createLoadingWindow: () => void
  hideLoadingWindow: () => void
  revealMainWindow: () => void
  bindMainWindowLoadedHandler: (mainWindow: BrowserWindowInstance) => void
  resetRevealState: () => void
  isMainWindowRevealed: () => boolean
}

export function createLoadingWindowController(deps: {
  getMainWindow: () => BrowserWindow | null
  getLoadingPageUrl: () => string
  getAppRoot: () => string
  onReadyLog?: () => void
  readyTimeoutMs?: number
}): LoadingWindowController {
  const readyTimeoutMs = deps.readyTimeoutMs ?? 60_000
  let loading: BrowserWindow | null = null
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
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed() || isMainWindowRevealed) return

    isMainWindowRevealed = true

    if (mainRevealFallbackTimer) {
      clearTimeout(mainRevealFallbackTimer)
      mainRevealFallbackTimer = null
    }

    deps.onReadyLog?.()
    hideLoadingWindow()
    win.show()
  }

  function bindMainWindowLoadedHandler(mainWindow: BrowserWindowInstance) {
    if (mainRevealFallbackTimer) {
      clearTimeout(mainRevealFallbackTimer)
    }

    mainRevealFallbackTimer = setTimeout(() => {
      console.warn('main-app-ready timeout, revealing main window')
      revealMainWindow()
    }, readyTimeoutMs)

    if (!mainWindow.webContents.isLoading()) {
      return
    }

    mainWindow.webContents.once('did-finish-load', () => {
      // Window reveal is deferred until renderer sends main-app-ready.
    })
  }

  function createLoadingWindow() {
    loading = new BrowserWindow({
      width: 320,
      height: 320,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: false,
      backgroundColor: '#333',
      icon: path.join(deps.getAppRoot(), 'icons/icon.png'),
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        webSecurity: false,
        contextIsolation: false,
      },
    })

    loading.once('ready-to-show', () => {
      if (loading && !loading.isDestroyed()) loading.show()
    })

    loading.loadURL(deps.getLoadingPageUrl())
  }

  return {
    createLoadingWindow,
    hideLoadingWindow,
    revealMainWindow,
    bindMainWindowLoadedHandler,
    resetRevealState: () => {
      isMainWindowRevealed = false
    },
    isMainWindowRevealed: () => isMainWindowRevealed,
  }
}
