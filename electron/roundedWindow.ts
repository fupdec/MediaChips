import type {BrowserWindow, Rectangle} from 'electron'

/** Rows that approximate a rounded rectangle; setShape only accepts plain rectangles. */
export function roundedShape(width: number, height: number, radius: number): Rectangle[] {
  const r = Math.max(0, Math.min(Math.round(radius), Math.floor(width / 2), Math.floor(height / 2)))
  if (r === 0) return [{x: 0, y: 0, width, height}]
  const rects: Rectangle[] = [{x: 0, y: r, width, height: height - 2 * r}]
  for (let row = 0; row < r; row++) {
    const dy = r - row - 0.5
    const inset = Math.ceil(r - Math.sqrt(r * r - dy * dy))
    rects.push({x: inset, y: row, width: width - 2 * inset, height: 1})
    rects.push({x: inset, y: height - 1 - row, width: width - 2 * inset, height: 1})
  }
  return rects
}

/**
 * Windows only. A transparent window has no system-drawn rounded corners, so cut them with the
 * window shape and drop the shape whenever the window fills the screen.
 */
export function bindRoundedWindow(win: BrowserWindow, enabled: boolean, radius = 10): void {
  if (process.platform !== 'win32' || !enabled) return
  const apply = () => {
    if (win.isDestroyed()) return
    const {width, height} = win.getBounds()
    const square = win.isMaximized() || win.isFullScreen() || win.isMinimized()
    win.setShape(roundedShape(width, height, square ? 0 : radius))
  }
  for (const name of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore', 'show'] as const) {
    win.on(name as 'resize', apply)
  }
  apply()
}
