import {app, BrowserWindow, type BrowserWindowConstructorOptions} from 'electron'

/**
 * Windows native player: the player window is two windows.
 *
 *  - the FRAME is an ordinary, opaque, system-decorated window (title bar, resize border, Snap,
 *    shadow, double-click to maximize all come from Windows). libmpv draws into a child window of it.
 *  - the OVERLAY is the real player BrowserWindow: frameless and transparent, owned by the frame
 *    (so it always stays above it and above the video) and kept exactly over the frame's client
 *    area. All the HTML player UI lives there.
 */
const frames = new WeakMap<BrowserWindow, PlayerFrame>()

export interface PlayerFrame {
  window: BrowserWindow
  /** Set before destroying the window or quitting; otherwise the close button only hides it. */
  allowClose: boolean
  /** The native addon keeps the overlay over the frame itself (set while a video view exists). */
  nativeSync?: boolean
}

export function getPlayerFrame(overlay: BrowserWindow | null | undefined): PlayerFrame | null {
  return overlay ? frames.get(overlay) ?? null : null
}

/** The window a title-bar action (minimize, maximize...) should act on. */
export function resolveChromeWindow(win: BrowserWindow | null | undefined): BrowserWindow | null {
  if (!win) return null
  return getPlayerFrame(win)?.window ?? win
}

export function createPlayerFrame(options: BrowserWindowConstructorOptions): PlayerFrame {
  const window = new BrowserWindow({
    ...options,
    frame: true,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
  })
  window.setMenu(null)
  const frame: PlayerFrame = {window, allowClose: false}
  app.on('before-quit', () => { frame.allowClose = true })
  return frame
}

export function overlayWindowOptions(frame: PlayerFrame): BrowserWindowConstructorOptions {
  return {
    parent: frame.window,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#00000000',
  }
}

/** Keep the overlay over the frame's client area and tie their lifecycles together. */
export function bindPlayerFrame(overlay: BrowserWindow, frame: PlayerFrame, onUserClose: () => void): void {
  frames.set(overlay, frame)
  const win = frame.window
  overlay.setResizable(true)
  overlay.setMinimumSize(0, 0)
  // The overlay stays resizable so it can follow the frame, but the user must never resize it on its
  // own (its edge lies inside the frame's client area): that stretches the UI and leaves the video.
  // While a video plays the native addon turns a press on that border into a frame resize; this covers the rest.
  overlay.on('will-resize', (event) => event.preventDefault())

  const sync = () => {
    if (win.isDestroyed() || overlay.isDestroyed() || win.isMinimized()) return
    // While the overlay is fullscreen on its own (HTML fullscreen) Electron owns its bounds.
    if (overlay.isFullScreen() || frame.nativeSync) return
    const bounds = win.getContentBounds()
    const current = overlay.getBounds()
    if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
      overlay.setBounds(bounds)
      const applied = overlay.getBounds()
      if (applied.width !== bounds.width || applied.height !== bounds.height) {
        // The overlay refused the size (a size constraint, or a non-resizable window): force it.
        console.warn(`[frame] overlay ${applied.width}x${applied.height} != frame client ${bounds.width}x${bounds.height}, retrying`)
        overlay.setResizable(true)
        overlay.setMinimumSize(0, 0)
        overlay.setMaximumSize(0, 0)
        overlay.setBounds(bounds)
        const retry = overlay.getBounds()
        console.warn(`[frame] after retry ${retry.width}x${retry.height}`)
      }
    }
  }
  const syncAndFocus = () => {
    sync()
    if (win.isFocused() && !overlay.isDestroyed()) overlay.focus()
  }

  for (const name of ['move', 'resize', 'enter-full-screen', 'leave-full-screen'] as const) {
    win.on(name as 'move', sync)
  }
  for (const name of ['maximize', 'unmaximize', 'restore', 'show'] as const) {
    win.on(name as 'show', syncAndFocus)
  }

  // The overlay is hidden natively while an edge is dragged; give it the keyboard back afterwards.
  win.on('resized', () => { if (!overlay.isDestroyed() && win.isFocused()) overlay.focus() })

  win.on('close', (event) => {
    if (frame.allowClose) return
    event.preventDefault()
    onUserClose()
  })

  // HTML fullscreen (the player's fullscreen button) must not put the transparent overlay into
  // fullscreen on its own: that would fight the frame. The overlay's web preferences disable the
  // window resize, so the page only enters its fullscreen layout and we fullscreen the frame instead
  // (the overlay then follows the frame's client area like in any other resize).
  overlay.webContents.on('enter-html-full-screen', () => {
    if (!win.isDestroyed() && !win.isFullScreen()) win.setFullScreen(true)
  })
  overlay.webContents.on('leave-html-full-screen', () => {
    if (!win.isDestroyed() && win.isFullScreen()) win.setFullScreen(false)
  })
  win.on('enter-full-screen', () => setTimeout(() => { if (!overlay.isDestroyed()) overlay.moveTop() }, 50))

  overlay.on('page-title-updated', (_event, title) => {
    if (!win.isDestroyed()) win.setTitle(title)
  })

  overlay.on('closed', () => {
    frame.allowClose = true
    if (!win.isDestroyed()) win.destroy()
  })
}
