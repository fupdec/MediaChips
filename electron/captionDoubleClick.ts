import type {BrowserWindow} from 'electron'

const WM_NCLBUTTONDOWN = 0x00a1
const WM_NCLBUTTONDBLCLK = 0x00a3
const HTCAPTION = 2
const DOUBLE_CLICK_MS = 500
const DOUBLE_CLICK_PX = 6

/**
 * Windows only. A transparent frameless window loses the system's double-click-on-title-bar
 * behaviour, so toggle maximize ourselves when the draggable title area is double-clicked.
 * The system message is used when it arrives; otherwise two caption clicks in a row count.
 * Leave it to the system for opaque windows, which would otherwise toggle twice.
 */
export function bindCaptionDoubleClick(win: BrowserWindow, enabled: boolean): void {
  if (process.platform !== 'win32' || !enabled) return
  let lastToggle = 0
  let lastDown: {at: number; x: number; y: number} | null = null

  const toggle = (source: string) => {
    const now = Date.now()
    if (win.isDestroyed() || now - lastToggle < 300) return
    lastToggle = now
    console.log(`[window] title-bar double-click (${source}), maximized=${win.isMaximized()}`)
    if (win.isFullScreen()) win.setFullScreen(false)
    else if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }

  win.hookWindowMessage(WM_NCLBUTTONDBLCLK, () => toggle('WM_NCLBUTTONDBLCLK'))
  win.hookWindowMessage(WM_NCLBUTTONDOWN, (wParam, lParam) => {
    if (wParam.readUInt32LE(0) !== HTCAPTION) return
    const value = lParam.readUInt32LE(0)
    const x = value << 16 >> 16
    const y = value >> 16
    const now = Date.now()
    const previous = lastDown
    lastDown = {at: now, x, y}
    if (previous && now - previous.at <= DOUBLE_CLICK_MS
      && Math.abs(x - previous.x) <= DOUBLE_CLICK_PX && Math.abs(y - previous.y) <= DOUBLE_CLICK_PX) {
      lastDown = null
      toggle('two caption clicks')
    }
  })
}
