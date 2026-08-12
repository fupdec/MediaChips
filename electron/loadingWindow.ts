import {BrowserWindow, type BrowserWindow as BrowserWindowInstance} from 'electron'
import {resolveWindowIconPath} from './windowIcon'

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
    // Refresh taskbar icon after splash closes (Windows Portable often drops PNG).
    try {
      win.setIcon(resolveWindowIconPath(deps.getAppRoot()))
    } catch {
      // Ignore missing icon in incomplete/dev layouts.
    }
    if (!win.isVisible()) win.show()
    win.focus()
  }

  function bindMainWindowLoadedHandler(mainWindow: BrowserWindowInstance) {
    if (mainRevealFallbackTimer) {
      clearTimeout(mainRevealFallbackTimer)
    }

    mainRevealFallbackTimer = setTimeout(() => {
      console.warn('main-app-ready timeout, revealing main window')
      revealMainWindow()
    }, readyTimeoutMs)

    // Show as soon as Chromium can paint — do not wait for settings/plugins IPC.
    // Bind before loadURL; ready-to-show fires after the first compositor frame.
    mainWindow.once('ready-to-show', () => {
      revealMainWindow()
    })
  }

  function createLoadingWindow() {
    // Show immediately on create so Dock/shortcut click gets a window before
    // loading.html finishes parsing (ready-to-show would add tens–hundreds of ms).
    loading = new BrowserWindow({
      width: 320,
      height: 320,
      show: true,
      frame: false,
      resizable: false,
      alwaysOnTop: false,
      backgroundColor: '#f3f1f8',
      icon: resolveWindowIconPath(deps.getAppRoot()),
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        webSecurity: false,
        contextIsolation: false,
      },
    })

    loading.center()
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
