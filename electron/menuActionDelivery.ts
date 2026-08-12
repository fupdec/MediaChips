import type {BrowserWindow} from 'electron'

export type MenuActionDelivery = {
  send: (action: string) => void
  flush: () => void
}

/**
 * Delivers renderer menu actions even when the main window is missing or still loading.
 * On macOS the Dock menu often fires after the window was closed (win === null); a bare
 * webContents.send would silently no-op.
 */
export function createMenuActionDelivery(deps: {
  getMainWindow: () => BrowserWindow | null
  showMainWindow?: () => void
}): MenuActionDelivery {
  let pending: string | null = null
  let loadHooked = false

  function deliver(action: string, win: BrowserWindow) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('menuAction', action)
  }

  function hookLoad(win: BrowserWindow) {
    if (loadHooked) return
    loadHooked = true
    win.webContents.once('did-finish-load', () => {
      loadHooked = false
      flush()
    })
  }

  function flush() {
    const action = pending
    const win = deps.getMainWindow()
    if (!action || !win || win.isDestroyed()) return
    if (win.webContents.isLoadingMainFrame()) {
      hookLoad(win)
      return
    }
    pending = null
    deliver(action, win)
  }

  function send(action: string) {
    const normalized = String(action || '').trim()
    if (!normalized) return

    pending = normalized
    const win = deps.getMainWindow()
    if (!win || win.isDestroyed()) {
      deps.showMainWindow?.()
      return
    }

    if (win.webContents.isLoadingMainFrame()) {
      hookLoad(win)
      return
    }

    pending = null
    deliver(normalized, win)
  }

  return {send, flush}
}
