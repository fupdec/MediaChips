import type {BrowserWindow} from 'electron'

const WM_NCLBUTTONDBLCLK = 0x00a3

/**
 * Windows only. A transparent frameless window loses the system's double-click-on-title-bar
 * behaviour, so toggle maximize ourselves when the draggable title area is double-clicked.
 * Leave it to the system for opaque windows, which would otherwise toggle twice.
 */
export function bindCaptionDoubleClick(win: BrowserWindow, enabled: boolean): void {
  if (process.platform !== 'win32' || !enabled) return
  win.hookWindowMessage(WM_NCLBUTTONDBLCLK, () => {
    // A transparent window reports itself as not maximizable, but maximize() still works.
    if (win.isDestroyed()) return
    console.log('[window] title-bar double-click')
    if (win.isFullScreen()) win.setFullScreen(false)
    else if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
}
